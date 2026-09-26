/**
 * MicroFarm — agentic assistance: the live eval (agentic-assistance build plan R6.7).
 *
 * Replays every fixture under `test/fixtures/farm-agent/` against the model with
 * the same prompt, tool and context builder the interpret action uses
 * (`_lib/agent-prompt.ts`), runs what comes back through the parser and the
 * resolver against the seed farm, and diffs it against the fixture on what
 * the run means: the exact question list the resolver raised, and the settled
 * variant's lines, step figures and name. Wording differences (a listed name
 * where the fixture carries the chef's words) are shown but do not fail.
 * The closest thing to a training loop the design allows. Never in CI.
 *
 *   pnpm farm:agent-eval                  # every fixture
 *   pnpm farm:agent-eval -- --only carrot # fixtures whose file name contains "carrot"
 *   pnpm farm:agent-eval -- --dry         # build the prompts, call nothing
 *
 * Needs ANTHROPIC_API_KEY (read from the repo's .env / .env.local). Every run is
 * appended to local/farm-agent-eval.jsonl (gitignored) for reading later.
 * Exit codes: 0 every fixture matched; 1 a mismatch or an error.
 */
import { appendFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { SUBMIT_TOOL, SYSTEM_PROMPT, buildUserMessage, contextFor } from '@/server/agent-prompt';
import { parseProposal, resolveProposal } from '@/engine/agent-proposal';
import { menuCropPlans } from '@/data/crop-plans-seed';
import { seedFarm, seedStudies, type AgentFixture } from '../test/fixtures/farm-agent/farm';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, '..');
loadEnv({ path: join(REPO_ROOT, '.env') });
loadEnv({ path: join(REPO_ROOT, '.env.local') });
loadEnv({ path: join(SCRIPT_DIR, '..', '.env.local') });

/** The model constant the action uses (`lib/ai/client.ts` is server-only and cannot be imported here; keep in step with INGESTION_MODEL). */
const MODEL = 'claude-sonnet-4-6';

/** The action fences with `wrapUntrustedBlock`; the eval measures interpretation, so a plain fence of the same shape serves. */
const fence = (label: string, content: string) => `<<<BEGIN_UNTRUSTED:${label}>>>\n${content}\n<<<END_UNTRUSTED:${label}>>>`;

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? (args[onlyIdx + 1] ?? '') : '';

const DIR = join(SCRIPT_DIR, '..', 'test', 'fixtures', 'farm-agent');
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && f.includes(only))
  .sort();
if (files.length === 0) {
  console.error(`No fixture under ${DIR} matches "${only}".`);
  process.exit(1);
}

const studies = seedStudies();
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

