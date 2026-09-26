/**
 * Impact OS — time studies: shapes and the seed (Roadmap O2).
 *
 * A time study times one recipe's tasks: the task, the station, how many
 * people, the elapsed and labor minutes, whether the minutes are fixed or scale
 * per portion, and which stream the line belongs to. Each carries a quality
 * result. No wage.
 *
 * The day is two streams (Robert, 2026-09-15; scheduler build plan §0). The
 * BATCH stream is the cook — receiving, scaling, prep and cook per component,
 * chill and stage — counted per batch cooked, its per-portion lines on the
 * study's batch size. The DISPATCH stream runs first thing each delivery day
 * from staged components — assemble, seal, check, load — counted per portion
 * shipped that day, a fixed dispatch line once per delivery day. One study per
 * recipe; each line is tagged.
 */

import { timeStudy } from './plan-data';

export const QUALITY_RESULTS = ['pass', 'hold', 'fail'] as const;
export type QualityResult = (typeof QUALITY_RESULTS)[number];

export const QUALITY_RESULT_LABELS: Record<QualityResult, string> = { pass: 'Pass', hold: 'Hold', fail: 'Fail' };

export type LaborScaling = 'fixed' | 'variable';

export const TIME_STUDY_STREAMS = ['batch', 'dispatch'] as const;
export type TimeStudyStream = (typeof TIME_STUDY_STREAMS)[number];

export const TIME_STUDY_STREAM_LABELS: Record<TimeStudyStream, string> = { batch: 'Batch', dispatch: 'Dispatch' };

/**
 * A study's basis. ESTIMATED: a mock estimate per recipe step, seeded so every
 * recipe has a labor standard before any batch is timed (Robert, 2026-09-15);
 * it shows as "Estimated" until the recipe's first observed study is recorded.
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
  recipeCode: string;
  /** Null only on a study recorded without a date (the seeded estimate). */
  studiedOn: string | null;
  batchSize: number;
  observer: string | null;
  qualityResult: QualityResult | null;
  qualityNotes: string | null;
  /** ISO timestamp of the adoption; the latest adoption is the recipe's labor standard. */
  adoptedAt: string | null;
  adoptedBy: string | null;
  source: 'seed' | 'user_built';
  basis: TimeStudyBasis;
  lines: TimeStudyLine[];
}

export interface TimeStudyLibrary {
  studies: TimeStudyDoc[];
  /** Re-study interval in days, by recipe code. A recipe with none set is absent. */
  intervals: Record<string, number>;
  /** Library row id by recipe code, for recording against a recipe. */
  recipeIds: Record<string, string>;
}

export type TimeStudySeed = Pick<TimeStudyDoc, 'studiedOn' | 'batchSize' | 'observer' | 'qualityResult' | 'qualityNotes' | 'basis' | 'lines'>;

/** The recipe the plan's time study was estimated for. */
export const TIME_STUDY_SEED_RECIPE = 'AMK-E-001';

/** The dispatch-stream tasks the two retired plan lines hand their minutes to. */
export const PACK_CHECK_TASK = 'Temperature check at pack (CCP verification)';
export const LOAD_TASK = 'Load for transport';

/**
 * The plan's 14 tasks on the two streams (Robert, 2026-09-15). There is no
 * second blast chill and cold hold is a hold, not labor: those two lines leave
 * the study. Their estimated minutes carry to the dispatch tasks that take their
 * place — the temperature logging to the check at pack (per portion), the move
 * to dispatch to loading the vehicle (once per delivery day) — so the plan's
 * fixed and variable labor split is unchanged.
 */
export const PLAN_TASK_STREAMS: Record<string, { stream: TimeStudyStream; task?: string; station?: string; ccp?: string | null }> = {
  'Receiving, verification, put-away': { stream: 'batch' },
  'Dry goods scaling and mise en place': { stream: 'batch' },
  'Bean cook (soaked prior day)': { stream: 'batch' },
  'Rice cook': { stream: 'batch' },
  'Beef browning and seasoning': { stream: 'batch' },
  'Vegetable wash, trim, cut': { stream: 'batch' },
  'Vegetable roasting': { stream: 'batch' },
  'Salsa roja production': { stream: 'batch' },
  'Component blast chill and stage': { stream: 'batch' },
  'Line turnaround and sanitation': { stream: 'batch' },
  'Portion and assemble bowls': { stream: 'dispatch' },
  'Seal, label, date and lot code': { stream: 'dispatch' },
  'Final blast chill and temp logging': { stream: 'dispatch', task: PACK_CHECK_TASK, station: 'Assembly line', ccp: null },
  'Cold hold to dispatch': { stream: 'dispatch', task: LOAD_TASK, station: 'Dock', ccp: null },
};

const planStream = (task: string) => {
  const s = PLAN_TASK_STREAMS[task];
  if (!s) throw new Error(`The plan's time study task "${task}" has no stream`);
  return s;
};

/** The plan's time study as a first study: estimated, not observed — no date, observer or quality result. Batch lines first, then dispatch. */
export const timeStudySeed: TimeStudySeed = {
  studiedOn: null,
  batchSize: timeStudy.estimatedAtBatchSize,
  observer: null,
  qualityResult: null,
  qualityNotes: `The plan's time study, estimated at a ${timeStudy.estimatedAtBatchSize}-portion batch — not an observation. No study date, observer or quality result was recorded. Split into the batch and dispatch streams (2026-09-15): no second blast chill, no cold-hold line; their minutes carry to the check at pack and the vehicle load.`,
  basis: 'estimated',
  lines: TIME_STUDY_STREAMS.flatMap((stream) =>
    timeStudy.tasks
      .filter((t) => planStream(t.task).stream === stream)
      .map((t): TimeStudyLine => {
        const s = planStream(t.task);
        return {
          task: s.task ?? t.task,
          station: s.station ?? t.station,
          staff: t.staff,
          elapsedMinutes: t.elapsedMin,
          laborMinutes: t.laborMinutes,
          scalesWith: t.scalesWith,
          stream,
        };
      }),
  ),
};
