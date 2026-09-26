/**
 * MicroFarm — regenerate `src/data/glossary.ts` from `docs/glossary.md`, tiers 1 and 2.
 *
 * The document is the authority. Each entry is a paragraph `**Term.** Definition [rows]` under the
 * tier 1 or tier 2 heading; tier 3 is internal and is not generated. The key is the term as a slug.
 *
 * Run:  pnpm farm:glossary
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const DOC = join(REPO, 'docs', 'glossary.md');
const OUT = join(REPO, 'src', 'data', 'glossary.ts');

interface Entry {
  key: string;
  term: string;
  tier: 1 | 2;
  definition: string;
  rows: number[];
}

const slug = (term: string) => term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export function parseGlossary(md: string): Entry[] {
  const entries: Entry[] = [];
  let tier: 1 | 2 | null = null;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (/^## Tier 1\b/.test(line)) tier = 1;
    else if (/^## Tier 2\b/.test(line)) tier = 2;
    else if (/^## Tier 3\b/.test(line)) tier = null;
    if (tier === null) continue;
    const m = line.match(/^\*\*(.+?)\.\*\*\s+(.*)$/);
    if (!m) continue;
    const term = m[1]!.trim();
    let definition = m[2]!.trim();
    let rows: number[] = [];
    const cite = definition.match(/\s*\[([0-9,\s]+)\]$/);
    if (cite) {
      rows = cite[1]!.split(',').map((n) => Number(n.trim())).filter((n) => Number.isInteger(n));
      definition = definition.slice(0, cite.index).trim();
    }
    definition = definition.replace(/\[`([^`]+)`\]\([^)]+\)/g, '$1').replace(/`/g, '');
    entries.push({ key: slug(term), term, tier, definition, rows });
  }
  return entries;
}

export function renderGlossary(entries: readonly Entry[]): string {
  const rows = entries.map((e) => `  { key: ${quote(e.key)}, term: ${quote(e.term)}, tier: ${e.tier}, definition: ${quote(e.definition)}, rows: [${e.rows.join(', ')}] },`).join('\n');
  return `/**
 * MicroFarm — the glossary as data, tiers 1 and 2 (\`docs/glossary.md\` is the authority; tier 3 is internal and stays there).
 * Regenerated from the document by \`pnpm farm:glossary\`; a subscriber-facing term links its science rows.
 */

export interface GlossaryEntry {
  key: string;
  term: string;
  /** 1 growing and the product, 2 the science. */
  tier: 1 | 2;
  definition: string;
  /** Science library rows the definition cites. */
  rows: number[];
}

export const GLOSSARY: readonly GlossaryEntry[] = [
${rows}
];

export const GLOSSARY_BY_KEY: Readonly<Record<string, GlossaryEntry>> = Object.fromEntries(GLOSSARY.map((g) => [g.key, g]));
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const entries = parseGlossary(readFileSync(DOC, 'utf8'));
  const dup = entries.map((e) => e.key).filter((k, i, a) => a.indexOf(k) !== i);
  if (dup.length) throw new Error(`Duplicate glossary keys: ${dup.join(', ')}`);
  writeFileSync(OUT, renderGlossary(entries));
  console.log(`glossary: ${entries.length} entries (${entries.filter((e) => e.tier === 1).length} tier 1, ${entries.filter((e) => e.tier === 2).length} tier 2) → src/data/glossary.ts`);
}
