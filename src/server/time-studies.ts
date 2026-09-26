import 'server-only';
import { asc, inArray } from 'drizzle-orm';
import { farmTimeStudies, farmTimeStudyIntervals, farmTimeStudyLines } from '@/db';
import { db } from '@/lib/db';
import type { TimeStudyLibrary } from '@/data/time-studies';
import { deriveGrowCapacity, growUnitsFrom } from '@/engine/grow-capacity';
import type { LibraryCropPlan } from '@/engine/crop-plan-library';
import { estimatedTimeStudy } from '@/engine/time-study-estimate';
import { timeStudyFromRows } from '@/engine/time-studies';
import { listCropPlans } from '@/server/crop-plans';
import { listEquipment } from '@/server/equipment';
import { withSeedLock, insertTimeStudy } from '@/server/seed-writes';

/**
 * MicroFarm — time studies, read layer (server-only, Roadmap O2).
 *
 * On read, every library crop plan with no study at all is seeded with one
 * ESTIMATED study, `source = 'seed'`, under an advisory lock and idempotent
 * per plan: the built estimate (`estimatedTimeStudy`) at its sowing, the trays
 * one of the workspace's grow units takes. The estimate stands as the labor standard
 * until an observed study is approved.
 */

async function seedMissingStudies(cropPlans: readonly LibraryCropPlan[]): Promise<void> {
  if (cropPlans.length === 0) return;
  const covered = new Set((await db.select({ cropPlanId: farmTimeStudies.cropPlanId }).from(farmTimeStudies)).map((r) => r.cropPlanId));
  if (cropPlans.every((r) => covered.has(r.id))) return;
  const growUnits = growUnitsFrom(await listEquipment());
  await withSeedLock(db, 'timeStudies', async (tx) => {
    const again = new Set((await tx.select({ cropPlanId: farmTimeStudies.cropPlanId }).from(farmTimeStudies)).map((r) => r.cropPlanId));
    for (const r of cropPlans) {
      if (again.has(r.id)) continue;
      // A plan no grow unit takes yet has a sowing of zero; its estimate is written per tray until a unit lights it.
      const sowing = deriveGrowCapacity(r, growUnits).sowingTrays;
      const seed = estimatedTimeStudy(r, Math.max(1, sowing));
      await insertTimeStudy(tx, r.id, seed, 'seed');
    }
  });
}

export async function listTimeStudies(): Promise<TimeStudyLibrary> {
  const cropPlans = await listCropPlans();
  const cropPlanIds = Object.fromEntries(cropPlans.map((r) => [r.code, r.id]));
  await seedMissingStudies(cropPlans);
  const codeById = new Map(cropPlans.map((r) => [r.id, r.code]));

  const [studies, intervals] = await Promise.all([
    db.select().from(farmTimeStudies).orderBy(asc(farmTimeStudies.createdAt)),
    db.select().from(farmTimeStudyIntervals),
  ]);
  const lines = studies.length
    ? await db.select().from(farmTimeStudyLines).where(inArray(farmTimeStudyLines.studyId, studies.map((s) => s.id))).orderBy(asc(farmTimeStudyLines.position))
    : [];
  const linesByStudy = new Map<string, typeof lines>();
  for (const l of lines) linesByStudy.set(l.studyId, [...(linesByStudy.get(l.studyId) ?? []), l]);

  return {
    studies: studies.flatMap((s) => {
      const code = codeById.get(s.cropPlanId);
      return code ? [timeStudyFromRows(code, s, linesByStudy.get(s.id) ?? [])] : [];
    }),
    intervals: Object.fromEntries(intervals.flatMap((i) => {
      const code = codeById.get(i.cropPlanId);
      return code ? [[code, i.intervalDays]] : [];
    })),
    cropPlanIds,
  };
}
