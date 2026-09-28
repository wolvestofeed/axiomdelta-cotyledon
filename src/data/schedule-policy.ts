/**
 * MicroFarm — the schedule policy: the settings the scheduler places a day
 * under (scheduler build plan §0 and §3.5). Every one is a scenario input
 * (`schedulePolicy` overlay section); nothing in the scheduler is a constant.
 */

import { tagged, type Tagged } from '@/data/tagged';

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

/** Which way the harvest stream is placed against the distribution time (§0 decision 7, §3.5). */
export const HARVEST_DIRECTIONS = ['backward', 'forward'] as const;
export type HarvestDirection = (typeof HARVEST_DIRECTIONS)[number];

export interface SchedulePolicy {
  /** When a distribution day's units are due; the harvest stream schedules backward from it. */
  distributionTimeMin: Tagged;
  /** End-of-day closedown, placed once at the close of the operating day, on no study. */
  closedownStaff: Tagged;
  closedownMinutes: Tagged;
  priorityRule: Tagged<PriorityRule>;
  crewMode: Tagged<CrewMode>;
  harvestDirection: Tagged<HarvestDirection>;
}

const CLOSEDOWN = 'End-of-day closedown: one person, Rob, for 30 minutes, placed once at the close of the operating day, on no study. Not stated; a time study replaces it.';

export const schedulePolicy: SchedulePolicy = {
  distributionTimeMin: tagged(
    630,
    'PLACEHOLDER',
    'min from midnight',
    'Assumed until stated. 10:30 is a working figure for a subscription distribution. A forecast default; an order carries an override once its shape is stated.',
  ),
  closedownStaff: tagged(1, 'PLACEHOLDER', 'people', CLOSEDOWN),
  closedownMinutes: tagged(30, 'PLACEHOLDER', 'min', CLOSEDOWN),
  priorityRule: tagged<PriorityRule>('earliest-due', 'PLACEHOLDER', undefined, 'No priority rule is stated; the scheduler can run each and the days compare.'),
  crewMode: tagged<CrewMode>(
    'requirement',
    'STATED',
    undefined,
    'Requirement places against the plant and reports crew gaps as findings; constrained holds staffed steps for free crew and reports what does not fit inside the day as unplaced — the shift sweep runs constrained.',
  ),
  harvestDirection: tagged<HarvestDirection>(
    'backward',
    'STATED',
    undefined,
    'The harvest stream schedules backward from the distribution time; forward places it first thing from opening, for comparison.',
  ),
};
