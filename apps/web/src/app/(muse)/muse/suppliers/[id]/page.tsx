import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader, Card, Kpi, Notice, money, num } from '../../_components/ui';
import { RatingPill, RatingLegend, ratingHeader } from '../../_components/MarkRating';
import { SupplierDetail } from '../../_components/SupplierDetail';
import { supplierRatings, ratingFor, MARK } from '../../_data/mark';
import { getSupplierOperation } from '../../_lib/supplier-links';
import { listCatalog, listPurchaseOrdersForSupplier } from '../../_lib/supplier-catalog';
import { listSources } from '../../_lib/sources';
import { linksTo } from '../../_lib/entity-links';
import { getMuseAccess } from '../../_lib/access';
import { getResolvedActiveInputs } from '../../_lib/scenarios';
import { haversineMiles } from '../../_engine/geo';
import { MUSE_HOME } from '../../_data/muse-location';
import { isAvailableInMonth, priceInForceOn } from '../../_engine/catalog';

export const dynamic = 'force-dynamic';

/**
 * One operation, in full. The directory row shows what a public record carries;
 * this page adds what a working relationship carries — the seasonal catalog we
 * import from their price sheet, the orders we have raised against them, and the
 * lines of our own model that point at them.
 *
 * The certification mark's rating sits in the heading, because on this platform
 * it is the operation's leading credential rather than a column.
 */
export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const op = getSupplierOperation(id);
  if (!op) notFound();

  const [access, catalog, orders, sources, lotLinks, { inputs }] = await Promise.all([
    getMuseAccess(),
    listCatalog(id),
    listPurchaseOrdersForSupplier(id),
    listSources(),
    linksTo('supplier', id),
    getResolvedActiveInputs(),
  ]);

  const rating = ratingFor(supplierRatings, id);
  const miles =
    op.lat != null && op.lng != null ? haversineMiles(MUSE_HOME, { lat: op.lat, lng: op.lng }) : null;

  // Lines of the open scenario sourced from this operation.
  const links = inputs.sustainability.ingredientSupplier;
  const sourcedLines = Object.entries(links)
    .filter(([, sid]) => sid === id)
    .map(([ingredient]) => ingredient)
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

  const scopeList = [
    /^cert/i.test(op.scopes.crops) ? 'Crops' : null,
    /^cert/i.test(op.scopes.livestock) ? 'Livestock' : null,
    /^cert/i.test(op.scopes.handling) ? 'Handling' : null,
    /^cert/i.test(op.scopes.wildCrops) ? 'Wild crops' : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader
        title={op.name}
        purpose="Check this producer’s certification, catalog, prices in force and purchase orders."
        lede={`${[op.city, op.county ? `${op.county} County` : '', op.state, op.zip].filter(Boolean).join(', ')}${miles !== null ? ` · ${miles < 100 ? miles.toFixed(1) : miles.toFixed(0)} miles from the kitchen, straight line` : ''}`}
        connects={[
          { href: '/muse/suppliers', dir: 'from' },
          { href: '/muse/procurement', dir: 'to' },
        ]}
        status="partial"
        right={
          <div className="flex flex-col items-end gap-[0.4rem]">
            <span className="muse-kpi-label">{ratingHeader()}</span>
            <span className="[transform:scale(1.35)] [transform-origin:right_center] inline-block">
              <RatingPill rating={rating} />
            </span>
          </div>
        }
      />

      <div className="flex gap-[0.4rem] flex-wrap -mt-3! mb-5!">
        {op.certified ? (
          <span className="muse-pill ok">{scopeList.length > 0 ? `Certified — ${scopeList.join(', ')}` : 'Certified organic'}</span>
        ) : (
          <span className="muse-pill">No certification on file</span>
        )}
        {op.schoolReady ? <span className="muse-pill ok">{op.tdaType ?? 'School-ready'}</span> : null}
        {op.types.map((t) => (
          <span key={t} className="muse-pill">{t}</span>
        ))}
        {sourcedLines.length > 0 ? (
          <span className="muse-pill ok">{sourcedLines.length} model line{sourcedLines.length === 1 ? '' : 's'} sourced here</span>
        ) : null}
      </div>

      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={num(catalog.length)} label="Catalog items on file" sub={catalog.length > 0 ? `${inSeason.length} available this month` : 'No price sheet imported'} />
        <Kpi value={priced.length > 0 ? `${priced.length} / ${catalog.length}` : '—'} label="Items priced today" sub="Approved, with a price in force" />
        <Kpi value={num(orders.length)} label="Purchase orders raised" sub={`${openOrders.length} open`} />
        <Kpi value={money(orderedTotal / 100, 0)} label="Ordered to date" sub="Excludes cancelled" />
      </div>

      {!op.certified && rating.status === 'not_rated' ? (
        <div className="mt-4">
          <Notice title="No credential on file">
            This operation carries neither an organic certification in the compiled record nor an{' '}
            {MARK.label} rating. Both are separate qualifications, and the absence of each is stated
            rather than inferred.
          </Notice>
        </div>
      ) : null}

      <SupplierDetail
        paymentTerms={inputs.supplierTerms[id] ?? null}
        canSetTerms={access.isOperator}
        supplier={{
          id: op.id,
          name: op.name,
          source: op.source,
          certifier: op.certifier,
          status: op.status,
          scopes: op.scopes,
          products: op.products,
          city: op.city,
          county: op.county,
          state: op.state,
          zip: op.zip,
          phone: op.phone,
          email: op.email,
          website: op.website,
          acres: op.acres,
          types: op.types,
          schoolReady: op.schoolReady,
          tdaType: op.tdaType,
          region: op.region,
          dataAsOf: op.dataAsOf,
          geoSource: op.geoSource ?? null,
          volumeCapacity: op.volumeCapacity ?? null,
          wholesaleReadiness: op.wholesaleReadiness ?? null,
          pricing: op.pricing ?? null,
          leadTime: op.leadTime ?? null,
          milesFromKitchen: miles,
        }}
        catalog={catalog}
        orders={orders}
        sources={sources.map((s) => ({ id: s.id, title: s.title }))}
        sourcedLines={sourcedLines}
        lotsReceived={lotsReceived}
        canEdit={access.isSuperAdmin}
      />

      <RatingLegend />
      <p className="muse-kpi-sub mt-2">
        Certification and school-readiness come from the compiled public records (
        {op.source}, as of {op.dataAsOf.slice(0, 15)}); everything under Catalog, Terms and Purchase
        orders is operator data, entered or imported from what this operation sends us. Back to{' '}
        <Link className="muse-link" href="/muse/suppliers">Suppliers</Link>.
      </p>
    </>
  );
}
