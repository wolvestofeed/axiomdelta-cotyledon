/**
 * Impact OS — conformance (Roadmap N10). One test per rule the operating model
 * must keep once N2–N9 are in:
 *
 *   C1  a recipe's cost per meal is identical on Unit Economics, Recipes, Production
 *       Planning, the Plan ledger and the Actual ledger at the same standard.
 *   C2  no page or server library imports a figure from `plan-data.ts`.
 *   C3  the same event posts the same entries whether generated (Plan) or recorded (Actual).
 *   C4  with no records, every Actual figure is zero.
 *   C5  every audit finding of §5 has a test asserting it is gone (A1–A17 below).
 *   C6  every Plan ledger month balances, and its cash flow direct equals indirect.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { resolveScenarioInputs, assumptionsFor } from '@/app/(muse)/muse/_engine/scenario';
import { costPerMeal, costRecipe, deriveCapacity } from '@/app/(muse)/muse/_engine';
import { phaseEconomics } from '@/app/(muse)/muse/_engine/phase';
import { planProductionDay } from '@/app/(muse)/muse/_engine/production-plan';
import { postActuals, postActualLedger } from '@/app/(muse)/muse/_engine/actuals-ledger';
import { standardBatchRecordPrefill, type ActualsBundle } from '@/app/(muse)/muse/_engine/actuals';
import { EMPTY_BUNDLE } from '@/app/(muse)/muse/_engine/actuals';
import { libraryLabel } from '@/app/(muse)/muse/_engine/standards';
import { seedLibrary } from '@/app/(muse)/muse/_data/recipes-menu';
import { estimatedTimeStudy } from '@/app/(muse)/muse/_engine/time-study-estimate';
import { activeRecipeAverages } from '@/app/(muse)/muse/_engine/active-averages';
import { seedMenuCycles, seedMealPlans } from '@/app/(muse)/muse/_data/menu-cycles';
import { seedCustomers } from '@/app/(muse)/muse/_data/customers';
import { simulateForecast } from '@/app/(muse)/muse/_engine/forecast-timeline';
import { postPlanLedger } from '@/app/(muse)/muse/_engine/plan-ledger';

const R = resolveScenarioInputs();
const active = R.recipes.filter((r) => r.status === 'in_service');
const DATE = '2027-02-03';

/** One batch record at standard for a recipe, as the timeline generates it and as the Floor would record it. */
function batchAtStandard(code: string) {
  const recipe = R.recipes.find((r) => r.code === code)!;
  const a = assumptionsFor(R, code);
  const portions = deriveCapacity(recipe, R.capacityInputs).batchSize;
  const prefill = standardBatchRecordPrefill(DATE, 1, portions, recipe as never, a.yield.shrinkAllowance.value, libraryLabel(code));
  return { ...prefill, id: `C-${code}`, batchesRun: 1, closedAt: DATE, closedBy: 'conformance' };
}

