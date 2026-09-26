import { PortalPending } from '@/app/(muse)/muse/_components/PortalPending';
import { getMuseAccess } from '@/app/(muse)/muse/_lib/access';
import { PageHeader, Card, Kpi, num } from '@/app/(muse)/muse/_components/ui';
import { listAllCatalog } from '@/app/(muse)/muse/_lib/supplier-catalog';
import { leanSuppliersById } from '@/app/(muse)/muse/_lib/supplier-links';
import { supplierRatings, ratingFor } from '@/app/(muse)/muse/_data/mark';
import { RatingPill, RatingLegend } from '@/app/(muse)/muse/_components/MarkRating';
import { SupplierPortalForms } from './SupplierPortalForms';

export const dynamic = 'force-dynamic';

/**
 * Supplier Portal (Robert, 2026-09-16) — for suppliers: upload new line sheets or specials,
 * submit new items, and submit ERRA rating assessments. A basic page while the portal is
 * developed: a supplier login is not built, the forms are not connected, and nothing is
 * gated beyond sign-in. The catalog on file is what a submitted line sheet becomes.
 */
export default async function SupplierPortalPage() {
  // Checked on the page as well as `(member)/layout`: a layout gate alone is not enough (CLAUDE.md §10).
  {
    const a = await getMuseAccess();
    if (!a.isOperator) return <PortalPending portal="Supplier Portal" email={a.email} />;
  }
  const catalog = await listAllCatalog();
  const ids = Object.keys(catalog);
  const suppliers = leanSuppliersById(ids);
  const rows = ids
    .map((id) => ({ id, name: suppliers[id]?.name ?? id, lines: catalog[id].length, approved: catalog[id].filter((l) => l.status === 'approved').length, rating: ratingFor(supplierRatings, id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        title="Supplier Portal"
        purpose="Keep your catalog with Muse Kitchen up to date."
        status="designed"
      />

      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={num(rows.length)} label="Suppliers with a catalog on file" />
        <Kpi value={num(rows.reduce((t, r) => t + r.lines, 0))} label="Catalog lines" sub={`${num(rows.reduce((t, r) => t + r.approved, 0))} approved`} />
        <Kpi value={num(rows.filter((r) => r.rating.status === 'rated').length)} label="Rated suppliers" sub="ERRA rating on file" />
      </div>

      <SupplierPortalForms suppliers={rows.map((r) => ({ id: r.id, name: r.name }))} />

      <Card title="Catalogs on file" className="mt-4">
        {rows.length === 0 ? (
          <p className="muse-kpi-sub">No supplier catalog is on file yet.</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th>Supplier</th><th className="num">Lines</th><th className="num">Approved</th><th>Rating</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}><td>{r.name}</td><td className="num">{num(r.lines)}</td><td className="num">{num(r.approved)}</td><td><RatingPill rating={r.rating} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <RatingLegend />
      </Card>
    </>
  );
}
