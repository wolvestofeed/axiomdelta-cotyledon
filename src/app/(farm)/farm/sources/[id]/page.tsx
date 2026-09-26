import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader, Card, StatusBadge } from '@/components/ui';
import { getSource, listFigures } from '@/server/sources';
import { SOURCE_KINDS, formatBytes, isInlineViewable } from '@/engine/sources';
import type { StatusTag } from '@/data/plan-data';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

export default async function SourcePage(props: Parameters<typeof SourcePageInner>[0]) {
  return withWorkspace(() => SourcePageInner(props));
}

async function SourcePageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [source, figures] = await Promise.all([getSource(id), listFigures(id)]);
  if (!source) notFound();

  const kind = SOURCE_KINDS.find((k) => k.kind === source.kind)?.label ?? source.kind;
  const fileHref = `/farm/sources/${source.id}/file`;
  const inline = isInlineViewable(source.fileMime);

  return (
    <>
      <PageHeader
        title={source.title}
        lede={[source.authors, source.publisher, source.year ? String(source.year) : null].filter(Boolean).join(' · ')}
        right={<Link className="farm-link" href="/farm/sources">All sources</Link>}
      />

      <Card>
        <div className="grid gap-3 text-sm farm-autofit-14">
          <div><div className="farm-kpi-label">Kind</div><div>{kind}</div></div>
          <div><div className="farm-kpi-label">Status</div><div><StatusBadge status={source.status as StatusTag} /></div></div>
          {source.citation ? <div><div className="farm-kpi-label">Citation</div><div>{source.citation}</div></div> : null}
          {source.sourceUrl ? <div><div className="farm-kpi-label">Publisher link</div><div><a className="farm-link" href={source.sourceUrl} target="_blank" rel="noopener noreferrer">{source.sourceUrl}</a></div></div> : null}
          {source.licenceNote ? <div><div className="farm-kpi-label">Licence</div><div>{source.licenceNote}</div></div> : null}
          {source.fileName ? (
            <div>
              <div className="farm-kpi-label">Document</div>
              <div>
                <a className="farm-link" href={fileHref}>{source.fileName}</a>
                {source.fileSize ? <span className="farm-c-faint"> · {formatBytes(source.fileSize)}</span> : null}
                {source.sha256 ? <div className="farm-mono farm-fs-2xs farm-c-faint">sha256 {source.sha256.slice(0, 16)}…</div> : null}
              </div>
            </div>
          ) : null}
        </div>
        {source.notes ? <p className="farm-kpi-sub mt-3 whitespace-pre-wrap!">{source.notes}</p> : null}
      </Card>

      <Card title={`Figures drawn from this source (${figures.length})`} className="mt-4">
        {figures.length === 0 ? (
          <p className="farm-kpi-sub">No figures registered yet.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead><tr><th>Figure</th><th className="num">Value</th><th>Where in the document</th><th>Version</th><th>Effective</th><th>Status</th><th>Id</th></tr></thead>
              <tbody>
                {figures.map((f) => (
                  <tr key={f.id} id={`fig-${f.id}`}>
                    <td className="font-medium!">
                      {f.label}
                      {f.note ? <div className="farm-fs-xs farm-c-faint">{f.note}</div> : null}
                    </td>
                    <td className="num">{f.valueText ?? '—'}{f.unit ? <span className="farm-c-faint"> {f.unit}</span> : null}</td>
                    <td className="farm-c-soft">{f.locator ?? '—'}</td>
                    <td className="farm-c-soft">{f.version ?? '—'}</td>
                    <td className="farm-c-soft">{f.effectiveFrom ?? '—'}</td>
                    <td><StatusBadge status={f.status as StatusTag} /></td>
                    <td className="farm-mono farm-fs-2xs farm-c-faint">{f.provenanceId ?? '—'}</td>
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
            <iframe src={fileHref} title={source.title} className="w-full! h-[78vh]! border! border-[color:var(--farm-line)]! rounded-[0.4rem]! bg-[color:var(--farm-ink-strong)]!" />
          ) : (
            <p className="farm-kpi-sub">
              This file type does not render inline. <a className="farm-link" href={fileHref}>Download {source.fileName}</a>
              {source.fileMime?.includes('spreadsheet') ? ' — the compiled values drawn from it are on the pages that cite it.' : '.'}
            </p>
          )}
        </Card>
      ) : null}
    </>
  );
}
