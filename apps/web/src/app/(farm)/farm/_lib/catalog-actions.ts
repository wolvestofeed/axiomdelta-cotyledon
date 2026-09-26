'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { farmSupplierItems, farmSupplierItemPrices, farmPurchaseOrders, farmPurchaseOrderLines } from '@mf/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from './access';
import { leanSuppliersById } from './supplier-links';
import { countOrdersFor } from './supplier-catalog';
import {
  parseCatalogSheet,
  purchaseOrderNumber,
  canTransition,
  PO_STATUSES,
  PRICE_BASES,
  type PoStatus,
} from '../_engine/catalog';

/**
 * Supplier catalogs and purchase orders. SUPER ADMIN ONLY.
 *
 * Import replaces a supplier's catalog wholesale rather than merging: a price
 * sheet is a snapshot, and a merge would leave last season's lines behind with
 * no way to tell them from this season's. The registered source document the
 * sheet came from is carried onto every line it creates.
 *
 * What the snapshot governs is the SET OF LINES, not their history (Roadmap
 * N1). A line on both the old sheet and the new keeps its id, its approval and
 * its past prices, and gains the new sheet's price effective from the sheet's
 * date; a line the new sheet drops is removed; a line it adds arrives as a
 * CANDIDATE. Approval is a decision about the line, not a property of the sheet
 * it arrived on, so it survives the import — and only an approved line prices
 * the plan or a purchase order.
 *
 * A purchase order, once written, is a document — `generatePurchaseOrders`
 * writes its lines down at the prices in force when it was raised, and nothing
 * afterwards recomputes them.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

// ── Catalog ─────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ImportInput = z.object({
  supplierId: z.string().trim().min(1).max(120),
  text: z.string().min(1).max(500_000),
  sourceId: z.string().uuid().optional().or(z.literal('')),
  /** Replace the supplier's existing catalog (the default) or add to it. */
  mode: z.enum(['replace', 'append']).default('replace'),
  /** The date the sheet's prices come into force. Defaults to today. */
  effectiveFrom: z.string().regex(ISO_DATE, 'Effective date must be YYYY-MM-DD').optional(),
});

/** Existing lines are matched by SKU where both carry one, else by item name. */
const skuKey = (sku: string | null) => (sku && sku.trim() ? `sku:${sku.trim().toLowerCase()}` : null);
const nameKey = (item: string) => `item:${item.trim().toLowerCase()}`;

export async function importSupplierCatalog(
  input: unknown,
): Promise<
  Result<{
    imported: number;
    added: number;
    updated: number;
    priced: number;
    effectiveFrom: string;
    problems: { line: number; reason: string }[];
    unknownHeaders: string[];
  }>
> {
  const parsed = ImportInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  const d = parsed.data;
  const supplier = leanSuppliersById([d.supplierId])[d.supplierId];
  if (!supplier) return { ok: false, error: 'Supplier not found in the directory.' };

  const result = parseCatalogSheet(d.text);
  if (result.rows.length === 0) {
    return {
      ok: false,
      error: result.problems[0]?.reason ?? 'No rows could be read from that sheet.',
    };
  }

  const now = new Date();
  const effectiveFrom = d.effectiveFrom ?? now.toISOString().slice(0, 10);
  const sourceId = d.sourceId || null;

  const existing = await db
    .select()
    .from(farmSupplierItems)
    .where(eq(farmSupplierItems.supplierId, d.supplierId));
  const bySku = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const e of existing) {
    const k = skuKey(e.sku);
    if (k && !bySku.has(k)) bySku.set(k, e.id);
    const n = nameKey(e.item);
    if (!byName.has(n)) byName.set(n, e.id);
  }

  const matchedIds = new Set<string>();
  const priced: { itemId: string; unitPrice: number | null; priceBasis: string | null }[] = [];
  let added = 0;
  let updated = 0;

  for (const r of result.rows) {
    const fields = {
      item: r.item,
      category: r.category,
      variety: r.variety,
      packSize: r.packSize,
      unit: r.unit,
      minOrderQty: r.minOrderQty,
      leadTimeDays: r.leadTimeDays,
      availStartMonth: r.availStartMonth,
      availEndMonth: r.availEndMonth,
      certification: r.certification,
      origin: r.origin,
      sku: r.sku,
      notes: r.notes,
      sourceId,
      importedAt: now,
    };
    const k = skuKey(r.sku);
    const hit = (k ? bySku.get(k) : undefined) ?? byName.get(nameKey(r.item));
    let itemId: string;
    if (hit && !matchedIds.has(hit)) {
      // The same line on a new sheet: its id, approval and price history stand.
      await db.update(farmSupplierItems).set({ ...fields, updatedAt: now }).where(eq(farmSupplierItems.id, hit));
      itemId = hit;
      updated++;
    } else {
      const ins = await db
        .insert(farmSupplierItems)
        .values({ supplierId: d.supplierId, status: 'candidate', createdBy: access.userId, ...fields })
        .returning({ id: farmSupplierItems.id });
      itemId = ins[0]!.id;
      added++;
    }
    matchedIds.add(itemId);
    if (r.unitPrice !== null) priced.push({ itemId, unitPrice: r.unitPrice, priceBasis: r.priceBasis });
  }

  // Replace governs the set of lines: what this sheet does not carry is gone.
  if (d.mode === 'replace') {
    const dropped = existing.filter((e) => !matchedIds.has(e.id)).map((e) => e.id);
    if (dropped.length > 0) await db.delete(farmSupplierItems).where(inArray(farmSupplierItems.id, dropped));
  }

  if (priced.length > 0) {
    await db
      .insert(farmSupplierItemPrices)
      .values(
        priced.map((p) => ({
          itemId: p.itemId,
          effectiveFrom,
          unitPrice: p.unitPrice,
          priceBasis: p.priceBasis,
          sourceId,
          note: 'Imported from the price sheet.',
          createdBy: access.userId,
        })),
      )
      // One price per line per date: re-importing the same sheet corrects it.
      .onConflictDoUpdate({
        target: [farmSupplierItemPrices.itemId, farmSupplierItemPrices.effectiveFrom],
        set: { unitPrice: sql`excluded.unit_price`, priceBasis: sql`excluded.price_basis`, sourceId: sql`excluded.source_id` },
      });
  }

  revalidatePath('/farm', 'layout');
  return {
    ok: true,
    imported: result.rows.length,
    added,
    updated,
    priced: priced.length,
    effectiveFrom,
    problems: result.problems,
    unknownHeaders: result.unknownHeaders,
  };
}

