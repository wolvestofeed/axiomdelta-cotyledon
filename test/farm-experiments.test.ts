/**
 * Experiments in R&D (outline §4 Experiment): a titled run of a developing plan sits on the grow
 * units from its sow date until a sowing record names it, and the yield per variety is read across
 * a plan's closed experiments as grams per tray packed.
 */
import { describe, expect, it } from 'vitest';
import { blendSeed } from '@/data/blends';
import { seedLines } from '@/data/grow-plan';
import { standardSowingRecordPrefill, type SowingRecordDoc } from '@/engine/actuals';
import { planHorizon } from '@/engine/production-plan';
import { resolveScenarioInputs } from '@/engine/scenario';
import {
  experimentStatus,
  experimentWindow,
  experimentsOnShelves,
  expectedHarvestPerTray,
  yieldAcross,
  type ExperimentDoc,
} from '@/engine/experiments';

const plan = blendSeed.find((p) => p.code === 'BLEND-09')!;
const G = resolveScenarioInputs({});
const exp = (id: string, sowDate: string, trays = 2): ExperimentDoc => ({ id, title: `Run ${id}`, growPlanCode: plan.code, sowDate, trays, note: null });

/** A closed record of the experiment: each variety packs `perTray[i]` grams a tray on `packed` trays. */
function closed(e: ExperimentDoc, perTray: number[], packed = e.trays): SowingRecordDoc {
  const pre = standardSowingRecordPrefill(e.sowDate, 1, e.trays, plan);
  return {
    ...pre,
    id: `rec-${e.id}`,
    closedAt: null,
    experimentId: e.id,
    traysSown: e.trays,
    traysPacked: packed,
    goodUnits: packed,
    lots: pre.lots.map((l, i) => ({ ...l, packedG: perTray[i]! * packed, harvestedG: perTray[i]! * packed })),
  };
}

describe('an experiment on the grow units', () => {
  it('is planned before its sow date, on the shelves through its cycle, then past its cycle until closed', () => {
    const e = exp('a', '2026-10-05');
    const w = experimentWindow(plan, e.sowDate);
    expect(experimentStatus(e, plan, [], '2026-10-04')).toBe('planned');
    expect(experimentStatus(e, plan, [], '2026-10-05')).toBe('on-shelves');
    expect(experimentStatus(e, plan, [], w.harvestTo)).toBe('on-shelves');
    expect(experimentStatus(e, plan, [], '2026-12-01')).toBe('past-cycle');
    expect(experimentStatus(e, plan, [closed(e, [60, 60, 60])], '2026-10-06')).toBe('closed');
  });

  it('is placed on the shelf ledger until a record names it, and never twice', () => {
    const e = exp('a', '2026-10-05', 3);
    expect(experimentsOnShelves([e], [], blendSeed, '2026-10-01')).toEqual([{ growPlanCode: plan.code, sowDate: '2026-10-05', trays: 3, experiment: 'Run a' }]);
    expect(experimentsOnShelves([e], [closed(e, [1, 1, 1])], blendSeed, '2026-10-06')).toEqual([]);
    expect(experimentsOnShelves([e], [], blendSeed, '2026-12-01')).toEqual([]);
  });

  it('takes its trays on a grow unit in the horizon, as production sees it', () => {
    const balanced = blendSeed.find((p) => p.code === 'BLEND-01')!;
    const e = { ...exp('a', '2026-10-05', 3), growPlanCode: balanced.code };
    const h = planHorizon({
      from: '2026-10-01',
      to: '2026-10-31',
      book: [],
      growPlans: blendSeed,
      capacityInputs: G.capacityInputs,
      assumptions: G.assumptions,
      unitFactorByChannel: { 1: 1 },
      openingLots: [],
      shelfLifeDays: 3,
      openingSowings: experimentsOnShelves([e], [], blendSeed, '2026-10-01'),
    });
    const s = h.growCalendar.sowings.find((x) => x.growPlanCode === balanced.code)!;
    expect(s).toMatchObject({ sowDate: '2026-10-05', trays: 3, placed: true, distributionDate: null, experiment: 'Run a' });
    expect(h.growCalendar.sowings.filter((x) => x.growPlanCode === balanced.code)).toHaveLength(1);
  });
});

describe('yield per variety across a plan\'s experiments', () => {
  it('is packed grams over trays packed: mean, lowest, highest and the sample standard deviation', () => {
    const a = exp('a', '2026-10-05');
    const b = exp('b', '2026-10-19');
    const c = exp('c', '2026-11-02', 4);
    const y = yieldAcross(plan, [a, b, c], [closed(a, [80, 50, 70]), closed(b, [100, 50, 90], 1), closed(c, [0, 0, 0], 0)]);
    expect(y.closed).toBe(3);
    expect(y.nonePacked).toBe(1);
    expect(y.traysSown).toBe(8);
    expect(y.traysRemoved).toBe(5);
    const lead = y.varieties.find((v) => v.varietyKey === seedLines(plan)[0]!.varietyKey)!;
    expect(lead.n).toBe(2);
    expect(lead.perTray).toEqual([80, 100]);
    expect(lead.mean).toBe(90);
    expect(lead.min).toBe(80);
    expect(lead.max).toBe(100);
    expect(lead.sd).toBeCloseTo(Math.sqrt(200), 9);
  });

  it('sets the plan\'s own figure beside it, with its tag, and has no spread under two experiments', () => {
    const a = exp('a', '2026-10-05');
    const y = yieldAcross(plan, [a], [closed(a, [80, 50, 70])]);
    const expected = expectedHarvestPerTray(plan);
    expect(y.varieties.map((v) => v.expected)).toEqual(expected.map((x) => ({ grams: x.grams, status: x.status })));
    expect(y.varieties.every((v) => v.sd === null && v.n === 1)).toBe(true);
    expect(yieldAcross(plan, [exp('z', '2026-10-05')], []).varieties.every((v) => v.n === 0 && v.mean === null)).toBe(true);
  });
});
