/**
 * Cotyledon — the copy surfaces facts and math; it never counsels (CLAUDE.md §5).
 *
 * `src/lib/no-advisory.ts` holds the forbidden advisory phrases. This test runs them over every
 * page, component and data file, so a line of copy that recommends, suggests or tells the reader
 * what they should do fails the build.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findAdvisoryPhrase } from '@/lib/no-advisory';

const SRC = join(__dirname, '..', 'src');
const ROOTS = ['app', 'components', 'data', 'engine', 'server'].map((d) => join(SRC, d));

function walk(p: string): string[] {
  return statSync(p).isFile() ? [p] : readdirSync(p).flatMap((f) => walk(join(p, f)));
}

describe('no advisory copy', () => {
  it('no page, component, data or engine file carries a forbidden advisory phrase', () => {
    const hits: string[] = [];
    for (const f of ROOTS.flatMap(walk).filter((f) => /\.(ts|tsx)$/.test(f))) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const phrase = findAdvisoryPhrase(line);
        if (phrase) hits.push(`${relative(SRC, f)}:${i + 1}: ${phrase}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
