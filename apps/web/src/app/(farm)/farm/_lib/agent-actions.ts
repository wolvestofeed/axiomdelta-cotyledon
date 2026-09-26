'use server';

import { appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { findAdvisoryPhrase } from '@/lib/no-advisory';
import { anthropic, INGESTION_MODEL } from '@/lib/ai/client';
import { recordAiCostEvent } from '@/lib/cogs/record';
import { rateLimit } from '@/lib/rate-limit';
import { wrapUntrustedBlock } from '@/lib/redact';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from './access';
import { listCropPlans } from './crop-plans';
import { listTimeStudies } from './time-studies';
import { listAllCatalog } from './supplier-catalog';
import { listEquipment } from './equipment';
import { leanSuppliersById } from './supplier-links';
import { createCropPlan } from './crop-plan-actions';
import { insertTimeStudy } from './seed-writes';
import { parseProposal, type OpenQuestion, type CropPlanVariantProposal } from '../_engine/agent-proposal';
import { nextCropPlanCode } from '../_engine/crop-plan-library';
import { SUBMIT_TOOL, SYSTEM_PROMPT, buildUserMessage, contextFor } from './agent-prompt';

/**
 * MicroFarm — agentic assistance, the two server actions (agentic-assistance
 * build plan R0). SUPER ADMIN ONLY (decision 6).
 *
 *   interpretCropPlanInstruction — the chef's typed or dictated instruction goes
 *     to the model, fenced as untrusted data, with the library's names and
 *     quantities (never a price, a person or a subscriber — decision 9); the model
 *     returns a typed proposal through forced tool use; nothing in it is a
 *     computed figure. Resolution to a variant happens in the engine on the
 *     client (`resolveProposal`), so a waiver re-resolves without a round trip.
 *   saveCropPlanVariant — writes the resolved variant to the library at status
 *     Developing and its estimated study beside it. The only write here; the
 *     ledger is never touched.
 *
 * Usage rows go to Staffing's `ai_cost_events` with both owner ids null under
 * the `farm-` surface prefix (decision 11); the `ai_surface` rate-limit bucket
 * is applied per user. The prompt, the tool and the context builder live in
 * `agent-prompt.ts` so the live eval script reads the same ones (R6.5, R6.7).
 *
 * Capture (R6.1): with `FARM_AGENT_CAPTURE=1` in the environment, every run
 * appends one JSON line — the instruction, the answers, the raw tool input the
 * model returned and the parsed proposal — to `local/farm-agent-captures.jsonl`
 * (gitignored). A misread becomes a fixture under `test/fixtures/farm-agent/`.
 * The resolved question list is not captured: the resolver is deterministic and
 * the fixture test reproduces it from the tool input.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}

const SURFACE = 'farm-crop-plan-variant';

/** The repo root: the nearest ancestor of the working directory holding `pnpm-workspace.yaml`. */
function repoRoot(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/** R6.1: append one live run to the local capture file when the switch is on. Never throws; never in production. */
async function captureRun(record: Record<string, unknown>): Promise<void> {
  if (process.env.FARM_AGENT_CAPTURE !== '1' || process.env.NODE_ENV === 'production') return;
  try {
    const root = repoRoot();
    if (!root) return;
    await mkdir(join(root, 'local'), { recursive: true });
    await appendFile(join(root, 'local', 'farm-agent-captures.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, 'utf8');
  } catch {
    /* capture is best-effort */
  }
}
const INSTRUCTION_MAX = 10_000;

const InterpretInput = z.object({
  instruction: z.string().max(INSTRUCTION_MAX),
  sourceCropPlanCode: z.string().trim().max(40).default(''),
  /** Answers typed on the review card, keyed by the question they answer. */
  answers: z.array(z.object({ questionId: z.string().max(80), question: z.string().max(400), answer: z.string().max(1000) })).max(40).default([]),
});

export interface InterpretResult {
  proposal: CropPlanVariantProposal;
  /** The questions the model was told it had already asked, so the card can keep their ids stable. */
  askedBefore: OpenQuestion['id'][];
}

/** Interpret the chef's instruction into a typed proposal. The engine resolves it on the client. */
export async function interpretCropPlanInstruction(input: unknown): Promise<Result<InterpretResult>> {
  const parsed = InterpretInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const instruction = parsed.data.instruction.trim();
  if (instruction.length === 0) return { ok: false, error: 'Describe the change first.' };
  const limit = await rateLimit(access.userId, 'ai_surface');
  if (!limit.ok) return { ok: false, error: `Too many interpretations in a row. Try again in ${limit.resetSeconds} seconds.` };

  const [cropPlans, studies, catalog, equipment] = await Promise.all([listCropPlans(), listTimeStudies(), listAllCatalog(), listEquipment()]);
  const supplierNames = Object.fromEntries(Object.entries(leanSuppliersById(Object.keys(catalog))).map(([id, s]) => [id, s.name]));
  const context = contextFor({ cropPlans, sourceCode: parsed.data.sourceCropPlanCode, studies: studies.studies, catalog: Object.values(catalog).flat(), supplierNames, equipment });
  const userMessage = buildUserMessage({ instruction, sourceCropPlanCode: parsed.data.sourceCropPlanCode, answers: parsed.data.answers, context }, wrapUntrustedBlock);

  const started = Date.now();
  let response;
  try {
    response = await anthropic().messages.create({
      model: INGESTION_MODEL,
      max_tokens: 4096,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [SUBMIT_TOOL],
      tool_choice: { type: 'tool', name: SUBMIT_TOOL.name },
      messages: [{ role: 'user', content: userMessage }],
    });
  } catch (err) {
    await recordAiCostEvent({ surface: SURFACE, model: INGESTION_MODEL, usage: null, computeMs: Date.now() - started, outcome: 'api_error' });
    return { ok: false, error: `The instruction could not be interpreted: ${err instanceof Error ? err.message : 'unknown error'}.` };
  }
  const computeMs = Date.now() - started;
  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    await recordAiCostEvent({ surface: SURFACE, model: INGESTION_MODEL, usage: response.usage, computeMs, outcome: 'validation_error' });
    return { ok: false, error: 'The model returned no structured proposal. Try again.' };
  }
  const result = parseProposal(toolUse.input);
  await captureRun({ instruction, sourceCropPlanCode: parsed.data.sourceCropPlanCode, answers: parsed.data.answers, toolInput: toolUse.input, proposal: result.ok ? result.proposal : null, parseError: result.ok ? null : result.error });
  if (!result.ok) {
    await recordAiCostEvent({ surface: SURFACE, model: INGESTION_MODEL, usage: response.usage, computeMs, outcome: 'validation_error' });
    return { ok: false, error: `The proposal could not be read: ${result.error}` };
  }
  for (const s of [...result.proposal.facts, ...result.proposal.openQuestions.map((q) => q.question), result.proposal.variantName]) {
    const hit = findAdvisoryPhrase(s);
    if (hit) {
      await recordAiCostEvent({ surface: SURFACE, model: INGESTION_MODEL, usage: response.usage, computeMs, outcome: 'validation_error' });
      return { ok: false, error: `The proposal contained a forbidden advisory phrase ("${hit}") and was discarded. Try again.` };
    }
  }
  await recordAiCostEvent({ surface: SURFACE, model: INGESTION_MODEL, usage: response.usage, computeMs, outcome: 'success' });
  return { ok: true, proposal: result.proposal, askedBefore: parsed.data.answers.map((a) => a.questionId) };
}

const StudyLine = z.object({
  task: z.string().trim().min(1).max(200),
  station: z.string().trim().max(120).nullable().default(null),
  staff: z.number().int().min(0).max(100),
  elapsedMinutes: z.number().min(0).max(10_000),
  laborMinutes: z.number().min(0).max(100_000),
  scalesWith: z.enum(['fixed', 'variable']),
  stream: z.enum(['sowing', 'harvest']).default('sowing'),
});

const SaveInput = z.object({
  sourceCode: z.string().trim().min(1).max(40),
  /** The variant as `createCropPlan` reads it, minus the code, which is assigned here. */
  cropPlan: z.record(z.string(), z.unknown()),
  study: z.object({
    sowingSize: z.number().int().min(1).max(100_000),
    qualityNotes: z.string().max(2000).nullable().default(null),
    lines: z.array(StudyLine).min(1).max(100),
  }),
});

/** Write the resolved variant to the library at Developing, with its estimated study. */
export async function saveCropPlanVariant(input: unknown): Promise<Result<{ id: string; code: string }>> {
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const library = await listCropPlans();
  if (!library.some((r) => r.code === parsed.data.sourceCode)) return { ok: false, error: `Source crop plan ${parsed.data.sourceCode} is not in the library.` };
  const code = nextCropPlanCode(library.map((r) => r.code));
  const created = await createCropPlan({ ...parsed.data.cropPlan, code, status: 'developing' });
  if (!created.ok) return created;
  const studyId = await insertTimeStudy(
    db,
    created.id,
    { studiedOn: null, sowingSize: parsed.data.study.sowingSize, observer: null, qualityResult: null, qualityNotes: parsed.data.study.qualityNotes, basis: 'estimated', lines: parsed.data.study.lines },
    'user_built',
    access.email ?? access.userId,
  );
  if (!studyId) return { ok: false, error: `Crop plan ${code} was saved, but its estimated study was not. Record one on Time Studies.` };
  revalidatePath('/farm', 'layout');
  return { ok: true, id: created.id, code };
}
