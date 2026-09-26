import { PageControls } from '../_components/PageControls';
import Link from 'next/link';
import { PageHeader, Kpi, Notice, num } from '../_components/ui';
import { schoolDataset, SCHOOL_STATUSES, type SchoolSegment } from '../_data/schools';
import { querySchools, pipelineStats, schoolRecords } from '../_engine/schools';
import { getResolvedActiveInputs } from '../_lib/scenarios';
import { MUSE_HOME } from '../_data/muse-location';
import SchoolsCRM from '../_components/SchoolsCRM';
import type { ClientSchool } from '../_engine/schools-crm';

type SP = Promise<{ segment?: string; status?: string; q?: string }>;

const SEGMENTS: Array<{ value: SchoolSegment | 'all'; label: string }> = [
  { value: 'all', label: 'All segments' },
  { value: 'charter', label: 'Public charter' },
  { value: 'private-tier1', label: 'Private — Tier 1' },
  { value: 'private-tier2', label: 'Private — Tier 2 / Micro' },
];

export default async function SalesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const segment = (['charter', 'private-tier1', 'private-tier2', 'all'].includes(sp.segment ?? '')
    ? sp.segment
    : 'all') as SchoolSegment | 'all';
  const status = SCHOOL_STATUSES.includes(sp.status as never) ? (sp.status as string) : 'all';
  const q = sp.q ?? '';

  const filtered = querySchools(schoolRecords, { segment, status, q });
  const stats = pipelineStats(filtered);
  const all = pipelineStats(schoolRecords);

  const clientSchools: ClientSchool[] = filtered.map((s) => ({
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
    studentsRaw: s.studentsRaw,
    students: s.students,
    grades: s.grades,
    foodProgram: s.foodProgram,
    parentPay: s.parentPay,
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    geoSource: s.geoSource ?? null,
  }));

  // Quote defaults follow the open forecast (Roadmap N6 slice 4, Robert 2026-09-16): its School lunches
  // price and the serving days its School lunches customers' calendars derive.
  const { inputs, label } = await getResolvedActiveInputs();
  const schoolPhase = inputs.phases.find((p) => p.phase === 1)!;
  const quoteDefaults = { pricePerMeal: schoolPhase.pricePerMeal, servingDays: schoolPhase.operatingDays, forecastLabel: label };

  return (
    <>
      <PageHeader
        title="CRM"
        purpose="Work each school prospect from first contact to quote and scope of work."
        functions={['Directory', 'Map', 'School workspace', 'Quote of service', 'Scope of work']}
        connects={[
          { href: '/muse/customers', dir: 'to' },
          { href: '/muse/sites', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The market is Austin metro K-12 independent and charter schools.</li>
            <li>The directory is the operator&rsquo;s own prospect list.</li>
            <li>The school workspace holds needs, communications, a quote-of-service calculator and a scope-of-work draft.</li>
          </ul>
        }
        status="partial"
      />

      <Notice title="Operator prospect list — internal CRM seed">
        Compiled from {schoolDataset.source.name} (as of {schoolDataset.source.dataAsOf}).{' '}
        {num(all.total)} schools: {num(schoolDataset.counts.charter)} public charter,{' '}
        {num(schoolDataset.counts.tier1)} Tier 1 private, {num(schoolDataset.counts.tier2)} Tier 2 /
        micro. Customer status, contacts, and notes are read-only in this version — editing and
        saving arrive with the CRM data store.
      </Notice>

      {/* Universe */}
      <div className="grid gap-3 mt-4 muse-autofit-11">
        <Kpi value={num(all.total)} label="Total prospects" sub="Austin metro K-12, private + charter" />
        <Kpi value={num(schoolDataset.counts.charter)} label="Public charter" sub="Open-enrollment" />
        <Kpi value={num(schoolDataset.counts.tier1)} label="Private — Tier 1" sub="High enrollment / traditional" />
        <Kpi value={num(schoolDataset.counts.tier2)} label="Private — Tier 2 / Micro" sub="Sub-250 / specialty" />
      </div>

      {/* Pipeline — current view */}
      <div className="muse-card-title mt-4 mb-2!">Pipeline — current view</div>
      <div className="grid gap-3 muse-autofit-10">
        <Kpi value={num(stats.byStatus['Lead'] ?? 0)} label="Leads" />
        <Kpi value={num(stats.byStatus['In Talks'] ?? 0)} label="In talks" />
        <Kpi value={num(stats.byStatus['Negotiating'] ?? 0)} label="Negotiating" />
        <Kpi value={num(stats.byStatus['Signed - Active'] ?? 0)} label="Signed — active" />
      </div>

      <PageControls>
      <form method="GET">
        <label className="muse-kpi-sub inline-flex items-center gap-2">
          Segment
          <select name="segment" defaultValue={segment} className="muse-select">
            {SEGMENTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="muse-kpi-sub inline-flex items-center gap-2">
          Status
          <select name="status" defaultValue={status} className="muse-select">
            <option value="all">Any status</option>
            {SCHOOL_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <input name="q" defaultValue={q} placeholder="Name, location, contact…" aria-label="Name, location or contact" className="muse-input w-44!" />
        <button type="submit" className="muse-btn ghost">Filter</button>
        <Link href="/muse/sales" className="muse-link muse-fs-xs">Reset</Link>
      </form>
      </PageControls>

      <SchoolsCRM schools={clientSchools} totalInView={stats.total} quoteDefaults={quoteDefaults} home={MUSE_HOME} />
    </>
  );
}
