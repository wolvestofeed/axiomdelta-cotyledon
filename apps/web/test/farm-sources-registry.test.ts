/**
 * MicroFarm — every cited source is on the Sources page.
 *
 * The rule in docs/farm/CLAUDE.md §5: a source of data the platform cites publicly is
 * registered in `farm.sources`, through the factor library or the reference register.
 * This test scans every URL in `_data/*.ts` and `_engine/*.ts` and fails when one is in
 * neither. Supplier and producer websites in the compiled directory are a directory
 * listing, not a source of data, and live in JSON, which is not scanned.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { factorRegistry } from '@/app/(farm)/farm/_data/emission-factors';
import { NON_SOURCE_URL_PATTERNS, REFERENCE_SOURCES, registeredUrls } from '@/app/(farm)/farm/_data/sources-registry';
import { specSheetSources } from '@/app/(farm)/farm/_engine/sources';

const FARM = join(__dirname, '..', 'src', 'app', '(farm)', 'farm');
const norm = (u: string) => u.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();

function citedUrls(): { url: string; file: string }[] {
  const out: { url: string; file: string }[] = [];
  for (const dir of ['_data', '_engine']) {
    for (const name of readdirSync(join(FARM, dir))) {
      if (!name.endsWith('.ts')) continue;
      const text = readFileSync(join(FARM, dir, name), 'utf8');
      for (const m of text.matchAll(/https?:\/\/[^\s'"`]+/g)) out.push({ url: m[0], file: `${dir}/${name}` });
    }
  }
  return out;
}

describe('farm sources — the register', () => {
  it('registers every URL the data and engine files cite', () => {
    const registered = registeredUrls([...factorRegistry.map((f) => f.sourceUrl), ...specSheetSources().map((s) => s.sourceUrl)]);
    const missing = citedUrls()
      .filter(({ url }) => !NON_SOURCE_URL_PATTERNS.some((p) => p.test(url)))
      .filter(({ url }) => !registered.has(norm(url)))
      .map(({ url, file }) => `${file}: ${url}`);
    expect(missing, 'Cited but not registered on the Sources page — add a row to _data/sources-registry.ts').toEqual([]);
  });

  it('keeps every reference source whole: a key, a kind, a publisher and what it is used for', () => {
    const keys = REFERENCE_SOURCES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of REFERENCE_SOURCES) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.publisher.length).toBeGreaterThan(0);
      expect(s.usedFor.length).toBeGreaterThan(0);
      if (s.sourceUrl) expect(s.sourceUrl).toMatch(/^https?:\/\//);
    }
  });

  it('covers the jurisdictions the platform relies on', () => {
    const publishers = REFERENCE_SOURCES.map((s) => s.publisher).join(' | ');
    for (const p of ['City of Austin', 'Austin Public Health', 'Texas Department of State Health Services', 'Texas Department of Agriculture', 'USDA', 'U.S. Food and Drug Administration', 'Financial Accounting Standards Board']) {
      expect(publishers).toContain(p);
    }
  });
});
