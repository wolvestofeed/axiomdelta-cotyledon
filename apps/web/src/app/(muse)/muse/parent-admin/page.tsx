import Link from 'next/link';
import { PageHeader, Notice } from '../_components/ui';
import { schoolRecords } from '../_data/schools';
import { schoolLunchPriceOnRecord } from '../_lib/channel-price';
import { parentAccounts, historyEvents } from '../_data/parent-portal';
import ParentPortal from '../_components/ParentPortal';

export const dynamic = 'force-dynamic';

/** Parent Admin. Actual only (Roadmap N6 slice 4): the School lunches price on record, never a forecast's. */
export default async function ParentPortalPage() {
  // Eligible customers: signed-active schools with a parent-pay model and at
  // least one (synthetic) parent account on file.
  const withAccounts = new Set(parentAccounts.map((p) => p.schoolId));
  const schools = schoolRecords
    .filter(
      (s) =>
        s.status === 'Signed - Active' && /^Yes/i.test(s.parentPay) && withAccounts.has(s.id),
    )
    .map((s) => ({ id: s.id, name: s.name, parentPay: s.parentPay, studentsRaw: s.studentsRaw }));

  const pricePerMeal = await schoolLunchPriceOnRecord();

  return (
    <>
      <PageHeader
        title="Parent Admin"
        purpose="Review enrolled parents, their payment plans and account history."
        functions={['Active parent accounts', 'Enrolled children', 'Meal plan mix', 'Billing cadence']}
        connects={[{ href: '/muse/parent-portal', dir: 'from' }]}
        status="designed"
      />

      <Notice title="Draft — sample data">
        Sample records for signed-active, parent-pay customers. No real families, billing, or
        payments are connected. See the parent-facing{' '}
        <Link className="muse-link" href="/muse/parent-portal">Parent Portal →</Link>
      </Notice>

      <ParentPortal
        schools={schools}
        parents={parentAccounts}
        history={historyEvents}
        pricePerMeal={pricePerMeal}
      />
    </>
  );
}