describe('C1 — a recipe costs the same per meal on every surface', () => {
  for (const recipe of active.slice(0, 5)) {
    it(`${recipe.code}: Recipes, Unit Economics, Production Planning and both ledgers agree on food per meal`, () => {
      const a = assumptionsFor(R, recipe.code);
      const recipesPage = costRecipe(recipe as never, a.yield.shrinkAllowance.value).totalFoodCostPerPortion;
      const unitEconomics = costPerMeal(recipe as never, a, R.capacityInputs).food;
      const own = recipe.channels[0];
      const channelRow = phaseEconomics({ ...R, phaseProfiles: R.phaseProfiles.map((p) => (p.phase === own ? { ...p, portionFactor: { ...p.portionFactor, value: 1 }, premiumFactor: { ...p.premiumFactor, value: 1 } } : p)) }, {}, recipe as never).find((e) => e.phase === own)!;
      const batch = deriveCapacity(recipe, R.capacityInputs).batchSize;
      const day = planProductionDay({ productionDate: DATE, requirements: [{ recipeCode: recipe.code, recipeName: recipe.name, meals: batch, basePortions: batch, byChannel: [], orders: 1, inLibrary: true }], onHand: {}, recipes: R.recipes, capacityInputs: R.capacityInputs, assumptions: R.assumptions, recipeAssumptions: R.recipeAssumptions });
      const run = day.runs.find((x) => x.recipeCode === recipe.code)!;
      const productionPlanning = day.foodCostStandard / run.produced;

      const doc = batchAtStandard(recipe.code);
      const bundle: ActualsBundle = { ...EMPTY_BUNDLE, batches: [doc] };
      const onPlan = postActuals(bundle, R, undefined, { liveLibraryIsStandard: true }).periods[0].batches[0].amounts;
      const onActual = postActuals(bundle, R).periods[0].batches[0].amounts;
      const perMeal = (x: typeof onPlan) => x.standardMaterialCost / x.portionsProduced;

      for (const [surface, v] of [['Unit Economics', unitEconomics], ['Unit Economics by channel', channelRow.foodCostPerPortion], ['Production Planning', productionPlanning], ['Plan ledger', perMeal(onPlan)], ['Actual ledger', perMeal(onActual)]] as const) {
        expect(v, `${recipe.code} on ${surface}`).toBeCloseTo(recipesPage, 6);
      }
    });
  }
});

