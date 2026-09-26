import { getMuseAccess } from '../../_lib/access';
import { AdminOnlyNotice } from '../../_components/AdminOnly';
import { CashFlowView } from './CashFlowView';

export default async function CashFlowPage() {
  if (!(await getMuseAccess()).isSuperAdmin) return <AdminOnlyNotice area="Cash Flow" />;
  return <CashFlowView />;
}
