import { describe, it, expect } from 'vitest';
import { planOfRecordAtMonthEnd, type PlanOfRecordEntry } from '@/app/(farm)/farm/_engine/plan-of-record';
import { postingHash } from '@/app/(farm)/farm/_engine/periods';

const entry = (label: string, appliedAt: string): PlanOfRecordEntry => ({ scenarioId: label, label, appliedAt, config: { phases: { 1: { pricePerUnit: label.length } } } });
const current = { scenarioId: 'now', label: 'Now', config: {} };

describe('farm plan of record in force at a month end (Roadmap N7)', () => {
  const history = [entry('A', '2026-03-10T15:00:00.000Z'), entry('B', '2026-05-31T20:00:00.000Z'), entry('C', '2026-06-02T09:00:00.000Z')];

  it('a month before the first entry reads the plan of record set now, and says so', () => {
    expect(planOfRecordAtMonthEnd(history, '2026-02', current)).toMatchObject({ scenarioId: 'now', basis: 'current' });
  });
  it('a mid-month change is the plan for that month; the last change on or before the month end wins', () => {
    expect(planOfRecordAtMonthEnd(history, '2026-03', current)).toMatchObject({ label: 'A', basis: 'trail' });
    expect(planOfRecordAtMonthEnd(history, '2026-05', current)).toMatchObject({ label: 'B' });
    expect(planOfRecordAtMonthEnd(history, '2026-06', current)).toMatchObject({ label: 'C' });
    expect(planOfRecordAtMonthEnd(history, '2026-12', current)).toMatchObject({ label: 'C' });
  });
  it('dates a change on the farm clock: 23:30 in Austin on May 31 is May', () => {
    expect(planOfRecordAtMonthEnd([entry('Late', '2026-06-01T04:30:00.000Z')], '2026-05', current)).toMatchObject({ label: 'Late' });
  });
  it('carries the config as applied, not the forecast as saved later', () => {
    expect(planOfRecordAtMonthEnd(history, '2026-04', current).config).toEqual({ phases: { 1: { pricePerUnit: 1 } } });
  });

  it('carries the master records frozen with the entry, and none before snapshots existed', () => {
    const frozen = { ...entry('D', '2026-10-01T12:00:00.000Z'), snapshot: { definitions: { library: [{ code: 'X' }] }, cycles: [] } };
    expect(planOfRecordAtMonthEnd([...history, frozen], '2026-10', current).snapshot).toEqual(frozen.snapshot);
    expect(planOfRecordAtMonthEnd(history, '2026-06', current).snapshot).toBeNull();
    expect(planOfRecordAtMonthEnd(history, '2026-02', current).snapshot).toBeNull();
  });

  it('a snapshot hashes the same before storage and after a JSON round trip, so the trail still verifies', async () => {
    const raw = { label: 'P', config: { phases: { 1: { pricePerUnit: 10 } } }, snapshot: JSON.parse(JSON.stringify({ definitions: { a: undefined, b: [1, 2.5, null], c: new Date('2026-09-16T00:00:00Z') }, cycles: [] })) };
    const fields = { occurredAt: '2026-09-16T21:12:23.840Z', actorUserId: 'u', actorEmail: null, action: 'set_plan_of_record' as const, recordKind: 'scenario', recordId: 's', period: '2026-09', detail: raw };
    const reread = { ...fields, detail: JSON.parse(JSON.stringify(raw)) };
    expect(await postingHash('0', reread)).toBe(await postingHash('0', fields));
  });
});
