/**
 * MicroFarm — control-point-2 two-stage cooling, evaluated (pure).
 *
 * The critical limit is the FDA Food Code model carried in `control_points` (control-point-2):
 * 135°F to 70°F within 2 hours, then 70°F to 41°F within 4 more — 6 hours total.
 *
 * Pass/fail is COMPUTED from the measured temperatures, never stored beside
 * them. A stored flag can disagree with its own record — a log line claiming
 * PASS at 78°F on the two-hour check is exactly the kind of thing a cooling log
 * exists to catch, so the platform derives the verdict and cannot be told
 * otherwise. This follows the engine rule that what is shown is computed
 * (docs/farm/CLAUDE.md §2 rule 4).
 */

/** control-point-2 critical limits, °F. Mirrors the `control_points` control-point-2 critical-limit text. */
export const CCP2_LIMITS = {
  /** Must be at or below this at the two-hour check. */
  twoHourMaxF: 70,
  /** Must be at or below this at the six-hour check. */
  sixHourMaxF: 41,
  /** The stage the sow starts from. */
  startF: 135,
} as const;

export type Ccp2Stage = 'two_hour' | 'six_hour';

export interface Ccp2Result {
  pass: boolean;
  /** Which stage failed, in the order the limits are applied. Empty when it passed. */
  failedStages: Ccp2Stage[];
  /** Plain statement of the measurement against the limit, for the record. */
  reason: string;
}

/**
 * Evaluate one stage record. The two-hour stage is checked first because it is
 * the one with a corrective action attached: a failed two-hour check can be
 * reheated and re-cooled once, while a failed six-hour check cannot.
 */
export function evaluateCcp2(t2F: number, t6F: number): Ccp2Result {
  const failedStages: Ccp2Stage[] = [];
  if (t2F > CCP2_LIMITS.twoHourMaxF) failedStages.push('two_hour');
  if (t6F > CCP2_LIMITS.sixHourMaxF) failedStages.push('six_hour');

  if (failedStages.length === 0) {
    return {
      pass: true,
      failedStages,
      reason: `${t2F}°F at 2 h and ${t6F}°F at 6 h, both within the limit`,
    };
  }
  const parts: string[] = [];
  if (failedStages.includes('two_hour')) {
    parts.push(`${t2F}°F at the 2-hour check, above the ${CCP2_LIMITS.twoHourMaxF}°F limit`);
  }
  if (failedStages.includes('six_hour')) {
    parts.push(`${t6F}°F at the 6-hour check, above the ${CCP2_LIMITS.sixHourMaxF}°F limit`);
  }
  return { pass: false, failedStages, reason: parts.join('; ') };
}

// ── The stage control points (outline §4) ─────────────────────────────────────

import { CONTROL_POINT_BY_ID, STAGE_CONTROL_POINTS, type ControlPointDef } from '@/data/produce-safety';
import { planStages, type GrowPlanDef } from '@/data/grow-plan';
import { TRAY_FORMAT_BY_KEY } from '@/data/tray-formats';

/** The control points a plan records, in stage order: those on its stages that apply to its format. */
export function controlPointsForPlan(plan: GrowPlanDef): ControlPointDef[] {
  const sprout = TRAY_FORMAT_BY_KEY[plan.format].kind === 'sprout';
  const out: ControlPointDef[] = [];
  for (const st of planStages(plan)) {
    if (!st.controlPoint) continue;
    const cp = CONTROL_POINT_BY_ID[st.controlPoint];
    if (cp.appliesTo === 'sprout' && !sprout) continue;
    if (cp.appliesTo === 'tray' && sprout) continue;
    if (!out.includes(cp)) out.push(cp);
  }
  return out;
}

export interface SpentWaterTest {
  /** Hours after sprouting started that the sample was drawn. */
  sampledAtHours: number;
  listeria: boolean | null;
  salmonella: boolean | null;
  ecoliO157: boolean | null;
}

export interface SpentWaterVerdict {
  /** Every organism tested negative on a sample drawn at or after 48 hours. */
  pass: boolean;
  /** A result is missing, or the sample was drawn too early: the batch is not cleared either way. */
  incomplete: boolean;
  positives: ('listeria' | 'salmonella' | 'ecoliO157')[];
  reason: string;
}

/** The minimum age of a spent sprout irrigation water sample (21 CFR 112.144). */
export const SPENT_WATER_SAMPLE_MIN_HOURS = 48;

/**
 * The verdict on a spent sprout irrigation water test, computed from the results, never stored
 * beside them: a positive fails the batch; a missing result or an early sample leaves it uncleared.
 */
export function evaluateSpentWaterTest(t: SpentWaterTest): SpentWaterVerdict {
  const positives = (['listeria', 'salmonella', 'ecoliO157'] as const).filter((k) => t[k] === true);
  const missing = (['listeria', 'salmonella', 'ecoliO157'] as const).filter((k) => t[k] === null);
  const early = t.sampledAtHours < SPENT_WATER_SAMPLE_MIN_HOURS;
  if (positives.length) return { pass: false, incomplete: false, positives, reason: `${positives.join(', ')} detected: the batch is held and destroyed (21 CFR 112.148).` };
  if (missing.length || early) return { pass: false, incomplete: true, positives, reason: `${early ? `Sample drawn at ${t.sampledAtHours} h, before the ${SPENT_WATER_SAMPLE_MIN_HOURS}-hour minimum. ` : ''}${missing.length ? `No result for ${missing.join(', ')}. ` : ''}The batch is not cleared.`.trim() };
  return { pass: true, incomplete: false, positives: [], reason: `Negative for Listeria species, Salmonella and E. coli O157:H7 on a sample drawn at ${t.sampledAtHours} h.` };
}

export { STAGE_CONTROL_POINTS };
