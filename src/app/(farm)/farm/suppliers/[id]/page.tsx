import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader, Kpi, money, num } from '@/components/ui';
import { SupplierDetail } from '@/components/SupplierDetail';
import { getSupplierOperation } from '@/server/supplier-links';
import { SUPPLY_KIND_LABEL, supplierLocation } from '@/data/suppliers';
import { listCatalog, listPurchaseOrdersForSupplier } from '@/server/supplier-catalog';
import { listSources } from '@/server/sources';
import { linksTo } from '@/server/entity-links';
import { getFarmAccess } from '@/server/access';
import { getResolvedActiveInputs } from '@/server/scenarios';
import { haversineMiles } from '@/engine/geo';
import { FARM_HOME } from '@/data/farm-location';
import { isAvailableInMonth, priceInForceOn } from '@/engine/catalog';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/**
 * One supplier, in full: what it supplies and what Vallecito bought, and what a working
 * relationship carries — the catalog imported from its price sheet, the orders raised against
 * it, and the lines of our own model that point at it.
 */
export default async function SupplierDetailPage(props: Parameters<typeof SupplierDetailPageInner>[0]) {
  return withWorkspace(() => SupplierDetailPageInner(props));
}

async function SupplierDetailPageInner({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const op = getSupplierOperation(id);
  if (!op) notFound();

  const [access, catalog, orders, sources, lotLinks, { inputs }] = await Promise.all([
    getFarmAccess(),
    listCatalog(id),
    listPurchaseOrdersForSupplier(id),
    listSources(),
    linksTo('supplier', id),
    getResolvedActiveInputs(),
  ]);

  const miles =
    op.lat != null && op.lng != null ? haversineMiles(FARM_HOME, { lat: op.lat, lng: op.lng }) : null;

  // Lines of the open scenario sourced from this operation.
  const links = inputs.sustainability.inputSupplier;
  const sourcedLines = Object.entries(links)
    .filter(([, sid]) => sid === id)
    .map(([input]) => input)
    .sort();

  const lotsReceived = lotLinks.filter((l) => l.relation === 'received_from').map((l) => l.fromId).sort();

  const month = new Date().getUTCMonth() + 1;
  const inSeason = catalog.filter((c) => isAvailableInMonth(c.availStartMonth, c.availEndMonth, month));
  const today = new Date().toISOString().slice(0, 10);
  // Priced means: approved, and carrying a price in force today — the two
  // conditions a purchase order needs before it reads the catalog at all.
  const priced = catalog.filter((c) => c.status === 'approved' && priceInForceOn(c.prices, today)?.unitPrice != null);
  const openOrders = orders.filter((o) => o.status !== 'closed' && o.status !== 'cancelled');
  const orderedTotal = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + o.subtotalCents, 0);

  return (
    <>
      <PageHeader
        title={op.name}
        purpose="Check what this supplier supplies, its catalog, prices in force and purchase orders."
        lede={`${supplierLocation(op)}${miles !== null ? ` · ${miles < 100 ? miles.toFixed(1) : miles.toFixed(0)} miles from the farm, straight line` : ''}`}
        connects={[
          { href: '/farm/suppliers', dir: 'from' },
          { href: '/farm/procurement', dir: 'to' },
        ]}
        status="partial"
      />

      <div className="flex gap-[0.4rem] flex-wrap -mt-3! mb-5!">
        {op.supplies.map((k) => (
          <span key={k} className="farm-pill ok">{SUPPLY_KIND_LABEL[k]}</span>
        ))}
        {op.brands.map((b) => (
          <span key={b} className="farm-pill">{b}</span>
        ))}
        {sourcedLines.length > 0 ? (
          <span className="farm-pill ok">{sourcedLines.length} model line{sourcedLines.length === 1 ? '' : 's'} sourced here</span>
        ) : null}
      </div>

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={num(catalog.length)} label="Catalog items on file" sub={catalog.length > 0 ? `${inSeason.length} available this month` : 'No price sheet imported'} />
        <Kpi value={priced.length > 0 ? `${priced.length} / ${catalog.length}` : '—'} label="Items priced today" sub="Approved, with a price in force" />
        <Kpi value={num(orders.length)} label="Purchase orders raised" sub={`${openOrders.length} open`} />
        <Kpi value={money(orderedTotal / 100, 0)} label="Ordered to date" sub="Excludes cancelled" />
      </div>

      <SupplierDetail
        paymentTerms={inputs.supplierTerms[id] ?? null}
        canSetTerms={access.isOperator}
        supplier={{
          id: op.id,
          name: op.name,
          supplies: op.supplies,
          brands: op.brands,
          bought: op.bought,
          carries: op.carries ?? null,
          tag: op.tag,
          location: supplierLocation(op),
          website: op.website,
          geoSource: op.geoSource,
          volumeCapacity: op.volumeCapacity ?? null,
          wholesaleReadiness: op.wholesaleReadiness ?? null,
          pricing: op.pricing ?? null,
          leadTime: op.leadTime ?? null,
          milesFromFarm: miles,
        }}
        catalog={catalog}
        orders={orders}
        sources={sources.map((s) => ({ id: s.id, title: s.title }))}
        sourcedLines={sourcedLines}
        lotsReceived={lotsReceived}
        canEdit={access.isSuperAdmin}
      />

      <p className="farm-kpi-sub mt-2">
        What this supplier supplies and what was bought are the record; everything under Catalog, Terms and
        Purchase orders is operator data, entered or imported from what the supplier sends. Back to{' '}
        <Link className="farm-link" href="/farm/suppliers">Suppliers</Link>.
      </p>
    </>
  );
}
