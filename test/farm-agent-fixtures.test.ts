/**
 * MicroFarm — agentic assistance: recorded runs through the parser and the
 * resolver end to end (agentic-assistance build plan R6.6). Each fixture under
 * `test/fixtures/farm-agent/` is one instruction with the tool input the model
 * returned for it; the test asserts the exact question list the resolver
 * raises against the seed farm, so a regression in either layer is caught.
 * The live eval (`pnpm farm:agent-eval`) replays the same fixtures against the
 * model and diffs what it returns today against what is recorded here.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseProposal, resolveProposal } from '@/engine/agent-proposal';
import { seedFarm, type AgentFixture } from './fixtures/farm-agent/farm';

const DIR = join(__dirname, 'fixtures', 'farm-agent');
const fixtures: AgentFixture[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as AgentFixture);

describe('agent fixtures — parse + resolve end to end', () => {
  expect(fixtures.length).toBeGreaterThan(0);
  for (const fx of fixtures) {
    describe(fx.name, () => {
      const parsed = parseProposal(fx.toolInput);
      it('parses', () => {
        expect(parsed.ok).toBe(true);
      });
      if (!parsed.ok) return;
      const proposal = { ...parsed.proposal, sourceCropPlan: parsed.proposal.sourceCropPlan || fx.sourceCropPlanCode };
      const first = resolveProposal(proposal, seedFarm());
      it('asks exactly the recorded questions', () => {
        expect('error' in first).toBe(false);
        if ('error' in first) return;
        expect(first.questions.map((q) => ({ id: q.id, kind: q.kind, waivable: q.waivable }))).toEqual(fx.expect.questions);
        expect(first.findings).toEqual([]);
      });
      const settled = resolveProposal(proposal, seedFarm({ confirmed: new Set(fx.expect.readyWhen?.confirmed ?? []), waived: new Set(fx.expect.readyWhen?.waived ?? []) }));
      it('is ready once the recorded confirmations and waivers are given', () => {
        expect('error' in settled).toBe(false);
        if ('error' in settled) return;
        if (fx.expect.readyWhen) expect(settled.ready).toBe(true);
      });
      it('carries the recorded lines, steps and name', () => {
        if ('error' in settled) return;
        const names = settled.variant.inputs.map((l) => l.name);
        for (const n of fx.expect.lines?.has ?? []) expect(names).toContain(n);
        for (const n of fx.expect.lines?.lacks ?? []) expect(names).not.toContain(n);
        for (const s of fx.expect.steps ?? []) {
          const hits = settled.study.lines.filter((l) => l.task.includes(s.taskHas));
          if (s.absent) {
            expect(hits).toEqual([]);
            continue;
          }
          expect(hits.length).toBeGreaterThan(0);
          if (s.laborMinutes !== undefined) expect(hits[0]!.laborMinutes).toBe(s.laborMinutes);
          if (s.staff !== undefined) expect(hits[0]!.staff).toBe(s.staff);
        }
        if (fx.expect.variantName !== undefined) expect(settled.variant.name).toBe(fx.expect.variantName);
      });
    });
  }
});
