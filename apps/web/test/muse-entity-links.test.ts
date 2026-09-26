import { describe, it, expect } from 'vitest';
import {
  entityRef,
  parseEntityRef,
  groupRefsByKind,
  supplierReverseLinks,
  lotTrace,
  lotsFromSupplier,
  evidenceCoverage,
  sitePlacement,
  docKey,
  LINK_SURFACES,
  ENTITY_KINDS,
  type LotEdge,
} from '@/app/(muse)/muse/_engine/entity-links';
import { resolveSites, siteSchoolRefs, sitePlacementSummary } from '@/app/(muse)/muse/_engine/sites';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LeanEntity } from '@/app/(muse)/muse/_engine/entity-links';

describe('muse entity links — reference encoding', () => {
  it('round-trips a plain ref', () => {
    expect(parseEntityRef(entityRef('supplier', 'abc'))).toEqual({ kind: 'supplier', id: 'abc' });
  });

  it('splits on the first colon only, so an id may contain one', () => {
    const ref = entityRef('equipment', 'Blast chiller: 200 lb');
    expect(parseEntityRef(ref)).toEqual({ kind: 'equipment', id: 'Blast chiller: 200 lb' });
  });

  it('rejects an unknown kind, an empty id, and a bare string', () => {
    expect(parseEntityRef('vendor:1')).toBeNull();
    expect(parseEntityRef('supplier:')).toBeNull();
    expect(parseEntityRef('supplier')).toBeNull();
    expect(parseEntityRef(':abc')).toBeNull();
  });

  it('groups by kind, dropping duplicates and unparseable refs', () => {
    const g = groupRefsByKind([
      'supplier:a',
      'supplier:a',
      'supplier:b',
      'source:x',
      'nonsense',
    ]);
    expect(g.supplier).toEqual(['a', 'b']);
    expect(g.source).toEqual(['x']);
    expect(Object.keys(g)).toHaveLength(2);
  });
});

describe('muse entity links — supplier reverse view', () => {
  const po = [
    { name: 'Beef', extendedCost: 600, casesToOrder: 3 },
    { name: 'Beans', extendedCost: 300, casesToOrder: 2 },
    { name: 'Salt', extendedCost: 100, casesToOrder: 1 },
  ];

  it('inverts the link map and sums what the order buys from each operation', () => {
    const rows = supplierReverseLinks({ Beef: 'a', Beans: 'a', Salt: 'b' }, po);
    expect(rows).toHaveLength(2);
    // Sorted by spend, so the operation carrying two lines comes first.
    expect(rows[0].supplierId).toBe('a');
    expect(rows[0].ingredients).toEqual(['Beans', 'Beef']);
    expect(rows[0].orderedSpend).toBe(900);
    expect(rows[0].orderedCases).toBe(5);
    expect(rows[1].supplierId).toBe('b');
    expect(rows[1].orderedSpend).toBe(100);
  });

  it('a linked line the order does not buy counts as a link with no spend', () => {
    const rows = supplierReverseLinks({ Cilantro: 'a' }, po);
    expect(rows[0].ingredients).toEqual(['Cilantro']);
    expect(rows[0].orderedLines).toBe(0);
    expect(rows[0].orderedSpend).toBe(0);
  });

  it('works with no purchase order at all', () => {
    const rows = supplierReverseLinks({ Beef: 'a' });
    expect(rows[0].orderedSpend).toBe(0);
  });
});

describe('muse entity links — lot trace', () => {
  const edges: LotEdge[] = [
    { fromId: 'L1', toKind: 'supplier', toId: 's1', note: null },
    { fromId: 'L1', toKind: 'supplier', toId: 's1', note: 'duplicate edge' },
    { fromId: 'L1', toKind: 'site', toId: 'SITE-01', note: null },
    { fromId: 'L1', toKind: 'site', toId: 'SITE-02', note: null },
    { fromId: 'L2', toKind: 'supplier', toId: 's1', note: null },
    { fromId: 'L1', toKind: 'source', toId: 'doc1', note: null },
  ];

  it('splits one lot back to suppliers and forward to sites, de-duplicated', () => {
    const t = lotTrace('L1', edges);
    expect(t.supplierIds).toEqual(['s1']);
    expect(t.siteIds).toEqual(['SITE-01', 'SITE-02']);
    expect(t.sourceIds).toEqual(['doc1']);
  });

  it('a lot with nothing recorded traces to nothing rather than guessing', () => {
    expect(lotTrace('L9', edges)).toEqual({ lot: 'L9', supplierIds: [], siteIds: [], sourceIds: [] });
  });

  it('asks the recall question the other way — every lot from one operation', () => {
    expect(lotsFromSupplier('s1', edges)).toEqual(['L1', 'L2']);
    expect(lotsFromSupplier('s9', edges)).toEqual([]);
  });
});

describe('muse entity links — evidence coverage', () => {
  it('counts rows carrying a document', () => {
    const c = evidenceCoverage(['a', 'b', 'c', 'd'], { a: 'src1', c: 'src2' });
    expect(c.rowsWithDocument).toBe(2);
    expect(c.share).toBeCloseTo(0.5, 9);
  });

  it('no rows is no coverage, not a divide by zero', () => {
    expect(evidenceCoverage([], {})).toEqual({ rowsTotal: 0, rowsWithDocument: 0, share: 0 });
  });

  it('document keys are stable strings per surface', () => {
    expect(docKey.energy('electricityKwh')).toBe('energy.electricityKwh');
    expect(docKey.water('bodMgL')).toBe('water.bodMgL');
    expect(docKey.equipmentSpec('Combi oven')).toBe('equipment.Combi oven.spec');
    expect(docKey.refrigerantService('Blast chiller', '2026-09-01')).toBe('refrigerant.Blast chiller.2026-09-01');
  });
});