async function main(): Promise<number> {
  if (!dry && !process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set; pass --dry to build the prompts without calling the model.');
    return 1;
  }
  const client = dry ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const outDir = join(REPO_ROOT, 'local');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'farm-agent-eval.jsonl');
  let failures = 0;

  for (const file of files) {
    const fx = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as AgentFixture;
    const context = contextFor({ cropPlans: menuCropPlans, sourceCode: fx.sourceCropPlanCode, studies, catalog: [], supplierNames: {}, equipment: [] });
    const userMessage = buildUserMessage({ instruction: fx.instruction, sourceCropPlanCode: fx.sourceCropPlanCode, answers: [], context }, fence);
    console.log(`\n── ${file}\n   ${fx.instruction}`);
    if (dry) {
      console.log(`   prompt ${SYSTEM_PROMPT.length} chars · message ${userMessage.length} chars · ${context.cropPlans.length} crop plans · ${context.sourceStandard?.lines.length ?? 0} steps on the source standard`);
      continue;
    }
    const started = Date.now();
    let toolInput: unknown;
    let usage: unknown = null;
    try {
      const res = await client!.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: [SUBMIT_TOOL],
        tool_choice: { type: 'tool', name: SUBMIT_TOOL.name },
        messages: [{ role: 'user', content: userMessage }],
      });
      usage = res.usage;
      const block = res.content.find((b) => b.type === 'tool_use');
      toolInput = block && block.type === 'tool_use' ? block.input : null;
    } catch (err) {
      console.log(`   API error: ${err instanceof Error ? err.message : String(err)}`);
      failures += 1;
      continue;
    }
    const ms = Date.now() - started;
    const parsed = parseProposal(toolInput);
    const record: Record<string, unknown> = { at: new Date().toISOString(), fixture: file, model: MODEL, ms, usage, toolInput, parseError: parsed.ok ? null : parsed.error };
    let ok = true;
    if (!parsed.ok) {
      console.log(`   parse error: ${parsed.error}`);
      ok = false;
    } else {
      // What the run means, not how it was worded: the model may copy a listed name where the
      // fixture carries the chef's words, and the resolver reads both the same. So the
      // comparison is on the resolved outcome — the variant's lines, its steps' figures, its
      // name and the exact question list — and the raw changes are shown when they differ.
      const outcome = (r: ReturnType<typeof resolveProposal>) =>
        'error' in r
          ? { error: r.error }
          : {
              name: r.variant.name.toLowerCase(),
              lines: r.variant.inputs.map((l) => l.name).sort(),
              steps: r.study.lines.map((l) => ({ task: l.task, laborMinutes: l.laborMinutes, staff: l.staff })),
              questions: r.questions.map((q) => ({ id: q.id, kind: q.kind, waivable: q.waivable })),
              findings: r.findings,
            };
      const recorded = parseProposal(fx.toolInput);
      const settle = { confirmed: new Set(fx.expect.readyWhen?.confirmed ?? []), waived: new Set(fx.expect.readyWhen?.waived ?? []) };
      const liveOpen = resolveProposal({ ...parsed.proposal, sourceCropPlan: parsed.proposal.sourceCropPlan || fx.sourceCropPlanCode }, seedFarm());
      const liveSettled = resolveProposal({ ...parsed.proposal, sourceCropPlan: parsed.proposal.sourceCropPlan || fx.sourceCropPlanCode }, seedFarm(settle));
      const wantSettled = recorded.ok ? resolveProposal({ ...recorded.proposal, sourceCropPlan: recorded.proposal.sourceCropPlan || fx.sourceCropPlanCode }, seedFarm(settle)) : null;
      const questions = 'error' in liveOpen ? [] : liveOpen.questions.map((q) => ({ id: q.id, kind: q.kind, waivable: q.waivable }));
      const questionsMatch = !('error' in liveOpen) && stable(questions) === stable(fx.expect.questions);
      const outcomeMatch = wantSettled !== null && stable(outcome(liveSettled)) === stable(outcome(wantSettled));
      const got = { sourceCropPlan: parsed.proposal.sourceCropPlan, variantName: parsed.proposal.variantName, lineChanges: parsed.proposal.lineChanges, laborChanges: parsed.proposal.laborChanges };
      const want = recorded.ok ? { sourceCropPlan: recorded.proposal.sourceCropPlan, variantName: recorded.proposal.variantName, lineChanges: recorded.proposal.lineChanges, laborChanges: recorded.proposal.laborChanges } : null;
      const wordedAlike = want !== null && stable(got) === stable(want);
      record.questionsMatch = questionsMatch;
      record.outcomeMatch = outcomeMatch;
      record.wordedAlike = wordedAlike;
      record.questions = questions;
      record.facts = parsed.proposal.facts;
      console.log(`   ${ms} ms · questions ${questionsMatch ? 'match' : 'DIFFER'} · outcome ${outcomeMatch ? 'matches' : 'DIFFERS'} · wording ${wordedAlike ? 'identical' : 'differs'}${'error' in liveOpen ? ` · resolver: ${liveOpen.error}` : ''}`);
      if (!questionsMatch) {
        console.log(`   recorded questions: ${fx.expect.questions.map((q) => q.id).join(' | ') || '(none)'}`);
        console.log(`   live questions:     ${questions.map((q) => q.id).join(' | ') || '(none)'}`);
      }
      if (!outcomeMatch) {
        console.log(`   recorded outcome: ${stable(wantSettled ? outcome(wantSettled) : null)}`);
        console.log(`   live outcome:     ${stable(outcome(liveSettled))}`);
      }
      if (!wordedAlike) {
        console.log(`   recorded changes: ${stable(want)}`);
        console.log(`   live changes:     ${stable(got)}`);
      }
      for (const f of parsed.proposal.facts) console.log(`   fact: ${f}`);
      ok = questionsMatch && outcomeMatch;
    }
    appendFileSync(outFile, `${JSON.stringify(record)}\n`, 'utf8');
    if (!ok) failures += 1;
  }
  console.log(`\n${files.length - failures} of ${files.length} fixtures matched.${dry ? ' (dry run: nothing called)' : ` Runs appended to ${outFile}.`}`);
  return failures === 0 ? 0 : 1;
}

main().then((code) => process.exit(code), (err) => {
  console.error(err);
  process.exit(1);
});
