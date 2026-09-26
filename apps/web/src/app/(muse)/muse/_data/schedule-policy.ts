/**
 * Impact OS — the schedule policy: the settings the scheduler places a day
 * under (scheduler build plan §0 and §3.5). Every one is a scenario input
 * (`schedulePolicy` overlay section); nothing in the scheduler is a constant.
 */

import { tagged, type Tagged } from './tagged';

/** The order the list scheduler takes steps in when several are ready (§4.1). */
export const PRIORITY_RULES = ['earliest-due', 'longest-path', 'shortest-processing'] as const;
export type PriorityRule = (typeof PRIORITY_RULES)[number];

export const PRIORITY_RULE_LABELS: Record<PriorityRule, string> = {
  'earliest-due': 'Earliest due date',
  'longest-path': 'Longest path first',
  'shortest-processing': 'Shortest processing time',
};

/** Whether crews limit placement (scheduler build plan §0 decision 18). */
export const CREW_MODES = ['requirement', 'constrained'] as const;
export type CrewMode = (typeof CREW_MODES)[number];

export const CREW_MODE_LABELS: Record<CrewMode, string> = {
  requirement: 'Requirement — crews are checked, never limit placement',
  constrained: 'Constrained — staffed steps wait for free crew',
};

/** Which way the dispatch stream is placed against the delivery time (§0 decision 7, §3.5). */
export const DISPATCH_DIRECTIONS = ['backward', 'forward'] as const;
export type DispatchDirection = (typeof DISPATCH_DIRECTIONS)[number];

export interface SchedulePolicy {
  /** When a delivery day's meals are due; the dispatch stream schedules backward from it. */
  deliveryTimeMin: Tagged;
  /** End-of-day closedown, placed once at the close of the operating day, on no study. */
  closedownStaff: Tagged;
  closedownMinutes: Tagged;
  /** Whether a chill may complete with no crew scheduled; a plan that relies on it says so. */
  allowUnattendedChill: Tagged<boolean>;
  priorityRule: Tagged<PriorityRule>;
  crewMode: Tagged<CrewMode>;
  dispatchDirection: Tagged<DispatchDirection>;
}

const CLOSEDOWN = 'End-of-day closedown: two people for 30 minutes, placed once at the close of the operating day, on no study; it covers the end-of-day blast chiller sanitize (Robert, 2026-09-15).';

export const schedulePolicy: SchedulePolicy = {
  deliveryTimeMin: tagged(
    630,
    'PLACEHOLDER',
    'min from midnight',
    'Assumed until stated (Robert, 2026-09-15: a delivery time exists on the order, the planner and the batch paperwork, assumed until stated). 10:30 is a working figure for a school lunch delivery. A forecast default; an order carries an override once its shape is stated.',
  ),
  closedownStaff: tagged(2, 'STATED', 'people', CLOSEDOWN),
  closedownMinutes: tagged(30, 'STATED', 'min', CLOSEDOWN),
  allowUnattendedChill: tagged(false, 'STATED', undefined, 'No overnight activity other than soaking; a chill never runs into an empty building (Robert, 2026-09-15).'),
  priorityRule: tagged<PriorityRule>('earliest-due', 'PLACEHOLDER', undefined, 'No priority rule is stated; the scheduler can run each and the days compare.'),
  crewMode: tagged<CrewMode>(
    'requirement',
    'STATED',
    undefined,
    'Requirement places against the plant and reports crew gaps as findings; constrained holds staffed steps for free crew and reports what does not fit inside the day as unplaced — the shift sweep runs constrained (Robert, 2026-09-15).',
  ),
  dispatchDirection: tagged<DispatchDirection>(
    'backward',
    'STATED',
    undefined,
    'The dispatch stream schedules backward from the delivery time (Robert, 2026-09-15); forward places it first thing from opening, for comparison.',
  ),
};
