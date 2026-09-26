'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  museMenuCycles,
  museMenuCycleDays,
  museOrders,
  museCustomers,
  museCustomerSites,
  museCustomerServices,
  museDeliveries,
  museRecipes,
} from '@ct/db';
import { db } from '@/lib/db';
import { accessRefusal, requireMuseOperator, requireMuseSuperAdmin } from './access';
import { periodOf } from '../_engine/actuals';
import { refuseIfLocked } from './periods';
import { appendPosting } from './posting-log';

/**
 * Impact OS — menu cycles, meal plans and orders, writes. SUPER ADMIN ONLY.
 *
 * A saved menu cycle, a customer's meal plan and a stored order are facts of
 * record (Roadmap N4a). Assigning a cycle copies it onto the customer; editing
 * a saved cycle moves only the plans picked in the apply-to picker. A forecast
 * order a meal plan generates is derived on read and is not written here;
 * confirming it writes the row that replaces it. A Forecast Customer takes no
 * stored order and no delivery: it is never on Actual. Delivering an order writes the delivery
 * record (the document revenue posts from) and links the order to it.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}
const fail = (issues: z.ZodIssue[]) => ({ ok: false as const, error: issues.map((i) => i.message).join('; ') });

// ── Menu cycles ─────────────────────────────────────────────────────────────

const CycleInput = z.object({
  /** Null = a saved menu cycle on the shared list; set = a meal plan programmed for this customer. */
  customerId: z.string().uuid().nullable().default(null),
  /** Set = the plan for one of the customer's services. */
  customerServiceId: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1, 'Name the cycle').max(200),
  startDate: isoDate,
  endDate: isoDate.nullable().default(null),
  lengthDays: z.number().int().min(1).max(60),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1, 'A cycle serves on at least one weekday'),
  status: z.enum(['active', 'inactive']).default('active'),
  notes: z.string().max(2000).nullable().default(null),
  days: z.array(z.object({ day: z.number().int().min(1), recipeCode: z.string().max(40).nullable() })),
});

/** A plan for a service must name one of the customer's services. */
async function checkPlanOwner(d: { customerId: string | null; customerServiceId: string | null; endDate: string | null; startDate: string }): Promise<string | null> {
  if (d.endDate !== null && d.endDate < d.startDate) return 'The end date is before the start date.';
  if (d.customerServiceId === null) return null;
  if (d.customerId === null) return 'A saved menu cycle is not tied to a service; assign it to a customer first.';
  const rows = await db
    .select({ id: museCustomerServices.id })
    .from(museCustomerServices)
    .innerJoin(museCustomerSites, eq(museCustomerSites.id, museCustomerServices.customerSiteId))
    .where(and(eq(museCustomerServices.id, d.customerServiceId), eq(museCustomerSites.customerId, d.customerId)))
    .limit(1);
  return rows[0] ? null : 'The service is not one of this customer’s services.';
}

async function checkCycleDays(d: z.infer<typeof CycleInput>): Promise<string | null> {
  const seen = new Set<number>();
  for (const day of d.days) {
    if (day.day > d.lengthDays) return `Day ${day.day} is past the cycle length of ${d.lengthDays}.`;
    if (seen.has(day.day)) return `Day ${day.day} appears twice.`;
    seen.add(day.day);
  }
  const codes = [...new Set(d.days.map((x) => x.recipeCode).filter((c): c is string => c !== null))];
  if (codes.length === 0) return null;
  const found = await db.select({ code: museRecipes.code }).from(museRecipes);
  const have = new Set(found.map((r) => r.code));
  const missing = codes.filter((c) => !have.has(c));
  return missing.length ? `Not in the recipe library: ${missing.join(', ')}.` : null;
}

export async function createMenuCycle(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = CycleInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const problem = (await checkCycleDays(parsed.data)) ?? (await checkPlanOwner(parsed.data));
  if (problem) return { ok: false, error: problem };
  const { days, ...header } = parsed.data;
  const inserted = await db
    .insert(museMenuCycles)
    .values({ ...header, weekdays: [...new Set(header.weekdays)].sort(), createdBy: access.userId })
    .returning({ id: museMenuCycles.id });
  const id = inserted[0]?.id;
  if (!id) return { ok: false, error: 'Failed to save the menu cycle.' };
  if (days.length) await db.insert(museMenuCycleDays).values(days.map((d) => ({ cycleId: id, day: d.day, recipeCode: d.recipeCode })));
  revalidatePath('/muse', 'layout');
  return { ok: true, id };
}

