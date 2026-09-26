/**
 * MicroFarm — the stage control points, evaluated (pure).
 *
 * A verdict is COMPUTED from what the record holds, never stored beside it: a stored
 * flag can disagree with its own record, so the platform derives the verdict and
 * cannot be told otherwise.
 */

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
