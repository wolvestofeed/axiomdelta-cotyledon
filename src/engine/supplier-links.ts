/**
 * MicroFarm — input → supplier links (pure).
 *
 * A lean supplier record is what the browser is allowed to hold: enough to
 * name the operation, show its certification and rating, and place it on a
 * map. The full compiled directory stays server-side.
 */

import type { MarkRating } from '@/data/mark';
import type { LcaOption, LcaBoundary } from '@/data/lca-options';
import type { FactorProvenance } from '@/data/emission-factors';
import { haversineMiles } from '@/engine/geo';
import { freightFactorSmartWay } from '@/data/emission-factors';
import { KG_PER_SHORT_TON } from '@/engine/carbon';

export interface LeanSupplier {
  id: string;
  name: string;
  location: string;
  certified: boolean;
  certScope: string;
  prospectReady: boolean;
  lat: number | null;
  lng: number | null;
  geoSource: 'zip' | 'county' | null;
  rating: MarkRating;
}

// ── Spend coverage on the purchase order ────────────────────────────────────

export interface SpendCoverage {
  totalSpend: number;
  linkedSpend: number;
  certifiedSpend: number;
  ratedSpend: number;
  linesTotal: number;
  linesLinked: number;
  linkedShare: number;
  certifiedShare: number;
  ratedShare: number;
}

/** Share of purchase-order spend on lines linked to a supplier, with a certification on file, and with a mark rating on file. */
export function spendCoverage(
  poLines: { name: string; extendedCost: number }[],
  links: Record<string, string>,
  suppliers: Record<string, LeanSupplier>,
): SpendCoverage {
  let total = 0;
  let linked = 0;
  let certified = 0;
  let rated = 0;
  let linesLinked = 0;
  for (const l of poLines) {
    total += l.extendedCost;
    const sid = links[l.name];
    const s = sid ? suppliers[sid] : undefined;
    if (!s) continue;
    linesLinked++;
    linked += l.extendedCost;
    if (s.certified) certified += l.extendedCost;
    if (s.rating.status === 'rated') rated += l.extendedCost;
  }
  const share = (n: number) => (total > 0 ? n / total : 0);
  return {
    totalSpend: total,
    linkedSpend: linked,
    certifiedSpend: certified,
    ratedSpend: rated,
    linesTotal: poLines.length,
    linesLinked,
    linkedShare: share(linked),
    certifiedShare: share(certified),
    ratedShare: share(rated),
  };
}

// ── Inbound logistics from linked suppliers ─────────────────────────────────

export interface InboundLeg {
  input: string;
  supplierId: string | null;
  supplierName: string | null;
  massKg: number;
  payloadShortTons: number;
  placed: boolean;
  milesOneWay: number | null;
  tonMiles: number | null;
  kgCo2e: number | null;
}

export interface InboundLogistics {
  legs: InboundLeg[];
  linesLinked: number;
  linesPlaced: number;
  totalTonMiles: number;
  totalKgCo2e: number;
  factor: FactorProvenance;
}

/** Laden leg from each linked supplier to the farm; unlinked or unplaced lines carry no ton-miles. */
export function inboundLogistics(
  lines: { input: string; massKg: number }[],
  links: Record<string, string>,
  suppliers: Record<string, LeanSupplier>,
  home: { lat: number; lng: number },
): InboundLogistics {
  const legs: InboundLeg[] = lines.map((l) => {
    const sid = links[l.input] ?? null;
    const s = sid ? suppliers[sid] : undefined;
    const tons = l.massKg / KG_PER_SHORT_TON;
    if (!s || s.lat === null || s.lng === null) {
      return { input: l.input, supplierId: sid, supplierName: s?.name ?? null, massKg: l.massKg, payloadShortTons: tons, placed: false, milesOneWay: null, tonMiles: null, kgCo2e: null };
    }
    const miles = haversineMiles(home, { lat: s.lat, lng: s.lng });
    const tm = tons * miles;
    return { input: l.input, supplierId: sid, supplierName: s.name, massKg: l.massKg, payloadShortTons: tons, placed: true, milesOneWay: miles, tonMiles: tm, kgCo2e: (tm * freightFactorSmartWay.gCo2PerTonMile) / 1000 };
  });
  const placed = legs.filter((l) => l.placed);
  return {
    legs,
    linesLinked: legs.filter((l) => l.supplierId).length,
    linesPlaced: placed.length,
    totalTonMiles: placed.reduce((s, l) => s + (l.tonMiles ?? 0), 0),
    totalKgCo2e: placed.reduce((s, l) => s + (l.kgCo2e ?? 0), 0),
    factor: freightFactorSmartWay.provenance,
  };
}

// ── Supplier-specific LCA rows → engine options ─────────────────────────────

export interface SupplierLcaRowLike {
  id: string;
  supplierId: string;
  supplierName: string;
  input: string;
  label: string;
  kgCo2ePerKg: number;
  unitNote: string | null;
  boundary: string;
  status: string;
  note: string | null;
  updatedAt: Date | string;
}

export const SUPPLIER_OPTION_PREFIX = 'supplier:';

export function supplierOptionId(rowId: string): string {
  return `${SUPPLIER_OPTION_PREFIX}${rowId}`;
}

export function toLcaOption(r: SupplierLcaRowLike): LcaOption {
  const boundary = (['retail', 'slaughter_gate', 'farm_gate'].includes(r.boundary) ? r.boundary : 'farm_gate') as LcaBoundary;
  const status = (['SOURCED', 'STATED', 'PLACEHOLDER', 'DERIVED', 'UNCONFIRMED', 'DATED'].includes(r.status) ? r.status : 'STATED') as FactorProvenance['status'];
  const updated = typeof r.updatedAt === 'string' ? r.updatedAt.slice(0, 10) : r.updatedAt.toISOString().slice(0, 10);
  return {
    id: supplierOptionId(r.id),
    input: r.input,
    kind: 'supplier',
    label: `${r.supplierName}: ${r.label}`,
    kgCo2ePerKg: r.kgCo2ePerKg,
    unitNote: r.unitNote ?? 'per kg',
    boundary,
    provenance: {
      id: supplierOptionId(r.id),
      source: `${r.supplierName}, ${r.label}`,
      sourceUrl: '',
      version: `supplier figure, updated ${updated}`,
      effectiveFrom: updated,
      status,
      note: r.note ?? undefined,
    },
  };
}
