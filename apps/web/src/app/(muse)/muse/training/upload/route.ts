import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { museTrainingDocs } from '@ct/db';
import { db } from '@/lib/db';
import { getMuseAccess } from '../../_lib/access';
import { listTrainingDocs } from '../../_lib/training';
import { docKeyFrom, nextVersion } from '../../_engine/training';
import { inferMime, MAX_UPLOAD_BYTES } from '../../_engine/sources';

/**
 * Upload a version of a training document. SUPER ADMIN ONLY.
 *
 * The upload creates a DRAFT — it never takes effect on its own. Publishing is
 * a separate, deliberate act, because taking a version live archives the one it
 * replaces and can ask the whole crew to read it again.
 *
 * A new `docKey` starts a family at v1; an existing one adds the next version.
 * A route handler rather than a server action: server actions cap the body far
 * below a scanned training manual.
 */
export async function POST(req: Request): Promise<Response> {
  const access = await getMuseAccess();
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
      { ok: false, error: `File is ${(file.size / 1048576).toFixed(1)} MB; in-app uploads are limited to ${MAX_UPLOAD_BYTES / 1048576} MB. Load a larger document with pnpm muse:training.` },
      { status: 413 },
    );
  }
  const mime = inferMime(file.name);
  if (!mime) return Response.json({ ok: false, error: 'Accepted types: PDF, XLSX, DOCX, CSV, TXT, MD.' }, { status: 415 });

  const title = String(form.get('title') ?? '').trim();
  if (!title) return Response.json({ ok: false, error: 'Give the document a title.' }, { status: 400 });

  const docs = await listTrainingDocs();
  // An existing family is named explicitly; otherwise the title starts one.
  const docKey = String(form.get('docKey') ?? '').trim() || docKeyFrom(title);
  const summary = String(form.get('summary') ?? '').trim() || null;
  const notes = String(form.get('notes') ?? '').trim() || null;
  // Defaults ON (Robert, 2026-09-15): a revision carries technical content, so
  // everyone reads it again unless the publisher says otherwise.
  const requiresRecompletion = String(form.get('requiresRecompletion') ?? 'true') !== 'false';
  const requiredAtOrientation = String(form.get('requiredAtOrientation') ?? 'true') !== 'false';

  const bytes = Buffer.from(await file.arrayBuffer());
  // The hash is recorded, not enforced: re-publishing an identical file is a
  // legitimate act (a version reinstated), and refusing it would hide that.
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const inserted = await db
    .insert(museTrainingDocs)
    .values({
      docKey,
      version: nextVersion(docs, docKey),
      title,
      summary,
      requiredAtOrientation,
      requiresRecompletion,
      fileName: file.name.replace(/[\\/]/g, '_').slice(0, 200),
      fileMime: mime,
      fileSize: bytes.byteLength,
      sha256,
      fileBytes: bytes,
      notes,
      uploadedBy: access.userId,
    })
    .returning({ id: museTrainingDocs.id, version: museTrainingDocs.version });

  revalidatePath('/muse', 'layout');
  return Response.json({ ok: true, id: inserted[0].id, version: inserted[0].version, docKey });
}
