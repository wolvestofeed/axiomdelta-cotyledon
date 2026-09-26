/**
 * MicroFarm — approved standard-cost versions (Roadmap J5). Pure.
 *
 * A standard is a crop plan as resolved on the plan of record plus the cost
 * assumptions in force, frozen when a super admin approves it with an
 * effective date. The ledger costs a sowing at the version in force on its
 * production date; the sowing record names that version so the cost can be
 * reproduced. Editing the library or the plan does not move a standard —
 * only an approval does.
 */

import { assumptions as defaultAssumptions, type CropPlanDef } from '../_data/plan-data';
import { stableStringify } from './periods';

export type StandardAssumptions = typeof defaultAssumptions;

export interface StandardSnapshot {
  cropPlan: CropPlanDef;
  /**
   * The assumptions the crop plan was costed at — its OWN, carrying its labor
   * standard and packaging (Roadmap N3). A snapshot taken before N3 froze the
   * shared assumptions, whose labor was AMK-E-001's; it is read as it was frozen.
   */
  assumptions: StandardAssumptions;
  /**
   * The fixed manufacturing overhead absorption rate in force at approval,
   * dollars per unit (Roadmap N3, audit A15). Absent on a snapshot taken before
   * N3, which never froze it: those sowings absorb at the live rate, noted.
   */
  overheadRatePerUnit?: number;
}

export interface StandardVersionDoc {
  id: string;
  cropPlanCode: string;
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
export const standardLabel = (v: Pick<StandardVersionDoc, 'cropPlanCode' | 'version'>): string => `${v.cropPlanCode}@v${v.version}`;

/** The label for a sowing costed at the live library because no approved version was in force. */
export const libraryLabel = (cropPlanCode: string): string => `${cropPlanCode}@library`;

/**
 * The version in force for a crop plan on a date: the latest effective date on or
 * before it, the highest version if two share a date. Null when no approved
 * version was in force yet.
 */
export function standardInForce(standards: readonly StandardVersionDoc[], cropPlanCode: string, date: string): StandardVersionDoc | null {
  let best: StandardVersionDoc | null = null;
  for (const s of standards) {
    if (s.cropPlanCode !== cropPlanCode || s.effectiveFrom > date) continue;
    if (!best || s.effectiveFrom > best.effectiveFrom || (s.effectiveFrom === best.effectiveFrom && s.version > best.version)) best = s;
  }
  return best;
}

/** Every version of a crop plan, newest first. */
export function standardHistory(standards: readonly StandardVersionDoc[], cropPlanCode: string): StandardVersionDoc[] {
  return standards.filter((s) => s.cropPlanCode === cropPlanCode).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version - a.version);
}

export const nextStandardVersion = (standards: readonly StandardVersionDoc[], cropPlanCode: string): number =>
  standards.filter((s) => s.cropPlanCode === cropPlanCode).reduce((m, s) => Math.max(m, s.version), 0) + 1;

/**
 * True when the live crop plan, its assumptions or the overhead rate differ from
 * what the snapshot froze. A rate is compared only when both sides carry one — a
 * pre-N3 snapshot never froze it, so its absence is not a difference.
 */
export function standardDiffers(snapshot: StandardSnapshot, current: StandardSnapshot): boolean {
  if (stableStringify(snapshot.cropPlan) !== stableStringify(current.cropPlan)) return true;
  if (stableStringify(snapshot.assumptions) !== stableStringify(current.assumptions)) return true;
  if (snapshot.overheadRatePerUnit !== undefined && current.overheadRatePerUnit !== undefined) {
    return Math.abs(snapshot.overheadRatePerUnit - current.overheadRatePerUnit) > 1e-9;
  }
  return false;
}
