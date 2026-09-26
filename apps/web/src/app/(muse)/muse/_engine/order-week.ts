/**
 * Impact OS — the dashboard's Production card: the week of orders from the
 * day in use (Robert, 2026-09-15). Pure.
 *
 * Seven days starting today. Each day: meals on order by channel and in
 * total, and the food cost and labor cost of those meals — each order priced
 * at its recipe's unit food cost on the channel's portion and its recipe's
 * labor standard at the recipe's own one-line batch (the seeded estimate until
 * an observed study is adopted). Orders are the order book: derived forecast
 * orders with stored rows in their place.
 */

import type { assumptions as planAssumptions, RecipeDef } from '../_data/plan-data';
import type { TimeStudyDoc } from '../_data/time-studies';
import { costRecipe, deriveCapacity, type CapacityInputs } from './index';
import { isoAddDays, weekdayOf, type BookOrder } from './orders';
import { portionFactorFor } from './production-plan';
import { laborMinutesForBatch, laborStandard, studiesForRecipe, summarizeStudy } from './time-studies';

export interface OrderWeekDay {
  date: string;
  weekday: number;
  mealsByChannel: Record<number, number>;
  meals: number;
  foodCost: number;
  laborCost: number;
}

export interface OrderWeek {
  from: string;
  to: string;
  channels: number[];
  days: OrderWeekDay[];
  mealsByChannel: Record<number, number>;
  meals: number;
  foodCost: number;
  laborCost: number;
  /** Orders whose recipe is not in the library: counted as meals, carrying no cost. */
  uncostedMeals: number;
}

/**
 * Unit food and labor cost of a recipe served on a channel.
 *
 * Labor is the recipe's own standard (Roadmap N3): its assumptions when the
 * resolver supplied them, else its study. A recipe with NO study carries no
 * labor and says so (`laborGap`) — it is never charged a typed figure that
 * belongs to another recipe.
 */
export function unitCostsFor(
  recipe: RecipeDef,
  channel: number,
  cap: CapacityInputs,
  a: typeof planAssumptions,
  studies: readonly TimeStudyDoc[],
  portionFactorByChannel: Record<number, number>,
  recipeAssumptions?: Readonly<Record<string, typeof planAssumptions>>,
): { food: number; labor: number; laborGap: boolean } {
  const pf = portionFactorFor(recipe, channel, portionFactorByChannel);
  const food = costRecipe(recipe, a.yield.shrinkAllowance.value, pf).totalFoodCostPerPortion;
  const batch = deriveCapacity(recipe, cap, pf).batchSize;
  const own = recipeAssumptions?.[recipe.code];
  const standard = own ? null : laborStandard(studiesForRecipe(studies, recipe.code));
  let minutesPerMeal = 0;
  let laborGap = false;
  if (own) {
    minutesPerMeal = batch > 0 ? own.laborSplit.fixedMinutesPerBatch.value / batch + own.laborSplit.variableMinutesPerPortion.value : 0;
    laborGap = own.laborSplit.fixedMinutesPerBatch.value === 0 && own.laborSplit.variableMinutesPerPortion.value === 0;
  } else if (standard && batch > 0) {
    minutesPerMeal = laborMinutesForBatch(summarizeStudy(standard), batch) / batch;
  } else {
    laborGap = true;
  }
  return { food, labor: (minutesPerMeal / 60) * a.labor.blendedLoadedWage.value, laborGap };
}

export function orderWeek(input: {
  book: readonly BookOrder[];
  from: string;
  days?: number;
  channels: readonly number[];
  recipes: readonly RecipeDef[];
  cap: CapacityInputs;
  assumptions: typeof planAssumptions;
  studies: readonly TimeStudyDoc[];
  portionFactorByChannel: Record<number, number>;
  /** Each recipe's own assumptions from the resolver (Roadmap N3); preferred over the studies. */
  recipeAssumptions?: Readonly<Record<string, typeof planAssumptions>>;
}): OrderWeek {
  const n = input.days ?? 7;
  const to = isoAddDays(input.from, n - 1);
  const byCode = new Map(input.recipes.map((r) => [r.code, r]));
  const unit = new Map<string, { food: number; labor: number }>();
  const costsFor = (code: string, channel: number) => {
    const key = `${code}|${channel}`;
    if (!unit.has(key)) {
      const r = byCode.get(code);
      unit.set(key, r ? unitCostsFor(r, channel, input.cap, input.assumptions, input.studies, input.portionFactorByChannel, input.recipeAssumptions) : { food: 0, labor: 0, laborGap: false });
    }
    return unit.get(key)!;
  };
  const zero = () => Object.fromEntries(input.channels.map((c) => [c, 0])) as Record<number, number>;
  let uncostedMeals = 0;
  const days: OrderWeekDay[] = Array.from({ length: n }, (_, i) => {
    const date = isoAddDays(input.from, i);
    const day: OrderWeekDay = { date, weekday: weekdayOf(date), mealsByChannel: zero(), meals: 0, foodCost: 0, laborCost: 0 };
    for (const o of input.book) {
      if (o.orderDate !== date || o.meals <= 0) continue;
      day.mealsByChannel[o.channel] = (day.mealsByChannel[o.channel] ?? 0) + o.meals;
      day.meals += o.meals;
      if (!byCode.has(o.recipeCode)) uncostedMeals += o.meals;
      const c = costsFor(o.recipeCode, o.channel);
      day.foodCost += c.food * o.meals;
      day.laborCost += c.labor * o.meals;
    }
    return day;
  });
  const totals = zero();
  for (const d of days) for (const c of input.channels) totals[c] = (totals[c] ?? 0) + (d.mealsByChannel[c] ?? 0);
  return {
    from: input.from,
    to,
    channels: [...input.channels],
    days,
    mealsByChannel: totals,
    meals: days.reduce((s, d) => s + d.meals, 0),
    foodCost: days.reduce((s, d) => s + d.foodCost, 0),
    laborCost: days.reduce((s, d) => s + d.laborCost, 0),
    uncostedMeals,
  };
}
