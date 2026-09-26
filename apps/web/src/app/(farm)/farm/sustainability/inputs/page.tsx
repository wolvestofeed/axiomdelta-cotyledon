import InputsClient from './InputsClient';
import { listSupplierLcaOptions } from '../../_lib/supplier-lca';

export const dynamic = 'force-dynamic';

export default async function InputsPage() {
  const supplierOptions = await listSupplierLcaOptions();
  return <InputsClient supplierOptions={supplierOptions} />;
}
