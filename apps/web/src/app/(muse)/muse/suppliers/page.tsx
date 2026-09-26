import { PageControls } from '../_components/PageControls';
import Link from 'next/link';
import { PageHeader, Kpi, Notice, num } from '../_components/ui';
import { supplierDataset, supplierOperations, type Region } from '../_data/suppliers';
import { listRecipes } from '../_lib/recipes';
import { queryOperations, crossRefStats, matchRecipeToSuppliers, type SupplierFilters } from '../_engine/suppliers';
import SupplierDirectory from '../_components/SupplierDirectory';
import { nextRunNet } from '../_lib/next-run';
import { MUSE_HOME } from '../_data/muse-location';
import type { ClientSupplier, RecipeMatchView } from '../_engine/geo';
import { supplierRatings, ratingFor } from '../_data/mark';

const DISPLAY_CAP = 80;

type SP = Promise<{ region?: string; scope?: string; school?: string; q?: string }>;

function scopeList(o: { scopes: { crops: string; livestock: string; handling: string } }): string {
  const s: string[] = [];
  if (/^cert/i.test(o.scopes.crops)) s.push('Crops');
  if (/^cert/i.test(o.scopes.livestock)) s.push('Livestock');
  if (/^cert/i.test(o.scopes.handling)) s.push('Handling');
  return s.join(', ');
}

