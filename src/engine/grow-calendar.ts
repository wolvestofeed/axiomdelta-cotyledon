/**
 * MicroFarm — the grow calendar: sowings on grow units across days (outline §4 stage schedule,
 * §5 rules 1 and 8). Pure.
 *
 * A tray is sown on its sow date and sits on its grow unit for the plan's cycle days: sow,
 * germination, blackout, light, harvest window. The sow date for a distribution date is the
 * distribution date less the plan's days to harvest, moved back to the latest production day
 * inside the harvest window. A sowing is placed on a unit whose fixture delivers the plan's light
 * line and which has room for the sowing's trays on every day of the cycle; a sowing no unit can
 * hold is reported, never squeezed. Each day then reads what is on the shelves by stage, what is
 * sown, what is in its harvest window, and the waterings the daily stream owes.
 */

import { planStageDays, planStages, type GrowPlanDef } from '@/data/grow-plan';
import { cycleDays as cycleDaysOf, daysToHarvest as daysToHarvestOf, type StageKey, type WateringMethod } from '@/data/stage-schedule';
import { deriveGrowCapacity, traysPerUnit, unitTakesPlan, type GrowUnit } from '@/engine/grow-capacity';
import { isoAddDays, weekdayOf } from '@/engine/orders';
import { isClosed, type DateRange } from '@/engine/periods';

