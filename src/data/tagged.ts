/**
 * Cotyledon — the provenance primitive.
 *
 * Every figure the platform carries is a `Tagged` value: a number (or other
 * leaf) plus the status of where it came from. Lives in its own module so any
 * data register (`plan-data.ts`, `crews.ts`, …) can use it without importing
 * another register — which is what keeps the data layer free of cycles.
 * Definitions per docs/farm/CLAUDE.md §3.
 */

export type StatusTag =
  | 'SOURCED' // cited third party
  | 'STATED' // supplied by the operator
  | 'PLACEHOLDER' // working figure, no source yet
  | 'DERIVED' // calculated from other tagged rows
  | 'UNCONFIRMED' // believed, not verified
  | 'DATED'; // sourced but old

/** A single figure carrying its provenance. */
export interface Tagged<T = number> {
  value: T;
  status: StatusTag;
  unit?: string;
  note?: string;
}

export const tagged = <T>(value: T, status: StatusTag, unit?: string, note?: string): Tagged<T> => ({
  value,
  status,
  unit,
  note,
});
