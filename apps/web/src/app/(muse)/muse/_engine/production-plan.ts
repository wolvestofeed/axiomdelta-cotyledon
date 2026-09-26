/**
 * Impact OS — production planning in three levels, engine-side.
 *
 * Ledger-free, database-free. Roadmap Phase H4.
 *
 *   1. Single recipe run — one library recipe, a quantity, a channel and a
 *      price, run through batch sizing, the weight chain, labor, the purchase
 *      requirement and the economics. The "forecast task".
 *   2. Delivery day — every order on a date, exploded across recipes into base
 *      portions, netted against finished goods on hand (batch records inside
 *      hold life, less what delivered orders drew), sized into whole batches
 *      per recipe, placed on the chiller in order against the shared ceiling,
 *      with one purchase requirement merged across recipes.
 *   3. Horizon — the same over a date range, rolling: each production day makes
 *      the next delivery date's orders, overshoot is stock while inside hold
 *      life and expired stock is named as waste, and what could not be made is
 *      an unfilled order, not a refused plan.
 *
 * Every figure is computed from the recipe library, the order book and the
 * capacity inputs; nothing here is stored.
 */

import { isClosed, type DateRange } from './periods';
import type { RecipeDef } from '../_data/plan-data';
import type { ResolvedInputs } from './scenario';
import type { BookOrder } from './orders';
import { isoAddDays, weekdayOf } from './orders';
import { deriveCapacity, costRecipe, componentCosting, laborForDay, purchaseOrderForRun, type PurchaseOrderLine, type CapacityProfile } from './index';
import { laborRequirement, checkStaffing, type LaborRequirement, type StaffingCheck } from './staffing';
import type { CrewShift } from '../_data/crews';
import type { RequirementLine } from './catalog';

type Assumptions = ResolvedInputs['assumptions'];
type CapacityInputs = ResolvedInputs['capacityInputs'];

const OZ_PER_LB = 16;

// ── Requirements from the order book ────────────────────────────────────────

export interface ChannelMeals {
  channel: number;
  meals: number;
  /** Base portions per meal: 1 for a recipe on its own channel, else the channel portion factor. */
  portionFactor: number;
}

export interface RecipeRequirement {
  recipeCode: string;
  recipeName: string;
  /** Meals ordered. */
  meals: number;
  /** Base-portion equivalents the kitchen has to make. */
  basePortions: number;
  byChannel: ChannelMeals[];
  orders: number;
  inLibrary: boolean;
}

/**
 * Base portions per meal for an order. A recipe that lists the channel is
 * served at its own portion (an adult recipe carries its upgrade in its
 * lines), so the factor is 1; the channel portion factor applies only when a
 * recipe is served on a channel it is not authored for (the code recipe on
 * Phase 2, say) — the legacy scaling until every channel has its own recipes.
 */
export function portionFactorFor(recipe: RecipeDef | undefined, channel: number, portionFactorByChannel: Record<number, number>): number {
  if (recipe && recipe.channels.includes(channel)) return 1;
  return portionFactorByChannel[channel] ?? 1;
}

/** The recipes a set of orders needs, in base portions, largest first. */
export function requirementsFor(
  orders: readonly BookOrder[],
  recipes: readonly RecipeDef[],
  portionFactorByChannel: Record<number, number>,
): RecipeRequirement[] {
  const byCode = new Map<string, RecipeRequirement>();
  for (const o of orders) {
    const lib = recipes.find((r) => r.code === o.recipeCode);
    const pf = portionFactorFor(lib, o.channel, portionFactorByChannel);
    const row = byCode.get(o.recipeCode) ?? {
      recipeCode: o.recipeCode,
      recipeName: lib?.name ?? o.recipeName,
      meals: 0,
      basePortions: 0,
      byChannel: [],
      orders: 0,
      inLibrary: Boolean(lib),
    };
    row.meals += o.meals;
    row.basePortions += o.meals * pf;
    row.orders += 1;
    const ch = row.byChannel.find((c) => c.channel === o.channel);
    if (ch) ch.meals += o.meals;
    else row.byChannel.push({ channel: o.channel, meals: o.meals, portionFactor: pf });
    byCode.set(o.recipeCode, row);
  }
  return [...byCode.values()].sort((a, b) => b.basePortions - a.basePortions || a.recipeCode.localeCompare(b.recipeCode));
}

// ── Finished goods on hand, from records ────────────────────────────────────

export interface FinishedLot {
  batchId: string;
  recipeCode: string;
  produced: string;
  /** Last date the lot is inside hold life. */
  expires: string;
  qtyProduced: number;
  remaining: number;
}

export interface Consumption {
  recipeCode: string;
  date: string;
  basePortions: number;
}