const DAY_MS = 86_400_000;

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysFrom(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export interface StageOnDay {
  /** The stage the tray is in; `off` before its soak or after its harvest window. */
  stage: StageKey | 'off';
  /** Days since the sow date; negative through the soak. */
  dayOfCycle: number;
  watering: WateringMethod;
  wateringsPerDay: number;
  underLight: boolean;
  /** The tray counts against its grow unit. */
  onShelf: boolean;
}

const OFF: StageOnDay = { stage: 'off', dayOfCycle: 0, watering: 'none', wateringsPerDay: 0, underLight: false, onShelf: false };

/** The stage a tray sown on `sowDate` is in on `date`. Day 0 is the sow date; the soak runs on the days before it. */
export function stageOn(plan: GrowPlanDef, sowDate: string, date: string): StageOnDay {
  const days = planStageDays(plan);
  const stages = planStages(plan);
  const k = daysFrom(sowDate, date);
  if (k < 0) {
    const soak = stages.find((s) => s.key === 'soak');
    return soak && k >= -days.soak ? { stage: 'soak', dayOfCycle: k, watering: soak.watering, wateringsPerDay: soak.wateringsPerDay, underLight: false, onShelf: false } : { ...OFF, dayOfCycle: k };
  }
  let cursor = 0;
  for (const s of stages) {
    if (s.key === 'soak' || s.key === 'packed') continue;
    const n = days[s.key];
    if (k < cursor + n) return { stage: s.key, dayOfCycle: k, watering: s.watering, wateringsPerDay: s.wateringsPerDay, underLight: s.underLight, onShelf: s.occupiesGrowUnit };
    cursor += n;
  }
  return { ...OFF, dayOfCycle: k };
}

const isProductionDay = (d: string, weekdays: readonly number[], closures?: readonly DateRange[]) => weekdays.includes(weekdayOf(d)) && !isClosed(d, closures);

/**
 * The sow date that serves a distribution date: the distribution date less the plan's days to
 * harvest, or the latest production day before that inside the harvest window (a live tray waits
 * on the shelf). With no production day inside the window, the latest production day before it.
 */
export function sowDateFor(plan: GrowPlanDef, distributionDate: string, weekdays: readonly number[] = [1, 2, 3, 4, 5], closures?: readonly DateRange[]): string {
  const days = planStageDays(plan);
  const latest = isoAddDays(distributionDate, -daysToHarvestOf(days));
  let d = latest;
  for (let i = 0; i < 366; i += 1) {
    if (isProductionDay(d, weekdays, closures)) return d;
    d = isoAddDays(d, -1);
  }
  return latest;
}

/** The lead days a plan needs before a distribution date; a code not in the library is made the day before. */
export function leadDaysFor(growPlan: GrowPlanDef | undefined): number {
  return growPlan ? daysToHarvestOf(planStageDays(growPlan)) : 1;
}

/**
 * The date a sowing's trays become finished goods: the first day in the harvest window (the sow date
 * plus days to harvest); a code not in the library, its production date. Shelf life counts from it.
 */
export function stockDateFor(growPlan: GrowPlanDef | undefined, productionDate: string): string {
  return growPlan ? isoAddDays(productionDate, daysToHarvestOf(planStageDays(growPlan))) : productionDate;
}

export interface CalendarSowing {
  id: string;
  growPlanCode: string;
  growPlanName: string;
  sowDate: string;
  /** First day of the harvest window. */
  harvestFrom: string;
  /** Last day of the harvest window. */
  harvestTo: string;
  /** The distribution date the sowing was planned for; null on a recorded sowing. */
  distributionDate: string | null;
  trays: number;
  cycleDays: number;
  /** The grow unit the sowing sits on; null when none could hold it. */
  unitKey: string | null;
  unitItem: string | null;
  placed: boolean;
}

/**
 * The shelves over time: trays on each grow unit by date. A sowing is placed on the unit that
 * takes the plan with room on every day of the cycle, the largest unit first; nothing is placed
 * over capacity.
 */
export class ShelfLedger {
  private readonly used = new Map<string, Map<string, number>>();
  readonly sowings: CalendarSowing[] = [];
  private seq = 0;

  constructor(readonly units: readonly GrowUnit[]) {}

  traysOn(unitKey: string, date: string): number {
    return this.used.get(unitKey)?.get(date) ?? 0;
  }

  /** Trays the unit's kind holds across its count, for a format. */
  capacityOf(unit: GrowUnit, plan: GrowPlanDef): number {
    return traysPerUnit(unit, plan.format) * unit.units;
  }

  private reserve(unitKey: string, date: string, trays: number) {
    const m = this.used.get(unitKey) ?? new Map<string, number>();
    m.set(date, (m.get(date) ?? 0) + trays);
    this.used.set(unitKey, m);
  }

  /** Place one sowing; returns it, placed or not. */
  place(plan: GrowPlanDef, sowDate: string, trays: number, distributionDate: string | null = null): CalendarSowing {
    const days = planStageDays(plan);
    const cycle = cycleDaysOf(days);
    const window = days['harvest-window'];
    const harvestFrom = isoAddDays(sowDate, daysToHarvestOf(days));
    const sowing: CalendarSowing = {
      id: `${plan.code}@${sowDate}#${++this.seq}`,
      growPlanCode: plan.code,
      growPlanName: plan.name,
      sowDate,
      harvestFrom,
      harvestTo: isoAddDays(harvestFrom, Math.max(0, window - 1)),
      distributionDate,
      trays,
      cycleDays: cycle,
      unitKey: null,
      unitItem: null,
      placed: false,
    };
    const able = this.units.filter((u) => unitTakesPlan(u, plan) && traysPerUnit(u, plan.format) > 0).sort((a, b) => this.capacityOf(b, plan) - this.capacityOf(a, plan));
    for (const u of able) {
      const cap = this.capacityOf(u, plan);
      let fits = true;
      for (let k = 0; k < cycle; k += 1) {
        if (this.traysOn(u.key, isoAddDays(sowDate, k)) + trays > cap + 1e-9) {
          fits = false;
          break;
        }
      }
      if (!fits) continue;
      for (let k = 0; k < cycle; k += 1) this.reserve(u.key, isoAddDays(sowDate, k), trays);
      sowing.unitKey = u.key;
      sowing.unitItem = u.item;
      sowing.placed = true;
      break;
    }
    this.sowings.push(sowing);
    return sowing;
  }
}

export interface CalendarUnitDay {
  unitKey: string;
  item: string;
  trays: number;
  /** Trays the unit holds in the format of what sits on it that day; in 1020 flats when empty. */
  capacity: number;
}

export interface CalendarDay {
  date: string;
  traysOnShelf: number;
  byUnit: CalendarUnitDay[];
  sowingsStarted: number;
  traysSown: number;
  /** Trays inside their harvest window. */
  traysHarvestable: number;
  traysByStage: Partial<Record<StageKey, number>>;
  /** Tray-waterings the daily stream owes, by method. */
  waterings: Record<WateringMethod, number>;
  /** Sowings that were not placed on any unit and would be on a shelf today. */
  unplacedTrays: number;
}

export interface CalendarFinding {
  kind: 'no-unit' | 'over-capacity' | 'sow-before-window' | 'not-in-library';
  growPlanCode: string;
  sowDate: string | null;
  detail: string;
}

export interface GrowCalendar {
  from: string;
  to: string;
  sowings: CalendarSowing[];
  days: CalendarDay[];
  findings: CalendarFinding[];
  /** Tray-days used over tray-days available per unit kind across the window. */
  utilisation: { unitKey: string; item: string; used: number; available: number; share: number }[];
}

/** The calendar over a window from placed and unplaced sowings. */
export function calendarFromSowings(input: { from: string; to: string; sowings: readonly CalendarSowing[]; growPlans: readonly GrowPlanDef[]; units: readonly GrowUnit[]; findings?: readonly CalendarFinding[] }): GrowCalendar {
  const plans = new Map(input.growPlans.map((r) => [r.code, r]));
  const days: CalendarDay[] = [];
  const used = new Map<string, number>();
  const available = new Map<string, number>();
  for (let d = input.from; d <= input.to; d = isoAddDays(d, 1)) {
    const day: CalendarDay = { date: d, traysOnShelf: 0, byUnit: [], sowingsStarted: 0, traysSown: 0, traysHarvestable: 0, traysByStage: {}, waterings: { none: 0, mist: 0, bottom: 0, rinse: 0 }, unplacedTrays: 0 };
    const byUnit = new Map<string, CalendarUnitDay>();
    // A unit's capacity that day is in the format of what sits on it; empty, it is counted in 1020 flats.
    const formatsOn = new Map<string, Set<string>>();
    for (const s of input.sowings) {
      const plan = plans.get(s.growPlanCode);
      if (!plan || !s.placed || !s.unitKey || !stageOn(plan, s.sowDate, d).onShelf) continue;
      formatsOn.set(s.unitKey, new Set([...(formatsOn.get(s.unitKey) ?? []), plan.format]));
    }
    for (const u of input.units) {
      const formats = [...(formatsOn.get(u.key) ?? [])];
      const capacity = (formats.length ? Math.max(...formats.map((f) => traysPerUnit(u, f as GrowPlanDef['format']))) : traysPerUnit(u, 'flat-1020')) * u.units;
      byUnit.set(u.key, { unitKey: u.key, item: u.item, trays: 0, capacity });
      available.set(u.key, (available.get(u.key) ?? 0) + capacity);
    }
    for (const s of input.sowings) {
      const plan = plans.get(s.growPlanCode);
      if (!plan) continue;
      const st = stageOn(plan, s.sowDate, d);
      if (st.stage === 'off') continue;
      // A sowing with no unit is on no shelf: it is counted as trays without room and nothing else.
      if (!s.placed || !s.unitKey) {
        if (st.onShelf) day.unplacedTrays += s.trays;
        continue;
      }
      if (s.sowDate === d) {
        day.sowingsStarted += 1;
        day.traysSown += s.trays;
      }
      day.traysByStage[st.stage] = (day.traysByStage[st.stage] ?? 0) + s.trays;
      day.waterings[st.watering] += st.wateringsPerDay * s.trays;
      if (st.stage === 'harvest-window') day.traysHarvestable += s.trays;
      if (!st.onShelf) continue;
      day.traysOnShelf += s.trays;
      const row = byUnit.get(s.unitKey);
      if (row) {
        row.trays += s.trays;
        used.set(s.unitKey, (used.get(s.unitKey) ?? 0) + s.trays);
      }
    }
    day.byUnit = [...byUnit.values()];
    days.push(day);
  }
  return {
    from: input.from,
    to: input.to,
    sowings: [...input.sowings],
    days,
    findings: [...(input.findings ?? [])],
    utilisation: input.units.map((u) => {
      const a = available.get(u.key) ?? 0;
      const x = used.get(u.key) ?? 0;
      return { unitKey: u.key, item: u.item, used: x, available: a, share: a > 0 ? x / a : 0 };
    }),
  };
}

export interface CalendarRequirement {
  distributionDate: string;
  growPlanCode: string;
  /** Units to have in the harvest window on the distribution date. */
  baseUnits: number;
}

/**
 * Back-plan requirements onto the shelves: each requirement's sowings on its sow date, whole
 * sowings of what one unit takes, placed oldest distribution date first.
 */
export function planGrowCalendar(input: { from: string; to: string; requirements: readonly CalendarRequirement[]; growPlans: readonly GrowPlanDef[]; units: readonly GrowUnit[]; weekdays?: readonly number[]; closures?: readonly DateRange[] }): GrowCalendar {
  const ledger = new ShelfLedger(input.units);
  const findings: CalendarFinding[] = [];
  const reqs = [...input.requirements].sort((a, b) => a.distributionDate.localeCompare(b.distributionDate) || a.growPlanCode.localeCompare(b.growPlanCode));
  for (const r of reqs) {
    if (r.baseUnits <= 0) continue;
    const growPlan = input.growPlans.find((x) => x.code === r.growPlanCode);
    if (!growPlan) {
      findings.push({ kind: 'not-in-library', growPlanCode: r.growPlanCode, sowDate: null, detail: `${r.growPlanCode} is not a grow plan in the library; the calendar does not place it.` });
      continue;
    }
    const cap = deriveGrowCapacity(growPlan, input.units);
    if (cap.sowingTrays <= 0) {
      findings.push({ kind: 'no-unit', growPlanCode: r.growPlanCode, sowDate: null, detail: `${r.growPlanCode}: no grow unit takes this plan (its light line needs a fixture none carries, or no unit has shelves).` });
      continue;
    }
    const sowDate = sowDateFor(growPlan, r.distributionDate, input.weekdays, input.closures);
    if (sowDate < input.from) findings.push({ kind: 'sow-before-window', growPlanCode: r.growPlanCode, sowDate, detail: `${r.growPlanCode} for ${r.distributionDate} sows on ${sowDate}, before the window starts.` });
    const n = Math.ceil(r.baseUnits / cap.sowingTrays - 1e-9);
    for (let i = 0; i < n; i += 1) {
      const s = ledger.place(growPlan, sowDate, cap.sowingTrays, r.distributionDate);
      if (!s.placed) findings.push({ kind: 'over-capacity', growPlanCode: r.growPlanCode, sowDate, detail: `${r.growPlanCode}: a sowing of ${cap.sowingTrays} trays on ${sowDate} has no room on any grow unit for its ${cap.cycleDays}-day cycle.` });
    }
  }
  return calendarFromSowings({ from: input.from, to: input.to, sowings: ledger.sowings, growPlans: input.growPlans, units: input.units, findings });
}
