/**
 * Impact OS — CCP-2 two-stage cooling, evaluated (pure).
 *
 * The critical limit is the FDA Food Code model carried in `ccps` (CCP-2):
 * 135°F to 70°F within 2 hours, then 70°F to 41°F within 4 more — 6 hours total.
 *
 * Pass/fail is COMPUTED from the measured temperatures, never stored beside
 * them. A stored flag can disagree with its own record — a log line claiming
 * PASS at 78°F on the two-hour check is exactly the kind of thing a cooling log
 * exists to catch, so the platform derives the verdict and cannot be told
 * otherwise. This follows the engine rule that what is shown is computed
 * (docs/muse/CLAUDE.md §2 rule 4).
 */

/** CCP-2 critical limits, °F. Mirrors the `ccps` CCP-2 critical-limit text. */
export const CCP2_LIMITS = {
  /** Must be at or below this at the two-hour check. */
  twoHourMaxF: 70,
  /** Must be at or below this at the six-hour check. */
  sixHourMaxF: 41,
  /** The stage the cook starts from. */
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
 * Evaluate one cooling record. The two-hour stage is checked first because it is
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
