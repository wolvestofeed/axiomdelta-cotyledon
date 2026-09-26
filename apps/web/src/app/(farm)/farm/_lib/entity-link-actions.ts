'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { farmEntityLinks } from '@mf/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from './access';
import { getEntity } from './entity-directory';
import { LINK_RELATIONS } from './entity-links';
import { ENTITY_KINDS } from '../_engine/entity-links';

/**
 * Record or remove a link that is a fact of record. SUPER ADMIN ONLY.
 *
 * The `to` side is verified against the directory before the row is written, so
 * a recorded link always names a record the platform can resolve and render. The
 * `from` side is a lot code, journal entry id, or role title — identifiers the
 * platform computes rather than rows it holds, so they are length-checked only.
 *
 * Recording the same edge twice updates its note instead of duplicating it.
 */

type Result = { ok: true; id?: string } | { ok: false; error: string };

const Edge = z.object({
  fromKind: z.string().trim().min(1).max(40),
  fromId: z.string().trim().min(1).max(200),
  toKind: z.enum(ENTITY_KINDS as [string, ...string[]]),
  toId: z.string().trim().min(1).max(200),
  relation: z.enum(LINK_RELATIONS as [string, ...string[]]),
  note: z.string().trim().max(500).optional(),
});

export async function recordEntityLink(input: unknown): Promise<Result> {
  const parsed = Edge.safeParse(input);
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

  const target = await getEntity(d.toKind as never, d.toId);
  if (!target) return { ok: false, error: 'That record is not in the directory.' };

  const inserted = await db
    .insert(farmEntityLinks)
    .values({
      fromKind: d.fromKind,
      fromId: d.fromId,
      toKind: d.toKind,
      toId: d.toId,
      relation: d.relation,
      note: d.note || null,
      createdBy: access.userId,
    })
    .onConflictDoUpdate({
      target: [
        farmEntityLinks.fromKind,
        farmEntityLinks.fromId,
        farmEntityLinks.relation,
        farmEntityLinks.toKind,
        farmEntityLinks.toId,
      ],
      set: { note: d.note || null, updatedAt: new Date() },
    })
    .returning({ id: farmEntityLinks.id });

  revalidatePath('/farm', 'layout');
  return { ok: true, id: inserted[0]?.id };
}

/**
 * Remove one recorded link. Takes the edge rather than the row id so a caller
 * that is replacing a one-to-one link does not have to read the row first.
 */
export async function removeEntityLink(input: unknown): Promise<Result> {
  const parsed = Edge.omit({ note: true }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Bad link.' };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  const d = parsed.data;

  await db
    .delete(farmEntityLinks)
    .where(
      and(
        eq(farmEntityLinks.fromKind, d.fromKind),
        eq(farmEntityLinks.fromId, d.fromId),
        eq(farmEntityLinks.relation, d.relation),
        eq(farmEntityLinks.toKind, d.toKind),
        eq(farmEntityLinks.toId, d.toId),
      ),
    );

  revalidatePath('/farm', 'layout');
  return { ok: true };
}

/** Replace the single link a one-to-one relation holds. `toId` undefined clears it. */
export async function setSingleEntityLink(input: unknown): Promise<Result> {
  const parsed = Edge.extend({ toId: z.string().trim().max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Bad link.' };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  const d = parsed.data;

  await db
    .delete(farmEntityLinks)
    .where(
      and(
        eq(farmEntityLinks.fromKind, d.fromKind),
        eq(farmEntityLinks.fromId, d.fromId),
        eq(farmEntityLinks.relation, d.relation),
      ),
    );
  if (!d.toId) {
    revalidatePath('/farm', 'layout');
    return { ok: true };
  }
  return recordEntityLink(d);
}
