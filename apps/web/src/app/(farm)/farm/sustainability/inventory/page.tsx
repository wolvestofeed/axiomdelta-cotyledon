import InventoryClient from './InventoryClient';
import { listSupplierLcaOptions } from '../../_lib/supplier-lca';
import { getScenarioView } from '../../_lib/scenarios';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

export const dynamic = 'force-dynamic';

export default async function InventoryAuditPage() {
  return withWorkspace(() => InventoryAuditPageInner());
}

async function InventoryAuditPageInner() {
  const [supplierOptions, view] = await Promise.all([listSupplierLcaOptions(), getScenarioView()]);
  return <InventoryClient supplierOptions={supplierOptions} liveLabel={view.basis === 'forecast' ? `forecast ${view.label}` : `plan of record ${view.planLabel ?? 'plan defaults'}`} />;
}
