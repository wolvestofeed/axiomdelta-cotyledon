'use client';

import { costPlan } from '@/engine/grow-costing';
import { useMemo } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, StatusBadge, money, num, pct } from '@/components/ui';
import { EditableNumber } from '@/components/EditableNumber';
import { SectionSave } from '@/components/SectionSave';
import { costPerUnit, costPlanPerUnit } from '@/engine';
import { channelGrowPlanEconomics, phaseEconomics } from '@/engine/phase';
import { assumptionsFor } from '@/engine/scenario';
import { useLedgerBook, useStatementPeriod } from '@/state/ledger';
import { LedgerStatus, PeriodPicker, dollars, signed } from '@/components/ledger/LedgerParts';
import { resolveScenarioInputs } from '@/engine/scenario';

/** The defaults an edit is measured against: the resolver with no overlay (Roadmap N10, C2). */
// The plan's defaults on the grow seed library, never the Phase 1-era fallback.
const DEFAULTS = resolveScenarioInputs();
import { useScenario } from '@/state/scenario-store';
import { LABOR_BASIS_LABELS } from '@/engine/unit-cost';
import { PageControls } from '@/components/PageControls';
import { GrowPlanSelector, useSelectedGrowPlan } from '@/components/GrowPlanSelector';
import { GRAMS_PER_OZ } from '@/data/tray-formats';
import { seedLineHarvest } from '@/data/grow-plan';

