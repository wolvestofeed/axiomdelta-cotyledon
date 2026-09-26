/**
 * MicroFarm — production planning in three levels, engine-side.
 *
 * Ledger-free, database-free. Roadmap Phase H4.
 *
 *   1. Single crop plan run — one library crop plan, a quantity, a channel and a
 *      price, run through sowing sizing, the weight chain, labor, the purchase
 *      requirement and the economics. The "forecast task".
 *   2. Distribution day — every order on a date, exploded across crop plans into base
 *      units, netted against finished goods on hand (sowing records inside
 *      shelf life, less what distributed orders drew), sized into whole sowings
 *      per crop plan, each placed on a grow unit with room for its cycle, with one
 *      purchase requirement merged across crop plans.
 *   3. Horizon — the same over a date range, rolling: each order is sown on its
 *      plan's sow date and is stock from its first harvest day, overshoot is stock while inside hold
 *      life and expired stock is named as waste, and what could not be made is
 *      an unfilled order, not a refused plan.
 *
 * Every figure is computed from the crop plan library, the order book and the
 * capacity inputs; nothing here is stored.
 */

import { isClosed, type DateRange } from '@/engine/periods';
import type { GrowPlanCarrier } from '@/engine/grow-plan-bridge';
import type { ResolvedInputs } from '@/engine/scenario';
import type { BookOrder } from '@/engine/orders';
import { isoAddDays, weekdayOf } from '@/engine/orders';
import { deriveCapacity, costCropPlan, laborForDay, purchaseOrderForRun, type PurchaseOrderLine, type CapacityProfile } from '@/engine';
import { laborRequirement, checkStaffing, withUnplacedTasks, type LaborRequirement, type StaffingCheck, type UnplacedTask } from '@/engine/staffing';
import { laborStandard, studiesForCropPlan } from '@/engine/time-studies';
import { estimatedTimeStudy } from '@/engine/time-study-estimate';
import type { TimeStudyDoc } from '@/data/time-studies';
import type { CrewShift } from '@/data/crews';
import type { RequirementLine } from '@/engine/catalog';
import { defaultGrowUnits } from '@/engine';
import type { GrowUnit } from '@/engine/grow-capacity';
import { ShelfLedger, calendarFromSowings, sowDateFor, stockDateFor, type GrowCalendar } from '@/engine/grow-calendar';

type Assumptions = ResolvedInputs['assumptions'];
type CapacityInputs = ResolvedInputs['capacityInputs'];

const OZ_PER_LB = 16;

// ── Requirements from the order book ────────────────────────────────────────

export interface ChannelUnits {
  channel: number;
  units: number;
  /** Base units per unit: 1 for a crop plan on its own channel, else the channel unit factor. */
  unitFactor: number;
}

export interface CropPlanRequirement {
  cropPlanCode: string;
  cropPlanName: string;
  /** Units ordered. */
  units: number;
  /** Base-unit equivalents the farm has to make. */
  baseUnits: number;
  byChannel: ChannelUnits[];
  orders: number;
  inLibrary: boolean;
}

/**
 * Base units per unit for an order. A crop plan that lists the channel is
 * served at its own unit (an adult crop plan carries its upgrade in its
 * lines), so the factor is 1; the channel unit factor applies only when a
 * crop plan is served on a channel it is not authored for (the code crop plan on
 * Phase 2, say) — the legacy scaling until every channel has its own crop plans.
 */
export function unitFactorFor(cropPlan: GrowPlanCarrier | undefined, channel: number, unitFactorByChannel: Record<number, number>): number {
  if (cropPlan && cropPlan.channels.includes(channel)) return 1;
  return unitFactorByChannel[channel] ?? 1;
}

/** The crop plans a set of orders needs, in base units, largest first. */
export function requirementsFor(
  orders: readonly BookOrder[],
  cropPlans: readonly GrowPlanCarrier[],
  unitFactorByChannel: Record<number, number>,
): CropPlanRequirement[] {
  const byCode = new Map<string, CropPlanRequirement>();
  for (const o of orders) {
    const lib = cropPlans.find((r) => r.code === o.cropPlanCode);
    const pf = unitFactorFor(lib, o.channel, unitFactorByChannel);
    const row = byCode.get(o.cropPlanCode) ?? {
      cropPlanCode: o.cropPlanCode,
      cropPlanName: lib?.name ?? o.cropPlanName,
      units: 0,
      baseUnits: 0,
      byChannel: [],
      orders: 0,
      inLibrary: Boolean(lib),
    };
    row.units += o.units;
    row.baseUnits += o.units * pf;
    row.orders += 1;
    const ch = row.byChannel.find((c) => c.channel === o.channel);
    if (ch) ch.units += o.units;
    else row.byChannel.push({ channel: o.channel, units: o.units, unitFactor: pf });
    byCode.set(o.cropPlanCode, row);
  }
  return [...byCode.values()].sort((a, b) => b.baseUnits - a.baseUnits || a.cropPlanCode.localeCompare(b.cropPlanCode));
}

