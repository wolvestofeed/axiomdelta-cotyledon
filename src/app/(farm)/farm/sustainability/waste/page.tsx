'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, CheckPill, StatusBadge, num, pct } from '@/components/ui';
import { Cite } from '@/components/Cite';
import { warmFoodWaste } from '@/data/emission-factors';
import { KG_PER_SHORT_TON, warmNet } from '@/engine/carbon';
import { expiredMassKg, mixShrinkKg } from '@/engine/sustainability-basis';
import { useScenario } from '@/state/scenario-store';
import { useSustainabilityWorld } from '@/state/sustainability';
import { SustainabilityWorldNote } from '@/components/ledger/SustainabilityWorldNote';
import { SectionSave } from '@/components/SectionSave';

export default function WastePage() {
  const { resolved, setSustainability } = useScenario();
  const world = useSustainabilityWorld();
  const { basis } = world;
  const compostShare = resolved.sustainability.waste.compostShare;
  const setCompostShare = (v: number) =>
    setSustainability((d) => {
      const w = (d.waste ??= {});
      if (v === 0) delete w.compostShare;
      else w.compostShare = v;
    });
  const A = resolved.assumptions;

  // The period's shrink on production, grow plan by grow plan (Roadmap N6 slice 4).
  const produced = useMemo(() => mixShrinkKg(basis, resolved.growPlans, A.yield.shrinkAllowance.value), [basis, resolved.growPlans, A.yield.shrinkAllowance.value]);
  const seedMass = produced.units > 0 ? produced.seedKg / produced.units : 0;
  const shrink = { annualKg: produced.kg, annualShortTons: produced.kg / KG_PER_SHORT_TON };
  const net = useMemo(() => warmNet(shrink.annualShortTons, compostShare), [shrink.annualShortTons, compostShare]);
  const allLandfill = useMemo(() => warmNet(shrink.annualShortTons, 0), [shrink.annualShortTons]);
  const allCompost = useMemo(() => warmNet(shrink.annualShortTons, 1), [shrink.annualShortTons]);
  // Finished units that passed shelf life unshipped in the period.
  const expired = useMemo(() => expiredMassKg(basis, resolved.growPlans), [basis, resolved.growPlans]);

  return (
    <>
      <PageHeader
        title="Waste & End-of-Life"
        purpose="Measure food waste from production, and landfill against compost."
        functions={['Shrink allowance', 'Shrink mass', 'All to landfill', 'All to compost', 'Past shelf life']}
        connects={[
          { href: '/farm/production-planning', dir: 'from' },
          { href: '/farm/sustainability/inventory', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Both figures come out of the period&rsquo;s production without any new input.</li>
            <li>Shrink is the allowance on every sowing, as a mass of trim, over-packing and spoilage.</li>
            <li>Expired units are the finished units that passed shelf life before they shipped.</li>
            <li>Each ton diverted from landfill to compost changes the footprint by the WARM factors shown.</li>
          </ul>
        }
        status="live"
      />

      <SustainabilityWorldNote world={world} />

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={`${(seedMass * 1000).toFixed(0)} g`} label="As-purchased food mass / unit" sub={`Mapped inputs, across ${num(produced.units)} units produced`} />
        <Kpi value={pct(A.yield.shrinkAllowance.value, 0)} label="Shrink allowance" sub="Trim, over-packing, spoilage" />
        <Kpi value={`${shrink.annualShortTons.toFixed(1)} tons`} label="Shrink mass" sub={`${num(shrink.annualKg)} kg, ${world.periodLabel}`} />
        <Kpi value={<CheckPill ok={expired.units <= 1e-9} okLabel="NONE" overLabel="EXPIRED" />} label="Past shelf life, unshipped" sub={`${num(Math.round(expired.units))} units, ${num(expired.kg)} kg`} />
      </div>

      <Card title="Shrink: landfill against compost" className="mt-4">
        {world.isPlan && (
          <div className="mb-3!">
            <SectionSave sections={['sustainability']} title="the compost share" />
          </div>
        )}
        <label className="farm-fs-sm flex! items-center! gap-[0.6rem]! flex-wrap!">
          <span className="farm-kpi-label">Share composted</span>
          <input type="range" min={0} max={1} step={0.05} value={compostShare} disabled={!world.isPlan} onChange={(e) => setCompostShare(Number(e.target.value))} className="w-56!" />
          <strong className="tabular-nums">{pct(compostShare, 0)}</strong>
        </label>
        <div className="farm-scroll-x mt-3">
          <table className="farm-table">
            <thead>
              <tr><th>Pathway</th><th className="num">Short tons</th><th className="num">Factor, t CO2e / ton</th><th className="num">t CO2e</th><th>Factor status</th></tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-medium!">Landfill</td>
                <td className="num">{(shrink.annualShortTons * (1 - compostShare)).toFixed(1)}</td>
                <td className="num"><span className="inline-flex items-center gap-2">{warmFoodWaste.landfill.mtco2ePerShortTon.toFixed(2)} <Cite p={warmFoodWaste.landfill.provenance} /></span></td>
                <td className="num">{(net.landfillKg / 1000).toFixed(2)}</td>
                <td><StatusBadge status={warmFoodWaste.landfill.provenance.status} title={warmFoodWaste.landfill.provenance.note} /></td>
              </tr>
              <tr>
                <td className="font-medium!">Compost</td>
                <td className="num">{(shrink.annualShortTons * compostShare).toFixed(1)}</td>
                <td className="num"><span className="inline-flex items-center gap-2">{warmFoodWaste.compost.mtco2ePerShortTon.toFixed(2)} <Cite p={warmFoodWaste.compost.provenance} /></span></td>
                <td className="num">{(net.compostKg / 1000).toFixed(2)}</td>
                <td><StatusBadge status={warmFoodWaste.compost.provenance.status} title={warmFoodWaste.compost.provenance.note} /></td>
              </tr>
              <tr className="total"><td colSpan={3}>Net at this split</td><td className="num">{(net.netKg / 1000).toFixed(2)}</td><td /></tr>
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 mt-3 farm-autofit-11">
          <Kpi value={`${(allLandfill.netKg / 1000).toFixed(2)} t`} label="All to landfill" />
          <Kpi value={`${(allCompost.netKg / 1000).toFixed(2)} t`} label="All to compost" />
          <Kpi value={`${((allLandfill.netKg - allCompost.netKg) / 1000).toFixed(2)} t`} label="Difference between the two" sub={world.periodLabel} />
        </div>
        <p className="farm-kpi-sub mt-2">
          The compost share is part of the forecast, set on Plan and read on Actual, and feeds the inventory statement; it is zero (all landfill) until set. Both WARM factors are unconfirmed until read against the v15 organics documentation; the tag travels with every figure above. Packaging mass is not modelled because the packaging line is carried as a cost, not a weight. Pack waste at pickupPoints is not modelled.
        </p>
      </Card>

      <Card title="Finished units past shelf life, unshipped" className="mt-4">
        <div className="grid gap-3 farm-autofit-11">
          <Kpi value={num(Math.round(expired.units))} label="Units past shelf life" sub={`${A.inventory.blackoutShelfLife.value}-day shelf life`} />
          <Kpi value={`${expired.kg.toFixed(0)} kg`} label="Shipped mass" sub="Each grow plan's own shipped mass per unit" />
        </div>
        {Object.keys(basis.expiredByGrowPlan).length > 0 && (
          <p className="farm-kpi-sub mt-2">{Object.entries(basis.expiredByGrowPlan).map(([code, qty]) => `${code} ${num(Math.round(qty))}`).join(' · ')}</p>
        )}
        <p className="farm-kpi-sub mt-2">
          Whole-sowing production overshoots demand by design; the overshoot is inventory while inside shelf life and waste the moment it is not. Lots are drawn oldest-first by the distributions through the period&rsquo;s end; a lot counts here when its shelf life ends inside the period with units left. Lot by lot on <Link className="farm-link" href="/farm/inventory">Inventory</Link>.
        </p>
      </Card>
    </>
  );
}
