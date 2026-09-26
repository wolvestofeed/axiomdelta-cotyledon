/**
 * MicroFarm — time studies (Roadmap O2). Pure.
 *
 * Labor is fixed per sowing, plus variable per tray per day, plus variable per unit, on three
 * streams (outline §5 rule 3). A study's fixed minutes are its fixed sowing and harvest lines; its
 * variable minutes per unit are its variable sowing and harvest lines over the sowing size it was
 * timed at; its daily minutes are its daily lines, one day's minutes for the sowing studied, over
 * the cycle days it was timed at. Every observed study is approved by an admin; the plan's labor
 * standard is the average of its approved studies, weighted by the trays each studied, and its
 * measured water and supplements are averaged the same way. Until the first approval the
 * estimated study stands in. No wage.
 */

import { NO_CONSUMPTION, type MeasuredConsumption, type QualityResult, type StudyConsumption, type SupplementEntry, type TimeStudyDoc, type TimeStudyLine, type WaterEntry } from '@/data/time-studies';
import { isoAddDays } from '@/engine/orders';
import type { StageDays, StageDef } from '@/data/stage-schedule';
import { daysBetween } from '@/engine/working-capital';

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

/** The observed studies an admin has approved, oldest approval first. */
export function approvedStudies(studies: readonly TimeStudyDoc[]): TimeStudyDoc[] {
  return studies.filter((s) => s.basis === 'observed' && s.approvedAt !== null).sort((a, b) => a.approvedAt!.localeCompare(b.approvedAt!));
}

const lineKey = (l: Pick<TimeStudyLine, 'stream' | 'scalesWith' | 'task'>) => `${l.stream}|${l.scalesWith}|${l.task.trim().toLowerCase()}`;

/**
 * Two or more approved studies as one study: the plan's labor standard. Each task (by stream, scaling
 * and name) is averaged weighted by the trays each study timed, a study without the task counting
 * zero for it, so the totals are the tray-weighted averages of the studies' totals. A fixed line is
 * per sowing (per day on the daily stream); a variable line is a rate per tray (per tray per day on
 * the daily stream, weighted by tray-days) written back at the latest study's sowing; the cycle is
 * the tray-weighted average. A task takes the most people any study gave it and the latest study's
 * station. The averaged study is never stored; `averageOf` names the studies behind it.
 */
export function averageStudies(approved: readonly TimeStudyDoc[]): TimeStudyDoc {
  const latest = approved[approved.length - 1]!;
  const trays = approved.reduce((t, s) => t + s.sowingSize, 0);
  const trayDays = approved.reduce((t, s) => t + s.sowingSize * s.cycleDays, 0);
  const size = latest.sowingSize;
  const order: string[] = [];
  const first = new Map<string, TimeStudyLine>();
  for (const s of [...approved].reverse()) for (const l of s.lines) {
    const k = lineKey(l);
    if (!first.has(k)) {
      first.set(k, l);
      order.push(k);
    }
  }
  const lines: TimeStudyLine[] = order.map((k) => {
    const ref = first.get(k)!;
    let labor = 0;
    let elapsed = 0;
    let staff = 0;
    for (const s of approved) {
      const own = s.lines.filter((l) => lineKey(l) === k);
      if (own.length === 0) continue;
      const lab = own.reduce((t, l) => t + l.laborMinutes, 0);
      const ela = own.reduce((t, l) => t + l.elapsedMinutes, 0);
      staff = Math.max(staff, ...own.map((l) => l.staff));
      if (ref.scalesWith === 'fixed') {
        labor += (lab * s.sowingSize) / trays;
        elapsed += (ela * s.sowingSize) / trays;
      } else if (ref.stream === 'daily') {
        labor += trayDays > 0 ? (lab * s.cycleDays) / trayDays : 0;
        elapsed += trayDays > 0 ? (ela * s.cycleDays) / trayDays : 0;
      } else {
        labor += lab / trays;
        elapsed += ela / trays;
      }
    }
    const perSowing = ref.scalesWith === 'fixed' ? 1 : size;
    return { task: ref.task, station: ref.station, staff, elapsedMinutes: elapsed * perSowing, laborMinutes: labor * perSowing, scalesWith: ref.scalesWith, stream: ref.stream };
  });
  return {
    id: `average:${latest.cropPlanCode}`,
    cropPlanCode: latest.cropPlanCode,
    studiedOn: approved.reduce<string | null>((m, s) => (s.studiedOn !== null && (m === null || s.studiedOn > m) ? s.studiedOn : m), null),
    sowingSize: size,
    cycleDays: trays > 0 ? trayDays / trays : 0,
    observer: null,
    qualityResult: null,
    qualityNotes: null,
    approvedAt: latest.approvedAt,
    approvedBy: null,
    source: 'user_built',
    basis: 'observed',
    lines,
    consumption: NO_CONSUMPTION,
    averageOf: approved.map((s) => s.id),
  };
}

/**
 * The crop plan's labor standard: its approved studies averaged (the one study itself when one is
 * approved); with none approved, the estimated study stands in. A study not yet approved is not in
 * the standard; the approval is an admin's entry on the posting trail.
 */
export function laborStandard(studies: readonly TimeStudyDoc[]): TimeStudyDoc | null {
  const approved = approvedStudies(studies);
  if (approved.length === 1) return approved[0]!;
  if (approved.length > 1) return averageStudies(approved);
  return studies.find((s) => s.basis === 'estimated') ?? null;
}

/** True while the crop plan runs on an estimate: no observed study has been approved. */
export const standardIsEstimated = (standard: TimeStudyDoc | null): boolean => standard !== null && standard.basis === 'estimated';

