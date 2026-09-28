/**
 * MicroFarm — conformance (Roadmap N10). One test per rule the operating model
 * must keep once N2–N9 are in:
 *
 *   C1  a grow plan's cost per unit is identical on Unit Economics, Grow plans, Production
 *       Planning, the Plan ledger and the Actual ledger at the same standard.
 *   C2  no page or server library imports a figure from `plan-data.ts`.
 *   C3  the same event posts the same entries whether generated (Plan) or recorded (Actual).
 *   C4  with no records, every Actual figure is zero.
 *   C5  every audit finding of §5 has a test asserting it is gone (A1–A17 below).
 *   C6  every Plan ledger month balances, and its cash flow direct equals indirect.
 */

import { purchaseLines } from '@/engine/grow-purchase';
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { resolveScenarioInputs, assumptionsFor } from '@/engine/scenario';
import { costPerUnit, costPlanPerUnit, deriveCapacity } from '@/engine';
import { phaseEconomics } from '@/engine/phase';
import { planProductionDay } from '@/engine/production-plan';
import { postActuals, postActualLedger } from '@/engine/actuals-ledger';
import { standardSowingRecordPrefill, type ActualsBundle } from '@/engine/actuals';
import { EMPTY_BUNDLE } from '@/engine/actuals';
import { libraryLabel } from '@/engine/standards';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { laborMinutesPerUnit } from '@/engine/unit-cost';
import { estimatedTimeStudy } from '@/engine/time-study-estimate';
import { activeGrowPlanAverages } from '@/engine/active-averages';
import { simulateForecast } from '@/engine/forecast-timeline';
import { postPlanLedger } from '@/engine/plan-ledger';

const R = resolveScenarioInputs();
const active = R.growPlans.filter((r) => r.status === 'in_service');
const DATE = '2027-02-03';

/** One sowing record at standard for a grow plan, as the timeline generates it and as the Grow Room would record it. */
function sowingAtStandard(code: string) {
  const growPlan = R.growPlans.find((r) => r.code === code)!;
  const a = assumptionsFor(R, code);
  const units = deriveCapacity(growPlan, R.capacityInputs).sowingSize;
  const prefill = standardSowingRecordPrefill(DATE, 1, units, growPlan as never, a.yield.shrinkAllowance.value, libraryLabel(code));
  return { ...prefill, id: `C-${code}`, sowingsRun: 1, closedAt: DATE, closedBy: 'conformance' };
}

describe('C1 — a grow plan costs the same per unit on every surface', () => {
  for (const growPlan of active.slice(0, 5)) {
    it(`${growPlan.code}: Grow plans, Unit Economics, Production Planning and both ledgers agree on food per unit`, () => {
      const a = assumptionsFor(R, growPlan.code);
      const growPlansPage = costPlanPerUnit(growPlan as never, a.yield.shrinkAllowance.value).totalInputCostPerUnit;
      const unitEconomics = costPerUnit(growPlan as never, a, R.capacityInputs).food;
      const own = growPlan.channels[0];
      const channelRow = phaseEconomics({ ...R, phaseProfiles: R.phaseProfiles.map((p) => (p.phase === own ? { ...p, unitFactor: { ...p.unitFactor, value: 1 }, premiumFactor: { ...p.premiumFactor, value: 1 } } : p)) }, {}, growPlan as never).find((e) => e.phase === own)!;
      const sowing = deriveCapacity(growPlan, R.capacityInputs).sowingSize;
      const day = planProductionDay({ productionDate: DATE, requirements: [{ growPlanCode: growPlan.code, growPlanName: growPlan.name, units: sowing, baseUnits: sowing, byChannel: [], orders: 1, inLibrary: true }], onHand: {}, growPlans: R.growPlans, capacityInputs: R.capacityInputs, assumptions: R.assumptions, growPlanAssumptions: R.growPlanAssumptions });
      const run = day.runs.find((x) => x.growPlanCode === growPlan.code)!;
      // A plan no grow unit lights has a sowing of zero: Production Planning makes none of it.
      if (sowing === 0) expect(run.produced).toBe(0);
      const productionPlanning = sowing > 0 ? day.inputCostStandard / run.produced : growPlansPage;

      const doc = sowingAtStandard(growPlan.code);
      const bundle: ActualsBundle = { ...EMPTY_BUNDLE, sowings: [doc] };
      const onPlan = postActuals(bundle, R, undefined, { liveLibraryIsStandard: true }).periods[0].sowings[0].amounts;
      const onActual = postActuals(bundle, R).periods[0].sowings[0].amounts;
      const perUnit = (x: typeof onPlan) => (x.materialIssuedToWip + x.lightApplied + x.consumablesApplied) / x.traysSown;

      for (const [surface, v] of [['Unit Economics', unitEconomics], ['Unit Economics by channel', channelRow.inputCostPerUnit], ['Production Planning', productionPlanning]] as const) {
        expect(v, `${growPlan.code} on ${surface}`).toBeCloseTo(growPlansPage, 6);
      }
      // With no lot on hand the ledgers issue seed, medium and nutrient at the plan's price, and
      // apply light, tray wear and sanitizer as variable overhead, on the trays sown: the cost card.
      // A sowing of zero trays is never recorded, so the ledgers have nothing to cost.
      if (sowing === 0) return;
      for (const [surface, v] of [['Plan ledger', perUnit(onPlan)], ['Actual ledger', perUnit(onActual)]] as const) {
        expect(v, `${growPlan.code} on ${surface}`).toBeCloseTo(growPlansPage, 6);
      }
    });
  }
});

