'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, CheckPill, StatusBadge, num, pct } from '../../_components/ui';
import { Cite } from '../../_components/Cite';
import { warmFoodWaste } from '../../_data/emission-factors';
import { KG_PER_SHORT_TON, warmNet } from '../../_engine/carbon';
import { expiredMassKg, mixShrinkKg } from '../../_engine/sustainability-basis';
import { useScenario } from '../../_state/scenario-store';
import { useSustainabilityWorld } from '../../_state/sustainability';
import { SustainabilityWorldNote } from '../../_components/ledger/SustainabilityWorldNote';
import { SectionSave } from '../../_components/SectionSave';

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

  // The period's shrink on production, recipe by recipe (Roadmap N6 slice 4).
  const produced = useMemo(() => mixShrinkKg(basis, resolved.recipes, A.yield.shrinkAllowance.value), [basis, resolved.recipes, A.yield.shrinkAllowance.value]);
  const apMass = produced.portions > 0 ? produced.apKg / produced.portions : 0;
  const shrink = { annualKg: produced.kg, annualShortTons: produced.kg / KG_PER_SHORT_TON };
  const net = useMemo(() => warmNet(shrink.annualShortTons, compostShare), [shrink.annualShortTons, compostShare]);
  const allLandfill = useMemo(() => warmNet(shrink.annualShortTons, 0), [shrink.annualShortTons]);
  const allCompost = useMemo(() => warmNet(shrink.annualShortTons, 1), [shrink.annualShortTons]);
  // Finished portions that passed hold life unshipped in the period.
  const expired = useMemo(() => expiredMassKg(basis, resolved.recipes), [basis, resolved.recipes]);

  return (
    <>
      <PageHeader
        title="Waste & End-of-Life"
        purpose="Measure food waste from production, and landfill against compost."
        functions={['Shrink allowance', 'Shrink mass', 'All to landfill', 'All to compost', 'Past hold life']}
        connects={[
          { href: '/muse/production-planning', dir: 'from' },
          { href: '/muse/sustainability/inventory', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Both figures come out of the period&rsquo;s production without any new input.</li>
            <li>Shrink is the allowance on every batch, as a mass of trim, over-portioning and spoilage.</li>
            <li>Expired portions are the finished portions that passed hold life before they shipped.</li>
            <li>Each ton diverted from landfill to compost changes the footprint by the WARM factors shown.</li>
          </ul>
        }
        status="live"
      />

      <SustainabilityWorldNote world={world} />

      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={`${(apMass * 1000).toFixed(0)} g`} label="As-purchased food mass / portion" sub={`Mapped ingredients, across ${num(produced.portions)} portions produced`} />
        <Kpi value={pct(A.yield.shrinkAllowance.value, 0)} label="Shrink allowance" sub="Trim, over-portioning, spoilage" />
        <Kpi value={`${shrink.annualShortTons.toFixed(1)} tons`} label="Shrink mass" sub={`${num(shrink.annualKg)} kg, ${world.periodLabel}`} />
        <Kpi value={<CheckPill ok={expired.portions <= 1e-9} okLabel="NONE" overLabel="EXPIRED" />} label="Past hold life, unshipped" sub={`${num(Math.round(expired.portions))} portions, ${num(expired.kg)} kg`} />
      </div>

      <Card title="Shrink: landfill against compost" className="mt-4">
        {world.isPlan && (
          <div className="mb-3!">
            <SectionSave sections={['sustainability']} title="the compost share" />
          </div>
        )}
        <label className="muse-fs-sm flex! items-center! gap-[0.6rem]! flex-wrap!">
          <span className="muse-kpi-label">Share composted</span>
          <input type="range" min={0} max={1} step={0.05} value={compostShare} disabled={!world.isPlan} onChange={(e) => setCompostShare(Number(e.target.value))} className="w-56!" />
          <strong className="tabular-nums">{pct(compostShare, 0)}</strong>
        </label>
        <div className="muse-scroll-x mt-3">
          <table className="muse-table">
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
        <div className="grid gap-3 mt-3 muse-autofit-11">
          <Kpi value={`${(allLandfill.netKg / 1000).toFixed(2)} t`} label="All to landfill" />
          <Kpi value={`${(allCompost.netKg / 1000).toFixed(2)} t`} label="All to compost" />
          <Kpi value={`${((allLandfill.netKg - allCompost.netKg) / 1000).toFixed(2)} t`} label="Difference between the two" sub={world.periodLabel} />
        </div>
        <p className="muse-kpi-sub mt-2">
          The compost share is part of the forecast, set on Plan and read on Actual, and feeds the inventory statement; it is zero (all landfill) until set. Both WARM factors are unconfirmed until read against the v15 organics documentation; the tag travels with every figure above. Packaging mass is not modelled because the packaging line is carried as a cost, not a weight. Plate waste at sites is not modelled.
        </p>
      </Card>

      <Card title="Finished portions past hold life, unshipped" className="mt-4">
        <div className="grid gap-3 muse-autofit-11">
          <Kpi value={num(Math.round(expired.portions))} label="Portions past hold life" sub={`${A.inventory.chilledHoldLife.value}-day hold life`} />
          <Kpi value={`${expired.kg.toFixed(0)} kg`} label="Shipped mass" sub="Each recipe's own shipped mass per portion" />
        </div>
        {Object.keys(basis.expiredByRecipe).length > 0 && (
          <p className="muse-kpi-sub mt-2">{Object.entries(basis.expiredByRecipe).map(([code, qty]) => `${code} ${num(Math.round(qty))}`).join(' · ')}</p>
        )}
        <p className="muse-kpi-sub mt-2">
          Whole-batch production overshoots demand by design; the overshoot is inventory while inside hold life and waste the moment it is not. Lots are drawn oldest-first by the deliveries through the period&rsquo;s end; a lot counts here when its hold life ends inside the period with portions left. Lot by lot on <Link className="muse-link" href="/muse/inventory">Inventory</Link>.
        </p>
      </Card>
    </>
  );
}
