/**
 * Impact OS — sync the seed recipes alone.
 *
 * Inserts any seed recipe missing from the library and brings every recipe still
 * `source = 'seed'` (header and lines) in line with the code seed, version bumped.
 * Nothing else is touched: no customer, menu cycle or meal plan reset (that is
 * `pnpm muse:reseed`). User-built recipes are untouched. Run it whenever a fact on
 * a seed recipe line changes in code — a yield, a crediting, a Food Traceability
 * List category — so the library, not the code, is what every page reads.
 *
 * Run:  pnpm muse:sync-recipes
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createDb } from '../../../packages/db/src/index.js';
import { seedMissingRecipes, syncSeedRecipes, withSeedLock } from '../src/app/(muse)/muse/_lib/seed-writes';

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
    const added = await withSeedLock(db, 'recipes', (tx) => seedMissingRecipes(tx));
    console.log(`recipes added: ${added.length ? added.join(', ') : 'none (library already complete)'}`);
    const synced = await withSeedLock(db, 'recipes', (tx) => syncSeedRecipes(tx));
    console.log(`seed recipes synced (header + lines, version bumped): ${synced.length}${synced.length ? ` — ${synced.join(', ')}` : ''}`);
  } finally {
    await handle.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