// ── Finished goods on hand, from records ────────────────────────────────────

export interface FinishedLot {
  sowingId: string;
  cropPlanCode: string;
  /** First date the lot is stock: a grow sowing's first harvest day, otherwise its production date. */
  produced: string;
  /** Last date the lot is inside shelf life. */
  expires: string;
  qtyProduced: number;
  remaining: number;
}

export interface Consumption {
  cropPlanCode: string;
  date: string;
  baseUnits: number;
}

export interface OnHand {
  lots: FinishedLot[];
  /** Base units on hand and inside shelf life, by crop plan. */
  byCropPlan: Record<string, number>;
  /** Base units that expired unconsumed on or before `asOf`, by crop plan. */
  expiredByCropPlan: Record<string, number>;
  /** Consumption that found no stock, by crop plan. */
  unmatchedByCropPlan: Record<string, number>;
}

/**
 * What distributed orders drew from finished goods: each distributed order's units
 * (the distribution's count when one is linked) on its distribution date, in base
 * units. One function for every surface that nets stock from the records.
 */
export function distributedConsumption(
  orders: readonly { status: string; distributionId: string | null; cropPlanCode: string; channel: number; orderDate: string; units: number }[],
  distributions: readonly { id: string; distributedOn: string; units: number }[],
  cropPlans: readonly GrowPlanCarrier[],
  unitFactorByChannel: Record<number, number>,
): Consumption[] {
  const byId = new Map(distributions.map((d) => [d.id, d]));
  return orders
    .filter((o) => o.status === 'distributed')
    .map((o) => {
      const d = o.distributionId ? byId.get(o.distributionId) : undefined;
      const pf = unitFactorFor(cropPlans.find((r) => r.code === o.cropPlanCode), o.channel, unitFactorByChannel);
      return { cropPlanCode: o.cropPlanCode, date: d?.distributedOn ?? o.orderDate, baseUnits: (d?.units ?? o.units) * pf };
    });
}

/** Draw `qty` from the oldest unexpired lots of a crop plan on a date, FIFO. Returns what could not be drawn. */
function drawFifo(lots: FinishedLot[], cropPlanCode: string, date: string, qty: number): number {
  let left = qty;
  for (const lot of lots) {
    if (left <= 1e-9) break;
    if (lot.cropPlanCode !== cropPlanCode || lot.remaining <= 0) continue;
    if (lot.produced > date || lot.expires < date) continue;
    const take = Math.min(lot.remaining, left);
    lot.remaining -= take;
    left -= take;
  }
  return Math.max(0, left);
}

/**
 * Finished goods from the sowing records: each closed sowing is a lot of good
 * units that is stock from its stock date (a grow sowing's first harvest day,
 * otherwise its production date), inside shelf life for `shelfLifeDays`
 * from then. Distributed orders draw from the oldest lot of their crop plan first.
 */
export function finishedGoodsOnHand(input: {
  sowings: readonly { sowingId: string; cropPlanCode: string; productionDate: string; goodUnits: number }[];
  consumed: readonly Consumption[];
  shelfLifeDays: number;
  asOf: string;
  /** The library the records' plans are read from, for each lot's stock date. */
  cropPlans: readonly GrowPlanCarrier[];
}): OnHand {
  const lots: FinishedLot[] = input.sowings
    .map((b) => {
      const produced = stockDateFor(input.cropPlans.find((r) => r.code === b.cropPlanCode), b.productionDate);
      return {
        sowingId: b.sowingId,
        cropPlanCode: b.cropPlanCode,
        produced,
        expires: isoAddDays(produced, input.shelfLifeDays),
        qtyProduced: b.goodUnits,
        remaining: b.goodUnits,
      };
    })
    .filter((l) => l.produced <= input.asOf)
    .sort((a, b) => a.produced.localeCompare(b.produced) || a.sowingId.localeCompare(b.sowingId));
  const unmatchedByCropPlan: Record<string, number> = {};
  for (const c of [...input.consumed].sort((a, b) => a.date.localeCompare(b.date))) {
    if (c.date > input.asOf) continue;
    const left = drawFifo(lots, c.cropPlanCode, c.date, c.baseUnits);
    if (left > 0) unmatchedByCropPlan[c.cropPlanCode] = (unmatchedByCropPlan[c.cropPlanCode] ?? 0) + left;
  }
  const byCropPlan: Record<string, number> = {};
  const expiredByCropPlan: Record<string, number> = {};
  for (const lot of lots) {
    if (lot.remaining <= 0) continue;
    if (lot.expires < input.asOf) expiredByCropPlan[lot.cropPlanCode] = (expiredByCropPlan[lot.cropPlanCode] ?? 0) + lot.remaining;
    else byCropPlan[lot.cropPlanCode] = (byCropPlan[lot.cropPlanCode] ?? 0) + lot.remaining;
  }
  return { lots, byCropPlan, expiredByCropPlan, unmatchedByCropPlan };
}

