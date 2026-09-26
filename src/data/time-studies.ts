/**
 * MicroFarm — time studies: shapes and the seed (Roadmap O2).
 *
 * A time study times one crop plan's tasks: the task, the station, how many
 * people, the elapsed and labor minutes, whether the minutes are fixed or scale
 * per unit, and which stream the line belongs to. Each carries a quality
 * result. No wage.
 *
 * Labor runs on three streams (outline §5 rule 3). The SOWING stream is the sow day: seed
 * sanitation and soak, prep, sow and weight, counted per sowing, its per-unit lines on the study's
 * sowing size. The DAILY stream is every day a tray is on its grow unit: misting, bottom watering,
 * nutrient preparation, inspection, counted per tray per day across the plan's cycle days; a daily
 * line's labor minutes are one day's minutes for the sowing studied, a fixed daily line once a day.
 * The HARVEST stream is the distribution day: harvest, pack and hand-off, counted per unit shipped
 * that day, a fixed harvest line once per distribution day. One study per plan; each line is tagged.
 * The two-stream Phase 1-era studies carry zero cycle days and no daily line.
 */


export const QUALITY_RESULTS = ['pass', 'hold', 'fail'] as const;
export type QualityResult = (typeof QUALITY_RESULTS)[number];

export const QUALITY_RESULT_LABELS: Record<QualityResult, string> = { pass: 'Pass', hold: 'Hold', fail: 'Fail' };

export type LaborScaling = 'fixed' | 'variable';

export const TIME_STUDY_STREAMS = ['sowing', 'daily', 'harvest'] as const;
export type TimeStudyStream = (typeof TIME_STUDY_STREAMS)[number];

export const TIME_STUDY_STREAM_LABELS: Record<TimeStudyStream, string> = { sowing: 'Sowing', daily: 'Daily', harvest: 'Harvest' };

/**
 * A study's basis. ESTIMATED: a mock estimate per crop plan step, seeded so every
 * crop plan has a labor standard before any sowing is timed;
 * it shows as "Estimated" until the crop plan's first observed study is recorded.
 * OBSERVED: timed on the floor, with a study date, an observer and a quality result.
 */
export type TimeStudyBasis = 'estimated' | 'observed';

export const TIME_STUDY_BASIS_LABELS: Record<TimeStudyBasis, string> = { estimated: 'Estimated', observed: 'Observed' };

export interface TimeStudyLine {
  task: string;
  station: string | null;
  staff: number;
  elapsedMinutes: number;
  laborMinutes: number;
  scalesWith: LaborScaling;
  stream: TimeStudyStream;
}

export interface TimeStudyDoc {
  id: string;
  cropPlanCode: string;
  /** Null only on a study recorded without a date (the seeded estimate). */
  studiedOn: string | null;
  sowingSize: number;
  /** Days a tray of the sowing studied was on its grow unit: what the daily lines multiply by. Zero on a study with no daily stream. */
  cycleDays: number;
  observer: string | null;
  qualityResult: QualityResult | null;
  qualityNotes: string | null;
  /** ISO timestamp of the adoption; the latest adoption is the crop plan's labor standard. */
  adoptedAt: string | null;
  adoptedBy: string | null;
  source: 'seed' | 'user_built';
  basis: TimeStudyBasis;
  lines: TimeStudyLine[];
}

export interface TimeStudyLibrary {
  studies: TimeStudyDoc[];
  /** Re-study interval in days, by crop plan code. A crop plan with none set is absent. */
  intervals: Record<string, number>;
  /** Library row id by crop plan code, for recording against a crop plan. */
  cropPlanIds: Record<string, string>;
}

export type TimeStudySeed = Pick<TimeStudyDoc, 'studiedOn' | 'sowingSize' | 'cycleDays' | 'observer' | 'qualityResult' | 'qualityNotes' | 'basis' | 'lines'>;

/** The stage span a daily task covers on Vallecito's sheet; `cycle` is every day the tray is on the shelf. */
export type DailySpan = 'germination' | 'blackout' | 'light' | 'cycle';

export interface TrayStudyTask {
  task: string;
  station: string;
  /** Minutes per 1020 tray as Vallecito recorded them; for a daily task, the total over its span. */
  minutes: number;
}

/**
 * Vallecito's 2023 time study of one 1020 tray through its grow cycle (DATED): 18 minutes of
 * growing labor and 9 of harvest, 27 in all, at one person. The sheet allocates every task per
 * tray, receiving included, and states each daily task as its total over the cycle; the estimate
 * spreads a daily total over the plan's cycle days. The knife harvest and the weigh are cut-tray
 * tasks a live tray does not get. `_engine/time-study-estimate.ts` builds each plan's estimated
 * study from this.
 */
export const VALLECITO_1020_STUDY = {
  source: 'Vallecito Micro Farm 2023 time study, 1020 tray grow cycle',
  wagePerHour: 20,
  sowing: [
    { task: 'Supplies transfer and receiving in', station: 'Prep station', minutes: 1 },
    { task: 'Receiving and sorting seed', station: 'Prep station', minutes: 1 },
    { task: 'Prep station', station: 'Prep station', minutes: 1 },
    { task: 'Prep trays', station: 'Prep station', minutes: 1 },
    { task: 'Sow trays', station: 'Prep station', minutes: 3 },
  ] as readonly TrayStudyTask[],
  daily: [
    { task: 'Germination watering', station: 'Grow rack', minutes: 1, span: 'germination' },
    { task: 'Blackout watering', station: 'Grow rack', minutes: 1, span: 'blackout' },
    { task: 'Watering under lights', station: 'Grow rack', minutes: 3, span: 'light' },
    { task: 'Nutrient preparation', station: 'Prep station', minutes: 1, span: 'light' },
    { task: 'Inspection and sanitization', station: 'Grow rack', minutes: 5, span: 'cycle' },
  ] as readonly (TrayStudyTask & { span: DailySpan })[],
  harvest: [
    { task: 'Prep harvest station', station: 'Harvest station', minutes: 1, cutOnly: false },
    { task: 'Harvest tray with knife', station: 'Harvest station', minutes: 5, cutOnly: true },
    { task: 'Weigh harvest', station: 'Harvest station', minutes: 1, cutOnly: true },
    { task: 'Packaging and labels', station: 'Harvest station', minutes: 1, cutOnly: false },
    { task: 'Clean station', station: 'Harvest station', minutes: 1, cutOnly: false },
  ] as readonly (TrayStudyTask & { cutOnly: boolean })[],
} as const;
