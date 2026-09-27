/**
 * An experiment's books (`accounting-policy.md` §14, `outline.md` §5 rule 11): its sowing posts the
 * same chain as any sowing, then its packed trays go from the pack stage to Research and
 * Development (7920) and any loss goes there too; nothing reaches finished goods, cost of goods
 * sold, Abnormal Spoilage or revenue.
 */
import { describe, it, expect } from 'vitest';
import { phases } from '@/data/plan-data';
import { resolveScenarioInputs } from '@/engine/scenario';
import {
  ACC_WIP_SOW,
  ACC_WIP_GROW,
  ACC_WIP_PACK,
  ACC_FINISHED_GOODS,
  ACC_ABNORMAL_SPOILAGE,
  ACC_RESEARCH_DEVELOPMENT,
  ACC_COGS_MATERIALS,
  ACC_COGS_LABOR,
  ACC_COGS_OVERHEAD,
  FARM_COA,
} from '@/data/coa-farm';
import { normalCapacity, absorbOverhead, deriveCapacity, buildPurchaseOrder } from '@/engine';
import { standardSowingRecordPrefill, toSowingExecution, finishedLotsOf, isExperimentSowing, type DistributionDoc, type SowingRecordDoc } from '@/engine/actuals';
import { productionSowingLedger } from '@/engine/production-ledger';
import { postActuals, postActualLedger } from '@/engine/actuals-ledger';
import { finishedGoodsOnHand } from '@/engine/production-plan';
import { manufacturingOverheadBudget } from '@/engine/fixed-costs';
import type { SowingExecution } from '@/engine/sowing';

const DATE = '2026-09-14';
const R0 = resolveScenarioInputs();
const growPlan = R0.growPlan;
const trays = deriveCapacity(growPlan, R0.capacityInputs).sowingSize;
const nc = normalCapacity(phases);
const overhead = absorbOverhead(manufacturingOverheadBudget().annual, nc, nc.unitsPerYear);

const record = (overrides: Partial<SowingRecordDoc> = {}): SowingRecordDoc => ({ ...standardSowingRecordPrefill(DATE, 1, trays, growPlan), id: 'S1', closedAt: null, ...overrides });
const execution = (): SowingExecution => toSowingExecution(record());

const post = (s: SowingExecution, experiment: boolean) =>
  productionSowingLedger(s, { overhead, purchaseOrderCost: buildPurchaseOrder(trays, growPlan).total, receiptRecorded: true, pricePerUnit: phases[0].pricePerUnit, experiment }, growPlan);

const distribution = (units: number): DistributionDoc => ({
  id: 'd1000000-0000-0000-0000-000000000001',
  distributedOn: '2026-09-15',
  phase: 1,
  pickupPointId: null,
  pickupPointName: 'Test prospect',
  units,
  pricePerUnitCents: Math.round(phases[0].pricePerUnit * 100),
  lotCodes: [],
  distributedBy: 'driver',
  notes: null,
  growPlanCode: growPlan.code,
});

const net = (entries: { lines: { accountCode: string; debitCents: number; creditCents: number }[] }[], code: string) =>
  entries.flatMap((e) => e.lines).filter((l) => l.accountCode === code).reduce((s, l) => s + l.debitCents - l.creditCents, 0);

/** Remove `removed` trays at the harvest check and lose `finishedG` of each lot after packing. */
function withLoss(removed: number, finishedG: number): SowingExecution {
  const b = execution();
  b.goodUnits = trays - removed;
  for (const l of b.lots) {
    const g = (l.harvestedG * removed) / trays;
    l.scrap.push({ reason: 'CONTAMINATION', g, stage: 'PACK', note: 'mold at the check' });
    l.packedG -= g;
    if (finishedG > 0) {
      l.scrap.push({ reason: 'DROPPED_OR_DAMAGED', g: finishedG, stage: 'FINISHED', note: 'dropped after packing' });
      l.packedG -= finishedG;
    }
  }
  return b;
}

describe('Research and Development (7920)', () => {
  it('is on the chart as an expense', () => {
    expect(FARM_COA.find((a) => a.code === ACC_RESEARCH_DEVELOPMENT)).toMatchObject({ name: 'Research and Development', type: 'expense' });
  });
});

