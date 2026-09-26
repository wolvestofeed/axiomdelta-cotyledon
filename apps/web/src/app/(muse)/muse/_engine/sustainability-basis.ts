/**
 * Impact OS — the volume a sustainability figure divides by and multiplies (Roadmap
 * N6 slice 4). One function over either ledger's documents, so Plan and Actual
 * count the same way:
 *
 *   Plan    the open forecast's own timeline, its first year from the start date.
 *   Actual  the recorded batch records, receipts and deliveries in the reporting
 *           year, a calendar year (Robert, 2026-09-16).
 *
 * Meals are counted by recipe and channel from the deliveries, production from the
 * batch records, inbound mass from the receipts and outbound meals by delivery
 * site. It replaces channel meals a day × operating days on one reference recipe
 * and the typed planning day (audit A11). Nothing here is stored.
 */

import type { ActualsBundle } from './actuals';
import type { LedgerKind } from './ledger-view';
import { finishedGoodsOnHand, portionFactorFor } from './production-plan';
import {
  apMassPerPortionKg,
  recipeFoodFootprintDual,
  shippedMassPerPortionKg,
  KG_PER_LB,
} from './carbon';
import { foodFactors, recipeFoodCategoryMap } from '../_data/emission-factors';
import type { LcaOption } from '../_data/lca-options';
import type { RecipeDef } from '../_data/plan-data';

export interface MealsByRecipe {
  /** Null when the delivery named no recipe. */
  recipeCode: string | null;
  channel: number;
  meals: number;
}

export interface SiteMeals {
  siteId: string | null;
  siteName: string | null;
  meals: number;
  deliveryDays: number;
}

export interface SustainabilityBasis {
  kind: LedgerKind;
  from: string;
  to: string;
  /** Delivered meals by recipe and channel. */
  meals: MealsByRecipe[];
  totalMeals: number;
  /** Distinct dates with a delivery. */
  deliveryDays: number;
  /** Distinct dates with a batch. */
  productionDays: number;
  /** Good base portions produced, by recipe. */
  producedByRecipe: Record<string, number>;
  /** Received quantity by ingredient and unit; rejected lines excluded. */
  received: { ingredient: string; unit: 'lb' | 'each'; qty: number }[];
  bySite: SiteMeals[];
  /** Finished base portions that passed hold life unshipped in the window, by recipe. */
  expiredByRecipe: Record<string, number>;
  /** Meals delivered with no recipe named: counted in meals, not in food or mass. */
  mealsWithNoRecipe: number;
}

const inWindow = (d: string, from: string, to: string) => d >= from && d <= to;

export function sustainabilityBasis(input: {
  kind: LedgerKind;
  bundle: Pick<ActualsBundle, 'batches' | 'receipts' | 'deliveries'>;
  from: string;
  to: string;
  holdLifeDays: number;
  recipes: readonly RecipeDef[];
  portionFactorByChannel: Record<number, number>;
}): SustainabilityBasis {
  const { bundle, from, to } = input;
  const deliveries = bundle.deliveries.filter((d) => inWindow(d.deliveredOn, from, to));
  const batches = bundle.batches.filter((b) => inWindow(b.productionDate, from, to));
  const receipts = bundle.receipts.filter((r) => inWindow(r.receivedOn, from, to));

  const mealKey = new Map<string, MealsByRecipe>();
  const siteKey = new Map<string, SiteMeals & { dates: Set<string> }>();
  let mealsWithNoRecipe = 0;
  for (const d of deliveries) {
    const code = d.recipeCode ?? null;
    if (!code) mealsWithNoRecipe += d.meals;
    const k = `${code ?? ''}|${d.phase}`;
    const row = mealKey.get(k) ?? { recipeCode: code, channel: d.phase, meals: 0 };
    row.meals += d.meals;
    mealKey.set(k, row);
    const sk = d.siteId ?? `name:${d.siteName ?? ''}`;
    const site = siteKey.get(sk) ?? { siteId: d.siteId, siteName: d.siteName, meals: 0, deliveryDays: 0, dates: new Set<string>() };
    site.meals += d.meals;
    site.dates.add(d.deliveredOn);
    siteKey.set(sk, site);
  }

  const producedByRecipe: Record<string, number> = {};
  for (const b of batches) producedByRecipe[b.recipeCode] = (producedByRecipe[b.recipeCode] ?? 0) + b.goodPortions;

  const receivedKey = new Map<string, { ingredient: string; unit: 'lb' | 'each'; qty: number }>();
  for (const r of receipts) {
    for (const l of r.lines) {
      if (l.condition === 'rejected') continue;
      const k = `${l.ingredient}|${l.unit}`;
      const row = receivedKey.get(k) ?? { ingredient: l.ingredient, unit: l.unit, qty: 0 };
      row.qty += l.qty;
      receivedKey.set(k, row);
    }
  }

  // Past hold life, unshipped: every delivery through the window's end draws its lots.
  const consumed = bundle.deliveries
    .filter((d) => d.recipeCode && d.deliveredOn <= to)
    .map((d) => ({
      recipeCode: d.recipeCode!,
      date: d.deliveredOn,
      basePortions: d.meals * portionFactorFor(input.recipes.find((r) => r.code === d.recipeCode), d.phase, input.portionFactorByChannel),
    }));
  const onHand = finishedGoodsOnHand({ batches: bundle.batches.filter((b) => b.productionDate <= to), consumed, holdLifeDays: input.holdLifeDays, asOf: to });
  const expiredByRecipe: Record<string, number> = {};
  for (const lot of onHand.lots) {
    if (lot.remaining <= 1e-9 || lot.expires >= to || lot.expires < from) continue;
    expiredByRecipe[lot.recipeCode] = (expiredByRecipe[lot.recipeCode] ?? 0) + lot.remaining;
  }

  return {
    kind: input.kind,
    from,
    to,
    meals: [...mealKey.values()],
    totalMeals: deliveries.reduce((s, d) => s + d.meals, 0),
    deliveryDays: new Set(deliveries.map((d) => d.deliveredOn)).size,
    productionDays: new Set(batches.map((b) => b.productionDate)).size,
    producedByRecipe,
    received: [...receivedKey.values()],
    bySite: [...siteKey.values()].map(({ dates, ...s }) => ({ ...s, deliveryDays: dates.size })),
    expiredByRecipe,
    mealsWithNoRecipe,
  };
}

