import { describe, it, expect } from 'vitest';
import { resolveScenarioInputs } from '@/engine/scenario';
import { PLAN_SUBSCRIBERS, planSeedSubscribers } from '@/data/subscribers';
import { datesBetween } from '@/engine/orders';
import { simulateForecast, horizonEnd } from '@/engine/forecast-timeline';

// The suite runs on the Plan's subscribers: nineteen weekly subscriptions and Rob's own tray, 20 trays
// each Saturday from 2026-10-17, open-ended; and the longest option, a forecast expanded to three years.
const subscribers = planSeedSubscribers();
const resolve = (config: Parameters<typeof resolveScenarioInputs>[0] = {}) => resolveScenarioInputs(config, undefined, subscribers);
const inputs = resolve({ forecast: { horizonYears: 3 } });
const ownUseId = subscribers.find((c) => c.ownUse)!.id;
const saturdaysIn = (year: number) => datesBetween(`${year}-01-01`, `${year}-12-31`).filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 6).length;

const started = performance.now();
const t = simulateForecast({ inputs });
const elapsedMs = performance.now() - started;

describe('the timeline length: one year by default, two or three on the forecast', () => {
  it('runs one year from the start unless the forecast expands it', () => {
    const one = simulateForecast({ inputs: resolve() });
    expect([one.from, one.to, one.horizonYears, one.years.length]).toEqual(['2027-01-01', '2027-12-31', 1, 1]);
    const two = simulateForecast({ inputs: resolve({ forecast: { horizonYears: 2, startDate: '2027-07-01' } }) });
    expect([two.from, two.to, two.years.length]).toEqual(['2027-07-01', '2029-06-30', 2]);
    expect(resolve({ forecast: { horizonYears: 7 as never } }).forecast.horizonYears).toBe(1);
  });

  it('the first year of a three-year timeline orders and distributes what the one-year timeline does', () => {
    // The three-year timeline also sows inside year one for January of year two, so only the orders and
    // distributions of the year are the same on both.
    const one = simulateForecast({ inputs: resolve() });
    expect(one.years[0]!.orderedUnits).toBe(t.years[0]!.orderedUnits);
    expect(one.years[0]!.distributedUnits).toBe(t.years[0]!.distributedUnits);
    expect(one.years[0]!.revenueCents).toBe(t.years[0]!.revenueCents);
  });
});

describe('the forecast timeline', () => {
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
    expect(simulateForecast({ inputs })).toEqual(t);
  });

  it('carries the subscriptions as entered: 20 trays every Saturday, open-ended, so every year is ordered', () => {
    for (const [i, year] of [2027, 2028, 2029].entries()) expect(t.years[i]!.orderedUnits).toBe((PLAN_SUBSCRIBERS + 1) * saturdaysIn(year));
    expect(t.documents.orders.every((o) => new Date(`${o.orderDate}T00:00:00Z`).getUTCDay() === 6)).toBe(true);
  });

  it('distributes no more than was ordered, and every unfilled unit is a named gap', () => {
    const ordered = t.documents.orders.reduce((s, o) => s + o.units, 0);
    const distributed = t.documents.distributions.reduce((s, d) => s + d.units, 0);
    expect(distributed).toBeLessThanOrEqual(ordered + 1e-6);
    const unfilled = t.gaps.find((g) => g.kind === 'unfilled_units');
    expect(unfilled?.count ?? 0).toBe(Math.round(ordered - distributed));
  });

  it('sowing records carry the day’s runs at standard, and pay periods carry exactly the labor on the days they cover', () => {
    const producedDays = t.horizon.productionDays.reduce((s, d) => s + d.totalProduced, 0);
    expect(t.documents.sowings.reduce((s, b) => s + b.goodUnits, 0)).toBe(producedDays);
    // A sow day before the first pay period (the calendar counts from its placeholder Monday) accrues nothing (`accounting-policy.md` §16).
    const covered = (d: string) => t.documents.payrollPeriods.some((p) => d >= p.periodStart && d <= p.periodEnd);
    const laborCents = t.horizon.productionDays.filter((d) => covered(d.productionDate)).reduce((s, d) => s + d.laborCost, 0) * 100;
    const paid = t.documents.payrollPeriods.reduce((s, p) => s + p.wagesCents + p.payrollTaxesCents + p.workersCompCents + p.benefitsCents, 0);
    expect(paid).toBeGreaterThan(0);
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
    // The Plan subscribers carry no payment terms and no supplier is linked on the seed grow plans.
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

  it('invoices once per invoiced subscriber per month, naming every invoiced distribution; own use is never invoiced', () => {
    const keys = t.documents.invoices.map((i) => `${i.subscriberId}|${i.period}`);
    expect(new Set(keys).size).toBe(keys.length);
    const invoiced = t.documents.distributions.filter((d) => d.phase !== 3 && d.subscriberId !== ownUseId);
    expect(invoiced.every((d) => d.invoiceId !== null)).toBe(true);
    expect(t.documents.distributions.filter((d) => d.subscriberId === ownUseId).every((d) => d.invoiceId === null && d.pricePerUnitCents === 0)).toBe(true);
    expect(t.documents.invoices.every((i) => i.issuedOn!.slice(0, 7) === i.period)).toBe(true);
  });

  it('fixed-cost lines bill each month they are in force; loans draw and repay inside the window', () => {
    // The seed's lines are at zero until stated, so they bill nothing; a stated line bills every month.
    expect(t.documents.bills).toEqual([]);
    const stated = simulateForecast({ inputs: resolve({ capex: { fixedCostLines: { 'home-admin': { householdAmountCents: 60_00 } } } }) });
    expect(new Set(stated.documents.bills.map((b) => b.period)).size).toBe(12);
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

describe('a Plan sowing record is one plan\'s sowings on one sow day, and the sow is the lot', () => {
  it('each plan\'s sow day is one record carrying its sowings, trays and labor, one lot per variety', () => {
    let checked = 0;
    for (const day of t.horizon.productionDays) {
      for (const run of day.runs) {
        if (run.produced <= 0) continue;
        const records = t.documents.sowings.filter((b) => b.productionDate === day.productionDate && b.growPlanCode === run.growPlanCode);
        expect(records, `${day.productionDate} ${run.growPlanCode}`).toHaveLength(1);
        expect(records[0]!.sowingsRun).toBe(run.sowingsScheduled);
        expect(records.reduce((s, r) => s + r.goodUnits, 0)).toBe(run.produced);
        expect(records.reduce((s, r) => s + (r.actualLaborHours ?? 0), 0)).toBeCloseTo(run.laborHours, 9);
        // One lot per variety per sow: no lot code repeats across the plan's records that day.
        const lots = records.flatMap((r) => r.lots.map((l) => l.outputLotCode));
        expect(new Set(lots).size).toBe(lots.length);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
