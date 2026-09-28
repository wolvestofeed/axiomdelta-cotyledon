/**
 * Cotyledon — page headers (page-headers build plan U8). A header's purpose
 * line stays inside its budget; a migrated page carries no lede; the nav has
 * no blurb field (decision D4).
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PURPOSE_MAX_CHARS } from '@/components/ui';
import { MODULES } from '@/components/nav';

const FARM = join(__dirname, '..', 'src', 'app', '(farm)');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out.sort();
}

/**
 * Every header is on the slots (U2–U6, 2026-09-19). A `lede` anywhere else is a regression. The two
 * exceptions carry a subtitle that is not a purpose sentence: a source's byline and a supplier's location.
 */
const LEDE_ALLOWED = ['farm/sources/[id]/page.tsx', 'farm/suppliers/[id]/page.tsx'];

const files = walk(FARM);

describe('page headers', () => {
  it('every purpose line is one sentence inside the budget', () => {
    const over: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/purpose="([^"]*)"/g)) {
        const text = m[1]!;
        if (text.length > PURPOSE_MAX_CHARS) over.push(`${relative(FARM, f)}: ${text.length} chars`);
        if (/[.!?]\s+\S/.test(text)) over.push(`${relative(FARM, f)}: more than one sentence`);
      }
    }
    expect(over).toEqual([]);
  });

  it('no page carries a lede, beyond the two subtitles', () => {
    const stale = files.filter((f) => /\blede=/.test(readFileSync(f, 'utf8'))).map((f) => relative(FARM, f)).filter((rel) => !LEDE_ALLOWED.includes(rel));
    expect(stale).toEqual([]);
  });

  it('"On this page" carries two to five names', () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/functions=\{\[([^\]]*)\]\}/g)) {
        const n = m[1]!.split(',').filter((x) => x.trim().length > 0).length;
        if (n < 2 || n > 5) bad.push(`${relative(FARM, f)}: ${n} names`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the nav carries no blurb', () => {
    expect(MODULES.some((m) => 'blurb' in m)).toBe(false);
  });
});
