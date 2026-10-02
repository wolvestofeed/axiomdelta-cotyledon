import Link from 'next/link';
import { PortalPending } from '@/components/PortalPending';
import { getFarmAccess } from '@/server/access';
import { canUsePortal } from '@/server/client-portal';
import { PageHeader, Card } from '@/components/ui';
import { SCIENCE_CLAIM_BY_ID, SCIENCE_SOURCE_BY_ROW, type ScienceClaim } from '@/data/science-library';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/**
 * Why hemp mats — the medium under every tray, from the stated rows only (Phase 3, step D): the
 * makers' published specifications (grade S) and the one primary study (document D). Nothing is
 * written here that is not a claim in `src/data/science-library.ts`; each card is one claim with its
 * rows, and the row numbers open the sources.
 */
const CARDS: { id: string; title: string }[] = [
  { id: 'hemp-mat-specification', title: 'The mat' },
  { id: 'hemp-mat-retention', title: 'Water' },
  { id: 'hemp-mat-stratification', title: 'The surface' },
  { id: 'fiber-mat-minerals', title: 'Minerals' },
];

const EVIDENCE_LABEL: Partial<Record<ScienceClaim['evidence'], string>> = {
  supplier: 'the maker’s published specification',
  human: 'a peer-reviewed study',
  review: 'a review',
};

export default async function HempMatsPage() {
  return withWorkspace(() => HempMatsPageInner());
}

async function HempMatsPageInner() {
  const a = await getFarmAccess();
  if (!canUsePortal(a)) return <PortalPending portal="Client Portal" email={a.email} />;
  const cite = (rows: number[]) => (
    <span className="farm-kpi-sub">
      {rows.map((r, i) => {
        const s = SCIENCE_SOURCE_BY_ROW[r];
        return (
          <span key={r}>
            {i > 0 ? ', ' : ' '}
            {s ? <a className="farm-link" href={s.url} target="_blank" rel="noreferrer" title={s.title}>[{r}]</a> : `[${r}]`}
          </span>
        );
      })}
    </span>
  );
  return (
    <>
      <PageHeader
        title="Why hemp mats"
        purpose="Read what the hemp mat under your greens is and does, from its makers’ specifications and the one study on file."
        functions={['The mat', 'Water', 'The surface', 'Minerals']}
        status="live"
      />
      <Card title="On your flats">
        <p className="farm-c-soft">
          Every tray the farm grows sits on a hemp mat, the program’s default growing medium (<Link className="farm-link" href="/farm/client-portal/glossary#hemp-mat">glossary</Link>).
          Each card below is one claim from the farm’s science library with the rows it rests on; a number in brackets opens the source.
          A claim from the maker’s published specification is labelled as such, and the one claim from a peer-reviewed study is labelled a study.
        </p>
      </Card>
      <div className="grid gap-4 mt-4 farm-autofit-20">
        {CARDS.map(({ id, title }) => {
          const claim = SCIENCE_CLAIM_BY_ID[id];
          if (!claim) return null;
          return (
            <Card key={id} title={title}>
              <p className="farm-c-ink">{claim.text}{cite(claim.rows)}</p>
              <p className="farm-kpi-sub mt-2">
                Evidence: {EVIDENCE_LABEL[claim.evidence] ?? claim.evidence}.
                {claim.varieties.includes('all') ? ' Applies to every variety.' : ` Studied on ${claim.varieties.join(' and ')}.`}
              </p>
            </Card>
          );
        })}
      </div>
    </>
  );
}
