import 'server-only';
import { desc, sql } from 'drizzle-orm';
import { farmPostingLog, type DbHandle } from '@mf/db';
import { GENESIS_HASH, postingHash, type PostingAction } from '../_engine/periods';

/**
 * MicroFarm — appending to the posting trail (Roadmap J4).
 *
 * Called inside the same transaction as the record it describes, so a record
 * and its trail entry commit together or not at all. An advisory transaction
 * lock serialises appends, so `prevHash` is always the hash of the row that
 * really precedes this one. Nothing here updates or deletes: the table's
 * trigger refuses both.
 */

export type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

export interface PostingInput {
  actorUserId: string;
  actorEmail: string | null;
  action: PostingAction;
  recordKind: string;
  recordId: string;
  period: string;
  detail?: Record<string, unknown>;
}

const CHAIN_LOCK_KEY = 774_100_154;

export async function appendPosting(tx: Tx, input: PostingInput): Promise<{ seq: number; hash: string }> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`);
  const last = await tx.select({ hash: farmPostingLog.hash }).from(farmPostingLog).orderBy(desc(farmPostingLog.seq)).limit(1);
  const prevHash = last[0]?.hash ?? GENESIS_HASH;
  const occurred = new Date();
  const fields = {
    occurredAt: occurred.toISOString(),
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    action: input.action,
    recordKind: input.recordKind,
    recordId: input.recordId,
    period: input.period,
    detail: input.detail ?? {},
  };
  const hash = await postingHash(prevHash, fields);
  const rows = await tx
    .insert(farmPostingLog)
    .values({ ...fields, occurredAt: occurred, prevHash, hash })
    .returning({ seq: farmPostingLog.seq });
  const seq = rows[0]?.seq;
  if (seq === undefined) throw new Error('The posting trail did not accept the entry.');
  return { seq, hash };
}
