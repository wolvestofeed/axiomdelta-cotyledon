import { PortalPending } from '@/app/(muse)/muse/_components/PortalPending';
import { getMuseAccess } from '@/app/(muse)/muse/_lib/access';
import { schoolLunchPriceOnRecord } from '@/app/(muse)/muse/_lib/channel-price';
import { EnrollClient } from './EnrollClient';

export const dynamic = 'force-dynamic';

/** The Parent Portal home (Roadmap P1b), in its own shell. Actual only (Robert, 2026-09-16): the School lunches price on record, no forecast edit. */
export default async function ParentEnrollPage() {
  // Checked on the page as well as `(member)/layout`: a layout gate alone is not enough (CLAUDE.md §10).
  {
    const a = await getMuseAccess();
    if (!a.isOperator) return <PortalPending portal="Parent Portal" email={a.email} />;
  }
  return <EnrollClient pricePerMeal={await schoolLunchPriceOnRecord()} />;
}
