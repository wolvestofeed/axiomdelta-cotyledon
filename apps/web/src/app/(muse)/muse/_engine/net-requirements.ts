/**
 * Impact OS — purchase orders from net requirements (Roadmap H5).
 *
 * Ledger-free, database-free.
 *
 *   raw stock on hand  = receipts − issues, by lot, oldest first (an issue that
 *                        names its input lot draws that lot; one that does not
 *                        draws the oldest lot of the ingredient)
 *   on order           = issued purchase orders less what receipts have already
 *                        booked against them
 *   net requirement    = gross production requirement − stock on hand − on
 *                        order arriving in time, rolled across the production
 *                        days in date order so a day only nets what the days
 *                        before it left
 *
 * The purchase-order generator reads the net, by supplier and lead time, for a
 * date or a horizon. No record, no stock: the platform does not assume raw
 * inventory it has not received.
 */

import type { BatchRecordDoc, ReceiptDoc } from './actuals';
import type { PurchaseOrderLine } from './index';
import type { RequirementLine } from './catalog';
import { isoAddDays } from './orders';

// ── Raw stock from records ──────────────────────────────────────────────────

export interface RawLot {
  lotCode: string;
  ingredient: string;
  unit: string;
  receivedOn: string;
  /** Use-by date from the case, ISO; null when the case carried none. */
  useBy: string | null;
  qty: number;
  remaining: number;
  unitPriceCents: number;
  receiptId: string;
  poId: string | null;
  onFoodTraceabilityList: boolean;
}

export interface RawStockLine {
  ingredient: string;
  unit: string;
  onHand: number;
  lots: number;
  /** At the invoice price of the lots on hand, cents. */
  valueCents: number;
}

export interface RawStock {
  asOf: string;
  lots: RawLot[];
  byIngredient: Record<string, RawStockLine>;
  /** Issues that found no lot to draw from, by ingredient. */
  unmatchedIssues: Record<string, number>;
}

function drawRaw(lots: RawLot[], ingredient: string, date: string, qty: number, preferLot: string | null): number {
  let left = qty;
  const ordered = [...lots.filter((l) => l.ingredient === ingredient && l.remaining > 0 && l.receivedOn <= date)];
  ordered.sort((a, b) => (a.lotCode === preferLot ? -1 : b.lotCode === preferLot ? 1 : 0) || a.receivedOn.localeCompare(b.receivedOn));
  for (const lot of ordered) {
    if (left <= 1e-9) break;
    const take = Math.min(lot.remaining, left);
    lot.remaining -= take;
    left -= take;
  }
  return Math.max(0, left);
}

/** Raw stock on a date: every receipt line is a lot; every batch record's consumed line is an issue. */
export function rawStockOnHand(input: { receipts: readonly ReceiptDoc[]; batches: readonly BatchRecordDoc[]; asOf: string }): RawStock {
  const lots: RawLot[] = [];
  for (const r of input.receipts) {
    if (r.receivedOn > input.asOf) continue;
    for (const l of r.lines) {
      // A rejected line is on the record (the supplier is told) and never in stock.
      if (l.condition === 'rejected') continue;
      lots.push({ lotCode: l.lotCode, ingredient: l.ingredient, unit: l.unit, receivedOn: r.receivedOn, useBy: l.useBy ?? null, qty: l.qty, remaining: l.qty, unitPriceCents: l.unitPriceCents, receiptId: r.id, poId: r.poId, onFoodTraceabilityList: l.onFoodTraceabilityList ?? false });
    }
  }
  lots.sort((a, b) => a.receivedOn.localeCompare(b.receivedOn) || a.lotCode.localeCompare(b.lotCode));
  const issues = input.batches
    .filter((b) => b.productionDate <= input.asOf)
    .flatMap((b) => b.components.flatMap((c) => c.consumed.map((x) => ({ date: b.productionDate, ingredient: x.ingredient, lot: x.inputLotCode, qty: x.qty }))))
    .sort((a, b) => a.date.localeCompare(b.date));
  const unmatchedIssues: Record<string, number> = {};
  for (const i of issues) {
    const named = i.lot && i.lot !== 'not recorded' ? i.lot : null;
    const left = drawRaw(lots, i.ingredient, i.date, i.qty, named);
    if (left > 1e-9) unmatchedIssues[i.ingredient] = (unmatchedIssues[i.ingredient] ?? 0) + left;
  }
  const byIngredient: Record<string, RawStockLine> = {};
  for (const lot of lots) {
    if (lot.remaining <= 1e-9) continue;
    const row = byIngredient[lot.ingredient] ?? { ingredient: lot.ingredient, unit: lot.unit, onHand: 0, lots: 0, valueCents: 0 };
    row.onHand += lot.remaining;
    row.lots += 1;
    row.valueCents += Math.round(lot.remaining * lot.unitPriceCents);
    byIngredient[lot.ingredient] = row;
  }
  return { asOf: input.asOf, lots, byIngredient, unmatchedIssues };
}

