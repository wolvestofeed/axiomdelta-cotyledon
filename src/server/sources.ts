import 'server-only';
import { asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { farmSources, farmSourceFigures } from '@/db';
import { db } from '@/lib/db';

/**
 * MicroFarm — sources registry read layer (server-only).
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
  id: farmSources.id,
  kind: farmSources.kind,
  title: farmSources.title,
  authors: farmSources.authors,
  publisher: farmSources.publisher,
  year: farmSources.year,
  citation: farmSources.citation,
  sourceUrl: farmSources.sourceUrl,
  licenceNote: farmSources.licenceNote,
  status: farmSources.status,
  notes: farmSources.notes,
  fileName: farmSources.fileName,
  fileMime: farmSources.fileMime,
  fileSize: farmSources.fileSize,
  sha256: farmSources.sha256,
  uploadedBy: farmSources.uploadedBy,
  uploadedAt: farmSources.uploadedAt,
  createdAt: farmSources.createdAt,
  updatedAt: farmSources.updatedAt,
};

export async function listSources(): Promise<SourceListItem[]> {
  const rows = await db
    .select({
      ...metaColumns,
      figureCount: sql<number>`(select count(*) from ${farmSourceFigures} where ${farmSourceFigures.sourceId} = ${farmSources.id})`,
    })
    .from(farmSources)
    // Stored documents first; then by kind in the page's order, with spec sheets last; then by title.
    .orderBy(desc(isNotNull(farmSources.fileName)), asc(sql`array_position(array['study','lca','dataset','regulation','rate_schedule','supplier_report','other','spec_sheet'], ${farmSources.kind})`), asc(farmSources.title));
  return rows.map((r) => ({ ...r, figureCount: Number(r.figureCount) }));
}

export type SourceMeta = Omit<typeof farmSources.$inferSelect, 'fileBytes' | 'workspaceId'>;

export async function getSource(id: string): Promise<SourceMeta | null> {
  const rows = await db.select(metaColumns).from(farmSources).where(eq(farmSources.id, id)).limit(1);
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
    .select({ fileName: farmSources.fileName, fileMime: farmSources.fileMime, fileBytes: farmSources.fileBytes })
    .from(farmSources)
    .where(eq(farmSources.id, id))
    .limit(1);
  const r = rows[0];
  if (!r || !r.fileBytes || !r.fileName) return null;
  return { fileName: r.fileName, fileMime: r.fileMime ?? 'application/octet-stream', bytes: Buffer.from(r.fileBytes) };
}

export type SourceFigure = typeof farmSourceFigures.$inferSelect;

export async function listFigures(sourceId: string): Promise<SourceFigure[]> {
  return db
    .select()
    .from(farmSourceFigures)
    .where(eq(farmSourceFigures.sourceId, sourceId))
    .orderBy(asc(farmSourceFigures.label));
}

/** Resolve a factor-library provenance id to its source and figure, if registered. */
export async function findByProvenance(
  provenanceId: string,
): Promise<{ sourceId: string; figureId: string } | null> {
  const rows = await db
    .select({ sourceId: farmSourceFigures.sourceId, figureId: farmSourceFigures.id })
    .from(farmSourceFigures)
    .where(eq(farmSourceFigures.provenanceId, provenanceId))
    .limit(1);
  return rows[0] ?? null;
}
