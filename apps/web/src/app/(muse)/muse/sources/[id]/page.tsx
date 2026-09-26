import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader, Card, StatusBadge } from '../../_components/ui';
import { getSource, listFigures } from '../../_lib/sources';
import { SOURCE_KINDS, formatBytes, isInlineViewable } from '../../_engine/sources';
import type { StatusTag } from '../../_data/plan-data';

export const dynamic = 'force-dynamic';

export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [source, figures] = await Promise.all([getSource(id), listFigures(id)]);
  if (!source) notFound();

  const kind = SOURCE_KINDS.find((k) => k.kind === source.kind)?.label ?? source.kind;
  const fileHref = `/muse/sources/${source.id}/file`;
  const inline = isInlineViewable(source.fileMime);

  return (
    <>
      <PageHeader
        title={source.title}
        lede={[source.authors, source.publisher, source.year ? String(source.year) : null].filter(Boolean).join(' · ')}
        right={<Link className="muse-link" href="/muse/sources">All sources</Link>}
      />

      <Card>
        <div className="grid gap-3 text-sm muse-autofit-14">
          <div><div className="muse-kpi-label">Kind</div><div>{kind}</div></div>
          <div><div className="muse-kpi-label">Status</div><div><StatusBadge status={source.status as StatusTag} /></div></div>
          {source.citation ? <div><div className="muse-kpi-label">Citation</div><div>{source.citation}</div></div> : null}
          {source.sourceUrl ? <div><div className="muse-kpi-label">Publisher link</div><div><a className="muse-link" href={source.sourceUrl} target="_blank" rel="noopener noreferrer">{source.sourceUrl}</a></div></div> : null}
          {source.licenceNote ? <div><div className="muse-kpi-label">Licence</div><div>{source.licenceNote}</div></div> : null}
          {source.fileName ? (
            <div>
              <div className="muse-kpi-label">Document</div>
              <div>
                <a className="muse-link" href={fileHref}>{source.fileName}</a>
                {source.fileSize ? <span className="muse-c-faint"> · {formatBytes(source.fileSize)}</span> : null}
                {source.sha256 ? <div className="muse-mono muse-fs-2xs muse-c-faint">sha256 {source.sha256.slice(0, 16)}…</div> : null}
              </div>
            </div>
          ) : null}
        </div>
        {source.notes ? <p className="muse-kpi-sub mt-3 whitespace-pre-wrap!">{source.notes}</p> : null}
      </Card>

      <Card title={`Figures drawn from this source (${figures.length})`} className="mt-4">
        {figures.length === 0 ? (
          <p className="muse-kpi-sub">No figures registered yet.</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th>Figure</th><th className="num">Value</th><th>Where in the document</th><th>Version</th><th>Effective</th><th>Status</th><th>Id</th></tr></thead>
              <tbody>
                {figures.map((f) => (
                  <tr key={f.id} id={`fig-${f.id}`}>
                    <td className="font-medium!">
                      {f.label}
                      {f.note ? <div className="muse-fs-xs muse-c-faint">{f.note}</div> : null}
                    </td>
                    <td className="num">{f.valueText ?? '—'}{f.unit ? <span className="muse-c-faint"> {f.unit}</span> : null}</td>
                    <td className="muse-c-soft">{f.locator ?? '—'}</td>
                    <td className="muse-c-soft">{f.version ?? '—'}</td>
                    <td className="muse-c-soft">{f.effectiveFrom ?? '—'}</td>
                    <td><StatusBadge status={f.status as StatusTag} /></td>
                    <td className="muse-mono muse-fs-2xs muse-c-faint">{f.provenanceId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {source.fileName ? (
        <Card title="Document" className="mt-4">
          {inline ? (
            <iframe src={fileHref} title={source.title} className="w-full! h-[78vh]! border! border-[color:var(--muse-line)]! rounded-[0.4rem]! bg-[color:var(--muse-ink-strong)]!" />
          ) : (
            <p className="muse-kpi-sub">
              This file type does not render inline. <a className="muse-link" href={fileHref}>Download {source.fileName}</a>
              {source.fileMime?.includes('spreadsheet') ? ' — the compiled values drawn from it are on the pages that cite it.' : '.'}
            </p>
          )}
        </Card>
      ) : null}
    </>
  );
}
