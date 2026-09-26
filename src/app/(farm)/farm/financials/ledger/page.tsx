import { getFarmAccess } from '@/server/access';
import { AdminOnlyNotice } from '@/components/AdminOnly';
import { LedgerView } from '@/app/(farm)/farm/financials/ledger/LedgerView';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

export default async function LedgerPage() {
  return withWorkspace(() => LedgerPageInner());
}

async function LedgerPageInner() {
  if (!(await getFarmAccess()).isSuperAdmin) return <AdminOnlyNotice area="The Ledger" />;
  return <LedgerView canEdit />;
}
