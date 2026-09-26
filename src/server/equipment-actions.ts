'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { farmEquipment } from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from '@/server/access';
import { EQUIPMENT_CATEGORIES } from '@/data/capex';
import { FACILITY_ZONES } from '@/data/facility-design';
import { uniqueEquipmentKey } from '@/engine/equipment';
import { withWorkspace } from '@/server/workspace';

/**
 * MicroFarm — equipment library, writes. SUPER ADMIN ONLY.
 *
 * The equipment list is a shared definition (Roadmap N1): quantity, unit cost,
 * status, build-out phase and service date. An edited seed row becomes
 * `user_built`.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}
const fail = (issues: z.ZodIssue[]) => ({ ok: false as const, error: issues.map((i) => i.message).join('; ') });

const EquipmentPatch = z.object({
  id: z.string().uuid(),
  item: z.string().trim().min(1, 'Name the equipment').max(200).optional(),
  category: z.enum(EQUIPMENT_CATEGORIES).optional(),
  status: z.enum(['in_service', 'planned', 'no', 'unset']).optional(),
  buildPhase: z.number().int().min(1).max(3).optional(),
  inServiceDate: isoDate.nullable().optional(),
  newUsed: z.enum(['New', 'Used']).optional(),
  qty: z.number().min(0, 'Quantity cannot be negative').max(100_000).optional(),
  unitCostCents: z.number().int().min(0, 'Unit cost cannot be negative').max(10_000_000_000).optional(),
  critical: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  /** A grow unit's shelves, shelf width and fixture (outline §4); null on equipment no tray sits on. */
  shelves: z.number().int('Shelves is a whole number').min(0).max(100).nullable().optional(),
  shelfWidthIn: z.number().min(1, 'A shelf has a width').max(240).nullable().optional(),
  fixtureKey: z.string().trim().max(60).nullable().optional(),
  /** Pounds one unit takes in one run — the sowing this grow unit bounds; null on equipment a sowing does not pass through. */
  sowingCapacityLb: z.number().min(0, 'Sowing capacity cannot be negative').max(1_000_000).nullable().optional(),
  sowingCapacityBasis: z.enum(['estimated', 'stated', 'observed']).optional(),
  /** The unit as a scheduling resource (0066): estimated open fields. */
  concurrentSowings: z.number().int('Concurrent sowings is a whole number').min(1, 'At least one sowing at once').max(1_000).nullable().optional(),
  changeoverMinutes: z.number().min(0, 'Changeover cannot be negative').max(10_000).nullable().optional(),
  attendedRun: z.boolean().nullable().optional(),
  mayRunUnattended: z.boolean().nullable().optional(),
  resourceBasis: z.enum(['estimated', 'stated', 'observed']).optional(),
  /** The plan footprint and published clearances, inches (Roadmap Q1): open fields on Facility. */
  footprintWidthIn: z.number().min(0, 'Width cannot be negative').max(10_000).nullable().optional(),
  footprintDepthIn: z.number().min(0, 'Depth cannot be negative').max(10_000).nullable().optional(),
  clearanceFrontIn: z.number().min(0, 'Clearance cannot be negative').max(1_000).nullable().optional(),
  clearanceRearIn: z.number().min(0, 'Clearance cannot be negative').max(1_000).nullable().optional(),
  clearanceSideIn: z.number().min(0, 'Clearance cannot be negative').max(1_000).nullable().optional(),
  footprintBasis: z.enum(['sourced', 'estimated', 'stated', 'observed']).optional(),
  zone: z.enum(FACILITY_ZONES).nullable().optional(),
  underHood: z.boolean().optional(),
  footprintSource: z.string().max(500).nullable().optional(),
  manufacturer: z.string().max(120).nullable().optional(),
  model: z.string().max(120).nullable().optional(),
  specSheetUrl: z.string().url('The spec sheet is a URL').max(500).nullable().optional(),
});

export async function updateEquipment(...args: Parameters<typeof updateEquipmentInner>): ReturnType<typeof updateEquipmentInner> {
  return withWorkspace(() => updateEquipmentInner(...args));
}

async function updateEquipmentInner(input: unknown): Promise<Result> {
  const parsed = EquipmentPatch.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { id, ...patch } = parsed.data;
  const updated = await db
    .update(farmEquipment)
    .set({ ...patch, source: 'user_built', updatedBy: access.userId, updatedAt: new Date() })
    .where(eq(farmEquipment.id, id))
    .returning({ id: farmEquipment.id });
  if (!updated[0]) return { ok: false, error: 'That equipment row no longer exists.' };
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

const EquipmentInput = z.object({
  item: z.string().trim().min(1, 'Name the equipment').max(200),
  category: z.enum(EQUIPMENT_CATEGORIES),
  setting: z.enum(['home', 'commercial']).default('home'),
  buildPhase: z.number().int().min(1).max(3).default(1),
});

/** Add a row to the library: status –, no quantity, no cost, until someone enters them. */
export async function createEquipment(...args: Parameters<typeof createEquipmentInner>): ReturnType<typeof createEquipmentInner> {
  return withWorkspace(() => createEquipmentInner(...args));
}

async function createEquipmentInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = EquipmentInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const existing = await db.select({ key: farmEquipment.key }).from(farmEquipment);
  const [{ next } = { next: 0 }] = await db.select({ next: sql<number>`coalesce(max(${farmEquipment.position}), -1) + 1` }).from(farmEquipment);
  const inserted = await db
    .insert(farmEquipment)
    .values({
      key: uniqueEquipmentKey(parsed.data.item, new Set(existing.map((r) => r.key))),
      position: Number(next),
      item: parsed.data.item,
      category: parsed.data.category,
      setting: parsed.data.setting,
      buildPhase: parsed.data.buildPhase,
      status: 'unset',
      source: 'user_built',
      createdBy: access.userId,
    })
    .returning({ id: farmEquipment.id });
  if (!inserted[0]) return { ok: false, error: 'Failed to add the equipment.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id: inserted[0].id };
}
