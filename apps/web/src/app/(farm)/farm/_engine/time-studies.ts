/**
 * MicroFarm — time studies (Roadmap O2). Pure.
 *
 * Labor is fixed per sowing, plus variable per tray per day, plus variable per unit, on three
 * streams (outline §5 rule 3). A study's fixed minutes are its fixed sowing and harvest lines; its
 * variable minutes per unit are its variable sowing and harvest lines over the sowing size it was
 * timed at; its daily minutes are its daily lines, one day's minutes for the sowing studied, over
 * the cycle days it was timed at. The latest adopted study is the plan's labor standard. No wage.
 */

import type { QualityResult, TimeStudyDoc, TimeStudyLine } from '../_data/time-studies';
import { isoAddDays } from './orders';
import { daysBetween } from './working-capital';

export interface StudySummary {
  /** Every minute of the sowing studied: sowing and harvest lines, plus the daily lines over the cycle. */
  laborMinutes: number;
  fixedMinutesPerSowing: number;
  variableMinutes: number;
  variableMinutesPerUnit: number;
  /** Per tray per day on the variable daily lines. */
  dailyMinutesPerTrayDay: number;
  /** Once a day on the fixed daily lines. */
  dailyFixedMinutesPerDay: number;
  /** The daily lines over the cycle days, at the sowing studied. */
  dailyLaborMinutes: number;
  /** The daily stream's share of one unit: the daily lines over the cycle, over the sowing. */
  dailyMinutesPerUnit: number;
  cycleDays: number;
  laborMinutesPerUnit: number;
  /** Labor minutes on the sowing-stream lines, at the sowing studied. */
  sowingLaborMinutes: number;
  /** Labor minutes on the harvest-stream lines, at the sowing studied. */
  harvestLaborMinutes: number;
  /** The most people any one task needs. */
  peakStaff: number;
}

export function summarizeStudy(s: Pick<TimeStudyDoc, 'sowingSize' | 'lines'> & Partial<Pick<TimeStudyDoc, 'cycleDays'>>): StudySummary {
  const sum = (lines: readonly TimeStudyLine[]) => lines.reduce((t, l) => t + l.laborMinutes, 0);
  const cycleDays = s.cycleDays ?? 0;
  const daily = s.lines.filter((l) => l.stream === 'daily');
  const rest = s.lines.filter((l) => l.stream !== 'daily');
  const fixed = sum(rest.filter((l) => l.scalesWith === 'fixed'));
  const variable = sum(rest.filter((l) => l.scalesWith === 'variable'));
  const dailyVariable = sum(daily.filter((l) => l.scalesWith === 'variable'));
  const dailyFixed = sum(daily.filter((l) => l.scalesWith === 'fixed'));
  const dailyLaborMinutes = (dailyVariable + dailyFixed) * cycleDays;
  const laborMinutes = fixed + variable + dailyLaborMinutes;
  return {
    sowingLaborMinutes: sum(s.lines.filter((l) => l.stream === 'sowing')),
    harvestLaborMinutes: sum(s.lines.filter((l) => l.stream === 'harvest')),
    laborMinutes,
    fixedMinutesPerSowing: fixed,
    variableMinutes: variable,
    variableMinutesPerUnit: s.sowingSize > 0 ? variable / s.sowingSize : 0,
    dailyMinutesPerTrayDay: s.sowingSize > 0 ? dailyVariable / s.sowingSize : 0,
    dailyFixedMinutesPerDay: dailyFixed,
    dailyLaborMinutes,
    dailyMinutesPerUnit: s.sowingSize > 0 ? dailyLaborMinutes / s.sowingSize : 0,
    cycleDays,
    laborMinutesPerUnit: s.sowingSize > 0 ? laborMinutes / s.sowingSize : 0,
    peakStaff: s.lines.reduce((m, l) => Math.max(m, l.staff), 0),
  };
}

/** Labor minutes for one sowing of `units`: fixed per sowing, plus variable per unit, plus the daily stream over the cycle. */
export const laborMinutesForSowing = (
  s: Pick<StudySummary, 'fixedMinutesPerSowing' | 'variableMinutesPerUnit'> & Partial<Pick<StudySummary, 'dailyMinutesPerTrayDay' | 'dailyFixedMinutesPerDay' | 'cycleDays'>>,
  units: number,
): number => s.fixedMinutesPerSowing + s.variableMinutesPerUnit * units + ((s.dailyFixedMinutesPerDay ?? 0) + (s.dailyMinutesPerTrayDay ?? 0) * units) * (s.cycleDays ?? 0);

/** A crop plan's studies, newest first; undated studies last. */
export function studiesForCropPlan(studies: readonly TimeStudyDoc[], cropPlanCode: string): TimeStudyDoc[] {
  return studies
    .filter((s) => s.cropPlanCode === cropPlanCode)
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
 * The crop plan's labor standard: the study adopted most recently; with none
 * adopted, the crop plan's estimated study stands in. An
 * observed study that has not been adopted is not the standard — adoption is an
 * admin's entry on the posting trail.
 */
export function laborStandard(studies: readonly TimeStudyDoc[]): TimeStudyDoc | null {
  return adoptedStudy(studies) ?? studies.find((s) => s.basis === 'estimated') ?? null;
}

/** True while the crop plan runs on an estimate: no observed study has been adopted. */
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
  sowingSize: number;
  cycleDays?: number | null;
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

export function timeStudyFromRows(cropPlanCode: string, r: TimeStudyRowShape, lines: readonly TimeStudyLineRowShape[]): TimeStudyDoc {
  return {
    id: r.id,
    cropPlanCode,
    studiedOn: r.studiedOn === null ? null : typeof r.studiedOn === 'string' ? r.studiedOn : r.studiedOn.toISOString().slice(0, 10),
    sowingSize: r.sowingSize,
    cycleDays: r.cycleDays ?? 0,
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
      stream: l.stream === 'harvest' ? 'harvest' : l.stream === 'daily' ? 'daily' : 'sowing',
    })),
  };
}
