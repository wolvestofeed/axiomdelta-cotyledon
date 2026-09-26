/**
 * Impact OS — entity links (pure).
 *
 * One record referring to another is the same operation everywhere in the
 * platform: search a directory that stays server-side, resolve the hit to a
 * LEAN record the browser may hold, and store the id. This module is the shared
 * vocabulary for that — the kinds, the lean shape, the reference encoding, and
 * the pure reverse-lookup math the directories and traces read.
 *
 * Two storage rules, and they are not interchangeable:
 *   - A link that changes a model input is a SCENARIO EDIT (the overlay in
 *     `scenario.ts`): ingredient → supplier, site → school, prospect → recipe,
 *     activity input → document.
 *   - A link that is a fact of record is a DATABASE ROW (`muse.entity_links`):
 *     lot → supplier, lot → site, journal entry → document, role → course.
 *
 * Nothing here imports a dataset, so it is safe in client components.
 */

import type { MarkRating } from '../_data/mark';

// ── The kinds and the lean record ───────────────────────────────────────────

/** Every directory a picker can search. */
export type EntityKind =
  | 'supplier'
  | 'school'
  | 'source'
  | 'recipe'
  | 'equipment'
  | 'site'
  | 'course'
  | 'lot';

export const ENTITY_KINDS: EntityKind[] = [
  'supplier',
  'school',
  'source',
  'recipe',
  'equipment',
  'site',
  'course',
  'lot',
];

export const ENTITY_KIND_LABEL: Record<EntityKind, string> = {
  supplier: 'Supplier',
  school: 'School',
  source: 'Source',
  recipe: 'Recipe',
  equipment: 'Equipment',
  site: 'Site',
  course: 'Course',
  lot: 'Lot',
};

/** Plural, for headings and counts. */
export const ENTITY_KIND_PLURAL: Record<EntityKind, string> = {
  supplier: 'Suppliers',
  school: 'Schools',
  source: 'Sources',
  recipe: 'Recipes',
  equipment: 'Equipment',
  site: 'Sites',
  course: 'Courses',
  lot: 'Lots',
};

export function isEntityKind(x: string): x is EntityKind {
  return (ENTITY_KINDS as string[]).includes(x);
}

/** A short fact about the record, shown beside its name. */
export interface EntityPill {
  label: string;
  /** `ok` = a credential or a confirmed state; `plain` = neutral fact. */
  tone: 'ok' | 'plain';
}

/**
 * What the browser is allowed to hold for a linked record: enough to name it,
 * show its state, place it on a map, and navigate to it. The full directory
 * stays server-side.
 */
export interface LeanEntity {
  kind: EntityKind;
  id: string;
  name: string;
  /** One line under the name — location, publisher, category. */
  subtitle: string;
  pills: EntityPill[];
  /** Where the record lives in the platform; null when it has no page of its own. */
  href: string | null;
  lat: number | null;
  lng: number | null;
  geoSource: string | null;
  /** Suppliers carry the certification mark's rating; other kinds do not. */
  rating?: MarkRating;
}

// ── Reference encoding (`kind:id`) ──────────────────────────────────────────

/**
 * A kind-qualified id, for maps and query strings that hold more than one kind.
 * Ids may themselves contain colons (equipment items, lot codes), so parsing
 * splits on the FIRST colon only.
 */
export function entityRef(kind: EntityKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseEntityRef(ref: string): { kind: EntityKind; id: string } | null {
  const i = ref.indexOf(':');
  if (i <= 0) return null;
  const kind = ref.slice(0, i);
  const id = ref.slice(i + 1);
  if (!isEntityKind(kind) || !id) return null;
  return { kind, id };
}

/** Group a flat list of refs by kind, preserving order and dropping duplicates. */
export function groupRefsByKind(refs: string[]): Partial<Record<EntityKind, string[]>> {
  const out: Partial<Record<EntityKind, string[]>> = {};
  const seen = new Set<string>();
  for (const ref of refs) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    const p = parseEntityRef(ref);
    if (!p) continue;
    (out[p.kind] ??= []).push(p.id);
  }
  return out;
}

// ── Reverse view: which lines and orders point at one supplier ───────────────

