import 'server-only';
import { asc } from 'drizzle-orm';
import { museEquipment } from '@ct/db';
import { db } from '@/lib/db';
import { equipmentSeed, type EquipmentLine } from '../_data/capex';
import { equipmentFromRow } from '../_engine/equipment';
import { withSeedLock, insertEquipment } from './seed-writes';

/**
 * Impact OS — equipment library read layer (server-only).
 *
 * On first read of an empty table the capex schedule is inserted, split into
 * Planned Phase 1 and Planned Phase 2 (Roadmap N1), `source = 'seed'`, under an
 * advisory lock so two parallel first reads cannot both seed. From then on the
 * table is the equipment list.
 */

async function seedIfEmpty(): Promise<void> {
  const any = await db.select({ id: museEquipment.id }).from(museEquipment).limit(1);
  if (any[0]) return;
  await withSeedLock(db, 'equipment', async (tx) => {
    const again = await tx.select({ id: museEquipment.id }).from(museEquipment).limit(1);
    if (again[0]) return;
    await insertEquipment(tx, equipmentSeed);
  });
}

/** Every equipment row in list order, seeding the library on first read. */
export async function listEquipment(): Promise<EquipmentLine[]> {
  await seedIfEmpty();
  const rows = await db.select().from(museEquipment).orderBy(asc(museEquipment.position), asc(museEquipment.createdAt));
  return rows.map(equipmentFromRow);
}
