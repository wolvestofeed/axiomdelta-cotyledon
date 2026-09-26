import { getFarmAccess } from '../../_lib/access';
import { AdminOnlyNotice } from '../../_components/AdminOnly';
import { LedgerView } from './LedgerView';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

export const dynamic = 'force-dynamic';

export default async function LedgerPage() {
  return withWorkspace(() => LedgerPageInner());
}

async function LedgerPageInner() {
  if (!(await getFarmAccess()).isSuperAdmin) return <AdminOnlyNotice area="The Ledger" />;
  return <LedgerView canEdit />;
}
