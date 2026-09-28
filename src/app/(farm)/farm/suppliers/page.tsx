import { formatNameOf } from '@/data/grow-plan';
import { PageControls } from '@/components/PageControls';
import Link from 'next/link';
import { PageHeader, Kpi, num } from '@/components/ui';
import { suppliers, supplierLocation, SUPPLY_KINDS, SUPPLY_KIND_LABEL, type SupplyKind } from '@/data/suppliers';
import { listGrowPlans } from '@/server/grow-plans';
import { querySuppliers, supplyStats, matchGrowPlanToSuppliers } from '@/engine/suppliers';
import SupplierDirectory from '@/components/SupplierDirectory';
import { nextRunNet } from '@/server/next-run';
import { FARM_HOME } from '@/data/farm-location';
import type { ClientSupplier, GrowPlanMatchView } from '@/engine/geo';
import { withWorkspace } from '@/server/workspace';

type SP = Promise<{ kind?: string; q?: string }>;

export default async function SuppliersPage(props: Parameters<typeof SuppliersPageInner>[0]) {
  return withWorkspace(() => SuppliersPageInner(props));
}

async function SuppliersPageInner({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const kind = ((SUPPLY_KINDS as string[]).includes(sp.kind ?? '') ? sp.kind : 'all') as SupplyKind | 'all';
  const q = sp.q ?? '';

  const filtered = querySuppliers(suppliers, { kind, q });
  const stats = supplyStats(suppliers);

  // Each grow plan's lines against the suppliers on record, by what each supplies.
  const growPlans = await listGrowPlans();
  const growPlanMatches: GrowPlanMatchView[] = growPlans.map((r) => ({
    code: r.code,
    name: r.name,
    category: formatNameOf(r),
    lines: matchGrowPlanToSuppliers(suppliers, r).map((m) => ({
      input: m.input,
      kind: m.kind,
      count: m.matches.length,
      examples: m.matches.map((s) => s.name),
    })),
  }));

  const clientSuppliers: ClientSupplier[] = filtered.map((s) => ({
    id: s.id,
    name: s.name,
    website: s.website,
    location: supplierLocation(s),
    supplies: s.supplies,
    brands: s.brands,
    bought: s.bought,
    carries: s.carries ?? null,
    tag: s.tag,
    volumeCapacity: s.volumeCapacity ?? null,
    wholesaleReadiness: s.wholesaleReadiness ?? null,
    pricing: s.pricing ?? null,
    leadTime: s.leadTime ?? null,
    lat: s.lat,
    lng: s.lng,
    geoSource: s.geoSource,
  }));

  return (
    <>
      <PageHeader
        title="Suppliers"
        purpose="Keep the suppliers the farm buys from, what each supplies, and the price and lead time from conversations."
        functions={['Directory', 'Map', 'Match to grow plan', 'Linked lines']}
        connects={[
          { href: '/farm/procurement', dir: 'to' },
          { href: '/farm/sustainability/logistics', dir: 'to' },
          { href: '/farm/sustainability/supplier-lca', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The suppliers on record are the vendors Vallecito Micro Farm bought from, each with what it supplies, the brands it carries and what was bought, tagged DATED or STATED.</li>
            <li>A grow plan line matches the suppliers that supply its kind: seed, medium, nutrients or light.</li>
            <li>Volume, pricing and lead time are operator-entered, from conversations.</li>
          </ul>
        }
        status="partial"
      />

      <PageControls>
      <form method="GET">
        <label className="farm-kpi-sub inline-flex items-center gap-2">
          Supplies
          <select name="kind" defaultValue={kind} className="farm-select">
            <option value="all">Anything</option>
            {SUPPLY_KINDS.map((k) => <option key={k} value={k}>{SUPPLY_KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <input name="q" defaultValue={q} placeholder="Name, brand or item…" aria-label="Name, brand or item" className="farm-input w-40!" />
        <button type="submit" className="farm-btn ghost">Filter</button>
        <Link href="/farm/suppliers" className="farm-link farm-fs-xs">Reset</Link>
      </form>
      </PageControls>

      <div className="grid gap-3 mt-4 farm-autofit-11">
        <Kpi value={num(stats.total)} label="Suppliers on record" sub="Vallecito's vendors" />
        <Kpi value={num(stats.byKind.seed)} label="Seed" sub="Suppliers of seed" />
        <Kpi value={num(stats.byKind.medium + stats.byKind.trays)} label="Medium, trays and sets" sub={`${num(stats.byKind.medium)} medium · ${num(stats.byKind.trays)} trays`} />
        <Kpi value={num(stats.byKind.lights)} label="Lights" sub={`${num(stats.byKind.nutrients)} for nutrients: none on record`} />
      </div>

      <SupplierDirectory
        suppliers={clientSuppliers}
        home={FARM_HOME}
        growPlanMatches={growPlanMatches}
        nextRun={await nextRunNet(new Date().toISOString().slice(0, 10))}
      />
    </>
  );
}
