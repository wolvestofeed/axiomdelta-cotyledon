/**
 * Rob's own trays (Phase 3, S2): an own-use subscriber's orders flow through production like any
 * other, priced at nothing since they are not sold; a distribution to it leaves finished goods at
 * cost to Owner Draws (3200), with no revenue, receivable, distribution expense or invoice.
 */
import { describe, it, expect } from 'vitest';
import { phases } from '@/data/plan-data';
import { ownUseSubscriber } from '@/data/subscribers';
import { ACC_FINISHED_GOODS, ACC_OWNER_DRAWS, ACC_COGS_MATERIALS, ACC_COGS_LABOR, ACC_COGS_OVERHEAD } from '@/data/coa-farm';
import { resolveScenarioInputs } from '@/engine/scenario';
import { deriveCapacity } from '@/engine';
import { orderBook } from '@/engine/orders';
import { recordPickupPoints } from '@/engine/demand';
import { standardSowingRecordPrefill, type DistributionDoc, type SowingRecordDoc } from '@/engine/actuals';
import { postActuals } from '@/engine/actuals-ledger';
import { routeCompletion } from '@/engine/working-capital';

const R = resolveScenarioInputs();
const own = ownUseSubscriber();
const growPlan = R.growPlan;
const trays = deriveCapacity(growPlan, R.capacityInputs).sowingSize;
const sowing: SowingRecordDoc = { ...standardSowingRecordPrefill('2026-10-05', 1, trays, growPlan), id: 'S1', closedAt: null };
const distribution = (id: string, subscriberId: string, units: number): DistributionDoc => ({
  id, distributedOn: '2026-10-17', phase: 1, pickupPointId: null, pickupPointName: 'Saturday pickup at the house', units, pricePerUnitCents: 0, lotCodes: [], distributedBy: 'Rob', notes: null, growPlanCode: growPlan.code, subscriberId,
});
const net = (entries: { lines: { accountCode: string; debitCents: number; creditCents: number }[] }[], code: string) =>
  entries.flatMap((e) => e.lines).filter((l) => l.accountCode === code).reduce((s, l) => s + l.debitCents - l.creditCents, 0);

describe('own use', () => {
  it('is in the seed as a real subscriber, on Actual, whose orders are priced at nothing', () => {
    expect(R.subscribers.find((c) => c.ownUse)?.id).toBe(own.id);
    const book = orderBook({ pickupPoints: recordPickupPoints(R.subscribers), subscribers: R.subscribers, orders: [], from: '2026-10-01', to: '2026-10-31', channelPriceCents: { 1: 3000, 2: 3000, 3: 3000 } });
    expect(book.length).toBeGreaterThan(0);
    expect(book.every((o) => o.subscriberId === own.id && o.pricePerUnitCents === 0 && o.priceBasis === 'own-use')).toBe(true);
  });

  it('leaves finished goods at cost to Owner Draws, with no revenue, receivable, cost of goods sold or distribution expense', () => {
    const posted = postActuals({ sowings: [sowing], receipts: [], distributions: [distribution('d1', own.id, 3)], bills: [] }, R);
    expect(posted.balanced).toBe(true);
    const dlv = posted.entries.find((e) => e.id.startsWith('DLV-'))!;
    const draws = net([dlv], ACC_OWNER_DRAWS);
    expect(draws).toBeGreaterThan(0);
    expect(net([dlv], ACC_FINISHED_GOODS)).toBe(-draws);
    for (const code of ['4010', '1300', '7900', ACC_COGS_MATERIALS, ACC_COGS_LABOR, ACC_COGS_OVERHEAD]) expect(net([dlv], code), code).toBe(0);
    // Three trays at the sowing's cost per tray.
    const el = posted.periods[0]!.sowings[0]!.amounts.finishedGoodsByElementCents;
    expect(draws).toBeCloseTo(((el.materials + el.labor + el.overhead) * 3) / trays, -1);
  });

  it('a sold tray beside it still books revenue and cost of goods sold', () => {
    const posted = postActuals({ sowings: [sowing], receipts: [], distributions: [distribution('d1', own.id, 1), { ...distribution('d2', 'someone-else', 2), pricePerUnitCents: phases[0].pricePerUnit * 100 }], bills: [] }, R);
    expect(net(posted.entries, '4010')).toBe(-2 * phases[0].pricePerUnit * 100);
    expect(net(posted.entries, ACC_COGS_MATERIALS)).toBeGreaterThan(0);
    expect(net(posted.entries, ACC_OWNER_DRAWS)).toBeGreaterThan(0);
  });

  it('is never invoiced', () => {
    const r = routeCompletion([{ ...distribution('d1', own.id, 1), pricePerUnitCents: 0 }, { ...distribution('d2', 'someone-else', 2), pricePerUnitCents: 3000 }], '2026-10-17', null, new Set([own.id]));
    expect(r.groups.map((g) => g.subscriberId)).toEqual(['someone-else']);
  });
});
