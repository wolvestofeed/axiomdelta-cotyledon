/**
 * MicroFarm — the stage schedule (outline §4, glossary tier 3).
 *
 * The process of a grow plan: soak → sow and weight → germination → blackout → light →
 * harvest window → packed. Each stage carries its watering method, its labor basis and,
 * where one exists, its control point. The DAYS of each stage are the variety's, on its
 * record; a grow plan may override them. Watering is a stage, never a line: it repeats daily
 * and changes shape across the cycle, misting from above through germination and blackout,
 * bottom watering once roots reach through the perforated tray under light. A nutrient line
 * names the stage it starts, and the watering step at that stage reads it.
 *
 * Three labor bases (outline §5 rule 3): per sowing on the sow day, per tray per day across
 * the cycle, per unit on the distribution day.
 */

import { tagged, type Tagged } from '@/data/tagged';

export type StageKey = 'soak' | 'sow' | 'germination' | 'blackout' | 'light' | 'harvest-window' | 'packed';

export type WateringMethod = 'none' | 'mist' | 'bottom' | 'rinse';

export type LaborBasis = 'sowing' | 'tray-day' | 'unit';

export type StageControlPoint = 'seed-sanitation' | 'spent-water-test' | 'temperature-humidity' | 'harvest-check';

export interface StageDef {
  key: StageKey;
  name: string;
  /** What happens to the tray at this stage, for the SOP and the Grow Room. */
  action: string;
  watering: WateringMethod;
  /** How often the watering step runs while the stage lasts; zero when no watering. */
  wateringsPerDay: number;
  laborBasis: LaborBasis;
  /** The check recorded at this stage, when one exists. */
  controlPoint: StageControlPoint | null;
  /** True when the tray is on a grow unit and counts against its capacity. */
  occupiesGrowUnit: boolean;
  /** True when the tray is under the lights and the light line's energy is metered. */
  underLight: boolean;
}

export const STAGES: readonly StageDef[] = [
  {
    key: 'soak',
    name: 'Soak',
    action: 'Large seed soaks in cold water for the variety\'s soak hours after seed sanitation. Small seed skips this stage.',
    watering: 'none',
    wateringsPerDay: 0,
    laborBasis: 'sowing',
    controlPoint: 'seed-sanitation',
    occupiesGrowUnit: false,
    underLight: false,
  },
  {
    key: 'sow',
    name: 'Sow and weight',
    action: 'Medium is filled and levelled, seed is spread at the format\'s density, and a weighted tray goes on top so roots go down and stems come up straight.',
    watering: 'mist',
    wateringsPerDay: 1,
    laborBasis: 'sowing',
    controlPoint: null,
    occupiesGrowUnit: true,
    underLight: false,
  },
  {
    key: 'germination',
    name: 'Germination',
    action: 'Weighted and covered. Misted from above; temperature and humidity logged.',
    watering: 'mist',
    wateringsPerDay: 2,
    laborBasis: 'tray-day',
    controlPoint: 'temperature-humidity',
    occupiesGrowUnit: true,
    underLight: false,
  },
  {
    key: 'blackout',
    name: 'Blackout',
    action: 'Weight off, cover on. The seedlings stretch up in the dark. Misted from above.',
    watering: 'mist',
    wateringsPerDay: 1,
    laborBasis: 'tray-day',
    controlPoint: null,
    occupiesGrowUnit: true,
    underLight: false,
  },
  {
    key: 'light',
    name: 'Light',
    action: 'Cover off, under the grow lights on the plan\'s light line. Bottom watered once roots reach through the perforated tray; the nutrient line that starts here goes in the water.',
    watering: 'bottom',
    wateringsPerDay: 1,
    laborBasis: 'tray-day',
    controlPoint: 'temperature-humidity',
    occupiesGrowUnit: true,
    underLight: true,
  },
  {
    key: 'harvest-window',
    name: 'Harvest window',
    action: 'Cotyledons full, first true leaves showing. A live tray is distributed in this window; cut greens are harvested from it.',
    watering: 'bottom',
    wateringsPerDay: 1,
    laborBasis: 'tray-day',
    controlPoint: 'harvest-check',
    occupiesGrowUnit: true,
    underLight: true,
  },
  {
    key: 'packed',
    name: 'Packed',
    action: 'The unit leaves the grow unit: a live tray with its care insert, a jar, or cut greens weighed into their pack.',
    watering: 'none',
    wateringsPerDay: 0,
    laborBasis: 'unit',
    controlPoint: null,
    occupiesGrowUnit: false,
    underLight: false,
  },
];

