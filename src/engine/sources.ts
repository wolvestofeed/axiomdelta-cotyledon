/**
 * MicroFarm — sources registry helpers (pure, no I/O).
 *
 * Used by the seed script, the upload route and the pages. The factor library
 * is the authority on provenance ids; these helpers only group and describe.
 */

import type { FactorProvenance } from '@/data/emission-factors';
import { FOOTPRINT_SEED } from '@/data/facility-design';

export type SourceKind =
  | 'study'
  | 'lca'
  | 'dataset'
  | 'regulation'
  | 'rate_schedule'
  | 'supplier_report'
  | 'spec_sheet'
  | 'other';

export const SOURCE_KINDS: { kind: SourceKind; label: string }[] = [
  { kind: 'study', label: 'Study' },
  { kind: 'lca', label: 'LCA' },
  { kind: 'dataset', label: 'Dataset' },
  { kind: 'regulation', label: 'Regulation' },
  { kind: 'rate_schedule', label: 'Rate schedule' },
  { kind: 'supplier_report', label: 'Supplier report' },
  { kind: 'spec_sheet', label: 'Spec sheet' },
  { kind: 'other', label: 'Other' },
];

export function isSourceKind(x: string): x is SourceKind {
  return SOURCE_KINDS.some((k) => k.kind === x);
}

/** Accepted upload types. Anything else is refused at the route. */
export const ACCEPTED_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
};

/** Vercel's request-body ceiling for a route handler, minus headroom. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export function inferMime(fileName: string): string | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return ACCEPTED_MIME[ext] ?? null;
}

/** Whether a stored file can be rendered inline in a frame (PDF) or must download. */
export function isInlineViewable(mime: string | null): boolean {
  return mime === 'application/pdf';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Group the factor library by publisher URL so each distinct publication
 * becomes one URL-only source with its factors as figures. The seed uses this
 * for every factor that has no stored document.
 */
export interface FactorSourceGroup {
  sourceUrl: string;
  title: string;
  kind: SourceKind;
  figures: FactorProvenance[];
}

function kindForUrl(url: string): SourceKind {
  if (/ecfr\.gov/.test(url)) return 'regulation';
  if (/austintexas\.gov|austinenergy\.com/.test(url)) return 'rate_schedule';
  if (/doi\.org/.test(url)) return 'study';
  return 'dataset';
}

/** The publisher text before the first comma or semicolon. */
function titleOf(f: FactorProvenance): string {
  return f.source.split(/[;,]/)[0].trim();
}

export function groupFactorsBySource(registry: FactorProvenance[]): FactorSourceGroup[] {
  const byUrl = new Map<string, FactorSourceGroup>();
  for (const f of registry) {
    let g = byUrl.get(f.sourceUrl);
    if (!g) {
      g = { sourceUrl: f.sourceUrl, title: '', kind: kindForUrl(f.sourceUrl), figures: [] };
      byUrl.set(f.sourceUrl, g);
    }
    g.figures.push(f);
  }
  // Title: the most common publisher text among the group's figures, so a
  // publication with many factors is named for itself, not for whichever
  // factor happened to be listed first.
  for (const g of byUrl.values()) {
    const counts = new Map<string, number>();
    for (const f of g.figures) counts.set(titleOf(f), (counts.get(titleOf(f)) ?? 0) + 1);
    g.title = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  }
  return [...byUrl.values()];
}

/** Human wording for each status tag, for exports. */
export const STATUS_RANK_LABEL: Record<string, string> = {
  SOURCED: 'cited primary publisher',
  STATED: 'supplied by the operator or a supplier',
  DERIVED: 'calculated from tagged rows',
  DATED: 'sourced, schedule year to confirm',
  UNCONFIRMED: 'cited via an aggregator, primary not yet read',
  PLACEHOLDER: 'working figure with no source',
};

/**
 * The manufacturer spec sheets the equipment footprints are read from (Facility page,
 * Roadmap Q1): one URL-only source per sheet, the items it sizes as the note. Registered
 * by `pnpm farm:sources` under the rule that every cited source is on the Sources page.
 */
export interface SpecSheetSource {
  sourceUrl: string;
  title: string;
  publisher: string;
  items: string[];
}

export function specSheetSources(): SpecSheetSource[] {
  const byUrl = new Map<string, SpecSheetSource>();
  for (const [item, f] of Object.entries(FOOTPRINT_SEED)) {
    if (!f.specSheetUrl) continue;
    const row = byUrl.get(f.specSheetUrl) ?? { sourceUrl: f.specSheetUrl, title: `${[f.manufacturer, f.model].filter(Boolean).join(' ')} — spec sheet`, publisher: f.manufacturer ?? 'Manufacturer', items: [] };
    row.items.push(item);
    byUrl.set(f.specSheetUrl, row);
  }
  return [...byUrl.values()];
}
