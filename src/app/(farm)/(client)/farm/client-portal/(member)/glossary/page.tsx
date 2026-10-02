import Link from 'next/link';
import { PortalPending } from '@/components/PortalPending';
import { getFarmAccess } from '@/server/access';
import { canUsePortal } from '@/server/client-portal';
import { PageHeader, Card } from '@/components/ui';
import { GLOSSARY } from '@/data/glossary';
import { SCIENCE_SOURCE_BY_ROW } from '@/data/science-library';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/** The glossary for subscribers: tiers 1 and 2 of `docs/glossary.md`, every science citation linked to its source. */
export default async function GlossaryPage() {
  return withWorkspace(() => GlossaryPageInner());
}

async function GlossaryPageInner() {
  const a = await getFarmAccess();
  if (!canUsePortal(a)) return <PortalPending portal="Client Portal" email={a.email} />;
  const tier1 = GLOSSARY.filter((g) => g.tier === 1);
  const tier2 = GLOSSARY.filter((g) => g.tier === 2);
  const cite = (rows: number[]) =>
    rows.length === 0 ? null : (
      <span className="farm-kpi-sub">
        {' '}
        {rows.map((r, i) => {
          const s = SCIENCE_SOURCE_BY_ROW[r];
          return (
            <span key={r}>
              {i > 0 ? ', ' : ''}
              {s ? <a className="farm-link" href={s.url} target="_blank" rel="noreferrer" title={s.title}>[{r}]</a> : `[${r}]`}
            </span>
          );
        })}
      </span>
    );
  return (
    <>
      <PageHeader
        title="Glossary"
        purpose="Look up the words on your flats and in the science behind them."
        functions={['Growing and the product', 'The science']}
        status="live"
      />
      <Card title="Growing and the product">
        <dl className="grid gap-2">
          {tier1.map((g) => (
            <div key={g.key} id={g.key}>
              <dt className="font-semibold farm-c-ink">{g.term}</dt>
              <dd className="farm-c-soft">{g.definition}{cite(g.rows)}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title="The science" className="mt-4">
        <dl className="grid gap-2">
          {tier2.map((g) => (
            <div key={g.key} id={g.key}>
              <dt className="font-semibold farm-c-ink">{g.term}</dt>
              <dd className="farm-c-soft">{g.definition}{cite(g.rows)}</dd>
            </div>
          ))}
        </dl>
        <p className="farm-kpi-sub mt-3">A number in brackets is a row of the science library; each opens the study. The varieties themselves are on your <Link className="farm-link" href="/farm/client-portal/flat-builder">Flat Builder</Link>.</p>
      </Card>
    </>
  );
}
