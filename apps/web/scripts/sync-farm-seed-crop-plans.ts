/**
 * MicroFarm — sync the seed crop plans alone.
 *
 * Inserts any seed crop plan missing from the library and brings every crop plan still
 * `source = 'seed'` (header and lines) in line with the code seed, version bumped.
 * Nothing else is touched: no subscriber, subscription cycle or flat plan reset (that is
 * `pnpm farm:reseed`). User-built crop plans are untouched. Run it whenever a fact on
 * a seed crop plan line changes in code — a yield, a nutrition, a Food Traceability
 * List category — so the library, not the code, is what every page reads.
 *
 * Run:  pnpm farm:sync-crop-plans
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createDb } from '../../../packages/db/src/index.js';
import { scopedHandle } from './_workspace';
import { seedMissingCropPlans, syncSeedCropPlans, withSeedLock } from '../src/app/(farm)/farm/_lib/seed-writes';

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
    const added = await withSeedLock(db, 'cropPlans', (tx) => seedMissingCropPlans(tx));
    console.log(`crop plans added: ${added.length ? added.join(', ') : 'none (library already complete)'}`);
    const synced = await withSeedLock(db, 'cropPlans', (tx) => syncSeedCropPlans(tx));
    console.log(`seed crop plans synced (header + lines, version bumped): ${synced.length}${synced.length ? ` — ${synced.join(', ')}` : ''}`);
  } finally {
    await handle.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
