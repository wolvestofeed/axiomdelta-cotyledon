import 'server-only';
import { asc } from 'drizzle-orm';
import { farmSupplierLcaOptions } from '@mf/db';
import { db } from '@/lib/db';
import { toLcaOption, type SupplierLcaRowLike } from '../_engine/supplier-links';
import type { LcaOption } from '../_data/lca-options';

export type SupplierLcaRow = typeof farmSupplierLcaOptions.$inferSelect;

export async function listSupplierLcaRows(): Promise<SupplierLcaRow[]> {
  return db.select().from(farmSupplierLcaOptions).orderBy(asc(farmSupplierLcaOptions.input), asc(farmSupplierLcaOptions.supplierName));
}

/** Supplier-specific options in the engine's option shape, for the basis selector. */
export async function listSupplierLcaOptions(): Promise<LcaOption[]> {
  const rows = await listSupplierLcaRows();
  return rows.map((r) => toLcaOption(r as SupplierLcaRowLike));
}
