/**
 * MicroFarm — the facility design scenario (facility-design roadmap, step Q4b).
 *
 * Sets the plan of record's shelf life to 7 days: the current operational limit
 * under Food Code 3-502.12(D)(c) on the Phase 1 equipment as listed. Nothing else changes. The potential rooms on the Design and
 * Build plan are documented on the Facility page and enter no scenario and no
 * ledger.
 *
 * Goes through the same mechanism as the OS: the plan of record's config is
 * saved on its scenario row and the change posts to the trail as
 * `set_plan_of_record` with the config as applied, so a past month compares
 * against the plan in force at its end. Where no plan of record is set, a
 * scenario is created and pointed to.
 *
 * Run:  DATABASE_URL=postgres://... pnpm farm:facility-scenario
 *       FARM_ACTOR_USER_ID / FARM_ACTOR_EMAIL name the actor on the trail
 *       (default: the script's own name).
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { desc, eq, sql } from 'drizzle-orm';
import { createDb, farmScenarios, farmWorkspaceState, farmPostingLog } from '../../../packages/db/src/index.js';
import { scopedHandle } from './_workspace';
import { GENESIS_HASH, postingHash } from '../src/app/(farm)/farm/_engine/periods';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
loadEnv({ path: join(REPO, '.env') });
loadEnv({ path: join(REPO, '.env.local') });

const WORKSPACE_ID = 'default';
const SHELF_LIFE_DAYS = 7;
const LABEL = 'Plan of record — Phase 1 baseline';
const NOTE = 'Facility design: shelf life 7 days, the current operational limit under Food Code 3-502.12(D)(c) as adopted by 25 TAC §228.1. Potential rooms are documented on the Facility Design and Build plan and are not in any scenario or ledger.';
const CHAIN_LOCK_KEY = 774_100_154;

type Config = Record<string, unknown> & { assumptions?: Record<string, unknown> & { inventory?: Record<string, unknown> } };

function withShelfLife(config: unknown): Config {
  const c = JSON.parse(JSON.stringify(config ?? {})) as Config;
  const assumptions = (c.assumptions ??= {});
  const inventory = (assumptions.inventory ??= {});
  inventory.blackoutShelfLife = SHELF_LIFE_DAYS;
  return c;
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set.');
  const actorUserId = process.env['FARM_ACTOR_USER_ID'] ?? 'script:farm-facility-scenario';
  const actorEmail = process.env['FARM_ACTOR_EMAIL'] ?? null;
  const handle = await scopedHandle();
  const db = handle.db;
  try {
    await db.transaction(async (tx) => {
      const ws = await tx.select({ activeId: farmWorkspaceState.activeScenarioId }).from(farmWorkspaceState).where(eq(farmWorkspaceState.id, WORKSPACE_ID)).limit(1);
      let scenarioId = ws[0]?.activeId ?? null;
      let label = LABEL;
      let config: Config;
      if (scenarioId) {
        const row = await tx.select({ label: farmScenarios.label, config: farmScenarios.config }).from(farmScenarios).where(eq(farmScenarios.id, scenarioId)).limit(1);
        if (!row[0]) throw new Error(`The workspace points at scenario ${scenarioId}, which does not exist.`);
        label = row[0].label;
        config = withShelfLife(row[0].config);
        await tx.update(farmScenarios).set({ config, updatedAt: new Date() }).where(eq(farmScenarios.id, scenarioId));
        console.log(`plan of record "${label}" (${scenarioId}): assumptions.inventory.blackoutShelfLife = ${SHELF_LIFE_DAYS}`);
      } else {
        config = withShelfLife({});
        const inserted = await tx
          .insert(farmScenarios)
          .values({ label, source: 'seed', config, ownerUserId: actorUserId, ownerTier: 'super_admin' })
          .returning({ id: farmScenarios.id });
        scenarioId = inserted[0]!.id;
        console.log(`no plan of record was set; created "${label}" (${scenarioId}) with blackoutShelfLife = ${SHELF_LIFE_DAYS}`);
      }
      const at = new Date();
      if (ws[0]) {
        await tx.update(farmWorkspaceState).set({ activeScenarioId: scenarioId, appliedAt: at, appliedBy: actorUserId }).where(eq(farmWorkspaceState.id, WORKSPACE_ID));
      } else {
        await tx.insert(farmWorkspaceState).values({ id: WORKSPACE_ID, activeScenarioId: scenarioId, appliedAt: at, appliedBy: actorUserId });
      }
      // The trail entry, exactly as `appendPosting` writes it: serialised under the chain lock, hashed over its predecessor.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`);
      const last = await tx.select({ hash: farmPostingLog.hash }).from(farmPostingLog).orderBy(desc(farmPostingLog.seq)).limit(1);
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
      const posted = await tx.insert(farmPostingLog).values({ ...fields, occurredAt: at, prevHash, hash }).returning({ seq: farmPostingLog.seq });
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
