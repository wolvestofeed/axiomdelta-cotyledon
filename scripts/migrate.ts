/**
 * Apply hand-written SQL migrations from drizzle/ in
 * lexicographic order. Idempotent — files are tracked in the
 * `_migrations` table and skipped on subsequent runs.
 *
 *   DATABASE_URL=postgres://... pnpm db:migrate
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config as loadEnv } from 'dotenv';

// Load DATABASE_URL from repo-root .env if present
loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, '..', 'drizzle');

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });

async function ensureBookkeeping(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename     text         PRIMARY KEY,
      applied_at   timestamptz  NOT NULL DEFAULT now()
    )
  `);
}

async function appliedSet(): Promise<Set<string>> {
  const r = await pool.query<{ filename: string }>(
    'SELECT filename FROM _migrations',
  );
  return new Set(r.rows.map((row) => row.filename));
}

async function apply(filename: string, sql: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
      [filename],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  await ensureBookkeeping();
  const applied = await appliedSet();

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const f of files) {
    if (applied.has(f)) {
      console.log(`  skip  ${f} (already applied)`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, f), 'utf8');
    console.log(`  apply ${f}`);
    await apply(f, sql);
    ran++;
  }

  console.log(`\nDone. ${ran} migration(s) applied, ${applied.size + ran} total.`);
  await pool.end();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
