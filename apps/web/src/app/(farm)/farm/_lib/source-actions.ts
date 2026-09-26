'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { farmSources } from '@mf/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from './access';
import { isSourceKind } from '../_engine/sources';

/**
 * MicroFarm — sources registry write actions. SUPER ADMIN ONLY.
 *
 *   updateSourceMeta — edit title, kind, authors, publisher, year, citation,
 *                      URL, licence note, status and notes. Never touches the
 *                      file or the figures.
 *   deleteSource     — removes the document and its figures (cascade). A cited
 *                      figure then falls back to the factor registry.
 *
 * File upload is a route handler (multipart body), not an action.
 */

type OkResult = { ok: true } | { ok: false; error: string };

const STATUS = ['SOURCED', 'STATED', 'PLACEHOLDER', 'DERIVED', 'UNCONFIRMED', 'DATED'] as const;

const MetaInput = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  kind: z.string().refine(isSourceKind, 'Unknown kind'),
  authors: z.string().trim().max(300).optional(),
  publisher: z.string().trim().max(200).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  citation: z.string().trim().max(500).optional(),
  sourceUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
  licenceNote: z.string().trim().max(500).optional(),
  status: z.enum(STATUS),
  notes: z.string().trim().max(2000).optional(),
});

export async function updateSourceMeta(input: unknown): Promise<OkResult> {
  const parsed = MetaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  const d = parsed.data;
  await db
    .update(farmSources)
    .set({
      title: d.title,
      kind: d.kind,
      authors: d.authors || null,
      publisher: d.publisher || null,
      year: d.year ?? null,
      citation: d.citation || null,
      sourceUrl: d.sourceUrl || null,
      licenceNote: d.licenceNote || null,
      status: d.status,
      notes: d.notes || null,
      updatedAt: new Date(),
    })
    .where(eq(farmSources.id, d.id));
  revalidatePath('/farm/sources', 'layout');
  return { ok: true };
}

export async function deleteSource(id: string): Promise<OkResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Bad id.' };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  await db.delete(farmSources).where(eq(farmSources.id, id));
  revalidatePath('/farm/sources', 'layout');
  return { ok: true };
}
