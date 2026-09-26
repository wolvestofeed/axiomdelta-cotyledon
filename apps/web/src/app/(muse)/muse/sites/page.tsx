'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, PreviewBanner, StatusBadge, num } from '../_components/ui';
import { SectionSave } from '../_components/SectionSave';
import { EntityPicker } from '../_components/EntityPicker';
import { useLinkedEntities } from '../_components/useLinkedEntities';
import { EditableNumber } from '../_components/EditableNumber';
import { sites as seedSites } from '../_data/seed-invented';
import { resolveSites, siteSchoolRefs, sitePlacementSummary } from '../_engine/sites';
import { forecastByDeliverySite } from '../_engine/demand';
import { PLACEMENT_LABEL, entityRef } from '../_engine/entity-links';
import { useScenario } from '../_state/scenario-store';

export default function SitesPage() {
  const { resolved, setSite, isSuperAdmin } = useScenario();
  const overlay = resolved.sites;

  const refs = useMemo(() => siteSchoolRefs(overlay), [overlay]);
  const schools = useLinkedEntities(refs);
  const forecastMap = useMemo(() => forecastByDeliverySite(resolved.demand), [resolved.demand]);
  const sites = useMemo(() => resolveSites(seedSites, overlay, schools, forecastMap), [overlay, schools, forecastMap]);
  const placement = sitePlacementSummary(sites);
  const totalForecast = sites.reduce((s, x) => s + x.dailyForecastPortions, 0);

  const linkSchool = (siteId: string, schoolId: string | undefined) =>
    setSite(siteId, (d) => {
      if (schoolId === undefined) delete d.schoolId;
      else d.schoolId = schoolId;
    });

  return (
    <>
      <PageHeader
        title="Sites & Delivery"
        purpose="Keep delivery sites and service windows, and log each shipment’s temperatures."
        functions={['Sites', 'Linked to a school record', 'Total daily forecast', 'Transport control']}
        connects={[
          { href: '/muse/customers', dir: 'from' },
          { href: '/muse/inventory', dir: 'from' },
          { href: '/muse/sustainability/logistics', dir: 'to' },
          { href: '/muse/receivables', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A site&rsquo;s daily portions come from its customer&rsquo;s services and calendar on Customers where a customer is linked, and from the site&rsquo;s own typed figure until then.</li>
            <li>A site linked to a school in the prospect directory becomes that record and carries the school&rsquo;s own address geocode.</li>
            <li>The outbound leg on Logistics is then measured to a real place rather than a county centroid.</li>
            <li>Shipments draw finished lots FIFO.</li>
            <li>Temperature is recorded at load and at delivery (CCP-4).</li>
          </ul>
        }
        status="partial"
      />

      <PreviewBanner>
        Unlinked sites are invented seed placed at their county centroid. Linking a site to a school
        replaces the placeholder placement with the school&apos;s geocode. Shipments and per-shipment
        temperature records land with the schema.
      </PreviewBanner>

      <div className="grid gap-3 mt-4 muse-autofit-11">
        <Kpi value={sites.length} label="Delivery sites" />
        <Kpi value={`${placement.linkedToSchool} / ${placement.total}`} label="Linked to a school record" sub={`${placement.placedFromSchool} placed on the school's own geocode`} />
        <Kpi value={num(totalForecast)} label="Total daily forecast" sub="Portions across all sites" />
        <Kpi value="CCP-4" label="Transport control" sub="41°F or below on arrival" />
      </div>

      <Card title="Sites" className="mt-4">
        <div className="mb-3!">
          <SectionSave sections={['sites']} title="the sites" />
        </div>
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead>
              <tr>
                <th>Site</th><th>School record</th><th>Type</th><th>County</th><th>Service window</th>
                <th className="num">Daily forecast</th><th>Placement</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => {
                const seed = seedSites.find((x) => x.id === s.id);
                return (
                  <tr key={s.id}>
                    <td className="font-medium!">
                      {seed?.name}
                      <div className="muse-mono muse-fs-2xs muse-c-faint">{s.id}</div>
                    </td>
                    <td>
                      <EntityPicker
                        kinds={['school']}
                        linked={s.schoolId ? schools[entityRef('school', s.schoolId)] ?? null : null}
                        canEdit={isSuperAdmin}
                        label="school"
                        ariaLabel={`Link ${seed?.name ?? s.id} to a school in the prospect directory`}
                        placeholder="Search name, location, contact…"
                        onLink={(id) => linkSchool(s.id, id)}
                      />
                    </td>
                    <td className="muse-c-soft">{s.type}</td>
                    <td className="muse-c-soft">{s.county}</td>
                    <td className="muse-c-soft">{s.serviceWindow}</td>
                    <td className="num">
                      {s.forecastFromCustomer ? (
                        <span title="Forecast from the customer site linked to this delivery site">
                          {num(s.dailyForecastPortions)} <Link className="muse-link muse-fs-xs" href="/muse/customers">Customers</Link>
                        </span>
                      ) : (
                      <EditableNumber
                        value={s.dailyForecastPortions}
                        defaultValue={seed?.dailyForecastPortions}
                        onChange={(v) => setSite(s.id, (d) => {
                          if (v === seed?.dailyForecastPortions) delete d.dailyForecastPortions;
                          else d.dailyForecastPortions = v;
                        })}
                        step={10}
                        ariaLabel={`${seed?.name ?? s.id} daily forecast portions`}
                        showBadge={false}
                      />
                      )}
                    </td>
                    <td className="muse-fs-xs">
                      {s.placement.source === null ? (
                        <span className="muse-c-faint">No coordinates on file</span>
                      ) : s.placement.fromLinkedSchool ? (
                        <span className="muse-pill ok">{PLACEMENT_LABEL[s.placement.source]}</span>
                      ) : (
                        <StatusBadge status="PLACEHOLDER" title={PLACEMENT_LABEL[s.placement.source]} />
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="total"><td colSpan={5}>Total daily forecast</td><td className="num">{num(totalForecast)}</td><td /></tr>
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2">
          The school directory is the <Link className="muse-link" href="/muse/sales">Sales</Link> prospect
          list, so a delivery site and a prospect are the same record seen from two sides. Placement feeds
          the outbound legs on{' '}
          <Link className="muse-link" href="/muse/sustainability/logistics">Logistics</Link>; the link and
          the forecast are part of the forecast and are saved with it.
        </p>
      </Card>
    </>
  );
}
