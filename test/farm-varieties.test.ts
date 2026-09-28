/**
 * MicroFarm — the variety library, the science library and the inputs catalog agree
 * (outline §4). Every stated benefit cites a registered row, every figure carries a tag,
 * and the stage schedule arithmetic holds.
 */

import { describe, expect, it } from 'vitest';
import { VARIETIES, VARIETY_BY_KEY, seedCostPer1020 } from '@/data/varieties';
import { SCIENCE_SOURCES, SCIENCE_SOURCE_BY_ROW, SCIENCE_CLAIMS, DOCUMENT_ROWS, rowFor, claimsForVariety } from '@/data/science-library';
import { REFERENCE_SOURCES, registeredUrls } from '@/data/sources-registry';
import { GLOSSARY, GLOSSARY_BY_KEY } from '@/data/glossary';
import { GROWING_MEDIA, NUTRIENT_SOLUTIONS, LIGHT_FIXTURES, LIGHT_REGIMES, REGIME_BY_KEY, MEDIUM_BY_KEY, dailyLightIntegral, lightCostPerTrayDay } from '@/data/inputs-catalog';
import { TRAY_FORMATS, TRAY_FORMAT_BY_KEY } from '@/data/tray-formats';
import { STAGES, cycleDays, daysToHarvest, wateringsOverCycle } from '@/data/stage-schedule';

describe('science library', () => {
  it('rows are numbered 1..n once each with distinct URLs', () => {
    expect(SCIENCE_SOURCES.map((s) => s.row)).toEqual(SCIENCE_SOURCES.map((_, i) => i + 1));
    expect(new Set(SCIENCE_SOURCES.map((s) => s.url)).size).toBe(SCIENCE_SOURCES.length);
  });

  it('document B\'s numbering maps every citation onto a row', () => {
    expect(DOCUMENT_ROWS.B).toHaveLength(59);
    for (const r of DOCUMENT_ROWS.B) expect(SCIENCE_SOURCE_BY_ROW[r]).toBeDefined();
    expect(rowFor('B', 27)).toBe(68);
    expect(rowFor('A', 43)).toBe(43);
    expect(() => rowFor('B', 60)).toThrow();
  });

  it('documents C and D map every citation onto a row, and their new works are rows 76 to 103', () => {
    expect(DOCUMENT_ROWS.C).toHaveLength(38);
    expect(DOCUMENT_ROWS.D).toHaveLength(45);
    for (const r of [...DOCUMENT_ROWS.C, ...DOCUMENT_ROWS.D]) expect(SCIENCE_SOURCE_BY_ROW[r]).toBeDefined();
    expect(rowFor('C', 13)).toBe(76);
    expect(rowFor('D', 25)).toBe(103);
    expect(SCIENCE_SOURCES.at(-1)!.row).toBe(103);
  });

  it('every animal and in-vitro claim names its model in its text; document C carries the borage alkaloid caution', () => {
    const byId = Object.fromEntries(SCIENCE_CLAIMS.map((c) => [c.id, c]));
    expect(byId['borage-fat-oxidation']!.evidence).toBe('animal');
    expect(byId['fenugreek-enzyme-inhibition']!.evidence).toBe('cell');
    expect(byId['borage-pyrrolizidine']).toMatchObject({ topic: 'safety', varieties: ['borage'] });
    for (const c of SCIENCE_CLAIMS.filter((x) => x.evidence === 'animal' || x.evidence === 'cell')) {
      expect(/(in vitro|in c\. elegans|in drosophila|rats|mice|mouse|cells|model|animal|fruit flies)/i.test(c.text), c.id).toBe(true);
    }
  });

  it('every claim cites registered rows and no claim rests on a commercial page alone', () => {
    for (const c of SCIENCE_CLAIMS) {
      expect(c.rows.length, c.id).toBeGreaterThan(0);
      for (const r of c.rows) expect(SCIENCE_SOURCE_BY_ROW[r], `${c.id} row ${r}`).toBeDefined();
      const grades = c.rows.map((r) => SCIENCE_SOURCE_BY_ROW[r]!.grade);
      expect(grades.every((g) => g === 'C'), `${c.id} rests on a commercial page`).toBe(false);
    }
    expect(new Set(SCIENCE_CLAIMS.map((c) => c.id)).size).toBe(SCIENCE_CLAIMS.length);
  });

  it('every row is on the Sources register', () => {
    const urls = registeredUrls();
    for (const s of SCIENCE_SOURCES) expect(urls.has(s.url.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase()), `row ${s.row}`).toBe(true);
    expect(REFERENCE_SOURCES.filter((r) => r.key.startsWith('science:'))).toHaveLength(SCIENCE_SOURCES.length);
  });
});

