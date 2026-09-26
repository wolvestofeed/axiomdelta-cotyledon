/**
 * Load a training document from a local file and, optionally, publish it.
 *
 *   pnpm muse:training -- --file "docs/muse/confidential/Docs/Training.pdf" \
 *     --title "Commissary Kitchen Operations & Culinary Foundations" [--publish] [--carry-completions]
 *
 * The in-app upload handles anything up to 4 MB; this exists for larger files
 * and for loading a document that lives outside the repo, which is where the
 * confidential folder sits. It writes the same rows the upload route writes.
 *
 * Publishing archives the version it replaces at the same instant and assigns
 * the new one to every active staff member. `--carry-completions` is the "not
 * everyone re-completes" case: people who completed the previous version are
 * not asked again.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
loadEnv({ path: join(repoRoot, '.env') });

const ACCEPTED: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const docKeyFrom = (title: string): string =>
  title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'training-document';

async function main(): Promise<void> {
  const filePath = arg('file');
  const title = arg('title');
  if (!filePath || !title) {
    console.error('Usage: pnpm muse:training -- --file <path> --title "<title>" [--doc-key <key>] [--summary "<text>"] [--publish] [--carry-completions]');
    process.exit(1);
  }

  const abs = resolve(repoRoot, filePath);
  const bytes = await readFile(abs);
  const name = basename(abs);
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const mime = ACCEPTED[ext];
  if (!mime) {
    console.error(`Unsupported file type ".${ext}". Accepted: ${Object.keys(ACCEPTED).join(', ')}.`);
    process.exit(1);
  }

  const docKey = arg('doc-key') ?? docKeyFrom(title);
  const summary = arg('summary') ?? null;
  const requiresRecompletion = !flag('carry-completions');
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');

    const prior = await client.query<{ version: number }>(
      'select coalesce(max(version), 0) as version from muse.training_docs where doc_key = $1',
      [docKey],
    );
    const version = Number(prior.rows[0]?.version ?? 0) + 1;

    const inserted = await client.query<{ id: string }>(
      `insert into muse.training_docs
         (doc_key, version, title, summary, requires_recompletion, file_name, file_mime, file_size, sha256, file_bytes, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning id`,
      [docKey, version, title, summary, requiresRecompletion, name, mime, bytes.byteLength, sha256, bytes, 'script:muse:training'],
    );
    const id = inserted.rows[0].id;
    console.log(`loaded ${name} (${(bytes.byteLength / 1048576).toFixed(2)} MB) as ${docKey} v${version}`);

    if (!flag('publish')) {
      await client.query('commit');
      console.log('held as a draft — publish it on /muse/training, or re-run with --publish');
      return;
    }

    const active = await client.query<{ id: string; version: number }>(
      'select id, version from muse.training_docs where doc_key = $1 and published_at is not null and archived_at is null',
      [docKey],
    );
    const replacing = active.rows[0] ?? null;

    // The same instant for both, so the record shows no gap and never two in force.
    const now = new Date();
    if (replacing) {
      await client.query('update muse.training_docs set archived_at = $1, superseded_by = $2, updated_at = $1 where id = $3', [now, id, replacing.id]);
    }
    await client.query('update muse.training_docs set published_at = $1, published_by = $2, updated_at = $1 where id = $3', [now, 'script:muse:training', id]);

    const staff = await client.query<{ id: string }>("select id from muse.staff where status = 'active'");
    let assignTo = staff.rows.map((r) => r.id);
    let reason = replacing
      ? 'Everyone re-completes: this revision was marked as one that must be read again.'
      : 'First version: assigned to every active staff member.';
    if (replacing && !requiresRecompletion) {
      const done = await client.query<{ staff_id: string }>(
        'select staff_id from muse.training_assignments where doc_id = $1 and completed_at is not null',
        [replacing.id],
      );
      const carried = new Set(done.rows.map((r) => r.staff_id));
      assignTo = assignTo.filter((sid) => !carried.has(sid));
      reason = `Carried forward: ${carried.size} who completed v${replacing.version} are not asked again; ${assignTo.length} still to read it.`;
    }

    for (const staffId of assignTo) {
      await client.query(
        'insert into muse.training_assignments (doc_id, staff_id) values ($1, $2) on conflict (doc_id, staff_id) do nothing',
        [id, staffId],
      );
    }

    await client.query('commit');
    console.log(`published v${version} at ${now.toISOString()}${replacing ? `, archiving v${replacing.version} at the same instant` : ''}`);
    console.log(`assigned to ${assignTo.length} of ${staff.rows.length} active staff. ${reason}`);
    if (staff.rows.length === 0) {
      console.log('NOTE: the staff register is empty, so nobody is assigned yet. Assignment follows the register — adding a person assigns it to them.');
    }
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
