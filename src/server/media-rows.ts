import { asc } from 'drizzle-orm';
import { farmMedia } from '@/db';
import { GROWING_MEDIA } from '@/data/inputs-catalog';
import { mediumFromRow, mediumToRow, type LibraryMedium } from '@/engine/media';
import type { SeedDb } from '@/server/seed-writes';

/**
 * Rows → the Media library, for any Drizzle handle. The server read layer, the grow plan library
 * and the scripts read through this. Every seed row whose key is not on file is inserted first,
 * `source = 'seed'`, idempotent on the workspace and key, so a workspace that predates the library
 * and a new one end up with the same rows; a row edited in the app is left alone.
 */
export async function seedMissingMedia(db: SeedDb): Promise<void> {
  const have = new Set((await db.select({ key: farmMedia.key }).from(farmMedia)).map((r) => r.key));
  const missing = GROWING_MEDIA.map((m, position) => ({ m, position })).filter(({ m }) => !have.has(m.key));
  if (missing.length === 0) return;
  await db
    .insert(farmMedia)
    .values(missing.map(({ m, position }) => mediumToRow(m, position, 'seed')))
    .onConflictDoNothing();
}

/** Every row in list order, seeding the missing seed rows first. */
export async function listMediaWith(db: SeedDb): Promise<LibraryMedium[]> {
  await seedMissingMedia(db);
  const rows = await db.select().from(farmMedia).orderBy(asc(farmMedia.position), asc(farmMedia.createdAt));
  return rows.map(mediumFromRow);
}