// ── Approval and prices ─────────────────────────────────────────────────────

const ApproveInput = z.object({ id: z.string().uuid(), approved: z.boolean() });

/**
 * Approve a catalog line, or set it back to candidate. Only an approved line
 * prices the plan or a purchase order; a candidate is a quote on file.
 */
export async function setCatalogItemApproval(input: unknown): Promise<Result> {
  const parsed = ApproveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  const { id, approved } = parsed.data;
  await db
    .update(farmSupplierItems)
    .set({
      status: approved ? 'approved' : 'candidate',
      approvedAt: approved ? new Date() : null,
      approvedBy: approved ? access.userId : null,
      updatedAt: new Date(),
    })
    .where(eq(farmSupplierItems.id, id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

const PriceInput = z.object({
  itemId: z.string().uuid(),
  effectiveFrom: z.string().regex(ISO_DATE, 'Effective date must be YYYY-MM-DD'),
  unitPrice: z.number().finite().nonnegative().nullable(),
  priceBasis: z.enum(PRICE_BASES).nullable().optional(),
  sourceId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

/**
 * Put a price in force on a date. A second figure for the same date is an edit
 * of the first, not a rival to it, so it replaces it; an earlier date is left
 * alone, and reading any past date still gives the price that was in force then.
 */
export async function setCatalogPrice(input: unknown): Promise<Result> {
  const parsed = PriceInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  const d = parsed.data;
  const item = await db.select({ id: farmSupplierItems.id }).from(farmSupplierItems).where(eq(farmSupplierItems.id, d.itemId)).limit(1);
  if (!item[0]) return { ok: false, error: 'Catalog line not found.' };
  await db
    .insert(farmSupplierItemPrices)
    .values({
      itemId: d.itemId,
      effectiveFrom: d.effectiveFrom,
      unitPrice: d.unitPrice,
      priceBasis: d.priceBasis ?? null,
      sourceId: d.sourceId ?? null,
      note: d.note ?? null,
      createdBy: access.userId,
    })
    .onConflictDoUpdate({
      target: [farmSupplierItemPrices.itemId, farmSupplierItemPrices.effectiveFrom],
      set: {
        unitPrice: sql`excluded.unit_price`,
        priceBasis: sql`excluded.price_basis`,
        sourceId: sql`excluded.source_id`,
        note: sql`excluded.note`,
      },
    });
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

export async function deleteCatalogPrice(id: unknown): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Bad id.' };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  await db.delete(farmSupplierItemPrices).where(eq(farmSupplierItemPrices.id, id as string));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

export async function deleteCatalogItem(id: unknown): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Bad id.' };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  await db.delete(farmSupplierItems).where(eq(farmSupplierItems.id, id as string));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

export async function clearSupplierCatalog(supplierId: unknown): Promise<Result> {
  const parsed = z.string().trim().min(1).max(120).safeParse(supplierId);
  if (!parsed.success) return { ok: false, error: 'Bad supplier.' };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  await db.delete(farmSupplierItems).where(eq(farmSupplierItems.supplierId, parsed.data));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

// ── Purchase orders ─────────────────────────────────────────────────────────

const DraftLine = z.object({
  input: z.string().trim().min(1).max(200),
  item: z.string().trim().min(1).max(200),
  supplierItemId: z.string().uuid().nullable(),
  qty: z.number().finite().nonnegative(),
  unit: z.string().trim().max(40),
  packSize: z.string().trim().max(80).nullable(),
  cases: z.number().int().nonnegative(),
  unitPriceCents: z.number().int().nonnegative(),
  extendedCents: z.number().int().nonnegative(),
});

const GenerateInput = z.object({
  orderedFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Order date must be YYYY-MM-DD'),
  orders: z
    .array(
      z.object({
        supplierId: z.string().trim().min(1).max(120),
        lines: z.array(DraftLine).min(1),
        notes: z.string().trim().max(1000).optional(),
      }),
    )
    .min(1, 'Nothing to order'),
});

/**
 * Write the draft orders down as documents. Numbering continues the sequence
 * already raised for that production date, so re-running the generator does not
 * reuse a number. Prices are taken from the draft as passed — the point of
 * issuing a PO is that it stops moving.
 */
export async function generatePurchaseOrders(
  input: unknown,
): Promise<Result<{ created: { id: string; poNumber: string; supplierName: string }[] }>> {
  const parsed = GenerateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  const d = parsed.data;

  const ids = d.orders.map((o) => o.supplierId);
  const suppliers = leanSuppliersById(ids);
  const missing = ids.filter((id) => !suppliers[id]);
  if (missing.length > 0) {
    return { ok: false, error: `Not in the directory: ${missing.join(', ')}.` };
  }

  let sequence = await countOrdersFor(d.orderedFor);
  const created: { id: string; poNumber: string; supplierName: string }[] = [];

  for (const o of d.orders) {
    sequence += 1;
    const supplier = suppliers[o.supplierId];
    const subtotal = o.lines.reduce((s, l) => s + l.extendedCents, 0);
    const inserted = await db
      .insert(farmPurchaseOrders)
      .values({
        poNumber: purchaseOrderNumber(d.orderedFor, sequence),
        supplierId: o.supplierId,
        supplierName: supplier.name,
        status: 'draft',
        orderedFor: d.orderedFor,
        subtotalCents: subtotal,
        notes: o.notes || null,
        createdBy: access.userId,
      })
      .returning({ id: farmPurchaseOrders.id, poNumber: farmPurchaseOrders.poNumber });

    const po = inserted[0];
    await db.insert(farmPurchaseOrderLines).values(
      o.lines.map((l) => ({
        poId: po.id,
        input: l.input,
        supplierItemId: l.supplierItemId,
        item: l.item,
        qty: l.qty,
        unit: l.unit,
        packSize: l.packSize,
        cases: l.cases,
        unitPriceCents: l.unitPriceCents,
        extendedCents: l.extendedCents,
      })),
    );
    created.push({ id: po.id, poNumber: po.poNumber, supplierName: supplier.name });
  }

  revalidatePath('/farm', 'layout');
  return { ok: true, created };
}

const StatusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(PO_STATUSES as unknown as [string, ...string[]]),
});

/**
 * Move an order along. Only the transitions the workflow allows are accepted —
 * a closed order cannot be reopened, and an order cannot skip from draft to
 * received without being issued.
 */
export async function setPurchaseOrderStatus(input: unknown): Promise<Result> {
  const parsed = StatusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Bad status change.' };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  const { id, status } = parsed.data;

  const rows = await db
    .select({ status: farmPurchaseOrders.status })
    .from(farmPurchaseOrders)
    .where(eq(farmPurchaseOrders.id, id))
    .limit(1);
  const current = rows[0]?.status as PoStatus | undefined;
  if (!current) return { ok: false, error: 'Order not found.' };
  if (!canTransition(current, status as PoStatus)) {
    return { ok: false, error: `An order cannot move from ${current} to ${status}.` };
  }

  const now = new Date();
  await db
    .update(farmPurchaseOrders)
    .set({
      status,
      updatedAt: now,
      ...(status === 'issued' ? { issuedAt: now } : {}),
      ...(status === 'received' ? { receivedAt: now } : {}),
      ...(status === 'closed' ? { closedAt: now } : {}),
    })
    .where(eq(farmPurchaseOrders.id, id));

  revalidatePath('/farm', 'layout');
  return { ok: true };
}

/** Delete a draft. Only a draft — an issued order is a document, not a scratch pad. */
export async function deletePurchaseOrder(id: unknown): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Bad id.' };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  const deleted = await db
    .delete(farmPurchaseOrders)
    .where(and(eq(farmPurchaseOrders.id, id as string), eq(farmPurchaseOrders.status, 'draft')))
    .returning({ id: farmPurchaseOrders.id });
  if (deleted.length === 0) {
    return { ok: false, error: 'Only a draft order can be deleted. Cancel an issued order instead.' };
  }
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

