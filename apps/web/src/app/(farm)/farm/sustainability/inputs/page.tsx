import InputsClient from './InputsClient';
import { listSupplierLcaOptions } from '../../_lib/supplier-lca';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

export const dynamic = 'force-dynamic';

export default async function InputsPage() {
  return withWorkspace(() => InputsPageInner());
}

async function InputsPageInner() {
  const supplierOptions = await listSupplierLcaOptions();
  return <InputsClient supplierOptions={supplierOptions} />;
}