/**
 * Edit a saved menu cycle or a meal plan. For a saved cycle, `applyToPlanIds`
 * names the meal plans copied from it that take the new sequence — length,
 * weekdays and recipe per day — the apply-to picker's selection or all of
 * them. A plan not named keeps its sequence. Each plan keeps its own customer,
 * service, start and end.
 */
export async function updateMenuCycle(input: unknown): Promise<Result<{ applied: number }>> {
  const parsed = CycleInput.extend({ id: z.string().uuid(), applyToPlanIds: z.array(z.string().uuid()).default([]) }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const problem = (await checkCycleDays(parsed.data)) ?? (await checkPlanOwner(parsed.data));
  if (problem) return { ok: false, error: problem };
  const { id, days, applyToPlanIds, ...header } = parsed.data;
  const current = await db.select({ id: museMenuCycles.id, customerId: museMenuCycles.customerId }).from(museMenuCycles).where(eq(museMenuCycles.id, id)).limit(1);
  if (!current[0]) return { ok: false, error: 'Menu cycle not found.' };
  if ((current[0].customerId === null) !== (header.customerId === null)) return { ok: false, error: 'A saved cycle stays on the shared list and a meal plan stays with its customer; assign a copy instead.' };
  if (current[0].customerId !== null && current[0].customerId !== header.customerId) return { ok: false, error: 'A meal plan stays with its customer.' };
  if (current[0].customerId !== null && applyToPlanIds.length > 0) return { ok: false, error: 'Only a saved menu cycle is applied to customers.' };
  const weekdays = [...new Set(header.weekdays)].sort();
  const applied = await db.transaction(async (tx) => {
    await tx.update(museMenuCycles).set({ ...header, weekdays, source: 'user_built', updatedAt: new Date() }).where(eq(museMenuCycles.id, id));
    await tx.delete(museMenuCycleDays).where(eq(museMenuCycleDays.cycleId, id));
    if (days.length) await tx.insert(museMenuCycleDays).values(days.map((d) => ({ cycleId: id, day: d.day, recipeCode: d.recipeCode })));
    if (applyToPlanIds.length === 0) return 0;
    const plans = await tx
      .select({ id: museMenuCycles.id })
      .from(museMenuCycles)
      .where(and(inArray(museMenuCycles.id, applyToPlanIds), eq(museMenuCycles.fromCycleId, id)));
    const planIds = plans.map((p) => p.id);
    if (planIds.length === 0) return 0;
    await tx.update(museMenuCycles).set({ lengthDays: header.lengthDays, weekdays, updatedAt: new Date() }).where(inArray(museMenuCycles.id, planIds));
    await tx.delete(museMenuCycleDays).where(inArray(museMenuCycleDays.cycleId, planIds));
    if (days.length) await tx.insert(museMenuCycleDays).values(planIds.flatMap((cycleId) => days.map((d) => ({ cycleId, day: d.day, recipeCode: d.recipeCode }))));
    return planIds.length;
  });
  revalidatePath('/muse', 'layout');
  return { ok: true, applied };
}

const AssignInput = z.object({
  cycleId: z.string().uuid(),
  customerIds: z.array(z.string().uuid()).min(1, 'Pick a customer'),
  /** Set = the plan for one service of a single customer. */
  customerServiceId: z.string().uuid().nullable().default(null),
  /** Absent = the cycle's own start date. */
  startDate: isoDate.nullable().default(null),
});

/** One-click assign: copy a saved menu cycle onto each customer as its meal plan. */
export async function assignMenuCycle(input: unknown): Promise<Result<{ ids: string[] }>> {
  const parsed = AssignInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  if (d.customerServiceId && d.customerIds.length !== 1) return { ok: false, error: 'A service plan is assigned to one customer at a time.' };
  const cycle = await db.select().from(museMenuCycles).where(and(eq(museMenuCycles.id, d.cycleId), isNull(museMenuCycles.customerId))).limit(1);
  const c = cycle[0];
  if (!c) return { ok: false, error: 'Saved menu cycle not found.' };
  if (d.customerServiceId) {
    const problem = await checkPlanOwner({ customerId: d.customerIds[0], customerServiceId: d.customerServiceId, endDate: null, startDate: d.startDate ?? String(c.startDate) });
    if (problem) return { ok: false, error: problem };
  }
  const days = await db.select().from(museMenuCycleDays).where(eq(museMenuCycleDays.cycleId, c.id));
  const found = await db.select({ id: museCustomers.id }).from(museCustomers).where(inArray(museCustomers.id, d.customerIds));
  if (found.length !== new Set(d.customerIds).size) return { ok: false, error: 'A picked customer is not on the list.' };
  const ids = await db.transaction(async (tx) => {
    const out: string[] = [];
    for (const customerId of new Set(d.customerIds)) {
      const row = await tx
        .insert(museMenuCycles)
        .values({
          customerId,
          customerServiceId: d.customerServiceId,
          fromCycleId: c.id,
          name: c.name,
          startDate: d.startDate ?? c.startDate,
          lengthDays: c.lengthDays,
          weekdays: c.weekdays,
          status: 'active',
          notes: `Copied from ${c.name}.`,
          createdBy: access.userId,
        })
        .returning({ id: museMenuCycles.id });
      const id = row[0]?.id;
      if (!id) continue;
      if (days.length) await tx.insert(museMenuCycleDays).values(days.map((x) => ({ cycleId: id, day: x.day, recipeCode: x.recipeCode })));
      out.push(id);
    }
    return out;
  });
  revalidatePath('/muse', 'layout');
  return { ok: true, ids };
}

export async function deleteMenuCycle(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db.delete(museMenuCycles).where(eq(museMenuCycles.id, parsed.data.id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

// ── Orders ──────────────────────────────────────────────────────────────────

const OrderInput = z.object({
  orderDate: isoDate,
  customerId: z.string().uuid(),
  customerSiteId: z.string().uuid(),
  customerServiceId: z.string().uuid().nullable().default(null),
  recipeCode: z.string().min(1, 'Name the recipe').max(40),
  meals: z.number().min(0),
  status: z.enum(['forecast', 'confirmed']).default('forecast'),
  pricePerMealCents: z.number().int().min(0).nullable().default(null),
  menuCycleId: z.string().uuid().nullable().default(null),
  source: z.enum(['typed', 'cycle', 'sales', 'portal']).default('typed'),
  notes: z.string().max(2000).nullable().default(null),
});

/** The site must belong to the customer; the order takes the customer's channel. */
async function siteOf(customerId: string, customerSiteId: string): Promise<{ channel: number; siteId: string | null; name: string; customerStatus: string } | null> {
  const rows = await db
    .select({ channel: museCustomers.channel, siteId: museCustomerSites.siteId, name: museCustomerSites.name, customerStatus: museCustomers.status })
    .from(museCustomerSites)
    .innerJoin(museCustomers, eq(museCustomers.id, museCustomerSites.customerId))
    .where(and(eq(museCustomerSites.id, customerSiteId), eq(museCustomers.id, customerId)))
    .limit(1);
  return rows[0] ?? null;
}

async function recipeExists(code: string): Promise<boolean> {
  const r = await db.select({ id: museRecipes.id }).from(museRecipes).where(eq(museRecipes.code, code)).limit(1);
  return Boolean(r[0]);
}

/** Store an order: a typed forecast, or a confirmed count (from a derived forecast order or typed). */
export async function createOrder(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = OrderInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const site = await siteOf(d.customerId, d.customerSiteId);
  if (!site) return { ok: false, error: 'The site is not one of this customer’s sites.' };
  if (site.customerStatus === 'forecast') return { ok: false, error: 'A Forecast Customer is never on Actual; its orders live in forecasts only.' };
  if (d.customerServiceId) {
    const sv = await db.select({ id: museCustomerServices.id }).from(museCustomerServices).where(and(eq(museCustomerServices.id, d.customerServiceId), eq(museCustomerServices.customerSiteId, d.customerSiteId))).limit(1);
    if (!sv[0]) return { ok: false, error: 'The service is not one of this site’s services.' };
  }
  if (!(await recipeExists(d.recipeCode))) return { ok: false, error: `${d.recipeCode} is not in the recipe library.` };
  const clash = await db
    .select({ id: museOrders.id })
    .from(museOrders)
    .where(
      and(
        eq(museOrders.orderDate, d.orderDate),
        eq(museOrders.customerSiteId, d.customerSiteId),
        eq(museOrders.recipeCode, d.recipeCode),
        d.customerServiceId ? eq(museOrders.customerServiceId, d.customerServiceId) : isNull(museOrders.customerServiceId),
      ),
    )
    .limit(1);
  if (clash[0]) return { ok: false, error: 'An order for that site, service, date and recipe is already on file; edit it instead.' };
  const inserted = await db
    .insert(museOrders)
    .values({ ...d, channel: site.channel, createdBy: access.userId })
    .returning({ id: museOrders.id });
  if (!inserted[0]) return { ok: false, error: 'Failed to save the order.' };
  revalidatePath('/muse', 'layout');
  return { ok: true, id: inserted[0].id };
}

const UpdateOrderInput = z.object({
  id: z.string().uuid(),
  orderDate: isoDate,
  recipeCode: z.string().min(1).max(40),
  meals: z.number().min(0),
  status: z.enum(['forecast', 'confirmed']),
  pricePerMealCents: z.number().int().min(0).nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
});

/** Edit a stored order that has not been delivered. */
export async function updateOrder(input: unknown): Promise<Result> {
  const parsed = UpdateOrderInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { id, ...rest } = parsed.data;
  const current = await db.select({ status: museOrders.status, customerSiteId: museOrders.customerSiteId, customerServiceId: museOrders.customerServiceId }).from(museOrders).where(eq(museOrders.id, id)).limit(1);
  if (!current[0]) return { ok: false, error: 'Order not found.' };
  if (current[0].status === 'delivered') return { ok: false, error: 'A delivered order is not edited; its delivery record is the fact.' };
  if (!(await recipeExists(rest.recipeCode))) return { ok: false, error: `${rest.recipeCode} is not in the recipe library.` };
  const clash = await db
    .select({ id: museOrders.id })
    .from(museOrders)
    .where(
      and(
        eq(museOrders.orderDate, rest.orderDate),
        eq(museOrders.customerSiteId, current[0].customerSiteId),
        eq(museOrders.recipeCode, rest.recipeCode),
        current[0].customerServiceId ? eq(museOrders.customerServiceId, current[0].customerServiceId) : isNull(museOrders.customerServiceId),
      ),
    )
    .limit(1);
  if (clash[0] && clash[0].id !== id) return { ok: false, error: 'Another order for that site, service, date and recipe is already on file.' };
  await db.update(museOrders).set({ ...rest, updatedAt: new Date() }).where(eq(museOrders.id, id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

/** Remove a stored order. A delivered order keeps its delivery record on Actuals. */
export async function deleteOrder(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db.delete(museOrders).where(eq(museOrders.id, parsed.data.id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

const DeliverInput = z.object({
  orderId: z.string().uuid(),
  deliveredOn: isoDate,
  /** Meals actually delivered; the order keeps what was ordered. */
  meals: z.number().min(0),
  pricePerMealCents: z.number().int().min(0),
  lotCodes: z.array(z.string().max(80)).default([]),
  deliveredBy: z.string().max(120).nullable().default(null),
  handoffTempF: z.number().nullable().default(null),
  receivedBy: z.string().max(120).nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
});

/**
 * Deliver a stored order: write the delivery record (revenue and cost of goods
 * sold post from it) and link the order to it. The order's meal count is what
 * was ordered; the record's is what was delivered.
 */
export async function deliverOrder(input: unknown): Promise<Result<{ deliveryId: string }>> {
  const parsed = DeliverInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const order = await db.select().from(museOrders).where(eq(museOrders.id, d.orderId)).limit(1);
  const o = order[0];
  if (!o) return { ok: false, error: 'Order not found.' };
  if (o.status === 'delivered' && o.deliveryId) return { ok: false, error: 'This order already names a delivery record.' };
  const locked = await refuseIfLocked(d.deliveredOn);
  if (locked) return { ok: false, error: locked };
  const site = await siteOf(o.customerId, o.customerSiteId);
  if (site?.customerStatus === 'forecast') return { ok: false, error: 'A Forecast Customer is never on Actual; nothing is delivered to it.' };
  const deliveryId = await db.transaction(async (tx) => {
    const delivery = await tx
    .insert(museDeliveries)
    .values({
      deliveredOn: d.deliveredOn,
      phase: o.channel,
      siteId: site?.siteId ?? null,
      siteName: site?.name ?? null,
      meals: d.meals,
      pricePerMealCents: d.pricePerMealCents,
      lotCodes: d.lotCodes,
      deliveredBy: d.deliveredBy,
      handoffTempF: d.handoffTempF,
      receivedBy: d.receivedBy,
      customerId: o.customerId,
      notes: d.notes ?? `Order ${o.id} · ${o.recipeCode}`,
      createdBy: access.userId,
    })
    .returning({ id: museDeliveries.id });
    const id = delivery[0]?.id;
    if (!id) return null;
    await tx.update(museOrders).set({ status: 'delivered', deliveryId: id, updatedAt: new Date() }).where(eq(museOrders.id, o.id));
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_delivery', recordKind: 'delivery', recordId: id, period: periodOf(d.deliveredOn), detail: { orderId: o.id, recipeCode: o.recipeCode, deliveredOn: d.deliveredOn, siteName: site?.name ?? null, meals: d.meals, pricePerMealCents: d.pricePerMealCents, lotCodes: d.lotCodes } });
    return id;
  });
  if (!deliveryId) return { ok: false, error: 'Failed to record the delivery.' };
  revalidatePath('/muse', 'layout');
  return { ok: true, deliveryId };
}
