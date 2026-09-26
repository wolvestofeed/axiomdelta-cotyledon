'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, StatusBadge, money, num, pct } from '@/components/ui';
import { EditableNumber } from '@/components/EditableNumber';
import { SectionSave } from '@/components/SectionSave';
import { costPerUnit, packedUnitOz, costCropPlan } from '@/engine';
import { channelCropPlanEconomics, phaseEconomics } from '@/engine/phase';
import { assumptionsFor } from '@/engine/scenario';
import { useLedgerBook, useStatementPeriod } from '@/state/ledger';
import { LedgerStatus, PeriodPicker, dollars, signed } from '@/components/ledger/LedgerParts';
import { costCarrier, isGrowPlanCarrier, projectCropPlan } from '@/engine/grow-plan-bridge';
import { resolveScenarioInputs } from '@/engine/scenario';
import { growPlanSeed } from '@/data/grow-plans-seed';

/** The defaults an edit is measured against: the resolver with no overlay (Roadmap N10, C2). */
// The plan's defaults on the grow seed library, never the Phase 1-era fallback.
const DEFAULTS = resolveScenarioInputs({}, growPlanSeed.map((p) => projectCropPlan(p)));
import { useScenario } from '@/state/scenario-store';
import { LABOR_BASIS_LABELS } from '@/engine/unit-cost';
import { PageControls } from '@/components/PageControls';
import { CropPlanSelector, useSelectedCropPlan } from '@/components/CropPlanSelector';