describe("an experiment's sowing", () => {
  it('builds its cost as any sowing does, then charges the packed trays to 7920, never finished goods', () => {
    const prod = post(execution(), false);
    const exp = post(execution(), true);
    expect(exp.balanced).toBe(true);
    for (const k of ['materialIssuedToWip', 'directLaborActual', 'overheadAbsorbed', 'lightApplied', 'consumablesApplied', 'finishedGoodsCost'] as const) {
      expect(exp.amounts[k], k).toBeCloseTo(prod.amounts[k], 6);
    }
    for (const code of [ACC_WIP_SOW, ACC_WIP_GROW, ACC_WIP_PACK, ACC_FINISHED_GOODS]) expect(net(exp.entries, code), code).toBe(0);
    expect(net(exp.entries, ACC_RESEARCH_DEVELOPMENT)).toBe(Math.round(prod.amounts.finishedGoodsCost * 100));
    expect(exp.amounts.researchAndDevelopment).toBeCloseTo(prod.amounts.finishedGoodsCost, 6);
    expect(prod.amounts.researchAndDevelopment).toBe(0);
  });

  it('ships nothing: no revenue, no cost of goods sold, no distribution expense', () => {
    const exp = post(execution(), true);
    for (const code of [ACC_COGS_MATERIALS, ACC_COGS_LABOR, ACC_COGS_OVERHEAD, '4010', '1100', '7900']) expect(net(exp.entries, code), code).toBe(0);
    expect(exp.amounts.revenue).toBe(0);
    expect(exp.amounts.unitsShipped).toBe(0);
    expect(exp.entries.some((e) => /-SHIP$|-DELIV$/.test(e.id))).toBe(false);
  });

  it("charges a loss at any stage to 7920, never Abnormal Spoilage; the whole sowing's cost lands there", () => {
    const prod = post(withLoss(2, 5), false);
    const exp = post(withLoss(2, 5), true);
    expect(exp.balanced).toBe(true);
    expect(net(exp.entries, ACC_ABNORMAL_SPOILAGE)).toBe(0);
    expect(exp.amounts.abnormalSpoilage).toBe(0);
    expect(prod.amounts.abnormalSpoilage).toBeGreaterThan(0);
    for (const code of [ACC_WIP_SOW, ACC_WIP_GROW, ACC_WIP_PACK, ACC_FINISHED_GOODS]) expect(net(exp.entries, code), code).toBe(0);
    // What the production sowing packs into finished goods, and what its spoilage takes out of work in
    // process, the experiment charges to 7920; its loss after packing is already inside the packed charge.
    const packed = prod.entries.find((e) => e.id.endsWith('-FG'))!.lines.find((l) => l.accountCode === ACC_FINISHED_GOODS)!.debitCents;
    const fromWip = prod.entries.find((e) => e.id.endsWith('-SPOIL'))!.lines.filter((l) => [ACC_WIP_SOW, ACC_WIP_GROW, ACC_WIP_PACK].includes(l.accountCode)).reduce((t, l) => t + l.creditCents, 0);
    expect(fromWip).toBeGreaterThan(0);
    expect(net(exp.entries, ACC_RESEARCH_DEVELOPMENT)).toBe(packed + fromWip);
    expect(exp.amounts.researchAndDevelopment * 100).toBeCloseTo(net(exp.entries, ACC_RESEARCH_DEVELOPMENT), 0);
  });
});

describe('an experiment in the Actual ledger', () => {
  const exp = record({ id: 'S-exp', sowingId: 'B-260914-02', experimentId: 'e0000000-0000-0000-0000-000000000001', growPlanCode: growPlan.code });
  const prod = record({ id: 'S-prod', sowingId: 'B-260914-01' });

  it('is known by the experiment it names', () => {
    expect(isExperimentSowing(exp)).toBe(true);
    expect(isExperimentSowing(prod)).toBe(false);
  });

  it('posts to 7920 with no finished goods layer: a distribution draws only on production sowings', () => {
    const units = trays;
    const posted = postActuals({
      sowings: [exp, prod],
      receipts: [],
      distributions: [distribution(units)],
      bills: [],
    });
    expect(posted.balanced).toBe(true);
    expect(net(posted.entries, ACC_FINISHED_GOODS)).toBe(0);
    const expLed = posted.periods[0]!.sowings.find((l) => l.entries[0]!.id.startsWith('B-260914-02'))!;
    expect(net(posted.entries, ACC_RESEARCH_DEVELOPMENT)).toBe(Math.round(expLed.amounts.researchAndDevelopment * 100));
    // The cost per unit made is the production sowing's alone.
    const prodLed = posted.periods[0]!.sowings.find((l) => l.entries[0]!.id.startsWith('B-260914-01'))!;
    expect(posted.periods[0]!.costPerUnitCents).toBeCloseTo((prodLed.amounts.finishedGoodsCost * 100) / prodLed.amounts.unitsProduced, 6);
    expect(posted.periods[0]!.notes.join(' ')).toMatch(/B-260914-02: an experiment in R&D/);
  });

  it('sits among operating expenses on the statement of income', () => {
    const ledger = postActualLedger({ sowings: [exp], receipts: [], distributions: [], bills: [] }, R0, '2026-09-28');
    const month = ledger.months.find((m) => m.label === '2026-09')!;
    const row = month.incomeStatement.otherOperating.find((r) => r.code === ACC_RESEARCH_DEVELOPMENT);
    expect(row?.cents).toBeGreaterThan(0);
    expect(month.incomeStatement.costOfGoodsSoldCents).toBe(0);
    expect(month.incomeStatement.manufacturingVariances.some((r) => r.code === ACC_ABNORMAL_SPOILAGE)).toBe(false);
  });

  it('is never stock: not a finished lot, not on hand', () => {
    expect(finishedLotsOf([exp, prod])).toEqual(finishedLotsOf([prod]));
    expect(finishedLotsOf([exp])).toEqual([]);
    const onHand = finishedGoodsOnHand({ sowings: [exp], consumed: [], shelfLifeDays: 30, asOf: '2026-12-31', growPlans: [growPlan] });
    expect(onHand.lots).toHaveLength(0);
  });
});

