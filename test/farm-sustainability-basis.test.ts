import { describe, it, expect } from 'vitest';
import { resolveScenarioInputs } from '@/engine/scenario';
import { standardSowingRecordPrefill, type ActualsBundle, type DistributionDoc } from '@/engine/actuals';
import { expiredMassKg, mixFoodFootprint, receivedMassKg, sustainabilityBasis } from '@/engine/sustainability-basis';
import { energyFromReadings, serviceFromRecords, waterFromReadings, type ReadingDoc } from '@/engine/sustainability-records';
import { cropPlanFoodFootprint } from '@/engine/carbon';

const R = resolveScenarioInputs({});
const cropPlan = R.cropPlans.find((r) => r.code === R.cropPlan.code)!;
const channel = cropPlan.channels[0];
const pf = Object.fromEntries(R.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>;

const sowing = (date: string, units: number) => ({ ...standardSowingRecordPrefill(date, 1, units, cropPlan as never), id: `B-${date}`, closedAt: date });
const distribution = (date: string, units: number, over: Partial<DistributionDoc> = {}): DistributionDoc => ({ id: `D-${date}-${units}`, distributedOn: date, phase: channel, pickupPointId: 'pickup-point-01', pickupPointName: 'Test Pickup point 1', units, pricePerUnitCents: 1000, lotCodes: [], distributedBy: null, cropPlanCode: cropPlan.code, notes: null, ...over });

describe('farm sustainability basis (Roadmap N6 slice 4)', () => {
  const bundle: Pick<ActualsBundle, 'sowings' | 'receipts' | 'distributions'> = {
    sowings: [sowing('2025-12-30', 100), sowing('2026-03-02', 500), sowing('2026-06-01', 300)],
    receipts: [
      { id: 'R1', poId: null, supplierId: null, supplierName: null, receivedOn: '2026-03-01', invoiceNumber: null, invoiceTotalCents: 0, receivedBy: null, notes: null, lines: [
        { input: 'Pinto beans, dry', qty: 50, unit: 'lb', lotCode: 'L1', unitPriceCents: 100 },
        { input: 'Pinto beans, dry', qty: 20, unit: 'lb', lotCode: 'L2', unitPriceCents: 100, condition: 'rejected' },
      ] },
    ],
    distributions: [distribution('2025-12-31', 100), distribution('2026-03-03', 400), distribution('2026-03-04', 100, { cropPlanCode: null, pickupPointId: 'pickup-point-02', pickupPointName: 'Test Pickup point 2' })],
  };
  const basis = sustainabilityBasis({ kind: 'actual', bundle, from: '2026-01-01', to: '2026-12-31', shelfLifeDays: 30, cropPlans: R.cropPlans, unitFactorByChannel: pf });

  it('counts only the window: units by crop plan and channel, days, production and receipts', () => {
    expect(basis.totalUnits).toBe(500);
    expect(basis.distributionDays).toBe(2);
    expect(basis.productionDays).toBe(2);
    expect(basis.producedByCropPlan[cropPlan.code]).toBe(800);
    expect(basis.unitsWithNoCropPlan).toBe(100);
    expect(basis.units.find((m) => m.cropPlanCode === cropPlan.code)!.units).toBe(400);
    expect(basis.byPickupPoint.map((s) => [s.pickupPointId, s.units, s.distributionDays])).toEqual([['pickup-point-01', 400, 1], ['pickup-point-02', 100, 1]]);
    expect(basis.received).toEqual([{ input: 'Pinto beans, dry', unit: 'lb', qty: 50 }]);
    expect(receivedMassKg(basis)[0].massKg).toBeCloseTo(50 * 0.45359237, 9);
  });

  it('names units that passed shelf life unshipped inside the window', () => {
    // 500 made 03-02, 400 shipped 03-03 → 100 expire 04-01; 300 made 06-01 expire 07-01. Nothing after.
    expect(basis.expiredByCropPlan[cropPlan.code]).toBeCloseTo(400, 9);
    expect(expiredMassKg(basis, R.cropPlans).units).toBeCloseTo(400, 9);
  });

  it('costs food crop plan by crop plan and names units with no crop plan', () => {
    const food = mixFoodFootprint({ basis, cropPlans: R.cropPlans, unitFactorByChannel: pf });
    const perUnit = cropPlanFoodFootprint(cropPlan as never).totalKgCo2ePerUnit;
    expect(food.referenceKg).toBeCloseTo(perUnit * 400, 6);
    expect(food.selectedKg).toBeCloseTo(food.referenceKg, 9);
    expect(food.unitsNotCosted).toBe(100);
  });
});

describe('farm sustainability records fold over the calendar year', () => {
  const r = (metric: ReadingDoc['metric'], readOn: string, quantity: number | null): ReadingDoc => ({ id: `${metric}-${readOn}`, metric, periodStart: null, readOn, quantity, sourceId: null, notes: null, recordedBy: null });
  const readings = [
    r('electricity_kwh', '2025-12-31', 999),
    r('electricity_kwh', '2026-01-31', 1000),
    r('electricity_kwh', '2026-02-28', 3000),
    r('electricity_renewable_kwh', '2026-02-28', 1000),
    r('natural_gas_therms', '2026-02-28', 40),
    r('water_metered_gal', '2026-01-31', 10_000),
    r('water_metered_gal', '2026-02-28', 20_000),
    r('bod_mg_l', '2026-01-15', 300),
    r('bod_mg_l', '2026-06-15', 250),
    r('bod_mg_l', '2027-01-15', 900),
    r('grease_trap_pump_out', '2026-05-01', null),
  ];

  it('energy sums the year’s bills; renewable share is renewable kWh over kWh', () => {
    const e = energyFromReadings(readings, 2026);
    expect(e.electricityKwh).toBe(4000);
    expect(e.renewableShare).toBeCloseTo(0.25, 9);
    expect(e.naturalGasTherms).toBe(40);
    expect(e.propaneGal).toBe(0);
  });

  it('water volumes are a month of the year’s bills; results read the latest by year end', () => {
    const w = waterFromReadings(readings, 2026);
    expect(w.meteredGalPerMonth).toBe(15_000);
    expect(w.bodMgL).toBe(250);
    expect(w.greaseTrapLastPumpOut).toBe('2026-05-01');
    expect(w.codMgL).toBe(0);
  });

  it('service records become per-circuit additions in date order', () => {
    const s = serviceFromRecords([
      { id: '2', equipmentKey: 'k', servicedOn: '2026-05-01', lbAdded: 2, sourceId: null, technician: null, notes: null, recordedBy: null },
      { id: '1', equipmentKey: 'k', servicedOn: '2026-02-01', lbAdded: 1, sourceId: null, technician: null, notes: null, recordedBy: null },
    ]);
    expect(s.k.map((a) => a.date)).toEqual(['2026-02-01', '2026-05-01']);
  });
});
