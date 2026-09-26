import { describe, it, expect } from 'vitest';
import { resolveScenarioInputs } from '@/app/(muse)/muse/_engine/scenario';
import { standardBatchRecordPrefill, type ActualsBundle, type DeliveryDoc } from '@/app/(muse)/muse/_engine/actuals';
import { expiredMassKg, mixFoodFootprint, receivedMassKg, sustainabilityBasis } from '@/app/(muse)/muse/_engine/sustainability-basis';
import { energyFromReadings, serviceFromRecords, waterFromReadings, type ReadingDoc } from '@/app/(muse)/muse/_engine/sustainability-records';
import { recipeFoodFootprint } from '@/app/(muse)/muse/_engine/carbon';

const R = resolveScenarioInputs({});
const recipe = R.recipes.find((r) => r.code === R.recipe.code)!;
const channel = recipe.channels[0];
const pf = Object.fromEntries(R.phaseProfiles.map((p) => [p.phase, p.portionFactor.value])) as Record<number, number>;

const batch = (date: string, portions: number) => ({ ...standardBatchRecordPrefill(date, 1, portions, recipe as never), id: `B-${date}`, closedAt: date });
const delivery = (date: string, meals: number, over: Partial<DeliveryDoc> = {}): DeliveryDoc => ({ id: `D-${date}-${meals}`, deliveredOn: date, phase: channel, siteId: 'SITE-01', siteName: 'Test Site 1', meals, pricePerMealCents: 1000, lotCodes: [], deliveredBy: null, recipeCode: recipe.code, notes: null, ...over });

describe('muse sustainability basis (Roadmap N6 slice 4)', () => {
  const bundle: Pick<ActualsBundle, 'batches' | 'receipts' | 'deliveries'> = {
    batches: [batch('2025-12-30', 100), batch('2026-03-02', 500), batch('2026-06-01', 300)],
    receipts: [
      { id: 'R1', poId: null, supplierId: null, supplierName: null, receivedOn: '2026-03-01', invoiceNumber: null, invoiceTotalCents: 0, receivedBy: null, notes: null, lines: [
        { ingredient: 'Pinto beans, dry', qty: 50, unit: 'lb', lotCode: 'L1', unitPriceCents: 100 },
        { ingredient: 'Pinto beans, dry', qty: 20, unit: 'lb', lotCode: 'L2', unitPriceCents: 100, condition: 'rejected' },
      ] },
    ],
    deliveries: [delivery('2025-12-31', 100), delivery('2026-03-03', 400), delivery('2026-03-04', 100, { recipeCode: null, siteId: 'SITE-02', siteName: 'Test Site 2' })],
  };
  const basis = sustainabilityBasis({ kind: 'actual', bundle, from: '2026-01-01', to: '2026-12-31', holdLifeDays: 30, recipes: R.recipes, portionFactorByChannel: pf });

  it('counts only the window: meals by recipe and channel, days, production and receipts', () => {
    expect(basis.totalMeals).toBe(500);
    expect(basis.deliveryDays).toBe(2);
    expect(basis.productionDays).toBe(2);
    expect(basis.producedByRecipe[recipe.code]).toBe(800);
    expect(basis.mealsWithNoRecipe).toBe(100);
    expect(basis.meals.find((m) => m.recipeCode === recipe.code)!.meals).toBe(400);
    expect(basis.bySite.map((s) => [s.siteId, s.meals, s.deliveryDays])).toEqual([['SITE-01', 400, 1], ['SITE-02', 100, 1]]);
    expect(basis.received).toEqual([{ ingredient: 'Pinto beans, dry', unit: 'lb', qty: 50 }]);
    expect(receivedMassKg(basis)[0].massKg).toBeCloseTo(50 * 0.45359237, 9);
  });

  it('names portions that passed hold life unshipped inside the window', () => {
    // 500 made 03-02, 400 shipped 03-03 → 100 expire 04-01; 300 made 06-01 expire 07-01. Nothing after.
    expect(basis.expiredByRecipe[recipe.code]).toBeCloseTo(400, 9);
    expect(expiredMassKg(basis, R.recipes).portions).toBeCloseTo(400, 9);
  });

  it('costs food recipe by recipe and names meals with no recipe', () => {
    const food = mixFoodFootprint({ basis, recipes: R.recipes, portionFactorByChannel: pf });
    const perMeal = recipeFoodFootprint(recipe as never).totalKgCo2ePerPortion;
    expect(food.referenceKg).toBeCloseTo(perMeal * 400, 6);
    expect(food.selectedKg).toBeCloseTo(food.referenceKg, 9);
    expect(food.mealsNotCosted).toBe(100);
  });
});

describe('muse sustainability records fold over the calendar year', () => {
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
