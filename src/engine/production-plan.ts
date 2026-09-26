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
 *      per crop plan, placed on the blackout rack in order against the shared ceiling,
 *      with one purchase requirement merged across crop plans.
 *   3. Horizon — the same over a date range, rolling: each production day makes
 *      the next distribution date's orders, overshoot is stock while inside hold
 *      life and expired stock is named as waste, and what could not be made is
 *      an unfilled order, not a refused plan.
 *
 * Every figure is computed from the crop plan library, the order book and the
 * capacity inputs; nothing here is stored.
 */

import { isClosed, type DateRange } from '@/engine/periods';
import type { CropPlanDef } from '@/data/plan-data';
import type { ResolvedInputs } from '@/engine/scenario';
import type { BookOrder } from '@/engine/orders';
import { isoAddDays, weekdayOf } from '@/engine/orders';
import { deriveCapacity, costCropPlan, componentCosting, laborForDay, purchaseOrderForRun, type PurchaseOrderLine, type CapacityProfile } from '@/engine';
import { laborRequirement, checkStaffing, type LaborRequirement, type StaffingCheck } from '@/engine/staffing';
import type { CrewShift } from '@/data/crews';
import type { RequirementLine } from '@/engine/catalog';
import { isGrowPlanCarrier } from '@/engine/grow-plan-bridge';
import { defaultGrowUnits } from '@/engine';
import type { GrowUnit } from '@/engine/grow-capacity';
import { ShelfLedger, calendarFromSowings, sowDateFor, type GrowCalendar } from '@/engine/grow-calendar';

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
export function unitFactorFor(cropPlan: CropPlanDef | undefined, channel: number, unitFactorByChannel: Record<number, number>): number {
  if (cropPlan && cropPlan.channels.includes(channel)) return 1;
  return unitFactorByChannel[channel] ?? 1;
}