// ── A production day: whole sowings per plan, each on a grow unit for its cycle ───

export interface CropPlanRunPlan {
  cropPlanCode: string;
  cropPlanName: string;
  /** Base units the orders need. */
  required: number;
  onHand: number;
  net: number;
  sowingSize: number;
  sowingsNeeded: number;
  /** Sowings a grow unit took, after the plans ahead of it. */
  sowingsScheduled: number;
  produced: number;
  /** Net requirement not made because no grow unit had room for the sowing's cycle. */
  shortfall: number;
  closing: number;
  harvestedLb: number;
  purchasedLb: number;
  packedLb: number;
  laborHours: number;
  laborCost: number;
  /** Crop plan standard for the units produced, incl. the shrink allowance. */
  inputCostStandard: number;
  purchase: { lines: PurchaseOrderLine[]; total: number };
}

export interface DayPlan {
  productionDate: string;
  runs: CropPlanRunPlan[];
  /** Sowings the requirements need. */
  cyclesRequired: number;
  /** Grow units that take a sowing of the day's plans — each starts at most one sowing a day. */
  cyclesAvailable: number;
  /** Every sowing needed was placed on a grow unit for its cycle. */
  fits: boolean;
  totalRequired: number;
  totalProduced: number;
  totalShortfall: number;
  laborHours: number;
  laborCost: number;
  inputCostStandard: number;
  purchase: { lines: PurchaseOrderLine[]; total: number };
  requirement: RequirementLine[];
  /** The labor the placed sowings require — staff-hours by clock interval and headcount per task. */
  labor: LaborRequirement;
  /** Proposed crews checked against `labor`. Findings only; the ceiling is the plant's. */
  staffing: StaffingCheck;
}

/** Merge purchase-order lines across crop plans by input; cases re-rounded on the sum. */
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
    cur.seedPerSowing = 0;
  }
  const lines = [...m.values()].map((l) => {
    const casesToOrder = Math.max(0, Math.ceil(l.requiredForProduction / l.packSize - 1e-9));
    return { ...l, casesToOrder, extendedCost: casesToOrder * l.packSize * l.seedUnitCost };
  });
  return { lines, total: lines.reduce((s, l) => s + l.extendedCost, 0) };
}

export function toRequirementLines(lines: readonly PurchaseOrderLine[]): RequirementLine[] {
  return lines.map((l) => ({
    input: l.name,
    qty: l.casesToOrder * l.packSize,
    unit: l.unit,
    packSize: l.packSize,
    casesToOrder: l.casesToOrder,
    fallbackUnitCost: l.seedUnitCost,
  }));
}

/**
 * Plan one production day. Requirements are in base units (trays); each plan's sowing is what
 * one grow unit takes of its format. Plans are taken in requirement order: each needed sowing
 * is placed on a grow unit with room for its whole cycle (`placeSowing`, the horizon's shelf
 * ledger), and a sowing no unit takes is a named shortfall. The placed sowings emit the day's
 * sowing-stream labor, and any proposed crews are checked against it.
 */
