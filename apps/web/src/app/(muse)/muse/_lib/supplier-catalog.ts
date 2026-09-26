import 'server-only';
import { asc, eq, inArray } from 'drizzle-orm';
import { museSupplierItems, museSupplierItemPrices, musePurchaseOrders, musePurchaseOrderLines } from '@ct/db';
import { db } from '@/lib/db';
import type { CatalogLine, CatalogPrice, CatalogStatus } from '../_engine/catalog';

/**
 * Impact OS — supplier catalog and purchase-order reads (server-only).
 *
 * Catalog lines and purchase orders are operator data, not a public compilation,
 * so unlike the supplier directory they live in `muse.*` and are read per
 * supplier rather than searched wholesale.
 */

const isoDate = (d: string | Date): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));

function toCatalogLine(r: typeof museSupplierItems.$inferSelect, prices: CatalogPrice[]): CatalogLine {
  return {
    id: r.id,
    supplierId: r.supplierId,
    item: r.item,
    category: r.category,
    variety: r.variety,
    packSize: r.packSize,
    unit: r.unit,
    status: (r.status === 'approved' ? 'approved' : 'candidate') satisfies CatalogStatus,
    prices,
    minOrderQty: r.minOrderQty,
    leadTimeDays: r.leadTimeDays,
    availStartMonth: r.availStartMonth,
    availEndMonth: r.availEndMonth,
    certification: r.certification,
    origin: r.origin,
    sku: r.sku,
    notes: r.notes,
    sourceId: r.sourceId,
  };
}

/** Every price on file for these items, oldest first, keyed by item id. */
async function pricesByItem(itemIds: string[]): Promise<Record<string, CatalogPrice[]>> {
  if (itemIds.length === 0) return {};
  const rows = await db
    .select()
    .from(museSupplierItemPrices)
    .where(inArray(museSupplierItemPrices.itemId, itemIds))
    .orderBy(asc(museSupplierItemPrices.effectiveFrom));
  const out: Record<string, CatalogPrice[]> = {};
  for (const r of rows) {
    (out[r.itemId] ??= []).push({
      effectiveFrom: isoDate(r.effectiveFrom),
      unitPrice: r.unitPrice,
      priceBasis: r.priceBasis,
      sourceId: r.sourceId,
      note: r.note,
    });
  }
  return out;
}

export async function listCatalog(supplierId: string): Promise<CatalogLine[]> {
  const rows = await db
    .select()
    .from(museSupplierItems)
    .where(eq(museSupplierItems.supplierId, supplierId))
    .orderBy(asc(museSupplierItems.category), asc(museSupplierItems.item));
  const prices = await pricesByItem(rows.map((r) => r.id));
  return rows.map((r) => toCatalogLine(r, prices[r.id] ?? []));
}

/**
 * Every catalog line on file, keyed by supplier id — what the resolver needs to
 * price ingredient lines off the catalog wherever a line is linked (Roadmap N1).
 */
export async function listAllCatalog(): Promise<Record<string, CatalogLine[]>> {
  const rows = await db.select().from(museSupplierItems).orderBy(asc(museSupplierItems.item));
  if (rows.length === 0) return {};
  const prices = await pricesByItem(rows.map((r) => r.id));
  const out: Record<string, CatalogLine[]> = {};
  for (const r of rows) (out[r.supplierId] ??= []).push(toCatalogLine(r, prices[r.id] ?? []));
  return out;
}

/** Catalogs for several suppliers at once, keyed by supplier id — for the PO builder. */
export async function catalogsBySupplier(
  supplierIds: string[],
): Promise<Record<string, CatalogLine[]>> {
  if (supplierIds.length === 0) return {};
  const rows = await db
    .select()
    .from(museSupplierItems)
    .where(inArray(museSupplierItems.supplierId, supplierIds));
  const prices = await pricesByItem(rows.map((r) => r.id));
  const out: Record<string, CatalogLine[]> = {};
  for (const r of rows) (out[r.supplierId] ??= []).push(toCatalogLine(r, prices[r.id] ?? []));
  return out;
}

// ── Purchase orders ─────────────────────────────────────────────────────────

export interface PoLineView {
  id: string;
  ingredient: string;
  item: string;
  qty: number;
  unit: string;
  packSize: string | null;
  cases: number | null;
  unitPriceCents: number;
  extendedCents: number;
  notes: string | null;
}

export interface PoView {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: string;
  orderedFor: string;
  subtotalCents: number;
  notes: string | null;
  issuedAt: Date | null;
  receivedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  lines: PoLineView[];
}

async function withLines(orders: (typeof musePurchaseOrders.$inferSelect)[]): Promise<PoView[]> {
  if (orders.length === 0) return [];
  const lines = await db
    .select()
    .from(musePurchaseOrderLines)
    .where(inArray(musePurchaseOrderLines.poId, orders.map((o) => o.id)))
    .orderBy(asc(musePurchaseOrderLines.ingredient));
  const byPo: Record<string, PoLineView[]> = {};
  for (const l of lines) {
    (byPo[l.poId] ??= []).push({
      id: l.id,
      ingredient: l.ingredient,
      item: l.item,
      qty: l.qty,
      unit: l.unit,
      packSize: l.packSize,
      cases: l.cases,
      unitPriceCents: l.unitPriceCents,
      extendedCents: l.extendedCents,
      notes: l.notes,
    });
  }
  return orders.map((o) => ({
    id: o.id,
    poNumber: o.poNumber,
    supplierId: o.supplierId,
    supplierName: o.supplierName,
    status: o.status,
    orderedFor: o.orderedFor,
    subtotalCents: o.subtotalCents,
    notes: o.notes,
    issuedAt: o.issuedAt,
    receivedAt: o.receivedAt,
    closedAt: o.closedAt,
    createdAt: o.createdAt,
    lines: byPo[o.id] ?? [],
  }));
}

/** Every order raised against one operation, newest first. */
export async function listPurchaseOrdersForSupplier(supplierId: string): Promise<PoView[]> {
  const orders = await db
    .select()
    .from(musePurchaseOrders)
    .where(eq(musePurchaseOrders.supplierId, supplierId))
    .orderBy(asc(musePurchaseOrders.createdAt));
  return (await withLines(orders)).reverse();
}

/** The whole register, newest first. */
export async function listPurchaseOrders(): Promise<PoView[]> {
  const orders = await db.select().from(musePurchaseOrders).orderBy(asc(musePurchaseOrders.createdAt));
  return (await withLines(orders)).reverse();
}

/** Orders already raised for a production date — drives the PO sequence number. */
export async function countOrdersFor(orderedFor: string): Promise<number> {
  const rows = await db
    .select({ id: musePurchaseOrders.id })
    .from(musePurchaseOrders)
    .where(eq(musePurchaseOrders.orderedFor, orderedFor));
  return rows.length;
}
