import { PageHeader } from '@/components/ui';
import { getFarmAccess } from '@/server/access';
import { listMedia } from '@/server/media';
import { listGrowPlans } from '@/server/grow-plans';
import { plansNamingMedium } from '@/engine/media';
import { mediumPurchaseName } from '@/data/grow-plan';
import { NO_MEDIUM_KEY } from '@/data/inputs-catalog';
import { db } from '@/lib/db';
import { rollingCostsWith } from '@/server/grow-plan-rows';
import { RollingAverageCard } from '@/components/RollingAverageCard';
import { MediaClient } from '@/app/(farm)/farm/media/MediaClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/** The Media library: what a grow plan's medium line names and is costed against. */
export default async function MediaPage() {
  return withWorkspace(() => MediaPageInner());
}

async function MediaPageInner() {
  const today = new Date().toISOString().slice(0, 10);
  const [access, media, plans, rolling] = await Promise.all([getFarmAccess(), listMedia(), listGrowPlans(), rollingCostsWith(db, today)]);
  const namedBy = Object.fromEntries(media.map((m) => [m.key, plansNamingMedium(m.key, plans)]));
  return (
    <>
      <PageHeader
        title="Media"
        purpose="Keep the growing media a grow plan's medium line names: how much a tray takes, the price and what each does."
        functions={['The library', 'Add medium', 'Rolling 12-month average']}
        connects={[
          { href: '/farm/grow-plans', dir: 'to' },
          { href: '/farm/sources', dir: 'from' },
        ]}
        howItWorks={
          <ul>
            <li>A grow plan&rsquo;s medium line names one row here and is costed at its quantity per 1020, scaled to the plan&rsquo;s tray format, times the price per unit. A quantity typed on the plan&rsquo;s line stands over the row&rsquo;s.</li>
            <li>Loose fill is counted in gallons and a mat by the piece; a medium&rsquo;s form is set when it is added.</li>
            <li>A price is typed as what was paid and how much it gave, the gallons a bale expands to or the mats in a pack, and kept as dollars per unit.</li>
            <li>A figure typed here is STATED; a seeded figure keeps its tag until it is edited. Traits cite rows of the science library, registered on Sources.</li>
            <li>A row a grow plan names cannot be deleted, and No medium stays.</li>
            <li>The rolling 12-month average is the dollars over the quantity on the accepted receipts of the last twelve months, per medium, in its unit: a key figure beside the price, which no plan, order or posting uses.</li>
          </ul>
        }
        status="live"
      />
      <MediaClient media={media} namedBy={namedBy} canEdit={access.isSuperAdmin} />
      <RollingAverageCard what="media" asOf={today} items={media.filter((m) => m.key !== NO_MEDIUM_KEY).map((m) => ({ name: m.name, unitWord: m.unit === 'gal' ? 'gal' : 'mat', cost: rolling[mediumPurchaseName(m.key)] }))} />
    </>
  );
}
