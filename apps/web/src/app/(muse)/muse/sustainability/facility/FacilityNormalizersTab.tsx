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
  const operatingDays = basis.deliveryDays;
  const n = normalize(food.referenceKg, { meals: food.totalMeals, sqFt: facility.sizeSqFt.value, operatingDays });
  const derivedGross = view.requirement.phases[view.requirement.phases.length - 1]!.buildingGrossSqFt;
  const nDerived = normalize(food.referenceKg, { meals: food.totalMeals, sqFt: derivedGross, operatingDays });

  return (
    <>
      <SustainabilityWorldNote world={world} />

      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={<TaggedValue t={facility.sizeSqFt} render={(v) => num(v)} />} label="Facility, as stated" sub="The denominator in use" />
        <Kpi value={<span className="inline-flex items-center gap-2">{num(Math.round(derivedGross))} <span className="muse-c-faint">sq ft</span><StatusBadge status="DERIVED" title="Building gross, cumulative through Phase 3, from the equipment library (Space tab)" /></span>} label="Facility, derived" sub="Full-build building gross from the library" />
        <Kpi value={num(food.totalMeals)} label="Meals delivered" sub={world.periodLabel} />
        <Kpi value={num(operatingDays)} label="Operating days" sub="Dates with a delivery" />
        <Kpi value={`${(food.referenceKg / 1000).toFixed(1)} t`} label="Food footprint" sub="Scope 3 purchased food, reference basis" />
      </div>

      <Card title="Denominators" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead>
              <tr><th>Channel</th><th className="num">Meals delivered</th><th className="num">Food, t CO2e</th><th className="num">kg CO2e per meal</th></tr>
            </thead>
            <tbody>
              {food.byChannel.length === 0 && <tr><td colSpan={4} className="muse-c-soft">{world.isPlan ? 'The forecast delivers no meals in its first year.' : `No delivery is on record in ${basis.from.slice(0, 4)}.`}</td></tr>}
              {food.byChannel.map((c) => (
                <tr key={c.channel}>
                  <td className="font-medium!">{marketOf.get(c.channel) ?? `Channel ${c.channel}`}</td>
                  <td className="num">{num(c.meals)}</td>
                  <td className="num">{(c.referenceKg / 1000).toFixed(2)}</td>
                  <td className="num">{c.meals > 0 ? (c.referenceKg / c.meals).toFixed(2) : '—'}</td>
                </tr>
              ))}
              <tr className="total"><td>All channels</td><td className="num">{num(food.totalMeals)}</td><td className="num">{(food.referenceKg / 1000).toFixed(2)}</td><td className="num">{food.totalMeals > 0 ? (food.referenceKg / food.totalMeals).toFixed(2) : '—'}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2">
          {world.isPlan ? <>Meals come from the forecast&rsquo;s customers, services and meal plans on <Link className="muse-link" href="/muse/customers">Customers</Link>.</> : <>Meals come from the deliveries on record on <Link className="muse-link" href="/muse/orders">Orders</Link>.</>} Each meal is footprinted on its own recipe at its channel&rsquo;s portion.
        </p>
      </Card>

      <Card title="Intensity of the annual food footprint" className="mt-4">
        <div className="grid gap-3 muse-autofit-11">
          <Kpi value={`${(n.kgPerMeal ?? 0).toFixed(2)} kg`} label="CO2e per meal" sub="Across the recipes delivered" />
          <Kpi value={`${(n.kgPerSqFt ?? 0).toFixed(0)} kg`} label="CO2e per sq ft / yr" sub={`Food only, on the stated ${num(facility.sizeSqFt.value)} sq ft`} />
          <Kpi value={`${(nDerived.kgPerSqFt ?? 0).toFixed(0)} kg`} label="CO2e per sq ft / yr" sub={`Food only, on the derived ${num(Math.round(derivedGross))} sq ft`} />
          <Kpi value={`${((n.kgPerOperatingDay ?? 0) / 1000).toFixed(2)} t`} label="CO2e per operating day" sub="Food only" />
        </div>
        <p className="muse-kpi-sub mt-3">
          Food only. Fuel, electricity, refrigerants and water are on their own pages{world.isPlan ? ', from the quantities loaded into the forecast' : ', from the bills and service records on file'}; the statement on Inventory &amp; Audit carries every scope. Every per-square-foot intensity on those pages still divides by the stated figure; the derived figure is shown here so the two can be read side by side. Food factors: <Cite p={foodFactorSource} />.
        </p>
      </Card>
    </>
  );
}