export function planProductionDay(input: {
  productionDate: string;
  requirements: readonly CropPlanRequirement[];
  onHand: Record<string, number>;
  cropPlans: readonly GrowPlanCarrier[];
  capacityInputs: CapacityInputs;
  assumptions: Assumptions;
  /**
   * Each plan's own assumptions — its labor standard and packaging (Roadmap N3). A run is costed
   * at its plan's; omitted, every run falls back to `assumptions`.
   */
  cropPlanAssumptions?: Readonly<Record<string, Assumptions>>;
  /** Proposed crews to check against the day's labor requirement. Omitted = none proposed. */
  crews?: readonly CrewShift[];
  /**
   * A sowing is placed on a grow unit for its cycle days (`grow-calendar.ts`); the horizon passes
   * its shelf ledger so a unit full of last week's trays takes no sowing today. Omitted, every
   * sowing is taken as placed.
   */
  placeSowing?: (cropPlan: GrowPlanCarrier, productionDate: string, trays: number) => boolean;
  /**
   * The time studies a plan's sowing-stream labor is read from (its labor standard); a plan with
   * none runs on its estimated study. Omitted, every plan runs on its estimate.
   */
  studies?: readonly TimeStudyDoc[];
}): DayPlan {
  const shrink = input.assumptions.yield.shrinkAllowance.value;
  const planned = input.requirements
    .map((req) => {
      const cropPlan = input.cropPlans.find((r) => r.code === req.cropPlanCode);
      return cropPlan ? { req, cropPlan, cap: deriveCapacity(cropPlan, input.capacityInputs, 1) } : null;
    })
    .filter((p): p is { req: CropPlanRequirement; cropPlan: GrowPlanCarrier; cap: CapacityProfile } => p !== null);
  const runs: CropPlanRunPlan[] = [];

  for (const { req, cropPlan, cap } of planned) {
    const onHand = input.onHand[req.cropPlanCode] ?? 0;
    const net = Math.max(0, req.baseUnits - onHand);
    const sowingsNeeded = cap.sowingSize > 0 ? Math.max(0, Math.ceil(net / cap.sowingSize - 1e-9)) : 0;
    let sowingsScheduled = 0;
    for (let b = 0; b < sowingsNeeded; b++) {
      if (input.placeSowing ? input.placeSowing(cropPlan, input.productionDate, cap.sowingSize) : true) sowingsScheduled += 1;
    }
    const produced = sowingsScheduled * cap.sowingSize;
    const c = costCropPlan(cropPlan, shrink);
    const lb = (oz: number) => (oz * produced) / OZ_PER_LB;
    const labor = laborForDay(sowingsScheduled, produced, input.cropPlanAssumptions?.[cropPlan.code] ?? input.assumptions);
    const purchase = purchaseOrderForRun(produced, cropPlan, shrink);
    runs.push({
      cropPlanCode: cropPlan.code,
      cropPlanName: cropPlan.name,
      required: req.baseUnits,
      onHand,
      net,
      sowingSize: cap.sowingSize,
      sowingsNeeded,
      sowingsScheduled,
      produced,
      shortfall: Math.max(0, net - produced),
      closing: onHand + produced - Math.min(req.baseUnits, onHand + produced),
      harvestedLb: lb(c.harvestedOzPerUnit),
      purchasedLb: lb(c.seedOzPerUnit),
      packedLb: lb(c.packedOzPerUnit),
      laborHours: labor.totalLaborHours,
      laborCost: labor.directLaborCost,
      inputCostStandard: c.totalInputCostPerUnit * produced,
      purchase: { lines: purchase.lines, total: purchase.total },
    });
  }

  const purchase = mergePurchaseLines(runs.flatMap((r) => r.purchase.lines));
  // A sow day's labor is each plan's sowing-stream lines, not placed on the clock here (the Day Schedule places them).
  const dayLabor = laborRequirement(input.capacityInputs);
  const sown = runs.filter((r) => r.sowingsScheduled > 0);
  const labor = sown.length === 0 ? dayLabor : withUnplacedTasks(dayLabor, sown.flatMap((r) => growSowingTasks(input.cropPlans.find((x) => x.code === r.cropPlanCode)!, r, input.studies ?? [])), sown.reduce((s, r) => s + r.sowingsScheduled, 0), sown.reduce((s, r) => s + r.produced, 0));
  return {
    productionDate: input.productionDate,
    runs,
    cyclesRequired: runs.reduce((s, r) => s + r.sowingsNeeded, 0),
    cyclesAvailable: planned.length ? Math.max(...planned.map((p) => p.cap.cyclesPerDay)) : 0,
    fits: runs.every((r) => r.sowingsScheduled >= r.sowingsNeeded),
    totalRequired: runs.reduce((s, r) => s + r.required, 0),
    totalProduced: runs.reduce((s, r) => s + r.produced, 0),
    totalShortfall: runs.reduce((s, r) => s + r.shortfall, 0),
    laborHours: runs.reduce((s, r) => s + r.laborHours, 0),
    laborCost: runs.reduce((s, r) => s + r.laborCost, 0),
    inputCostStandard: runs.reduce((s, r) => s + r.inputCostStandard, 0),
    purchase,
    requirement: toRequirementLines(purchase.lines),
    labor,
    staffing: checkStaffing(labor, input.crews ?? []),
  };
}

/**
 * A grow run's sowing-stream lines from its plan's labor standard, scaled to the run: a fixed line
 * once per sowing, a per-tray line on the study's own sowing size times the trays sown.
 */
function growSowingTasks(cropPlan: GrowPlanCarrier, run: Pick<CropPlanRunPlan, 'sowingsScheduled' | 'produced' | 'sowingSize'>, studies: readonly TimeStudyDoc[]): UnplacedTask[] {
  const study = laborStandard(studiesForCropPlan(studies, cropPlan.code)) ?? estimatedTimeStudy(cropPlan, run.sowingSize);
  return study.lines
    .filter((l) => l.stream === 'sowing')
    .map((l) => ({
      task: l.task,
      station: l.station ?? '—',
      staff: l.staff,
      controlPoint: null,
      scalesWith: l.scalesWith,
      laborMinutes: l.scalesWith === 'fixed' ? l.laborMinutes * run.sowingsScheduled : study.sowingSize > 0 ? (l.laborMinutes / study.sowingSize) * run.produced : 0,
    }));
}

// ── Distribution date → production date ─────────────────────────────────────────

/**
 * The last production day strictly before a distribution date (grow: made the
 * day before, at the latest). A production day is a production weekday not
 * inside a farm closure (Roadmap J1); the search looks back as far as needed
 * so a multi-day holiday still resolves to the last production day before it.
 */
