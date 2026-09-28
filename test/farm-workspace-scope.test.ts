/**
 * Cotyledon — every entry point runs in the workspace scope (outline §7).
 *
 * `db` throws outside a scope, so an unwrapped entry point fails loudly at runtime. This
 * test fails it earlier: every server page and layout, every route handler, and every
 * exported server action under the OS route group returns through `withWorkspace()`.
 * Entry points that render no data are wrapped all the same, so there is one rule.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', 'src', 'app', '(farm)');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(ROOT);
const read = (f: string) => readFileSync(f, 'utf8');
const rel = (f: string) => relative(ROOT, f);

describe('workspace scope — entry points', () => {
  it('every async server page and layout returns through withWorkspace', () => {
    const missing = files
      .filter((f) => /\/(page|layout)\.tsx$/.test(f))
      .filter((f) => /^export default async function/m.test(read(f)))
      .filter((f) => !/^export default async function \w+\([^)]*\) \{\n  return withWorkspace\(/m.test(read(f)))
      .map(rel);
    expect(missing).toEqual([]);
  });

  it('every route handler returns through withWorkspace', () => {
    const missing: string[] = [];
    for (const f of files.filter((x) => x.endsWith('/route.ts'))) {
      const src = read(f);
      for (const m of src.matchAll(/^export async function (GET|POST|PUT|PATCH|DELETE)\b[^{]*\{\n([^\n]*)/gm)) {
        if (!m[2]!.includes('withWorkspace(')) missing.push(`${rel(f)}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every exported server action returns through withWorkspace', () => {
    const missing: string[] = [];
    for (const f of files.filter((x) => x.endsWith('.ts') && read(x).startsWith("'use server'"))) {
      const src = read(f);
      for (const m of src.matchAll(/^export async function (\w+)\b[^{]*\{\n([^\n]*)/gm)) {
        if (!m[2]!.includes('withWorkspace(')) missing.push(`${rel(f)}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('nothing but the scope module and the workspaces table reaches the unscoped handle', () => {
    const offenders = files
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('_lib/workspace.ts'))
      .filter((f) => /\brootDb\b/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
