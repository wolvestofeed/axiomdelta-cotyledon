/**
 * MicroFarm — the crew register: a PROPOSED staffing answer.
 *
 * No staff count, crew split or shift pattern has been decided; the platform
 * exists to work it out. So the register is not an input to anything physical.
 * The plant's capacity comes off its equipment, process minutes and operating
 * window (`_engine/index.ts`); the production plan emits a labor requirement —
 * staff-hours by clock interval and the headcount each task needs at the same
 * moment (`_engine/staffing.ts`); and the crews entered here are checked
 * against that requirement. A gap is a finding on the schedule ("a person is
 * needed at the rack at 18:45 and no crew is scheduled then"), never a
 * reason to shrink the ceiling.
 *
 * The seed is empty: no crew is proposed until someone enters one. The scenario
 * overlay (`crews` section) adds, edits and removes crews.
 */

import { tagged, type Tagged } from '@/data/tagged';

export interface CrewShift {
  id: string;
  label: string;
  /** Minutes from midnight. */
  startMin: Tagged;
  endMin: Tagged;
  headcount: Tagged;
  /** Resource or step ids this crew is qualified for; empty = any. Consumed by the scheduler. */
  canStaff?: string[];
  dayPattern: 'weekday' | 'termday' | 'all' | string[];
  /** What the crew is drawn around — display text, not a constraint. */
  focus?: string;
}

/** No crew is proposed in the seed. */
export const crews: CrewShift[] = [];

/**
 * The two-shift pattern the register used to seed (05:00–13:30 and
 * 09:30–18:00, six people each). Every value was invented and it was tagged
 * STATED, which it never was. Kept only so a scenario saved before 2026-09-14
 * that edited `shift-1` or `shift-2` still resolves to what its author saw —
 * as a PLACEHOLDER proposal, not a fact.
 */
export const LEGACY_SEED_CREWS: Record<string, { label: string; startMin: number; endMin: number; headcount: number; focus: string }> = {
  'shift-1': { label: 'Shift 1 — early', startMin: 300, endMin: 810, headcount: 6, focus: 'Harvest, receiving, bulk sow. Loads the blackout rack.' },
  'shift-2': { label: 'Shift 2 — late', startMin: 570, endMin: 1080, headcount: 6, focus: 'Unit, assemble, seal, label. Verifies control-point-2. Owns sanitation and closedown.' },
};

export interface CrewValues {
  label?: string;
  startMin?: number;
  endMin?: number;
  headcount?: number;
}

/** Starting values for a crew added in a scenario: supplied by the caller from the operating window and the labor requirement. */
export interface NewCrewDefaults {
  startMin: number;
  endMin: number;
  headcount: number;
}

/** A crew typed in a scenario. Every value is the operator's own input. */
export function newCrew(id: string, o: CrewValues, defaults: NewCrewDefaults): CrewShift {
  const note = 'Proposed in this forecast';
  return {
    id,
    label: o.label ?? 'Proposed crew',
    startMin: tagged(o.startMin ?? defaults.startMin, 'STATED', 'min from midnight', note),
    endMin: tagged(o.endMin ?? defaults.endMin, 'STATED', 'min from midnight', note),
    headcount: tagged(o.headcount ?? defaults.headcount, 'STATED', 'people', note),
    dayPattern: 'all',
  };
}

/** A saved edit to one of the retired seed crews, resolved onto its invented values. */
export function legacyCrew(id: string, o: CrewValues): CrewShift {
  const seed = LEGACY_SEED_CREWS[id];
  const note = 'Invented seed pattern retired 2026-09-14; kept because a saved forecast edits it';
  return {
    id,
    label: o.label ?? seed.label,
    startMin: tagged(o.startMin ?? seed.startMin, 'PLACEHOLDER', 'min from midnight', note),
    endMin: tagged(o.endMin ?? seed.endMin, 'PLACEHOLDER', 'min from midnight', note),
    headcount: tagged(o.headcount ?? seed.headcount, 'PLACEHOLDER', 'people', note),
    dayPattern: 'all',
    focus: seed.focus,
  };
}

/** "HH:MM" from minutes after midnight. */
export const clock = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