export interface OnHand {
  lots: FinishedLot[];
  /** Base portions on hand and inside hold life, by recipe. */
  byRecipe: Record<string, number>;
  /** Base portions that expired unconsumed on or before `asOf`, by recipe. */
  expiredByRecipe: Record<string, number>;
  /** Consumption that found no stock, by recipe. */
  unmatchedByRecipe: Record<string, number>;
}

/**
 * What delivered orders drew from finished goods: each delivered order's meals
 * (the delivery's count when one is linked) on its delivery date, in base
 * portions. One function for every surface that nets stock from the records.
 */
export function deliveredConsumption(
  orders: readonly { status: string; deliveryId: string | null; recipeCode: string; channel: number; orderDate: string; meals: number }[],
  deliveries: readonly { id: string; deliveredOn: string; meals: number }[],
  recipes: readonly RecipeDef[],
  portionFactorByChannel: Record<number, number>,
): Consumption[] {
  const byId = new Map(deliveries.map((d) => [d.id, d]));
  return orders
    .filter((o) => o.status === 'delivered')
    .map((o) => {
      const d = o.deliveryId ? byId.get(o.deliveryId) : undefined;
      const pf = portionFactorFor(recipes.find((r) => r.code === o.recipeCode), o.channel, portionFactorByChannel);
      return { recipeCode: o.recipeCode, date: d?.deliveredOn ?? o.orderDate, basePortions: (d?.meals ?? o.meals) * pf };
    });
}

/** Draw `qty` from the oldest unexpired lots of a recipe on a date, FIFO. Returns what could not be drawn. */
function drawFifo(lots: FinishedLot[], recipeCode: string, date: string, qty: number): number {
  let left = qty;
  for (const lot of lots) {
    if (left <= 1e-9) break;
    if (lot.recipeCode !== recipeCode || lot.remaining <= 0) continue;
    if (lot.produced > date || lot.expires < date) continue;
    const take = Math.min(lot.remaining, left);
    lot.remaining -= take;
    left -= take;
  }
  return Math.max(0, left);
}

/**
 * Finished goods from the batch records: each closed batch is a lot of good
 * portions produced on its date, inside hold life for `holdLifeDays`. Delivered
 * orders draw from the oldest lot of their recipe first.
 */
export function finishedGoodsOnHand(input: {
  batches: readonly { batchId: string; recipeCode: string; productionDate: string; goodPortions: number }[];
  consumed: readonly Consumption[];
  holdLifeDays: number;
  asOf: string;
}): OnHand {
  const lots: FinishedLot[] = input.batches
    .filter((b) => b.productionDate <= input.asOf)
    .map((b) => ({
      batchId: b.batchId,
      recipeCode: b.recipeCode,
      produced: b.productionDate,
      expires: isoAddDays(b.productionDate, input.holdLifeDays),
      qtyProduced: b.goodPortions,
      remaining: b.goodPortions,
    }))
    .sort((a, b) => a.produced.localeCompare(b.produced) || a.batchId.localeCompare(b.batchId));
  const unmatchedByRecipe: Record<string, number> = {};
  for (const c of [...input.consumed].sort((a, b) => a.date.localeCompare(b.date))) {
    if (c.date > input.asOf) continue;
    const left = drawFifo(lots, c.recipeCode, c.date, c.basePortions);
    if (left > 0) unmatchedByRecipe[c.recipeCode] = (unmatchedByRecipe[c.recipeCode] ?? 0) + left;
  }
  const byRecipe: Record<string, number> = {};
  const expiredByRecipe: Record<string, number> = {};
  for (const lot of lots) {
    if (lot.remaining <= 0) continue;
    if (lot.expires < input.asOf) expiredByRecipe[lot.recipeCode] = (expiredByRecipe[lot.recipeCode] ?? 0) + lot.remaining;
    else byRecipe[lot.recipeCode] = (byRecipe[lot.recipeCode] ?? 0) + lot.remaining;
  }
  return { lots, byRecipe, expiredByRecipe, unmatchedByRecipe };
}

// ── A production day: whole batches per recipe against the shared chiller ───

export interface RecipeRunPlan {
  recipeCode: string;
  recipeName: string;
  /** Base portions the orders need. */
  required: number;
  onHand: number;
  net: number;
  batchSize: number;
  batchesNeeded: number;
  /** Batches that fit in the day's cycles after the recipes ahead of it. */
  batchesScheduled: number;
  produced: number;
  /** Net requirement not made because the day ran out of cycles. */
  shortfall: number;
  closing: number;
  chilledLb: number;
  cookedLb: number;
  purchasedLb: number;
  packedLb: number;
  laborHours: number;
  laborCost: number;
  /** Recipe standard for the portions produced, incl. the shrink allowance. */
  foodCostStandard: number;
  purchase: { lines: PurchaseOrderLine[]; total: number };
}