export default function UnitEconomicsPage() {
  const { resolved: scenario, setPhase, setPhaseProfile, resetSection } = useScenario();
  const { growPlan: selected } = useSelectedGrowPlan();
  // The page is the cost card of the SELECTED grow plan: every figure below runs
  // the scenario with that grow plan as the reference.
  const resolved = useMemo(() => ({ ...scenario, growPlan: selected }), [scenario, selected]);

  const econ = useMemo(() => phaseEconomics(resolved), [resolved]);
  // Each channel on the grow plans it offers, not on the selected one (Roadmap N9).
  const byChannel = useMemo(() => channelGrowPlanEconomics(scenario), [scenario]);
  const ownAssumptions = assumptionsFor(scenario, selected.code);
  // The cost of a unit: food + labor + packaging (operating-model-roadmap §3.5).
  // Distribution and commission are selling costs after it; fixed cost is a period
  // metric below and never enters it.
  const base = useMemo(() => costPerUnit(resolved.growPlan, ownAssumptions, resolved.capacityInputs), [resolved, ownAssumptions]);
  // Fixed cost per unit and absorption come off the selected ledger (Roadmap N6): Plan posts
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
      price: meta.pricePerUnit,
      defPrice: defPhase?.pricePerUnit,
      unitFactor: p.unitFactor.value,
      premium: p.premiumFactor.value,
      defPremium: defProfile?.premiumFactor.value,
    };
  });

  const chain = useMemo(() => costPlanPerUnit(resolved.growPlan), [resolved.growPlan]);
  const grow = useMemo(() => costPlan(resolved.growPlan), [resolved.growPlan]);
  // The unit is one whole container of the plan's format; a channel never sells part of one.
  const unitLabel = (factor: number) => `${Number(factor.toFixed(2))} × ${grow.format.name}`;
  // Harvest weight is on the variety records and is not in the cost of a live container.
  const harvestTags = useMemo(
    () => resolved.growPlan.lines.flatMap((l) => (l.kind === 'seed' ? [seedLineHarvest(l, resolved.growPlan.format)] : [])),
    [resolved.growPlan],
  );

  const buildUp = [
    {
      label: 'Input cost (incl. shrink)',
      value: econ[0].inputCostPerUnit,
      note: grow
        ? `One ${grow.format.name}: seed ${money(grow.perTray.seed)}, medium ${money(grow.perTray.medium)}, nutrient ${money(grow.perTray.nutrient)}, light ${money(grow.perTray.light)}, consumables ${money(grow.perTray.consumables)}`
        : `${chain.packedOzPerUnit.toFixed(2)} oz packed at ${money(chain.costPerPackedOz, 4)}/oz — from ${chain.seedOzPerUnit.toFixed(2)} oz as purchased`,
    },
    { label: 'Direct labor', value: base.directLabor, note: `${resolved.growPlan.code}'s own labor standard — ${LABOR_BASIS_LABELS[resolved.laborStandards[resolved.growPlan.code]?.basis ?? 'none'].toLowerCase()} — at its ${num(econ[0].sowingSize)}-unit derived sowing: ${num(ownAssumptions.laborSplit.fixedMinutesPerSowing.value, 0)} fixed minutes over the sowing plus ${ownAssumptions.laborSplit.variableMinutesPerUnit.value.toFixed(3)} minutes a unit, at the ${money(ownAssumptions.labor.blendedLoadedWage.value)}/h loaded labor rate, a placeholder until Staffing's rates arrive. Each grow plan carries its own standard; this is ${resolved.growPlan.code}'s` },
    {
      label: 'Packaging',
      value: base.packaging,
      // The packages the reference grow plan picks, at the library's cost.
      note: (() => {
        const names = resolved.packaging.picks
          .filter((p) => p.growPlanCode === resolved.growPlan.code)
          .map((p) => resolved.packaging.packages.find((x) => x.id === p.packageId)?.name)
          .filter((n): n is string => Boolean(n));
        return names.length === 0 ? `No packages picked for ${resolved.growPlan.code}` : `${names.join(', ')} — at the packaging library's cost`;
      })(),
    },
  ];

  return (
    <>
      <PageHeader
        title="Unit Economics"
        purpose="Test each channel’s price against a grow plan’s cost per container."
        functions={['Inputs', 'Per-phase cost profile', 'Cost of a unit', 'Contribution margin', 'Fixed cost and absorption']}
        connects={[
          { href: '/farm/grow-plans', dir: 'from' },
          { href: '/farm/financials/pnl', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The cost card is the selected grow plan&rsquo;s.</li>
            <li>Editing the price or input premium for a channel recomputes the cost of a unit and the contribution live.</li>
            <li>Changes flow to the Profit &amp; Loss and are saved as a forecast from the forecast bar.</li>
          </ul>
        }
        status="live"
        right={<span className="inline-flex gap-3 items-center"><PageControls><GrowPlanSelector /></PageControls>
          <button
            type="button"
            className="farm-btn"
            onClick={() => {
              resetSection('phases');
              resetSection('phaseProfiles');
            }}
          >
            Revert pricing &amp; units
          </button></span>
        }
      />

      <Card title="Inputs — editable">
        <div className="mb-3!">
          <SectionSave sections={['phases', 'phaseProfiles']} title="pricing & units" />
        </div>
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr>
                <th>Channel</th>
                <th className="num">Price / unit ($)</th>
                <th>Unit</th>
                <th className="num">Input premium (×)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.phase}>
                  <td className="font-medium!">{i.market}</td>
                  <td className="num">
                    <EditableNumber value={i.price} defaultValue={i.defPrice} onChange={(v) => setPhase(i.phase, 'pricePerUnit', v)} step={0.25} prefix="$" ariaLabel={`Phase ${i.phase} price per unit`} showBadge={false} />
                  </td>
                  <td>{unitLabel(i.unitFactor)}</td>
                  <td className="num">
                    <EditableNumber value={i.premium} defaultValue={i.defPremium} onChange={(v) => setPhaseProfile(i.phase, 'premiumFactor', v)} step={0.05} suffix="×" ariaLabel={`Phase ${i.phase} input premium factor`} showBadge={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          A unit is one whole {grow.format.name}. Its cost is the inputs, labor and packaging of that container; harvest weight is not in it. Premium factor scales input cost.
        </p>
        <p className="farm-kpi-sub mt-2">
          Harvest weight on record: {harvestTags[0] ? <StatusBadge status={harvestTags.some((t) => t.status === 'PLACEHOLDER') ? 'PLACEHOLDER' : harvestTags[0].status} title={harvestTags[0].note} /> : null}{' '}
          {num(grow.harvestGramsPerTray, 0)} g ({(grow.harvestGramsPerTray / GRAMS_PER_OZ).toFixed(1)} oz) a container.
        </p>
      </Card>

      <div className="grid gap-3 mt-4 farm-autofit-11">
        {econ.map((e) => (
          <Kpi
            key={e.phase}
            value={money(e.costPerUnit)}
            label={`${e.market} — cost of a unit`}
            sub={`${money(e.pricePerUnit)} price · ${money(e.contribution)} contribution`}
          />
        ))}
      </div>

      <Card title="Per-phase cost profile" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Unit</th>
                <th className="num">Premium factor</th>
                <th className="num">Food / unit</th>
                <th className="num">Cost of a unit</th>
                <th className="num">Sowing size</th>
                <th className="num">Max / day</th>
              </tr>
            </thead>
            <tbody>
              {econ.map((e) => (
                <tr key={e.phase}>
                  <td>{e.market}</td>
                  <td>{unitLabel(e.unitFactor)}</td>
                  <td className="num">{e.premiumFactor.toFixed(2)}×</td>
                  <td className="num">{money(e.inputCostPerUnit)}</td>
                  <td className="num">{money(e.costPerUnit)}</td>
                  <td className="num">{num(e.sowingSize)}</td>
                  <td className="num">{num(e.maxUnitsPerDay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="By channel — the grow plans each channel offers" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead><tr><th>Channel</th><th className="num">Grow plans offered</th><th className="num">Price</th><th className="num">Cost of a unit, mean</th><th className="num">Contribution, mean</th><th>Range</th></tr></thead>
            <tbody>
              {byChannel.map((c) => {
                const costs = c.growPlans.map((r) => r.costPerUnit);
                return (
                  <tr key={c.phase}>
                    <td className="font-medium!">{c.market}</td>
                    <td className="num">{num(c.growPlans.length)}</td>
                    <td className="num">{money(c.pricePerUnit)}</td>
                    <td className="num">{c.costPerUnit === null ? '—' : money(c.costPerUnit)}</td>
                    <td className={`num ${(c.contribution !== null && c.contribution < 0 ? 'farm-c-accent' : '')}`}>{c.contribution === null ? '—' : money(c.contribution)}</td>
                    <td className="farm-c-soft farm-fs-xs">{costs.length === 0 ? 'No in-service grow plan is offered on this channel' : `${money(Math.min(...costs))} to ${money(Math.max(...costs))} a unit`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">Each in-service grow plan offered on a channel, on its own labor standard and packaging, at that channel&rsquo;s price and unit. The cards above are the selected grow plan at every channel.</p>
      </Card>

      <div className="grid gap-4 mt-4 farm-autofit-20">
        <Card title={`Cost of a unit — ${selected.code}, Subscriptions`}>
          <table className="farm-table">
            <tbody>
              {buildUp.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}<div className="farm-c-faint farm-fs-xs">{r.note}</div></td>
                  <td className="num">{money(r.value)}</td>
                </tr>
              ))}
              <tr className="total"><td>Cost of a unit (Subscriptions)</td><td className="num">{money(econ[0].costPerUnit)}</td></tr>
            </tbody>
          </table>
          <p className="farm-kpi-sub mt-2">Distribution ({money(econ[0].distributionPerUnit)} a unit) is a selling cost deducted after the cost of a unit; ASC 330-10-30-8 keeps it out of inventory. Fixed cost is a period metric below. Neither is in the cost of a unit.</p>
        </Card>

        <Card title="Contribution margin by channel">
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead>
                <tr><th>Channel</th><th className="num">Price</th><th className="num">Cost of a unit</th><th className="num">Distribution &amp; commission</th><th className="num">Contrib $</th><th className="num">Contrib %</th></tr>
              </thead>
              <tbody>
                {econ.map((e) => (
                  <tr key={e.phase}>
                    <td>{e.market}{e.channelCost > 0 ? <div className="farm-c-faint farm-fs-xs">less {money(e.channelCost)} marketplace commission</div> : null}</td>
                    <td className="num">{money(e.pricePerUnit)}</td>
                    <td className="num">{money(e.costPerUnit)}</td>
                    <td className="num">{money(e.distributionPerUnit + e.channelCost)}</td>
                    <td className={`num ${(e.contribution < 0 ? 'farm-c-accent' : '')}`}>{money(e.contribution)}</td>
                    <td className="num">{pct(e.contribPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="farm-kpi-sub mt-2">
            Contribution is price less the cost of a unit, distribution and any commission — before fixed cost. Vallecito
            priced a 1020 flat at $25 retail and $20 on subscription (DATED); the channel prices above are the plan&rsquo;s.
          </p>
        </Card>
      </div>

      <p className="farm-kpi-sub mt-4">
        These per-phase costs roll up into the{' '}
        <Link className="farm-link" href="/farm/financials/pnl">annual P&amp;L</Link>, against the{' '}
        <Link className="farm-link" href="/farm/financials/capital">capital and financing</Link> the facility carries.
      </p>

      <Card title="Fixed cost and absorption — on the ledger selected in the forecast bar" className="mt-4">
        <LedgerStatus book={book} pending={bookPending} error={bookError} />
        {book && period && (
          <>
            <PeriodPicker book={book} granularity={granularity} period={period} onGranularity={setGranularity} onLabel={setLabel} />
            <p className="text-sm farm-c-soft mb-3!">
              Fixed cost is a period expense and is not in the cost of a unit. This metric is each period&rsquo;s fixed expense
              over that period&rsquo;s units distributed, both shown, so a year of overhead is never spread over one month&rsquo;s
              volume. Expense basis: manufacturing overhead as incurred (lease, utilities, straight-line depreciation), general
              and administrative, and interest. Principal repaid is financing and is shown beside it.
            </p>
            <div className="farm-scroll-x">
              <table className="farm-table">
                <thead><tr><th>Period</th><th className="num">Units distributed</th><th className="num">Manufacturing overhead</th><th className="num">G&amp;A</th><th className="num">Interest</th><th className="num">Fixed expense</th><th className="num">Per unit</th><th className="num">Principal repaid</th></tr></thead>
                <tbody>
                  {[...(periodMonths.length > 1 ? periodMonths : []), period].map((m) => (
                    <tr key={`${m.kind}-${m.label}`} className={m === period ? 'total' : undefined}>
                      <td>{m.label}</td>
                      <td className="num">{num(Math.round(m.unitsDistributed))}</td>
                      <td className="num">{dollars(m.fixedExpense.manufacturingOverheadCents)}</td>
                      <td className="num">{dollars(m.fixedExpense.generalAndAdministrativeCents)}</td>
                      <td className="num">{dollars(m.fixedExpense.interestCents)}</td>
                      <td className="num">{dollars(m.fixedExpense.totalCents)}</td>
                      <td className="num">{m.fixedExpense.perUnitCents === null ? '—' : money(m.fixedExpense.perUnitCents / 100)}</td>
                      <td className="num farm-c-soft">{dollars(m.fixedExpense.principalRepaidCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-sm mt-4 farm-c-soft mb-3!">
              Only manufacturing overhead absorbs into inventory: the facility lease, its utilities and depreciation of the
              production fit-out (ASC 330-10-30-1). Admin and debt service stay in the period (ASC 330-10-30-8). The rate is set
              once, on normal capacity, and does not move with volume; what moves is how much of the budget is absorbed, and the
              unabsorbed remainder is a period charge (ASC 330-10-30-3). {book.kind === 'plan'
                ? 'On Plan, normal capacity is the forecast’s own production a year, net of planned downtime.'
                : 'On Actual, sowings absorb at the rate set on the plan’s normal capacity, or at the rate an approved standard froze.'}
            </p>
            <div className="grid gap-3 farm-autofit-11">
              <Kpi value={money(book.absorption?.ratePerUnit ?? 0, 4)} label="Absorption rate / unit" sub={`${money(book.absorption?.annualFixedOverhead ?? 0, 0)} budgeted a year over ${num(Math.round(book.absorption?.normalCapacityUnits ?? 0))} units of normal capacity`} />
              <Kpi value={dollars(period.overhead.appliedCents)} label={`Absorbed into inventory, ${period.label}`} sub={`${dollars(period.overhead.incurredCents)} incurred`} />
              <Kpi value={signed(period.overhead.volumeVarianceCents)} label={period.overhead.volumeVarianceCents >= 0 ? 'Unabsorbed — period charge' : 'Over-absorbed — period credit'} sub="Volume variance. Never capitalised into the tray." />
              <Kpi value={signed(period.overhead.spendingVarianceCents)} label="Spending variance" sub="Lease and utilities billed against budget" />
            </div>
          </>
        )}
      </Card>

    </>
  );
}
