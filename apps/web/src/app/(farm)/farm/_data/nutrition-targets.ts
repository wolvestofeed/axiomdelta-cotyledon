/**
 * MicroFarm — nutrition targets (outline §4). The named targets a subscriber can set, and the
 * varieties that carry each.
 *
 * Nothing here is authored: the catalog is the union of the nutrients and compounds named on the
 * variety records (`varieties.ts`), each target carrying the varieties whose profile names it and
 * the stated benefits, with their science-library rows, that mention it. A target with no variety
 * behind it cannot exist, and a benefit shown for a target always cites its row.
 */

import { VARIETIES, type StatedBenefit, type VarietyDef } from './varieties';

export type TargetKind = 'nutrient' | 'compound';

export interface NutritionTargetDef {
  /** Stable key: the name lower-cased with spaces as dashes. */
  key: string;
  name: string;
  kind: TargetKind;
  /** Variety keys whose profile names the target. */
  varieties: string[];
}

export const targetKey = (name: string): string => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function build(): NutritionTargetDef[] {
  const byKey = new Map<string, NutritionTargetDef>();
  const add = (name: string, kind: TargetKind, v: VarietyDef) => {
    const key = targetKey(name);
    const row = byKey.get(key) ?? { key, name, kind, varieties: [] };
    if (!row.varieties.includes(v.key)) row.varieties.push(v.key);
    byKey.set(key, row);
  };
  for (const v of VARIETIES) {
    for (const n of v.profile.nutrients) add(n, 'nutrient', v);
    for (const c of v.profile.compounds) add(c, 'compound', v);
  }
  return [...byKey.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

export const NUTRITION_TARGETS: readonly NutritionTargetDef[] = build();

export const TARGET_BY_KEY: Readonly<Record<string, NutritionTargetDef>> = Object.fromEntries(NUTRITION_TARGETS.map((t) => [t.key, t]));

/** The stated benefits on a variety that mention a target, each citing its rows. */
export function benefitsFor(v: VarietyDef, target: NutritionTargetDef): StatedBenefit[] {
  const needle = target.name.toLowerCase();
  return v.profile.benefits.filter((b) => b.statement.toLowerCase().includes(needle));
}
