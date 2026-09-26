import { describe, it, expect } from 'vitest';
import {
  inferMime,
  isInlineViewable,
  formatBytes,
  groupFactorsBySource,
  isSourceKind,
  MAX_UPLOAD_BYTES,
} from '@/engine/sources';
import { factorRegistry } from '@/data/emission-factors';

describe('farm sources — helpers', () => {
  it('infers accepted types and refuses others', () => {
    expect(inferMime('deck.PDF')).toBe('application/pdf');
    expect(inferMime('data.xlsx')).toContain('spreadsheetml');
    expect(inferMime('notes.docx')).toContain('wordprocessingml');
    expect(inferMime('malware.exe')).toBeNull();
    expect(inferMime('noext')).toBeNull();
  });
  it('only PDFs render inline', () => {
    expect(isInlineViewable('application/pdf')).toBe(true);
    expect(isInlineViewable(inferMime('a.xlsx'))).toBe(false);
    expect(isInlineViewable(null)).toBe(false);
  });
  it('formats sizes and caps uploads under the route-handler ceiling', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(20 * 1024)).toBe('20 KB');
    expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.5 MB');
    expect(MAX_UPLOAD_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
  it('recognises kinds', () => {
    expect(isSourceKind('lca')).toBe(true);
    expect(isSourceKind('memo')).toBe(false);
  });
});

describe('farm sources — factor library grouping', () => {
  it('groups every factor under one source per publisher URL, none lost', () => {
    const groups = groupFactorsBySource(factorRegistry);
    const total = groups.reduce((n, g) => n + g.figures.length, 0);
    expect(total).toBe(factorRegistry.length);
    expect(new Set(groups.map((g) => g.sourceUrl)).size).toBe(groups.length);
    for (const g of groups) expect(g.title).toMatch(/\S/);
  });
  it('names a multi-factor publication for itself, not for its first factor', () => {
    const groups = groupFactorsBySource(factorRegistry);
    const hub = groups.find((g) => /ghg-emission-factors-hub-2025/.test(g.sourceUrl))!;
    expect(hub.title).toBe('EPA GHG Emission Factors Hub');
    expect(hub.figures.length).toBe(6);
  });
  it('classifies regulation, rate schedule and study by URL', () => {
    const groups = groupFactorsBySource(factorRegistry);
    const by = (re: RegExp) => groups.find((g) => re.test(g.sourceUrl))!;
    expect(by(/ecfr\.gov/).kind).toBe('regulation');
    expect(by(/austintexas\.gov/).kind).toBe('rate_schedule');
    expect(by(/doi\.org/).kind).toBe('study');
    expect(by(/epa\.gov\/egrid/).kind).toBe('dataset');
  });
  it('the 43 input factors share the study source with the dataset provenance', () => {
    const groups = groupFactorsBySource(factorRegistry);
    const study = groups.find((g) => /doi\.org/.test(g.sourceUrl))!;
    expect(study.figures.length).toBe(44);
    expect(study.figures.some((f) => f.id === 'poore-nemecek-2018:data-s2')).toBe(true);
  });
});