/** The empty basis: a page shows zeros while the first answer posts. */
export function emptySustainabilityBasis(kind: LedgerKind, from: string, to: string): SustainabilityBasis {
  return { kind, from, to, meals: [], totalMeals: 0, deliveryDays: 0, productionDays: 0, producedByRecipe: {}, received: [], bySite: [], expiredByRecipe: {}, mealsWithNoRecipe: 0 };
}

// ── The food footprint over the recipe mix ─────────────────────────────────

export interface ChannelFood {
  channel: number;
  meals: number;
  referenceKg: number;
  selectedKg: number;
}

export interface MixIngredient {
  name: string;
  referenceKg: number;
  selectedKg: number;
  massKg: number;
  reference: NonNullable<ReturnType<typeof recipeFoodFootprintDual>['lines'][number]['reference']>['provenance'];
  selected: NonNullable<ReturnType<typeof recipeFoodFootprintDual>['lines'][number]['selected']>['provenance'];
  selectedStatus: NonNullable<ReturnType<typeof recipeFoodFootprintDual>['lines'][number]['selected']>['status'];
  /** The selected basis: the study mean, a cited LCA, or the supplier's own figure. */
  selectedKind: NonNullable<ReturnType<typeof recipeFoodFootprintDual>['lines'][number]['selected']>['kind'];
}

export interface MixFoodFootprint {
  byChannel: ChannelFood[];
  totalMeals: number;
  referenceKg: number;
  selectedKg: number;
  byIngredient: MixIngredient[];
  /** Lines on a cited or supplier figure, across the recipes served. */
  linesOnSelectedBasis: number;
  /** Recipes served with at least one ingredient that has no food factor mapping: their unmapped lines carry no footprint. */
  recipesWithUnmappedLines: { code: string; name: string; unmapped: string[]; meals: number }[];
  /** Meals whose recipe is not in the library or was not named: in meals, not in food. */
  mealsNotCosted: number;
}

/**
 * The food footprint of the meals delivered, recipe by recipe at each channel's
 * portion, on the reference and the selected basis. An ingredient with no
 * mapping to a study product is named, never given a factor.
 */
