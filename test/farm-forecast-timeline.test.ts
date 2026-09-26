import { describe, it, expect } from 'vitest';
import { resolveScenarioInputs } from '@/engine/scenario';
import { seedSubscriptionCycles, seedFlatPlans } from '@/data/subscription-cycles';
import { seedSubscribers } from '@/data/subscribers';
import { simulateForecast, horizonEnd } from '@/engine/forecast-timeline';
import { isBlackoutRack } from '@/engine/equipment';

// The suite runs the longest option: a forecast expanded to three years.
const inputs = resolveScenarioInputs({ forecast: { horizonYears: 3 } });
const subscribers = seedSubscribers();
const seedCropPlans = inputs.cropPlans;
const saved = seedSubscriptionCycles(seedCropPlans, '2026-09-14');
const cycles = [...saved, ...seedFlatPlans(subscribers, saved)];

const started = performance.now();
const t = simulateForecast({ inputs, cycles });
const elapsedMs = performance.now() - started;

describe('the timeline length: one year by default, two or three on the forecast', () => {
  it('runs one year from the start unless the forecast expands it', () => {
    const one = simulateForecast({ inputs: resolveScenarioInputs(), cycles });
    expect([one.from, one.to, one.horizonYears, one.years.length]).toEqual(['2027-01-01', '2027-12-31', 1, 1]);
    const two = simulateForecast({ inputs: resolveScenarioInputs({ forecast: { horizonYears: 2, startDate: '2027-07-01' } }), cycles });
    expect([two.from, two.to, two.years.length]).toEqual(['2027-07-01', '2029-06-30', 2]);
    expect(resolveScenarioInputs({ forecast: { horizonYears: 7 as never } }).forecast.horizonYears).toBe(1);
  });

  it('the first year of a three-year timeline is the one-year timeline', () => {
    const one = simulateForecast({ inputs: resolveScenarioInputs(), cycles });
    expect(one.years[0]).toEqual(t.years[0]);
    expect(one.documents.sowings).toEqual(t.documents.sowings.filter((b) => b.productionDate <= one.to));
  });
});