export interface ScheduledBatch {
  seq: number;
  recipeCode: string;
  recipeName: string;
  portions: number;
  /** Minutes from midnight. */
  loadMin: number;
  unloadMin: number;
  freeMin: number;
  fits: boolean;
}

export interface DayPlan {
  productionDate: string;
  runs: RecipeRunPlan[];
  cyclesRequired: number;
  cyclesAvailable: number;
  fits: boolean;
  schedule: ScheduledBatch[];
  totalRequired: number;
  totalProduced: number;
  totalShortfall: number;
  chilledLb: number;
  /** Chilled mass the cabinets can take in the day: one cabinet's load × the cycles across the lines in service. */
  chilledCeilingLb: number;
  laborHours: number;
  laborCost: number;
  foodCostStandard: number;
  purchase: { lines: PurchaseOrderLine[]; total: number };
  requirement: RequirementLine[];
  chillWindow: CapacityProfile['chillWindow'];
  /** The labor the placed batches require — staff-hours by clock interval and headcount per task. */
  labor: LaborRequirement;
  /** Proposed crews checked against `labor`. Findings only; the ceiling is the plant's. */
  staffing: StaffingCheck;
}

/** Merge purchase-order lines across recipes by ingredient; cases re-rounded on the sum. */
export function mergePurchaseLines(all: readonly PurchaseOrderLine[]): { lines: PurchaseOrderLine[]; total: number } {
  const m = new Map<string, PurchaseOrderLine>();
  for (const l of all) {
    const key = `${l.name}|${l.unit}`;
    const cur = m.get(key);
    if (!cur) {
      m.set(key, { ...l });
      continue;
    }
    cur.requiredForProduction += l.requiredForProduction;
    cur.apPerBatch = 0;
  }
  const lines = [...m.values()].map((l) => {
    const casesToOrder = Math.max(0, Math.ceil(l.requiredForProduction / l.packSize - 1e-9));
    return { ...l, casesToOrder, extendedCost: casesToOrder * l.packSize * l.apUnitCost };
  });
  return { lines, total: lines.reduce((s, l) => s + l.extendedCost, 0) };
}

export function toRequirementLines(lines: readonly PurchaseOrderLine[]): RequirementLine[] {
  return lines.map((l) => ({
    ingredient: l.name,
    qty: l.casesToOrder * l.packSize,
    unit: l.unit,
    packSize: l.packSize,
    casesToOrder: l.casesToOrder,
    fallbackUnitCost: l.apUnitCost,
  }));
}

/**
 * Plan one production day. Requirements are in base portions; each recipe's
 * batch size is its own (derived from its chilled mass per portion); every
 * batch takes one chiller cycle, so the day fits when the batches across
 * recipes are within the plant's cycles. When they are not, cycles go to the
 * recipes in requirement order and the rest is a named shortfall. The placed
 * batches then emit the day's labor requirement, and any proposed crews are
 * checked against it.
 */
