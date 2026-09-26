import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { farmSources } from '@mf/db';
import { db } from '@/lib/db';
import { getFarmAccess } from '../../_lib/access';
import { inferMime, isSourceKind, MAX_UPLOAD_BYTES } from '../../_engine/sources';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

/**
 * Register a document by upload. SUPER ADMIN ONLY. Multipart body with the
 * file plus metadata fields. The file is stored inline; a duplicate (same
 * SHA-256) returns the existing source instead of a second copy. Files above
 * the route-handler ceiling are refused here with a message; larger documents
 * load through `pnpm farm:sources` from the research folder.
 */
export async function POST(...args: Parameters<typeof POSTInner>): ReturnType<typeof POSTInner> {
  return withWorkspace(() => POSTInner(...args));
}

async function POSTInner(req: Request): Promise<Response> {
  const access = await getFarmAccess();
  if (!access.isSuperAdmin || !access.userId) {
    return Response.json({ ok: false, error: 'Super admin only.' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: 'Could not read the upload.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ ok: false, error: 'Choose a file.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { ok: false, error: `File is ${(file.size / 1048576).toFixed(1)} MB; in-app uploads are limited to ${MAX_UPLOAD_BYTES / 1048576} MB. Load larger documents with pnpm farm:sources.` },
      { status: 413 },
    );
  }
  const mime = inferMime(file.name);
  if (!mime) return Response.json({ ok: false, error: 'Accepted types: PDF, XLSX, DOCX, CSV, TXT, MD.' }, { status: 415 });

  const title = String(form.get('title') ?? '').trim();
  if (!title) return Response.json({ ok: false, error: 'Give the document a title.' }, { status: 400 });
  const kindRaw = String(form.get('kind') ?? 'other');
  const kind = isSourceKind(kindRaw) ? kindRaw : 'other';
  const str = (k: string, max = 500) => {
    const v = String(form.get(k) ?? '').trim();
    return v ? v.slice(0, max) : null;
  };
  const yearRaw = Number(form.get('year'));
  const year = Number.isInteger(yearRaw) && yearRaw >= 1900 && yearRaw <= 2100 ? yearRaw : null;

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const existing = await db.select({ id: farmSources.id }).from(farmSources).where(eq(farmSources.sha256, sha256)).limit(1);
  if (existing[0]) {
    return Response.json({ ok: true, id: existing[0].id, duplicate: true });
  }

  const inserted = await db
    .insert(farmSources)
    .values({
      kind,
      title,
      authors: str('authors', 300),
      publisher: str('publisher', 200),
      year,
      citation: str('citation'),
      sourceUrl: str('sourceUrl'),
      licenceNote: str('licenceNote'),
      status: 'SOURCED',
      notes: str('notes', 2000),
      fileName: file.name.replace(/[\\/]/g, '_').slice(0, 200),
      fileMime: mime,
      fileSize: bytes.byteLength,
      sha256,
      fileBytes: bytes,
      uploadedBy: access.userId,
      uploadedAt: new Date(),
    })
    .returning({ id: farmSources.id });

  revalidatePath('/farm/sources', 'layout');
  return Response.json({ ok: true, id: inserted[0].id, duplicate: false });
}
