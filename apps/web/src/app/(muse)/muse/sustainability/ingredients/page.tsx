import IngredientsClient from './IngredientsClient';
import { listSupplierLcaOptions } from '../../_lib/supplier-lca';

export const dynamic = 'force-dynamic';

export default async function IngredientsPage() {
  const supplierOptions = await listSupplierLcaOptions();
  return <IngredientsClient supplierOptions={supplierOptions} />;
}
