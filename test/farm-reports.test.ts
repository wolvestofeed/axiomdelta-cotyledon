/**
 * Cotyledon — the Reports library (Roadmap Phase E): the catalog covers every
 * section of the main menu, admin-only reports are held from operators, and the
 * pure filter, sort and most-recently-viewed helpers behave.
 */

import { describe, it, expect } from 'vitest';
import { MODULES, SECTIONS } from '@/components/nav';
import {
  EMPTY_FILTER,
  RECENT_REPORTS_MAX,
  REPORT_CATALOG,
  REPORT_SECTIONS,
  filterReports,
  noteViewed,
  parseRecent,
  reportsFor,
  sectionsWithoutReports,
  sortReports,
  type ReportData,
  type ReportDef,
} from '@/engine/reports';

const ADVISORY = /\b(recommend|should|best|optimal|consider|we suggest)\b/i;

const item = (def: ReportDef, empty?: string): { def: ReportDef; data: ReportData } => ({
  def,
  data: { id: def.id, summary: { columns: [], rows: [] }, detail: null, detailCount: 0, basis: '', empty },
});

describe('farm reports — the catalog', () => {
  it('carries at least one report package for every section of the main menu', () => {
    expect(sectionsWithoutReports()).toEqual([]);
    for (const s of new Set(MODULES.map((m) => m.section))) expect(REPORT_CATALOG.some((r) => r.section === s)).toBe(true);
  });

  it('orders its sections as the main menu does', () => {
    expect(REPORT_SECTIONS).toEqual(SECTIONS.filter((s) => REPORT_CATALOG.some((r) => r.section === s)));
  });

  it('has unique ids and a module page behind every report', () => {
    const ids = REPORT_CATALOG.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of REPORT_CATALOG) expect(MODULES.some((m) => m.href === r.sourceHref)).toBe(true);
  });

  it('holds the company financials and staff data from operators', () => {
    const forOperators = reportsFor(false);
    expect(forOperators.some((r) => r.adminOnly)).toBe(false);
    expect(reportsFor(true).length).toBeGreaterThan(forOperators.length);
    // Every admin-only page's section still has a report an operator can open, or none at all.
    for (const r of REPORT_CATALOG.filter((x) => x.section === 'Financials & Accounting')) expect(r.adminOnly).toBe(true);
  });

  it('counsels nowhere in its copy', () => {
    for (const r of REPORT_CATALOG) {
      expect(r.title).not.toMatch(ADVISORY);
      expect(r.blurb).not.toMatch(ADVISORY);
    }
  });
});

describe('farm reports — filter and sort', () => {
  const all = REPORT_CATALOG.map((d) => item(d, d.id === 'supplier-catalogs' ? 'nothing' : undefined));

  it('filters by lens, by text and by having data', () => {
    expect(filterReports(all, { ...EMPTY_FILTER, theme: 'loss' }).every((r) => r.def.themes.includes('loss'))).toBe(true);
    expect(filterReports(all, { ...EMPTY_FILTER, q: 'stage records' }).map((r) => r.def.id)).toContain('stage-records');
    expect(filterReports(all, { ...EMPTY_FILTER, withDataOnly: true }).some((r) => r.def.id === 'supplier-catalogs')).toBe(false);
    expect(filterReports(all, EMPTY_FILTER)).toHaveLength(all.length);
  });

  it('sorts by menu order, by title, and by most recently viewed first', () => {
    const menu = sortReports([...all].reverse(), 'menu', []).map((r) => r.def.id);
    expect(menu).toEqual(REPORT_CATALOG.map((r) => r.id));
    const titles = sortReports(all, 'title', []).map((r) => r.def.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    const recent = sortReports(all, 'recent', ['waste-end-of-life', 'alerts-register']).map((r) => r.def.id);
    expect(recent.slice(0, 2)).toEqual(['waste-end-of-life', 'alerts-register']);
    expect(recent.slice(2)).toEqual(REPORT_CATALOG.map((r) => r.id).filter((id) => id !== 'waste-end-of-life' && id !== 'alerts-register'));
  });
});

describe('farm reports — most recently viewed', () => {
  it('puts the viewed report first, once, and keeps five', () => {
    let r: string[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) r = noteViewed(r, id);
    expect(r).toEqual(['f', 'e', 'd', 'c', 'b']);
    expect(r).toHaveLength(RECENT_REPORTS_MAX);
    expect(noteViewed(r, 'c')).toEqual(['c', 'f', 'e', 'd', 'b']);
  });

  it('reads a stored list back only as ids the catalog knows', () => {
    expect(parseRecent(undefined)).toEqual([]);
    expect(parseRecent('not json')).toEqual([]);
    expect(parseRecent(JSON.stringify(['alerts-register', 'nope', 'alerts-register', 42, 'unit-cost']))).toEqual(['alerts-register', 'unit-cost']);
    expect(parseRecent(JSON.stringify(REPORT_CATALOG.map((r) => r.id)))).toHaveLength(RECENT_REPORTS_MAX);
  });
});
