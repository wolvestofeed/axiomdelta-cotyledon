'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, StatusBadge, money, num, pct } from '../../_components/ui';
import { EditableNumber } from '../../_components/EditableNumber';
import { SectionSave } from '../../_components/SectionSave';
import { costPerMeal, platedPortionOz, costRecipe } from '../../_engine';
import { channelRecipeEconomics, phaseEconomics } from '../../_engine/phase';
import { assumptionsFor } from '../../_engine/scenario';
import { useLedgerBook, useStatementPeriod } from '../../_state/ledger';
import { LedgerStatus, PeriodPicker, dollars, signed } from '../../_components/ledger/LedgerParts';
import { nslpReimbursementBenchmark } from '../../_data/plan-data';
import { resolveScenarioInputs } from '../../_engine/scenario';

/** The defaults an edit is measured against: the resolver with no overlay (Roadmap N10, C2). */
const DEFAULTS = resolveScenarioInputs({});
import { useScenario } from '../../_state/scenario-store';
import { LABOR_BASIS_LABELS } from '../../_engine/meal-cost';
import { PageControls } from '../../_components/PageControls';
import { RecipeSelector, useSelectedRecipe } from '../../_components/RecipeSelector';

export default function UnitEconomicsPage() {
  const { resolved: scenario, setPhase, setPhaseProfile, resetSection } = useScenario();
  const { recipe: selected } = useSelectedRecipe();
  // The page is the cost card of the SELECTED recipe: every figure below runs
  // the scenario with that recipe as the reference.
  const resolved = useMemo(() => ({ ...scenario, recipe: selected }), [scenario, selected]);

  const econ = useMemo(() => phaseEconomics(resolved), [resolved]);
  // Each channel on the recipes it offers, not on the selected one (Roadmap N9).
  const byChannel = useMemo(() => channelRecipeEconomics(scenario), [scenario]);
  const ownAssumptions = assumptionsFor(scenario, selected.code);
  // The base plated portion is DERIVED from the resolved recipe's cooked yields
  // (a yield edit on Recipes moves it); the portion factor is the stored knob.
  const basePortionOz = useMemo(
    () => platedPortionOz(resolved.recipe).totalOz,
    [resolved.recipe],
  );
  // The cost of a meal: food + labor + packaging (operating-model-roadmap §3.5).
  // Delivery and commission are selling costs after it; fixed cost is a period
  // metric below and never enters it.
  const base = useMemo(() => costPerMeal(resolved.recipe, ownAssumptions, resolved.capacityInputs), [resolved, ownAssumptions]);
  // Fixed cost per meal and absorption come off the selected ledger (Roadmap N6): Plan posts
  // the open forecast day by day, Actual the recorded documents.
  const { book, error: bookError, pending: bookPending } = useLedgerBook();
  const { granularity, period, setGranularity, setLabel } = useStatementPeriod(book);
  const periodMonths = book && period ? book.months.filter((m) => m.from >= period.from && m.to <= period.to) : [];

  // Editable rows, read from the resolved inputs with plan-data defaults for the
  // "your input" comparison.
  const rows = resolved.phaseProfiles.map((p) => {
    const meta = resolved.phases.find((x) => x.phase === p.phase)!;
    const defPhase = DEFAULTS.phases.find((x) => x.phase === p.phase);
    const defProfile = DEFAULTS.phaseProfiles.find((x) => x.phase === p.phase);
    return {
      phase: p.phase,
      market: meta.market,
      price: meta.pricePerMeal,
      defPrice: defPhase?.pricePerMeal,
      portionOz: p.portionFactor.value * basePortionOz,
      defPortionOz: (defProfile?.portionFactor.value ?? 1) * basePortionOz,
      premium: p.premiumFactor.value,
      defPremium: defProfile?.premiumFactor.value,
    };
  });

  const benchmarkContrib = nslpReimbursementBenchmark.value - econ[0].variablePerMeal - econ[0].channelCost;

  // The weight basis every per-portion figure is stated against. Without it a
  // portion-size change moves food cost with nothing on the page to read it
  // against.
  const chain = useMemo(() => costRecipe(resolved.recipe), [resolved.recipe]);

  const buildUp = [
    {
      label: 'Food cost (incl. shrink)',
      value: econ[0].foodCostPerPortion,
      note: `${chain.platedOzPerPortion.toFixed(2)} oz plated at ${money(chain.costPerPlatedOz, 4)}/oz — from ${chain.apOzPerPortion.toFixed(2)} oz as purchased`,
    },
    { label: 'Direct labor', value: base.directLabor, note: `${resolved.recipe.code}'s own labor standard — ${LABOR_BASIS_LABELS[resolved.laborStandards[resolved.recipe.code]?.basis ?? 'none'].toLowerCase()} — at its ${num(econ[0].batchSize)}-portion derived batch: ${num(ownAssumptions.laborSplit.fixedMinutesPerBatch.value, 0)} fixed minutes over the batch plus ${ownAssumptions.laborSplit.variableMinutesPerPortion.value.toFixed(3)} minutes a portion, at the ${money(ownAssumptions.labor.blendedLoadedWage.value)}/h loaded labor rate, a placeholder until CompTable's rates arrive. Each recipe carries its own standard; this is ${resolved.recipe.code}'s` },
    {
      label: 'Packaging',
      value: base.packaging,
      // The packages the reference recipe picks, at the library's cost.
      note: (() => {
        const names = resolved.packaging.picks
          .filter((p) => p.recipeCode === resolved.recipe.code)
          .map((p) => resolved.packaging.packages.find((x) => x.id === p.packageId)?.name)
          .filter((n): n is string => Boolean(n));
        return names.length === 0 ? `No packages picked for ${resolved.recipe.code}` : `${names.join(', ')} — at the packaging library's cost`;
      })(),
    },
  ];

  return (
    <>
      <PageHeader
        title="Unit Economics"
        purpose="Test price and portion per channel against a recipe’s cost per meal."
        functions={['Inputs', 'Per-phase cost profile', 'Cost of a meal', 'Contribution margin', 'Fixed cost and absorption']}
        connects={[
          { href: '/muse/recipes', dir: 'from' },
          { href: '/muse/financials/pnl', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The cost card is the selected recipe&rsquo;s.</li>
            <li>Editing the price or portion size for a channel recomputes the cost per meal, contribution and portions per batch live.</li>
            <li>Changes flow to the Profit &amp; Loss and are saved as a forecast from the forecast bar.</li>
          </ul>
        }
        status="live"
        right={<span className="inline-flex gap-3 items-center"><PageControls><RecipeSelector /></PageControls>
          <button
            type="button"
            className="muse-btn"
            onClick={() => {
              resetSection('phases');
              resetSection('phaseProfiles');
            }}
          >
            Revert pricing &amp; portions
          </button></span>
        }
      />

      <Card title="Inputs — editable">
        <div className="mb-3!">
          <SectionSave sections={['phases', 'phaseProfiles']} title="pricing & portions" />
        </div>
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead>
              <tr>
                <th>Channel</th>
                <th className="num">Price / meal ($)</th>
                <th className="num">Portion size (oz)</th>
                <th className="num">Ingredient premium (×)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.phase}>
                  <td className="font-medium!">{i.market}</td>
                  <td className="num">
                    <EditableNumber value={i.price} defaultValue={i.defPrice} onChange={(v) => setPhase(i.phase, 'pricePerMeal', v)} step={0.25} prefix="$" ariaLabel={`Phase ${i.phase} price per meal`} showBadge={false} />
                  </td>
                  <td className="num">
                    <EditableNumber value={Number(i.portionOz.toFixed(2))} defaultValue={i.defPortionOz} onChange={(v) => setPhaseProfile(i.phase, 'portionFactor', basePortionOz ? v / basePortionOz : 1)} step={0.5} suffix="oz" ariaLabel={`Phase ${i.phase} portion size in ounces`} showBadge={false} />
                  </td>
                  <td className="num">
                    <EditableNumber value={i.premium} defaultValue={i.defPremium} onChange={(v) => setPhaseProfile(i.phase, 'premiumFactor', v)} step={0.05} suffix="×" ariaLabel={`Phase ${i.phase} ingredient premium factor`} showBadge={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2">
          Portion size scales the food cost and the chilled mass per portion, so it also changes the
          batch size. The base plated portion is {basePortionOz.toFixed(1)} oz, derived from the cooked yields. Premium factor scales ingredient cost.
        </p>
      </Card>

      <div className="grid gap-3 mt-4 muse-autofit-11">
        {econ.map((e) => (
          <Kpi
            key={e.phase}
            value={money(e.costPerMeal)}
            label={`${e.market} — cost of a meal`}
            sub={`${money(e.pricePerMeal)} price · ${money(e.contribution)} contribution`}
          />
        ))}
      </div>

      <Card title="Per-phase cost profile" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead>
              <tr>
                <th>Channel</th>
                <th className="num">Portion factor</th>
                <th className="num">Premium factor</th>
                <th className="num">Plated portion (derived)</th>
                <th className="num">Food / portion</th>
                <th className="num">Cost of a meal</th>
                <th className="num">Batch size</th>
                <th className="num">Max / day</th>
              </tr>
            </thead>
            <tbody>
              {econ.map((e) => (
                <tr key={e.phase}>
                  <td>{e.market}</td>
                  <td className="num">{e.portionFactor.toFixed(2)}×</td>
                  <td className="num">{e.premiumFactor.toFixed(2)}×</td>
                  <td className="num">{e.platedPortionOz.toFixed(1)} oz</td>
                  <td className="num">{money(e.foodCostPerPortion)}</td>
                  <td className="num">{money(e.costPerMeal)}</td>
                  <td className="num">{num(e.batchSize)}</td>
                  <td className="num">{num(e.maxPortionsPerDay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="By channel — the recipes each channel offers" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead><tr><th>Channel</th><th className="num">Recipes offered</th><th className="num">Price</th><th className="num">Cost of a meal, mean</th><th className="num">Contribution, mean</th><th>Range</th></tr></thead>
            <tbody>
              {byChannel.map((c) => {
                const costs = c.recipes.map((r) => r.costPerMeal);
                return (
                  <tr key={c.phase}>
                    <td className="font-medium!">{c.market}</td>
                    <td className="num">{num(c.recipes.length)}</td>
                    <td className="num">{money(c.pricePerMeal)}</td>
                    <td className="num">{c.costPerMeal === null ? '—' : money(c.costPerMeal)}</td>
                    <td className={`num ${(c.contribution !== null && c.contribution < 0 ? 'muse-c-accent' : '')}`}>{c.contribution === null ? '—' : money(c.contribution)}</td>
                    <td className="muse-c-soft muse-fs-xs">{costs.length === 0 ? 'No in-service recipe is offered on this channel' : `${money(Math.min(...costs))} to ${money(Math.max(...costs))} a meal`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2">Each in-service recipe offered on a channel, on its own labor standard and packaging, at that channel&rsquo;s price and portion. The cards above are the selected recipe at every channel.</p>
      </Card>

      <div className="grid gap-4 mt-4 muse-autofit-20">
        <Card title={`Cost of a meal — ${selected.code}, School lunches`}>
          <table className="muse-table">
            <tbody>
              {buildUp.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}<div className="muse-c-faint muse-fs-xs">{r.note}</div></td>
                  <td className="num">{money(r.value)}</td>
                </tr>
              ))}
              <tr className="total"><td>Cost of a meal (School lunches)</td><td className="num">{money(econ[0].costPerMeal)}</td></tr>
            </tbody>
          </table>
          <p className="muse-kpi-sub mt-2">Delivery ({money(econ[0].deliveryPerMeal)} a meal) is a selling cost deducted after the cost of a meal; ASC 330-10-30-8 keeps it out of inventory. Fixed cost is a period metric below. Neither is in the cost of a meal.</p>
        </Card>

        <Card title="Contribution margin by channel">
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead>
                <tr><th>Channel</th><th className="num">Price</th><th className="num">Cost of a meal</th><th className="num">Delivery &amp; commission</th><th className="num">Contrib $</th><th className="num">Contrib %</th></tr>
              </thead>
              <tbody>
                {econ.map((e) => (
                  <tr key={e.phase}>
                    <td>{e.market}{e.channelCost > 0 ? <div className="muse-c-faint muse-fs-xs">less {money(e.channelCost)} marketplace commission</div> : null}</td>
                    <td className="num">{money(e.pricePerMeal)}</td>
                    <td className="num">{money(e.costPerMeal)}</td>
                    <td className="num">{money(e.deliveryPerMeal + e.channelCost)}</td>
                    <td className={`num ${(e.contribution < 0 ? 'muse-c-accent' : '')}`}>{money(e.contribution)}</td>
                    <td className="num">{pct(e.contribPct)}</td>
                  </tr>
                ))}
                <tr className="muse-c-accent">
                  <td>Benchmark — NSLP reimbursement <StatusBadge status={nslpReimbursementBenchmark.status} title={nslpReimbursementBenchmark.note} /></td>
                  <td className="num">{money(nslpReimbursementBenchmark.value)}</td>
                  <td className="num">{money(econ[0].costPerMeal)}</td>
                  <td className="num">{money(econ[0].deliveryPerMeal + econ[0].channelCost)}</td>
                  <td className="num">{money(benchmarkContrib)}</td>
                  <td className="num">{pct(benchmarkContrib / nslpReimbursementBenchmark.value)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muse-kpi-sub mt-2">
            Contribution is price less the cost of a meal, delivery and any commission — before fixed cost.
            The benchmark compares the School lunches meal against federal reimbursement. Change the
            School lunches price above to see where it crosses the {money(nslpReimbursementBenchmark.value)} line.
          </p>
        </Card>
      </div>

      <p className="muse-kpi-sub mt-4">
        These per-phase costs roll up into the{' '}
        <Link className="muse-link" href="/muse/financials/pnl">annual P&amp;L</Link>, against the{' '}
        <Link className="muse-link" href="/muse/financials/capital">capital and financing</Link> the facility carries.
      </p>

      <Card title="Fixed cost and absorption — on the ledger selected in the forecast bar" className="mt-4">
        <LedgerStatus book={book} pending={bookPending} error={bookError} />
        {book && period && (
          <>
            <PeriodPicker book={book} granularity={granularity} period={period} onGranularity={setGranularity} onLabel={setLabel} />
            <p className="text-sm muse-c-soft mb-3!">
              Fixed cost is a period expense and is not in the cost of a meal. This metric is each period&rsquo;s fixed expense
              over that period&rsquo;s meals delivered, both shown, so a year of overhead is never spread over one month&rsquo;s
              volume. Expense basis: manufacturing overhead as incurred (lease, utilities, straight-line depreciation), general
              and administrative, and interest. Principal repaid is financing and is shown beside it.
            </p>
            <div className="muse-scroll-x">
              <table className="muse-table">
                <thead><tr><th>Period</th><th className="num">Meals delivered</th><th className="num">Manufacturing overhead</th><th className="num">G&amp;A</th><th className="num">Interest</th><th className="num">Fixed expense</th><th className="num">Per meal</th><th className="num">Principal repaid</th></tr></thead>
                <tbody>
                  {[...(periodMonths.length > 1 ? periodMonths : []), period].map((m) => (
                    <tr key={`${m.kind}-${m.label}`} className={m === period ? 'total' : undefined}>
                      <td>{m.label}</td>
                      <td className="num">{num(Math.round(m.mealsDelivered))}</td>
                      <td className="num">{dollars(m.fixedExpense.manufacturingOverheadCents)}</td>
                      <td className="num">{dollars(m.fixedExpense.generalAndAdministrativeCents)}</td>
                      <td className="num">{dollars(m.fixedExpense.interestCents)}</td>
                      <td className="num">{dollars(m.fixedExpense.totalCents)}</td>
                      <td className="num">{m.fixedExpense.perMealCents === null ? '—' : money(m.fixedExpense.perMealCents / 100)}</td>
                      <td className="num muse-c-soft">{dollars(m.fixedExpense.principalRepaidCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-sm mt-4 muse-c-soft mb-3!">
              Only manufacturing overhead absorbs into inventory: the commissary lease, its utilities and depreciation of the
              production fit-out (ASC 330-10-30-1). Admin and debt service stay in the period (ASC 330-10-30-8). The rate is set
              once, on normal capacity, and does not move with volume; what moves is how much of the budget is absorbed, and the
              unabsorbed remainder is a period charge (ASC 330-10-30-3). {book.kind === 'plan'
                ? 'On Plan, normal capacity is the forecast’s own production a year, net of planned downtime.'
                : 'On Actual, batches absorb at the rate set on the plan’s normal capacity, or at the rate an approved standard froze.'}
            </p>
            <div className="grid gap-3 muse-autofit-11">
              <Kpi value={money(book.absorption?.ratePerMeal ?? 0, 4)} label="Absorption rate / meal" sub={`${money(book.absorption?.annualFixedOverhead ?? 0, 0)} budgeted a year over ${num(Math.round(book.absorption?.normalCapacityMeals ?? 0))} meals of normal capacity`} />
              <Kpi value={dollars(period.overhead.appliedCents)} label={`Absorbed into inventory, ${period.label}`} sub={`${dollars(period.overhead.incurredCents)} incurred`} />
              <Kpi value={signed(period.overhead.volumeVarianceCents)} label={period.overhead.volumeVarianceCents >= 0 ? 'Unabsorbed — period charge' : 'Over-absorbed — period credit'} sub="Volume variance. Never capitalised into the bowl." />
              <Kpi value={signed(period.overhead.spendingVarianceCents)} label="Spending variance" sub="Lease and utilities billed against budget" />
            </div>
          </>
        )}
      </Card>

    </>
  );
}
