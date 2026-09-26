/**
 * MicroFarm — the vocabulary guard (outline §3).
 *
 * No kitchen word survives the swap anywhere in the app, the schema, the migration,
 * the scripts or the docs. The words are the ones CLAUDE.md §3 names, plus the rest of
 * the swap table's sources. A hit fails with the file and the word.
 *
 * The allowlist is the Phase 2 work: files whose contents are the kitchen's own domain
 * data (the seeded crop plan, the nutrient profile, the grow stages, the produce-safety
 * plan) and are replaced outright in Phase 2, not re-worded.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');
const ROOTS = ['apps/web/src', 'apps/web/test', 'apps/web/scripts', 'packages/db/src', 'packages/db/drizzle', 'docs', 'package.json', '.env.example', 'README.md', 'CLAUDE.md'];
const EXT = /\.(ts|tsx|sql|md|css|json|py|mjs|html|example)$/;

const WORDS = [
  'muse', 'recipe', 'recipes', 'portion', 'portions', 'meal', 'meals', 'cook', 'cooked', 'cooking', 'chill', 'chilled', 'chiller',
  'kettle', 'cabinet', 'skillet', 'combi', 'plated', 'kitchen', 'commissary', 'school', 'schools', 'lunch', 'catering',
  'erra', 'comptable',
];
const RX = new RegExp(`(?<![A-Za-z0-9])(${WORDS.join('|')})(?![a-z0-9])`, 'gi');

/** Phase 2 replaces these outright; their kitchen data is not re-worded here. */
const ALLOWED = new Set([
  'apps/web/src/app/(farm)/farm/_data/plan-data.ts',
  'apps/web/src/app/(farm)/farm/_data/crop-plans-seed.ts',
  'apps/web/src/app/(farm)/farm/_data/nutrient-profile.ts',
  'apps/web/src/app/(farm)/farm/_data/grow-stages.ts',
  'apps/web/src/app/(farm)/farm/_data/input-factors-compiled.json',
  'apps/web/src/app/(farm)/farm/_engine/nutrition.ts',
  'apps/web/src/app/(farm)/farm/_engine/produce-safety.ts',
  'apps/web/test/fixtures',
  'docs/outline.md',
  'docs/grow-operations.md',
  'docs/glossary.md', // names the kitchen origin of terms and uses cook in its plain sense
  'docs/science-library.md', // cites studies as they are titled
  'apps/web/test/farm-vocabulary.test.ts',
  'CLAUDE.md', // names the origin and the words themselves
  'docs/roadmap.md', // names the origin
]);

/** Words that are also ordinary English in the codebase and are allowed in these exact phrases. */
const PHRASES_OK = [/\bblast\s+(radius|off)\b/i, /parent (directory|element|node|component|route|layout|renders|scope)/i, /\.parent\b/, /parentId/, /parentNode/];

function walk(p: string): string[] {
  if (statSync(p).isFile()) return [p];
  return readdirSync(p).flatMap((f) => (f === 'node_modules' || f === '.next' || f === 'dist' || f === 'raw-extracts' ? [] : walk(join(p, f))));
}

describe('vocabulary — no kitchen word survives', () => {
  const files = ROOTS.flatMap((r) => walk(join(REPO, r))).filter((f) => EXT.test(f));
  it('scans the tree', () => {
    expect(files.length).toBeGreaterThan(300);
  });
  it('finds none outside the Phase 2 allowlist', () => {
    const hits: string[] = [];
    for (const f of files) {
      const rel = relative(REPO, f);
      if ([...ALLOWED].some((a) => rel === a || rel.startsWith(`${a}/`))) continue;
      const src = readFileSync(f, 'utf8');
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (PHRASES_OK.some((p) => p.test(line))) return;
        for (const m of line.matchAll(RX)) hits.push(`${rel}:${i + 1}: ${m[0]}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
