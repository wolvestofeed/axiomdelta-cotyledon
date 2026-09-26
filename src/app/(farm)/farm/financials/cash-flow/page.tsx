import { getFarmAccess } from '@/server/access';
import { AdminOnlyNotice } from '@/components/AdminOnly';
import { CashFlowView } from '@/app/(farm)/farm/financials/cash-flow/CashFlowView';
import { withWorkspace } from '@/server/workspace';

export default async function CashFlowPage() {
  return withWorkspace(() => CashFlowPageInner());
}

async function CashFlowPageInner() {
  if (!(await getFarmAccess()).isSuperAdmin) return <AdminOnlyNotice area="Cash Flow" />;
  return <CashFlowView />;
}
