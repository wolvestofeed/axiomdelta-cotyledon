/**
 * MicroFarm — the dashboard's Production card: the week of orders from the
 * day in use. Pure.
 *
 * Seven days starting today. Each day: units on order by channel and in
 * total, and the input cost and labor cost of those units — each order priced
 * at its grow plan's unit input cost on the channel's unit and its grow plan's
 * labor standard at the grow plan's own one-line sowing (the seeded estimate until
 * an observed study is approved). Orders are the order book: derived forecast
 * orders with stored rows in their place.
 */

import type { GrowPlanDef } from '@/data/grow-plan';
import type { assumptions as planAssumptions } from '@/data/plan-data';
import type { TimeStudyDoc } from '@/data/time-studies';
import { costPlanPerUnit, deriveCapacity, type CapacityInputs } from '@/engine';
import { isoAddDays, weekdayOf, type BookOrder } from '@/engine/orders';
import { unitFactorFor } from '@/engine/production-plan';
import { laborMinutesForSowing, laborStandard, studiesForGrowPlan, summarizeStudy } from '@/engine/time-studies';

export interface OrderWeekDay {
  date: string;
  weekday: number;
  unitsByChannel: Record<number, number>;
  units: number;
  inputCost: number;
  laborCost: number;
}

export interface OrderWeek {
  from: string;
  to: string;
  channels: number[];
  days: OrderWeekDay[];
  unitsByChannel: Record<number, number>;
  units: number;
  inputCost: number;
  laborCost: number;
  /** Orders whose grow plan is not in the library: counted as units, carrying no cost. */
  uncostedUnits: number;
}

/**
 * Unit food and labor cost of a grow plan served on a channel.
 *
 * Labor is the grow plan's own standard (Roadmap N3): its assumptions when the
 * resolver supplied them, else its study. A grow plan with NO study carries no
 * labor and says so (`laborGap`) — it is never charged a typed figure that
 * belongs to another grow plan.
 */
export function unitCostsFor(
  growPlan: GrowPlanDef,
  channel: number,
  cap: CapacityInputs,
  a: typeof planAssumptions,
  studies: readonly TimeStudyDoc[],
  unitFactorByChannel: Record<number, number>,
  growPlanAssumptions?: Readonly<Record<string, typeof planAssumptions>>,
): { food: number; labor: number; laborGap: boolean } {
  const pf = unitFactorFor(growPlan, channel, unitFactorByChannel);
  const food = costPlanPerUnit(growPlan, a.yield.shrinkAllowance.value, pf).totalInputCostPerUnit;
  const sowing = deriveCapacity(growPlan, cap, pf).sowingSize;
  const own = growPlanAssumptions?.[growPlan.code];
  const standard = own ? null : laborStandard(studiesForGrowPlan(studies, growPlan.code));
  let minutesPerUnit = 0;
  let laborGap = false;
  if (own) {
    minutesPerUnit = sowing > 0 ? own.laborSplit.fixedMinutesPerSowing.value / sowing + own.laborSplit.variableMinutesPerUnit.value + (own.laborSplit.dailyMinutesPerUnit?.value ?? 0) : 0;
    laborGap = own.laborSplit.fixedMinutesPerSowing.value === 0 && own.laborSplit.variableMinutesPerUnit.value === 0;
  } else if (standard && sowing > 0) {
    minutesPerUnit = laborMinutesForSowing(summarizeStudy(standard), sowing) / sowing;
  } else {
    laborGap = true;
  }
  return { food, labor: (minutesPerUnit / 60) * a.labor.blendedLoadedWage.value, laborGap };
}

export function orderWeek(input: {
  book: readonly BookOrder[];
  from: string;
  days?: number;
  channels: readonly number[];
  growPlans: readonly GrowPlanDef[];
  cap: CapacityInputs;
  assumptions: typeof planAssumptions;
  studies: readonly TimeStudyDoc[];
  unitFactorByChannel: Record<number, number>;
  /** Each grow plan's own assumptions from the resolver (Roadmap N3); preferred over the studies. */
  growPlanAssumptions?: Readonly<Record<string, typeof planAssumptions>>;
}): OrderWeek {
  const n = input.days ?? 7;
  const to = isoAddDays(input.from, n - 1);
  const byCode = new Map(input.growPlans.map((r) => [r.code, r]));
  const unit = new Map<string, { food: number; labor: number }>();
  const costsFor = (code: string, channel: number) => {
    const key = `${code}|${channel}`;
    if (!unit.has(key)) {
      const r = byCode.get(code);
      unit.set(key, r ? unitCostsFor(r, channel, input.cap, input.assumptions, input.studies, input.unitFactorByChannel, input.growPlanAssumptions) : { food: 0, labor: 0, laborGap: false });
    }
    return unit.get(key)!;
  };
  const zero = () => Object.fromEntries(input.channels.map((c) => [c, 0])) as Record<number, number>;
  let uncostedUnits = 0;
  const days: OrderWeekDay[] = Array.from({ length: n }, (_, i) => {
    const date = isoAddDays(input.from, i);
    const day: OrderWeekDay = { date, weekday: weekdayOf(date), unitsByChannel: zero(), units: 0, inputCost: 0, laborCost: 0 };
    for (const o of input.book) {
      if (o.orderDate !== date || o.units <= 0) continue;
      day.unitsByChannel[o.channel] = (day.unitsByChannel[o.channel] ?? 0) + o.units;
      day.units += o.units;
      if (!byCode.has(o.growPlanCode)) uncostedUnits += o.units;
      const c = costsFor(o.growPlanCode, o.channel);
      day.inputCost += c.food * o.units;
      day.laborCost += c.labor * o.units;
    }
    return day;
  });
  const totals = zero();
  for (const d of days) for (const c of input.channels) totals[c] = (totals[c] ?? 0) + (d.unitsByChannel[c] ?? 0);
  return {
    from: input.from,
    to,
    channels: [...input.channels],
    days,
    unitsByChannel: totals,
    units: days.reduce((s, d) => s + d.units, 0),
    inputCost: days.reduce((s, d) => s + d.inputCost, 0),
    laborCost: days.reduce((s, d) => s + d.laborCost, 0),
    uncostedUnits,
  };
}
