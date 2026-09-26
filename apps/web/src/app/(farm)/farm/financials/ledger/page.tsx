import { getFarmAccess } from '../../_lib/access';
import { AdminOnlyNotice } from '../../_components/AdminOnly';
import { LedgerView } from './LedgerView';

export const dynamic = 'force-dynamic';

export default async function LedgerPage() {
  if (!(await getFarmAccess()).isSuperAdmin) return <AdminOnlyNotice area="The Ledger" />;
  return <LedgerView canEdit />;
}
