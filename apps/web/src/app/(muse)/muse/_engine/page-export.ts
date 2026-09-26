/**
 * Impact OS — a module page exported as it stands (Roadmap Phase E follow-up).
 * Pure, client-safe.
 *
 * The Reports library carries summary rows and a bounded detail; the full detail
 * a module page shows is exported from the page itself. The export is the page:
 * the button reads the figures and tables rendered on it — every KPI tile and
 * every table in the content, each under the card title it sits in — and the
 * server writes them into a workbook. Nothing is recomputed for the file, so
 * the workbook equals what the reader saw, in the world and period they had
 * selected. A tabbed page exports the open tab, as print does.
 */

import { z } from 'zod';

export const PAGE_EXPORT_LIMITS = {
  /** Tables on one page. */
  tables: 60,
  /** Rows in one table. */
  rows: 10_000,
  /** Columns in one table. */
  columns: 80,
  /** Characters in one cell. */
  cell: 2_000,
  /** KPI tiles on one page. */
  figures: 200,
} as const;

const cell = z.string().max(PAGE_EXPORT_LIMITS.cell);

export const pageExportSchema = z
  .object({
    kind: z.literal('muse.page_export'),
    /** The page title, as the header shows it. */
    title: z.string().min(1).max(200),
    /** The page's path, for the file's Read Me. */
    path: z.string().max(300),
    /** The scenario bar's world and forecast, as the reader saw them; empty when the page has none. */
    context: z.string().max(400),
    figures: z
      .array(z.object({ label: cell, value: cell, sub: cell }).strict())
      .max(PAGE_EXPORT_LIMITS.figures),
    tables: z
      .array(
        z
          .object({
            heading: z.string().max(300),
            columns: z.array(cell).max(PAGE_EXPORT_LIMITS.columns),
            rows: z.array(z.array(cell).max(PAGE_EXPORT_LIMITS.columns)).max(PAGE_EXPORT_LIMITS.rows),
          })
          .strict(),
      )
      .max(PAGE_EXPORT_LIMITS.tables),
  })
  .strict();

export type PageExport = z.infer<typeof pageExportSchema>;

/** Excel limits a sheet name to 31 characters, none of `[]:*?/\`; names are unique within a workbook. */
export function sheetNameFor(heading: string, used: Set<string>, fallback = 'Table'): string {
  const clean = heading.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim();
  const base = (clean || fallback).slice(0, 28) || fallback;
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 25)} ${n++}`;
  used.add(name.toLowerCase());
  return name;
}

export function pageExportFileName(title: string, date: string): string {
  const stem = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'page';
  return `muse-${stem}-${date}.xlsx`;
}

/** Collapse the whitespace a rendered cell carries; a cell with nothing in it is empty, never a dash. */
export const cellText = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, PAGE_EXPORT_LIMITS.cell);
