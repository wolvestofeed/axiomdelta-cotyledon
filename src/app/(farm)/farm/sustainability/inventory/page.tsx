import InventoryClient from '@/app/(farm)/farm/sustainability/inventory/InventoryClient';
import { listSupplierLcaOptions } from '@/server/supplier-lca';
import { getScenarioView } from '@/server/scenarios';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

export default async function InventoryAuditPage() {
  return withWorkspace(() => InventoryAuditPageInner());
}

async function InventoryAuditPageInner() {
  const [supplierOptions, view] = await Promise.all([listSupplierLcaOptions(), getScenarioView()]);
  return <InventoryClient supplierOptions={supplierOptions} liveLabel={view.basis === 'forecast' ? `forecast ${view.label}` : `plan of record ${view.planLabel ?? 'plan defaults'}`} />;
}