export function planProductionDay(input: {
  productionDate: string;
  requirements: readonly RecipeRequirement[];
  onHand: Record<string, number>;
  recipes: readonly RecipeDef[];
  capacityInputs: CapacityInputs;
  assumptions: Assumptions;
  /**
   * Each recipe's own assumptions — its labor standard and packaging (Roadmap
   * N3). A run is costed at its recipe's; omitted, every run falls back to
   * `assumptions`, which charges the reference recipe's labor to all of them.
   */
  recipeAssumptions?: Readonly<Record<string, Assumptions>>;
  /** Proposed crews to check against the day's labor requirement. Omitted = none proposed. */
  crews?: readonly CrewShift[];
  /**
   * Lines in service on the date — the blast chiller cabinets, each an
   * independent stream (Roadmap N4b, decision 20). A batch is one cabinet's
   * load whatever the count; concurrency is more batches at once, never a
   * larger batch (Robert, 2026-09-17). Batches load on whichever line is free
   * first. Omitted = one line; zero = no production that day, every batch a
   * shortfall.
   */
  lines?: number;
}): DayPlan {
  const shrink = input.assumptions.yield.shrinkAllowance.value;
  // A recipe's batches cannot load before its cooks finish: its first load is
  // read from its cook times. Recipes are placed earliest-ready first — a
  // stable sort, so the larger requirement leads among recipes ready at the
  // same minute — one occupancy block after another until the operating day
  // closes. A recipe with no cook time on file is not placed.
  const planned = input.requirements
    .map((req) => {
      const recipe = input.recipes.find((r) => r.code === req.recipeCode);
      return recipe ? { req, recipe, cap: deriveCapacity(recipe, input.capacityInputs, 1) } : null;
    })
    .filter((p): p is { req: RecipeRequirement; recipe: RecipeDef; cap: CapacityProfile } => p !== null)
    .sort((a, b) => a.cap.chillWindow.startMin - b.cap.chillWindow.startMin);
  const dayCapacity = planned[0]?.cap ?? deriveCapacity(input.recipes[0], input.capacityInputs);
  const window = dayCapacity.chillWindow;
  const lines = Math.max(0, Math.floor(input.lines ?? 1));
  const cyclesAvailable = window.cycles * lines;
  // One cabinet's load; `cyclesAvailable` already counts every line in service.
  const lbPerCycle = dayCapacity.lbPerCycle;
  const runs: RecipeRunPlan[] = [];
  const schedule: ScheduledBatch[] = [];
  let seq = 0;
  // One cursor per line: the minute each line is next free.
  const cursors: number[] = Array.from({ length: lines }, () => -Infinity);

  for (const { req, recipe, cap } of planned) {
    const onHand = input.onHand[req.recipeCode] ?? 0;
    const net = Math.max(0, req.basePortions - onHand);
    const batchesNeeded = cap.batchSize > 0 ? Math.max(0, Math.ceil(net / cap.batchSize - 1e-9)) : 0;
    const timed = cap.chillWindow.firstLoadBasis !== 'none';
    const loads: { loadMin: number; fits: boolean }[] = [];
    for (let b = 0; b < batchesNeeded; b++) {
      if (lines === 0) {
        loads.push({ loadMin: window.closeMin, fits: false });
        continue;
      }
      let line = 0;
      for (let i = 1; i < lines; i++) if (cursors[i]! < cursors[line]!) line = i;
      const loadMin = Math.max(cursors[line]!, timed ? cap.chillWindow.startMin : window.closeMin);
      loads.push({ loadMin, fits: timed && loadMin + window.occupancyMinutes <= window.closeMin });
      cursors[line] = loadMin + window.occupancyMinutes;
    }
    const batchesScheduled = loads.filter((l) => l.fits).length;
    const produced = batchesScheduled * cap.batchSize;
    const shortfall = Math.max(0, net - produced);
    const c = costRecipe(recipe, shrink);
    const k = componentCosting(recipe, shrink);
    const lb = (oz: number) => (oz * produced) / OZ_PER_LB;
    const labor = laborForDay(batchesScheduled, produced, input.recipeAssumptions?.[recipe.code] ?? input.assumptions);
    const purchase = purchaseOrderForRun(produced, recipe, shrink);
    for (const { loadMin, fits } of loads) {
      seq += 1;
      schedule.push({
        seq,
        recipeCode: recipe.code,
        recipeName: recipe.name,
        portions: cap.batchSize,
        loadMin,
        unloadMin: loadMin + cap.loadMinutes + cap.chillMinutes,
        freeMin: loadMin + window.occupancyMinutes,
        fits,
      });
    }
    runs.push({
      recipeCode: recipe.code,
      recipeName: recipe.name,
      required: req.basePortions,
      onHand,
      net,
      batchSize: cap.batchSize,
      batchesNeeded,
      batchesScheduled,
      produced,
      shortfall,
      closing: onHand + produced - Math.min(req.basePortions, onHand + produced),
      chilledLb: lb(k.filter((x) => x.isHot).reduce((s, x) => s + x.chilledOz, 0)),
      cookedLb: lb(c.cookedOzPerPortion),
      purchasedLb: lb(c.apOzPerPortion),
      packedLb: lb(c.platedOzPerPortion),
      laborHours: labor.totalLaborHours,
      laborCost: labor.directLaborCost,
      foodCostStandard: c.totalFoodCostPerPortion * produced,
      purchase: { lines: purchase.lines, total: purchase.total },
    });
  }

  const purchase = mergePurchaseLines(runs.flatMap((r) => r.purchase.lines));
  const cyclesRequired = runs.reduce((s, r) => s + r.batchesNeeded, 0);
  const labor = laborRequirement(
    schedule.filter((b) => b.fits).map((b) => ({ seq: b.seq, loadMin: b.loadMin, portions: b.portions })),
    input.capacityInputs,
  );
  return {
    productionDate: input.productionDate,
    runs,
    cyclesRequired,
    cyclesAvailable,
    fits: cyclesRequired <= cyclesAvailable,
    schedule,
    totalRequired: runs.reduce((s, r) => s + r.required, 0),
    totalProduced: runs.reduce((s, r) => s + r.produced, 0),
    totalShortfall: runs.reduce((s, r) => s + r.shortfall, 0),
    chilledLb: runs.reduce((s, r) => s + r.chilledLb, 0),
    chilledCeilingLb: lbPerCycle * cyclesAvailable,
    laborHours: runs.reduce((s, r) => s + r.laborHours, 0),
    laborCost: runs.reduce((s, r) => s + r.laborCost, 0),
    foodCostStandard: runs.reduce((s, r) => s + r.foodCostStandard, 0),
    purchase,
    requirement: toRequirementLines(purchase.lines),
    chillWindow: window,
    labor,
    staffing: checkStaffing(labor, input.crews ?? [], dayCapacity, input.capacityInputs),
  };
}