// ── Raw lots by use-by (Roadmap I5) ─────────────────────────────────────────

export interface RawLotAgeing extends RawLot {
  /** Days from `asOf` to the use-by date; negative = past it; null = no date on the case. */
  daysToUseBy: number | null;
}

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/**
 * Lots on hand ordered by the date printed on the case, earliest first, then
 * lots with no date by receipt date. A fact list: it states which lot the
 * date says goes first, and says nothing about what to do with it.
 */
export function rawLotsByUseBy(stock: RawStock): RawLotAgeing[] {
  return stock.lots
    .filter((l) => l.remaining > 1e-9)
    .map((l) => ({ ...l, daysToUseBy: l.useBy ? daysBetween(stock.asOf, l.useBy) : null }))
    .sort((a, b) => {
      if (a.useBy && b.useBy) return a.useBy.localeCompare(b.useBy) || a.receivedOn.localeCompare(b.receivedOn);
      if (a.useBy) return -1;
      if (b.useBy) return 1;
      return a.receivedOn.localeCompare(b.receivedOn);
    });
}

// ── Open purchase orders ────────────────────────────────────────────────────

export interface PoLike {
  id: string;
  poNumber: string;
  status: string;
  /** The production date the order buys for — when it is expected. */
  orderedFor: string;
  supplierId: string;
  supplierName: string;
  lines: { ingredient: string; qty: number; unit: string }[];
}

export interface OnOrderLine {
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  ingredient: string;
  unit: string;
  ordered: number;
  received: number;
  outstanding: number;
  expectedOn: string;
}

export interface OpenOrders {
  /** Issued orders' lines with something still to receive. */
  lines: OnOrderLine[];
  byIngredient: Record<string, number>;
  /** Draft orders' quantities by ingredient — raised, not yet committed; not counted as on order. */
  draftsByIngredient: Record<string, number>;
}

/** Quantity each PO line has had booked against it by receipts naming the order. */
export function receivedAgainst(po: Pick<PoLike, 'id' | 'lines'>, receipts: readonly ReceiptDoc[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of receipts) {
    if (r.poId !== po.id) continue;
    for (const l of r.lines) out[l.ingredient] = (out[l.ingredient] ?? 0) + l.qty;
  }
  return out;
}

export interface ReceiptCoverage {
  covered: boolean;
  lines: { ingredient: string; ordered: number; received: number; short: number }[];
}

/** Whether receipts have covered every line of an order (to 0.5% of the line). */
export function receiptCoverage(po: Pick<PoLike, 'id' | 'lines'>, receipts: readonly ReceiptDoc[]): ReceiptCoverage {
  const got = receivedAgainst(po, receipts);
  const lines = po.lines.map((l) => {
    const received = got[l.ingredient] ?? 0;
    return { ingredient: l.ingredient, ordered: l.qty, received, short: Math.max(0, l.qty - received) };
  });
  return { covered: lines.every((l) => l.received >= l.ordered * 0.995), lines };
}

export function openOrders(input: { purchaseOrders: readonly PoLike[]; receipts: readonly ReceiptDoc[] }): OpenOrders {
  const lines: OnOrderLine[] = [];
  const byIngredient: Record<string, number> = {};
  const draftsByIngredient: Record<string, number> = {};
  for (const po of input.purchaseOrders) {
    if (po.status === 'draft') {
      for (const l of po.lines) draftsByIngredient[l.ingredient] = (draftsByIngredient[l.ingredient] ?? 0) + l.qty;
      continue;
    }
    if (po.status !== 'issued') continue;
    const got = receivedAgainst(po, input.receipts);
    for (const l of po.lines) {
      const received = got[l.ingredient] ?? 0;
      const outstanding = Math.max(0, l.qty - received);
      if (outstanding <= 1e-9) continue;
      lines.push({ poId: po.id, poNumber: po.poNumber, supplierId: po.supplierId, supplierName: po.supplierName, ingredient: l.ingredient, unit: l.unit, ordered: l.qty, received, outstanding, expectedOn: po.orderedFor });
      byIngredient[l.ingredient] = (byIngredient[l.ingredient] ?? 0) + outstanding;
    }
  }
  lines.sort((a, b) => a.expectedOn.localeCompare(b.expectedOn));
  return { lines, byIngredient, draftsByIngredient };
}

