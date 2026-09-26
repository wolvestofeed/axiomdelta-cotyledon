'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { museRefrigerantService, museSustainabilityReadings } from '@ct/db';
import { db } from '@/lib/db';
import { accessRefusal, requireMuseOperator, requireMuseSuperAdmin } from './access';
import { appendPosting } from './posting-log';
import { periodOf } from '../_engine/actuals';
import { READING_METRICS, READING_METRIC_KEYS } from '../_engine/sustainability-records';

/**
 * Impact OS — sustainability records, writes (Roadmap N6 slice 4, 0072). An operator
 * enters a bill, lab result, inspection or refrigerant service ticket on Actual; a
 * super admin removes one with the reason. Every entry and removal is on the posting
 * trail. No record is edited: a wrong one is removed and the right one entered.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}

function fail(issues: { message: string }[]): { ok: false; error: string } {
  return { ok: false, error: issues[0]?.message ?? 'The record was not understood.' };
}

const ReadingInput = z
  .object({
    metric: z.enum(READING_METRIC_KEYS as [string, ...string[]]),
    periodStart: isoDate.nullable().default(null),
    readOn: isoDate,
    quantity: z.number().finite().min(0).nullable().default(null),
    sourceId: z.string().uuid().nullable().default(null),
    notes: z.string().trim().max(400).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    const m = READING_METRICS[v.metric as keyof typeof READING_METRICS];
    if (m.fold !== 'event' && v.quantity === null) ctx.addIssue({ code: 'custom', message: `${m.label} needs a quantity.` });
    if (v.metric === 'grease_trap_fill' && v.quantity !== null && v.quantity > 1) ctx.addIssue({ code: 'custom', message: 'Grease-trap fill is a fraction from 0 to 1.' });
    if (v.periodStart && v.periodStart > v.readOn) ctx.addIssue({ code: 'custom', message: 'The bill period starts after it ends.' });
  });

export async function recordReading(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = ReadingInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const id = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(museSustainabilityReadings)
      .values({ metric: d.metric, periodStart: d.periodStart, readOn: d.readOn, quantity: d.quantity, sourceId: d.sourceId, notes: d.notes, recordedBy: access.email ?? access.userId })
      .returning({ id: museSustainabilityReadings.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_sustainability', recordKind: 'sustainability_reading', recordId: row.id, period: periodOf(d.readOn), detail: { metric: d.metric, readOn: d.readOn, quantity: d.quantity } });
    return row?.id ?? null;
  });
  if (!id) return { ok: false, error: 'Failed to enter the record.' };
  revalidatePath('/muse/sustainability', 'layout');
  return { ok: true, id };
}

const RemoveInput = z.object({ id: z.string().uuid(), reason: z.string().trim().min(3, 'A removal states why').max(400) });

export async function deleteReading(input: unknown): Promise<Result> {
  const parsed = RemoveInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const done = await db.transaction(async (tx) => {
    const rows = await tx.delete(museSustainabilityReadings).where(eq(museSustainabilityReadings.id, parsed.data.id)).returning();
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_sustainability', recordKind: 'sustainability_reading', recordId: row.id, period: periodOf(row.readOn), detail: { removed: true, reason: parsed.data.reason, metric: row.metric, readOn: row.readOn, quantity: row.quantity } });
    return Boolean(row);
  });
  if (!done) return { ok: false, error: 'That record is not on file.' };
  revalidatePath('/muse/sustainability', 'layout');
  return { ok: true };
}

const ServiceInput = z.object({
  equipmentKey: z.string().trim().min(1),
  servicedOn: isoDate,
  lbAdded: z.number().finite().positive('Pounds added must be more than zero'),
  sourceId: z.string().uuid().nullable().default(null),
  technician: z.string().trim().max(200).nullable().default(null),
  notes: z.string().trim().max(400).nullable().default(null),
});

export async function recordRefrigerantService(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = ServiceInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const id = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(museRefrigerantService)
      .values({ equipmentKey: d.equipmentKey, servicedOn: d.servicedOn, lbAdded: d.lbAdded, sourceId: d.sourceId, technician: d.technician, notes: d.notes, recordedBy: access.email ?? access.userId })
      .returning({ id: museRefrigerantService.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_sustainability', recordKind: 'refrigerant_service', recordId: row.id, period: periodOf(d.servicedOn), detail: { equipmentKey: d.equipmentKey, servicedOn: d.servicedOn, lbAdded: d.lbAdded } });
    return row?.id ?? null;
  });
  if (!id) return { ok: false, error: 'Failed to enter the service record.' };
  revalidatePath('/muse/sustainability', 'layout');
  return { ok: true, id };
}

export async function deleteRefrigerantService(input: unknown): Promise<Result> {
  const parsed = RemoveInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const done = await db.transaction(async (tx) => {
    const rows = await tx.delete(museRefrigerantService).where(eq(museRefrigerantService.id, parsed.data.id)).returning();
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_sustainability', recordKind: 'refrigerant_service', recordId: row.id, period: periodOf(row.servicedOn), detail: { removed: true, reason: parsed.data.reason, equipmentKey: row.equipmentKey, servicedOn: row.servicedOn, lbAdded: row.lbAdded } });
    return Boolean(row);
  });
  if (!done) return { ok: false, error: 'That service record is not on file.' };
  revalidatePath('/muse/sustainability', 'layout');
  return { ok: true };
}
