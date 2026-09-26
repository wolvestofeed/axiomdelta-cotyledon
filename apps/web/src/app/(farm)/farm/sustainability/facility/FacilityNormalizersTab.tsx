'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Card, Kpi, StatusBadge, TaggedValue, num } from '../../_components/ui';
import { Cite } from '../../_components/Cite';
import { facility } from '../../_data/plan-data';
import { foodFactorSource } from '../../_data/emission-factors';
import { normalize } from '../../_engine/carbon';
import { useScenario } from '../../_state/scenario-store';
import { useSustainabilityWorld } from '../../_state/sustainability';
import { SustainabilityWorldNote } from '../../_components/ledger/SustainabilityWorldNote';
import type { FacilityView } from './facility-view';

/**
 * Normalizers: the denominators every intensity metric on the sustainability
 * pages divides by. The square-footage denominator is still the stated shell
 * size in plan data; the derived full-build gross is shown beside it, and
 * Roadmap Q5 (retiring the stated figure) is deferred.
 */
export function FacilityNormalizersTab({ view }: { view: FacilityView }) {
  const { resolved } = useScenario();
  const world = useSustainabilityWorld();
  const { food, basis } = world;
  const marketOf = useMemo(() => new Map(resolved.phases.map((p) => [p.phase, p.market])), [resolved.phases]);
  const operatingDays = basis.distributionDays;
  const n = normalize(food.referenceKg, { units: food.totalUnits, sqFt: facility.sizeSqFt.value, operatingDays });
  const derivedGross = view.requirement.phases[view.requirement.phases.length - 1]!.buildingGrossSqFt;
  const nDerived = normalize(food.referenceKg, { units: food.totalUnits, sqFt: derivedGross, operatingDays });

  return (
    <>
      <SustainabilityWorldNote world={world} />

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={<TaggedValue t={facility.sizeSqFt} render={(v) => num(v)} />} label="Facility, as stated" sub="The denominator in use" />
        <Kpi value={<span className="inline-flex items-center gap-2">{num(Math.round(derivedGross))} <span className="farm-c-faint">sq ft</span><StatusBadge status="DERIVED" title="Building gross, cumulative through Phase 3, from the equipment library (Space tab)" /></span>} label="Facility, derived" sub="Full-build building gross from the library" />
        <Kpi value={num(food.totalUnits)} label="Units distributed" sub={world.periodLabel} />
        <Kpi value={num(operatingDays)} label="Operating days" sub="Dates with a distribution" />
        <Kpi value={`${(food.referenceKg / 1000).toFixed(1)} t`} label="Food footprint" sub="Scope 3 purchased food, reference basis" />
      </div>

      <Card title="Denominators" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr><th>Channel</th><th className="num">Units distributed</th><th className="num">Food, t CO2e</th><th className="num">kg CO2e per unit</th></tr>
            </thead>
            <tbody>
              {food.byChannel.length === 0 && <tr><td colSpan={4} className="farm-c-soft">{world.isPlan ? 'The forecast distributes no units in its first year.' : `No distribution is on record in ${basis.from.slice(0, 4)}.`}</td></tr>}
              {food.byChannel.map((c) => (
                <tr key={c.channel}>
                  <td className="font-medium!">{marketOf.get(c.channel) ?? `Channel ${c.channel}`}</td>
                  <td className="num">{num(c.units)}</td>
                  <td className="num">{(c.referenceKg / 1000).toFixed(2)}</td>
                  <td className="num">{c.units > 0 ? (c.referenceKg / c.units).toFixed(2) : '—'}</td>
                </tr>
              ))}
              <tr className="total"><td>All channels</td><td className="num">{num(food.totalUnits)}</td><td className="num">{(food.referenceKg / 1000).toFixed(2)}</td><td className="num">{food.totalUnits > 0 ? (food.referenceKg / food.totalUnits).toFixed(2) : '—'}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          {world.isPlan ? <>Units come from the forecast&rsquo;s subscribers, services and flat plans on <Link className="farm-link" href="/farm/subscribers">Subscribers</Link>.</> : <>Units come from the distributions on record on <Link className="farm-link" href="/farm/orders">Orders</Link>.</>} Each unit is footprinted on its own cropPlan at its channel&rsquo;s unit.
        </p>
      </Card>

      <Card title="Intensity of the annual food footprint" className="mt-4">
        <div className="grid gap-3 farm-autofit-11">
          <Kpi value={`${(n.kgPerUnit ?? 0).toFixed(2)} kg`} label="CO2e per unit" sub="Across the crop plans distributed" />
          <Kpi value={`${(n.kgPerSqFt ?? 0).toFixed(0)} kg`} label="CO2e per sq ft / yr" sub={`Food only, on the stated ${num(facility.sizeSqFt.value)} sq ft`} />
          <Kpi value={`${(nDerived.kgPerSqFt ?? 0).toFixed(0)} kg`} label="CO2e per sq ft / yr" sub={`Food only, on the derived ${num(Math.round(derivedGross))} sq ft`} />
          <Kpi value={`${((n.kgPerOperatingDay ?? 0) / 1000).toFixed(2)} t`} label="CO2e per operating day" sub="Food only" />
        </div>
        <p className="farm-kpi-sub mt-3">
          Food only. Fuel, electricity, refrigerants and water are on their own pages{world.isPlan ? ', from the quantities loaded into the forecast' : ', from the bills and service records on file'}; the statement on Inventory &amp; Audit carries every scope. Every per-square-foot intensity on those pages still divides by the stated figure; the derived figure is shown here so the two can be read side by side. Input factors: <Cite p={foodFactorSource} />.
        </p>
      </Card>
    </>
  );
}