// ── Net requirements across production days ─────────────────────────────────

export interface GrossDay {
  productionDate: string;
  /** The day's merged purchase lines at the recipe standard (gross, before stock). */
  lines: readonly PurchaseOrderLine[];
}

export interface NetLine {
  ingredient: string;
  unit: string;
  packSize: number;
  apUnitCost: number;
  gross: number;
  /** Stock on hand applied to the days. */
  onHandApplied: number;
  onHand: number;
  /** On order and expected in time, applied. */
  onOrderApplied: number;
  /** Everything outstanding on issued orders, in time or not. */
  onOrder: number;
  net: number;
  casesToOrder: number;
  /** Cases × pack size — what is actually bought. */
  qtyToOrder: number;
  extendedCost: number;
  /** First production day with a shortfall; null when nothing is needed. */
  needBy: string | null;
}

export interface NetRequirements {
  lines: NetLine[];
  grossTotal: number;
  netTotal: number;
  /** Lines with something to buy. */
  toBuy: NetLine[];
}

export function netRequirements(input: { days: readonly GrossDay[]; stock: RawStock; onOrder: OpenOrders }): NetRequirements {
  const days = [...input.days].sort((a, b) => a.productionDate.localeCompare(b.productionDate));
  const stockLeft: Record<string, number> = {};
  for (const [k, v] of Object.entries(input.stock.byIngredient)) stockLeft[k] = v.onHand;
  const arrivals = input.onOrder.lines.map((l) => ({ ...l, left: l.outstanding }));
  const acc = new Map<string, NetLine>();

  for (const day of days) {
    for (const l of day.lines) {
      const row = acc.get(l.name) ?? {
        ingredient: l.name,
        unit: l.unit,
        packSize: l.packSize,
        apUnitCost: l.apUnitCost,
        gross: 0,
        onHandApplied: 0,
        onHand: input.stock.byIngredient[l.name]?.onHand ?? 0,
        onOrderApplied: 0,
        onOrder: input.onOrder.byIngredient[l.name] ?? 0,
        net: 0,
        casesToOrder: 0,
        qtyToOrder: 0,
        extendedCost: 0,
        needBy: null,
      };
      let need = l.requiredForProduction;
      row.gross += need;
      const fromStock = Math.min(need, stockLeft[l.name] ?? 0);
      stockLeft[l.name] = (stockLeft[l.name] ?? 0) - fromStock;
      row.onHandApplied += fromStock;
      need -= fromStock;
      for (const a of arrivals) {
        if (need <= 1e-9) break;
        if (a.ingredient !== l.name || a.left <= 1e-9 || a.expectedOn > day.productionDate) continue;
        const take = Math.min(a.left, need);
        a.left -= take;
        row.onOrderApplied += take;
        need -= take;
      }
      if (need > 1e-9) {
        row.net += need;
        if (!row.needBy) row.needBy = day.productionDate;
      }
      acc.set(l.name, row);
    }
  }

  const lines = [...acc.values()].map((r) => {
    const casesToOrder = r.packSize > 0 ? Math.max(0, Math.ceil(r.net / r.packSize - 1e-9)) : 0;
    const qtyToOrder = casesToOrder * r.packSize;
    return { ...r, casesToOrder, qtyToOrder, extendedCost: qtyToOrder * r.apUnitCost };
  });
  return {
    lines,
    grossTotal: lines.reduce((s, l) => s + l.gross * l.apUnitCost, 0),
    netTotal: lines.reduce((s, l) => s + l.extendedCost, 0),
    toBuy: lines.filter((l) => l.casesToOrder > 0),
  };
}

/** The net as the purchase-order generator reads it: only what has to be bought. */
export function netToRequirementLines(net: NetRequirements): RequirementLine[] {
  return net.toBuy.map((l) => ({
    ingredient: l.ingredient,
    qty: l.qtyToOrder,
    unit: l.unit,
    packSize: l.packSize,
    casesToOrder: l.casesToOrder,
    fallbackUnitCost: l.apUnitCost,
  }));
}

/** The date an order has to be placed to arrive by `needBy` at the supplier's lead time. */
export function orderByDate(needBy: string, leadTimeDays: number | null): string | null {
  return leadTimeDays === null ? null : isoAddDays(needBy, -leadTimeDays);
}