export interface SupplierReverseRow {
  supplierId: string;
  /** Recipe/purchase-order lines linked to this operation. */
  ingredients: string[];
  /** Extended cost of those lines on the current purchase order. */
  orderedSpend: number;
  /** Purchase-order lines that carry a case count for this operation. */
  orderedLines: number;
  /** Cases to order across those lines. */
  orderedCases: number;
}

/**
 * Invert the ingredient → supplier map: for each linked operation, the lines
 * that name it and what the current purchase order buys from it. A line with no
 * matching purchase-order row still counts as an ingredient link with no spend.
 */
export function supplierReverseLinks(
  links: Record<string, string>,
  poLines: { name: string; extendedCost: number; casesToOrder: number }[] = [],
): SupplierReverseRow[] {
  const byPoLine = new Map(poLines.map((l) => [l.name, l]));
  const out = new Map<string, SupplierReverseRow>();
  for (const [ingredient, supplierId] of Object.entries(links)) {
    if (!supplierId) continue;
    let row = out.get(supplierId);
    if (!row) {
      row = { supplierId, ingredients: [], orderedSpend: 0, orderedLines: 0, orderedCases: 0 };
      out.set(supplierId, row);
    }
    row.ingredients.push(ingredient);
    const po = byPoLine.get(ingredient);
    if (po) {
      row.orderedSpend += po.extendedCost;
      row.orderedLines += 1;
      row.orderedCases += po.casesToOrder;
    }
  }
  for (const row of out.values()) row.ingredients.sort();
  return [...out.values()].sort((a, b) => b.orderedSpend - a.orderedSpend);
}

// ── Lot trace (recall drill) ─────────────────────────────────────────────────

/** One edge of a recorded link, flattened for the trace. */
export interface LotEdge {
  fromId: string;
  toKind: EntityKind;
  toId: string;
  note: string | null;
}

export interface LotTrace {
  lot: string;
  /** Operations that supplied an input to this lot, back through receiving. */
  supplierIds: string[];
  /** Sites this lot shipped to, forward through delivery. */
  siteIds: string[];
  /** Documents recorded against the lot. */
  sourceIds: string[];
}

/**
 * A lot's recorded links, split by direction: suppliers back, sites forward.
 * The edges come from the persisted link rows; nothing is inferred.
 */
export function lotTrace(lot: string, edges: LotEdge[]): LotTrace {
  const pick = (kind: EntityKind) =>
    [...new Set(edges.filter((e) => e.fromId === lot && e.toKind === kind).map((e) => e.toId))];
  return {
    lot,
    supplierIds: pick('supplier'),
    siteIds: pick('site'),
    sourceIds: pick('source'),
  };
}

/** Lots that trace back to one operation — the recall question asked the other way. */
export function lotsFromSupplier(supplierId: string, edges: LotEdge[]): string[] {
  return [
    ...new Set(edges.filter((e) => e.toKind === 'supplier' && e.toId === supplierId).map((e) => e.fromId)),
  ].sort();
}

// ── Evidence coverage ────────────────────────────────────────────────────────

export interface EvidenceCoverage {
  rowsTotal: number;
  rowsWithDocument: number;
  share: number;
}

/**
 * How much of a set of rows carries a document link. Used on the activity
 * inputs and on the journal so the gap in the evidence trail is visible rather
 * than implied.
 */
export function evidenceCoverage(keys: string[], documents: Record<string, string>): EvidenceCoverage {
  const withDoc = keys.filter((k) => !!documents[k]).length;
  return {
    rowsTotal: keys.length,
    rowsWithDocument: withDoc,
    share: keys.length > 0 ? withDoc / keys.length : 0,
  };
}

// ── Document-link keys (stable strings for the scenario overlay) ─────────────

/**
 * The key a document link is filed under in `sustainability.documents`. Keys are
 * stable strings so a saved forecast keeps its evidence trail when the pages
 * around it change.
 */
export const docKey = {
  energy: (field: string) => `energy.${field}`,
  water: (field: string) => `water.${field}`,
  equipmentSpec: (item: string) => `equipment.${item}.spec`,
  refrigerantService: (item: string, date: string) => `refrigerant.${item}.${date}`,
  supplierCert: (supplierId: string) => `supplier.${supplierId}.certificate`,
};

// ── Site placement (what the school link buys you) ───────────────────────────