/** Sprouts in jars run a shorter schedule: soak, rinse cycles in the dark, packed. */
export const SPROUT_STAGES: readonly StageDef[] = [
  STAGES[0]!,
  {
    key: 'germination',
    name: 'Rinse and drain',
    action: 'Jar inverted on its stand in the dark, rinsed and drained two to three times a day. Spent rinse water is tested on the schedule the produce safety plan sets.',
    watering: 'rinse',
    wateringsPerDay: 3,
    laborBasis: 'tray-day',
    controlPoint: 'spent-water-test',
    occupiesGrowUnit: true,
    underLight: false,
  },
  {
    ...STAGES[5]!,
    action: 'Sprouts at full length, drained on the stand. A jar is distributed in this window once its spent-water test is negative.',
    watering: 'rinse',
  },
  STAGES[6]!,
];

export const STAGE_BY_KEY: Readonly<Record<StageKey, StageDef>> = Object.fromEntries(STAGES.map((s) => [s.key, s])) as Record<StageKey, StageDef>;

/**
 * Liters of water one 1020 tray takes per watering, by method. The nutrient line's volume over the
 * cycle is the sum of waterings from the stage it starts. No volume has been observed; a
 * watering log replaces these.
 */
export const WATER_PER_WATERING_L: Readonly<Record<WateringMethod, Tagged>> = {
  none: tagged(0, 'STATED', 'L', 'No watering'),
  mist: tagged(0.1, 'PLACEHOLDER', 'L', 'A misting pass over one 1020; no volume observed'),
  bottom: tagged(0.5, 'PLACEHOLDER', 'L', 'Bottom watering one 1020 in its solid tray; no volume observed'),
  rinse: tagged(0.5, 'PLACEHOLDER', 'L', 'One rinse of a pint jar; no volume observed'),
};

/** Days per stage for one variety, in stage order. Stages a variety skips carry zero. */
export type StageDays = Readonly<Record<Exclude<StageKey, 'packed'>, number>>;

/** Total days a tray occupies a grow unit: sow day through the end of the harvest window. */
export function cycleDays(days: StageDays): number {
  return days.sow + days.germination + days.blackout + days.light + days['harvest-window'];
}

/** Days from sowing until the first day a unit can be distributed. */
export function daysToHarvest(days: StageDays): number {
  return days.sow + days.germination + days.blackout + days.light;
}

/** Waterings a tray takes over its cycle, by method; the daily stream's count. */
export function wateringsOverCycle(days: StageDays, stages: readonly StageDef[] = STAGES): Record<WateringMethod, number> {
  const out: Record<WateringMethod, number> = { none: 0, mist: 0, bottom: 0, rinse: 0 };
  for (const s of stages) {
    if (s.key === 'packed') continue;
    out[s.watering] += s.wateringsPerDay * days[s.key];
  }
  return out;
}

/** The stages from `from` onward, in order, excluding `packed`; the span a nutrient or light line covers. */
export function stagesFrom(from: StageKey, stages: readonly StageDef[] = STAGES): StageDef[] {
  const i = stages.findIndex((s) => s.key === from);
  return (i < 0 ? [] : stages.slice(i)).filter((s) => s.key !== 'packed');
}

/** Liters of water one 1020 tray takes from a stage onward: waterings per day, days, liters per watering. */
export function waterLitersFrom(from: StageKey, days: StageDays, stages: readonly StageDef[] = STAGES): number {
  return stagesFrom(from, stages).reduce((sum, s) => sum + s.wateringsPerDay * days[s.key as Exclude<StageKey, 'packed'>] * WATER_PER_WATERING_L[s.watering].value, 0);
}

/** Days a tray is under the lights from a stage onward. */
export function lightDaysFrom(from: StageKey, days: StageDays, stages: readonly StageDef[] = STAGES): number {
  return stagesFrom(from, stages).reduce((sum, s) => sum + (s.underLight ? days[s.key as Exclude<StageKey, 'packed'>] : 0), 0);
}
