import { describe, it, expect } from 'vitest';
import {
  createPostingService,
  DEFAULT_HOSPITALITY_COA,
  JournalError,
} from '../src/index.js';
import { MemoryStore } from './memoryStore.js';

function makeStore(): MemoryStore {
  return new MemoryStore(DEFAULT_HOSPITALITY_COA.slice());
}

function deterministicIdGen() {
  let n = 0;
  return () => {
    n += 1;
    // First 16 hex chars of the uuid feed `je_` — make those bytes
    // vary so each entry gets a unique id.
    return `${n.toString().padStart(16, '0')}-xxxx-xxxx-xxxx-xxxxxxxxxxxx`;
  };
}

describe('postEntry', () => {
  it('writes a balanced entry and returns it with an id', async () => {
    const store = makeStore();
    const svc = createPostingService(store, { idGenerator: deterministicIdGen() });
    const result = await svc.postEntry({
      date: '2026-03-15',
      description: 'Cash sale — Tuesday lunch',
      lines: [
        { accountCode: '1010', debitCents: 50_000, creditCents: 0 },
        { accountCode: '4010', debitCents: 0, creditCents: 50_000 },
      ],
    });
    expect(result.id).toMatch(/^je_/);
    expect(result.lines).toHaveLength(2);
    const persisted = await store.getEntry(result.id);
    expect(persisted?.description).toBe('Cash sale — Tuesday lunch');
  });

  it('rejects an unbalanced entry before any insert', async () => {
    const store = makeStore();
    const svc = createPostingService(store);
    await expect(
      svc.postEntry({
        date: '2026-03-15',
        description: 'bad',
        lines: [
          { accountCode: '1010', debitCents: 50_000, creditCents: 0 },
          { accountCode: '4010', debitCents: 0, creditCents: 49_000 },
        ],
      }),
    ).rejects.toThrow(JournalError);
    expect(store.entries.size).toBe(0);
  });

  it('rejects entries that reference an unknown account', async () => {
    const store = makeStore();
    const svc = createPostingService(store);
    await expect(
      svc.postEntry({
        date: '2026-03-15',
        description: 'bad code',
        lines: [
          { accountCode: '9999', debitCents: 100, creditCents: 0 },
          { accountCode: '4010', debitCents: 0, creditCents: 100 },
        ],
      }),
    ).rejects.toThrow(/UNKNOWN_ACCOUNT|9999/);
  });

  it('preserves importBatchId so the entry is flagged locked', async () => {
    const store = makeStore();
    const svc = createPostingService(store, { idGenerator: deterministicIdGen() });
    const r = await svc.postEntry({
      date: '2026-03-15',
      description: 'imported',
      importBatchId: 'batch_q1',
      lines: [
        { accountCode: '1010', debitCents: 100, creditCents: 0 },
        { accountCode: '4010', debitCents: 0, creditCents: 100 },
      ],
    });
    expect(r.importBatchId).toBe('batch_q1');
  });
});

describe('voidEntry', () => {
  it('writes a reversing entry with swapped debit/credit and a void: reference', async () => {
    const store = makeStore();
    const svc = createPostingService(store, { idGenerator: deterministicIdGen() });
    const original = await svc.postEntry({
      date: '2026-03-15',
      description: 'cash sale',
      lines: [
        { accountCode: '1010', debitCents: 10_000, creditCents: 0 },
        { accountCode: '4010', debitCents: 0, creditCents: 10_000 },
      ],
    });
    const voided = await svc.voidEntry(original.id, { date: '2026-04-01' });
    expect(voided.reference).toBe(`void:${original.id}`);
    expect(voided.lines[0]).toMatchObject({
      accountCode: '1010',
      debitCents: 0,
      creditCents: 10_000,
    });
    expect(voided.lines[1]).toMatchObject({
      accountCode: '4010',
      debitCents: 10_000,
      creditCents: 0,
    });
  });

  it('throws ENTRY_NOT_FOUND for an unknown id', async () => {
    const store = makeStore();
    const svc = createPostingService(store);
    await expect(svc.voidEntry('je_missing')).rejects.toThrow(/not found/);
  });
});

describe('updateEntry', () => {
  it('updates description on a manual entry without touching lines', async () => {
    const store = makeStore();
    const svc = createPostingService(store, { idGenerator: deterministicIdGen() });
    const e = await svc.postEntry({
      date: '2026-03-15',
      description: 'first pass',
      lines: [
        { accountCode: '1010', debitCents: 10_000, creditCents: 0 },
        { accountCode: '4010', debitCents: 0, creditCents: 10_000 },
      ],
    });
    const updated = await svc.updateEntry(e.id, { description: 'corrected' });
    expect(updated.description).toBe('corrected');
    expect(updated.lines).toHaveLength(2);
  });

  it('rejects updates to imported (locked) entries', async () => {
    const store = makeStore();
    const svc = createPostingService(store, { idGenerator: deterministicIdGen() });
    const e = await svc.postEntry({
      date: '2026-03-15',
      description: 'imported',
      importBatchId: 'b_1',
      lines: [
        { accountCode: '1010', debitCents: 100, creditCents: 0 },
        { accountCode: '4010', debitCents: 0, creditCents: 100 },
      ],
    });
    await expect(
      svc.updateEntry(e.id, { description: 'cannot' }),
    ).rejects.toThrow(/locked/);
  });

  it('rejects an update that breaks balance', async () => {
    const store = makeStore();
    const svc = createPostingService(store, { idGenerator: deterministicIdGen() });
    const e = await svc.postEntry({
      date: '2026-03-15',
      description: 'manual',
      lines: [
        { accountCode: '1010', debitCents: 10_000, creditCents: 0 },
        { accountCode: '4010', debitCents: 0, creditCents: 10_000 },
      ],
    });
    await expect(
      svc.updateEntry(e.id, {
        lines: [
          { accountCode: '1010', debitCents: 10_000, creditCents: 0 },
          { accountCode: '4010', debitCents: 0, creditCents: 9_999 },
        ],
      }),
    ).rejects.toThrow(/do not equal/);
  });
});

describe('closePeriod', () => {
  it('records a lock and blocks posts dated on or before it', async () => {
    const store = makeStore();
    const svc = createPostingService(store, { idGenerator: deterministicIdGen() });
    await svc.postEntry({
      date: '2026-03-15',
      description: 'pre-close',
      lines: [
        { accountCode: '1010', debitCents: 1_000, creditCents: 0 },
        { accountCode: '4010', debitCents: 0, creditCents: 1_000 },
      ],
    });
    const lock = await svc.closePeriod('2026-03-31', { lockedBy: 'cpa@firm' });
    expect(lock.periodEnd).toBe('2026-03-31');

    // Post-close, a March-dated entry is rejected.
    await expect(
      svc.postEntry({
        date: '2026-03-20',
        description: 'late entry',
        lines: [
          { accountCode: '1010', debitCents: 100, creditCents: 0 },
          { accountCode: '4010', debitCents: 0, creditCents: 100 },
        ],
      }),
    ).rejects.toThrow(/is closed/);

    // April is still open.
    const april = await svc.postEntry({
      date: '2026-04-01',
      description: 'next period',
      lines: [
        { accountCode: '1010', debitCents: 100, creditCents: 0 },
        { accountCode: '4010', debitCents: 0, creditCents: 100 },
      ],
    });
    expect(april.id).toMatch(/^je_/);
  });

  it('rejects malformed periodEnd', async () => {
    const store = makeStore();
    const svc = createPostingService(store);
    await expect(svc.closePeriod('not-a-date')).rejects.toThrow(/Invalid periodEnd/);
  });
});
