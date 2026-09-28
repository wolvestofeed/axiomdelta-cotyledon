/**
 * Cotyledon — nutrition targets (outline §4): the catalog is the variety records, a flat is scored
 * as facts, every benefit shown cites a registered row.
 */

import { describe, expect, it } from 'vitest';
import { NUTRITION_TARGETS, TARGET_BY_KEY, benefitsFor, targetKey } from '@/data/nutrition-targets';
import { VARIETIES, VARIETY_BY_KEY } from '@/data/varieties';
import { SCIENCE_SOURCE_BY_ROW } from '@/data/science-library';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { scoreFlat, targetsOfPlan } from '@/engine/nutrition-targets';

const plan = (code: string) => growPlanSeed.find((p) => p.code === code)!;

describe('the target catalog', () => {
  it('is the union of the nutrients and compounds on the variety records, each with the varieties that carry it', () => {
    const named = new Set(VARIETIES.flatMap((v) => [...v.profile.nutrients, ...v.profile.compounds]).map(targetKey));
    expect(new Set(NUTRITION_TARGETS.map((t) => t.key))).toEqual(named);
    for (const t of NUTRITION_TARGETS) {
      expect(t.varieties.length).toBeGreaterThan(0);
      for (const k of t.varieties) {
        const v = VARIETY_BY_KEY[k]!;
        expect([...v.profile.nutrients, ...v.profile.compounds].map(targetKey)).toContain(t.key);
      }
    }
    expect(TARGET_BY_KEY['iron']!.kind).toBe('nutrient');
    expect(TARGET_BY_KEY['sulforaphane']!.varieties).toContain('broccoli');
    expect(targetKey('Vitamin C')).toBe('vitamin-c');
  });

  it('a benefit shown for a target mentions it and cites registered rows', () => {
    const iron = benefitsFor(VARIETY_BY_KEY['broccoli']!, TARGET_BY_KEY['iron']!);
    expect(iron.length).toBeGreaterThan(0);
    for (const b of iron) {
      expect(b.statement.toLowerCase()).toContain('iron');
      for (const r of b.rows) expect(SCIENCE_SOURCE_BY_ROW[r]).toBeDefined();
    }
  });
});

describe('a flat scored against targets', () => {
  it('covers a target when a plan on the flat carries a variety that names it, and lists the plans that would carry the rest', () => {
    const s = scoreFlat(['sulforaphane', 'omega-3', 'protein'], [plan('BROC-01')], growPlanSeed);
    expect(s.targets.map((t) => [t.target.key, t.covered])).toEqual([['sulforaphane', true], ['omega-3', false], ['protein', false]]);
    expect(s.covered).toBe(1);
    expect(s.uncovered).toBe(2);
    expect(s.share).toBeCloseTo(1 / 3, 9);
    const sulf = s.targets[0]!;
    expect(sulf.by[0]!.variety.key).toBe('broccoli');
    expect(sulf.by[0]!.planCodes).toEqual(['BROC-01']);
    expect(sulf.by[0]!.benefits.length).toBeGreaterThan(0);
    const omega = s.targets[1]!;
    expect(omega.carriedBy.map((p) => p.code)).toContain('CHIA-01');
    expect(omega.carriedBy.every((p) => p.code !== 'BROC-01')).toBe(true);
    expect(s.claims.length).toBeGreaterThan(0);
  });

  it('an unknown key is ignored; no target named is full coverage', () => {
    expect(scoreFlat(['nope'], [plan('PEA-01')]).targets).toEqual([]);
    expect(scoreFlat([], [plan('PEA-01')]).share).toBe(1);
  });

  it('a plan carries the targets of its varieties', () => {
    const keys = targetsOfPlan(plan('CHIA-01')).map((t) => t.key);
    expect(keys).toContain('omega-3');
    expect(keys).not.toContain('sulforaphane');
  });
});
