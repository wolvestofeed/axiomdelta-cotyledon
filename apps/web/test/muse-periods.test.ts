import { describe, it, expect } from 'vitest';
import {
  productionDaysIn,
  isProductionDay,
  closureOn,
  periodsOfYear,
  periodStatusOf,
  postingRefusal,
  postingHash,
  verifyPostingChain,
  stableStringify,
  GENESIS_HASH,
  type CalendarClosure,
  type FiscalPeriod,
  type PostingEntry,
  type PostingFields,
} from '../src/app/(muse)/muse/_engine/periods';
import { productionDateFor } from '../src/app/(muse)/muse/_engine/production-plan';

const winter: CalendarClosure = { id: 'c1', label: 'Christmas to New Year', kind: 'holiday', startDate: '2026-12-24', endDate: '2027-01-01', notes: null };
const thanksgiving: CalendarClosure = { id: 'c3', label: 'Thanksgiving', kind: 'holiday', startDate: '2026-11-26', endDate: '2026-11-27', notes: null };
const holiday: CalendarClosure = { id: 'c2', label: 'Labor Day', kind: 'holiday', startDate: '2026-09-07', endDate: '2026-09-07', notes: null };

describe('the production calendar (Roadmap J1)', () => {
  it('fiscal periods are the twelve calendar months of the year', () => {
    const p = periodsOfYear(2026);
    expect(p[0]).toBe('2026-01');
    expect(p[11]).toBe('2026-12');
    expect(p).toHaveLength(12);
  });

  it('a production day is a service weekday outside every closure', () => {
    expect(isProductionDay('2026-09-08', [holiday])).toBe(true); // Tuesday
    expect(isProductionDay('2026-09-07', [holiday])).toBe(false); // the holiday
    expect(isProductionDay('2026-09-12', [holiday])).toBe(false); // Saturday
    expect(closureOn('2026-12-28', [winter, holiday])?.label).toBe('Christmas to New Year');
    expect(closureOn('2026-09-01', [winter, holiday])).toBeNull();
  });

  it('counts a period\'s production days and the weekdays a closure removed', () => {
    const sep = productionDaysIn('2026-09', [holiday]);
    expect(sep.days.length + sep.closed.length).toBe(22); // September 2026 has 22 weekdays
    expect(sep.closed).toEqual(['2026-09-07']);
    const dec = productionDaysIn('2026-12', [winter]);
    expect(dec.days.length).toBe(17); // 23 weekdays less the six inside the closure
    expect(dec.closed).toEqual(['2026-12-24', '2026-12-25', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31']);
  });

  it('the production day before a delivery skips closures, back past a multi-day holiday', () => {
    expect(productionDateFor('2026-09-08', [1, 2, 3, 4, 5], [holiday])).toBe('2026-09-04'); // Monday holiday → Friday
    expect(productionDateFor('2026-11-30', [1, 2, 3, 4, 5], [thanksgiving])).toBe('2026-11-25'); // Monday after Thanksgiving → Wednesday
    expect(productionDateFor('2027-01-04', [1, 2, 3, 4, 5], [winter])).toBe('2026-12-23'); // first day back → last day before the closure
    expect(productionDateFor('2026-09-08', [1, 2, 3, 4, 5])).toBe('2026-09-07'); // no calendar: the plain weekday rule
  });
});

describe('the period lock (Roadmap J3)', () => {
  const periods: FiscalPeriod[] = [
    { period: '2026-08', status: 'locked', lockedAt: '2026-09-05T10:00:00.000Z', lockedBy: 'cpa@example.com', reopenedAt: null, reopenedBy: null, notes: null },
    { period: '2026-07', status: 'open', lockedAt: '2026-08-01T10:00:00.000Z', lockedBy: 'cpa@example.com', reopenedAt: '2026-08-03T10:00:00.000Z', reopenedBy: 'owner@example.com', notes: null },
  ];
  it('a period with no row is open; a reopened period is open; a locked one refuses postings by date', () => {
    expect(periodStatusOf('2026-09', periods)).toBe('open');
    expect(periodStatusOf('2026-07', periods)).toBe('open');
    expect(periodStatusOf('2026-08', periods)).toBe('locked');
    expect(postingRefusal('2026-09-14', periods)).toBeNull();
    expect(postingRefusal('2026-07-20', periods)).toBeNull();
    expect(postingRefusal('2026-08-31', periods)).toContain('Period 2026-08 is locked by cpa@example.com on 2026-09-05');
  });
});

describe('the posting trail (Roadmap J4)', () => {
  const fields = (n: number, action: PostingFields['action'] = 'record_batch'): PostingFields => ({
    occurredAt: `2026-09-14T12:00:0${n}.000Z`,
    actorUserId: 'user_1',
    actorEmail: 'ops@example.com',
    action,
    recordKind: 'batch',
    recordId: `rec-${n}`,
    period: '2026-09',
    detail: { batchId: `B-260914-0${n}`, z: 1, a: [3, { y: 2, x: 1 }] },
  });
  async function chain(n: number): Promise<PostingEntry[]> {
    const out: PostingEntry[] = [];
    let prev = GENESIS_HASH;
    for (let i = 1; i <= n; i++) {
      const f = fields(i);
      const hash = await postingHash(prev, f);
      out.push({ ...f, seq: i, prevHash: prev, hash });
      prev = hash;
    }
    return out;
  }

  it('canonical JSON sorts keys at every level, so field order never changes the hash', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [1, { f: 1, e: 2 }] } })).toBe('{"a":{"c":[1,{"e":2,"f":1}],"d":2},"b":1}');
  });

  it('a hash is 64 hex characters and depends on the previous hash', async () => {
    const h1 = await postingHash(GENESIS_HASH, fields(1));
    const h2 = await postingHash('f'.repeat(64), fields(1));
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toBe(h2);
    expect(await postingHash(GENESIS_HASH, fields(1))).toBe(h1);
  });

  it('an intact chain verifies; an empty chain verifies', async () => {
    expect(await verifyPostingChain(await chain(4))).toEqual({ ok: true, length: 4, brokenAt: null });
    expect(await verifyPostingChain([])).toEqual({ ok: true, length: 0, brokenAt: null });
  });

  it('an edited entry breaks the chain at that entry', async () => {
    const c = await chain(4);
    c[2] = { ...c[2]!, detail: { ...c[2]!.detail, batchId: 'B-TAMPERED' } };
    expect(await verifyPostingChain(c)).toEqual({ ok: false, length: 4, brokenAt: 3 });
  });

  it('a removed entry breaks the chain at the next entry', async () => {
    const c = await chain(4);
    const gap = [c[0]!, c[1]!, c[3]!];
    expect(await verifyPostingChain(gap)).toEqual({ ok: false, length: 3, brokenAt: 4 });
  });

  it('verification is independent of the order entries arrive in', async () => {
    const c = await chain(3);
    expect((await verifyPostingChain([c[2]!, c[0]!, c[1]!])).ok).toBe(true);
  });
});
