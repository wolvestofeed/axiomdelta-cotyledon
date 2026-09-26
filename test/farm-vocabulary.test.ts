/**
 * MicroFarm — the vocabulary guard (outline §3).
 *
 * No kitchen word survives the swap anywhere in the app, the schema, the migration,
 * the scripts or the docs. The words are the ones CLAUDE.md §3 names, plus the rest of
 * the swap table's sources. A hit fails with the file and the word.
 *
 * The allowlist is the files that name the origin or cite a source as it is titled, the compiled
 * food factor table, and the Phase 1-era produce-safety module the deep cut has yet to replace.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO = join(__dirname, '..');
const ROOTS = ['src', 'test', 'scripts', 'drizzle', 'docs', 'package.json', '.env.example', 'README.md', 'CLAUDE.md'];
const EXT = /\.(ts|tsx|sql|md|css|json|py|mjs|html|example)$/;

const WORDS = [
  'muse', 'recipe', 'recipes', 'portion', 'portions', 'meal', 'meals', 'cook', 'cooked', 'cooking', 'chill', 'chilled', 'chiller',
  'kettle', 'cabinet', 'skillet', 'combi', 'plated', 'kitchen', 'commissary', 'school', 'schools', 'lunch', 'catering',
  'erra', 'comptable',
];
const RX = new RegExp(`(?<![A-Za-z0-9])(${WORDS.join('|')})(?![a-z0-9])`, 'gi');

/** Files that name the origin or quote a source, and the Phase 1-era module still to be replaced. */
const ALLOWED = new Set([
  'src/data/input-factors-compiled.json',
  'src/engine/produce-safety.ts',
  'docs/outline.md',
  'docs/glossary.md', // names the kitchen origin of terms and uses cook in its plain sense
  'src/data/glossary.ts', // generated from it
  'src/data/science-library.ts', // cites studies as they are titled
  'docs/science-library.md', // cites studies as they are titled
  'test/farm-vocabulary.test.ts',
  'CLAUDE.md', // names the origin and the words themselves
  'docs/roadmap.md', // names the origin
  'docs/roadmaps/phase-0-lift.md', // the phase roadmaps name what each phase replaced
  'docs/roadmaps/phase-1-swap-and-tenancy.md', // the phase roadmaps name what each phase replaced
  'docs/roadmaps/phase-2-growing-domain.md', // the phase roadmaps name what each phase replaced
  'docs/roadmaps/phase-3-subscriptions-and-distribution.md', // the phase roadmaps name what each phase replaced
  'docs/roadmaps/phase-4-staffing.md', // the phase roadmaps name what each phase replaced
  'docs/roadmaps/phase-5-facility-and-sustainability.md', // the phase roadmaps name what each phase replaced
  'docs/roadmaps/phase-6-software-as-a-product.md', // the phase roadmaps name what each phase replaced
  'docs/todo.md', // names the origin
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