export type SitePlacementSource = 'school-address' | 'school-zip' | 'county-centroid' | null;

export interface SitePlacement {
  lat: number | null;
  lng: number | null;
  source: SitePlacementSource;
  /** True when the coordinates come from the linked school's own geocode. */
  fromLinkedSchool: boolean;
}

export const PLACEMENT_LABEL: Record<Exclude<SitePlacementSource, null>, string> = {
  'school-address': 'School street-address geocode',
  'school-zip': 'School ZIP-code centroid',
  'county-centroid': 'County centroid',
};

/**
 * Where a delivery site sits. A site linked to a school in the prospect
 * directory is placed at that school's own geocode; an unlinked site falls back
 * to its county centroid, which is placeholder precision and labelled as such.
 */
export function sitePlacement(
  countyCentroid: { lat: number; lng: number } | null,
  linkedSchool: { lat: number | null; lng: number | null; geoSource: string | null } | null,
): SitePlacement {
  if (linkedSchool && linkedSchool.lat !== null && linkedSchool.lng !== null) {
    return {
      lat: linkedSchool.lat,
      lng: linkedSchool.lng,
      source: linkedSchool.geoSource === 'address' ? 'school-address' : 'school-zip',
      fromLinkedSchool: true,
    };
  }
  if (countyCentroid) {
    return { lat: countyCentroid.lat, lng: countyCentroid.lng, source: 'county-centroid', fromLinkedSchool: false };
  }
  return { lat: null, lng: null, source: null, fromLinkedSchool: false };
}

// ── Where a record can be linked from ───────────────────────────────────────

export interface LinkSurface {
  label: string;
  href: string;
}

/**
 * For each kind, the surfaces that can point at one of its records. The top-bar
 * search uses this to answer the question that follows finding a record: not just
 * "where does this live" but "where do I link it".
 *
 * Keep in step with the pages that actually carry a picker for that kind — a
 * surface listed here and not built is a promise the platform does not keep.
 */
export const LINK_SURFACES: Record<EntityKind, LinkSurface[]> = {
  supplier: [
    { label: 'Recipes — set a line’s source', href: '/muse/recipes' },
    { label: 'Procurement — on the order line', href: '/muse/procurement' },
    { label: 'Ingredients (Scope 3)', href: '/muse/sustainability/ingredients' },
    { label: 'Suppliers — link a line from the row', href: '/muse/suppliers' },
    { label: 'Supplier LCA Data — record a figure', href: '/muse/sustainability/supplier-lca' },
    { label: 'Inventory — received from, on a lot', href: '/muse/inventory' },
  ],
  school: [
    { label: 'Sites & Delivery — make it a site', href: '/muse/sites' },
    { label: 'Sales — the prospect workspace', href: '/muse/sales' },
    { label: 'Parent Portal — enrolment', href: '/muse/parent-portal' },
  ],
  source: [
    { label: 'Energy — the document behind a figure', href: '/muse/sustainability/energy' },
    { label: 'Water & Effluent — invoice or lab report', href: '/muse/sustainability/water' },
    { label: 'Equipment & Rebates — spec sheet', href: '/muse/sustainability/equipment' },
    { label: 'Refrigerants — service ticket', href: '/muse/sustainability/refrigerants' },
    { label: 'Ledger — evidence for an entry', href: '/muse/financials/ledger' },
    { label: 'Supplier LCA Data — the vendor’s document', href: '/muse/sustainability/supplier-lca' },
    { label: 'Training — a role’s certificate', href: '/muse/training' },
  ],
  recipe: [{ label: 'Sales — recipes quoted to a prospect', href: '/muse/sales' }],
  equipment: [
    { label: 'Equipment & Rebates — attributes and spec sheet', href: '/muse/sustainability/equipment' },
  ],
  site: [
    { label: 'Sales — where a prospect is served from', href: '/muse/sales' },
    { label: 'Inventory — shipped to, on a lot', href: '/muse/inventory' },
  ],
  course: [{ label: 'Training — assign to a role', href: '/muse/training' }],
  lot: [
    { label: 'Inventory — the lot register', href: '/muse/inventory' },
    { label: 'Food Safety — the CCP-2 log and trace', href: '/muse/food-safety' },
  ],
};
