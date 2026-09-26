/**
 * Impact OS — the facility design scenario (facility-design roadmap, step Q4b).
 *
 * Sets the plan of record's hold life to 7 days: the current operational limit
 * under Food Code 3-502.12(D)(c) on the Phase 1 equipment as listed (Robert,
 * 2026-09-17). Nothing else changes. The potential rooms on the Design and
 * Build plan are documented on the Facility page and enter no scenario and no
 * ledger.
 *
 * Goes through the same mechanism as the OS: the plan of record's config is
 * saved on its scenario row and the change posts to the trail as
 * `set_plan_of_record` with the config as applied, so a past month compares
 * against the plan in force at its end. Where no plan of record is set, a
 * scenario is created and pointed to.
 *
 * Run:  DATABASE_URL=postgres://... pnpm muse:facility-scenario
 *       MUSE_ACTOR_USER_ID / MUSE_ACTOR_EMAIL name the actor on the trail
 *       (default: the script's own name).
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { desc, eq, sql } from 'drizzle-orm';
import { createDb, museScenarios, museWorkspaceState, musePostingLog } from '../../../packages/db/src/index.js';
import { GENESIS_HASH, postingHash } from '../src/app/(muse)/muse/_engine/periods';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
loadEnv({ path: join(REPO, '.env') });
loadEnv({ path: join(REPO, '.env.local') });

const WORKSPACE_ID = 'default';
const HOLD_LIFE_DAYS = 7;
const LABEL = 'Plan of record — Phase 1 baseline';
const NOTE = 'Facility design: hold life 7 days, the current operational limit under Food Code 3-502.12(D)(c) as adopted by 25 TAC §228.1 (Robert, 2026-09-17). Potential rooms are documented on the Facility Design and Build plan and are not in any scenario or ledger.';
const CHAIN_LOCK_KEY = 774_100_154;

type Config = Record<string, unknown> & { assumptions?: Record<string, unknown> & { inventory?: Record<string, unknown> } };

function withHoldLife(config: unknown): Config {
  const c = JSON.parse(JSON.stringify(config ?? {})) as Config;
  const assumptions = (c.assumptions ??= {});
  const inventory = (assumptions.inventory ??= {});
  inventory.chilledHoldLife = HOLD_LIFE_DAYS;
  return c;
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set.');
  const actorUserId = process.env['MUSE_ACTOR_USER_ID'] ?? 'script:muse-facility-scenario';
  const actorEmail = process.env['MUSE_ACTOR_EMAIL'] ?? null;
  const handle = createDb(url);
  const db = handle.db;
  try {
    await db.transaction(async (tx) => {
      const ws = await tx.select({ activeId: museWorkspaceState.activeScenarioId }).from(museWorkspaceState).where(eq(museWorkspaceState.id, WORKSPACE_ID)).limit(1);
      let scenarioId = ws[0]?.activeId ?? null;
      let label = LABEL;
      let config: Config;
      if (scenarioId) {
        const row = await tx.select({ label: museScenarios.label, config: museScenarios.config }).from(museScenarios).where(eq(museScenarios.id, scenarioId)).limit(1);
        if (!row[0]) throw new Error(`The workspace points at scenario ${scenarioId}, which does not exist.`);
        label = row[0].label;
        config = withHoldLife(row[0].config);
        await tx.update(museScenarios).set({ config, updatedAt: new Date() }).where(eq(museScenarios.id, scenarioId));
        console.log(`plan of record "${label}" (${scenarioId}): assumptions.inventory.chilledHoldLife = ${HOLD_LIFE_DAYS}`);
      } else {
        config = withHoldLife({});
        const inserted = await tx
          .insert(museScenarios)
          .values({ label, source: 'seed', config, ownerUserId: actorUserId, ownerTier: 'super_admin' })
          .returning({ id: museScenarios.id });
        scenarioId = inserted[0]!.id;
        console.log(`no plan of record was set; created "${label}" (${scenarioId}) with chilledHoldLife = ${HOLD_LIFE_DAYS}`);
      }
      const at = new Date();
      if (ws[0]) {
        await tx.update(museWorkspaceState).set({ activeScenarioId: scenarioId, appliedAt: at, appliedBy: actorUserId }).where(eq(museWorkspaceState.id, WORKSPACE_ID));
      } else {
        await tx.insert(museWorkspaceState).values({ id: WORKSPACE_ID, activeScenarioId: scenarioId, appliedAt: at, appliedBy: actorUserId });
      }
      // The trail entry, exactly as `appendPosting` writes it: serialised under the chain lock, hashed over its predecessor.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`);
      const last = await tx.select({ hash: musePostingLog.hash }).from(musePostingLog).orderBy(desc(musePostingLog.seq)).limit(1);
      const prevHash = last[0]?.hash ?? GENESIS_HASH;
      const fields = {
        occurredAt: at.toISOString(),
        actorUserId,
        actorEmail,
        action: 'set_plan_of_record' as const,
        recordKind: 'scenario',
        recordId: scenarioId,
        period: at.toISOString().slice(0, 7),
        detail: { label, appliedAt: at.toISOString(), config, note: NOTE },
      };
      const hash = await postingHash(prevHash, fields);
      const posted = await tx.insert(musePostingLog).values({ ...fields, occurredAt: at, prevHash, hash }).returning({ seq: musePostingLog.seq });
      console.log(`posted set_plan_of_record to the trail (seq ${posted[0]?.seq})`);
    });
  } finally {
    await handle.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