describe('C2 — no page or server library reads a figure from plan-data', () => {
  const MUSE = join(__dirname, '..', 'src', 'app', '(muse)');
  /** Labels, the HACCP plan and stated reference constants with no definition table: allowed with the reason. */
  const ALLOWED = new Set([
    'RECIPE_STATUS_LABELS', // a label
    'allergenMatrix', // the HACCP plan's allergen matrix
    'ccps', // the HACCP plan's critical control points
    'roster', // the training course roster
    'facility', // the leased shell's stated size: no definition table yet
    'otherCapacities', // published comparison capacities, shown for comparison only
    'nslpReimbursementBenchmark', // the USDA reimbursement benchmark, sourced
    'timeStudy', // the plan's 14-task estimate the estimated studies were built from, documented on the Time Study Sheet
  ]);
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const files = walk(MUSE).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('/_engine/') && !f.includes('/_data/') && !f.endsWith('seed-writes.ts'));

  it('pages, components, state and libraries import only labels and named reference constants', () => {
    const offences: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+'[./]*_data\/plan-data'/g)) {
        if (m[1]) continue;
        for (const raw of m[2].split(',')) {
          const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0];
          if (!name || raw.trim().startsWith('type ')) continue;
          if (!ALLOWED.has(name)) offences.push(`${relative(MUSE, f)}: ${name}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });
});

describe('C3 — an event posts the same entries generated or recorded', () => {
  it('a batch at standard posts identical entries on the Plan basis and the Actual basis', () => {
    const doc = batchAtStandard(active[0].code);
    const bundle: ActualsBundle = { ...EMPTY_BUNDLE, batches: [doc] };
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
      expect(m.mealsDelivered, m.label).toBe(0);
    }
  });
});

describe('C5 — the audit findings of §5 are gone', () => {
  const MUSE = join(__dirname, '..', 'src', 'app', '(muse)', 'muse');
  const src = (...p: string[]) => readFileSync(join(MUSE, ...p), 'utf8');
  const LIB = seedLibrary.map((r) => ({ ...r, status: 'in_service' as const }));
  const studies = LIB.map((r, i) => ({ ...estimatedTimeStudy(r, deriveCapacity(r, R.capacityInputs).batchSize), id: `S${i}`, recipeCode: r.code, basis: 'estimated' as const })) as never;
  const L = resolveScenarioInputs({}, LIB, undefined, [], {}, undefined, undefined, {}, undefined, undefined, undefined, undefined, studies);

  it('A1: labor has one formula — the cost card and the active-recipe averages charge the same labor per meal', () => {
    const avg = activeRecipeAverages(L.recipes, L.capacityInputs, L.assumptions, [], L.recipeAssumptions);
    for (const row of avg.recipes.slice(0, 5)) {
      const r = L.recipes.find((x) => x.code === row.code)!;
      expect(row.laborCostPerMeal, row.code).toBeCloseTo(costPerMeal(r as never, assumptionsFor(L, r.code), L.capacityInputs).directLabor, 9);
    }
  });

  it('A2: every recipe carries its own labor standard, and they differ', () => {
    for (const r of L.recipes) expect(L.recipeAssumptions[r.code], r.code).toBeDefined();
    const fixed = new Set(L.recipes.map((r) => assumptionsFor(L, r.code).laborSplit.fixedMinutesPerBatch.value.toFixed(3)));
    expect(fixed.size).toBeGreaterThan(1);
  });

  it('A3: wage has one source — the Comp page is gone and the staff register holds no pay', () => {
    expect(src('comp', 'page.tsx')).toContain("redirect('/muse/hr')");
    const staff = readFileSync(join(__dirname, '..', '..', '..', 'packages', 'db', 'src', 'schema', 'muse.ts'), 'utf8').match(/export const museStaff = [\s\S]*?\n\);/)![0];
    expect(staff).not.toMatch(/wage|rate|pay_/i);
  });

  it('A4: payroll burden has one source — the timeline and the batch posting read the resolved burden', () => {
    expect(src('_engine', 'forecast-timeline.ts')).toContain('assumptions.labor.payrollBurden.value');
    expect(src('_engine', 'production-ledger.ts')).toContain('assumptions.labor.payrollBurden.value');
  });

  it('A5: a receipt of another recipe’s ingredient posts at that ingredient’s standard, with its price variance', () => {
    const other = L.recipes.find((r) => r.code !== L.recipe.code && r.ingredients.some((i) => i.unit === 'lb' && !L.recipe.ingredients.some((x) => x.name === i.name)))!;
    const line = other.ingredients.find((i) => i.unit === 'lb' && !L.recipe.ingredients.some((x) => x.name === i.name))!;
    const std = Math.round(line.apUnitCost * 100);
    const receipt = { id: 'R', poId: null, supplierId: null, supplierName: null, receivedOn: DATE, invoiceNumber: null, invoiceTotalCents: 0, receivedBy: null, notes: null, lines: [{ ingredient: line.name, qty: 10, unit: 'lb' as const, lotCode: 'L', unitPriceCents: std + 50 }] };
    const posted = postActuals({ ...EMPTY_BUNDLE, receipts: [receipt] }, L);
    const ppv = posted.entries.flatMap((e) => e.lines).filter((l) => l.accountCode === '5110').reduce((t, l) => t + l.debitCents - l.creditCents, 0);
    expect(ppv).toBe(500);
  });

  it('A6: packaging is each recipe’s own picks, not a flat charge on every recipe', () => {
    const [a, b] = L.recipes;
    const pkg = { ...L.packaging.packages[0], manualUnitCost: 0.35 };
    const library = { ...L.packaging, packages: [pkg, ...L.packaging.packages.slice(1)], picks: [{ id: 'p', recipeCode: a.code, packageId: pkg.id, qtyPerMeal: 1 }] };
    const picked = resolveScenarioInputs({}, LIB, undefined, [], {}, undefined, library, {}, undefined, undefined, undefined, undefined, studies);
    expect(assumptionsFor(picked, a.code).perMeal.packaging.value).toBeGreaterThan(0);
    expect(assumptionsFor(picked, b.code).perMeal.packaging.value).toBe(0);
  });

  it('A7: fixed cost is not in the cost of a meal — cost of a meal is food, labor and packaging only', () => {
    for (const e of phaseEconomics(L, {}, L.recipes[0] as never)) {
      const c = costPerMeal(L.recipes[0] as never, assumptionsFor(L, L.recipes[0].code), L.capacityInputs);
      expect(e.costPerMeal - e.foodCostPerPortion, e.market).toBeCloseTo(c.directLabor + c.packaging, 9);
    }
  });

  it('A8: the forecast year is not costed as one recipe — the fiscal-year batch is gone', () => {
    const model = src('_engine', 'ledger-model.ts');
    expect(model).not.toMatch(/export function (annualStatements|buildAnnualJournal)\b/);
    expect(existsIn('_engine', 'allocation.ts')).toBe(false);
  });

  it('A9: a delivery naming its recipe relieves that recipe’s standard', () => {
    expect(src('_engine', 'actuals-ledger.ts')).toMatch(/d\.recipeCode/);
    expect(src('_lib', 'actuals.ts')).toContain('recipeCode: recipeByDelivery.get(r.id) ?? null');
  });

  it('A10: normal capacity no longer reads the static channel table', () => {
    expect(existsIn('_engine', 'allocation.ts')).toBe(false);
    expect(src('_engine', 'actuals-ledger.ts')).toContain('bundleAbsorption(bundle, inputs, budget.annual)');
  });

  it('A11: no typed 650 portions a day drives anything', () => {
    expect(src('_data', 'plan-data.ts')).not.toContain('planningScenario');
    expect(src('_engine', 'scenario.ts')).not.toContain('forecastPortions');
  });

  it('A12: the Actuals forecast month is not annual ÷ 12', () => {
    expect(src('_engine', 'actuals-ledger.ts')).not.toMatch(/export function periodStatements\b/);
  });

  it('A13: forecast revenue uses the price on the order — contracted or channel — as deliveries do', () => {
    expect(src('_engine', 'forecast-timeline.ts')).toContain('pricePerMealCents: o.pricePerMealCents');
  });

  it('A14: Parent Portal and Sales read no seed price or days', () => {
    for (const f of [['..', '(parent)', 'muse', 'parent-portal', '(member)', 'page.tsx'], ['..', '(parent)', 'muse', 'parent-portal', '(member)', 'EnrollClient.tsx'], ['parent-admin', 'page.tsx'], ['sales', 'page.tsx']]) {
      expect(src(...f), f.join('/')).not.toContain('_data/plan-data');
    }
  });

  it('A15: an approved standard freezes the overhead rate', () => {
    expect(src('_engine', 'actuals-ledger.ts')).toContain('std.overheadRatePerMeal === null ? absorption');
  });

  it('A16: no hard-coded $10 price and no fixed production-day date', () => {
    expect(src('_engine', 'production-ledger.ts')).not.toContain('?? 10');
    expect(existsIn('_engine', 'financials.ts') ? src('_engine', 'financials.ts') : '').not.toContain('2026-09-10');
  });

  it('A17: equipment is the library, and Sustainability keys attributes by the line key', () => {
    expect(src('sustainability', 'equipment', 'page.tsx')).toContain('attrs[e.key]');
    expect(L.equipment.every((e) => typeof e.key === 'string' && e.key.length > 0)).toBe(true);
  });

  function existsIn(...p: string[]): boolean {
    try {
      statSync(join(MUSE, ...p));
      return true;
    } catch {
      return false;
    }
  }
});

describe('C6 — every Plan ledger month balances and its cash flow ties', () => {
  it('the engine-default forecast over its first year', () => {
    const saved = seedMenuCycles(R.recipes, '2026-09-14');
    const cycles = [...saved, ...seedMealPlans(seedCustomers(), saved)];
    const plan = postPlanLedger({ timeline: simulateForecast({ inputs: R, cycles }), inputs: R });
    // A month that posts something: a trivially empty ledger would balance on nothing.
    expect(plan.months.some((m) => m.mealsDelivered > 0)).toBe(true);
    for (const m of plan.months) {
      expect(m.balanced, m.label).toBe(true);
      expect(m.cashFlowTies, `${m.label}: direct ${m.cashFlow.netChangeCents} vs indirect ${m.cashFlowIndirect.netChangeCents}`).toBe(true);
    }
    expect(plan.balanced).toBe(true);
  });
});
