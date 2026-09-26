import 'server-only';
import { asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { museSources, museSourceFigures } from '@ct/db';
import { db } from '@/lib/db';

/**
 * Impact OS — sources registry read layer (server-only).
 *
 * Metadata queries never select `file_bytes`; only `getSourceFile` does, and
 * only the file route calls it.
 */

export interface SourceListItem {
  id: string;
  kind: string;
  title: string;
  authors: string | null;
  publisher: string | null;
  year: number | null;
  sourceUrl: string | null;
  status: string;
  fileName: string | null;
  fileMime: string | null;
  fileSize: number | null;
  figureCount: number;
  uploadedAt: Date | null;
  createdAt: Date;
}

const metaColumns = {
  id: museSources.id,
  kind: museSources.kind,
  title: museSources.title,
  authors: museSources.authors,
  publisher: museSources.publisher,
  year: museSources.year,
  citation: museSources.citation,
  sourceUrl: museSources.sourceUrl,
  licenceNote: museSources.licenceNote,
  status: museSources.status,
  notes: museSources.notes,
  fileName: museSources.fileName,
  fileMime: museSources.fileMime,
  fileSize: museSources.fileSize,
  sha256: museSources.sha256,
  uploadedBy: museSources.uploadedBy,
  uploadedAt: museSources.uploadedAt,
  createdAt: museSources.createdAt,
  updatedAt: museSources.updatedAt,
};

export async function listSources(): Promise<SourceListItem[]> {
  const rows = await db
    .select({
      ...metaColumns,
      figureCount: sql<number>`(select count(*) from ${museSourceFigures} where ${museSourceFigures.sourceId} = ${museSources.id})`,
    })
    .from(museSources)
    // Stored documents first; then by kind in the page's order, with spec sheets last (Robert, 2026-09-18); then by title.
    .orderBy(desc(isNotNull(museSources.fileName)), asc(sql`array_position(array['study','lca','dataset','regulation','rate_schedule','supplier_report','other','spec_sheet'], ${museSources.kind})`), asc(museSources.title));
  return rows.map((r) => ({ ...r, figureCount: Number(r.figureCount) }));
}

export type SourceMeta = Omit<typeof museSources.$inferSelect, 'fileBytes'>;

export async function getSource(id: string): Promise<SourceMeta | null> {
  const rows = await db.select(metaColumns).from(museSources).where(eq(museSources.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface SourceFile {
  fileName: string;
  fileMime: string;
  bytes: Buffer;
}

/** The stored document. Only the file route calls this. */
export async function getSourceFile(id: string): Promise<SourceFile | null> {
  const rows = await db
    .select({ fileName: museSources.fileName, fileMime: museSources.fileMime, fileBytes: museSources.fileBytes })
    .from(museSources)
    .where(eq(museSources.id, id))
    .limit(1);
  const r = rows[0];
  if (!r || !r.fileBytes || !r.fileName) return null;
  return { fileName: r.fileName, fileMime: r.fileMime ?? 'application/octet-stream', bytes: Buffer.from(r.fileBytes) };
}

export type SourceFigure = typeof museSourceFigures.$inferSelect;

export async function listFigures(sourceId: string): Promise<SourceFigure[]> {
  return db
    .select()
    .from(museSourceFigures)
    .where(eq(museSourceFigures.sourceId, sourceId))
    .orderBy(asc(museSourceFigures.label));
}

/** Resolve a factor-library provenance id to its source and figure, if registered. */
export async function findByProvenance(
  provenanceId: string,
): Promise<{ sourceId: string; figureId: string } | null> {
  const rows = await db
    .select({ sourceId: museSourceFigures.sourceId, figureId: museSourceFigures.id })
    .from(museSourceFigures)
    .where(eq(museSourceFigures.provenanceId, provenanceId))
    .limit(1);
  return rows[0] ?? null;
}
