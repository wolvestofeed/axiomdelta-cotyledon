/**
 * MicroFarm — experiments in R&D (outline §4 Experiment). Pure.
 *
 * An experiment is a titled run of a developing grow plan: the plan, a sow date and whole trays.
 * Until a sowing record names it, it sits on the grow units from its sow date for the plan's
 * cycle, so the shelf ledger places it like any recorded sowing and production sees the room it
 * takes. It is closed when a sowing record names it. Across a plan's closed experiments the yield
 * of each variety is read as grams per tray packed: the mean, the lowest and highest, and the
 * standard deviation, beside the figure the plan is costed at. Nothing here judges a yield stable;
 * Rob does.
 */

import { isoAddDays } from '@/engine/orders';
import { daysFrom } from '@/engine/grow-calendar';
import { planStageDays, seedLines, type GrowPlanDef } from '@/data/grow-plan';
import { cycleDays, daysToHarvest } from '@/data/stage-schedule';
import { TRAY_FORMAT_BY_KEY, densityFactorOf } from '@/data/tray-formats';
import { VARIETY_BY_KEY, growthFor, type VarietyDef } from '@/data/varieties';
import type { StatusTag } from '@/data/tagged';
import type { SowingRecordDoc } from '@/engine/actuals';

export interface ExperimentDoc {
  id: string;
  title: string;
  growPlanCode: string;
  /** ISO date. */
  sowDate: string;
  trays: number;
  note: string | null;
}

export type ExperimentStatus = 'planned' | 'on-shelves' | 'past-cycle' | 'closed';

export const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, string> = {
  planned: 'Planned',
  'on-shelves': 'On the shelves',
  'past-cycle': 'Past its cycle, not closed',
  closed: 'Closed',
};

/** The sowing record that closed the experiment, if one names it. */
export function recordOf(e: Pick<ExperimentDoc, 'id'>, sowings: readonly SowingRecordDoc[]): SowingRecordDoc | null {
  return sowings.find((s) => s.experimentId === e.id) ?? null;
}

/** First and last day of the harvest window; the last is the last day the trays hold a grow unit, as the shelf ledger places them. */
export function experimentWindow(plan: GrowPlanDef, sowDate: string): { harvestFrom: string; harvestTo: string } {
  const days = planStageDays(plan);
  return { harvestFrom: isoAddDays(sowDate, daysToHarvest(days)), harvestTo: isoAddDays(sowDate, cycleDays(days) - 1) };
}

export function experimentStatus(e: ExperimentDoc, plan: GrowPlanDef | undefined, sowings: readonly SowingRecordDoc[], today: string): ExperimentStatus {
  if (recordOf(e, sowings)) return 'closed';
  if (daysFrom(e.sowDate, today) < 0) return 'planned';
  if (!plan) return 'on-shelves';
  return today <= experimentWindow(plan, e.sowDate).harvestTo ? 'on-shelves' : 'past-cycle';
}

/**
 * The experiments the shelf ledger places: not closed, their plan in the library, and still on a
 * grow unit today or sown later. A closed experiment is on the shelves as its sowing record.
 */
export function experimentsOnShelves(
  experiments: readonly ExperimentDoc[],
  sowings: readonly SowingRecordDoc[],
  plans: readonly GrowPlanDef[],
  today: string,
): { growPlanCode: string; sowDate: string; trays: number; experiment: string }[] {
  return experiments
    .filter((e) => {
      const plan = plans.find((p) => p.code === e.growPlanCode);
      return plan !== undefined && !recordOf(e, sowings) && today <= experimentWindow(plan, e.sowDate).harvestTo;
    })
    .map((e) => ({ growPlanCode: e.growPlanCode, sowDate: e.sowDate, trays: e.trays, experiment: e.title }));
}

/** What the plan is costed at for each variety: harvest grams per tray, with the record's tag. */
export function expectedHarvestPerTray(
  plan: GrowPlanDef,
  varieties: Readonly<Record<string, VarietyDef>> = VARIETY_BY_KEY,
): { varietyKey: string; name: string; grams: number; status: StatusTag }[] {
  const format = TRAY_FORMAT_BY_KEY[plan.format];
  const density = densityFactorOf(format);
  return seedLines(plan).flatMap((line) => {
    const v = varieties[line.varietyKey];
    if (!v) return [];
    const h = growthFor(v, format.kind !== 'sprout').harvestGramsPer1020;
    return [{ varietyKey: v.key, name: v.name, grams: h.value * density * line.share, status: h.status }];
  });
}

export interface VarietyYield {
  varietyKey: string;
  name: string;
  /** Closed experiments that packed a tray of the plan, each read as its packed grams over its trays packed. */
  n: number;
  /** Grams per tray packed, one per experiment, in sow-date order. */
  perTray: number[];
  mean: number | null;
  min: number | null;
  max: number | null;
  /** Sample standard deviation; null under two experiments. */
  sd: number | null;
  /** The plan's own figure per tray, with its tag. */
  expected: { grams: number; status: StatusTag } | null;
}

export interface PlanYield {
  growPlanCode: string;
  closed: number;
  /** Closed experiments that packed no tray. */
  nonePacked: number;
  traysSown: number;
  traysRemoved: number;
  varieties: VarietyYield[];
}

/** Yield per variety across a plan's closed experiments. */
export function yieldAcross(
  plan: GrowPlanDef,
  experiments: readonly ExperimentDoc[],
  sowings: readonly SowingRecordDoc[],
  varieties: Readonly<Record<string, VarietyDef>> = VARIETY_BY_KEY,
): PlanYield {
  const records = experiments
    .filter((e) => e.growPlanCode === plan.code)
    .map((e) => recordOf(e, sowings))
    .filter((r): r is SowingRecordDoc => r !== null)
    .sort((a, b) => a.productionDate.localeCompare(b.productionDate));
  const packed = (r: SowingRecordDoc) => r.traysPacked ?? r.goodUnits;
  const sown = (r: SowingRecordDoc) => r.traysSown ?? r.plannedUnits;
  const counted = records.filter((r) => packed(r) > 0);
  const expected = expectedHarvestPerTray(plan, varieties);
  const keys = [...new Set([...expected.map((x) => x.varietyKey), ...counted.flatMap((r) => r.lots.map((l) => l.varietyKey))])];
  return {
    growPlanCode: plan.code,
    closed: records.length,
    nonePacked: records.length - counted.length,
    traysSown: records.reduce((t, r) => t + sown(r), 0),
    traysRemoved: records.reduce((t, r) => t + Math.max(0, sown(r) - packed(r)), 0),
    varieties: keys.map((key) => {
      const perTray = counted.flatMap((r) => {
        const lot = r.lots.find((l) => l.varietyKey === key);
        return lot ? [lot.packedG / packed(r)] : [];
      });
      const n = perTray.length;
      const mean = n ? perTray.reduce((t, x) => t + x, 0) / n : null;
      const sd = n >= 2 && mean !== null ? Math.sqrt(perTray.reduce((t, x) => t + (x - mean) ** 2, 0) / (n - 1)) : null;
      const exp = expected.find((x) => x.varietyKey === key);
      const name = exp?.name ?? varieties[key]?.name ?? counted.flatMap((r) => r.lots).find((l) => l.varietyKey === key)?.variety ?? key;
      return { varietyKey: key, name, n, perTray, mean, min: n ? Math.min(...perTray) : null, max: n ? Math.max(...perTray) : null, sd, expected: exp ? { grams: exp.grams, status: exp.status } : null };
    }),
  };
}
