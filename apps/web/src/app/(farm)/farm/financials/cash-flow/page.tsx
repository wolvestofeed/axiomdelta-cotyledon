import { getFarmAccess } from '../../_lib/access';
import { AdminOnlyNotice } from '../../_components/AdminOnly';
import { CashFlowView } from './CashFlowView';

export default async function CashFlowPage() {
  if (!(await getFarmAccess()).isSuperAdmin) return <AdminOnlyNotice area="Cash Flow" />;
  return <CashFlowView />;
}
