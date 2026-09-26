/**
 * Impact OS — which forecast was the plan of record for a month (Roadmap N7).
 *
 * Setting the plan of record posts to the trail with the forecast's config as
 * applied. A month compares with the plan of record in force at its end (Robert,
 * 2026-09-16). A month that ends before the first entry on the trail reads the plan
 * of record set now, and says so.
 */

import type { MuseScenarioConfig } from './scenario';
import { localDate } from './payroll';

export interface PlanOfRecordEntry {
  scenarioId: string;
  label: string;
  /** ISO timestamp the forecast became the plan of record. */
  appliedAt: string;
  config: MuseScenarioConfig;
  /** The master records and meal plans as they stood when applied; absent on entries written before snapshots. */
  snapshot?: unknown;
}

export interface PlanInForce {
  scenarioId: string | null;
  label: string | null;
  config: MuseScenarioConfig;
  /** 'trail': the entry in force at the month end. 'current': no entry that early; the plan of record set now. */
  basis: 'trail' | 'current';
  appliedAt: string | null;
  /** The entry's frozen master records; null reads the definitions as they stand now. */
  snapshot: unknown;
}

/** The plan of record in force at the end of a month (`YYYY-MM`); a change is dated on the kitchen's clock. */
export function planOfRecordAtMonthEnd(
  history: readonly PlanOfRecordEntry[],
  period: string,
  current: { scenarioId: string | null; label: string | null; config: MuseScenarioConfig },
): PlanInForce {
  const [y, m] = period.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const entry = [...history]
    .filter((h) => localDate(h.appliedAt) <= monthEnd)
    .sort((a, b) => a.appliedAt.localeCompare(b.appliedAt))
    .at(-1);
  if (entry) return { scenarioId: entry.scenarioId, label: entry.label, config: entry.config, basis: 'trail', appliedAt: entry.appliedAt, snapshot: entry.snapshot ?? null };
  return { ...current, basis: 'current', appliedAt: null, snapshot: null };
}
