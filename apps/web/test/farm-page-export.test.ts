/**
 * MicroFarm — a module page exported as it stands (Roadmap Phase E follow-up):
 * the body a page posts is bounded and validated, sheet names obey Excel, and
 * the workbook holds the page's figures and tables as rendered.
 */

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { PAGE_EXPORT_LIMITS, cellText, pageExportFileName, pageExportSchema, sheetNameFor, type PageExport } from '@/app/(farm)/farm/_engine/page-export';
import { buildPageWorkbook } from '@/app/(farm)/farm/_lib/page-export';

const page: PageExport = {
  kind: 'farm.page_export',
  title: 'Inventory',
  path: '/farm/inventory',
  context: 'Actual — the recorded documents',
  figures: [
    { label: 'Units on hand', value: '1,250', sub: 'as of 2026-09-18' },
    { label: 'Blackout shelf life', value: '7 days', sub: '' },
  ],
  tables: [
    { heading: 'Finished goods on hand', columns: ['Lot', 'Units', 'Share'], rows: [['B-1', '1,000', '80.0%'], ['B-2', '250', '20.0%']] },
    { heading: 'Raw materials on hand — by use-by, earliest first', columns: ['Input', 'Value'], rows: [['Rice', '$1,234.50']] },
    { heading: 'Raw materials on hand — by use-by, earliest first', columns: ['Input'], rows: [] },
  ],
};

describe('farm page export — the body', () => {
  it('accepts a well-formed page and refuses the unexpected', () => {
    expect(pageExportSchema.safeParse(page).success).toBe(true);
    expect(pageExportSchema.safeParse({ ...page, kind: 'other' }).success).toBe(false);
    expect(pageExportSchema.safeParse({ ...page, extra: 1 }).success).toBe(false);
    expect(pageExportSchema.safeParse({ ...page, tables: [{ heading: 'x', columns: [], rows: [[1]] }] }).success).toBe(false);
  });

  it('bounds tables, rows and cells', () => {
    const tooManyRows = { ...page, tables: [{ heading: 'x', columns: ['a'], rows: Array.from({ length: PAGE_EXPORT_LIMITS.rows + 1 }, () => ['r']) }] };
    expect(pageExportSchema.safeParse(tooManyRows).success).toBe(false);
    const longCell = { ...page, tables: [{ heading: 'x', columns: ['a'], rows: [['x'.repeat(PAGE_EXPORT_LIMITS.cell + 1)]] }] };
    expect(pageExportSchema.safeParse(longCell).success).toBe(false);
    expect(cellText('  a \n  b\t c ')).toBe('a b c');
  });

  it('names sheets within Excel\'s rules and keeps them unique', () => {
    const used = new Set<string>();
    const a = sheetNameFor('Raw materials on hand — by use-by, earliest first', used);
    const b = sheetNameFor('Raw materials on hand — by use-by, earliest first', used);
    expect(a.length).toBeLessThanOrEqual(31);
    expect(b).not.toBe(a);
    expect(sheetNameFor('A/B: [c]?*\\', used)).not.toMatch(/[[\]:*?/\\]/);
    expect(sheetNameFor('', used, 'Table 4')).toBe('Table 4');
    expect(pageExportFileName('Profit & Loss', '2026-09-18')).toBe('farm-profit-loss-2026-09-18.xlsx');
  });
});

describe('farm page export — the workbook', () => {
  it('holds the figures and every table as rendered, numbers as numbers', async () => {
    const { buffer, fileName } = await buildPageWorkbook(page, '2026-09-18 16:40');
    expect(fileName).toBe('farm-inventory-2026-09-18.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const names = wb.worksheets.map((w) => w.name);
    expect(names[0]).toBe('Read Me');
    expect(names[1]).toBe('Figures');
    expect(names).toHaveLength(2 + page.tables.length);
    expect(new Set(names).size).toBe(names.length);
    const figures = wb.getWorksheet('Figures')!;
    expect(figures.getRow(2).getCell(1).value).toBe('Units on hand');
    expect(figures.getRow(2).getCell(2).value).toBe(1250);
    const t1 = wb.worksheets[2]!;
    expect(t1.getRow(1).getCell(1).value).toBe('Finished goods on hand');
    expect(t1.getRow(2).values).toEqual([undefined, 'Lot', 'Units', 'Share']);
    expect(t1.getRow(3).getCell(2).value).toBe(1000);
    expect(t1.getRow(3).getCell(3).value).toBeCloseTo(0.8);
    const t2 = wb.worksheets[3]!;
    expect(t2.getRow(3).getCell(2).value).toBe(1234.5);
    const readme = wb.getWorksheet('Read Me')!;
    expect(String(readme.getRow(1).getCell(1).value)).toContain('Inventory');
    expect(readme.getRow(4).getCell(2).value).toBe(page.context);
  });
});
