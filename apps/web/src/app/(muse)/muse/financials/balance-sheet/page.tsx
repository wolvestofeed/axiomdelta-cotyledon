import { getMuseAccess } from '../../_lib/access';
import { AdminOnlyNotice } from '../../_components/AdminOnly';
import { BalanceSheetView } from './BalanceSheetView';

export default async function BalanceSheetPage() {
  if (!(await getMuseAccess()).isSuperAdmin) return <AdminOnlyNotice area="The Balance Sheet" />;
  return <BalanceSheetView />;
}
