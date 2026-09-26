import { getFarmAccess } from '../../_lib/access';
import { AdminOnlyNotice } from '../../_components/AdminOnly';
import { BalanceSheetView } from './BalanceSheetView';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

export default async function BalanceSheetPage() {
  return withWorkspace(() => BalanceSheetPageInner());
}

async function BalanceSheetPageInner() {
  if (!(await getFarmAccess()).isSuperAdmin) return <AdminOnlyNotice area="The Balance Sheet" />;
  return <BalanceSheetView />;
}