/** True when a study is in the plan's standard: approved, or the standard itself. */
export const inStandard = (s: TimeStudyDoc, standard: TimeStudyDoc | null): boolean =>
  standard !== null && (standard.id === s.id || (standard.averageOf ?? []).includes(s.id));

const hasConsumption = (c: StudyConsumption) => c.water.length > 0 || c.supplements.length > 0;

/** A study's water in fluid ounces over its sowing: ounces per tray per watering × waterings × trays, over every entry. */
export const studyWaterOz = (c: Pick<StudyConsumption, 'water'>): number => c.water.reduce((t, w) => t + w.ozPerWatering * w.waterings * w.trays, 0);

/** A study's supplements in ml over its sowing, by key. */
export function studySupplementMl(c: Pick<StudyConsumption, 'supplements'>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of c.supplements) out[e.nutrientKey] = (out[e.nutrientKey] ?? 0) + e.ml;
  return out;
}

/**
 * What a plan's approved studies measured, or null when none recorded any water or supplement.
 * Water per tray and ml per tray are each study's total over its sowing, averaged weighted by the
 * trays studied; a study that recorded consumption but not a given supplement counts zero for it.
 * Ounces per watering by method are over every watering recorded, weighted by trays watered.
 */
export function measuredConsumption(studies: readonly TimeStudyDoc[]): MeasuredConsumption | null {
  const withUse = approvedStudies(studies).filter((s) => hasConsumption(s.consumption) && s.sowingSize > 0);
  if (withUse.length === 0) return null;
  const trays = withUse.reduce((t, s) => t + s.sowingSize, 0);
  const watered = withUse.filter((s) => s.consumption.water.length > 0);
  const wateredTrays = watered.reduce((t, s) => t + s.sowingSize, 0);
  const byMethod: Record<string, { oz: number; trayWaterings: number }> = {};
  for (const s of watered) for (const w of s.consumption.water) {
    const m = (byMethod[w.method] ??= { oz: 0, trayWaterings: 0 });
    m.oz += w.ozPerWatering * w.waterings * w.trays;
    m.trayWaterings += w.waterings * w.trays;
  }
  const ozPerWatering: MeasuredConsumption['ozPerWatering'] = {};
  for (const [method, m] of Object.entries(byMethod)) if (m.trayWaterings > 0) ozPerWatering[method as keyof typeof ozPerWatering] = m.oz / m.trayWaterings;
  const mlPerTray: Record<string, number> = {};
  for (const s of withUse) for (const [key, ml] of Object.entries(studySupplementMl(s.consumption))) mlPerTray[key] = (mlPerTray[key] ?? 0) + ml / trays;
  return {
    studies: withUse.length,
    trays,
    ozPerWatering,
    waterOzPerTray: wateredTrays > 0 ? watered.reduce((t, s) => t + studyWaterOz(s.consumption), 0) / wateredTrays : null,
    mlPerTray,
    approvedThrough: withUse.reduce((m, s) => (s.approvedAt! > m ? s.approvedAt! : m), '').slice(0, 10),
  };
}

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
  approvedAt: Date | null;
  approvedBy: string | null;
  source: string;
  basis: string;
  consumption?: unknown;
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
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
    approvedBy: r.approvedBy,
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
    consumption: consumptionFrom(r.consumption),
  };
}

const STAGE_KEYS = new Set(['soak', 'sow', 'germination', 'blackout', 'light', 'harvest-window', 'packed']);
const METHODS = new Set(['mist', 'bottom', 'rinse']);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** A stored consumption document; an entry that does not read as one is dropped rather than guessed at. */
export function consumptionFrom(raw: unknown): StudyConsumption {
  if (typeof raw !== 'object' || raw === null) return NO_CONSUMPTION;
  const r = raw as { water?: unknown; supplements?: unknown };
  const water = (Array.isArray(r.water) ? r.water : []).filter((e): e is WaterEntry => {
    const w = e as Partial<WaterEntry>;
    return typeof e === 'object' && e !== null && isDay(w.day) && STAGE_KEYS.has(w.stage as string) && METHODS.has(w.method as string) && finite(w.ozPerWatering) && finite(w.waterings) && finite(w.trays);
  });
  const supplements = (Array.isArray(r.supplements) ? r.supplements : []).filter((e): e is SupplementEntry => {
    const x = e as Partial<SupplementEntry>;
    return typeof e === 'object' && e !== null && isDay(x.day) && STAGE_KEYS.has(x.stage as string) && typeof x.nutrientKey === 'string' && x.nutrientKey !== '' && finite(x.ml) && finite(x.trays);
  });
  return { water, supplements };
}

/**
 * The watering days of a sowing from its sow day, as the stage schedule lays them out: each day
 * of each stage from sow through the harvest window that the stage waters, with its method, its
 * waterings a day and the trays sown. The ounces are left to the observer; the recording form
 * starts from these rows.
 */
export function wateringDays(stages: readonly StageDef[], days: StageDays, sowDay: string, trays: number): Omit<WaterEntry, 'ozPerWatering'>[] {
  const out: Omit<WaterEntry, 'ozPerWatering'>[] = [];
  let offset = 0;
  for (const st of stages) {
    if (st.key === 'soak' || st.key === 'packed') continue;
    const n = days[st.key as keyof StageDays] ?? 0;
    for (let d = 0; d < n; d += 1) {
      if (st.watering !== 'none' && st.wateringsPerDay > 0) out.push({ day: isoAddDays(sowDay, offset), stage: st.key, method: st.watering, waterings: st.wateringsPerDay, trays });
      offset += 1;
    }
  }
  return out;
}
