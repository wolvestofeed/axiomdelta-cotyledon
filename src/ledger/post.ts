/**
 * Posting service. Validation runs in the pure helpers from
 * `./validate.ts`; commits run against a `LedgerStore` the caller
 * provides. The web app's `src/lib/ledger.ts` wires a Drizzle
 * implementation; tests use an in-memory implementation so the entire
 * posting → voiding → updating → closing flow runs without a DB.
 *
 * Lifted from AxiomDelta's `coach/financials.ts` posting service,
 * keeping the same sequencing (validate → batch-commit) but parameter-
 * izing the storage layer.
 */

import { randomUUID } from 'node:crypto';
import {
  JournalError,
  assertBalanced,
  assertKnownAccounts,
  assertLineShape,
  buildReversingLines,
  isEntryLocked,
} from '@/ledger/validate';
import type {
  Account,
  JournalEntry,
  JournalEntryPatch,
  NewJournalEntry,
  PeriodLock,
} from '@/ledger/types';

/**
 * Storage abstraction for the posting service. The web app implements
 * this against Drizzle inside a neon-http `db.batch(...)` so the
 * multi-statement inserts commit atomically.
 *
 * Method semantics:
 *   - `listAccounts()` returns the org's full CoA (no pagination).
 *   - `getEntry(id)` returns the full entry incl. lines, or null.
 *   - `insertEntry(entry)` writes the header + lines in one commit.
 *   - `replaceEntry(id, header, lines)` rewrites both header and
 *     lines for an existing entry (used by updateEntry when lines
 *     change).
 *   - `updateEntryHeader(id, header)` updates only the header fields
 *     (used by updateEntry when lines aren't touched).
 *   - `latestClosedPeriodEnd()` returns the most recent period-lock
 *     date or null. `closePeriod(date)` inserts a lock; idempotent.
 */
export interface LedgerStore {
  listAccounts(): Promise<Account[]>;
  getEntry(id: string): Promise<JournalEntry | null>;
  insertEntry(entry: JournalEntry): Promise<void>;
  replaceEntry(
    id: string,
    header: Omit<JournalEntry, 'lines'>,
    lines: JournalEntry['lines'],
  ): Promise<void>;
  updateEntryHeader(
    id: string,
    header: Omit<JournalEntry, 'lines'>,
  ): Promise<void>;
  latestClosedPeriodEnd(): Promise<string | null>;
  insertPeriodLock(lock: PeriodLock): Promise<PeriodLock>;
}

/** ID format mirrors AxiomDelta: `je_` prefix + 16 hex chars. */
function generateEntryId(rng: () => string = () => randomUUID()): string {
  return `je_${rng().replace(/-/g, '').slice(0, 16)}`;
}

async function validateDraft(
  store: LedgerStore,
  draft: NewJournalEntry,
): Promise<void> {
  assertLineShape(draft.lines);
  assertBalanced(draft.lines);
  const coa = await store.listAccounts();
  const known = new Set(coa.map((a) => a.code));
  assertKnownAccounts(draft.lines, known);
  const latestClose = await store.latestClosedPeriodEnd();
  if (latestClose && draft.date <= latestClose) {
    throw new JournalError(
      'PERIOD_CLOSED',
      `Period ending ${latestClose} is closed. Entries with date ${draft.date} must post in a later period.`,
    );
  }
}

export interface PostingService {
  postEntry(draft: NewJournalEntry): Promise<JournalEntry>;
  voidEntry(
    id: string,
    opts?: { date?: string; description?: string },
  ): Promise<JournalEntry>;
  updateEntry(id: string, patch: JournalEntryPatch): Promise<JournalEntry>;
  closePeriod(
    periodEnd: string,
    opts?: { lockedBy?: string; note?: string },
  ): Promise<PeriodLock>;
}

export interface CreatePostingServiceOptions {
  /** Inject a deterministic ID generator for tests. Defaults to crypto.randomUUID(). */
  idGenerator?: () => string;
  /** Inject a clock for tests. Defaults to `new Date().toISOString()`. */
  now?: () => string;
}

export function createPostingService(
  store: LedgerStore,
  opts: CreatePostingServiceOptions = {},
): PostingService {
  const newId = () => generateEntryId(opts.idGenerator);
  const isoNow = opts.now ?? (() => new Date().toISOString());

  return {
    async postEntry(draft) {
      await validateDraft(store, draft);
      const id = newId();
      const entry: JournalEntry = {
        id,
        date: draft.date,
        description: draft.description,
        lines: draft.lines.map((l) => ({ ...l })),
      };
      if (draft.reference) entry.reference = draft.reference;
      if (draft.importBatchId) entry.importBatchId = draft.importBatchId;
      await store.insertEntry(entry);
      return entry;
    },

    async voidEntry(id, voidOpts = {}) {
      const original = await store.getEntry(id);
      if (!original) {
        throw new JournalError('ENTRY_NOT_FOUND', `Entry ${id} not found.`);
      }
      const reversal: NewJournalEntry = {
        date: voidOpts.date ?? isoNow().slice(0, 10),
        description:
          voidOpts.description ??
          `Void of ${original.id} — ${original.description}`,
        reference: `void:${original.id}`,
        lines: buildReversingLines(original.lines),
      };
      return this.postEntry(reversal);
    },

    async updateEntry(id, patch) {
      const original = await store.getEntry(id);
      if (!original) {
        throw new JournalError('ENTRY_NOT_FOUND', `Entry ${id} not found.`);
      }
      if (isEntryLocked(original)) {
        throw new JournalError(
          'ENTRY_LOCKED',
          `Entry ${id} is locked (imported or voided). Correct via void + re-post.`,
        );
      }
      const nextLines = patch.lines ?? original.lines;
      const nextRef =
        patch.reference === null
          ? undefined
          : patch.reference ?? original.reference;
      const draft: NewJournalEntry = {
        date: patch.date ?? original.date,
        description: patch.description ?? original.description,
        lines: nextLines,
      };
      if (nextRef !== undefined) draft.reference = nextRef;
      await validateDraft(store, draft);

      const header: Omit<JournalEntry, 'lines'> = {
        id,
        date: draft.date,
        description: draft.description,
      };
      if (nextRef !== undefined) header.reference = nextRef;
      if (original.importBatchId) header.importBatchId = original.importBatchId;

      if (patch.lines) {
        await store.replaceEntry(id, header, draft.lines.map((l) => ({ ...l })));
      } else {
        await store.updateEntryHeader(id, header);
      }
      return { ...header, lines: draft.lines.map((l) => ({ ...l })) };
    },

    async closePeriod(periodEnd, closeOpts = {}) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
        throw new Error(
          `Invalid periodEnd "${periodEnd}" — expected YYYY-MM-DD.`,
        );
      }
      const lock: PeriodLock = {
        periodEnd,
        lockedAt: isoNow(),
      };
      if (closeOpts.lockedBy) lock.lockedBy = closeOpts.lockedBy;
      if (closeOpts.note) lock.note = closeOpts.note;
      return store.insertPeriodLock(lock);
    },
  };
}
