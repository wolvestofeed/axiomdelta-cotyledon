import { and, asc, eq } from 'drizzle-orm';
import { farmMedia } from '@/db';
import { GROWING_MEDIA } from '@/data/inputs-catalog';
import { mediumFromRow, mediumToRow, type LibraryMedium } from '@/engine/media';
import type { SeedDb } from '@/server/seed-writes';

/**
 * Rows → the Media library, for any Drizzle handle. The server read layer, the grow plan library
 * and the scripts read through this. Every seed row whose key is not on file is inserted first,
 * `source = 'seed'`, idempotent on the workspace and key, so a workspace that predates the library
 * and a new one end up with the same rows. A row still `source = 'seed'` follows the code seed when
 * the seed changes; a row edited in the app is `user_built` and left alone.
 */
export async function seedMissingMedia(db: SeedDb): Promise<void> {
  const rows = await db.select({ key: farmMedia.key, source: farmMedia.source, name: farmMedia.name, form: farmMedia.form, unit: farmMedia.unit, qtyPer1020: farmMedia.qtyPer1020, costPerUnit: farmMedia.costPerUnit, traits: farmMedia.traits, rows: farmMedia.rows }).from(farmMedia);
  const have = new Map(rows.map((r) => [r.key, r]));
  const missing = GROWING_MEDIA.map((m, position) => ({ m, position })).filter(({ m }) => !have.has(m.key));
  if (missing.length > 0) {
    await db
      .insert(farmMedia)
      .values(missing.map(({ m, position }) => mediumToRow(m, position, 'seed')))
      .onConflictDoNothing();
  }
  for (const [position, m] of GROWING_MEDIA.entries()) {
    const row = have.get(m.key);
    if (!row || row.source !== 'seed') continue;
    const seed = mediumToRow(m, position, 'seed');
    const fields = { name: seed.name, form: seed.form, unit: seed.unit, qtyPer1020: seed.qtyPer1020, costPerUnit: seed.costPerUnit, traits: seed.traits, rows: seed.rows };
    const current = { name: row.name, form: row.form, unit: row.unit, qtyPer1020: row.qtyPer1020, costPerUnit: row.costPerUnit, traits: row.traits, rows: row.rows };
    if (JSON.stringify(current) === JSON.stringify(fields)) continue;
    await db.update(farmMedia).set({ ...fields, updatedAt: new Date() }).where(and(eq(farmMedia.key, m.key), eq(farmMedia.source, 'seed')));
  }
}

/** Every row in list order, seeding the missing seed rows first. */
export async function listMediaWith(db: SeedDb): Promise<LibraryMedium[]> {
  await seedMissingMedia(db);
  const rows = await db.select().from(farmMedia).orderBy(asc(farmMedia.position), asc(farmMedia.createdAt));
  return rows.map(mediumFromRow);
}
