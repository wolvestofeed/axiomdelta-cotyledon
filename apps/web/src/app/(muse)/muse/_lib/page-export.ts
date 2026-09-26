import 'server-only';
import ExcelJS from 'exceljs';
import { BRAND_LINE } from '../_components/ui';
import { pageExportFileName, sheetNameFor, type PageExport } from '../_engine/page-export';

/**
 * Impact OS — a module page as a workbook (Roadmap Phase E follow-up). Follows the
 * evidence-pack pattern (exceljs): a Read Me sheet naming the page, the path, the
 * world the reader had selected and when; a Figures sheet of the KPI tiles; then
 * one sheet per table, each under the card title it sat in. The rows are the
 * page's own as rendered — nothing is recomputed for the file.
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

/** A rendered figure back to a number where it is one, so the sheet sums; text stays text. */
function cellValue(s: string): string | number {
  const t = s.replace(/[$,]/g, '').replace(/^−/, '-').trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^-?\d+(\.\d+)?%$/.test(t)) return Number(t.slice(0, -1)) / 100;
  return s;
}

export async function buildPageWorkbook(page: PageExport, preparedAt: string): Promise<{ buffer: Buffer; fileName: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Muse Kitchen Impact OS';
  wb.created = new Date();

  const readme = wb.addWorksheet('Read Me');
  readme.addRow([`${BRAND_LINE} — ${page.title}`]).font = { bold: true, size: 13 };
  readme.addRow(['Prepared', preparedAt]);
  readme.addRow(['Page', page.path]);
  if (page.context) readme.addRow(['As selected in the scenario bar', page.context]);
  readme.addRow(['Figures', page.figures.length]);
  readme.addRow(['Tables', page.tables.length]);
  readme.addRow([]);
  readme.addRow(['The workbook is the page as it stood when exported: every figure and table shown, in the world and period selected, unsaved edits included. A tabbed page exports the open tab. Figures that read as numbers on the page are numbers here; nothing is recomputed. The file states figures; it does not counsel.']);
  readme.eachRow((r) => {
    r.alignment = { wrapText: true, vertical: 'top' };
  });
  widths(readme);

  const used = new Set<string>(['read me']);
  if (page.figures.length > 0) {
    const ws = wb.addWorksheet(sheetNameFor('Figures', used));
    ws.addRow(['Figure', 'Value', 'Note']).font = { bold: true };
    for (const f of page.figures) ws.addRow([f.label, cellValue(f.value), f.sub]);
    widths(ws);
  }

  page.tables.forEach((t, i) => {
    const ws = wb.addWorksheet(sheetNameFor(t.heading, used, `Table ${i + 1}`));
    if (t.heading) ws.addRow([t.heading]).font = { bold: true, size: 12 };
    if (t.columns.length > 0) {
      ws.addRow(t.columns).font = { bold: true };
      ws.views = [{ state: 'frozen', ySplit: t.heading ? 2 : 1 }];
    }
    for (const r of t.rows) ws.addRow(r.map(cellValue));
    widths(ws);
  });

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, fileName: pageExportFileName(page.title, preparedAt.slice(0, 10)) };
}