export function mixFoodFootprint(input: {
  basis: SustainabilityBasis;
  recipes: readonly RecipeDef[];
  portionFactorByChannel: Record<number, number>;
  selection?: Record<string, string>;
  options?: LcaOption[];
}): MixFoodFootprint {
  const byChannel = new Map<number, ChannelFood>();
  const byIngredient = new Map<string, MixIngredient>();
  const unmapped = new Map<string, { code: string; name: string; unmapped: string[]; meals: number }>();
  const onSelected = new Set<string>();
  let mealsNotCosted = 0;
  for (const m of input.basis.meals) {
    const ch = byChannel.get(m.channel) ?? { channel: m.channel, meals: 0, referenceKg: 0, selectedKg: 0 };
    ch.meals += m.meals;
    byChannel.set(m.channel, ch);
    const recipe = m.recipeCode ? input.recipes.find((r) => r.code === m.recipeCode) : undefined;
    if (!recipe) {
      mealsNotCosted += m.meals;
      continue;
    }
    const pf = portionFactorFor(recipe, m.channel, input.portionFactorByChannel);
    const dual = recipeFoodFootprintDual(recipe as never, input.selection ?? {}, foodFactors, recipeFoodCategoryMap, input.options, pf);
    const missing = recipe.ingredients.filter((i) => !recipeFoodCategoryMap[i.name]).map((i) => i.name);
    if (missing.length > 0) {
      const u = unmapped.get(recipe.code) ?? { code: recipe.code, name: recipe.name, unmapped: missing, meals: 0 };
      u.meals += m.meals;
      unmapped.set(recipe.code, u);
    }
    for (const l of dual.lines) {
      if (!l.reference || !l.selected) continue;
      if (l.selected.optionId !== null) onSelected.add(l.name);
      const cur = byIngredient.get(l.name) ?? { name: l.name, referenceKg: 0, selectedKg: 0, massKg: 0, reference: l.reference.provenance, selected: l.selected.provenance, selectedStatus: l.selected.status, selectedKind: l.selected.kind };
      cur.referenceKg += l.reference.kgCo2ePerPortion * m.meals;
      cur.selectedKg += l.selected.kgCo2ePerPortion * m.meals;
      cur.massKg += l.massKgPerPortion * m.meals;
      byIngredient.set(l.name, cur);
      ch.referenceKg += l.reference.kgCo2ePerPortion * m.meals;
      ch.selectedKg += l.selected.kgCo2ePerPortion * m.meals;
    }
  }
  const channels = [...byChannel.values()].sort((a, b) => a.channel - b.channel);
  return {
    byChannel: channels,
    totalMeals: input.basis.totalMeals,
    referenceKg: channels.reduce((s, c) => s + c.referenceKg, 0),
    selectedKg: channels.reduce((s, c) => s + c.selectedKg, 0),
    byIngredient: [...byIngredient.values()],
    linesOnSelectedBasis: onSelected.size,
    recipesWithUnmappedLines: [...unmapped.values()],
    mealsNotCosted,
  };
}

// ── Mass: shrink, past hold life, inbound and outbound ─────────────────────

/** Shrink mass over the window: each recipe's good portions × its as-purchased mass per portion × the shrink allowance. */
export function mixShrinkKg(basis: SustainabilityBasis, recipes: readonly RecipeDef[], shrinkAllowance: number): { kg: number; apKg: number; portions: number } {
  let apKg = 0;
  let portions = 0;
  for (const [code, qty] of Object.entries(basis.producedByRecipe)) {
    const r = recipes.find((x) => x.code === code);
    if (!r) continue;
    apKg += qty * apMassPerPortionKg(r as never);
    portions += qty;
  }
  return { kg: apKg * shrinkAllowance, apKg, portions };
}

/** Finished portions past hold life unshipped, as shipped mass. */
export function expiredMassKg(basis: SustainabilityBasis, recipes: readonly RecipeDef[]): { portions: number; kg: number } {
  let portions = 0;
  let kg = 0;
  for (const [code, qty] of Object.entries(basis.expiredByRecipe)) {
    const r = recipes.find((x) => x.code === code);
    portions += qty;
    if (r) kg += qty * shippedMassPerPortionKg(r as never);
  }
  return { portions, kg };
}

/** Received mass by ingredient, kg: pounds convert; an each line uses the mapping's mass per each. */
export function receivedMassKg(basis: SustainabilityBasis): { ingredient: string; massKg: number }[] {
  const out = new Map<string, number>();
  for (const l of basis.received) {
    const kg = l.unit === 'lb' ? l.qty * KG_PER_LB : l.qty * (recipeFoodCategoryMap[l.ingredient]?.massKgPerEach ?? 0);
    out.set(l.ingredient, (out.get(l.ingredient) ?? 0) + kg);
  }
  return [...out.entries()].map(([ingredient, massKg]) => ({ ingredient, massKg }));
}

/** Shipped mass per delivered meal over the window, meal-weighted across the recipes served. */
export function mixShippedMassPerMealKg(basis: SustainabilityBasis, recipes: readonly RecipeDef[], portionFactorByChannel: Record<number, number>): number {
  let kg = 0;
  let meals = 0;
  for (const m of basis.meals) {
    const r = m.recipeCode ? recipes.find((x) => x.code === m.recipeCode) : undefined;
    if (!r) continue;
    kg += m.meals * shippedMassPerPortionKg(r as never, recipeFoodCategoryMap, portionFactorFor(r, m.channel, portionFactorByChannel));
    meals += m.meals;
  }
  return meals > 0 ? kg / meals : 0;
}
