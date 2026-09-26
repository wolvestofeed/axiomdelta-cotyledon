import Link from 'next/link';
import { PageHeader, Card, Kpi, StatusBadge, num } from '../_components/ui';
import { SourceUpload } from '../_components/SourceUpload';
import { listSources } from '../_lib/sources';
import { getMuseAccess } from '../_lib/access';
import { SOURCE_KINDS, formatBytes } from '../_engine/sources';
import type { StatusTag } from '../_data/plan-data';

export const dynamic = 'force-dynamic';

export default async function SourcesPage() {
  const [access, sources] = await Promise.all([getMuseAccess(), listSources()]);
  const withFile = sources.filter((s) => s.fileName);
  const figures = sources.reduce((n, s) => n + s.figureCount, 0);
  const kindLabel = (k: string) => SOURCE_KINDS.find((x) => x.kind === k)?.label ?? k;

  return (
    <>
      <PageHeader
        title="Sources"
        purpose="Look up any cited figure and the document behind it."
        status="live"
      />

      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={num(sources.length)} label="Registered sources" />
        <Kpi value={num(withFile.length)} label="With the document stored" sub="Open in the platform" />
        <Kpi value={num(sources.length - withFile.length)} label="Link only" sub="Publisher's page" />
        <Kpi value={num(figures)} label="Figures cited" />
      </div>

      {access.isSuperAdmin ? <SourceUpload /> : null}

      <Card title="Registry" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead><tr><th>Title</th><th>Kind</th><th>Publisher</th><th className="num">Year</th><th>Document</th><th className="num">Figures</th><th>Status</th></tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium!">
                    <Link className="muse-link" href={`/muse/sources/${s.id}`}>{s.title}</Link>
                    {s.authors ? <div className="muse-fs-xs muse-c-faint">{s.authors}</div> : null}
                  </td>
                  <td className="muse-c-soft">{kindLabel(s.kind)}</td>
                  <td className="muse-c-soft">{s.publisher ?? '—'}</td>
                  <td className="num">{s.year ?? '—'}</td>
                  <td>
                    {s.fileName ? (
                      <span className="muse-c-soft muse-fs-xs">{s.fileName}{s.fileSize ? ` · ${formatBytes(s.fileSize)}` : ''}</span>
                    ) : s.sourceUrl ? (
                      <a className="muse-link muse-fs-xs" href={s.sourceUrl} target="_blank" rel="noopener noreferrer">link</a>
                    ) : '—'}
                  </td>
                  <td className="num">{num(s.figureCount)}</td>
                  <td><StatusBadge status={s.status as StatusTag} /></td>
                </tr>
              ))}
              {sources.length === 0 ? (
                <tr><td colSpan={7} className="muse-c-faint">No sources registered. Run pnpm muse:sources to load the factor library’s publications and the stored documents.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
