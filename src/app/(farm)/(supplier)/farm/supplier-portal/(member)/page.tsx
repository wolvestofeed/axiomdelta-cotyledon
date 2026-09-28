import { PortalPending } from '@/components/PortalPending';
import { getFarmAccess } from '@/server/access';
import { PageHeader, Card, Kpi, num } from '@/components/ui';
import { listAllCatalog } from '@/server/supplier-catalog';
import { leanSuppliersById } from '@/server/supplier-links';
import { SupplierPortalForms } from '@/app/(farm)/(supplier)/farm/supplier-portal/(member)/SupplierPortalForms';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/**
 * Supplier Portal — for suppliers: upload new line sheets or specials,
 * and submit new items. A basic page while the portal is
 * developed: a supplier login is not built, the forms are not connected, and nothing is
 * gated beyond sign-in. The catalog on file is what a submitted line sheet becomes.
 */
export default async function SupplierPortalPage() {
  return withWorkspace(() => SupplierPortalPageInner());
}

async function SupplierPortalPageInner() {
  // Checked on the page as well as `(member)/layout`: a layout gate alone is not enough (CLAUDE.md §10).
  {
    const a = await getFarmAccess();
    if (!a.isOperator) return <PortalPending portal="Supplier Portal" email={a.email} />;
  }
  const catalog = await listAllCatalog();
  const ids = Object.keys(catalog);
  const suppliers = leanSuppliersById(ids);
  const rows = ids
    .map((id) => ({ id, name: suppliers[id]?.name ?? id, lines: catalog[id].length, approved: catalog[id].filter((l) => l.status === 'approved').length }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        title="Supplier Portal"
        purpose="Keep your catalog with the farm up to date."
        status="designed"
      />

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={num(rows.length)} label="Suppliers with a catalog on file" />
        <Kpi value={num(rows.reduce((t, r) => t + r.lines, 0))} label="Catalog lines" sub={`${num(rows.reduce((t, r) => t + r.approved, 0))} approved`} />
      </div>

      <SupplierPortalForms suppliers={rows.map((r) => ({ id: r.id, name: r.name }))} />

      <Card title="Catalogs on file" className="mt-4">
        {rows.length === 0 ? (
          <p className="farm-kpi-sub">No supplier catalog is on file yet.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead><tr><th>Supplier</th><th className="num">Lines</th><th className="num">Approved</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}><td>{r.name}</td><td className="num">{num(r.lines)}</td><td className="num">{num(r.approved)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
