import Link from 'next/link';
import { PageHeader, Card, Kpi, StatusBadge, num } from '../../_components/ui';
import { Cite } from '../../_components/Cite';
import { SupplierLcaForm, DeleteSupplierLcaButton } from '../../_components/SupplierLcaForm';
import { listSupplierLcaRows } from '../../_lib/supplier-lca';
import { listSources } from '../../_lib/sources';
import { getMuseAccess } from '../../_lib/access';
import { listRecipes } from '../../_lib/recipes';
import { BOUNDARY_LABEL, type LcaBoundary } from '../../_data/lca-options';
import { toLcaOption, type SupplierLcaRowLike } from '../../_engine/supplier-links';
import type { StatusTag } from '../../_data/plan-data';

export const dynamic = 'force-dynamic';

export default async function SupplierLcaPage() {
  const [access, rows, sources, library] = await Promise.all([getMuseAccess(), listSupplierLcaRows(), listSources(), listRecipes()]);
  // Every ingredient across the in-service recipes (Roadmap N9).
  const ingredients = [...new Set(library.filter((r) => r.status === 'in_service').flatMap((r) => r.ingredients.map((i) => i.name)))].sort();
  const withDoc = rows.filter((r) => r.sourceId).length;

  return (
    <>
      <PageHeader
        title="Supplier LCA Data"
        purpose="Record a supplier's footprint figure for an ingredient, cited to their document."
        functions={['Figures on file', 'Ingredients covered', 'Suppliers']}
        connects={[
          { href: '/muse/sources', dir: 'from' },
          { href: '/muse/suppliers', dir: 'from' },
          { href: '/muse/sustainability/ingredients', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A figure is one supplier&rsquo;s footprint for one ingredient, with the vendor&rsquo;s document registered so it is cited.</li>
            <li>Each figure carries its boundary so the engine can align it to the study&rsquo;s retail-weight basis.</li>
            <li>Once recorded, the figure appears in the per-ingredient basis selector beside the study mean.</li>
          </ul>
        }
        status="partial"
      />

      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={num(rows.length)} label="Supplier figures on file" />
        <Kpi value={num(withDoc)} label="With a document attached" sub="Registered in Sources" />
        <Kpi value={num(new Set(rows.map((r) => r.ingredient)).size)} label="Ingredients covered" sub={`of ${ingredients.length} recipe lines`} />
        <Kpi value={num(new Set(rows.map((r) => r.supplierId)).size)} label="Suppliers" />
      </div>

      {access.isSuperAdmin ? (
        <SupplierLcaForm ingredients={ingredients} />
      ) : null}

      <Card title="Figures on file" className="mt-4">
        {rows.length === 0 ? (
          <p className="muse-kpi-sub">
            None yet. A supplier figure needs the supplier from the directory, the ingredient it covers, the value with its boundary, and the document it comes from — searched from the registry on <Link className="muse-link" href="/muse/sources">Sources</Link>, where it must be registered first.
          </p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th>Ingredient</th><th>Supplier</th><th>Figure</th><th className="num">kg CO2e / kg</th><th>Boundary</th><th>Document</th><th>Status</th>{access.isSuperAdmin ? <th /> : null}</tr></thead>
              <tbody>
                {rows.map((r) => {
                  const opt = toLcaOption(r as SupplierLcaRowLike);
                  const src = sources.find((s) => s.id === r.sourceId);
                  return (
                    <tr key={r.id}>
                      <td className="font-medium!">{r.ingredient}</td>
                      <td><Link className="muse-link" href={`/muse/suppliers/${r.supplierId}`}>{r.supplierName}</Link></td>
                      <td>
                        {r.label}
                        {r.note ? <div className="muse-fs-xs muse-c-faint">{r.note}</div> : null}
                      </td>
                      <td className="num">{r.kgCo2ePerKg} <span className="muse-c-faint">{r.unitNote ?? ''}</span></td>
                      <td className="muse-c-soft">{BOUNDARY_LABEL[r.boundary as LcaBoundary] ?? r.boundary}</td>
                      <td>{src ? <Link className="muse-link" href={`/muse/sources/${src.id}`}>{src.title}</Link> : <span className="muse-c-faint">none</span>} {r.sourceId ? <Cite p={opt.provenance} label="cite" /> : null}</td>
                      <td><StatusBadge status={r.status as StatusTag} /></td>
                      {access.isSuperAdmin ? <td><DeleteSupplierLcaButton id={r.id} /></td> : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
