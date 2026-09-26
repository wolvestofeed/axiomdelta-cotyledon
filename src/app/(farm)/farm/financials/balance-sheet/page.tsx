import { getFarmAccess } from '@/server/access';
import { AdminOnlyNotice } from '@/components/AdminOnly';
import { BalanceSheetView } from '@/app/(farm)/farm/financials/balance-sheet/BalanceSheetView';
import { withWorkspace } from '@/server/workspace';

export default async function BalanceSheetPage() {
  return withWorkspace(() => BalanceSheetPageInner());
}

async function BalanceSheetPageInner() {
  if (!(await getFarmAccess()).isSuperAdmin) return <AdminOnlyNotice area="The Balance Sheet" />;
  return <BalanceSheetView />;
}
