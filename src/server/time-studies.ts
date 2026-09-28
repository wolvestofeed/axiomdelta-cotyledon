import 'server-only';
import { asc, inArray } from 'drizzle-orm';
import { farmTimeStudies, farmTimeStudyIntervals, farmTimeStudyLines } from '@/db';
import { db } from '@/lib/db';
import type { TimeStudyLibrary } from '@/data/time-studies';
import { deriveGrowCapacity, growUnitsFrom } from '@/engine/grow-capacity';
import type { LibraryGrowPlan } from '@/engine/grow-plan-library';
import { estimatedTimeStudy } from '@/engine/time-study-estimate';
import { timeStudyFromRows } from '@/engine/time-studies';
import { listGrowPlans } from '@/server/grow-plans';
import { listEquipment } from '@/server/equipment';
import { withSeedLock, insertTimeStudy } from '@/server/seed-writes';

/**
 * Cotyledon — time studies, read layer (server-only, Roadmap O2).
 *
 * On read, every library grow plan with no study at all is seeded with one
 * ESTIMATED study, `source = 'seed'`, under an advisory lock and idempotent
 * per plan: the built estimate (`estimatedTimeStudy`) at its sowing, the trays
 * one of the workspace's grow units takes. The estimate stands as the labor standard
 * until an observed study is approved.
 */

async function seedMissingStudies(growPlans: readonly LibraryGrowPlan[]): Promise<void> {
  if (growPlans.length === 0) return;
  const covered = new Set((await db.select({ growPlanId: farmTimeStudies.growPlanId }).from(farmTimeStudies)).map((r) => r.growPlanId));
  if (growPlans.every((r) => covered.has(r.id))) return;
  const growUnits = growUnitsFrom(await listEquipment());
  await withSeedLock(db, 'timeStudies', async (tx) => {
    const again = new Set((await tx.select({ growPlanId: farmTimeStudies.growPlanId }).from(farmTimeStudies)).map((r) => r.growPlanId));
    for (const r of growPlans) {
      if (again.has(r.id)) continue;
      // A plan no grow unit takes yet has a sowing of zero; its estimate is written per tray until a unit lights it.
      const sowing = deriveGrowCapacity(r, growUnits).sowingTrays;
      const seed = estimatedTimeStudy(r, Math.max(1, sowing));
      await insertTimeStudy(tx, r.id, seed, 'seed');
    }
  });
}

export async function listTimeStudies(): Promise<TimeStudyLibrary> {
  const growPlans = await listGrowPlans();
  const growPlanIds = Object.fromEntries(growPlans.map((r) => [r.code, r.id]));
  await seedMissingStudies(growPlans);
  const codeById = new Map(growPlans.map((r) => [r.id, r.code]));

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
      const code = codeById.get(s.growPlanId);
      return code ? [timeStudyFromRows(code, s, linesByStudy.get(s.id) ?? [])] : [];
    }),
    intervals: Object.fromEntries(intervals.flatMap((i) => {
      const code = codeById.get(i.growPlanId);
      return code ? [[code, i.intervalDays]] : [];
    })),
    growPlanIds,
  };
}
