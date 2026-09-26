'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { farmSupplierLcaOptions, farmSourceFigures } from '@mf/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from './access';
import { leanSuppliersById } from './supplier-links';
import { supplierOptionId } from '../_engine/supplier-links';
import { listCropPlans } from './crop-plans';

/**
 * Supplier-specific LCA options. SUPER ADMIN ONLY.
 *
 * createSupplierLcaOption — records a figure a supplier supplied for one crop plan
 *   input, with its boundary and optionally the registered document. Also
 *   registers a source figure keyed by the option id so citations resolve to
 *   the supplier's document.
 * deleteSupplierLcaOption — removes the option and its source figure. A
 *   scenario that selected it falls back to the study mean.
 */

type Result = { ok: true; id?: string } | { ok: false; error: string };

const STATUS = ['SOURCED', 'STATED', 'PLACEHOLDER', 'UNCONFIRMED', 'DATED'] as const;

const CreateInput = z.object({
  supplierId: z.string().trim().min(1).max(120),
  input: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  kgCo2ePerKg: z.coerce.number().finite(),
  unitNote: z.string().trim().max(120).optional(),
  boundary: z.enum(['retail', 'slaughter_gate', 'farm_gate']),
  sourceId: z.string().uuid().optional().or(z.literal('')),
  status: z.enum(STATUS),
  note: z.string().trim().max(1000).optional(),
});

export async function createSupplierLcaOption(input: unknown): Promise<Result> {
  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  const d = parsed.data;
  // Any input on a crop plan in the library (Roadmap N9), not the reference crop plan's lines only.
  if (!(await listCropPlans()).some((r) => r.inputs.some((i) => i.name === d.input))) return { ok: false, error: 'Unknown input.' };
  const sup = leanSuppliersById([d.supplierId])[d.supplierId];
  if (!sup) return { ok: false, error: 'Supplier not found in the directory.' };

  const inserted = await db
    .insert(farmSupplierLcaOptions)
    .values({
      supplierId: d.supplierId,
      supplierName: sup.name,
      input: d.input,
      label: d.label,
      kgCo2ePerKg: d.kgCo2ePerKg,
      unitNote: d.unitNote || null,
      boundary: d.boundary,
      sourceId: d.sourceId || null,
      status: d.status,
      note: d.note || null,
      createdBy: access.userId,
    })
    .returning({ id: farmSupplierLcaOptions.id });
  const id = inserted[0].id;

  if (d.sourceId) {
    await db.insert(farmSourceFigures).values({
      sourceId: d.sourceId,
      provenanceId: supplierOptionId(id),
      label: `${sup.name}: ${d.label} (${d.input})`,
      valueText: String(d.kgCo2ePerKg),
      unit: d.unitNote || 'kg CO2e per kg',
      locator: null,
      status: d.status,
      note: d.note || null,
    });
  }
  revalidatePath('/farm', 'layout');
  return { ok: true, id };
}

export async function deleteSupplierLcaOption(id: string): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Bad id.' };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  await db.delete(farmSourceFigures).where(eq(farmSourceFigures.provenanceId, supplierOptionId(id)));
  await db.delete(farmSupplierLcaOptions).where(eq(farmSupplierLcaOptions.id, id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}