describe('varieties', () => {
  it('twelve varieties, keys unique, every benefit and note cites rows that exist', () => {
    expect(VARIETIES).toHaveLength(12);
    expect(new Set(VARIETIES.map((v) => v.key)).size).toBe(12);
    for (const v of VARIETIES) {
      for (const b of v.profile.benefits) {
        expect(b.rows.length, `${v.key}: ${b.statement}`).toBeGreaterThan(0);
        for (const r of b.rows) expect(SCIENCE_SOURCE_BY_ROW[r], `${v.key} row ${r}`).toBeDefined();
        if (b.evidence === 'supplier') expect(b.rows.every((r) => SCIENCE_SOURCE_BY_ROW[r]!.grade === 'S'), `${v.key} supplier statement cites a study`).toBe(true);
        else expect(b.rows.some((r) => SCIENCE_SOURCE_BY_ROW[r]!.grade !== 'S' && SCIENCE_SOURCE_BY_ROW[r]!.grade !== 'C'), `${v.key} study claim cites no study`).toBe(true);
      }
      for (const n of [...v.light.notes, ...v.media.notes]) for (const r of n.rows) expect(SCIENCE_SOURCE_BY_ROW[r], `${v.key} note row ${r}`).toBeDefined();
      if (v.light.ppfdRange) for (const r of v.light.ppfdRange.rows) expect(SCIENCE_SOURCE_BY_ROW[r]).toBeDefined();
    }
  });

  it('every variety links glossary entries that exist and a medium and regime that exist', () => {
    for (const v of VARIETIES) {
      for (const g of v.profile.glossary) expect(GLOSSARY_BY_KEY[g], `${v.key} glossary ${g}`).toBeDefined();
      expect(MEDIUM_BY_KEY[v.media.defaultMedium]).toBeDefined();
      expect(REGIME_BY_KEY[v.light.defaultRegime]).toBeDefined();
    }
  });

  it('every figure is tagged and priced; a placeholder is never a study figure', () => {
    for (const v of VARIETIES) {
      expect(v.seedPricePerLb.value).toBeGreaterThan(0);
      expect(['STATED', 'DATED', 'SOURCED', 'PLACEHOLDER']).toContain(v.seedPricePerLb.status);
      expect(v.seedGramsPer1020.value).toBeGreaterThan(0);
      expect(v.harvestGramsPer1020.status === 'PLACEHOLDER' || (v.harvestGramsPer1020.note ?? '').length > 0).toBe(true);
    }
    expect(seedCostPer1020(VARIETY_BY_KEY['sunflower']!)).toBeCloseTo((142 / 453.592) * 7.37, 6);
  });

  it('sprouts take no medium and no light; microgreens take both', () => {
    for (const v of VARIETIES) {
      if (v.kind === 'sprout') {
        expect(v.media.defaultMedium).toBe('none');
        expect(v.stageDays.value.light).toBe(0);
      } else {
        expect(v.media.defaultMedium).not.toBe('none');
        expect(v.stageDays.value.light).toBeGreaterThan(0);
      }
    }
  });

  it('broccoli\'s studied PPFD range narrows the regime target', () => {
    const b = VARIETY_BY_KEY['broccoli']!;
    expect(b.light.ppfdRange).toEqual({ min: 50, max: 70, rows: [73] });
    expect(claimsForVariety('broccoli').some((c) => c.id === 'broccoli-ppfd')).toBe(true);
    expect(claimsForVariety('wheat').every((c) => c.varieties.includes('wheat') || c.varieties.includes('all'))).toBe(true);
  });
});

