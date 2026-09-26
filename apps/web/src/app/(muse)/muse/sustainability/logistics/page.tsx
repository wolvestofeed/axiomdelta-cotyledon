'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, PreviewBanner, StatusBadge, num } from '../../_components/ui';
import { Cite } from '../../_components/Cite';
import { sites as seedSites } from '../../_data/seed-invented';
import { MUSE_HOME } from '../../_data/muse-location';
import { freightFactorSmartWay } from '../../_data/emission-factors';
import { outboundLogistics } from '../../_engine/carbon';
import { inboundLogistics } from '../../_engine/supplier-links';
import { resolveSites, siteSchoolRefs, sitePlacementSummary } from '../../_engine/sites';
import { mixShippedMassPerMealKg, receivedMassKg } from '../../_engine/sustainability-basis';
import { useSustainabilityWorld } from '../../_state/sustainability';
import { SustainabilityWorldNote } from '../../_components/ledger/SustainabilityWorldNote';
import { PLACEMENT_LABEL } from '../../_engine/entity-links';
import { useLinkedSuppliers } from '../../_components/useLinkedSuppliers';
import { useLinkedEntities } from '../../_components/useLinkedEntities';
import { useScenario } from '../../_state/scenario-store';

export default function LogisticsPage() {
  const { resolved } = useScenario();
  const world = useSustainabilityWorld();
  const { basis } = world;
  // Shipped mass per meal across the recipes delivered in the period (Roadmap N6 slice 4).
  const shipped = useMemo(() => mixShippedMassPerMealKg(basis, resolved.recipes, world.pfByChannel), [basis, resolved.recipes, world.pfByChannel]);
  const links = resolved.sustainability.ingredientSupplier;
  const suppliers = useLinkedSuppliers(links);
  const inbound = useMemo(() => ({ day: inboundLogistics(receivedMassKg(basis), links, suppliers, MUSE_HOME) }), [basis, links, suppliers]);
  // Outbound legs are measured to the site's resolved placement: a school's own
  // geocode where the site is linked to one, the county centroid otherwise.
  const schoolRefs = useMemo(() => siteSchoolRefs(resolved.sites), [resolved.sites]);
  const schools = useLinkedEntities(schoolRefs);
  // Each site carries the meals delivered to it in the period; a site with none carries zero.
  const mealsBySite = useMemo(() => Object.fromEntries(seedSites.map((x) => [x.id, basis.bySite.filter((b) => b.siteId === x.id).reduce((t, b) => t + b.meals, 0)])), [basis]);
  const unplacedMeals = basis.bySite.filter((b) => !b.siteId || !seedSites.some((x) => x.id === b.siteId)).reduce((t, b) => t + b.meals, 0);
  const sites = useMemo(() => resolveSites(seedSites, resolved.sites, schools, mealsBySite), [resolved.sites, schools, mealsBySite]);
  const placement = sitePlacementSummary(sites);
  const byId = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const out = useMemo(
    () =>
      outboundLogistics(
        sites.map((s) => ({
          id: s.id,
          name: s.name,
          county: s.county,
          dailyForecastPortions: s.dailyForecastPortions,
          coords: s.placement.lat !== null && s.placement.lng !== null ? { lat: s.placement.lat, lng: s.placement.lng } : null,
        })),
        MUSE_HOME,
        shipped,
      ),
    [sites, shipped],
  );

  return (
    <>
      <PageHeader
        title="Logistics"
        purpose="Measure freight ton-miles in from suppliers and out to delivery sites."
        functions={['Inbound', 'Outbound', 'Ton-miles', 'Shipped mass']}
        connects={[
          { href: '/muse/recipes', dir: 'from' },
          { href: '/muse/sites', dir: 'from' },
          { href: '/muse/sustainability/inventory', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Inbound ton-miles run from each linked supplier to the kitchen for the period&rsquo;s receipts.</li>
            <li>Outbound ton-miles run from the kitchen to each delivery site for the period&rsquo;s deliveries.</li>
            <li>Both directions use the SmartWay average truck factor.</li>
            <li>Both are measured to a linked record: a supplier linked on a recipe line, a school linked to a delivery site.</li>
          </ul>
        }
        status="partial"
      />

      <SustainabilityWorldNote world={world}>
        {unplacedMeals > 0 && <div className="mt-1">{num(unplacedMeals)} meals went to a delivery site not on the site list: not in the outbound legs.</div>}
      </SustainabilityWorldNote>

      <PreviewBanner>
        {placement.placedFromSchool > 0
          ? `${placement.placedFromSchool} of ${placement.total} delivery sites are placed on their linked school's own geocode; the remaining ${placement.total - placement.placedFromSchool} sit at a county centroid and are placeholder precision.`
          : 'Delivery sites are invented seed placed at their county centroid until each is linked to a school record on Sites & Delivery. The kitchen pin is approximate; suppliers sit at ZIP or county centroids. Payload masses and the freight factor are real.'}
      </PreviewBanner>

      <Card title={`Inbound — receipts, ${world.periodLabel}`} className="mt-4">
        <div className="grid gap-3 muse-autofit-11">
          <Kpi value={`${inbound.day.linesLinked} / ${inbound.day.legs.length}`} label="Lines linked to a supplier" sub={`${inbound.day.linesPlaced} placed on the map`} />
          <Kpi value={inbound.day.totalTonMiles.toFixed(1)} label="Ton-miles, inbound" sub="Laden leg, placed lines" />
          <Kpi value={`${inbound.day.totalKgCo2e.toFixed(1)} kg`} label="CO2e, inbound" sub="SmartWay average" />
        </div>
        <div className="muse-scroll-x mt-3">
          <table className="muse-table">
            <thead><tr><th>Ingredient</th><th>Supplier</th><th className="num">Mass, kg</th><th className="num">Miles one way</th><th className="num">Ton-miles</th><th className="num">kg CO2e</th></tr></thead>
            <tbody>
              {inbound.day.legs.map((l) => (
                <tr key={l.ingredient}>
                  <td className="font-medium!">{l.ingredient}</td>
                  <td className={`${(l.supplierName ? '' : 'muse-c-faint')}`}>
                    {l.supplierName && l.supplierId ? (
                      <Link className="muse-link" href={`/muse/suppliers/${l.supplierId}`}>{l.supplierName}</Link>
                    ) : (
                      'not linked'
                    )}
                    {l.supplierId && !l.placed ? <span className="muse-c-faint"> · no centroid on file</span> : null}
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
        <p className="muse-kpi-sub mt-2">Each line is modelled as its own laden leg from the supplier. Consolidated deliveries and distributor routing are not modelled; the return leg carries no ton-miles.</p>
      </Card>

      <div className="grid gap-3 mt-4 muse-autofit-11">
        <Kpi value={`${(shipped * 1000).toFixed(0)} g`} label="Shipped mass / meal" sub="Chilled hot mass + cold-packed components, across the recipes delivered" />
        <Kpi value={out.totalTonMilesPerDay.toFixed(1)} label="Ton-miles, outbound" sub={`${out.placedSites} placed sites, ${world.periodLabel}`} />
        <Kpi value={`${out.totalKgCo2ePerDay.toFixed(1)} kg`} label="CO2e, outbound" sub="Laden leg at the SmartWay average" />
        <Kpi value={`${(out.kgCo2ePerPortionDelivered * 1000).toFixed(1)} g`} label="CO2e / portion delivered" sub="Placed sites only" />
      </div>

      <Card title="Outbound — delivery legs" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead>
              <tr><th>Site</th><th>School record</th><th className="num">Meals delivered</th><th className="num">Payload, tons</th><th className="num">Miles one way</th><th className="num">Ton-miles</th><th className="num">kg CO2e</th><th>Placement</th></tr>
            </thead>
            <tbody>
              {out.legs.map((l) => (
                <tr key={l.siteId}>
                  <td className="font-medium!">{l.siteName}</td>
                  <td className="muse-c-soft muse-fs-xs">
                    {byId.get(l.siteId)?.schoolName ?? <span className="muse-c-faint">not linked · {l.county} County</span>}
                  </td>
                  <td className="num">{num(l.dailyPortions)}</td>
                  <td className="num">{l.payloadShortTons.toFixed(3)}</td>
                  <td className="num">{l.milesOneWay === null ? '—' : l.milesOneWay.toFixed(1)}</td>
                  <td className="num">{l.tonMiles === null ? '—' : l.tonMiles.toFixed(2)}</td>
                  <td className="num">{l.kgCo2ePerDay === null ? '—' : l.kgCo2ePerDay.toFixed(2)}</td>
                  <td className="muse-fs-xs">
                    {(() => {
                      const pl = byId.get(l.siteId)?.placement;
                      if (!pl || pl.source === null) return <span className="muse-c-faint">No coordinates on file</span>;
                      return pl.fromLinkedSchool
                        ? <span className="muse-pill ok">{PLACEMENT_LABEL[pl.source]}</span>
                        : <StatusBadge status="PLACEHOLDER" title={`${PLACEMENT_LABEL[pl.source]}; site is not linked to a school record`} />;
                    })()}
                  </td>
                </tr>
              ))}
              <tr className="total"><td colSpan={5}>Total, placed sites</td><td className="num">{out.totalTonMilesPerDay.toFixed(2)}</td><td className="num">{out.totalKgCo2ePerDay.toFixed(2)}</td><td /></tr>
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2">
          Factor: {freightFactorSmartWay.gCo2PerTonMile} g CO2 per ton-mile, <Cite p={freightFactorSmartWay.provenance} />, a network average and not this fleet’s own figure. The return leg runs empty and carries no ton-miles; its fuel belongs in Scope 1 mobile combustion once fuel logs exist. A site is linked to its school record on <Link className="muse-link" href="/muse/sites">Sites &amp; Delivery</Link>, which is what replaces a county centroid with the school’s own geocode.
        </p>
      </Card>
    </>
  );
}
