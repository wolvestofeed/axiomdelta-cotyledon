import { describe, it, expect } from 'vitest';
import {
  entityRef,
  parseEntityRef,
  groupRefsByKind,
  supplierReverseLinks,
  lotTrace,
  lotsFromSupplier,
  evidenceCoverage,
  pickupPointPlacement,
  docKey,
  LINK_SURFACES,
  ENTITY_KINDS,
  type LotEdge,
} from '@/engine/entity-links';
import { resolvePickupPoints, pickupPointProspectRefs, pickupPointPlacementSummary } from '@/engine/pickup-points';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LeanEntity } from '@/engine/entity-links';

describe('farm entity links — reference encoding', () => {
  it('round-trips a plain ref', () => {
    expect(parseEntityRef(entityRef('supplier', 'abc'))).toEqual({ kind: 'supplier', id: 'abc' });
  });

  it('splits on the first colon only, so an id may contain one', () => {
    const ref = entityRef('equipment', 'Blackout rack: 200 lb');
    expect(parseEntityRef(ref)).toEqual({ kind: 'equipment', id: 'Blackout rack: 200 lb' });
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

describe('farm entity links — supplier reverse view', () => {
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
    expect(rows[0].inputs).toEqual(['Beans', 'Beef']);
    expect(rows[0].orderedSpend).toBe(900);
    expect(rows[0].orderedCases).toBe(5);
    expect(rows[1].supplierId).toBe('b');
    expect(rows[1].orderedSpend).toBe(100);
  });

  it('a linked line the order does not buy counts as a link with no spend', () => {
    const rows = supplierReverseLinks({ Cilantro: 'a' }, po);
    expect(rows[0].inputs).toEqual(['Cilantro']);
    expect(rows[0].orderedLines).toBe(0);
    expect(rows[0].orderedSpend).toBe(0);
  });

  it('works with no purchase order at all', () => {
    const rows = supplierReverseLinks({ Beef: 'a' });
    expect(rows[0].orderedSpend).toBe(0);
  });
});

describe('farm entity links — lot trace', () => {
  const edges: LotEdge[] = [
    { fromId: 'L1', toKind: 'supplier', toId: 's1', note: null },
    { fromId: 'L1', toKind: 'supplier', toId: 's1', note: 'duplicate edge' },
    { fromId: 'L1', toKind: 'pickupPoint', toId: 'pickup-point-01', note: null },
    { fromId: 'L1', toKind: 'pickupPoint', toId: 'pickup-point-02', note: null },
    { fromId: 'L2', toKind: 'supplier', toId: 's1', note: null },
    { fromId: 'L1', toKind: 'source', toId: 'doc1', note: null },
  ];

  it('splits one lot back to suppliers and forward to pickup points, de-duplicated', () => {
    const t = lotTrace('L1', edges);
    expect(t.supplierIds).toEqual(['s1']);
    expect(t.pickupPointIds).toEqual(['pickup-point-01', 'pickup-point-02']);
    expect(t.sourceIds).toEqual(['doc1']);
  });

  it('a lot with nothing recorded traces to nothing rather than guessing', () => {
    expect(lotTrace('L9', edges)).toEqual({ lot: 'L9', supplierIds: [], pickupPointIds: [], sourceIds: [] });
  });

  it('asks the recall question the other way — every lot from one operation', () => {
    expect(lotsFromSupplier('s1', edges)).toEqual(['L1', 'L2']);
    expect(lotsFromSupplier('s9', edges)).toEqual([]);
  });
});

describe('farm entity links — evidence coverage', () => {
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
    expect(docKey.water('meteredGalPerMonth')).toBe('water.meteredGalPerMonth');
    expect(docKey.equipmentSpec('Jar stand oven')).toBe('equipment.Jar stand oven.spec');
    expect(docKey.refrigerantService('Blackout rack', '2026-09-01')).toBe('refrigerant.Blackout rack.2026-09-01');
  });
});

describe('farm entity links — pickup point placement', () => {
  const county = { lat: 30.239513, lng: -97.69127 };

  it('a linked prospect with a street geocode replaces the county centroid', () => {
    const p = pickupPointPlacement(county, { lat: 30.25, lng: -97.75, geoSource: 'address' });
    expect(p).toEqual({ lat: 30.25, lng: -97.75, source: 'prospect-address', fromLinkedProspect: true });
  });

  it('a linked prospect placed by ZIP is still better than the county centroid', () => {
    expect(pickupPointPlacement(county, { lat: 30.25, lng: -97.75, geoSource: 'zip' }).source).toBe('prospect-zip');
  });

  it('an unplaceable prospect falls back to the county centroid, not to nothing', () => {
    const p = pickupPointPlacement(county, { lat: null, lng: null, geoSource: null });
    expect(p.source).toBe('county-centroid');
    expect(p.fromLinkedProspect).toBe(false);
  });

  it('no prospect and no centroid stays unplaced rather than inventing a distance', () => {
    expect(pickupPointPlacement(null, null)).toEqual({ lat: null, lng: null, source: null, fromLinkedProspect: false });
  });
});