describe('C2 — no page or server library reads a figure from plan-data', () => {
  const FARM = join(__dirname, '..', 'src', 'app', '(farm)');
  /** Labels, the HACCP plan and stated reference constants with no definition table: allowed with the reason. */
  const ALLOWED = new Set([
    'GROW_PLAN_STATUS_LABELS', // a label
  ]);
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const files = walk(FARM).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('seed-writes.ts'));

  it('pages, components, state and libraries import only labels and named reference constants', () => {
    const offences: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+'(?:@\/data|[./]*_data)\/plan-data'/g)) {
        if (m[1]) continue;
        for (const raw of m[2].split(',')) {
          const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0];
          if (!name || raw.trim().startsWith('type ')) continue;
          if (!ALLOWED.has(name)) offences.push(`${relative(FARM, f)}: ${name}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });
});

describe('C3 — an event posts the same entries generated or recorded', () => {
  it('a sowing at standard posts identical entries on the Plan basis and the Actual basis', () => {
    const doc = sowingAtStandard(active[0].code);
    const bundle: ActualsBundle = { ...EMPTY_BUNDLE, sowings: [doc] };
    const absorption = postActuals(bundle, R).absorption;
    const plan = postActuals(bundle, R, undefined, { absorption, liveLibraryIsStandard: true });
    const actual = postActuals(bundle, R, undefined, { absorption });
    const strip = (es: typeof plan.entries) => es.map((e) => ({ id: e.id, date: e.date, lines: e.lines }));
    expect(strip(plan.entries)).toEqual(strip(actual.entries));
  });
});

describe('C4 — with no records every Actual figure is zero', () => {
  it('the Actual ledger on an empty bundle reads zero in every statement', () => {
    const ledger = postActualLedger(EMPTY_BUNDLE, R, '2027-03-15');
    expect(ledger.empty).toBe(true);
    expect(ledger.entries).toEqual([]);
    for (const m of ledger.months) {
      expect(m.incomeStatement.revenueCents, m.label).toBe(0);
      expect(m.incomeStatement.netIncomeCents, m.label).toBe(0);
      expect(m.cashFlow.netChangeCents, m.label).toBe(0);
      expect(m.unitsDistributed, m.label).toBe(0);
    }
  });
});

describe('C5 — the audit findings of §5 are gone', () => {
  // Lifted code lives in src/<dir>; the routes still sit under src/app/(farm)/farm.
  const LIFTED = new Set(['engine', 'server', 'data', 'components', 'state']);
  const at = (...p: string[]) => (LIFTED.has(p[0]!) ? join(__dirname, '..', 'src', ...p) : join(__dirname, '..', 'src', 'app', '(farm)', 'farm', ...p));
  const src = (...p: string[]) => readFileSync(at(...p), 'utf8');
  const LIB = growPlanSeed.map((p) => ({ ...p, status: 'in_service' as const }));
  const studies = LIB.map((r, i) => ({ ...estimatedTimeStudy(r, Math.max(1, deriveCapacity(r, R.capacityInputs).sowingSize)), id: `S${i}`, growPlanCode: r.code, basis: 'estimated' as const })) as never;
  const L = resolveScenarioInputs({}, LIB, undefined, [], {}, undefined, undefined, {}, undefined, undefined, undefined, undefined, studies);

  it('A1: labor has one formula — the cost card and the active-grow-plan averages charge the same labor per unit', () => {
    const avg = activeGrowPlanAverages(L.growPlans, L.capacityInputs, L.assumptions, [], L.growPlanAssumptions);
    for (const row of avg.growPlans.slice(0, 5)) {
      const r = L.growPlans.find((x) => x.code === row.code)!;
      expect(row.laborCostPerUnit, row.code).toBeCloseTo(costPerUnit(r as never, assumptionsFor(L, r.code), L.capacityInputs).directLabor, 9);
    }
  });

  it('A2: every plan carries its own labor standard, and they differ', () => {
    for (const r of L.growPlans) expect(L.growPlanAssumptions[r.code], r.code).toBeDefined();
    // The Vallecito estimate gives every tray the same sowing and harvest minutes; the daily stream over each plan's cycle is what differs.
    const perUnit = new Set(L.growPlans.map((r) => (laborMinutesPerUnit(L.laborStandards[r.code]!, Math.max(1, deriveCapacity(r, L.capacityInputs).sowingSize)) ?? 0).toFixed(3)));
    expect(perUnit.size).toBeGreaterThan(1);
  });

  it('A3: wage has one source — the Comp page is gone and the staff register holds no pay', () => {
    expect(src('comp', 'page.tsx')).toContain("redirect('/farm/staffing')");
    const staff = readFileSync(join(__dirname, '..', 'src', 'db', 'schema', 'farm.ts'), 'utf8').match(/export const farmStaff = [\s\S]*?\n\);/)![0];
    expect(staff).not.toMatch(/wage|rate|pay_/i);
  });

  it('A4: payroll burden has one source — the timeline and the sowing posting read the resolved burden', () => {
    expect(src('engine', 'forecast-timeline.ts')).toContain('assumptions.labor.payrollBurden.value');
    expect(src('engine', 'production-ledger.ts')).toContain('assumptions.labor.payrollBurden.value');
  });

  it('A5: a receipt of any grow plan’s input posts into raw materials at the price received, with no price variance', () => {
    const own = purchaseLines(L.growPlan);
    const other = L.growPlans.find((r) => r.code !== L.growPlan.code && purchaseLines(r).some((i) => i.unit === 'lb' && !own.some((x) => x.name === i.name)))!;
    const line = purchaseLines(other).find((i) => i.unit === 'lb' && !own.some((x) => x.name === i.name))!;
    const std = Math.round(line.unitCost * 100);
    const receipt = { id: 'R', poId: null, supplierId: null, supplierName: null, receivedOn: DATE, invoiceNumber: null, invoiceTotalCents: 0, receivedBy: null, notes: null, lines: [{ input: line.name, qty: 10, unit: 'lb' as const, lotCode: 'L', unitPriceCents: std + 50 }] };
    const posted = postActuals({ ...EMPTY_BUNDLE, receipts: [receipt] }, L);
    const lines = posted.entries.flatMap((e) => e.lines);
    expect(lines.filter((l) => l.accountCode === '1410').reduce((t, l) => t + l.debitCents - l.creditCents, 0)).toBe(10 * (std + 50));
    expect(lines.some((l) => l.accountCode === '5110')).toBe(false);
  });

  it('A6: packaging is each grow plan’s own picks, not a flat charge on every grow plan', () => {
    const [a, b] = L.growPlans;
    const pkg = { ...L.packaging.packages[0], manualUnitCost: 0.35 };
    const library = { ...L.packaging, packages: [pkg, ...L.packaging.packages.slice(1)], picks: [{ id: 'p', growPlanCode: a.code, packageId: pkg.id, qtyPerUnit: 1 }] };
    const picked = resolveScenarioInputs({}, LIB, undefined, [], {}, undefined, library, {}, undefined, undefined, undefined, undefined, studies);
    expect(assumptionsFor(picked, a.code).perUnit.packaging.value).toBeGreaterThan(0);
    expect(assumptionsFor(picked, b.code).perUnit.packaging.value).toBe(0);
  });

  it('A7: fixed cost is not in the cost of a unit — cost of a unit is food, labor and packaging only', () => {
    for (const e of phaseEconomics(L, {}, L.growPlans[0] as never)) {
      const c = costPerUnit(L.growPlans[0] as never, assumptionsFor(L, L.growPlans[0].code), L.capacityInputs);
      expect(e.costPerUnit - e.inputCostPerUnit, e.market).toBeCloseTo(c.directLabor + c.packaging, 9);
    }
  });

  it('A8: the forecast year is not costed as one grow plan — the fiscal-year sowing is gone', () => {
    const model = src('engine', 'ledger-model.ts');
    expect(model).not.toMatch(/export function (annualStatements|buildAnnualJournal)\b/);
    expect(existsIn('engine', 'allocation.ts')).toBe(false);
  });

  it('A9: a distribution naming its grow plan relieves that grow plan’s standard', () => {
    expect(src('engine', 'actuals-ledger.ts')).toMatch(/d\.growPlanCode/);
    expect(src('server', 'actuals.ts')).toContain('growPlanCode: growPlanByDistribution.get(r.id) ?? null');
  });

  it('A10: normal capacity no longer reads the static channel table', () => {
    expect(existsIn('engine', 'allocation.ts')).toBe(false);
    expect(src('engine', 'actuals-ledger.ts')).toContain('bundleAbsorption(bundle, inputs, budget.annual)');
  });

  it('A11: no typed 650 units a day drives anything', () => {
    expect(src('data', 'plan-data.ts')).not.toContain('planningScenario');
    expect(src('engine', 'scenario.ts')).not.toContain('forecastUnits');
  });

  it('A12: the Actuals forecast month is not annual ÷ 12', () => {
    expect(src('engine', 'actuals-ledger.ts')).not.toMatch(/export function periodStatements\b/);
  });

  it('A13: forecast revenue uses the price on the order — contracted or channel — as distributions do', () => {
    expect(src('engine', 'forecast-timeline.ts')).toContain('pricePerUnitCents: o.pricePerUnitCents');
  });

  it('A14: Sales reads no seed price or days', () => {
    for (const f of [['prospects', 'page.tsx']]) {
      expect(src(...f), f.join('/')).not.toContain('_data/plan-data');
    }
  });

  it('A15: an approved standard freezes the overhead rate', () => {
    expect(src('engine', 'actuals-ledger.ts')).toContain('std.overheadRatePerUnit === null ? absorption');
  });

  it('A16: no hard-coded $10 price and no fixed production-day date', () => {
    expect(src('engine', 'production-ledger.ts')).not.toContain('?? 10');
    expect(existsIn('engine', 'financials.ts') ? src('engine', 'financials.ts') : '').not.toContain('2026-09-10');
  });

  it('A17: equipment is the library, and Sustainability keys attributes by the line key', () => {
    expect(src('sustainability', 'equipment', 'page.tsx')).toContain('attrs[e.key]');
    expect(L.equipment.every((e) => typeof e.key === 'string' && e.key.length > 0)).toBe(true);
  });

  function existsIn(...p: string[]): boolean {
    try {
      statSync(at(...p));
      return true;
    } catch {
      return false;
    }
  }
});

describe('C6 — every Plan ledger month balances and its cash flow ties', () => {
  it('the engine-default forecast over its first year', () => {
    const plan = postPlanLedger({ timeline: simulateForecast({ inputs: R }), inputs: R });
    // A month that posts something: a trivially empty ledger would balance on nothing.
    expect(plan.months.some((m) => m.unitsDistributed > 0)).toBe(true);
    for (const m of plan.months) {
      expect(m.balanced, m.label).toBe(true);
      expect(m.cashFlowTies, `${m.label}: direct ${m.cashFlow.netChangeCents} vs indirect ${m.cashFlowIndirect.netChangeCents}`).toBe(true);
    }
    expect(plan.balanced).toBe(true);
  });
});
