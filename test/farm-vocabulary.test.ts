/**
 * Cotyledon — the vocabulary guard (outline §3).
 *
 * No kitchen word survives the swap anywhere in the app, the schema, the migration,
 * the scripts or the docs. The words are the ones CLAUDE.md §3 names, plus the rest of
 * the swap table's sources. A hit fails with the file and the word.
 *
 * The allowlist is the files that name the origin or cite a source as it is titled, the compiled
 * food factor table, and the Phase 1-era produce-safety module the deep cut has yet to replace.
 *
 * The grow plan has one name. Its former name fails in any spelling anywhere in the tree, the
 * docs included, except in the two files whose job is to name it: the migration that renames the
 * tables where they still exist, and the redirect from the page's former address.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO = join(__dirname, '..');
const ROOTS = ['src', 'test', 'scripts', 'drizzle', 'docs', 'package.json', '.env.example', 'README.md', 'CLAUDE.md', 'next.config.ts'];
const EXT = /\.(ts|tsx|sql|md|css|json|py|mjs|html|example)$/;

const WORDS = [
  'muse', 'recipe', 'recipes', 'portion', 'portions', 'meal', 'meals', 'cook', 'cooked', 'cooking', 'chill', 'chilled', 'chiller',
  'kettle', 'cabinet', 'skillet', 'combi', 'plated', 'kitchen', 'commissary', 'school', 'schools', 'lunch', 'catering', 'parent', 'parents',
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
  // The Muse-era topic build plans, reference until each is re-based or deleted (todo.md)
  'docs/roadmaps/operating-model-roadmap.md',
  'docs/roadmaps/page-headers-roadmap.md',
  'docs/roadmaps/people-roadmap.md',
  'docs/roadmaps/portals-roadmap.md',
  'docs/roadmaps/portfolio-publication-roadmap.md',
  'docs/roadmaps/tabbed-layout-roadmap.md',
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

/** The grow plan's former name, in every spelling: two words, snake, kebab, camel, any case. */
const FORMER_NAME = /crop[ _-]?plan/i;
const FORMER_NAME_ALLOWED = new Set(['drizzle/0014_farm_grow_plans.sql', 'next.config.ts', 'test/farm-vocabulary.test.ts']);

describe('vocabulary — the grow plan has one name', () => {
  const files = ROOTS.flatMap((r) => walk(join(REPO, r))).filter((f) => EXT.test(f));
  it('finds its former name nowhere but the migration that renames it and the redirect', () => {
    const hits: string[] = [];
    for (const f of files) {
      const rel = relative(REPO, f);
      if (FORMER_NAME_ALLOWED.has(rel)) continue;
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const m = line.match(FORMER_NAME);
        if (m) hits.push(`${rel}:${i + 1}: ${m[0]}`);
      });
    }
    expect(hits).toEqual([]);
  });
});

describe('vocabulary — a blend has one name', () => {
  it('a tray of two or more varieties is a blend everywhere, never by the name it replaced', () => {
    const files = ROOTS.flatMap((r) => walk(join(REPO, r))).filter((f) => EXT.test(f) && !f.endsWith('farm-vocabulary.test.ts'));
    const hits: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        // The one exception is the title of Rob's blend document, MIXED TRAY R&D, cited as it is titled.
        if (/mixed[\s-]?trays?/i.test(line.replace(/MIXED TRAY R&D/g, ''))) hits.push(`${relative(REPO, f)}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
