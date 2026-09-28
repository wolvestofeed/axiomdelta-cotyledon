import 'server-only';
import ExcelJS from 'exceljs';
import { BRAND_LINE } from '@/components/ui';
import type { FarmAccess } from '@/server/access';
import { buildReportLibrary } from '@/server/reports';
import { REPORT_THEME_LABELS, REPORT_WORLD_LABELS, type ReportData, type ReportDef, type ReportTable } from '@/engine/reports';

/**
 * Cotyledon — a report package as a workbook (Roadmap Phase E). Follows the
 * evidence-pack pattern (exceljs): one Read Me sheet naming the basis of every
 * report in the file, then one sheet per report holding its summary rows, a
 * blank row, and its detail rows. The rows are the library's own — nothing is
 * recomputed for the file — so the workbook equals the page.
 */

function widths(ws: ExcelJS.Worksheet): void {
  ws.columns.forEach((c) => {
    let w = 10;
    c.eachCell?.({ includeEmpty: false }, (cell) => {
      w = Math.max(w, Math.min(60, String(cell.value ?? '').length + 2));
    });
    c.width = w;
  });
}

function writeTable(ws: ExcelJS.Worksheet, heading: string, t: ReportTable): void {
  ws.addRow([heading]).font = { bold: true, size: 12 };
  ws.addRow(t.columns.map((c) => c.label)).font = { bold: true };
  for (const r of t.rows) {
    const added = ws.addRow(r.cells.map((c) => (c === null ? '' : c)));
    if (r.tone === 'total') added.font = { bold: true };
  }
  ws.addRow([]);
}

/** Excel limits a sheet name to 31 characters, none of `[]:*?/\`. */
function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28);
  let name = base;
  let n = 2;
  while (used.has(name)) name = `${base.slice(0, 25)} ${n++}`;
  used.add(name);
  return name;
}

export async function buildReportWorkbook(access: FarmAccess, pick: { section?: string; report?: string }): Promise<{ buffer: Buffer; fileName: string } | null> {
  const library = await buildReportLibrary(access);
  const chosen: { def: ReportDef; data: ReportData }[] = library.reports.filter((r) => (pick.report ? r.def.id === pick.report : pick.section ? r.def.section === pick.section : true));
  if (chosen.length === 0) return null;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Cotyledon';
  wb.created = new Date();

  const readme = wb.addWorksheet('Read Me');
  readme.addRow([`${BRAND_LINE} — Reports`]).font = { bold: true, size: 13 };
  readme.addRow([`Prepared ${library.today}. ${library.worldLabel}.`]);
  readme.addRow([]);
  readme.addRow(['Report', 'Section', 'Lens', 'World', 'Basis', 'Summary rows', 'Detail rows']).font = { bold: true };
  for (const { def, data } of chosen) {
    readme.addRow([def.title, def.section, def.themes.map((t) => REPORT_THEME_LABELS[t]).join(' · '), REPORT_WORLD_LABELS[def.world], data.basis, data.summary.rows.length, data.detailCount]);
  }
  readme.addRow([]);
  readme.addRow(['Every row equals the row on the Reports page at the moment of export; the module page named beside each report carries the full detail. The file states figures and their basis; it does not counsel.']);
  readme.eachRow((r) => {
    r.alignment = { wrapText: true, vertical: 'top' };
  });
  widths(readme);

  const used = new Set<string>(['Read Me']);
  for (const { def, data } of chosen) {
    const ws = wb.addWorksheet(sheetName(def.title, used));
    ws.addRow([def.title]).font = { bold: true, size: 13 };
    ws.addRow([def.blurb]);
    ws.addRow([`Basis: ${data.basis}`]);
    if (data.empty) ws.addRow([data.empty]);
    ws.addRow([]);
    writeTable(ws, 'Summary', data.summary);
    if (data.detail && data.detail.rows.length > 0) writeTable(ws, 'Detail', data.detail);
    widths(ws);
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const stem = pick.report ? pick.report : pick.section ? pick.section.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : 'library';
  return { buffer, fileName: `farm-reports-${stem}-${library.today}.xlsx` };
}
