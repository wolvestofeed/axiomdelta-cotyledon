/**
 * In-memory `LedgerStore` for tests. Mirrors the Drizzle store the web
 * app wires up but holds entries / period-locks in plain Maps. No I/O,
 * no batching, no SQL — fast enough to exercise the entire posting +
 * voiding + updating flow inside vitest.
 */

import type {
  Account,
  JournalEntry,
  LedgerStore,
  PeriodLock,
} from '@/ledger';

export class MemoryStore implements LedgerStore {
  readonly entries = new Map<string, JournalEntry>();
  readonly locks: PeriodLock[] = [];

  constructor(private readonly accounts: Account[]) {}

  async listAccounts(): Promise<Account[]> {
    return this.accounts.slice();
  }

  async getEntry(id: string): Promise<JournalEntry | null> {
    const e = this.entries.get(id);
    return e ? structuredClone(e) : null;
  }

  async insertEntry(entry: JournalEntry): Promise<void> {
    this.entries.set(entry.id, structuredClone(entry));
  }

  async replaceEntry(
    id: string,
    header: Omit<JournalEntry, 'lines'>,
    lines: JournalEntry['lines'],
  ): Promise<void> {
    this.entries.set(id, structuredClone({ ...header, lines }));
  }

  async updateEntryHeader(
    id: string,
    header: Omit<JournalEntry, 'lines'>,
  ): Promise<void> {
    const cur = this.entries.get(id);
    if (!cur) return;
    this.entries.set(id, structuredClone({ ...header, lines: cur.lines }));
  }

  async latestClosedPeriodEnd(): Promise<string | null> {
    if (this.locks.length === 0) return null;
    return this.locks
      .map((l) => l.periodEnd)
      .sort()
      .pop() ?? null;
  }

  async insertPeriodLock(lock: PeriodLock): Promise<PeriodLock> {
    if (this.locks.some((l) => l.periodEnd === lock.periodEnd)) {
      return this.locks.find((l) => l.periodEnd === lock.periodEnd)!;
    }
    this.locks.push(structuredClone(lock));
    return lock;
  }

  /** Return entries sorted by date ascending — matches the canonical loader. */
  sortedEntries(): JournalEntry[] {
    return [...this.entries.values()].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
  }
}