describe('the forecast timeline (Roadmap N4b)', () => {
  it('runs three years from the forecast start, and says how long it took', () => {
    expect(t.from).toBe('2027-01-01');
    expect(t.to).toBe('2029-12-31');
    expect(horizonEnd('2027-03-15', 1)).toBe('2028-03-14');
    expect(t.years.map((y) => [y.from, y.to])).toEqual([
      ['2027-01-01', '2027-12-31'],
      ['2028-01-01', '2028-12-31'],
      ['2029-01-01', '2029-12-31'],
    ]);
    console.log(`simulateForecast, three years: ${elapsedMs.toFixed(0)} ms, ${t.documents.orders.length} orders, ${t.documents.sowings.length} sowing records`);
    expect(elapsedMs).toBeLessThan(30_000);
  });

  it('is deterministic: the same definitions give the same timeline', () => {
    expect(simulateForecast({ inputs, cycles })).toEqual(t);
  });

  it('extends only what is entered: the test term is 2027, so later years carry no orders', () => {
    expect(t.years[0]!.orderedUnits).toBe(180_000);
    expect(t.years[1]!.orderedUnits).toBe(0);
    expect(t.years[2]!.orderedUnits).toBe(0);
  });

  it('distributes no more than was ordered, and every unfilled unit is a named gap', () => {
    const ordered = t.documents.orders.reduce((s, o) => s + o.units, 0);
    const distributed = t.documents.distributions.reduce((s, d) => s + d.units, 0);
    expect(distributed).toBeLessThanOrEqual(ordered + 1e-6);
    const unfilled = t.gaps.find((g) => g.kind === 'unfilled_units');
    expect(unfilled?.count ?? 0).toBe(Math.round(ordered - distributed));
  });

  it('sowing records carry the day’s runs at standard, and pay periods carry exactly their labor', () => {
    const producedDays = t.horizon.productionDays.reduce((s, d) => s + d.totalProduced, 0);
    expect(t.documents.sowings.reduce((s, b) => s + b.goodUnits, 0)).toBe(producedDays);
    const laborCents = t.horizon.productionDays.reduce((s, d) => s + d.laborCost, 0) * 100;
    const paid = t.documents.payrollPeriods.reduce((s, p) => s + p.wagesCents + p.payrollTaxesCents + p.workersCompCents + p.benefitsCents, 0);
    expect(Math.abs(paid - laborCents)).toBeLessThanOrEqual(t.documents.payrollPeriods.length);
    expect(t.documents.payrollPeriods.every((p) => p.payDate > p.periodEnd)).toBe(true);
  });

  it('purchasing buys whole cases and never less than production needs', () => {
    const need = new Map<string, number>();
    for (const d of t.horizon.productionDays) for (const l of d.purchase.lines) need.set(l.name, (need.get(l.name) ?? 0) + l.requiredForProduction);
    const bought = new Map<string, number>();
    for (const r of t.documents.receipts) for (const l of r.lines) bought.set(l.input, (bought.get(l.input) ?? 0) + l.qty);
    for (const [name, qty] of need) expect(bought.get(name) ?? 0).toBeGreaterThanOrEqual(qty - 1e-6);
  });

  it('names missing terms and settles them on the document date', () => {
    const kinds = t.gaps.map((g) => g.kind);
    // The test subscribers carry no payment terms and no supplier is linked on the code crop plan.
    expect(kinds).toContain('no_subscriber_terms');
    expect(kinds).toContain('no_supplier');
    for (const i of t.documents.invoices) {
      expect(i.dueOn).toBe(i.issuedOn);
      const paid = t.documents.subscriberPayments.filter((p) => p.applications.some((a) => a.documentId === i.id));
      if (i.issuedOn! <= t.to) expect(paid).toHaveLength(1);
    }
    expect(t.documents.supplierBills).toHaveLength(t.documents.receipts.length);
    const billPayments = t.documents.supplierPayments.filter((p) => p.supplierName !== 'Own fleet');
    expect(billPayments.every((p) => t.documents.supplierBills.some((b) => b.id === p.reference && b.billDate === p.paidOn))).toBe(true);
    // Own-fleet distribution cost is paid on each distribution date.
    const fleet = t.documents.supplierPayments.filter((p) => p.supplierName === 'Own fleet');
    expect(new Set(fleet.map((p) => p.paidOn))).toEqual(new Set(t.documents.distributions.map((d) => d.distributedOn)));
    expect(kinds).toContain('distribution_cost_payment_timing');
    expect(t.documents.equityContributions).toEqual([{ id: 'PLAN-EQUITY', contributedOn: '2027-01-01', amountCents: Math.round(inputs.openingPosition.ownerEquity * 100), notes: "Owners' equity at the forecast start" }]);
  });

  it('invoices once per invoiced subscriber per month, naming every invoiced distribution', () => {
    const keys = t.documents.invoices.map((i) => `${i.subscriberId}|${i.period}`);
    expect(new Set(keys).size).toBe(keys.length);
    const invoiced = t.documents.distributions.filter((d) => d.phase !== 3);
    expect(invoiced.every((d) => d.invoiceId !== null)).toBe(true);
    expect(t.documents.invoices.every((i) => i.issuedOn!.slice(0, 7) === i.period)).toBe(true);
  });

  it('fixed-cost lines bill each month they are in force; loans draw and repay inside the window', () => {
    const months = new Set(t.documents.bills.map((b) => b.period));
    expect(months.size).toBe(36);
    for (const l of inputs.loans.filter((x) => x.principalCents > 0)) {
      expect(t.documents.loanDraws.some((d) => d.loanKey === l.key)).toBe(true);
      expect(t.documents.loanPayments.filter((p) => p.loanKey === l.key).every((p) => p.paidOn >= t.from && p.paidOn <= t.to)).toBe(true);
    }
  });

  it('normal capacity is the plan’s own production a year, net of planned downtime', () => {
    expect(t.normalCapacity.perYear).toBeCloseTo(t.horizon.totals.producedBase / 3, 9);
    expect(t.normalCapacity.netPerYear).toBeCloseTo(t.normalCapacity.perYear * (1 - t.normalCapacity.plannedDowntimeRate), 9);
  });
});

describe('the forecast reads no rack', () => {
  it('dating the blackout racks later leaves every sowing where it was, and every plan has a grow unit', () => {
    expect(t.gaps.find((g) => g.kind === 'no_grow_unit')).toBeUndefined();
    const late = resolveScenarioInputs({ forecast: { horizonYears: 3, equipment: Object.fromEntries(inputs.datedEquipment.filter((l) => isBlackoutRack(l.item) && l.phase === 1).map((l) => [l.key, { inServiceDate: '2027-02-01' }])) } });
    const t3 = simulateForecast({ inputs: late, cycles });
    expect(t3.horizon.totals.producedBase).toBe(t.horizon.totals.producedBase);
    expect(t3.horizon.totals.sowings).toBe(t.horizon.totals.sowings);
  });
});

describe('a Plan sowing record is one plan\'s sowings on one sow day, and the sow is the lot', () => {
  it('each plan\'s sow day is one record carrying its sowings, trays and labor, one lot per component', () => {
    let checked = 0;
    for (const day of t.horizon.productionDays) {
      for (const run of day.runs) {
        if (run.produced <= 0) continue;
        const records = t.documents.sowings.filter((b) => b.productionDate === day.productionDate && b.cropPlanCode === run.cropPlanCode);
        expect(records, `${day.productionDate} ${run.cropPlanCode}`).toHaveLength(1);
        expect(records[0]!.sowingsRun).toBe(run.sowingsScheduled);
        expect(records.reduce((s, r) => s + r.goodUnits, 0)).toBe(run.produced);
        expect(records.reduce((s, r) => s + (r.actualLaborHours ?? 0), 0)).toBeCloseTo(run.laborHours, 9);
        // One lot per component per sow: no lot code repeats across the crop plan's records that day.
        const lots = records.flatMap((r) => r.components.map((c) => c.outputLotCode));
        expect(new Set(lots).size).toBe(lots.length);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
