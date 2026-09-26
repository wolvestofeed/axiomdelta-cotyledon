'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { farmFacilityLayouts } from '@mf/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from './access';
import { FACILITY_ZONES } from '../_data/facility-design';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

/**
 * MicroFarm — the floor layout, writes (Roadmap Q6). SUPER ADMIN ONLY.
 *
 * A save inserts the next version for the scenario key and build phase;
 * nothing is overwritten. The drawing is a definition of the facility, not a
 * ledger entry, and no ledger reads it.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}

const Room = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(['room', 'spine', 'hood', 'exit', 'drain', 'hand_sink', 'boundary']),
  label: z.string().max(120),
  x: z.number().min(-1000).max(1000),
  y: z.number().min(-1000).max(1000),
  w: z.number().min(0).max(1000),
  h: z.number().min(0).max(1000),
  zone: z.enum(FACILITY_ZONES).nullable().optional(),
  supportKey: z.string().max(64).nullable().optional(),
});

const Unit = z.object({
  id: z.string().min(1).max(64),
  key: z.string().min(1).max(200),
  unit: z.number().int().min(1).max(10_000),
  x: z.number().min(-1000).max(1000),
  y: z.number().min(-1000).max(1000),
  rot: z.union([z.literal(0), z.literal(90)]),
});

const SaveInput = z.object({
  scenarioKey: z.string().min(1).max(64),
  buildPhase: z.number().int().min(1).max(3),
  label: z.string().max(120).default(''),
  shellWidthFt: z.number().min(10, 'The shell is at least 10 ft wide').max(1000),
  shellDepthFt: z.number().min(10, 'The shell is at least 10 ft deep').max(1000),
  rooms: z.array(Room).max(500),
  units: z.array(Unit).max(2000),
});

export async function saveFacilityLayout(...args: Parameters<typeof saveFacilityLayoutInner>): ReturnType<typeof saveFacilityLayoutInner> {
  return withWorkspace(() => saveFacilityLayoutInner(...args));
}

async function saveFacilityLayoutInner(input: unknown): Promise<Result<{ id: string; version: number }>> {
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const [{ next } = { next: 1 }] = await db
    .select({ next: sql<number>`coalesce(max(${farmFacilityLayouts.version}), 0) + 1` })
    .from(farmFacilityLayouts)
    .where(and(eq(farmFacilityLayouts.scenarioKey, d.scenarioKey), eq(farmFacilityLayouts.buildPhase, d.buildPhase)));
  const inserted = await db
    .insert(farmFacilityLayouts)
    .values({
      scenarioKey: d.scenarioKey,
      buildPhase: d.buildPhase,
      version: Number(next),
      label: d.label,
      shellWidthFt: d.shellWidthFt,
      shellDepthFt: d.shellDepthFt,
      layout: { rooms: d.rooms, units: d.units },
      createdBy: access.userId,
    })
    .returning({ id: farmFacilityLayouts.id, version: farmFacilityLayouts.version });
  if (!inserted[0]) return { ok: false, error: 'The layout was not saved.' };
  revalidatePath('/farm/sustainability/facility');
  return { ok: true, id: inserted[0].id, version: inserted[0].version };
}
