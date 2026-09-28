/**
 * MicroFarm — reset the placeholder seed.
 *
 * Deletes every `source = 'seed'` subscriber (pickup points and orders on them cascade)
 * and subscription cycle, inserts any seed grow plan missing from the library, brings
 * grow plans still `source = 'seed'` (header and lines) in line with the code seed, then
 * re-inserts the Plan seed subscribers (nineteen Forecast Subscribers, each on a weekly
 * subscription of one 1020 flat at the Saturday pickup), the saved cycles, and a flat plan for
 * every subscriber without one (Roadmap N4a). User-built rows are untouched.
 *
 * Run:  DATABASE_URL=postgres://... pnpm farm:reseed
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createDb } from '@/db';
import { scopedHandle } from './_workspace';
import { listGrowPlansWith } from '@/server/grow-plan-rows';
import {
  deleteSeedRows,
  seedMissingGrowPlans,
  syncSeedGrowPlans,
  insertSubscribers,
  insertSubscriptionCycles,
  dbSeedSubscribers,
  dbSeedSubscriptionCycles,
  insertMissingFlatPlans,
  withSeedLock,
} from '@/server/seed-writes';

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
    const today = new Date().toISOString().slice(0, 10);
    const removed = await withSeedLock(db, 'subscribers', (tx) => deleteSeedRows(tx));
    console.log(`removed ${removed.subscribers} seed subscriber(s), ${removed.cycles} seed subscription cycle(s)`);
    const added = await withSeedLock(db, 'growPlans', (tx) => seedMissingGrowPlans(tx));
    console.log(`grow plans added: ${added.length ? added.join(', ') : 'none (library already complete)'}`);
    const synced = await withSeedLock(db, 'growPlans', (tx) => syncSeedGrowPlans(tx));
    console.log(`seed grow plans synced (header + lines, version bumped): ${synced.length}`);
    const library = await listGrowPlansWith(db);
    const subscribers = await withSeedLock(db, 'subscribers', (tx) => insertSubscribers(tx, dbSeedSubscribers()));
    const cycles = await withSeedLock(db, 'cycles', (tx) => insertSubscriptionCycles(tx, dbSeedSubscriptionCycles(library, today)));
    const plans = await withSeedLock(db, 'cycles', (tx) => insertMissingFlatPlans(tx));
    console.log(`seeded ${subscribers} subscriber(s), ${cycles} subscription cycle(s), ${plans} flat plan(s); library has ${library.length} grow plan(s)`);
    for (const c of dbSeedSubscribers()) {
      const subs = (c.subscriptions ?? []).map((x) => `${x.cadence} from ${x.startDate}: ${x.flatPlan.at(-1)?.lines.map((l) => `${l.units} × ${l.growPlanCode}`).join(', ')}`);
      console.log(`  ${c.name} (${c.status}): ${subs.join('; ') || 'no subscription'}`);
    }
  } finally {
    await handle.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