// ── Delivery date → production date ─────────────────────────────────────────

/**
 * The last production day strictly before a delivery date (cook-chill: made the
 * day before, at the latest). A production day is a production weekday not
 * inside a kitchen closure (Roadmap J1); the search looks back as far as needed
 * so a multi-day holiday still resolves to the last production day before it.
 */
export function productionDateFor(deliveryDate: string, productionWeekdays: readonly number[] = [1, 2, 3, 4, 5], closures?: readonly DateRange[]): string {
  let d = isoAddDays(deliveryDate, -1);
  for (let i = 0; i < 366; i++) {
    if (productionWeekdays.includes(weekdayOf(d)) && !isClosed(d, closures)) return d;
    d = isoAddDays(d, -1);
  }
  return isoAddDays(deliveryDate, -1);
}

// ── The horizon: rolling stock across a date range ──────────────────────────

export interface HorizonDeliveryDay {
  date: string;
  productionDate: string;
  orderedMeals: number;
  orderedBase: number;
  filledBase: number;
  unfilledBase: number;
  byChannel: { channel: number; meals: number; filledMeals: number }[];
  byRecipe: { recipeCode: string; recipeName: string; orderedBase: number; filledBase: number }[];
}

export interface HorizonProductionDay extends DayPlan {
  deliveryDates: string[];
}

/** One date of the horizon: what was made, what shipped, what expired and what is left. */
export interface HorizonDay {
  date: string;
  /** Whole batches cooked that day. */
  batches: number;
  portionsProduced: number;
  cyclesUsed: number;
  cyclesAvailable: number;
  /** Cycles used ÷ cycles available; 0 on a day with no production. */
  utilisation: number;
  orderedBase: number;
  filledBase: number;
  unfilledBase: number;
  /** Stock that reached its hold-life end on this date unconsumed. */
  expiredBase: number;
  /** Finished goods still inside hold life at the end of the date. */
  closingStockBase: number;
  /** False when the day's batches exceed the plant's cycles. */
  fits: boolean;
}

export interface HorizonChannel {
  channel: number;
  orderedMeals: number;
  filledMeals: number;
  /** Filled ÷ ordered — the share the chiller could serve over the horizon. */
  share: number;
}

export interface HorizonPlan {
  from: string;
  to: string;
  productionDays: HorizonProductionDay[];
  deliveryDays: HorizonDeliveryDay[];
  /** Every date in the window that made, shipped, expired or held stock — the calendar's rows. */
  byDate: HorizonDay[];
  byChannel: HorizonChannel[];
  byRecipe: { recipeCode: string; recipeName: string; orderedBase: number; producedBase: number; batches: number }[];
  /** Finished-goods lots still inside hold life at the end of the window. */
  closingLots: FinishedLot[];
  totals: {
    orderedMeals: number;
    filledMeals: number;
    orderedBase: number;
    filledBase: number;
    producedBase: number;
    batches: number;
    cyclesUsed: number;
    cyclesAvailable: number;
    /** Cycles used ÷ cycles available on production days with a run. */
    utilisation: number;
    expiredBase: number;
    closingStockBase: number;
    daysThatDoNotFit: number;
  };
}

/**
 * Roll the order book through production. Orders on a delivery date are made
 * on the last production weekday before it, netted against what is on hand
 * that morning; whole batches overshoot into stock, stock expires past hold
 * life, and a delivery date draws its orders from stock oldest first. Filled
 * meals per channel follow the recipe's filled share equally.
 */
