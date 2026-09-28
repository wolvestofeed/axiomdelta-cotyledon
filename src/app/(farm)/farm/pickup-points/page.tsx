'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, PreviewBanner, StatusBadge, num } from '@/components/ui';
import { SectionSave } from '@/components/SectionSave';
import { EntityPicker } from '@/components/EntityPicker';
import { useLinkedEntities } from '@/components/useLinkedEntities';
import { EditableNumber } from '@/components/EditableNumber';
import { pickupPoints as seedPickupPoints } from '@/data/seed-invented';
import { resolvePickupPoints, pickupPointProspectRefs, pickupPointPlacementSummary } from '@/engine/pickup-points';
import { forecastByDistributionPickupPoint } from '@/engine/demand';
import { PLACEMENT_LABEL, entityRef } from '@/engine/entity-links';
import { useScenario } from '@/state/scenario-store';

export default function PickupPointsPage() {
  const { resolved, setPickupPoint, isSuperAdmin } = useScenario();
  const overlay = resolved.pickupPoints;

  const refs = useMemo(() => pickupPointProspectRefs(overlay), [overlay]);
  const prospects = useLinkedEntities(refs);
  const forecastMap = useMemo(() => forecastByDistributionPickupPoint(resolved.demand), [resolved.demand]);
  const pickupPoints = useMemo(() => resolvePickupPoints(seedPickupPoints, overlay, prospects, forecastMap), [overlay, prospects, forecastMap]);
  const placement = pickupPointPlacementSummary(pickupPoints);
  const totalForecast = pickupPoints.reduce((s, x) => s + x.dailyForecastUnits, 0);

  const linkProspect = (pickupPointId: string, prospectId: string | undefined) =>
    setPickupPoint(pickupPointId, (d) => {
      if (prospectId === undefined) delete d.prospectId;
      else d.prospectId = prospectId;
    });

  return (
    <>
      <PageHeader
        title="Pickup Points & Routes"
        purpose="Keep distribution pickup points and service windows, and log each shipment’s temperatures."
        functions={['Pickup points', 'Linked to a prospect record', 'Total daily forecast', 'Transport control']}
        connects={[
          { href: '/farm/subscribers', dir: 'from' },
          { href: '/farm/inventory', dir: 'from' },
          { href: '/farm/sustainability/logistics', dir: 'to' },
          { href: '/farm/receivables', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A pickup point&rsquo;s daily units come from its subscriber&rsquo;s services and calendar on Subscribers where a subscriber is linked, and from the pickup point&rsquo;s own typed figure until then.</li>
            <li>A pickup point linked to a prospect in the prospect directory becomes that record and carries the prospect&rsquo;s own address geocode.</li>
            <li>The outbound leg on Logistics is then measured to a real place rather than a county centroid.</li>
            <li>Shipments draw finished lots FIFO.</li>
            <li>Temperature is recorded at load and at distribution (control-point-4).</li>
          </ul>
        }
        status="partial"
      />

      <PreviewBanner>
        Unlinked pickup points are invented seed placed at their county centroid. Linking a pickup point to a prospect
        replaces the placeholder placement with the prospect&apos;s geocode. Shipments and per-shipment
        temperature records land with the schema.
      </PreviewBanner>

      <div className="grid gap-3 mt-4 farm-autofit-11">
        <Kpi value={pickupPoints.length} label="Distribution pickup points" />
        <Kpi value={`${placement.linkedToProspect} / ${placement.total}`} label="Linked to a prospect record" sub={`${placement.placedFromProspect} placed on the prospect's own geocode`} />
        <Kpi value={num(totalForecast)} label="Total daily forecast" sub="Units across all pickup points" />
        <Kpi value="control-point-4" label="Transport control" sub="41°F or below on arrival" />
      </div>

      <Card title="Pickup points" className="mt-4">
        <div className="mb-3!">
          <SectionSave sections={['pickupPoints']} title="the pickup points" />
        </div>
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr>
                <th>Pickup point</th><th>Prospect record</th><th>Type</th><th>County</th><th>Service window</th>
                <th className="num">Daily forecast</th><th>Placement</th>
              </tr>
            </thead>
            <tbody>
              {pickupPoints.map((s) => {
                const seed = seedPickupPoints.find((x) => x.id === s.id);
                return (
                  <tr key={s.id}>
                    <td className="font-medium!">
                      {seed?.name}
                      <div className="farm-mono farm-fs-2xs farm-c-faint">{s.id}</div>
                    </td>
                    <td>
                      <EntityPicker
                        kinds={['prospect']}
                        linked={s.prospectId ? prospects[entityRef('prospect', s.prospectId)] ?? null : null}
                        canEdit={isSuperAdmin}
                        label="prospect"
                        ariaLabel={`Link ${seed?.name ?? s.id} to a prospect in the prospect directory`}
                        placeholder="Search name, location, contact…"
                        onLink={(id) => linkProspect(s.id, id)}
                      />
                    </td>
                    <td className="farm-c-soft">{s.type}</td>
                    <td className="farm-c-soft">{s.county}</td>
                    <td className="farm-c-soft">{s.serviceWindow}</td>
                    <td className="num">
                      {s.forecastFromSubscriber ? (
                        <span title="Forecast from the subscriber pickup point linked to this distribution pickup point">
                          {num(s.dailyForecastUnits)} <Link className="farm-link farm-fs-xs" href="/farm/subscribers">Subscribers</Link>
                        </span>
                      ) : (
                      <EditableNumber
                        value={s.dailyForecastUnits}
                        defaultValue={seed?.dailyForecastUnits}
                        onChange={(v) => setPickupPoint(s.id, (d) => {
                          if (v === seed?.dailyForecastUnits) delete d.dailyForecastUnits;
                          else d.dailyForecastUnits = v;
                        })}
                        step={10}
                        ariaLabel={`${seed?.name ?? s.id} daily forecast units`}
                        showBadge={false}
                      />
                      )}
                    </td>
                    <td className="farm-fs-xs">
                      {s.placement.source === null ? (
                        <span className="farm-c-faint">No coordinates on file</span>
                      ) : s.placement.fromLinkedProspect ? (
                        <span className="farm-pill ok">{PLACEMENT_LABEL[s.placement.source]}</span>
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
        <p className="farm-kpi-sub mt-2">
          The prospect directory is the <Link className="farm-link" href="/farm/sales">Sales</Link> prospect
          list, so a distribution pickup point and a prospect are the same record seen from two sides. Placement feeds
          the outbound legs on{' '}
          <Link className="farm-link" href="/farm/sustainability/logistics">Logistics</Link>; the link and
          the forecast are part of the forecast and are saved with it.
        </p>
      </Card>
    </>
  );
}
