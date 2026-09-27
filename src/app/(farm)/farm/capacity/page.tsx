'use client';

import { costPlan } from '@/engine/grow-costing';
import { useMemo } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, StatusBadge, num } from '@/components/ui';
import { EditableNumber } from '@/components/EditableNumber';
import { SectionSave } from '@/components/SectionSave';
import { deriveGrowCapacity, traysPerShelf, traysPerUnit, unitTakesPlan, type GrowUnit } from '@/engine/grow-capacity';
import { defaultGrowUnits } from '@/engine';
import { projectCropPlan } from '@/engine/grow-plan-bridge';
import { FIXTURE_BY_KEY, REGIME_BY_KEY } from '@/data/inputs-catalog';
import { PLAN_FORMATS, TRAY_FORMAT_BY_KEY, unitSku } from '@/data/tray-formats';
import { lightLine, planStageDays, type GrowPlanDef } from '@/data/grow-plan';
import { cycleDays, daysToHarvest } from '@/data/stage-schedule';
import { CROP_PLAN_STATUS_LABELS } from '@/data/plan-data';
import { resolveScenarioInputs } from '@/engine/scenario';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { clock } from '@/data/crews';
import type { StatusTag } from '@/data/tagged';
import { useScenario } from '@/state/scenario-store';
import { useOperationsWorld } from '@/state/ledger';
import { PageControls } from '@/components/PageControls';
import { CropPlanSelector, useSelectedCropPlan } from '@/components/CropPlanSelector';

/** The defaults an edit is measured against: the resolver with no overlay. */
// The plan's defaults on the grow seed library, never the Phase 1-era fallback.
const DEFAULTS = resolveScenarioInputs({}, growPlanSeed.map((p) => projectCropPlan(p)));
const hoursOf = (min: number) => Math.round((min / 60) * 100) / 100;

/**
 * Capacity (outline §5 rules 1 and 8): a property of the grow room. A sowing is what one grow unit takes
 * in trays of the plan's format; a second unit is a parallel stream; a tray holds its shelf for the
 * plan's cycle days, so the sustained ceiling is the trays across the units over the cycle.
 */
