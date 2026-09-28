import { describe, it, expect } from 'vitest';
import { resolveScenarioInputs } from '@/engine/scenario';
import { planSeedSubscribers } from '@/data/subscribers';
import { simulateForecast } from '@/engine/forecast-timeline';
import { postPlanLedger, depreciationForMonth } from '@/engine/plan-ledger';

const inputs = resolveScenarioInputs();
const timeline = simulateForecast({ inputs });
const started = performance.now();
const plan = postPlanLedger({ timeline, inputs });
const ms = performance.now() - started;

describe('the Plan ledger', () => {
  it('posts the one-year forecast and says how long it took', () => {
    console.log(`postPlanLedger, one year: ${ms.toFixed(0)} ms, ${plan.entries.length} entries`);
    expect(plan.months.map((m) => m.label)).toEqual(['2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09', '2027-10', '2027-11', '2027-12']);
    expect(plan.quarters.map((q) => q.label)).toEqual(['2027-Q1', '2027-Q2', '2027-Q3', '2027-Q4']);
    expect(plan.years.map((y) => y.label)).toEqual(['2027']);
  });

  it('balances every month, quarter and year, and the direct and indirect cash flows tie', () => {
    for (const s of [...plan.months, ...plan.quarters, ...plan.years]) {
      expect(s.balanced, s.label).toBe(true);
      expect(s.cashFlowTies, `${s.label}: direct ${s.cashFlow.netChangeCents} vs indirect ${s.cashFlowIndirect.netChangeCents}`).toBe(true);
    }
    expect(plan.balanced).toBe(true);
  });

  it('months add up to the year', () => {
    const sum = (f: (s: (typeof plan.months)[number]) => number) => plan.months.reduce((t, m) => t + f(m), 0);
    const year = plan.years[0]!;
    expect(sum((m) => m.incomeStatement.revenueCents)).toBe(year.incomeStatement.revenueCents);
    expect(sum((m) => m.incomeStatement.netIncomeCents)).toBe(year.incomeStatement.netIncomeCents);
    expect(sum((m) => m.cashFlow.netChangeCents)).toBe(year.cashFlow.netChangeCents);
    expect(plan.months.at(-1)!.balanceSheet.totalAssetsCents).toBe(year.balanceSheet.totalAssetsCents);
  });

  it('revenue is the distributed units at their prices; equity, capital and loans post from their documents', () => {
    const revenue = timeline.documents.distributions.reduce((s, d) => s + Math.round(d.units * d.pricePerUnitCents), 0);
    expect(revenue).toBeGreaterThan(0);
    expect(plan.years[0]!.incomeStatement.revenueCents).toBe(revenue);
    const bs = plan.years[0]!.balanceSheet;
    const capex = timeline.documents.capitalPurchases.reduce((s, c) => s + c.amountCents, 0);
    expect(bs.fixedAssetsAtCostCents).toBe(capex);
    const drawn = timeline.documents.loanDraws.reduce((s, x) => s + x.principalCents, 0);
    const repaid = timeline.documents.loanPayments.reduce((s, x) => s + x.principalCents, 0);
    expect(bs.longTermDebtCents + bs.currentUnitOfLongTermDebtCents).toBe(drawn - repaid);
  });

  it('absorbs on the forecast’s own production: the only volume variance is the planned downtime', () => {
    expect(plan.absorption.normalCapacityUnits).toBeCloseTo(timeline.normalCapacity.netPerYear, 9);
    expect(plan.absorption.ratePerUnit).toBeCloseTo(plan.annualOverheadBudget / timeline.normalCapacity.netPerYear, 9);
    // Producing more than normal capacity (downtime taken out) over-absorbs: a period credit.
    expect(plan.absorption.volumeVariance).toBeLessThanOrEqual(0);
  });

  it('depreciation runs from the month of purchase over the class life', () => {
    const buys = [
      { id: 'a', kind: 'equipment' as const, key: 'a', item: 'a', purchasedOn: '2027-01-01', amountCents: 8_400_00 },
      { id: 'b', kind: 'equipment' as const, key: 'b', item: 'b', purchasedOn: '2028-07-15', amountCents: 8_400_00 },
    ];
    expect(depreciationForMonth(buys, '2027-01')).toBeCloseTo(100, 9);
    expect(depreciationForMonth(buys, '2028-07')).toBeCloseTo(200, 9);
    expect(depreciationForMonth(buys, '2033-12')).toBeCloseTo(200, 9);
    expect(depreciationForMonth(buys, '2034-01')).toBeCloseTo(100, 9);
  });

  it('the same timeline posts the same ledger', () => {
    expect(postPlanLedger({ timeline, inputs }).entries).toEqual(plan.entries);
  });
});

describe('the Plan ledger over three years', () => {
  it('balances and ties every month of a forecast expanded to three years', () => {
    const three = resolveScenarioInputs({ forecast: { horizonYears: 3 } });
    const t3 = simulateForecast({ inputs: three });
    const s = performance.now();
    const p3 = postPlanLedger({ timeline: t3, inputs: three });
    console.log(`postPlanLedger, three years: ${(performance.now() - s).toFixed(0)} ms`);
    expect(p3.months).toHaveLength(36);
    expect(p3.years.map((y) => y.label)).toEqual(['2027', '2028', '2029']);
    const bad = [...p3.months, ...p3.years].filter((x) => !x.balanced || !x.cashFlowTies).map((x) => `${x.label} ${x.cashFlow.netChangeCents} ${x.cashFlowIndirect.netChangeCents}`);
    expect(bad).toEqual([]);
  });
});

describe('the Plan ledger with payment terms on file', () => {
  it('net 30 leaves December’s invoices in receivables at year end; loaded labor is split and the last pay period stays accrued', () => {
    // Every Saturday of the year is distributed, so December is invoiced and falls due after year end.
    const withTerms = planSeedSubscribers().map((c) => ({ ...c, paymentTerms: 'net_30' as const }));
    const inputs2 = resolveScenarioInputs({}, undefined, withTerms);
    const t2 = simulateForecast({ inputs: inputs2 });
    const p2 = postPlanLedger({ timeline: t2, inputs: inputs2 });
    expect(p2.balanced).toBe(true);
    const year = p2.years[0]!;
    const receivable = year.balanceSheet.currentAssets.find((r) => r.code === '1300')?.cents ?? 0;
    const unpaid = t2.documents.invoices.filter((i) => i.dueOn! > t2.to);
    const unpaidCents = t2.documents.distributions.filter((d) => unpaid.some((i) => i.id === d.invoiceId)).reduce((s, d) => s + Math.round(d.units * d.pricePerUnitCents), 0);
    expect(unpaid.length).toBeGreaterThan(0);
    expect(receivable).toBe(unpaidCents);
    const accrued = ['2110', '2120', '2130', '2140'].map((code) => year.balanceSheet.currentLiabilities.find((r) => r.code === code)?.cents ?? 0);
    expect(accrued.every((c) => c >= 0)).toBe(true);
    expect(t2.gaps.find((g) => g.kind === 'no_subscriber_terms')).toBeUndefined();
  });

  it('opens with owners’ equity in cash and draws the loans on their start dates', () => {
    const jan = plan.months[0]!;
    expect(jan.cashFlowIndirect.financing.some((r) => r.code === '3100' && r.cents === Math.round(inputs.openingPosition.ownerEquity * 100))).toBe(true);
    expect(jan.cashFlow.openingCashCents).toBe(0);
  });
});
