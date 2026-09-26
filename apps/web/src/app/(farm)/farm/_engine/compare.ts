/**
 * MicroFarm — two placed days side by side (scheduler build plan §5.3). Pure.
 *
 * The point of the module: run the same day under two scenarios and say what
 * changed. Every row is a fact off `schedule()` — nothing here re-derives a
 * figure, and nothing recommends a scenario. `better` says which way a row
 * moved for the reader who wants more units and fewer idle hours; a row where
 * that is not a sensible question carries `null`.
 *
 * Labor is minutes, never dollars: the scheduler carries no rate (§0 decision
 * 20) and pay is held in Staffing.
 */

import type { ScheduleResult } from './scheduler';

export type CompareFormat = 'units' | 'minutes' | 'hours' | 'percent' | 'count' | 'text' | 'dollars' | 'pounds';

export interface CompareRow {
  key: string;
  label: string;
  format: CompareFormat;
  /** The two sides, as numbers where the row is numeric and text where it is not. */
  a: number | string | null;
  b: number | string | null;
  /** B − A on a numeric row; null on a text row or where a side is missing. */
  delta: number | null;
  /** 'a', 'b' or 'same' where more or less is plainly better; null where it is not a question. */
  better: 'a' | 'b' | 'same' | null;
  note?: string;
}

export interface DayComparison {
  date: string;
  labelA: string;
  labelB: string;
  rows: CompareRow[];
  /** True when every numeric row is equal: the two scenarios place the same day. */
  identical: boolean;
}

const EPS = 1e-9;

/** Which side is better when more is better, or when less is. */
const pick = (a: number, b: number, moreIsBetter: boolean): 'a' | 'b' | 'same' => {
  if (Math.abs(a - b) <= EPS) return 'same';
  return (b > a) === moreIsBetter ? 'b' : 'a';
};

const utilisationOf = (r: ScheduleResult, key: string | null): number | null => (key ? r.metrics.utilizationByResource[key] ?? 0 : null);

/**
 * Compare two placed days. `blackoutRackKey` names the unit the blackout rack row reads —
 * the caller passes the blackout rack's equipment key, since the scheduler
 * knows units by key and not by kind.
 */
export function compareDays(
  a: { label: string; result: ScheduleResult },
  b: { label: string; result: ScheduleResult },
  blackoutRackKey: string | null = null,
): DayComparison {
  const A = a.result.metrics;
  const B = b.result.metrics;
  const num = (key: string, label: string, format: CompareFormat, x: number, y: number, moreIsBetter: boolean | null, note?: string): CompareRow => ({
    key,
    label,
    format,
    a: x,
    b: y,
    delta: y - x,
    better: moreIsBetter === null ? null : pick(x, y, moreIsBetter),
    ...(note ? { note } : {}),
  });
  const laborPerUnit = (m: typeof A) => (m.unitsPlaced > 0 ? (m.laborHours * 60) / m.unitsPlaced : 0);
  const blackoutA = utilisationOf(a.result, blackoutRackKey);
  const blackoutB = utilisationOf(b.result, blackoutRackKey);

  const rows: CompareRow[] = [
    num('units', 'Units placed', 'units', A.unitsPlaced, B.unitsPlaced, true, 'Whole sowings only; a sowing that does not fit is unplaced, never part-made.'),
    num('sowings', 'Sowings placed', 'count', A.sowingsPlaced, B.sowingsPlaced, true),
    num('unplaced', 'Sowings unplaced', 'count', A.sowingsUnplaced, B.sowingsUnplaced, false),
    num('shipped', 'Units shipped', 'units', A.unitsShipped, B.unitsShipped, true),
    {
      key: 'binding',
      label: 'Binding resource',
      format: 'text',
      a: A.bindingResourceKey,
      b: B.bindingResourceKey,
      delta: null,
      better: null,
      note: 'The unit nearest its ceiling on the day. A different unit means a different constraint, not a better day.',
    },
    num('makespan', 'Makespan', 'minutes', A.makespanMin, B.makespanMin, false, 'First start to last end, closedown excluded.'),
    num('crewHours', 'Crew hours', 'hours', A.crewHours, B.crewHours, null, 'What the proposed crews are on the floor for. Fewer is not better on its own: it may place less work.'),
    num('idle', 'Idle crew hours', 'hours', A.idleCrewHours, B.idleCrewHours, false, 'Crew time with no placed work to do.'),
    num('labor', 'Labor minutes', 'minutes', A.laborHours * 60, B.laborHours * 60, null, 'The time studies’ labor on every placed step; closedown is counted apart.'),
    num('laborPerUnit', 'Labor minutes per unit placed', 'minutes', laborPerUnit(A), laborPerUnit(B), false, 'No rate: the scheduler carries no wage and pay is held in Staffing.'),
    num('closedown', 'Closedown hours', 'hours', A.closedownHours, B.closedownHours, null),
    ...(blackoutRackKey
      ? [num('blackout_rack', 'Blackout rack utilisation', 'percent', blackoutA ?? 0, blackoutB ?? 0, null, 'Busy minutes inside the operating day over the day × its slots.')]
      : []),
    num('violations', 'Findings', 'count', a.result.violations.length, b.result.violations.length, false, 'Everything the placement breaks; nothing is repaired to clear one.'),
  ];

  const identical = rows.every((r) => r.delta === null || Math.abs(r.delta) <= EPS) && rows.every((r) => r.format !== 'text' || r.a === r.b);
  return { date: a.result.date, labelA: a.label, labelB: b.label, rows, identical };
}

/** The findings one side raises and the other does not, by kind — what the difference costs or buys. */
export function violationDelta(a: ScheduleResult, b: ScheduleResult): { kind: string; a: number; b: number }[] {
  const count = (r: ScheduleResult) =>
    r.violations.reduce<Record<string, number>>((m, v) => {
      m[v.kind] = (m[v.kind] ?? 0) + 1;
      return m;
    }, {});
  const ca = count(a);
  const cb = count(b);
  return [...new Set([...Object.keys(ca), ...Object.keys(cb)])]
    .sort()
    .map((kind) => ({ kind, a: ca[kind] ?? 0, b: cb[kind] ?? 0 }))
    .filter((r) => r.a !== r.b);
}
