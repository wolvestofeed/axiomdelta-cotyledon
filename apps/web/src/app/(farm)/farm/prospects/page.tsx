import { PageControls } from '../_components/PageControls';
import Link from 'next/link';
import { PageHeader, Kpi, Notice, num } from '../_components/ui';
import { prospectDataset, PROSPECT_STATUSES, type ProspectSegment } from '../_data/prospects';
import { queryProspects, pipelineStats, prospectRecords } from '../_engine/prospects';
import { getResolvedActiveInputs } from '../_lib/scenarios';
import { FARM_HOME } from '../_data/farm-location';
import ProspectsCRM from '../_components/ProspectsCRM';
import type { ClientProspect } from '../_engine/prospects-crm';

type SP = Promise<{ segment?: string; status?: string; q?: string }>;

const SEGMENTS: Array<{ value: ProspectSegment | 'all'; label: string }> = [
  { value: 'all', label: 'All segments' },
  { value: 'charter', label: 'Public charter' },
  { value: 'private-tier1', label: 'Private — Tier 1' },
  { value: 'private-tier2', label: 'Private — Tier 2 / Micro' },
];

export default async function SalesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const segment = (['charter', 'private-tier1', 'private-tier2', 'all'].includes(sp.segment ?? '')
    ? sp.segment
    : 'all') as ProspectSegment | 'all';
  const status = PROSPECT_STATUSES.includes(sp.status as never) ? (sp.status as string) : 'all';
  const q = sp.q ?? '';

  const filtered = queryProspects(prospectRecords, { segment, status, q });
  const stats = pipelineStats(filtered);
  const all = pipelineStats(prospectRecords);

  const clientProspects: ClientProspect[] = filtered.map((s) => ({
    id: s.id,
    segment: s.segment,
    segmentLabel: s.segmentLabel,
    name: s.name,
    location: s.location,
    model: s.model,
    phone: s.phone,
    email: s.email,
    website: s.website,
    pointOfContact: s.pointOfContact,
    firstContact: s.firstContact,
    status: s.status,
    headcountRaw: s.headcountRaw,
    headcount: s.headcount,
    grades: s.grades,
    currentProgram: s.currentProgram,
    paymentModel: s.paymentModel,
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    geoSource: s.geoSource ?? null,
  }));

  // Quote defaults follow the open forecast: its Subscriptions
  // price and the serving days its Subscriptions subscribers' calendars derive.
  const { inputs, label } = await getResolvedActiveInputs();
  const prospectPhase = inputs.phases.find((p) => p.phase === 1)!;
  const quoteDefaults = { pricePerUnit: prospectPhase.pricePerUnit, servingDays: prospectPhase.operatingDays, forecastLabel: label };

  return (
    <>
      <PageHeader
        title="CRM"
        purpose="Work each prospect prospect from first contact to quote and scope of work."
        functions={['Directory', 'Map', 'Prospect workspace', 'Quote of service', 'Scope of work']}
        connects={[
          { href: '/farm/subscribers', dir: 'to' },
          { href: '/farm/pickup-points', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The market is Austin metro K-12 independent and charter prospects.</li>
            <li>The directory is the operator&rsquo;s own prospect list.</li>
            <li>The prospect workspace holds needs, communications, a quote-of-service calculator and a scope-of-work draft.</li>
          </ul>
        }
        status="partial"
      />

      <Notice title="Operator prospect list — internal CRM seed">
        Compiled from {prospectDataset.source.name} (as of {prospectDataset.source.dataAsOf}).{' '}
        {num(all.total)} prospects: {num(prospectDataset.counts.charter)} public charter,{' '}
        {num(prospectDataset.counts.tier1)} Tier 1 private, {num(prospectDataset.counts.tier2)} Tier 2 /
        micro. Subscriber status, contacts, and notes are read-only in this version — editing and
        saving arrive with the CRM data store.
      </Notice>

      {/* Universe */}
      <div className="grid gap-3 mt-4 farm-autofit-11">
        <Kpi value={num(all.total)} label="Total prospects" sub="Austin metro K-12, private + charter" />
        <Kpi value={num(prospectDataset.counts.charter)} label="Public charter" sub="Open-enrollment" />
        <Kpi value={num(prospectDataset.counts.tier1)} label="Private — Tier 1" sub="High enrollment / traditional" />
        <Kpi value={num(prospectDataset.counts.tier2)} label="Private — Tier 2 / Micro" sub="Sub-250 / specialty" />
      </div>

      {/* Pipeline — current view */}
      <div className="farm-card-title mt-4 mb-2!">Pipeline — current view</div>
      <div className="grid gap-3 farm-autofit-10">
        <Kpi value={num(stats.byStatus['Lead'] ?? 0)} label="Leads" />
        <Kpi value={num(stats.byStatus['In Talks'] ?? 0)} label="In talks" />
        <Kpi value={num(stats.byStatus['Negotiating'] ?? 0)} label="Negotiating" />
        <Kpi value={num(stats.byStatus['Signed - Active'] ?? 0)} label="Signed — active" />
      </div>

      <PageControls>
      <form method="GET">
        <label className="farm-kpi-sub inline-flex items-center gap-2">
          Segment
          <select name="segment" defaultValue={segment} className="farm-select">
            {SEGMENTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="farm-kpi-sub inline-flex items-center gap-2">
          Status
          <select name="status" defaultValue={status} className="farm-select">
            <option value="all">Any status</option>
            {PROSPECT_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <input name="q" defaultValue={q} placeholder="Name, location, contact…" aria-label="Name, location or contact" className="farm-input w-44!" />
        <button type="submit" className="farm-btn ghost">Filter</button>
        <Link href="/farm/sales" className="farm-link farm-fs-xs">Reset</Link>
      </form>
      </PageControls>

      <ProspectsCRM prospects={clientProspects} totalInView={stats.total} quoteDefaults={quoteDefaults} home={FARM_HOME} />
    </>
  );
}