export default async function SuppliersPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const region = (['central-tx', 'texas', 'out-of-state', 'all'].includes(sp.region ?? '')
    ? sp.region
    : 'central-tx') as Region | 'all';
  const scope = (['crops', 'livestock', 'handling', 'all'].includes(sp.scope ?? '')
    ? sp.scope
    : 'all') as SupplierFilters['scope'];
  const schoolReadyOnly = sp.school === '1';
  const q = sp.q ?? '';

  const filtered = queryOperations(supplierOperations, { region, scope, schoolReadyOnly, q });
  const stats = crossRefStats(filtered);
  const shown = filtered.slice(0, DISPLAY_CAP);

  // Precompute recipe→supplier matches for every recipe in the list, in the
  // current region. The client tab just switches which one is shown.
  const recipes = await listRecipes();
  const recipeMatches: RecipeMatchView[] = recipes.map((r) => ({
    code: r.code,
    name: r.name,
    category: r.category,
    lines: matchRecipeToSuppliers(supplierOperations, region, r).map((m) => ({
      ingredient: m.ingredient,
      count: m.matches.length,
      examples: m.matches.slice(0, 3).map((o) => o.name),
    })),
  }));

  // Lean, already-filtered records handed to the client directory/map island —
  // never the full compiled dataset.
  const clientProducers: ClientSupplier[] = shown.map((o) => ({
    id: o.id,
    rating: ratingFor(supplierRatings, o.id),
    name: o.name,
    website: o.website,
    meta: `${o.source}${o.certifier ? ` · ${o.certifier}` : ''}${o.types.length ? ` · ${o.types.join(', ')}` : ''}`,
    location: [o.city, o.county ? `${o.county} County` : '', o.state].filter(Boolean).join(', '),
    certified: o.certified,
    certScope: scopeList(o),
    schoolReady: o.schoolReady,
    tdaType: o.tdaType,
    products: [o.products.crops, o.products.livestock, o.products.handling].filter(Boolean).join(' — '),
    volumeCapacity: o.volumeCapacity ?? null,
    wholesaleReadiness: o.wholesaleReadiness ?? null,
    pricing: o.pricing ?? null,
    leadTime: o.leadTime ?? null,
    lat: o.lat ?? null,
    lng: o.lng ?? null,
    geoSource: o.geoSource ?? null,
  }));

  const regionLabel: Record<string, string> = {
    'central-tx': 'Central Texas',
    texas: 'Texas (statewide)',
    'out-of-state': 'CO / NM / LA',
    all: 'All four states',
  };

  return (
    <>
      <PageHeader
        title="Suppliers"
        purpose="Find approved suppliers and record volume, price and lead time from conversations."
        functions={['Directory', 'Map', 'Match to recipe', 'Linked lines']}
        connects={[
          { href: '/muse/procurement', dir: 'to' },
          { href: '/muse/sustainability/logistics', dir: 'to' },
          { href: '/muse/sustainability/supplier-lca', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The directory is compiled from public records: USDA Organic INTEGRITY for certification, and the TDA Farm Fresh Network for school-channel readiness.</li>
            <li>Certification and school-channel readiness are separate qualifications.</li>
            <li>Volume, pricing and lead time are not in any directory. They are operator-entered, from conversations.</li>
          </ul>
        }
        status="partial"
      />

      <Notice title="Attributed compilation — public records, not a republished database">
        Certification: {supplierDataset.sources[0].name} (as of {supplierDataset.sources[0].dataAsOf}).
        School-readiness: {supplierDataset.sources[1].name} (Austin-metro extract, as of{' '}
        {supplierDataset.sources[1].dataAsOf}). Filtered to agricultural producers (crops, livestock,
        dairy). {num(supplierDataset.counts.certified)} certified-organic producers +{' '}
        {num(supplierDataset.counts.schoolReady)} school-ready producers compiled.
      </Notice>

      <PageControls>
      <form method="GET">
        <label className="muse-kpi-sub inline-flex items-center gap-2">
          Region
          <select name="region" defaultValue={region} className="muse-select">
            <option value="central-tx">Central Texas</option>
            <option value="texas">Texas (statewide)</option>
            <option value="out-of-state">CO / NM / LA</option>
            <option value="all">All four states</option>
          </select>
        </label>
        <label className="muse-kpi-sub inline-flex items-center gap-2">
          Scope
          <select name="scope" defaultValue={scope} className="muse-select">
            <option value="all">Any scope</option>
            <option value="crops">Crops</option>
            <option value="livestock">Livestock</option>
            <option value="handling">Handling</option>
          </select>
        </label>
        <input name="q" defaultValue={q} placeholder="Product or name…" aria-label="Product or name" className="muse-input w-40!" />
        <label className="muse-kpi-sub inline-flex items-center gap-[0.4rem]">
          <input type="checkbox" name="school" value="1" defaultChecked={schoolReadyOnly} />
          School-ready
        </label>
        <button type="submit" className="muse-btn ghost">Filter</button>
        <Link href="/muse/suppliers" className="muse-link muse-fs-xs">Reset</Link>
      </form>
      </PageControls>

      {/* Directory-wide totals (not filtered) — the universe we measure against. */}
      <div className="grid gap-3 mt-4 muse-autofit-11">
        <Kpi value={num(supplierDataset.counts.certified)} label="Total USDA OID Producers" sub="Certified organic · TX / CO / NM / LA (all states in scope)" />
        <Kpi value={num(supplierDataset.counts.schoolReady)} label="Total TDA Farm Fresh Producers" sub="School-ready · Austin-metro extract" />
        <Kpi value={num(supplierDataset.counts.total)} label="Compiled directory" sub="Producers across both lists" />
        <Kpi value={num(supplierDataset.counts.centralTx)} label="Central Texas producers" sub="In our operating region" />
      </div>

      {/* Current view — reflects the filters above. */}
      <div className="muse-card-title mt-4 mb-2!">Current view — {regionLabel[region]}</div>
      <div className="grid gap-3 muse-autofit-10">
        <Kpi value={num(stats.total)} label={`Operations — ${regionLabel[region]}`} />
        <Kpi value={num(stats.certifiedOrganic)} label="Meet our standard (certified organic)" sub={stats.total ? `${Math.round((stats.certifiedOrganic / stats.total) * 100)}% of this view` : undefined} />
        <Kpi value={num(stats.schoolReady)} label="School-ready" sub="TDA Farm Fresh" />
        <Kpi value={num(stats.both)} label="Both (cert + school)" sub="Certified organic and school-ready" />
      </div>

      {stats.schoolReady > 0 && (
        <div className="mt-4">
          <Notice title="Certification vs school-readiness">
            {num(stats.both)} of {num(stats.schoolReady)} school-ready producers in this view (
            {Math.round((stats.both / stats.schoolReady) * 100)}%) also carry organic certification.
            Certification and school-channel readiness are separate qualifications.
          </Notice>
        </div>
      )}

      <SupplierDirectory
        producers={clientProducers}
        home={MUSE_HOME}
        totalInView={stats.total}
        displayCap={DISPLAY_CAP}
        capped={filtered.length > DISPLAY_CAP}
        recipeMatches={recipeMatches}
        regionLabel={regionLabel[region]}
        nextRun={await nextRunNet(new Date().toISOString().slice(0, 10))}
      />
    </>
  );
}
