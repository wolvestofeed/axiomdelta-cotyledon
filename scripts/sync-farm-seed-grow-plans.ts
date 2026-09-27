/**
 * MicroFarm — sync the seed grow plans alone.
 *
 * Inserts any seed grow plan missing from the library and brings every grow plan still
 * `source = 'seed'` (header and lines) in line with the code seed, version bumped.
 * Nothing else is touched: no subscriber, subscription cycle or flat plan reset (that is
 * `pnpm farm:reseed`). User-built grow plans are untouched. Run it whenever a fact on
 * a seed grow plan line changes in code — a yield, a nutrition, a Food Traceability
 * List category — so the library, not the code, is what every page reads.
 *
 * Run:  pnpm farm:sync-grow-plans
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createDb } from '@/db';
import { scopedHandle } from './_workspace';
import { seedMissingGrowPlans, syncSeedGrowPlans, withSeedLock } from '@/server/seed-writes';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
loadEnv({ path: join(REPO, '.env') });
loadEnv({ path: join(REPO, '.env.local') });

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set.');
  const handle = await scopedHandle();
  const db = handle.db as unknown as Parameters<typeof withSeedLock>[0];
  try {
    const added = await withSeedLock(db, 'growPlans', (tx) => seedMissingGrowPlans(tx));
    console.log(`grow plans added: ${added.length ? added.join(', ') : 'none (library already complete)'}`);
    const synced = await withSeedLock(db, 'growPlans', (tx) => syncSeedGrowPlans(tx));
    console.log(`seed grow plans synced (header + lines, version bumped): ${synced.length}${synced.length ? ` — ${synced.join(', ')}` : ''}`);
  } finally {
    await handle.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
