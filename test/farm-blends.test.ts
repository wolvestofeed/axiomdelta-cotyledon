/**
 * The blends in R&D: Rob's twelve, from document C and MIXED TRAY R&D, built as developing grow
 * plans on the hemp mat, each seed line at its variety's tray density times its share.
 */
import { describe, expect, it } from 'vitest';
import { BLENDS, blendCode, blendPlan, blendSeed } from '@/data/blends';
import { growPlanSeed, librarySeed } from '@/data/grow-plans-seed';
import { VARIETY_BY_KEY, growthFor } from '@/data/varieties';
import { growPlanProblems, planStageDays, seedLines, GROW_PLAN_CODE_RX } from '@/data/grow-plan';
import { costPlan } from '@/engine/grow-costing';
import { purchaseLines } from '@/engine/grow-purchase';

const byCode = (code: string) => blendSeed.find((p) => p.code === code)!;

describe('the twelve blends', () => {
  it('are BLEND-01 to BLEND-12, eleven built and the Cardio-Lipid Shield held for buckwheat', () => {
    expect(BLENDS.map(blendCode)).toEqual(Array.from({ length: 12 }, (_, i) => `BLEND-${String(i + 1).padStart(2, '0')}`));
    expect(BLENDS.map(blendCode).every((c) => GROW_PLAN_CODE_RX.test(c))).toBe(true);
    expect(blendSeed).toHaveLength(11);
    const held = BLENDS.filter((b) => !b.seeds);
    expect(held.map((b) => b.name)).toEqual(['Cardio-Lipid Shield']);
    expect(held[0]!.held).toContain('Buckwheat');
    expect(blendPlan(held[0]!)).toBeNull();
  });

  it('join the library seed as developing plans; the in-service seed the engine falls back to is unchanged', () => {
    expect(growPlanSeed).toHaveLength(12);
    expect(librarySeed).toHaveLength(23);
    expect(blendSeed.every((p) => p.status === 'developing' && p.channels.length === 0)).toBe(true);
  });

  it('are whole plans on the 1020, the hemp mat, FloraGrow from the light stage and a light line', () => {
    for (const p of blendSeed) {
      expect(growPlanProblems(p), p.code).toEqual([]);
      expect(p.format).toBe('flat-1020');
      expect(seedLines(p).length).toBeGreaterThanOrEqual(2);
      expect(Math.abs(seedLines(p).reduce((t, s) => t + s.share, 0) - 1)).toBeLessThan(1e-9);
      expect(p.lines.find((l) => l.kind === 'medium')).toMatchObject({ mediumKey: 'hemp-mat' });
      expect(p.lines.find((l) => l.kind === 'nutrient')).toMatchObject({ nutrientKey: 'floragrow-npk', startsAt: 'light' });
      expect(p.lines.filter((l) => l.kind === 'light')).toHaveLength(1);
      expect(costPlan(p).perTray.total).toBeGreaterThan(0);
      expect(purchaseLines(p).some((l) => l.name === 'Medium: hemp-mat')).toBe(true);
    }
  });

  it('document C\'s blends carry its ratios; MIXED TRAY R&D\'s start at equal shares', () => {
    expect(seedLines(byCode('BLEND-01')).map((s) => [s.varietyKey, s.share])).toEqual([['broccoli', 0.3], ['red-cabbage', 0.3], ['fenugreek', 0.25], ['chia', 0.15]]);
    expect(seedLines(byCode('BLEND-03')).map((s) => s.varietyKey)).toEqual(['pea', 'sunflower', 'wheat', 'red-lentil']);
    for (const s of seedLines(byCode('BLEND-06'))) expect(s.share).toBeCloseTo(1 / 3, 12);
    expect(seedLines(byCode('BLEND-12')).map((s) => s.varietyKey)).toEqual(['mung-bean', 'pea', 'radish']);
  });

  it('each seed line is the variety\'s tray density times its share; lentil, mung and wheat on their tray records', () => {
    for (const p of blendSeed) {
      for (const s of seedLines(p)) {
        const v = VARIETY_BY_KEY[s.varietyKey]!;
        expect(s.gramsPerTray.value, `${p.code} ${v.key}`).toBeCloseTo(growthFor(v, true).seedGramsPer1020.value * s.share, 9);
      }
    }
    const mung = seedLines(byCode('BLEND-05')).find((s) => s.varietyKey === 'mung-bean')!;
    expect(mung.gramsPerTray.value).toBeCloseTo(VARIETY_BY_KEY['mung-bean']!.tray!.seedGramsPer1020.value * 0.4, 9);
    expect(mung.gramsPerTray.status).toBe('PLACEHOLDER');
  });

  it('runs on the slowest variety at each stage, on the tray records', () => {
    const p = byCode('BLEND-08');
    const days = planStageDays(p);
    for (const s of seedLines(p)) {
      const own = growthFor(VARIETY_BY_KEY[s.varietyKey]!, true).stageDays.value;
      for (const k of Object.keys(own) as (keyof typeof own)[]) expect(days[k]).toBeGreaterThanOrEqual(own[k]);
    }
  });

  it('keeps what a grow plan cannot yet express on the plan, as the document states it', () => {
    expect(byCode('BLEND-02').note).toContain('48 to 72 hours');
    expect(byCode('BLEND-11').note).toContain('UV-C');
    expect(byCode('BLEND-06').lines.find((l) => l.kind === 'light')).toMatchObject({ regimeKey: 'biofortify-far-red' });
    expect(byCode('BLEND-08').lines.find((l) => l.kind === 'light')).toMatchObject({ ppfd: { value: 175, status: 'STATED' } });
  });
});
