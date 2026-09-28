/**
 * Cotyledon — approved standard versions (Roadmap J5, `accounting-policy.md` §5). Pure.
 *
 * Materials are carried at actual cost and need no standard. What stands in for an actual cost
 * until one is recorded is the labor standard and the overhead rates: a version freezes a grow
 * plan's labor standard, its variable overhead per tray and the fixed overhead absorption rate,
 * as resolved on the plan of record, when a super admin approves it with an effective date. The
 * ledger reads them from the version in force on a sowing's production date; the sowing record
 * names that version so the cost can be reproduced. Editing the library or the plan does not move
 * a standard — only an approval does. The plan's lines and prices are always the live library's.
 */

import type { GrowPlanDef } from '@/data/grow-plan';
import { assumptions as defaultAssumptions } from '@/data/plan-data';
import { costPlan } from '@/engine/grow-costing';

export type StandardAssumptions = typeof defaultAssumptions;

export interface StandardSnapshot {
  /** The labor standard: minutes per sowing, per unit and on the daily stream per unit, at the loaded rate. */
  labor: {
    fixedMinutesPerSowing: number;
    variableMinutesPerUnit: number;
    dailyMinutesPerUnit: number;
    loadedRatePerHour: number;
  };
  /** Variable overhead applied per tray sown: the light it takes, and its tray wear and sanitizer, dollars. */
  variableOverheadPerTray: { light: number; consumables: number };
  /**
   * The fixed manufacturing overhead absorption rate in force at approval, dollars per unit
   * (Roadmap N3, audit A15). Absent on a version approved before rates were frozen: those
   * sowings absorb at the live rate, noted.
   */
  overheadRatePerUnit?: number;
}

/** What a version freezes for a grow plan at its own assumptions and, when known, the overhead rate. */
export function standardSnapshot(growPlan: GrowPlanDef, a: StandardAssumptions, overheadRatePerUnit?: number): StandardSnapshot {
  const perTray = costPlan(growPlan)?.perTray;
  return {
    labor: {
      fixedMinutesPerSowing: a.laborSplit.fixedMinutesPerSowing.value,
      variableMinutesPerUnit: a.laborSplit.variableMinutesPerUnit.value,
      dailyMinutesPerUnit: a.laborSplit.dailyMinutesPerUnit?.value ?? 0,
      loadedRatePerHour: a.labor.blendedLoadedWage.value,
    },
    variableOverheadPerTray: { light: perTray?.light ?? 0, consumables: perTray?.consumables ?? 0 },
    ...(overheadRatePerUnit !== undefined ? { overheadRatePerUnit } : {}),
  };
}

/**
 * A stored snapshot as the engine reads it. A version approved before only labor and overhead were
 * frozen carries the whole grow plan and its assumptions (the grow plan inside the old projected
 * shape as `growPlan.plan` on the oldest); its labor standard and overhead per tray are read from
 * what it froze, and its grow plan and prices are not used.
 */
export function readSnapshot(raw: unknown): StandardSnapshot {
  const snap = raw as Partial<StandardSnapshot> & { growPlan?: GrowPlanDef & { plan?: GrowPlanDef }; assumptions?: StandardAssumptions };
  if (snap.labor && snap.variableOverheadPerTray) return snap as StandardSnapshot;
  const growPlan = snap.growPlan && !Array.isArray(snap.growPlan.lines) && snap.growPlan.plan ? snap.growPlan.plan : snap.growPlan!;
  return standardSnapshot(growPlan, snap.assumptions ?? defaultAssumptions, snap.overheadRatePerUnit);
}

/**
 * The assumptions a sowing is costed at under a version: the live ones, with the labor standard the
 * version froze in place of the live labor split and loaded rate.
 */
export function assumptionsAtStandard(live: StandardAssumptions, snapshot: StandardSnapshot): StandardAssumptions {
  const l = snapshot.labor;
  return {
    ...live,
    laborSplit: {
      ...live.laborSplit,
      fixedMinutesPerSowing: { ...live.laborSplit.fixedMinutesPerSowing, value: l.fixedMinutesPerSowing },
      variableMinutesPerUnit: { ...live.laborSplit.variableMinutesPerUnit, value: l.variableMinutesPerUnit },
      dailyMinutesPerUnit: { ...(live.laborSplit.dailyMinutesPerUnit ?? live.laborSplit.variableMinutesPerUnit), value: l.dailyMinutesPerUnit },
    },
    labor: { ...live.labor, blendedLoadedWage: { ...live.labor.blendedLoadedWage, value: l.loadedRatePerHour } },
  };
}

export interface StandardVersionDoc {
  id: string;
  growPlanCode: string;
  version: number;
  /** ISO date the version takes effect. */
  effectiveFrom: string;
  approvedBy: string;
  /** ISO timestamp. */
  approvedAt: string;
  notes: string | null;
  snapshot: StandardSnapshot;
}

/** `AMK-E-001@v3` — what a sowing record names. */
export const standardLabel = (v: Pick<StandardVersionDoc, 'growPlanCode' | 'version'>): string => `${v.growPlanCode}@v${v.version}`;

/** The label for a sowing costed at the live library because no approved version was in force. */
export const libraryLabel = (growPlanCode: string): string => `${growPlanCode}@library`;

/**
 * The version in force for a grow plan on a date: the latest effective date on or
 * before it, the highest version if two share a date. Null when no approved
 * version was in force yet.
 */
export function standardInForce(standards: readonly StandardVersionDoc[], growPlanCode: string, date: string): StandardVersionDoc | null {
  let best: StandardVersionDoc | null = null;
  for (const s of standards) {
    if (s.growPlanCode !== growPlanCode || s.effectiveFrom > date) continue;
    if (!best || s.effectiveFrom > best.effectiveFrom || (s.effectiveFrom === best.effectiveFrom && s.version > best.version)) best = s;
  }
  return best;
}

/** Every version of a grow plan, newest first. */
export function standardHistory(standards: readonly StandardVersionDoc[], growPlanCode: string): StandardVersionDoc[] {
  return standards.filter((s) => s.growPlanCode === growPlanCode).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version - a.version);
}

export const nextStandardVersion = (standards: readonly StandardVersionDoc[], growPlanCode: string): number =>
  standards.filter((s) => s.growPlanCode === growPlanCode).reduce((m, s) => Math.max(m, s.version), 0) + 1;

/**
 * True when the live labor standard, variable overhead per tray or overhead rate differ from what
 * the snapshot froze. A rate is compared only when both sides carry one — a version approved before
 * rates were frozen never froze it, so its absence is not a difference.
 */
export function standardDiffers(snapshot: StandardSnapshot, current: StandardSnapshot): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9;
  const l = snapshot.labor;
  const c = current.labor;
  if (!near(l.fixedMinutesPerSowing, c.fixedMinutesPerSowing) || !near(l.variableMinutesPerUnit, c.variableMinutesPerUnit) || !near(l.dailyMinutesPerUnit, c.dailyMinutesPerUnit) || !near(l.loadedRatePerHour, c.loadedRatePerHour)) return true;
  if (!near(snapshot.variableOverheadPerTray.light, current.variableOverheadPerTray.light) || !near(snapshot.variableOverheadPerTray.consumables, current.variableOverheadPerTray.consumables)) return true;
  if (snapshot.overheadRatePerUnit !== undefined && current.overheadRatePerUnit !== undefined) return !near(snapshot.overheadRatePerUnit, current.overheadRatePerUnit);
  return false;
}
