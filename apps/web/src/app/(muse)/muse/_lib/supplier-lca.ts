import 'server-only';
import { asc } from 'drizzle-orm';
import { museSupplierLcaOptions } from '@ct/db';
import { db } from '@/lib/db';
import { toLcaOption, type SupplierLcaRowLike } from '../_engine/supplier-links';
import type { LcaOption } from '../_data/lca-options';

export type SupplierLcaRow = typeof museSupplierLcaOptions.$inferSelect;

export async function listSupplierLcaRows(): Promise<SupplierLcaRow[]> {
  return db.select().from(museSupplierLcaOptions).orderBy(asc(museSupplierLcaOptions.ingredient), asc(museSupplierLcaOptions.supplierName));
}

/** Supplier-specific options in the engine's option shape, for the basis selector. */
export async function listSupplierLcaOptions(): Promise<LcaOption[]> {
  const rows = await listSupplierLcaRows();
  return rows.map((r) => toLcaOption(r as SupplierLcaRowLike));
}