export default function UnitEconomicsPage() {
  const { resolved: scenario, setPhase, setPhaseProfile, resetSection } = useScenario();
  const { cropPlan: selected } = useSelectedCropPlan();
  // The page is the cost card of the SELECTED crop plan: every figure below runs
  // the scenario with that crop plan as the reference.
  const resolved = useMemo(() => ({ ...scenario, cropPlan: selected }), [scenario, selected]);

  const econ = useMemo(() => phaseEconomics(resolved), [resolved]);
  // Each channel on the crop plans it offers, not on the selected one (Roadmap N9).
  const byChannel = useMemo(() => channelCropPlanEconomics(scenario), [scenario]);
  const ownAssumptions = assumptionsFor(scenario, selected.code);
  // The base packed unit is DERIVED from the resolved crop plan's harvested yields
  // (a yield edit on Crop plans moves it); the unit factor is the stored knob.
  const baseUnitOz = useMemo(
    () => packedUnitOz(resolved.cropPlan).totalOz,
    [resolved.cropPlan],
  );
  // The cost of a unit: food + labor + packaging (operating-model-roadmap §3.5).
  // Distribution and commission are selling costs after it; fixed cost is a period
  // metric below and never enters it.
  const base = useMemo(() => costPerUnit(resolved.cropPlan, ownAssumptions, resolved.capacityInputs), [resolved, ownAssumptions]);
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
      unitOz: p.unitFactor.value * baseUnitOz,
      defUnitOz: (defProfile?.unitFactor.value ?? 1) * baseUnitOz,
      premium: p.premiumFactor.value,
      defPremium: defProfile?.premiumFactor.value,
    };
  });

  // The weight basis every per-unit figure is stated against. Without it a
  // unit-size change moves input cost with nothing on the page to read it
  // against.
  const chain = useMemo(() => costCropPlan(resolved.cropPlan), [resolved.cropPlan]);
  const grow = useMemo(() => (isGrowPlanCarrier(resolved.cropPlan) ? costCarrier(resolved.cropPlan) : null), [resolved.cropPlan]);

  const buildUp = [
    {
      label: 'Input cost (incl. shrink)',
      value: econ[0].inputCostPerUnit,
      note: grow
        ? `One ${grow.format.name}: seed ${money(grow.perTray.seed)}, medium ${money(grow.perTray.medium)}, nutrient ${money(grow.perTray.nutrient)}, light ${money(grow.perTray.light)}, consumables ${money(grow.perTray.consumables)} — ${num(grow.harvestGramsPerTray, 0)} g harvest on the record, ${money(grow.costPerHarvestOz, 4)} an ounce`
        : `${chain.packedOzPerUnit.toFixed(2)} oz packed at ${money(chain.costPerPackedOz, 4)}/oz — from ${chain.seedOzPerUnit.toFixed(2)} oz as purchased`,
    },
    { label: 'Direct labor', value: base.directLabor, note: `${resolved.cropPlan.code}'s own labor standard — ${LABOR_BASIS_LABELS[resolved.laborStandards[resolved.cropPlan.code]?.basis ?? 'none'].toLowerCase()} — at its ${num(econ[0].sowingSize)}-unit derived sowing: ${num(ownAssumptions.laborSplit.fixedMinutesPerSowing.value, 0)} fixed minutes over the sowing plus ${ownAssumptions.laborSplit.variableMinutesPerUnit.value.toFixed(3)} minutes a unit, at the ${money(ownAssumptions.labor.blendedLoadedWage.value)}/h loaded labor rate, a placeholder until Staffing's rates arrive. Each crop plan carries its own standard; this is ${resolved.cropPlan.code}'s` },
    {
      label: 'Packaging',
      value: base.packaging,
      // The packages the reference crop plan picks, at the library's cost.
      note: (() => {
        const names = resolved.packaging.picks
          .filter((p) => p.cropPlanCode === resolved.cropPlan.code)
          .map((p) => resolved.packaging.packages.find((x) => x.id === p.packageId)?.name)
          .filter((n): n is string => Boolean(n));
        return names.length === 0 ? `No packages picked for ${resolved.cropPlan.code}` : `${names.join(', ')} — at the packaging library's cost`;
      })(),
    },
  ];

  return (
    <>
      <PageHeader
        title="Unit Economics"
        purpose="Test price and unit per channel against a grow plan’s cost per tray."
        functions={['Inputs', 'Per-phase cost profile', 'Cost of a unit', 'Contribution margin', 'Fixed cost and absorption']}
        connects={[
          { href: '/farm/crop-plans', dir: 'from' },
          { href: '/farm/financials/pnl', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The cost card is the selected crop plan&rsquo;s.</li>
            <li>Editing the price or unit size for a channel recomputes the cost per unit, contribution and units per sowing live.</li>
            <li>Changes flow to the Profit &amp; Loss and are saved as a forecast from the forecast bar.</li>
          </ul>
        }
        status="live"
        right={<span className="inline-flex gap-3 items-center"><PageControls><CropPlanSelector /></PageControls>
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
                <th className="num">Unit size (oz)</th>
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
                  <td className="num">
                    <EditableNumber value={Number(i.unitOz.toFixed(2))} defaultValue={i.defUnitOz} onChange={(v) => setPhaseProfile(i.phase, 'unitFactor', baseUnitOz ? v / baseUnitOz : 1)} step={0.5} suffix="oz" ariaLabel={`Phase ${i.phase} unit size in ounces`} showBadge={false} />
                  </td>
                  <td className="num">
                    <EditableNumber value={i.premium} defaultValue={i.defPremium} onChange={(v) => setPhaseProfile(i.phase, 'premiumFactor', v)} step={0.05} suffix="×" ariaLabel={`Phase ${i.phase} input premium factor`} showBadge={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          Unit size scales the input cost and the canopy mass per unit, so it also changes the
          sowing size. The base packed unit is {baseUnitOz.toFixed(1)} oz, derived from the harvested yields. Premium factor scales input cost.
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
                <th className="num">Unit factor</th>
                <th className="num">Premium factor</th>
                <th className="num">Packed unit (derived)</th>
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
                  <td className="num">{e.unitFactor.toFixed(2)}×</td>
                  <td className="num">{e.premiumFactor.toFixed(2)}×</td>
                  <td className="num">{e.packedUnitOz.toFixed(1)} oz</td>
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

      <Card title="By channel — the crop plans each channel offers" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead><tr><th>Channel</th><th className="num">Crop plans offered</th><th className="num">Price</th><th className="num">Cost of a unit, mean</th><th className="num">Contribution, mean</th><th>Range</th></tr></thead>
            <tbody>
              {byChannel.map((c) => {
                const costs = c.cropPlans.map((r) => r.costPerUnit);
                return (
                  <tr key={c.phase}>
                    <td className="font-medium!">{c.market}</td>
                    <td className="num">{num(c.cropPlans.length)}</td>
                    <td className="num">{money(c.pricePerUnit)}</td>
                    <td className="num">{c.costPerUnit === null ? '—' : money(c.costPerUnit)}</td>
                    <td className={`num ${(c.contribution !== null && c.contribution < 0 ? 'farm-c-accent' : '')}`}>{c.contribution === null ? '—' : money(c.contribution)}</td>
                    <td className="farm-c-soft farm-fs-xs">{costs.length === 0 ? 'No in-service crop plan is offered on this channel' : `${money(Math.min(...costs))} to ${money(Math.max(...costs))} a unit`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">Each in-service crop plan offered on a channel, on its own labor standard and packaging, at that channel&rsquo;s price and unit. The cards above are the selected crop plan at every channel.</p>
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
              <Kpi value={signed(period.overhead.volumeVarianceCents)} label={period.overhead.volumeVarianceCents >= 0 ? 'Unabsorbed — period charge' : 'Over-absorbed — period credit'} sub="Volume variance. Never capitalised into the bowl." />
              <Kpi value={signed(period.overhead.spendingVarianceCents)} label="Spending variance" sub="Lease and utilities billed against budget" />
            </div>
          </>
        )}
      </Card>

    </>
  );
}
