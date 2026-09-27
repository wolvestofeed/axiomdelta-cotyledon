import Link from 'next/link';
import { lineLabel } from '@/data/grow-plan';
import { PageHeader, Card, Kpi, StatusBadge, num } from '@/components/ui';
import { Cite } from '@/components/Cite';
import { SupplierLcaForm, DeleteSupplierLcaButton } from '@/components/SupplierLcaForm';
import { listSupplierLcaRows } from '@/server/supplier-lca';
import { listSources } from '@/server/sources';
import { getFarmAccess } from '@/server/access';
import { listGrowPlans } from '@/server/grow-plans';
import { BOUNDARY_LABEL, type LcaBoundary } from '@/data/lca-options';
import { toLcaOption, type SupplierLcaRowLike } from '@/engine/supplier-links';
import type { StatusTag } from '@/data/plan-data';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

export default async function SupplierLcaPage() {
  return withWorkspace(() => SupplierLcaPageInner());
}

async function SupplierLcaPageInner() {
  const [access, rows, sources, library] = await Promise.all([getFarmAccess(), listSupplierLcaRows(), listSources(), listGrowPlans()]);
  // Every input across the in-service grow plans (Roadmap N9).
  const inputs = [...new Set(library.filter((r) => r.status === 'in_service').flatMap((r) => r.lines.map((l) => lineLabel(l))))].sort();
  const withDoc = rows.filter((r) => r.sourceId).length;

  return (
    <>
      <PageHeader
        title="Supplier LCA Data"
        purpose="Record a supplier's footprint figure for an input, cited to their document."
        functions={['Figures on file', 'Inputs covered', 'Suppliers']}
        connects={[
          { href: '/farm/sources', dir: 'from' },
          { href: '/farm/suppliers', dir: 'from' },
          { href: '/farm/sustainability/inputs', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A figure is one supplier&rsquo;s footprint for one input, with the vendor&rsquo;s document registered so it is cited.</li>
            <li>Each figure carries its boundary so the engine can align it to the study&rsquo;s retail-weight basis.</li>
            <li>Once recorded, the figure appears in the per-input basis selector beside the study mean.</li>
          </ul>
        }
        status="partial"
      />

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={num(rows.length)} label="Supplier figures on file" />
        <Kpi value={num(withDoc)} label="With a document attached" sub="Registered in Sources" />
        <Kpi value={num(new Set(rows.map((r) => r.input)).size)} label="Inputs covered" sub={`of ${inputs.length} grow plan lines`} />
        <Kpi value={num(new Set(rows.map((r) => r.supplierId)).size)} label="Suppliers" />
      </div>

      {access.isSuperAdmin ? (
        <SupplierLcaForm inputs={inputs} />
      ) : null}

      <Card title="Figures on file" className="mt-4">
        {rows.length === 0 ? (
          <p className="farm-kpi-sub">
            None yet. A supplier figure needs the supplier from the directory, the input it covers, the value with its boundary, and the document it comes from — searched from the registry on <Link className="farm-link" href="/farm/sources">Sources</Link>, where it must be registered first.
          </p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead><tr><th>Input</th><th>Supplier</th><th>Figure</th><th className="num">kg CO2e / kg</th><th>Boundary</th><th>Document</th><th>Status</th>{access.isSuperAdmin ? <th /> : null}</tr></thead>
              <tbody>
                {rows.map((r) => {
                  const opt = toLcaOption(r as SupplierLcaRowLike);
                  const src = sources.find((s) => s.id === r.sourceId);
                  return (
                    <tr key={r.id}>
                      <td className="font-medium!">{r.input}</td>
                      <td><Link className="farm-link" href={`/farm/suppliers/${r.supplierId}`}>{r.supplierName}</Link></td>
                      <td>
                        {r.label}
                        {r.note ? <div className="farm-fs-xs farm-c-faint">{r.note}</div> : null}
                      </td>
                      <td className="num">{r.kgCo2ePerKg} <span className="farm-c-faint">{r.unitNote ?? ''}</span></td>
                      <td className="farm-c-soft">{BOUNDARY_LABEL[r.boundary as LcaBoundary] ?? r.boundary}</td>
                      <td>{src ? <Link className="farm-link" href={`/farm/sources/${src.id}`}>{src.title}</Link> : <span className="farm-c-faint">none</span>} {r.sourceId ? <Cite p={opt.provenance} label="cite" /> : null}</td>
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