export function productionDateFor(distributionDate: string, productionWeekdays: readonly number[] = [1, 2, 3, 4, 5], closures?: readonly DateRange[]): string {
  let d = isoAddDays(distributionDate, -1);
  for (let i = 0; i < 366; i++) {
    if (productionWeekdays.includes(weekdayOf(d)) && !isClosed(d, closures)) return d;
    d = isoAddDays(d, -1);
  }
  return isoAddDays(distributionDate, -1);
}

// ── The horizon: rolling stock across a date range ──────────────────────────

export interface HorizonDistributionDay {
  date: string;
  productionDate: string;
  orderedUnits: number;
  orderedBase: number;
  filledBase: number;
  unfilledBase: number;
  byChannel: { channel: number; units: number; filledUnits: number }[];
  byCropPlan: { cropPlanCode: string; cropPlanName: string; orderedBase: number; filledBase: number }[];
}

export interface HorizonProductionDay extends DayPlan {
  distributionDates: string[];
}

/** One date of the horizon: what was made, what shipped, what expired and what is left. */
export interface HorizonDay {
  date: string;
  /** Whole sowings harvested that day. */
  sowings: number;
  unitsProduced: number;
  cyclesUsed: number;
  cyclesAvailable: number;
  /** Sowings started ÷ the starts the grow units allow; 0 on a day with no production. */
  utilisation: number;
  orderedBase: number;
  filledBase: number;
  unfilledBase: number;
  /** Stock that reached its shelf-life end on this date unconsumed. */
  expiredBase: number;
  /** Finished goods still inside shelf life at the end of the date. */
  closingStockBase: number;
  /** False when a sowing the day needed had no grow unit with room. */
  fits: boolean;
}

export interface HorizonChannel {
  channel: number;
  orderedUnits: number;
  filledUnits: number;
  /** Filled ÷ ordered — the share the grow units could serve over the horizon. */
  share: number;
}

export interface HorizonPlan {
  from: string;
  to: string;
  productionDays: HorizonProductionDay[];
  distributionDays: HorizonDistributionDay[];
  /** Every date in the window that made, shipped, expired or held stock — the calendar's rows. */
  byDate: HorizonDay[];
  byChannel: HorizonChannel[];
  byCropPlan: { cropPlanCode: string; cropPlanName: string; orderedBase: number; producedBase: number; sowings: number }[];
  /** Finished-goods lots still inside shelf life at the end of the window. */
  closingLots: FinishedLot[];
  /** The sowings on the grow units across the window. */
  growCalendar: GrowCalendar;
  totals: {
    orderedUnits: number;
    filledUnits: number;
    orderedBase: number;
    filledBase: number;
    producedBase: number;
    sowings: number;
    cyclesUsed: number;
    cyclesAvailable: number;
    /** Sowings started ÷ the starts the grow units allow, on production days with a run. */
    utilisation: number;
    expiredBase: number;
    closingStockBase: number;
    daysThatDoNotFit: number;
  };
}

/**
 * Roll the order book through production. Orders on a distribution date are made
 * on the last production weekday before it, netted against what is on hand
 * that morning; whole sowings overshoot into stock, stock expires past hold
 * life, and a distribution date draws its orders from stock oldest first. Filled
 * units per channel follow the crop plan's filled share equally.
 */
