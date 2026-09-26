/**
 * MicroFarm — reset the placeholder seed.
 *
 * Deletes every `source = 'seed'` subscriber (pickup points and orders on them cascade)
 * and subscription cycle, inserts any seed crop plan missing from the library, brings
 * crop plans still `source = 'seed'` (header and lines) in line with the code seed, then
 * re-inserts the Plan seed subscribers (the contracted prospect at its stated 125
 * units per service, prospects at zero), the saved student and adult menus, and
 * a flat plan for every subscriber without one (Roadmap N4a). User-built rows are
 * untouched.
 *
 * Run:  DATABASE_URL=postgres://... pnpm farm:reseed
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createDb } from '../../../packages/db/src/index.js';
import { scopedHandle } from './_workspace';
import { listCropPlansWith } from '../src/app/(farm)/farm/_lib/crop-plan-rows';
import {
  deleteSeedRows,
  seedMissingCropPlans,
  syncSeedCropPlans,
  insertSubscribers,
  insertSubscriptionCycles,
  dbSeedSubscribers,
  dbSeedSubscriptionCycles,
  insertMissingFlatPlans,
  withSeedLock,
} from '../src/app/(farm)/farm/_lib/seed-writes';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
loadEnv({ path: join(REPO, '.env') });
loadEnv({ path: join(REPO, '.env.local') });

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set.');
  const handle = await scopedHandle();
  const db = handle.db as unknown as Parameters<typeof withSeedLock>[0];
  try {
    const today = new Date().toISOString().slice(0, 10);
    const removed = await withSeedLock(db, 'subscribers', (tx) => deleteSeedRows(tx));
    console.log(`removed ${removed.subscribers} seed subscriber(s), ${removed.cycles} seed subscription cycle(s)`);
    const added = await withSeedLock(db, 'cropPlans', (tx) => seedMissingCropPlans(tx));
    console.log(`crop plans added: ${added.length ? added.join(', ') : 'none (library already complete)'}`);
    const synced = await withSeedLock(db, 'cropPlans', (tx) => syncSeedCropPlans(tx));
    console.log(`seed crop plans synced (header + lines, version bumped): ${synced.length}`);
    const library = await listCropPlansWith(db);
    const subscribers = await withSeedLock(db, 'subscribers', (tx) => insertSubscribers(tx, dbSeedSubscribers()));
    const cycles = await withSeedLock(db, 'cycles', (tx) => insertSubscriptionCycles(tx, dbSeedSubscriptionCycles(library, today)));
    const plans = await withSeedLock(db, 'cycles', (tx) => insertMissingFlatPlans(tx));
    console.log(`seeded ${subscribers} subscriber(s), ${cycles} subscription cycle(s), ${plans} flat plan(s); library has ${library.length} crop plan(s)`);
    for (const c of dbSeedSubscribers()) {
      const units = c.pickupPoints.flatMap((x) => x.services).reduce((s, sv) => s + (sv.picks.at(-1)?.units ?? 0), 0);
      console.log(`  ${c.name} (${c.status}): ${units} units per service over ${c.pickupPoints.length} pickup point(s)`);
    }
  } finally {
    await handle.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
