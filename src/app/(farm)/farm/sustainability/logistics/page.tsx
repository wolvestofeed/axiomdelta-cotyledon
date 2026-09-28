'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, PreviewBanner, StatusBadge, num } from '@/components/ui';
import { Cite } from '@/components/Cite';
import { pickupPoints as seedPickupPoints } from '@/data/seed-invented';
import { FARM_HOME } from '@/data/farm-location';
import { freightFactorSmartWay } from '@/data/emission-factors';
import { outboundLogistics } from '@/engine/carbon';
import { inboundLogistics } from '@/engine/supplier-links';
import { resolvePickupPoints, pickupPointProspectRefs, pickupPointPlacementSummary } from '@/engine/pickup-points';
import { mixShippedMassPerUnitKg, receivedMassKg } from '@/engine/sustainability-basis';
import { useSustainabilityWorld } from '@/state/sustainability';
import { SustainabilityWorldNote } from '@/components/ledger/SustainabilityWorldNote';
import { PLACEMENT_LABEL } from '@/engine/entity-links';
import { useLinkedSuppliers } from '@/components/useLinkedSuppliers';
import { useLinkedEntities } from '@/components/useLinkedEntities';
import { useScenario } from '@/state/scenario-store';

export default function LogisticsPage() {
  const { resolved } = useScenario();
  const world = useSustainabilityWorld();
  const { basis } = world;
  // Shipped mass per unit across the grow plans distributed in the period (Roadmap N6 slice 4).
  const shipped = useMemo(() => mixShippedMassPerUnitKg(basis, resolved.growPlans, world.pfByChannel), [basis, resolved.growPlans, world.pfByChannel]);
  const links = resolved.sustainability.inputSupplier;
  const suppliers = useLinkedSuppliers(links);
  const inbound = useMemo(() => ({ day: inboundLogistics(receivedMassKg(basis), links, suppliers, FARM_HOME) }), [basis, links, suppliers]);
  // Outbound legs are measured to the pickup point's resolved placement: a prospect's own
  // geocode where the pickup point is linked to one, the county centroid otherwise.
  const prospectRefs = useMemo(() => pickupPointProspectRefs(resolved.pickupPoints), [resolved.pickupPoints]);
  const prospects = useLinkedEntities(prospectRefs);
  // Each pickup point carries the units distributed to it in the period; a pickup point with none carries zero.
  const unitsByPickupPoint = useMemo(() => Object.fromEntries(seedPickupPoints.map((x) => [x.id, basis.byPickupPoint.filter((b) => b.pickupPointId === x.id).reduce((t, b) => t + b.units, 0)])), [basis]);
  const unplacedUnits = basis.byPickupPoint.filter((b) => !b.pickupPointId || !seedPickupPoints.some((x) => x.id === b.pickupPointId)).reduce((t, b) => t + b.units, 0);
  const pickupPoints = useMemo(() => resolvePickupPoints(seedPickupPoints, resolved.pickupPoints, prospects, unitsByPickupPoint), [resolved.pickupPoints, prospects, unitsByPickupPoint]);
  const placement = pickupPointPlacementSummary(pickupPoints);
  const byId = useMemo(() => new Map(pickupPoints.map((s) => [s.id, s])), [pickupPoints]);
  const out = useMemo(
    () =>
      outboundLogistics(
        pickupPoints.map((s) => ({
          id: s.id,
          name: s.name,
          county: s.county,
          dailyForecastUnits: s.dailyForecastUnits,
          coords: s.placement.lat !== null && s.placement.lng !== null ? { lat: s.placement.lat, lng: s.placement.lng } : null,
        })),
        FARM_HOME,
        shipped,
      ),
    [pickupPoints, shipped],
  );

  return (
    <>
      <PageHeader
        title="Logistics"
        purpose="Measure freight ton-miles in from suppliers and out to distribution pickup points."
        functions={['Inbound', 'Outbound', 'Ton-miles', 'Shipped mass']}
        connects={[
          { href: '/farm/grow-plans', dir: 'from' },
          { href: '/farm/pickup-points', dir: 'from' },
          { href: '/farm/sustainability/inventory', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Inbound ton-miles run from each linked supplier to the farm for the period&rsquo;s receipts.</li>
            <li>Outbound ton-miles run from the farm to each distribution pickup point for the period&rsquo;s distributions.</li>
            <li>Both directions use the SmartWay average truck factor.</li>
            <li>Both are measured to a linked record: a supplier linked on a grow plan line, a prospect linked to a distribution pickup point.</li>
          </ul>
        }
        status="partial"
      />

      <SustainabilityWorldNote world={world}>
        {unplacedUnits > 0 && <div className="mt-1">{num(unplacedUnits)} units went to a distribution pickup point not on the pickup point list: not in the outbound legs.</div>}
      </SustainabilityWorldNote>

      <PreviewBanner>
        {placement.placedFromProspect > 0
          ? `${placement.placedFromProspect} of ${placement.total} distribution pickup points are placed on their linked prospect's own geocode; the remaining ${placement.total - placement.placedFromProspect} sit at a county centroid and are placeholder precision.`
          : 'Distribution pickup points are invented seed placed at their county centroid until each is linked to a prospect record on Pickup Points & Routes. The farm pin is approximate; suppliers sit at ZIP or county centroids. Payload masses and the freight factor are real.'}
      </PreviewBanner>

      <Card title={`Inbound — receipts, ${world.periodLabel}`} className="mt-4">
        <div className="grid gap-3 farm-autofit-11">
          <Kpi value={`${inbound.day.linesLinked} / ${inbound.day.legs.length}`} label="Lines linked to a supplier" sub={`${inbound.day.linesPlaced} placed on the map`} />
          <Kpi value={inbound.day.totalTonMiles.toFixed(1)} label="Ton-miles, inbound" sub="Laden leg, placed lines" />
          <Kpi value={`${inbound.day.totalKgCo2e.toFixed(1)} kg`} label="CO2e, inbound" sub="SmartWay average" />
        </div>
        <div className="farm-scroll-x mt-3">
          <table className="farm-table">
            <thead><tr><th>Input</th><th>Supplier</th><th className="num">Mass, kg</th><th className="num">Miles one way</th><th className="num">Ton-miles</th><th className="num">kg CO2e</th></tr></thead>
            <tbody>
              {inbound.day.legs.map((l) => (
                <tr key={l.input}>
                  <td className="font-medium!">{l.input}</td>
                  <td className={`${(l.supplierName ? '' : 'farm-c-faint')}`}>
                    {l.supplierName && l.supplierId ? (
                      <Link className="farm-link" href={`/farm/suppliers/${l.supplierId}`}>{l.supplierName}</Link>
                    ) : (
                      'not linked'
                    )}
                    {l.supplierId && !l.placed ? <span className="farm-c-faint"> · no centroid on file</span> : null}
                  </td>
                  <td className="num">{l.massKg.toFixed(1)}</td>
                  <td className="num">{l.milesOneWay === null ? '—' : l.milesOneWay.toFixed(1)}</td>
                  <td className="num">{l.tonMiles === null ? '—' : l.tonMiles.toFixed(3)}</td>
                  <td className="num">{l.kgCo2e === null ? '—' : l.kgCo2e.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="total"><td colSpan={4}>Total, placed lines</td><td className="num">{inbound.day.totalTonMiles.toFixed(3)}</td><td className="num">{inbound.day.totalKgCo2e.toFixed(2)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">Each line is modelled as its own laden leg from the supplier. Consolidated distributions and distributor routing are not modelled; the return leg carries no ton-miles.</p>
      </Card>

      <div className="grid gap-3 mt-4 farm-autofit-11">
        <Kpi value={`${(shipped * 1000).toFixed(0)} g`} label="Shipped mass / unit" sub="Blackout hot mass + cold-packed components, across the grow plans distributed" />
        <Kpi value={out.totalTonMilesPerDay.toFixed(1)} label="Ton-miles, outbound" sub={`${out.placedPickupPoints} placed pickup points, ${world.periodLabel}`} />
        <Kpi value={`${out.totalKgCo2ePerDay.toFixed(1)} kg`} label="CO2e, outbound" sub="Laden leg at the SmartWay average" />
        <Kpi value={`${(out.kgCo2ePerUnitDistributed * 1000).toFixed(1)} g`} label="CO2e / unit distributed" sub="Placed pickup points only" />
      </div>

      <Card title="Outbound — distribution legs" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr><th>Pickup point</th><th>Prospect record</th><th className="num">Units distributed</th><th className="num">Payload, tons</th><th className="num">Miles one way</th><th className="num">Ton-miles</th><th className="num">kg CO2e</th><th>Placement</th></tr>
            </thead>
            <tbody>
              {out.legs.map((l) => (
                <tr key={l.pickupPointId}>
                  <td className="font-medium!">{l.pickupPointName}</td>
                  <td className="farm-c-soft farm-fs-xs">
                    {byId.get(l.pickupPointId)?.prospectName ?? <span className="farm-c-faint">not linked · {l.county} County</span>}
                  </td>
                  <td className="num">{num(l.dailyUnits)}</td>
                  <td className="num">{l.payloadShortTons.toFixed(3)}</td>
                  <td className="num">{l.milesOneWay === null ? '—' : l.milesOneWay.toFixed(1)}</td>
                  <td className="num">{l.tonMiles === null ? '—' : l.tonMiles.toFixed(2)}</td>
                  <td className="num">{l.kgCo2ePerDay === null ? '—' : l.kgCo2ePerDay.toFixed(2)}</td>
                  <td className="farm-fs-xs">
                    {(() => {
                      const pl = byId.get(l.pickupPointId)?.placement;
                      if (!pl || pl.source === null) return <span className="farm-c-faint">No coordinates on file</span>;
                      return pl.fromLinkedProspect
                        ? <span className="farm-pill ok">{PLACEMENT_LABEL[pl.source]}</span>
                        : <StatusBadge status="PLACEHOLDER" title={`${PLACEMENT_LABEL[pl.source]}; pickup point is not linked to a prospect record`} />;
                    })()}
                  </td>
                </tr>
              ))}
              <tr className="total"><td colSpan={5}>Total, placed pickup points</td><td className="num">{out.totalTonMilesPerDay.toFixed(2)}</td><td className="num">{out.totalKgCo2ePerDay.toFixed(2)}</td><td /></tr>
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          Factor: {freightFactorSmartWay.gCo2PerTonMile} g CO2 per ton-mile, <Cite p={freightFactorSmartWay.provenance} />, a network average and not this fleet’s own figure. The return leg runs empty and carries no ton-miles; its fuel belongs in Scope 1 mobile combustion once fuel logs exist. A pickup point is linked to its prospect record on <Link className="farm-link" href="/farm/pickup-points">Pickup Points &amp; Routes</Link>, which is what replaces a county centroid with the prospect’s own geocode.
        </p>
      </Card>
    </>
  );
}