export default function CapacityPage() {
  const { resolved, config, setCapacity } = useScenario();
  const { cropPlan: selected } = useSelectedCropPlan();
  const { forecastEditing } = useOperationsWorld({});
  const locked = !forecastEditing;
  const C = resolved.capacityInputs;
  const D = DEFAULTS.capacityInputs;
  const units: readonly GrowUnit[] = C.growUnits ?? defaultGrowUnits;
  const plan: GrowPlanDef | null = selected;

  const cap = useMemo(() => (plan ? deriveGrowCapacity(plan, units) : null), [plan, units]);
  const costing = useMemo(() => costPlan(selected), [selected]);
  const days = plan ? planStageDays(plan) : null;
  const light = plan ? lightLine(plan) : undefined;
  const regime = light ? REGIME_BY_KEY[light.regimeKey] : null;
  const format = plan ? TRAY_FORMAT_BY_KEY[plan.format] : null;
  const daysTyped = config.capacity?.productionDaysPerYear !== undefined;

  const byPlan = useMemo(
    () =>
      resolved.cropPlans.map((r) => {
        const c = deriveGrowCapacity(r, units);
        return { code: r.code, name: r.name, status: r.status, format: TRAY_FORMAT_BY_KEY[r.format].name, sku: unitSku(r.code, r.format), sowing: c.sowingTrays, unitCount: c.unitCount, totalTrays: c.totalTrays, cycle: c.cycleDays, toHarvest: c.daysToHarvest, perDay: c.traysPerDay, binding: c.binding?.unit.item ?? null };
      }),
    [resolved.cropPlans, units],
  );

  const chain: Array<{ step: string; value: string; status: StatusTag; note?: string; total?: boolean }> =
    plan && cap && format && days
      ? [
          { step: `${format.name}: trays side by side on a 48-inch shelf`, value: `${num(format.perShelf48in.value)} per shelf`, status: format.perShelf48in.status, note: format.perShelf48in.note },
          ...(cap.binding
            ? [
                { step: `${cap.binding.unit.item}: ${num(cap.binding.unit.shelfWidthIn)}-inch shelves × ${num(cap.binding.unit.shelves)} shelves`, value: `${num(traysPerShelf(plan.format, cap.binding.unit.shelfWidthIn))} × ${num(cap.binding.unit.shelves)} = ${num(cap.binding.traysPerUnit)} trays`, status: 'DERIVED' as StatusTag, note: 'Shelves and shelf width are open fields on Grow Units' },
                { step: 'One unit takes the sowing = STANDARD SOWING', value: `${num(cap.sowingTrays)} trays`, status: 'DERIVED' as StatusTag, note: 'A second unit is a parallel stream the production plan places as its own sowing, never a larger sowing', total: true },
              ]
            : [{ step: 'No grow unit takes this plan', value: '0 trays', status: 'DERIVED' as StatusTag, note: light ? `The light line asks for ${regime?.name ?? light.regimeKey}; no unit on the Phase 1 list carries a fixture that delivers it` : 'No unit on the Phase 1 list has shelves' }]),
          { step: `Light line${light ? `: ${regime?.name ?? light.regimeKey}` : ': none'} against each unit's fixture`, value: `${num(cap.unitCount)} of ${num(units.reduce((t, u) => t + u.units, 0))} units take the plan`, status: 'DERIVED', note: light ? 'A unit takes the plan only when its fixture delivers the regime at the intensity asked (`fixtureDelivers`)' : 'A plan with no light line goes on any unit' },
          { step: 'Trays across the units that take the plan', value: `${num(cap.totalTrays)} trays`, status: 'DERIVED', note: 'Units counted; the shelves in use at once' },
          { step: `Cycle days on the shelf: sow ${days.sow}, germination ${days.germination}, blackout ${days.blackout}, light ${days.light}, harvest window ${days['harvest-window']}`, value: `${num(cap.cycleDays)} days`, status: 'DERIVED', note: `${num(cap.daysToHarvest)} days to the first harvest day; a live tray waits in its window` },
          { step: 'Trays across the units ÷ cycle days = SUSTAINED CEILING', value: `${num(cap.traysPerDay, 2)} trays a day`, status: 'DERIVED', note: 'What the shelves make on average with every shelf full; the calendar places the actual sowings', total: true },
          { step: '× 365 = trays a year with every shelf full', value: `${num(cap.traysPerDay * 365, 0)} trays`, status: 'DERIVED', note: 'A shelf is occupied seven days a week; production days gate the sow and harvest labor, not the shelf' },
        ]
      : [];

  return (
    <>
      <PageHeader
        title="Capacity"
        purpose="See what one grow unit takes as a sowing, and what the shelves sustain over the cycle."
        functions={['Constraint chain', 'Sustained ceiling', 'Grow units', 'Plans in the library', 'Operating day']}
        connects={[
          { href: '/farm/grow-units', dir: 'from' },
          { href: '/farm/production-planning/grow-calendar', dir: 'to' },
          { href: '/farm/production-planning', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A sowing is what one grow unit takes in trays of the plan&rsquo;s format: trays per shelf times shelves.</li>
            <li>A unit takes a plan only when its fixture delivers the plan&rsquo;s light line; a plan with no light line goes anywhere.</li>
            <li>A tray holds its shelf for the plan&rsquo;s cycle days, so the sustained ceiling is the trays across the units over the cycle.</li>
            <li>Shelves, shelf width and fixture are open fields on Grow Units; the Grow Calendar places the actual sowings.</li>
          </ul>
        }
        status="live"
      />
      <PageControls><CropPlanSelector /></PageControls>

      {!plan && (
        <Card title="Not a grow plan">
          <p className="farm-kpi-sub">{selected.code} is a Phase 1-era plan; capacity in trays is read for grow plans. Pick one above.</p>
        </Card>
      )}

      {plan && cap && format && (
        <>
          <div className="grid gap-3 farm-autofit-11">
            <Kpi value={num(cap.sowingTrays)} label="Standard sowing" sub={cap.binding ? `${format.name}s on one ${cap.binding.unit.item.toLowerCase()}` : 'no unit takes this plan'} />
            <Kpi value={num(cap.unitCount)} label="Units that take it" sub={`of ${num(units.reduce((t, u) => t + u.units, 0))} grow units on the Phase 1 list`} />
            <Kpi value={num(cap.totalTrays)} label="Trays on the shelves at once" sub="across the units that take it" />
            <Kpi value={`${num(cap.cycleDays)} days`} label="Cycle on the shelf" sub={`${num(cap.daysToHarvest)} to the first harvest day`} />
            <Kpi value={num(cap.traysPerDay, 2)} label="Sustained ceiling, trays a day" sub={`${num(cap.traysPerDay * 365, 0)} a year with every shelf full`} />
            {costing && <Kpi value={unitSku(selected.code, plan.format)} label="Unit SKU" sub={`${num(costing.harvestGramsPerTray, 0)} g harvest per tray on the record`} />}
          </div>

          <Card title="The constraint chain" className="mt-4">
            <div className="farm-scroll-x">
              <table className="farm-table">
                <tbody>
                  {chain.map((c, i) => (
                    <tr key={i} className={c.total ? 'total' : ''}>
                      <td>{c.step}</td>
                      <td className="num min-w-48!">{c.value}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td className="farm-c-faint farm-fs-xs">{c.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Grow units on the Phase 1 list" className="mt-4">
            <div className="farm-scroll-x">
              <table className="farm-table">
                <thead>
                  <tr><th>Unit</th><th className="num">Units</th><th className="num">Shelves</th><th className="num">Shelf in</th><th>Fixture</th>{PLAN_FORMATS.map((f) => <th key={f.key} className="num">{f.name}</th>)}<th>Takes {selected.code}</th></tr>
                </thead>
                <tbody>
                  {units.length === 0 && <tr><td colSpan={7 + PLAN_FORMATS.length} className="farm-c-soft">No equipment row on the Phase 1 list carries shelves. Enter shelves, shelf width and a fixture on <Link className="farm-link" href="/farm/grow-units">Grow Units</Link>.</td></tr>}
                  {units.map((u) => (
                    <tr key={u.key} className={cap.binding?.unit.key === u.key ? 'total' : ''}>
                      <td>{u.item}</td>
                      <td className="num">{num(u.units)}</td>
                      <td className="num">{num(u.shelves)}</td>
                      <td className="num">{num(u.shelfWidthIn)}</td>
                      <td>{u.fixtureKey ? FIXTURE_BY_KEY[u.fixtureKey]?.name ?? u.fixtureKey : 'unlit'}</td>
                      {PLAN_FORMATS.map((f) => <td key={f.key} className="num">{num(traysPerUnit(u, f.key))}</td>)}
                      <td>{unitTakesPlan(u, plan) ? 'yes' : light ? `no: ${u.fixtureKey ? 'fixture does not deliver the regime' : 'no fixture'}` : 'yes'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="farm-kpi-sub mt-2">Trays per unit by format: the format&rsquo;s count on a 48-inch shelf scaled to the shelf width, times the shelves. Vallecito&rsquo;s starter rack is the first row: five lit tiers of four 1020 flats under the Mars Hydro VG80 (DATED). Edit the units on <Link className="farm-link" href="/farm/grow-units">Grow Units</Link>.</p>
          </Card>

          <Card title="Every plan in the library on these units" className="mt-4">
            <div className="farm-scroll-x">
              <table className="farm-table">
                <thead>
                  <tr><th>Plan</th><th>Status</th><th>Format</th><th>Unit SKU</th><th className="num">Sowing</th><th className="num">Units</th><th className="num">Trays at once</th><th className="num">To harvest</th><th className="num">Cycle</th><th className="num">Trays a day</th><th>Bound by</th></tr>
                </thead>
                <tbody>
                  {byPlan.map((r) => (
                    <tr key={r.code} className={r.code === selected.code ? 'total' : ''}>
                      <td>{r.code}<div className="farm-c-faint farm-fs-xs">{r.name}</div></td>
                      <td>{CROP_PLAN_STATUS_LABELS[r.status]}</td>
                      <td>{r.format}</td>
                      <td className="farm-mono">{r.sku}</td>
                      <td className="num">{num(r.sowing)}</td>
                      <td className="num">{num(r.unitCount)}</td>
                      <td className="num">{num(r.totalTrays)}</td>
                      <td className="num">{num(r.toHarvest)} d</td>
                      <td className="num">{num(r.cycle)} d</td>
                      <td className="num">{num(r.perDay, 2)}</td>
                      <td className={r.binding ? '' : 'farm-c-accent'}>{r.binding ?? 'no unit takes it'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="farm-kpi-sub mt-2">A plan that asks for a blue-heavy or far-red regime waits on the tunable fixture that is not yet bought; until then no unit takes it and its sowing is zero. A day serving several plans places their sowings on whichever unit has room for the whole cycle: the <Link className="farm-link" href="/farm/production-planning/grow-calendar">Grow Calendar</Link> places them and says when a sowing has no room.</p>
          </Card>
        </>
      )}

      <Card title="Operating day" className="mt-4">
        <p className="farm-kpi-sub mb-2">The day the sow and harvest labor runs inside. A shelf is occupied seven days a week whatever the operating day.</p>
        <div className="mb-3!">
          {forecastEditing ? <SectionSave sections={['capacity']} title="capacity" /> : <p className="farm-kpi-sub">The open forecast&rsquo;s inputs, read-only on Actual. They are edited on Plan.</p>}
        </div>
        <div className="farm-scroll-x">
          <table className="farm-table">
            <tbody>
              <tr>
                <td>Operating day opens (clock hours)</td>
                <td className="num"><EditableNumber disabled={locked} value={hoursOf(C.operatingOpenMin.value)} defaultValue={hoursOf(D.operatingOpenMin.value)} onChange={(v) => setCapacity('operatingOpenMin', Math.round(v * 60))} step={0.25} max={24} suffix={`h = ${clock(C.operatingOpenMin.value)}`} ariaLabel="Operating day opens, hours from midnight" showBadge={false} /></td>
                <td><StatusBadge status={D.operatingOpenMin.status} title={D.operatingOpenMin.note} /></td>
              </tr>
              <tr>
                <td>Operating day closes (clock hours)</td>
                <td className="num"><EditableNumber disabled={locked} value={hoursOf(C.operatingCloseMin.value)} defaultValue={hoursOf(D.operatingCloseMin.value)} onChange={(v) => setCapacity('operatingCloseMin', Math.round(v * 60))} step={0.25} max={24} suffix={`h = ${clock(C.operatingCloseMin.value)}`} ariaLabel="Operating day closes, hours from midnight" showBadge={false} /></td>
                <td><StatusBadge status={D.operatingCloseMin.status} title={D.operatingCloseMin.note} /></td>
              </tr>
              <tr>
                <td>Production days per year</td>
                <td className="num">
                  <EditableNumber disabled={locked} value={C.productionDaysPerYear.value} onChange={(v) => setCapacity('productionDaysPerYear', v)} step={5} max={366} suffix="days" ariaLabel="Production days per year" showBadge={false} />
                  {daysTyped && forecastEditing && (
                    <button type="button" className="farm-btn ml-[0.4rem]!" onClick={() => setCapacity('productionDaysPerYear', undefined)}>Count from calendar</button>
                  )}
                </td>
                <td><StatusBadge status={daysTyped ? 'STATED' : 'DERIVED'} title={D.productionDaysPerYear.note} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