describe('farm entity links — resolved pickup points', () => {
  const seed = [
    { id: 'pickup-point-01', name: 'Seed One', type: 'Private prospect', county: 'Travis', serviceWindow: '06:30–08:30', dailyForecastUnits: 320 },
    { id: 'pickup-point-02', name: 'Seed Two', type: 'Private prospect', county: 'Nowhere', serviceWindow: '07:00–08:30', dailyForecastUnits: 180 },
  ];
  const prospect: LeanEntity = {
    kind: 'prospect', id: 'sch1', name: 'Linked Prospect', subtitle: 'Austin, TX', pills: [],
    href: null, lat: 30.3, lng: -97.7, geoSource: 'address',
  };

  it('takes the prospect name and geocode when linked, and the overlay forecast', () => {
    const out = resolvePickupPoints(seed, { 'pickup-point-01': { prospectId: 'sch1', dailyForecastUnits: 400 } }, { 'prospect:sch1': prospect });
    expect(out[0].name).toBe('Linked Prospect');
    expect(out[0].dailyForecastUnits).toBe(400);
    expect(out[0].placement.fromLinkedProspect).toBe(true);
    expect(out[0].placement.lat).toBe(30.3);
  });

  it('keeps the seed name and county centroid when nothing is linked', () => {
    const out = resolvePickupPoints(seed, {}, {});
    expect(out[0].name).toBe('Seed One');
    expect(out[0].prospectId).toBeNull();
    expect(out[0].placement.source).toBe('county-centroid');
    // An unknown county has no centroid on file and stays unplaced.
    expect(out[1].placement.source).toBeNull();
  });

  it('a link to a prospect the directory cannot resolve keeps the id and falls back', () => {
    const out = resolvePickupPoints(seed, { 'pickup-point-01': { prospectId: 'gone' } }, {});
    expect(out[0].prospectId).toBe('gone');
    expect(out[0].prospectName).toBeNull();
    expect(out[0].placement.source).toBe('county-centroid');
  });

  it('collects the prospect refs an overlay needs hydrated', () => {
    expect(pickupPointProspectRefs({ a: { prospectId: 'x' }, b: {}, c: { prospectId: 'y' } })).toEqual(['prospect:x', 'prospect:y']);
  });

  it('summarises placement across the set', () => {
    const out = resolvePickupPoints(seed, { 'pickup-point-01': { prospectId: 'sch1' } }, { 'prospect:sch1': prospect });
    expect(pickupPointPlacementSummary(out)).toEqual({
      total: 2, linkedToProspect: 1, placedFromProspect: 1, placedFromCounty: 0, unplaced: 1,
    });
  });
});

const FARM_ROOT = join(__dirname, '..', 'src', 'app', '(farm)', 'farm');
const SRC = join(__dirname, '..', 'src');

describe('farm entity links — a supplier is reachable from the directory', () => {
  // A dead-end in navigation is invisible to the type checker: the directory
  // table once linked an operation's NAME to its external website, leaving the
  // detail page reachable only by typing the URL.
  it('the supplier detail route exists', () => {
    expect(existsSync(join(FARM_ROOT, 'suppliers', '[id]', 'page.tsx'))).toBe(true);
  });

  it('the directory links an operation name to its record, not off-pickup-point', () => {
    const source = readFileSync(join(SRC, 'components', 'SupplierDirectory.tsx'), 'utf8');
    expect(source).toContain('/farm/suppliers/${o.id}');
    // The external pickup point may still be offered, but never as the operation's name.
    expect(source).not.toMatch(/href=\{o\.website\}[^>]*>\{o\.name\}/);
  });

  it('the picker and the directory search both resolve a supplier to its record', () => {
    for (const f of [['components', 'SupplierPicker.tsx'], ['server', 'entity-directory.ts']]) {
      const source = readFileSync(join(SRC, ...f), 'utf8');
      expect(source, `${f.join('/')} should link a supplier to its detail page`).toContain(
        '/farm/suppliers/',
      );
      expect(source, `${f.join('/')} still links a supplier to the filtered directory`).not.toContain(
        '/farm/suppliers?q=',
      );
    }
  });
});

describe('farm entity links — link surfaces', () => {
  it('every kind has an entry, so the top-bar search never dead-ends', () => {
    for (const kind of ENTITY_KINDS) {
      expect(LINK_SURFACES[kind]).toBeDefined();
    }
  });

  it('every surface points at a farm route', () => {
    for (const list of Object.values(LINK_SURFACES)) {
      for (const s of list) {
        expect(s.href.startsWith('/farm')).toBe(true);
        expect(s.label.length).toBeGreaterThan(0);
      }
    }
  });
});