export function planHorizon(input: {
  from: string;
  to: string;
  book: readonly BookOrder[];
  cropPlans: readonly GrowPlanCarrier[];
  capacityInputs: CapacityInputs;
  assumptions: Assumptions;
  unitFactorByChannel: Record<number, number>;
  openingLots: readonly FinishedLot[];
  shelfLifeDays: number;
  productionWeekdays?: readonly number[];
  channels?: readonly number[];
  /** Each crop plan's own assumptions (Roadmap N3); passed through to each day. */
  cropPlanAssumptions?: Readonly<Record<string, Assumptions>>;
  /** Proposed crews, checked against each production day's labor requirement. */
  crews?: readonly CrewShift[];
  /** Farm closures: no production falls on a closed date (Roadmap N4a fix). */
  closures?: readonly DateRange[];
  /** The grow units sowings are placed on for their cycle days. Omitted = the capacity inputs', else the seed. */
  growUnits?: readonly GrowUnit[];
  /** Sowings already on the shelves when the window opens (recorded sowings inside their cycle). */
  openingSowings?: readonly { cropPlanCode: string; sowDate: string; trays: number }[];
  /** The time studies a grow plan's sowing-stream labor is read from; passed through to each day. */
  studies?: readonly TimeStudyDoc[];
}): HorizonPlan {
  const weekdays = input.productionWeekdays ?? [1, 2, 3, 4, 5];
  const lots: FinishedLot[] = input.openingLots.map((l) => ({ ...l }));
  const inRange = input.book.filter((o) => o.orderDate >= input.from && o.orderDate <= input.to);
  const distributionDates = [...new Set(inRange.map((o) => o.orderDate))].sort();
  const growUnits = input.growUnits ?? input.capacityInputs.growUnits ?? defaultGrowUnits;
  const ledger = new ShelfLedger(growUnits);
  for (const o of input.openingSowings ?? []) {
    const cropPlan = input.cropPlans.find((r) => r.code === o.cropPlanCode);
    if (cropPlan && o.trays > 0) ledger.place(cropPlan, o.sowDate, o.trays, null);
  }
  // A placed sowing carries the first distribution date it serves, so a day page can list its own sowings.
  const placeSowingFor = (servesFrom: string) => (cropPlan: GrowPlanCarrier, productionDate: string, trays: number): boolean =>
    ledger.place(cropPlan, productionDate, trays, servesFrom).placed;

  // Each order is made on the production date its plan needs: a grow plan's sow date
  // (distribution date less days to harvest, on a production day), a plan not in the library's the day before.
  const prodDateOf = (o: BookOrder): string => {
    const cropPlan = input.cropPlans.find((r) => r.code === o.cropPlanCode);
    return cropPlan ? sowDateFor(cropPlan, o.orderDate, weekdays, input.closures) : productionDateFor(o.orderDate, weekdays, input.closures);
  };
  const byProduction = new Map<string, BookOrder[]>();
  for (const o of inRange) {
    const p = prodDateOf(o);
    byProduction.set(p, [...(byProduction.get(p) ?? []), o]);
  }
  const productionDates = [...byProduction.keys()].sort();

  const productionDays: HorizonProductionDay[] = [];
  const distributionDays: HorizonDistributionDay[] = [];
  let expiredBase = 0;
  const events: { date: string; kind: 'produce' | 'distribute'; key: string }[] = [
    ...productionDates.map((p) => ({ date: p, kind: 'produce' as const, key: p })),
    ...distributionDates.map((d) => ({ date: d, kind: 'distribute' as const, key: d })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'distribute' ? -1 : 1));

  const expiredOn: Record<string, number> = {};
  const closingOn: Record<string, number> = {};
  /** Finished goods at the close of a date: harvested lots with units left; trays still on the shelves are not stock. */
  const stockOn = (date: string) => lots.reduce((s, l) => s + (l.produced <= date ? Math.max(0, l.remaining) : 0), 0);
  /** Expire what is past its shelf life, counting it against `attributeTo` (the date being processed). */
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
      const orders = byProduction.get(ev.key) ?? [];
      const served = [...new Set(orders.map((o) => o.orderDate))].sort();
      const requirements = requirementsFor(orders, input.cropPlans, input.unitFactorByChannel);
      const onHand: Record<string, number> = {};
      // Stock counts only if it is harvested by the production date and still inside shelf life on the
      // first distribution this production serves: a lot that expires over the weekend cannot fill
      // Monday's orders, and trays still on the shelves are held for the distribution they were sown for.
      const servesFrom = [...served].sort()[0] ?? ev.date;
      for (const lot of lots) {
        if (lot.remaining <= 0 || lot.produced > ev.date || lot.expires < servesFrom) continue;
        onHand[lot.cropPlanCode] = (onHand[lot.cropPlanCode] ?? 0) + lot.remaining;
      }
      const plan = planProductionDay({ productionDate: ev.date, requirements, onHand, cropPlans: input.cropPlans, capacityInputs: input.capacityInputs, assumptions: input.assumptions, cropPlanAssumptions: input.cropPlanAssumptions, crews: input.crews, placeSowing: placeSowingFor(servesFrom), studies: input.studies });
      for (const run of plan.runs) {
        if (run.produced <= 0) continue;
        // A grow sowing is stock from its first harvest day, and its shelf life counts from there.
        const produced = stockDateFor(input.cropPlans.find((r) => r.code === run.cropPlanCode), ev.date);
        lots.push({ sowingId: `plan-${ev.date}-${run.cropPlanCode}`, cropPlanCode: run.cropPlanCode, produced, expires: isoAddDays(produced, input.shelfLifeDays), qtyProduced: run.produced, remaining: run.produced });
      }
      productionDays.push({ ...plan, distributionDates: served });
    } else {
      const orders = inRange.filter((o) => o.orderDate === ev.key);
      const reqs = requirementsFor(orders, input.cropPlans, input.unitFactorByChannel);
      const byCropPlan: HorizonDistributionDay['byCropPlan'] = [];
      const fillShare: Record<string, number> = {};
      for (const r of reqs) {
        const left = drawFifo(lots, r.cropPlanCode, ev.date, r.baseUnits);
        const filled = r.baseUnits - left;
        fillShare[r.cropPlanCode] = r.baseUnits > 0 ? filled / r.baseUnits : 1;
        byCropPlan.push({ cropPlanCode: r.cropPlanCode, cropPlanName: r.cropPlanName, orderedBase: r.baseUnits, filledBase: filled });
      }
      const byChannel = new Map<number, { channel: number; units: number; filledUnits: number }>();
      for (const o of orders) {
        const row = byChannel.get(o.channel) ?? { channel: o.channel, units: 0, filledUnits: 0 };
        row.units += o.units;
        row.filledUnits += o.units * (fillShare[o.cropPlanCode] ?? 0);
        byChannel.set(o.channel, row);
      }
      const orderedBase = byCropPlan.reduce((s, r) => s + r.orderedBase, 0);
      const filledBase = byCropPlan.reduce((s, r) => s + r.filledBase, 0);
      distributionDays.push({
        date: ev.key,
        productionDate: orders.map(prodDateOf).sort()[0] ?? productionDateFor(ev.key, weekdays, input.closures),
        orderedUnits: orders.reduce((s, o) => s + o.units, 0),
        orderedBase,
        filledBase,
        unfilledBase: orderedBase - filledBase,
        byChannel: [...byChannel.values()].sort((a, b) => a.channel - b.channel),
        byCropPlan,
      });
    }
    closingOn[ev.date] = stockOn(ev.date);
  }
  expireThrough(isoAddDays(input.to, 1), input.to);
  closingOn[input.to] = stockOn(input.to);

  const channels = input.channels ?? [1, 2, 3];
  const byChannel: HorizonChannel[] = channels.map((ch) => {
    const orderedUnits = distributionDays.reduce((s, d) => s + (d.byChannel.find((c) => c.channel === ch)?.units ?? 0), 0);
    const filledUnits = distributionDays.reduce((s, d) => s + (d.byChannel.find((c) => c.channel === ch)?.filledUnits ?? 0), 0);
    return { channel: ch, orderedUnits, filledUnits, share: orderedUnits > 0 ? filledUnits / orderedUnits : 1 };
  });
  const cropPlanTotals = new Map<string, HorizonPlan['byCropPlan'][number]>();
  for (const d of distributionDays) for (const r of d.byCropPlan) {
    const row = cropPlanTotals.get(r.cropPlanCode) ?? { cropPlanCode: r.cropPlanCode, cropPlanName: r.cropPlanName, orderedBase: 0, producedBase: 0, sowings: 0 };
    row.orderedBase += r.orderedBase;
    cropPlanTotals.set(r.cropPlanCode, row);
  }
  for (const p of productionDays) for (const run of p.runs) {
    const row = cropPlanTotals.get(run.cropPlanCode) ?? { cropPlanCode: run.cropPlanCode, cropPlanName: run.cropPlanName, orderedBase: 0, producedBase: 0, sowings: 0 };
    row.producedBase += run.produced;
    row.sowings += run.sowingsScheduled;
    cropPlanTotals.set(run.cropPlanCode, row);
  }
  const cyclesUsed = productionDays.reduce((s, p) => s + p.runs.reduce((a, r) => a + r.sowingsScheduled, 0), 0);
  const cyclesAvailable = productionDays.reduce((s, p) => s + p.cyclesAvailable, 0);
  const growCalendar = calendarFromSowings({ from: input.from, to: input.to, sowings: ledger.sowings, cropPlans: input.cropPlans, units: growUnits, findings: ledger.sowings.filter((x) => !x.placed).map((x) => ({ kind: 'over-capacity' as const, cropPlanCode: x.cropPlanCode, sowDate: x.sowDate, detail: `${x.cropPlanCode}: a sowing of ${x.trays} trays on ${x.sowDate} has no room on any grow unit for its ${x.cycleDays}-day cycle.` })) });

  // One row per date that made, shipped, expired or held stock.
  const byDate: HorizonDay[] = [...new Set([...productionDays.map((p) => p.productionDate), ...distributionDays.map((d) => d.date), ...Object.keys(expiredOn), ...Object.keys(closingOn)])]
    .filter((d) => d >= input.from && d <= input.to)
    .sort()
    .map((date) => {
      const p = productionDays.find((x) => x.productionDate === date);
      const d = distributionDays.find((x) => x.date === date);
      const used = p ? p.runs.reduce((s, r) => s + r.sowingsScheduled, 0) : 0;
      const available = p?.cyclesAvailable ?? 0;
      return {
        date,
        sowings: used,
        unitsProduced: p?.totalProduced ?? 0,
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
    distributionDays,
    byDate,
    byChannel,
    byCropPlan: [...cropPlanTotals.values()].sort((a, b) => b.orderedBase - a.orderedBase),
    closingLots: lots.filter((l) => l.remaining > 0 && l.produced <= input.to),
    growCalendar,
    totals: {
      orderedUnits: distributionDays.reduce((s, d) => s + d.orderedUnits, 0),
      filledUnits: byChannel.reduce((s, c) => s + c.filledUnits, 0),
      orderedBase: distributionDays.reduce((s, d) => s + d.orderedBase, 0),
      filledBase: distributionDays.reduce((s, d) => s + d.filledBase, 0),
      producedBase: productionDays.reduce((s, p) => s + p.totalProduced, 0),
      sowings: cyclesUsed,
      cyclesUsed,
      cyclesAvailable,
      utilisation: cyclesAvailable > 0 ? cyclesUsed / cyclesAvailable : 0,
      expiredBase,
      closingStockBase: stockOn(input.to),
      daysThatDoNotFit: productionDays.filter((p) => !p.fits).length,
    },
  };
}

// ── Level 1: a single crop plan run ────────────────────────────────────────────

export interface SingleRun {
  cap: CapacityProfile;
  units: number;
  baseUnits: number;
  onHand: number;
  net: number;
  sowings: number;
  produced: number;
  closing: number;
  cyclesRequired: number;
  cyclesAvailable: number;
  fits: boolean;
  purchasedLb: number;
  harvestedLb: number;
  packedLb: number;
  costPerPackedOz: number;
  laborHours: number;
  laborCost: number;
  laborPerUnit: number;
  /** Crop plan standard for the units produced, incl. shrink. */
  inputCostStandard: number;
  purchase: { lines: PurchaseOrderLine[]; total: number };
  /** Purchase against standard: case rounding held in raw materials. */
  carriedForward: number;
  /** Economics of the units ordered at the channel's unit, premium and price. */
  inputCostPerUnit: number;
  packagingPerUnit: number;
  distributionPerUnit: number;
  commissionPerUnit: number;
  revenue: number;
  inputCostSold: number;
  packaging: number;
  distribution: number;
  commission: number;
  /** Revenue less food, run labor, packaging, distribution and commission. Fixed overhead is not in it. */
  contribution: number;
  contributionPerUnit: number;
}

export function singleCropPlanRun(input: {
  cropPlan: GrowPlanCarrier;
  units: number;
  unitFactor: number;
  premiumFactor: number;
  pricePerUnit: number;
  /** Marketplace commission as a share of price (Phase 3), else 0. */
  commissionShare: number;
  openingInventory: number;
  capacityInputs: CapacityInputs;
  assumptions: Assumptions;
}): SingleRun {
  const a = input.assumptions;
  const shrink = a.yield.shrinkAllowance.value;
  const cap = deriveCapacity(input.cropPlan, input.capacityInputs, 1);
  const baseUnits = input.units * input.unitFactor;
  const net = Math.max(0, baseUnits - input.openingInventory);
  const sowings = cap.sowingSize > 0 ? Math.max(0, Math.ceil(net / cap.sowingSize - 1e-9)) : 0;
  const produced = sowings * cap.sowingSize;
  const c = costCropPlan(input.cropPlan, shrink);
  const lb = (oz: number) => (oz * produced) / OZ_PER_LB;
  const labor = laborForDay(sowings, produced, a);
  const purchase = purchaseOrderForRun(produced, input.cropPlan, shrink);
  const inputCostStandard = c.totalInputCostPerUnit * produced;
  const inputCostPerUnit = c.totalInputCostPerUnit * input.unitFactor * input.premiumFactor;
  const packagingPerUnit = a.perUnit.packaging.value;
  const distributionPerUnit = a.perUnit.distribution.value;
  const commissionPerUnit = input.pricePerUnit * input.commissionShare;
  const revenue = input.units * input.pricePerUnit;
  const inputCostSold = input.units * inputCostPerUnit;
  const packaging = input.units * packagingPerUnit;
  const distribution = input.units * distributionPerUnit;
  const commission = input.units * commissionPerUnit;
  const contribution = revenue - inputCostSold - labor.directLaborCost - packaging - distribution - commission;
  return {
    cap,
    units: input.units,
    baseUnits,
    onHand: input.openingInventory,
    net,
    sowings,
    produced,
    closing: input.openingInventory + produced - baseUnits,
    cyclesRequired: sowings,
    cyclesAvailable: cap.cyclesPerDay,
    fits: sowings <= cap.cyclesPerDay,
    purchasedLb: lb(c.seedOzPerUnit),
    harvestedLb: lb(c.harvestedOzPerUnit),
    packedLb: lb(c.packedOzPerUnit),
    costPerPackedOz: c.costPerPackedOz,
    laborHours: labor.totalLaborHours,
    laborCost: labor.directLaborCost,
    laborPerUnit: labor.laborCostPerUnit,
    inputCostStandard,
    purchase: { lines: purchase.lines, total: purchase.total },
    carriedForward: purchase.total - inputCostStandard,
    inputCostPerUnit,
    packagingPerUnit,
    distributionPerUnit,
    commissionPerUnit,
    revenue,
    inputCostSold,
    packaging,
    distribution,
    commission,
    contribution,
    contributionPerUnit: input.units > 0 ? contribution / input.units : 0,
  };
}
