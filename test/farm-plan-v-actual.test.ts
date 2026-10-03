import { describe, it, expect } from 'vitest';
import { resolveScenarioInputs } from '@/engine/scenario';
import { standardSowingRecordPrefill, type DistributionDoc } from '@/engine/actuals';
import type { ProductionSowingLedger } from '@/engine/production-ledger';
import { emptySustainabilityBasis, mixFoodFootprint } from '@/engine/sustainability-basis';
import { fullInventory } from '@/engine/inventory';
import { emptyMeasures, pvaBreakdown, pvaMeasures, servedCostPerUnitCents, sumMeasures, type PvaSideInput } from '@/engine/plan-v-actual';

const R = resolveScenarioInputs({});
const growPlan = R.growPlans.find((r) => r.code === R.growPlan.code)!;
const channel = growPlan.channels[0];

function side(): PvaSideInput {
  const doc = { ...standardSowingRecordPrefill('2026-10-05', 1, 400, growPlan as never), id: 'B1', closedAt: '2026-10-05', actualLaborHours: 10, actualLaborRate: 20 };
  // The measures read the posting's amounts only.
  const led = { amounts: { materialIssuedToWip: 812.5, directLaborActual: 200, packagingCost: 180, unitsProduced: 400 } } as unknown as ProductionSowingLedger;
  const d = (id: string, date: string, units: number, subscriberId: string): DistributionDoc => ({ id, distributedOn: date, phase: channel, pickupPointId: null, pickupPointName: null, units, pricePerUnitCents: 1000, lotCodes: [], distributedBy: null, subscriberId, growPlanCode: growPlan.code, notes: null });
  const basis = { ...emptySustainabilityBasis('actual', '2026-10-01', '2026-10-31'), units: [{ growPlanCode: growPlan.code, channel, units: 300 }], totalUnits: 300, producedByGrowPlan: { [growPlan.code]: 400 } };
  const food = mixFoodFootprint({ basis, growPlans: R.growPlans, unitFactorByChannel: {} });
  return {
    period: '2026-10',
    sowings: [doc],
    sowingLedgers: [led],
    distributions: [d('D1', '2026-10-06', 200, 'C1'), d('D2', '2026-10-07', 100, 'C2')],
    receipts: [],
    orders: [
      { orderDate: '2026-10-06', subscriberId: 'C1', channel, growPlanCode: growPlan.code, units: 200 },
      { orderDate: '2026-10-07', subscriberId: 'C2', channel, growPlanCode: growPlan.code, units: 100 },
    ],
    firstOrderOn: new Map([['C1', '2026-09-01'], ['C2', '2026-10-07']]),
    statement: null,
    basis,
    food,
    inventory: fullInventory(R, '2026-10-31', { basis, energy: R.sustainability.energy, refrigerantService: {} }),
    energy: { ...R.sustainability.energy, electricityKwh: 1200 },
    waterGal: 5000,
    shrinkAllowance: 0.05,
    growPlans: R.growPlans,
  };
}

describe('farm Plan v Actual measures (Roadmap N7)', () => {
  const s = side();
  const m = pvaMeasures(s);

  it('counts units, revenue, orders, sowings and new subscribers in the month of the first order', () => {
    expect(m.units).toBe(300);
    expect(m.revenueCents).toBe(300_000);
    expect(m.orders).toBe(2);
    expect(m.sowings).toBe(1);
    expect(m.newSubscribers).toBe(1);
    expect(m.laborHours).toBe(10);
  });

  it('takes food and labor cost from the sowing posting, and served cost per unit over the units made', () => {
    const led = s.sowingLedgers[0];
    expect(m.inputCostCents).toBe(Math.round(led.amounts.materialIssuedToWip * 100));
    expect(m.laborCostCents).toBe(Math.round(led.amounts.directLaborActual * 100));
    expect(servedCostPerUnitCents(m)).toBeCloseTo((m.inputCostCents + m.laborCostCents + m.packagingCostCents) / 400, 9);
  });

  it('carries cost of goods sold by element from the income statement, zero with none', () => {
    expect([m.cogsMaterialsCents, m.cogsLaborCents, m.cogsOverheadCents]).toEqual([0, 0, 0]);
    const rows = [{ code: '5011', label: 'Materials', cents: 700 }, { code: '5012', label: 'Labor', cents: 300 }, { code: '5013', label: 'Overhead', cents: 90 }];
    const withStatement = pvaMeasures({ ...s, statement: { costOfGoodsSold: rows, sellingAndDistribution: [] } as never });
    expect([withStatement.cogsMaterialsCents, withStatement.cogsLaborCents, withStatement.cogsOverheadCents]).toEqual([700, 300, 90]);
    expect(sumMeasures([withStatement, withStatement]).cogsLaborCents).toBe(600);
  });

  it('carries the sustainability quantities', () => {
    expect(m.electricityKwh).toBe(1200);
    expect(m.waterGal).toBe(5000);
    // The seed lines carry a study proxy (Phase 5, step 3), so the units carry a reference footprint; no supplier is named on any line.
    expect(m.food.referenceKg).toBeGreaterThan(0);
    expect(m.food.onNamedSupplierKg).toBe(0);
  });

  it('a quarter sums flows', () => {
    const q = sumMeasures([m, emptyMeasures(), m]);
    expect(q.units).toBe(600);
  });

  it('breaks units, revenue, input cost and orders down by subscriber, input cost following the units', () => {
    const { rows } = pvaBreakdown(s, 'subscriber');
    expect(rows.map((r) => [r.key, r.units, r.orders])).toEqual([['C1', 200, 1], ['C2', 100, 1]]);
    const perUnit = s.sowingLedgers[0].amounts.materialIssuedToWip * 100 / 400;
    expect(rows[0].inputCostCents).toBe(Math.round(perUnit * 200));
  });
});