export function planHorizon(input: {
  from: string;
  to: string;
  book: readonly BookOrder[];
  recipes: readonly RecipeDef[];
  capacityInputs: CapacityInputs;
  assumptions: Assumptions;
  portionFactorByChannel: Record<number, number>;
  openingLots: readonly FinishedLot[];
  holdLifeDays: number;
  productionWeekdays?: readonly number[];
  channels?: readonly number[];
  /** Each recipe's own assumptions (Roadmap N3); passed through to each day. */
  recipeAssumptions?: Readonly<Record<string, Assumptions>>;
  /** Proposed crews, checked against each production day's labor requirement. */
  crews?: readonly CrewShift[];
  /** Kitchen closures: no production falls on a closed date (Roadmap N4a fix). */
  closures?: readonly DateRange[];
  /** Lines in service on a production date (Roadmap N4b). Omitted = one line every day. */
  linesOn?: (date: string) => number;
}): HorizonPlan {
  const weekdays = input.productionWeekdays ?? [1, 2, 3, 4, 5];
  const lots: FinishedLot[] = input.openingLots.map((l) => ({ ...l }));
  const inRange = input.book.filter((o) => o.orderDate >= input.from && o.orderDate <= input.to);
  const deliveryDates = [...new Set(inRange.map((o) => o.orderDate))].sort();

  // Group delivery dates by the production date that serves them.
  const byProduction = new Map<string, string[]>();
  for (const d of deliveryDates) {
    const p = productionDateFor(d, weekdays, input.closures);
    byProduction.set(p, [...(byProduction.get(p) ?? []), d]);
  }
  const productionDates = [...byProduction.keys()].sort();

  const productionDays: HorizonProductionDay[] = [];
  const deliveryDays: HorizonDeliveryDay[] = [];
  let expiredBase = 0;
  const events: { date: string; kind: 'produce' | 'deliver'; key: string }[] = [
    ...productionDates.map((p) => ({ date: p, kind: 'produce' as const, key: p })),
    ...deliveryDates.map((d) => ({ date: d, kind: 'deliver' as const, key: d })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'deliver' ? -1 : 1));

  const expiredOn: Record<string, number> = {};
  const closingOn: Record<string, number> = {};
  /** Expire what is past its hold life, counting it against `attributeTo` (the date being processed). */
  const expireThrough = (date: string, attributeTo: string = date) => {
    for (const lot of lots) {
      if (lot.remaining > 0 && lot.expires < date) {
        expiredBase += lot.remaining;
        expiredOn[attributeTo] = (expiredOn[attributeTo] ?? 0) + lot.remaining;
        lot.remaining = 0;
      }
    }
  };

  for (const ev of events) {
    expireThrough(ev.date);
    if (ev.kind === 'produce') {
      const served = byProduction.get(ev.key) ?? [];
      const orders = inRange.filter((o) => served.includes(o.orderDate));
      const requirements = requirementsFor(orders, input.recipes, input.portionFactorByChannel);
      const onHand: Record<string, number> = {};
      // Stock counts only if it is still inside hold life on the first delivery this production serves:
      // a lot that expires over the weekend cannot fill Monday's orders.
      const servesFrom = [...served].sort()[0] ?? ev.date;
      for (const lot of lots) {
        if (lot.remaining <= 0 || lot.expires < servesFrom) continue;
        onHand[lot.recipeCode] = (onHand[lot.recipeCode] ?? 0) + lot.remaining;
      }
      const plan = planProductionDay({ productionDate: ev.date, requirements, onHand, recipes: input.recipes, capacityInputs: input.capacityInputs, assumptions: input.assumptions, recipeAssumptions: input.recipeAssumptions, crews: input.crews, lines: input.linesOn?.(ev.date) });
      for (const run of plan.runs) {
        if (run.produced <= 0) continue;
        lots.push({ batchId: `plan-${ev.date}-${run.recipeCode}`, recipeCode: run.recipeCode, produced: ev.date, expires: isoAddDays(ev.date, input.holdLifeDays), qtyProduced: run.produced, remaining: run.produced });
      }
      productionDays.push({ ...plan, deliveryDates: served });
    } else {
      const orders = inRange.filter((o) => o.orderDate === ev.key);
      const reqs = requirementsFor(orders, input.recipes, input.portionFactorByChannel);
      const byRecipe: HorizonDeliveryDay['byRecipe'] = [];
      const fillShare: Record<string, number> = {};
      for (const r of reqs) {
        const left = drawFifo(lots, r.recipeCode, ev.date, r.basePortions);
        const filled = r.basePortions - left;
        fillShare[r.recipeCode] = r.basePortions > 0 ? filled / r.basePortions : 1;
        byRecipe.push({ recipeCode: r.recipeCode, recipeName: r.recipeName, orderedBase: r.basePortions, filledBase: filled });
      }
      const byChannel = new Map<number, { channel: number; meals: number; filledMeals: number }>();
      for (const o of orders) {
        const row = byChannel.get(o.channel) ?? { channel: o.channel, meals: 0, filledMeals: 0 };
        row.meals += o.meals;
        row.filledMeals += o.meals * (fillShare[o.recipeCode] ?? 0);
        byChannel.set(o.channel, row);
      }
      const orderedBase = byRecipe.reduce((s, r) => s + r.orderedBase, 0);
      const filledBase = byRecipe.reduce((s, r) => s + r.filledBase, 0);
      deliveryDays.push({
        date: ev.key,
        productionDate: productionDateFor(ev.key, weekdays, input.closures),
        orderedMeals: orders.reduce((s, o) => s + o.meals, 0),
        orderedBase,
        filledBase,
        unfilledBase: orderedBase - filledBase,
        byChannel: [...byChannel.values()].sort((a, b) => a.channel - b.channel),
        byRecipe,
      });
    }
    closingOn[ev.date] = lots.reduce((s, l) => s + Math.max(0, l.remaining), 0);
  }
  expireThrough(isoAddDays(input.to, 1), input.to);
  closingOn[input.to] = lots.reduce((s, l) => s + Math.max(0, l.remaining), 0);

  const channels = input.channels ?? [1, 2, 3];
  const byChannel: HorizonChannel[] = channels.map((ch) => {
    const orderedMeals = deliveryDays.reduce((s, d) => s + (d.byChannel.find((c) => c.channel === ch)?.meals ?? 0), 0);
    const filledMeals = deliveryDays.reduce((s, d) => s + (d.byChannel.find((c) => c.channel === ch)?.filledMeals ?? 0), 0);
    return { channel: ch, orderedMeals, filledMeals, share: orderedMeals > 0 ? filledMeals / orderedMeals : 1 };
  });
  const recipeTotals = new Map<string, HorizonPlan['byRecipe'][number]>();
  for (const d of deliveryDays) for (const r of d.byRecipe) {
    const row = recipeTotals.get(r.recipeCode) ?? { recipeCode: r.recipeCode, recipeName: r.recipeName, orderedBase: 0, producedBase: 0, batches: 0 };
    row.orderedBase += r.orderedBase;
    recipeTotals.set(r.recipeCode, row);
  }
  for (const p of productionDays) for (const run of p.runs) {
    const row = recipeTotals.get(run.recipeCode) ?? { recipeCode: run.recipeCode, recipeName: run.recipeName, orderedBase: 0, producedBase: 0, batches: 0 };
    row.producedBase += run.produced;
    row.batches += run.batchesScheduled;
    recipeTotals.set(run.recipeCode, row);
  }
  const cyclesUsed = productionDays.reduce((s, p) => s + p.runs.reduce((a, r) => a + r.batchesScheduled, 0), 0);
  const cyclesAvailable = productionDays.reduce((s, p) => s + p.cyclesAvailable, 0);

  // One row per date that made, shipped, expired or held stock.
  const byDate: HorizonDay[] = [...new Set([...productionDays.map((p) => p.productionDate), ...deliveryDays.map((d) => d.date), ...Object.keys(expiredOn), ...Object.keys(closingOn)])]
    .filter((d) => d >= input.from && d <= input.to)
    .sort()
    .map((date) => {
      const p = productionDays.find((x) => x.productionDate === date);
      const d = deliveryDays.find((x) => x.date === date);
      const used = p ? p.runs.reduce((s, r) => s + r.batchesScheduled, 0) : 0;
      const available = p?.cyclesAvailable ?? 0;
      return {
        date,
        batches: used,
        portionsProduced: p?.totalProduced ?? 0,
        cyclesUsed: used,
        cyclesAvailable: available,
        utilisation: available > 0 ? used / available : 0,
        orderedBase: d?.orderedBase ?? 0,
        filledBase: d?.filledBase ?? 0,
        unfilledBase: d?.unfilledBase ?? 0,
        expiredBase: expiredOn[date] ?? 0,
        closingStockBase: closingOn[date] ?? 0,
        fits: p ? p.fits : true,
      };
    });

  return {
    from: input.from,
    to: input.to,
    productionDays,
    deliveryDays,
    byDate,
    byChannel,
    byRecipe: [...recipeTotals.values()].sort((a, b) => b.orderedBase - a.orderedBase),
    closingLots: lots.filter((l) => l.remaining > 0),
    totals: {
      orderedMeals: deliveryDays.reduce((s, d) => s + d.orderedMeals, 0),
      filledMeals: byChannel.reduce((s, c) => s + c.filledMeals, 0),
      orderedBase: deliveryDays.reduce((s, d) => s + d.orderedBase, 0),
      filledBase: deliveryDays.reduce((s, d) => s + d.filledBase, 0),
      producedBase: productionDays.reduce((s, p) => s + p.totalProduced, 0),
      batches: cyclesUsed,
      cyclesUsed,
      cyclesAvailable,
      utilisation: cyclesAvailable > 0 ? cyclesUsed / cyclesAvailable : 0,
      expiredBase,
      closingStockBase: lots.reduce((s, l) => s + l.remaining, 0),
      daysThatDoNotFit: productionDays.filter((p) => !p.fits).length,
    },
  };
}