describe('inputs catalog', () => {
  it('media, nutrients, fixtures and regimes have unique keys and rows that exist', () => {
    for (const list of [GROWING_MEDIA, NUTRIENT_SOLUTIONS, LIGHT_FIXTURES, LIGHT_REGIMES] as const) {
      expect(new Set(list.map((x) => x.key)).size).toBe(list.length);
    }
    for (const m of GROWING_MEDIA) for (const r of m.rows) expect(SCIENCE_SOURCE_BY_ROW[r]).toBeDefined();
    for (const r of LIGHT_REGIMES) for (const row of r.rows) expect(SCIENCE_SOURCE_BY_ROW[row]).toBeDefined();
    for (const n of NUTRIENT_SOLUTIONS) if (n.elicits) for (const r of n.elicits.rows) expect(SCIENCE_SOURCE_BY_ROW[r]).toBeDefined();
  });

  it('fixtures are the ones Rob runs, counted a shelf: two Mars VG80, three Barrina T5; light cost is the shelf\'s lights over its four flats', () => {
    expect(dailyLightIntegral(180, 24)).toBeCloseTo(15.55, 1);
    const vg80 = LIGHT_FIXTURES.find((f) => f.key === 'mars-hydro-vg80')!;
    const barrina = LIGHT_FIXTURES.find((f) => f.key === 'barrina-t5-6000k')!;
    expect(LIGHT_FIXTURES.map((f) => [f.key, f.perShelf.value])).toEqual([['mars-hydro-vg80', 2], ['barrina-t5-6000k', 3]]);
    // Energy scales with the lights on the shelf, at full power: the fixtures are not dimmed.
    const one = lightCostPerTrayDay(vg80, REGIME_BY_KEY.balanced, 0.13, 1);
    expect(lightCostPerTrayDay(vg80, REGIME_BY_KEY.balanced, 0.13, 2)).toBeCloseTo(2 * one, 9);
    expect(lightCostPerTrayDay(barrina, REGIME_BY_KEY.balanced)).toBeGreaterThan(0);
    const hours = REGIME_BY_KEY.balanced.photoperiodHours.value;
    const energy = ((vg80.watts.value * 2) / 1000) * hours * 0.13 / 4;
    expect(lightCostPerTrayDay(vg80, REGIME_BY_KEY.balanced, 0.13, 2)).toBeGreaterThan(energy);
    expect(lightCostPerTrayDay(vg80, REGIME_BY_KEY.balanced)).toBeGreaterThan(0);
  });
});

describe('tray formats and stages', () => {
  it('formats: the 1020 is the reference and the others scale by area', () => {
    expect(TRAY_FORMAT_BY_KEY['flat-1020'].densityFactor.value).toBe(1);
    expect(TRAY_FORMAT_BY_KEY['tray-7x11'].densityFactor.value).toBeGreaterThan(0.4);
    expect(TRAY_FORMAT_BY_KEY['tray-7x11'].densityFactor.value).toBeLessThan(0.5);
    expect(TRAY_FORMAT_BY_KEY['insert-5x5'].densityFactor.value).toBeCloseTo(25 / (21 * 10.75), 6);
    expect(TRAY_FORMATS.filter((f) => f.kind === 'live')).toHaveLength(3);
  });

  it('stage arithmetic: a broccoli cycle is sow through the harvest window', () => {
    const days = VARIETY_BY_KEY['broccoli']!.stageDays.value;
    expect(daysToHarvest(days)).toBe(1 + 3 + 3 + 4);
    expect(cycleDays(days)).toBe(1 + 3 + 3 + 4 + 3);
    const w = wateringsOverCycle(days);
    expect(w.mist).toBe(1 + 2 * 3 + 1 * 3);
    expect(w.bottom).toBe(4 + 3);
    expect(STAGES.filter((s) => s.occupiesGrowUnit).map((s) => s.key)).toEqual(['sow', 'germination', 'blackout', 'light', 'harvest-window']);
  });

  it('the glossary has both published tiers and every entry cites rows that exist', () => {
    expect(GLOSSARY.filter((g) => g.tier === 1).length).toBeGreaterThan(30);
    expect(GLOSSARY.filter((g) => g.tier === 2).length).toBeGreaterThan(40);
    for (const g of GLOSSARY) for (const r of g.rows) expect(SCIENCE_SOURCE_BY_ROW[r], `${g.key} row ${r}`).toBeDefined();
  });
});