/** The crop plans a set of orders needs, in base units, largest first. */
export function requirementsFor(
  orders: readonly BookOrder[],
  cropPlans: readonly CropPlanDef[],
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
  cropPlans: readonly CropPlanDef[],
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
 * units produced on its date, inside shelf life for `shelfLifeDays`. Distributed
 * orders draw from the oldest lot of their crop plan first.
 */
export function finishedGoodsOnHand(input: {
  sowings: readonly { sowingId: string; cropPlanCode: string; productionDate: string; goodUnits: number }[];
  consumed: readonly Consumption[];
  shelfLifeDays: number;
  asOf: string;
}): OnHand {
  const lots: FinishedLot[] = input.sowings
    .filter((b) => b.productionDate <= input.asOf)
    .map((b) => ({
      sowingId: b.sowingId,
      cropPlanCode: b.cropPlanCode,
      produced: b.productionDate,
      expires: isoAddDays(b.productionDate, input.shelfLifeDays),
      qtyProduced: b.goodUnits,
      remaining: b.goodUnits,
    }))
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

// ── A production day: whole sowings per crop plan against the shared blackout rack ───

export interface CropPlanRunPlan {
  cropPlanCode: string;
  cropPlanName: string;
  /** Base units the orders need. */
  required: number;
  onHand: number;
  net: number;
  sowingSize: number;
  sowingsNeeded: number;
  /** Sowings that fit in the day's cycles after the crop plans ahead of it. */
  sowingsScheduled: number;
  produced: number;
  /** Net requirement not made because the day ran out of cycles. */
  shortfall: number;
  closing: number;
  blackoutLb: number;
  harvestedLb: number;
  purchasedLb: number;
  packedLb: number;
  laborHours: number;
  laborCost: number;
  /** Crop plan standard for the units produced, incl. the shrink allowance. */
  inputCostStandard: number;
  purchase: { lines: PurchaseOrderLine[]; total: number };
}

export interface ScheduledSowing {
  seq: number;
  cropPlanCode: string;
  cropPlanName: string;
  units: number;
  /** Minutes from midnight. */
  loadMin: number;
  unloadMin: number;
  freeMin: number;
  fits: boolean;
}

export interface DayPlan {
  productionDate: string;
  runs: CropPlanRunPlan[];
  cyclesRequired: number;
  cyclesAvailable: number;
  fits: boolean;
  schedule: ScheduledSowing[];
  totalRequired: number;
  totalProduced: number;
  totalShortfall: number;
  blackoutLb: number;
  /** Canopy mass the racks can take in the day: one rack's load × the cycles across the lines in service. */
  blackoutCeilingLb: number;
  laborHours: number;
  laborCost: number;
  inputCostStandard: number;
  purchase: { lines: PurchaseOrderLine[]; total: number };
  requirement: RequirementLine[];
  blackoutWindow: CapacityProfile['blackoutWindow'];
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
 * Plan one production day. Requirements are in base units; each crop plan's
 * sowing size is its own (derived from its canopy mass per unit); every
 * sowing takes one blackout rack cycle, so the day fits when the sowings across
 * crop plans are within the plant's cycles. When they are not, cycles go to the
 * crop plans in requirement order and the rest is a named shortfall. The placed
 * sowings then emit the day's labor requirement, and any proposed crews are
 * checked against it.
 */
export function planProductionDay(input: {
  productionDate: string;
  requirements: readonly CropPlanRequirement[];
  onHand: Record<string, number>;
  cropPlans: readonly CropPlanDef[];
  capacityInputs: CapacityInputs;
  assumptions: Assumptions;
  /**
   * Each crop plan's own assumptions — its labor standard and packaging (Roadmap
   * N3). A run is costed at its crop plan's; omitted, every run falls back to
   * `assumptions`, which charges the reference crop plan's labor to all of them.
   */
  cropPlanAssumptions?: Readonly<Record<string, Assumptions>>;
  /** Proposed crews to check against the day's labor requirement. Omitted = none proposed. */
  crews?: readonly CrewShift[];
  /**
   * Lines in service on the date — the blackout rack racks, each an
   * independent stream (Roadmap N4b, decision 20). A sowing is one rack's
   * load whatever the count; concurrency is more sowings at once, never a
   * larger sowing. Sowings load on whichever line is free
   * first. Omitted = one line; zero = no production that day, every sowing a
   * shortfall.
   */
  lines?: number;
  /**
   * A grow plan's sowing is placed on a grow unit for its cycle days (`grow-calendar.ts`); the
   * horizon passes its shelf ledger so a rack full of last week's trays takes no sowing today.
   * Omitted, every grow plan sowing is taken as placed.
   */
  placeSowing?: (cropPlan: CropPlanDef, productionDate: string, trays: number) => boolean;
}): DayPlan {
  const shrink = input.assumptions.yield.shrinkAllowance.value;
  // A crop plan's sowings cannot load before its sows finish: its first load is
  // read from its sow times. Crop plans are placed earliest-ready first — a
  // stable sort, so the larger requirement leads among crop plans ready at the
  // same minute — one occupancy block after another until the operating day
  // closes. A crop plan with no sow time on file is not placed.
  const planned = input.requirements
    .map((req) => {
      const cropPlan = input.cropPlans.find((r) => r.code === req.cropPlanCode);
      return cropPlan ? { req, cropPlan, cap: deriveCapacity(cropPlan, input.capacityInputs, 1) } : null;
    })
    .filter((p): p is { req: CropPlanRequirement; cropPlan: CropPlanDef; cap: CapacityProfile } => p !== null)
    .sort((a, b) => a.cap.blackoutWindow.startMin - b.cap.blackoutWindow.startMin);
  const dayCapacity = planned[0]?.cap ?? deriveCapacity(input.cropPlans[0], input.capacityInputs);
  const window = dayCapacity.blackoutWindow;
  const lines = Math.max(0, Math.floor(input.lines ?? 1));
  const cyclesAvailable = window.cycles * lines;
  // One rack's load; `cyclesAvailable` already counts every line in service.
  const lbPerCycle = dayCapacity.lbPerCycle;
  const runs: CropPlanRunPlan[] = [];
  const schedule: ScheduledSowing[] = [];
  let seq = 0;
  // One cursor per line: the minute each line is next free.
  const cursors: number[] = Array.from({ length: lines }, () => -Infinity);

  for (const { req, cropPlan, cap } of planned) {
    const onHand = input.onHand[req.cropPlanCode] ?? 0;
    const net = Math.max(0, req.baseUnits - onHand);
    const sowingsNeeded = cap.sowingSize > 0 ? Math.max(0, Math.ceil(net / cap.sowingSize - 1e-9)) : 0;
    const timed = cap.blackoutWindow.firstLoadBasis !== 'none';
    const loads: { loadMin: number; fits: boolean }[] = [];
    const grow = isGrowPlanCarrier(cropPlan);
    for (let b = 0; b < sowingsNeeded; b++) {
      if (lines === 0) {
        loads.push({ loadMin: window.closeMin, fits: false });
        continue;
      }
      if (grow) {
        // A grow plan's sowing goes on a grow unit for its cycle, not on a rack for a cycle inside the day.
        const placed = input.placeSowing ? input.placeSowing(cropPlan, input.productionDate, cap.sowingSize) : true;
        loads.push({ loadMin: cap.blackoutWindow.startMin, fits: placed });
        continue;
      }
      let line = 0;
      for (let i = 1; i < lines; i++) if (cursors[i]! < cursors[line]!) line = i;
      const loadMin = Math.max(cursors[line]!, timed ? cap.blackoutWindow.startMin : window.closeMin);
      loads.push({ loadMin, fits: timed && loadMin + window.occupancyMinutes <= window.closeMin });
      cursors[line] = loadMin + window.occupancyMinutes;
    }
    const sowingsScheduled = loads.filter((l) => l.fits).length;
    const produced = sowingsScheduled * cap.sowingSize;
    const shortfall = Math.max(0, net - produced);
    const c = costCropPlan(cropPlan, shrink);
    const k = componentCosting(cropPlan, shrink);
    const lb = (oz: number) => (oz * produced) / OZ_PER_LB;
    const labor = laborForDay(sowingsScheduled, produced, input.cropPlanAssumptions?.[cropPlan.code] ?? input.assumptions);
    const purchase = purchaseOrderForRun(produced, cropPlan, shrink);
    for (const { loadMin, fits } of loads) {
      seq += 1;
      schedule.push({
        seq,
        cropPlanCode: cropPlan.code,
        cropPlanName: cropPlan.name,
        units: cap.sowingSize,
        loadMin,
        unloadMin: loadMin + cap.loadMinutes + cap.blackoutMinutes,
        freeMin: loadMin + window.occupancyMinutes,
        fits,
      });
    }
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
      shortfall,
      closing: onHand + produced - Math.min(req.baseUnits, onHand + produced),
      blackoutLb: lb(k.filter((x) => x.isHot).reduce((s, x) => s + x.blackoutOz, 0)),
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
  const cyclesRequired = runs.reduce((s, r) => s + r.sowingsNeeded, 0);
  const growPlaced = runs.every((r) => !isGrowPlanCarrier(input.cropPlans.find((x) => x.code === r.cropPlanCode)) || r.sowingsScheduled >= r.sowingsNeeded);
  const labor = laborRequirement(
    schedule.filter((b) => b.fits).map((b) => ({ seq: b.seq, loadMin: b.loadMin, units: b.units })),
    input.capacityInputs,
  );
  return {
    productionDate: input.productionDate,
    runs,
    cyclesRequired,
    cyclesAvailable,
    fits: cyclesRequired <= cyclesAvailable && growPlaced,
    schedule,
    totalRequired: runs.reduce((s, r) => s + r.required, 0),
    totalProduced: runs.reduce((s, r) => s + r.produced, 0),
    totalShortfall: runs.reduce((s, r) => s + r.shortfall, 0),
    blackoutLb: runs.reduce((s, r) => s + r.blackoutLb, 0),
    blackoutCeilingLb: lbPerCycle * cyclesAvailable,
    laborHours: runs.reduce((s, r) => s + r.laborHours, 0),
    laborCost: runs.reduce((s, r) => s + r.laborCost, 0),
    inputCostStandard: runs.reduce((s, r) => s + r.inputCostStandard, 0),
    purchase,
    requirement: toRequirementLines(purchase.lines),
    blackoutWindow: window,
    labor,
    staffing: checkStaffing(labor, input.crews ?? [], dayCapacity, input.capacityInputs),
  };
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
  /** Cycles used ÷ cycles available; 0 on a day with no production. */
  utilisation: number;
  orderedBase: number;
  filledBase: number;
  unfilledBase: number;
  /** Stock that reached its shelf-life end on this date unconsumed. */
  expiredBase: number;
  /** Finished goods still inside shelf life at the end of the date. */
  closingStockBase: number;
  /** False when the day's sowings exceed the plant's cycles. */
  fits: boolean;
}

export interface HorizonChannel {
  channel: number;
  orderedUnits: number;
  filledUnits: number;
  /** Filled ÷ ordered — the share the blackout rack could serve over the horizon. */
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
  /** The sowings on the grow units across the window; null when the library holds no grow plan. */
  growCalendar: GrowCalendar | null;
  totals: {
    orderedUnits: number;
    filledUnits: number;
    orderedBase: number;
    filledBase: number;
    producedBase: number;
    sowings: number;
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
  cropPlans: readonly CropPlanDef[];
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
  /** Lines in service on a production date (Roadmap N4b). Omitted = one line every day. */
  linesOn?: (date: string) => number;
  /** The grow units sowings are placed on for their cycle days. Omitted = the capacity inputs', else the seed. */
  growUnits?: readonly GrowUnit[];
  /** Sowings already on the shelves when the window opens (recorded sowings inside their cycle). */
  openingSowings?: readonly { cropPlanCode: string; sowDate: string; trays: number }[];
}): HorizonPlan {
  const weekdays = input.productionWeekdays ?? [1, 2, 3, 4, 5];
  const lots: FinishedLot[] = input.openingLots.map((l) => ({ ...l }));
  const inRange = input.book.filter((o) => o.orderDate >= input.from && o.orderDate <= input.to);
  const distributionDates = [...new Set(inRange.map((o) => o.orderDate))].sort();
  const growUnits = input.growUnits ?? input.capacityInputs.growUnits ?? defaultGrowUnits;
  const ledger = new ShelfLedger(growUnits);
  for (const o of input.openingSowings ?? []) {
    const cropPlan = input.cropPlans.find((r) => r.code === o.cropPlanCode);
    if (cropPlan && isGrowPlanCarrier(cropPlan) && o.trays > 0) ledger.place(cropPlan, o.sowDate, o.trays, null);
  }
  // A placed sowing carries the first distribution date it serves, so a day page can list its own sowings.
  const placeSowingFor = (servesFrom: string) => (cropPlan: CropPlanDef, productionDate: string, trays: number): boolean =>
    isGrowPlanCarrier(cropPlan) ? ledger.place(cropPlan, productionDate, trays, servesFrom).placed : true;

  // Each order is made on the production date its plan needs: a grow plan's sow date
  // (distribution date less days to harvest, on a production day), a Phase 1-era plan's the day before.
  const prodDateOf = (o: BookOrder): string => {
    const cropPlan = input.cropPlans.find((r) => r.code === o.cropPlanCode);
    return cropPlan && isGrowPlanCarrier(cropPlan) ? sowDateFor(cropPlan.plan, o.orderDate, weekdays, input.closures) : productionDateFor(o.orderDate, weekdays, input.closures);
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
      // Stock counts only if it is still inside shelf life on the first distribution this production serves:
      // a lot that expires over the weekend cannot fill Monday's orders.
      const servesFrom = [...served].sort()[0] ?? ev.date;
      for (const lot of lots) {
        if (lot.remaining <= 0 || lot.expires < servesFrom) continue;
        onHand[lot.cropPlanCode] = (onHand[lot.cropPlanCode] ?? 0) + lot.remaining;
      }
      const plan = planProductionDay({ productionDate: ev.date, requirements, onHand, cropPlans: input.cropPlans, capacityInputs: input.capacityInputs, assumptions: input.assumptions, cropPlanAssumptions: input.cropPlanAssumptions, crews: input.crews, lines: input.linesOn?.(ev.date), placeSowing: placeSowingFor(servesFrom) });
      for (const run of plan.runs) {
        if (run.produced <= 0) continue;
        lots.push({ sowingId: `plan-${ev.date}-${run.cropPlanCode}`, cropPlanCode: run.cropPlanCode, produced: ev.date, expires: isoAddDays(ev.date, input.shelfLifeDays), qtyProduced: run.produced, remaining: run.produced });
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
    closingOn[ev.date] = lots.reduce((s, l) => s + Math.max(0, l.remaining), 0);
  }
  expireThrough(isoAddDays(input.to, 1), input.to);
  closingOn[input.to] = lots.reduce((s, l) => s + Math.max(0, l.remaining), 0);

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
  const growCalendar = input.cropPlans.some(isGrowPlanCarrier) ? calendarFromSowings({ from: input.from, to: input.to, sowings: ledger.sowings, cropPlans: input.cropPlans, units: growUnits, findings: ledger.sowings.filter((x) => !x.placed).map((x) => ({ kind: 'over-capacity' as const, cropPlanCode: x.cropPlanCode, sowDate: x.sowDate, detail: `${x.cropPlanCode}: a sowing of ${x.trays} trays on ${x.sowDate} has no room on any grow unit for its ${x.cycleDays}-day cycle.` })) }) : null;

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
    closingLots: lots.filter((l) => l.remaining > 0),
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
      closingStockBase: lots.reduce((s, l) => s + l.remaining, 0),
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
  blackoutLb: number;
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
  cropPlan: CropPlanDef;
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
  const k = componentCosting(input.cropPlan, shrink);
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
    blackoutLb: lb(k.filter((x) => x.isHot).reduce((s, x) => s + x.blackoutOz, 0)),
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

/** The blackout rack ceiling per crop plan — sowing sizes differ with mass, first loads with sow times. */
export function ceilingByCropPlan(cropPlans: readonly CropPlanDef[], capacityInputs: CapacityInputs): { cropPlanCode: string; cropPlanName: string; status: CropPlanDef['status']; sowingSize: number; canopyMassPerUnit: number; maxUnitsPerDay: number; cyclesPerDay: number; sowToBlackoutMinutes: number | null; firstLoadMin: number | null; stageGaps: number }[] {
  return cropPlans.map((r) => {
    const cap = deriveCapacity(r, capacityInputs, 1);
    return {
      cropPlanCode: r.code,
      cropPlanName: r.name,
      status: r.status,
      sowingSize: cap.sowingSize,
      canopyMassPerUnit: cap.canopyMassPerUnit,
      maxUnitsPerDay: cap.maxUnitsPerDay,
      cyclesPerDay: cap.cyclesPerDay,
      sowToBlackoutMinutes: cap.stage.sowToBlackoutMinutes,
      firstLoadMin: cap.blackoutWindow.firstLoadBasis === 'none' ? null : cap.blackoutWindow.startMin,
      stageGaps: cap.stage.gaps.length,
    };
  });
}