// ── Level 1: a single recipe run ────────────────────────────────────────────

export interface SingleRun {
  cap: CapacityProfile;
  meals: number;
  basePortions: number;
  onHand: number;
  net: number;
  batches: number;
  produced: number;
  closing: number;
  cyclesRequired: number;
  cyclesAvailable: number;
  fits: boolean;
  purchasedLb: number;
  cookedLb: number;
  chilledLb: number;
  packedLb: number;
  costPerPlatedOz: number;
  laborHours: number;
  laborCost: number;
  laborPerPortion: number;
  /** Recipe standard for the portions produced, incl. shrink. */
  foodCostStandard: number;
  purchase: { lines: PurchaseOrderLine[]; total: number };
  /** Purchase against standard: case rounding held in raw materials. */
  carriedForward: number;
  /** Economics of the meals ordered at the channel's portion, premium and price. */
  foodCostPerMeal: number;
  packagingPerMeal: number;
  deliveryPerMeal: number;
  commissionPerMeal: number;
  revenue: number;
  foodCostSold: number;
  packaging: number;
  delivery: number;
  commission: number;
  /** Revenue less food, run labor, packaging, delivery and commission. Fixed overhead is not in it. */
  contribution: number;
  contributionPerMeal: number;
}

export function singleRecipeRun(input: {
  recipe: RecipeDef;
  meals: number;
  portionFactor: number;
  premiumFactor: number;
  pricePerMeal: number;
  /** Marketplace commission as a share of price (Phase 3), else 0. */
  commissionShare: number;
  openingInventory: number;
  capacityInputs: CapacityInputs;
  assumptions: Assumptions;
}): SingleRun {
  const a = input.assumptions;
  const shrink = a.yield.shrinkAllowance.value;
  const cap = deriveCapacity(input.recipe, input.capacityInputs, 1);
  const basePortions = input.meals * input.portionFactor;
  const net = Math.max(0, basePortions - input.openingInventory);
  const batches = cap.batchSize > 0 ? Math.max(0, Math.ceil(net / cap.batchSize - 1e-9)) : 0;
  const produced = batches * cap.batchSize;
  const c = costRecipe(input.recipe, shrink);
  const k = componentCosting(input.recipe, shrink);
  const lb = (oz: number) => (oz * produced) / OZ_PER_LB;
  const labor = laborForDay(batches, produced, a);
  const purchase = purchaseOrderForRun(produced, input.recipe, shrink);
  const foodCostStandard = c.totalFoodCostPerPortion * produced;
  const foodCostPerMeal = c.totalFoodCostPerPortion * input.portionFactor * input.premiumFactor;
  const packagingPerMeal = a.perMeal.packaging.value;
  const deliveryPerMeal = a.perMeal.delivery.value;
  const commissionPerMeal = input.pricePerMeal * input.commissionShare;
  const revenue = input.meals * input.pricePerMeal;
  const foodCostSold = input.meals * foodCostPerMeal;
  const packaging = input.meals * packagingPerMeal;
  const delivery = input.meals * deliveryPerMeal;
  const commission = input.meals * commissionPerMeal;
  const contribution = revenue - foodCostSold - labor.directLaborCost - packaging - delivery - commission;
  return {
    cap,
    meals: input.meals,
    basePortions,
    onHand: input.openingInventory,
    net,
    batches,
    produced,
    closing: input.openingInventory + produced - basePortions,
    cyclesRequired: batches,
    cyclesAvailable: cap.cyclesPerDay,
    fits: batches <= cap.cyclesPerDay,
    purchasedLb: lb(c.apOzPerPortion),
    cookedLb: lb(c.cookedOzPerPortion),
    chilledLb: lb(k.filter((x) => x.isHot).reduce((s, x) => s + x.chilledOz, 0)),
    packedLb: lb(c.platedOzPerPortion),
    costPerPlatedOz: c.costPerPlatedOz,
    laborHours: labor.totalLaborHours,
    laborCost: labor.directLaborCost,
    laborPerPortion: labor.laborCostPerPortion,
    foodCostStandard,
    purchase: { lines: purchase.lines, total: purchase.total },
    carriedForward: purchase.total - foodCostStandard,
    foodCostPerMeal,
    packagingPerMeal,
    deliveryPerMeal,
    commissionPerMeal,
    revenue,
    foodCostSold,
    packaging,
    delivery,
    commission,
    contribution,
    contributionPerMeal: input.meals > 0 ? contribution / input.meals : 0,
  };
}

/** The chiller ceiling per recipe — batch sizes differ with mass, first loads with cook times. */
export function ceilingByRecipe(recipes: readonly RecipeDef[], capacityInputs: CapacityInputs): { recipeCode: string; recipeName: string; status: RecipeDef['status']; batchSize: number; chilledMassPerPortion: number; maxPortionsPerDay: number; cyclesPerDay: number; cookToChillMinutes: number | null; firstLoadMin: number | null; thermalGaps: number }[] {
  return recipes.map((r) => {
    const cap = deriveCapacity(r, capacityInputs, 1);
    return {
      recipeCode: r.code,
      recipeName: r.name,
      status: r.status,
      batchSize: cap.batchSize,
      chilledMassPerPortion: cap.chilledMassPerPortion,
      maxPortionsPerDay: cap.maxPortionsPerDay,
      cyclesPerDay: cap.cyclesPerDay,
      cookToChillMinutes: cap.thermal.cookToChillMinutes,
      firstLoadMin: cap.chillWindow.firstLoadBasis === 'none' ? null : cap.chillWindow.startMin,
      thermalGaps: cap.thermal.gaps.length,
    };
  });
}