describe('muse entity links — site placement', () => {
  const county = { lat: 30.239513, lng: -97.69127 };

  it('a linked school with a street geocode replaces the county centroid', () => {
    const p = sitePlacement(county, { lat: 30.25, lng: -97.75, geoSource: 'address' });
    expect(p).toEqual({ lat: 30.25, lng: -97.75, source: 'school-address', fromLinkedSchool: true });
  });

  it('a linked school placed by ZIP is still better than the county centroid', () => {
    expect(sitePlacement(county, { lat: 30.25, lng: -97.75, geoSource: 'zip' }).source).toBe('school-zip');
  });

  it('an unplaceable school falls back to the county centroid, not to nothing', () => {
    const p = sitePlacement(county, { lat: null, lng: null, geoSource: null });
    expect(p.source).toBe('county-centroid');
    expect(p.fromLinkedSchool).toBe(false);
  });

  it('no school and no centroid stays unplaced rather than inventing a distance', () => {
    expect(sitePlacement(null, null)).toEqual({ lat: null, lng: null, source: null, fromLinkedSchool: false });
  });
});

describe('muse entity links — resolved sites', () => {
  const seed = [
    { id: 'SITE-01', name: 'Seed One', type: 'Private school', county: 'Travis', serviceWindow: '06:30–08:30', dailyForecastPortions: 320 },
    { id: 'SITE-02', name: 'Seed Two', type: 'Private school', county: 'Nowhere', serviceWindow: '07:00–08:30', dailyForecastPortions: 180 },
  ];
  const school: LeanEntity = {
    kind: 'school', id: 'sch1', name: 'Linked School', subtitle: 'Austin, TX', pills: [],
    href: null, lat: 30.3, lng: -97.7, geoSource: 'address',
  };

  it('takes the school name and geocode when linked, and the overlay forecast', () => {
    const out = resolveSites(seed, { 'SITE-01': { schoolId: 'sch1', dailyForecastPortions: 400 } }, { 'school:sch1': school });
    expect(out[0].name).toBe('Linked School');
    expect(out[0].dailyForecastPortions).toBe(400);
    expect(out[0].placement.fromLinkedSchool).toBe(true);
    expect(out[0].placement.lat).toBe(30.3);
  });

  it('keeps the seed name and county centroid when nothing is linked', () => {
    const out = resolveSites(seed, {}, {});
    expect(out[0].name).toBe('Seed One');
    expect(out[0].schoolId).toBeNull();
    expect(out[0].placement.source).toBe('county-centroid');
    // An unknown county has no centroid on file and stays unplaced.
    expect(out[1].placement.source).toBeNull();
  });

  it('a link to a school the directory cannot resolve keeps the id and falls back', () => {
    const out = resolveSites(seed, { 'SITE-01': { schoolId: 'gone' } }, {});
    expect(out[0].schoolId).toBe('gone');
    expect(out[0].schoolName).toBeNull();
    expect(out[0].placement.source).toBe('county-centroid');
  });

  it('collects the school refs an overlay needs hydrated', () => {
    expect(siteSchoolRefs({ a: { schoolId: 'x' }, b: {}, c: { schoolId: 'y' } })).toEqual(['school:x', 'school:y']);
  });

  it('summarises placement across the set', () => {
    const out = resolveSites(seed, { 'SITE-01': { schoolId: 'sch1' } }, { 'school:sch1': school });
    expect(sitePlacementSummary(out)).toEqual({
      total: 2, linkedToSchool: 1, placedFromSchool: 1, placedFromCounty: 0, unplaced: 1,
    });
  });
});

const MUSE_ROOT = join(__dirname, '..', 'src', 'app', '(muse)', 'muse');

describe('muse entity links — a supplier is reachable from the directory', () => {
  // A dead-end in navigation is invisible to the type checker: the directory
  // table once linked an operation's NAME to its external website, leaving the
  // detail page reachable only by typing the URL.
  it('the supplier detail route exists', () => {
    expect(existsSync(join(MUSE_ROOT, 'suppliers', '[id]', 'page.tsx'))).toBe(true);
  });

  it('the directory links an operation name to its record, not off-site', () => {
    const source = readFileSync(join(MUSE_ROOT, '_components', 'SupplierDirectory.tsx'), 'utf8');
    expect(source).toContain('/muse/suppliers/${o.id}');
    // The external site may still be offered, but never as the operation's name.
    expect(source).not.toMatch(/href=\{o\.website\}[^>]*>\{o\.name\}/);
  });

  it('the picker and the directory search both resolve a supplier to its record', () => {
    for (const f of [['_components', 'SupplierPicker.tsx'], ['_lib', 'entity-directory.ts']]) {
      const source = readFileSync(join(MUSE_ROOT, ...f), 'utf8');
      expect(source, `${f.join('/')} should link a supplier to its detail page`).toContain(
        '/muse/suppliers/',
      );
      expect(source, `${f.join('/')} still links a supplier to the filtered directory`).not.toContain(
        '/muse/suppliers?q=',
      );
    }
  });
});

describe('muse entity links — link surfaces', () => {
  it('every kind has an entry, so the top-bar search never dead-ends', () => {
    for (const kind of ENTITY_KINDS) {
      expect(LINK_SURFACES[kind]).toBeDefined();
    }
  });

  it('every surface points at a muse route', () => {
    for (const list of Object.values(LINK_SURFACES)) {
      for (const s of list) {
        expect(s.href.startsWith('/muse')).toBe(true);
        expect(s.label.length).toBeGreaterThan(0);
      }
    }
  });
});
