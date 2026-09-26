/**
 * Impact OS — time studies (Roadmap O2). Pure.
 *
 * Labor is fixed per batch plus variable per portion (docs/muse/CLAUDE.md §2
 * rule 2). A study's fixed minutes are its fixed task lines; its variable minutes
 * per portion are its variable task lines over the batch size it was timed at.
 * The latest adopted study is the recipe's labor standard. No wage or pay.
 */

import type { QualityResult, TimeStudyDoc, TimeStudyLine } from '../_data/time-studies';
import { isoAddDays } from './orders';
import { daysBetween } from './working-capital';

export interface StudySummary {
  laborMinutes: number;
  fixedMinutesPerBatch: number;
  variableMinutes: number;
  variableMinutesPerPortion: number;
  laborMinutesPerPortion: number;
  /** Labor minutes on the batch-stream lines, at the batch studied. */
  batchLaborMinutes: number;
  /** Labor minutes on the dispatch-stream lines, at the batch studied. */
  dispatchLaborMinutes: number;
  /** The most people any one task needs. */
  peakStaff: number;
}

export function summarizeStudy(s: Pick<TimeStudyDoc, 'batchSize' | 'lines'>): StudySummary {
  const sum = (lines: readonly TimeStudyLine[]) => lines.reduce((t, l) => t + l.laborMinutes, 0);
  const fixed = sum(s.lines.filter((l) => l.scalesWith === 'fixed'));
  const variable = sum(s.lines.filter((l) => l.scalesWith === 'variable'));
  return {
    batchLaborMinutes: sum(s.lines.filter((l) => l.stream !== 'dispatch')),
    dispatchLaborMinutes: sum(s.lines.filter((l) => l.stream === 'dispatch')),
    laborMinutes: fixed + variable,
    fixedMinutesPerBatch: fixed,
    variableMinutes: variable,
    variableMinutesPerPortion: s.batchSize > 0 ? variable / s.batchSize : 0,
    laborMinutesPerPortion: s.batchSize > 0 ? (fixed + variable) / s.batchSize : 0,
    peakStaff: s.lines.reduce((m, l) => Math.max(m, l.staff), 0),
  };
}

/** Labor minutes for one batch of `portions`: fixed per batch plus variable per portion. */
export const laborMinutesForBatch = (s: Pick<StudySummary, 'fixedMinutesPerBatch' | 'variableMinutesPerPortion'>, portions: number): number =>
  s.fixedMinutesPerBatch + s.variableMinutesPerPortion * portions;

/** A recipe's studies, newest first; undated studies last. */
export function studiesForRecipe(studies: readonly TimeStudyDoc[], recipeCode: string): TimeStudyDoc[] {
  return studies
    .filter((s) => s.recipeCode === recipeCode)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const x = a.s.studiedOn;
      const y = b.s.studiedOn;
      if (x === null || y === null) return x === y ? b.i - a.i : x === null ? 1 : -1;
      return y.localeCompare(x) || b.i - a.i;
    })
    .map((e) => e.s);
}

/** The study adopted most recently, or null. */
export function adoptedStudy(studies: readonly TimeStudyDoc[]): TimeStudyDoc | null {
  let best: TimeStudyDoc | null = null;
  for (const s of studies) if (s.adoptedAt && (!best || s.adoptedAt > best.adoptedAt!)) best = s;
  return best;
}

/**
 * The recipe's labor standard: the study adopted most recently; with none
 * adopted, the recipe's estimated study stands in (Robert, 2026-09-15: the
 * estimate shows as "Estimated" until the first observed study is entered). An
 * observed study that has not been adopted is not the standard — adoption is an
 * admin's entry on the posting trail.
 */
export function laborStandard(studies: readonly TimeStudyDoc[]): TimeStudyDoc | null {
  return adoptedStudy(studies) ?? studies.find((s) => s.basis === 'estimated') ?? null;
}

/** True while the recipe runs on an estimate: no observed study has been adopted. */
export const standardIsEstimated = (standard: TimeStudyDoc | null): boolean => standard !== null && standard.basis === 'estimated';

export interface TrendPoint {
  id: string;
  date: string;
  value: number;
}

/** One point per dated study, oldest first. */
export function studyTrend(studies: readonly TimeStudyDoc[], pick: (s: TimeStudyDoc) => number): TrendPoint[] {
  return studies
    .filter((s): s is TimeStudyDoc & { studiedOn: string } => s.studiedOn !== null)
    .sort((a, b) => a.studiedOn.localeCompare(b.studiedOn))
    .map((s) => ({ id: s.id, date: s.studiedOn, value: pick(s) }));
}

export interface StudyDue {
  lastStudiedOn: string | null;
  intervalDays: number | null;
  dueOn: string | null;
  /** Days from `today` to the due date; negative once past. */
  daysUntilDue: number | null;
}

/** When the next study is due: the last dated study plus the re-study interval. */
export function nextStudyDue(studies: readonly TimeStudyDoc[], intervalDays: number | null | undefined, today: string): StudyDue {
  const lastStudiedOn = studies.reduce<string | null>((m, s) => (s.studiedOn !== null && (m === null || s.studiedOn > m) ? s.studiedOn : m), null);
  const interval = intervalDays && intervalDays > 0 ? intervalDays : null;
  if (interval === null || lastStudiedOn === null) return { lastStudiedOn, intervalDays: interval, dueOn: null, daysUntilDue: null };
  const dueOn = isoAddDays(lastStudiedOn, interval);
  return { lastStudiedOn, intervalDays: interval, dueOn, daysUntilDue: daysBetween(today, dueOn) };
}

/** The columns the read layer maps into a study. */
export interface TimeStudyRowShape {
  id: string;
  studiedOn: string | Date | null;
  batchSize: number;
  observer: string | null;
  qualityResult: string | null;
  qualityNotes: string | null;
  adoptedAt: Date | null;
  adoptedBy: string | null;
  source: string;
  basis: string;
}

export interface TimeStudyLineRowShape {
  task: string;
  station: string | null;
  staff: number;
  elapsedMinutes: number;
  laborMinutes: number;
  scalesWith: string;
  stream: string;
}

const isQuality = (v: string | null): v is QualityResult => v === 'pass' || v === 'hold' || v === 'fail';

export function timeStudyFromRows(recipeCode: string, r: TimeStudyRowShape, lines: readonly TimeStudyLineRowShape[]): TimeStudyDoc {
  return {
    id: r.id,
    recipeCode,
    studiedOn: r.studiedOn === null ? null : typeof r.studiedOn === 'string' ? r.studiedOn : r.studiedOn.toISOString().slice(0, 10),
    batchSize: r.batchSize,
    observer: r.observer,
    qualityResult: isQuality(r.qualityResult) ? r.qualityResult : null,
    qualityNotes: r.qualityNotes,
    adoptedAt: r.adoptedAt ? r.adoptedAt.toISOString() : null,
    adoptedBy: r.adoptedBy,
    source: r.source === 'seed' ? 'seed' : 'user_built',
    basis: r.basis === 'estimated' ? 'estimated' : 'observed',
    lines: lines.map((l) => ({
      task: l.task,
      station: l.station,
      staff: l.staff,
      elapsedMinutes: l.elapsedMinutes,
      laborMinutes: l.laborMinutes,
      scalesWith: l.scalesWith === 'fixed' ? 'fixed' : 'variable',
      stream: l.stream === 'dispatch' ? 'dispatch' : 'batch',
    })),
  };
}
