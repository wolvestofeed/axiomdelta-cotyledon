/**
 * Cotyledon — sync the home and commercial setup seed.
 *
 * Brings the workspace's seed equipment and fixed-cost lines in line with the code seed (the
 * home grow room and list, the commercial list Unset, the fixed costs at zero until stated),
 * removes the seed rows the code seed no longer carries, and removes the seeded build-out lines
 * and loans. Rows edited in the app are untouched.
 *
 * Run:  pnpm farm:sync-setup
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { scopedHandle } from './_workspace';
import { syncSetupSeed, withSeedLock } from '@/server/seed-writes';
import { equipmentSeed } from '@/data/capex';
import { seedFixedCostLines } from '@/data/finance';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
loadEnv({ path: join(REPO, '.env') });
loadEnv({ path: join(REPO, '.env.local') });

async function main(): Promise<void> {
  if (!process.env['DATABASE_URL']) throw new Error('DATABASE_URL is not set.');
  const handle = await scopedHandle();
  const db = handle.db as unknown as Parameters<typeof withSeedLock>[0];
  try {
    const r = await withSeedLock(db, 'equipment', (tx) => syncSetupSeed(tx, equipmentSeed, seedFixedCostLines()));
    console.log(`equipment: ${r.equipmentUpdated} seed row(s) synced, ${r.equipmentRemoved} retired row(s) removed`);
    console.log(`fixed costs: ${r.fixedUpdated} seed line(s) synced, ${r.fixedRemoved} retired line(s) removed`);
    console.log(`build-out lines removed: ${r.leaseholdRemoved}; loans removed: ${r.loansRemoved}`);
  } finally {
    await handle.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
