import InputsClient from '@/app/(farm)/farm/sustainability/inputs/InputsClient';
import { listSupplierLcaOptions } from '@/server/supplier-lca';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

export default async function InputsPage() {
  return withWorkspace(() => InputsPageInner());
}

async function InputsPageInner() {
  const supplierOptions = await listSupplierLcaOptions();
  return <InputsClient supplierOptions={supplierOptions} />;
}
