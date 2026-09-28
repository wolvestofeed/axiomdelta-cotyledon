/**
 * Cotyledon — subscriptions (outline §4 Subscriber). A subscription is a subscriber's standing
 * order at one of their pickup points: a cadence, the first distribution date, an optional last
 * one, and the flat plan each distribution carries. The flat plan is kept as dated versions, so a
 * change takes effect from the next distribution not yet sown and earlier distributions keep what
 * they carried. Skips and a pause are kept on the subscription; every distribution is billed as
 * it is handed over, so a skipped or paused one bills nothing.
 */

export type Cadence = 'weekly' | 'biweekly' | 'monthly';

export const CADENCES: readonly Cadence[] = ['weekly', 'biweekly', 'monthly'];

export const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  monthly: 'Monthly',
};

export const isCadence = (v: unknown): v is Cadence => typeof v === 'string' && (CADENCES as readonly string[]).includes(v);

/** One grow plan in a distribution: its code and the units of the plan's format. */
export interface FlatPlanLine {
  growPlanCode: string;
  units: number;
}

/** What each distribution carries from a distribution date on. */
export interface FlatPlanVersion {
  from: string;
  lines: FlatPlanLine[];
}

export interface SubscriptionDef {
  id: string;
  subscriberId: string;
  subscriberPickupPointId: string;
  cadence: Cadence;
  /** The first distribution: its weekday, and for a monthly subscription its week of the month, fix the cadence. */
  startDate: string;
  /** The last distribution date it can fall on; null = open-ended. */
  endDate: string | null;
  flatPlan: FlatPlanVersion[];
  /** Distribution dates skipped. */
  skips: string[];
  /** Paused from this distribution date until resumed; null = running. */
  pausedFrom: string | null;
  notes: string | null;
}
