import { getFarmAccess } from '../../_lib/access';
import { AdminOnlyNotice } from '../../_components/AdminOnly';
import { CashFlowView } from './CashFlowView';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

export default async function CashFlowPage() {
  return withWorkspace(() => CashFlowPageInner());
}

async function CashFlowPageInner() {
  if (!(await getFarmAccess()).isSuperAdmin) return <AdminOnlyNotice area="Cash Flow" />;
  return <CashFlowView />;
}
