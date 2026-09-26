/**
 * Impact OS — reset the placeholder seed.
 *
 * Deletes every `source = 'seed'` customer (sites and orders on them cascade)
 * and menu cycle, inserts any seed recipe missing from the library, brings
 * recipes still `source = 'seed'` (header and lines) in line with the code seed, then
 * re-inserts the Plan seed customers (the contracted school at its stated 125
 * meals per service, prospects at zero), the saved student and adult menus, and
 * a meal plan for every customer without one (Roadmap N4a). User-built rows are
 * untouched.
 *
 * Run:  DATABASE_URL=postgres://... pnpm muse:reseed
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createDb } from '../../../packages/db/src/index.js';
import { listRecipesWith } from '../src/app/(muse)/muse/_lib/recipe-rows';
import {
  deleteSeedRows,
  seedMissingRecipes,
  syncSeedRecipes,
  insertCustomers,
  insertMenuCycles,
  dbSeedCustomers,
  dbSeedMenuCycles,
  insertMissingMealPlans,
  withSeedLock,
} from '../src/app/(muse)/muse/_lib/seed-writes';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
loadEnv({ path: join(REPO, '.env') });
loadEnv({ path: join(REPO, '.env.local') });

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set.');
  const handle = createDb(url);
  const db = handle.db as unknown as Parameters<typeof withSeedLock>[0];
  try {
    const today = new Date().toISOString().slice(0, 10);
    const removed = await withSeedLock(db, 'customers', (tx) => deleteSeedRows(tx));
    console.log(`removed ${removed.customers} seed customer(s), ${removed.cycles} seed menu cycle(s)`);
    const added = await withSeedLock(db, 'recipes', (tx) => seedMissingRecipes(tx));
    console.log(`recipes added: ${added.length ? added.join(', ') : 'none (library already complete)'}`);
    const synced = await withSeedLock(db, 'recipes', (tx) => syncSeedRecipes(tx));
    console.log(`seed recipes synced (header + lines, version bumped): ${synced.length}`);
    const library = await listRecipesWith(db);
    const customers = await withSeedLock(db, 'customers', (tx) => insertCustomers(tx, dbSeedCustomers()));
    const cycles = await withSeedLock(db, 'cycles', (tx) => insertMenuCycles(tx, dbSeedMenuCycles(library, today)));
    const plans = await withSeedLock(db, 'cycles', (tx) => insertMissingMealPlans(tx));
    console.log(`seeded ${customers} customer(s), ${cycles} menu cycle(s), ${plans} meal plan(s); library has ${library.length} recipe(s)`);
    for (const c of dbSeedCustomers()) {
      const meals = c.sites.flatMap((x) => x.services).reduce((s, sv) => s + (sv.picks.at(-1)?.meals ?? 0), 0);
      console.log(`  ${c.name} (${c.status}): ${meals} meals per service over ${c.sites.length} site(s)`);
    }
  } finally {
    await handle.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
