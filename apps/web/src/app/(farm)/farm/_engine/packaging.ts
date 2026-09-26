/**
 * MicroFarm — the packaging library (Roadmap N1). Pure.
 *
 * A package's unit cost is the linked supplier catalog item's price when one is
 * on file — per each, or per pack ÷ the units in the pack — else its manual
 * cost, else none.
 *
 * A package is PICKED (assigned to a crop plan) or UNPICKED (in the library only).
 * A crop plan's packaging per unit is the sum of the packages it picks × how many
 * per unit, at the library's cost — a package with no cost entered counts as
 * zero, and a crop plan that picks nothing carries zero. Packaging equipment is
 * capital on the equipment library and never enters here.
 */

import {
  PACKAGE_TEMPERATURES,
  type PackageDef,
  type PackageTemperature,
  type PackagingLibrary,
  type CropPlanPackagePick,
  type SupplierItemPrice,
} from '../_data/packaging';

export const PACKAGE_TEMPERATURE_LABELS: Record<PackageTemperature, string> = { hot: 'Hot', cold: 'Cold' };

export type PackageCostBasis = 'supplier' | 'manual' | 'none';

export const PACKAGE_COST_BASIS_LABELS: Record<PackageCostBasis, string> = {
  supplier: 'supplier price',
  manual: 'manual cost',
  none: 'no cost on file',
};

export interface PackageUnitCost {
  cost: number | null;
  basis: PackageCostBasis;
}

export function packageUnitCost(pkg: PackageDef, items: readonly SupplierItemPrice[]): PackageUnitCost {
  const item = pkg.supplierItemId ? items.find((i) => i.id === pkg.supplierItemId) : undefined;
  if (item && item.unitPrice !== null) {
    const units = pkg.supplierUnitsPerPack > 0 ? pkg.supplierUnitsPerPack : 1;
    return { cost: item.priceBasis === 'each' ? item.unitPrice : item.unitPrice / units, basis: 'supplier' };
  }
  if (pkg.manualUnitCost !== null) return { cost: pkg.manualUnitCost, basis: 'manual' };
  return { cost: null, basis: 'none' };
}

export interface CropPlanPackagingLine {
  pick: CropPlanPackagePick;
  pkg: PackageDef | null;
  unit: PackageUnitCost;
  /** Unit cost × per unit; zero when the package has no cost entered. */
  extended: number;
}

export interface CropPlanPackagingCost {
  /** The sum of the picked packages at the library's cost; zero with none picked or none costed. */
  perUnit: number;
  lines: CropPlanPackagingLine[];
}

export function cropPlanPackagingCost(cropPlanCode: string, lib: PackagingLibrary): CropPlanPackagingCost {
  const lines = lib.picks
    .filter((p) => p.cropPlanCode === cropPlanCode)
    .map((pick): CropPlanPackagingLine => {
      const pkg = lib.packages.find((x) => x.id === pick.packageId) ?? null;
      const unit: PackageUnitCost = pkg ? packageUnitCost(pkg, lib.supplierItems) : { cost: null, basis: 'none' };
      return { pick, pkg, unit, extended: (unit.cost ?? 0) * pick.qtyPerUnit };
    });
  return { perUnit: lines.reduce((s, l) => s + l.extended, 0), lines };
}

const lastWhenNull = (a: number | null, b: number | null): number => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b);
const textOrder = (a: string | null, b: string | null): number => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : a.localeCompare(b));

/** Library order: hot, cold, then unset; material; size; end-of-use rank (unranked last); name. */
export function packagingOrder(a: PackageDef, b: PackageDef): number {
  const temp = (p: PackageDef) => (p.temperature === null ? PACKAGE_TEMPERATURES.length : PACKAGE_TEMPERATURES.indexOf(p.temperature));
  return (
    temp(a) - temp(b) ||
    textOrder(a.material, b.material) ||
    lastWhenNull(a.sizeValue, b.sizeValue) ||
    lastWhenNull(a.endOfUseRank, b.endOfUseRank) ||
    a.name.localeCompare(b.name)
  );
}

export const packageSizeLabel = (p: Pick<PackageDef, 'sizeValue' | 'sizeUnit'>): string =>
  p.sizeValue === null ? '—' : `${p.sizeValue}${p.sizeUnit ? ` ${p.sizeUnit}` : ''}`;

/** The columns of `farm.packages` the library reads. */
export interface PackageRowShape {
  id: string;
  name: string;
  channels: unknown;
  temperature: string | null;
  material: string | null;
  sizeValue: number | null;
  sizeUnit: string | null;
  endOfUse: string | null;
  endOfUseRank: number | null;
  manualUnitCost: number | null;
  supplierItemId: string | null;
  supplierUnitsPerPack: number;
  notes: string | null;
  source: string;
}

export function packageFromRow(r: PackageRowShape): PackageDef {
  const channels = Array.isArray(r.channels) ? [...new Set((r.channels as unknown[]).filter((c): c is number => Number.isInteger(c) && (c as number) >= 1 && (c as number) <= 3))].sort() : [];
  return {
    id: r.id,
    name: r.name,
    channels,
    temperature: r.temperature === 'hot' || r.temperature === 'cold' ? r.temperature : null,
    material: r.material,
    sizeValue: r.sizeValue,
    sizeUnit: r.sizeUnit,
    endOfUse: r.endOfUse,
    endOfUseRank: r.endOfUseRank,
    manualUnitCost: r.manualUnitCost,
    supplierItemId: r.supplierItemId,
    supplierUnitsPerPack: r.supplierUnitsPerPack > 0 ? r.supplierUnitsPerPack : 1,
    notes: r.notes,
    source: r.source === 'seed' ? 'seed' : 'user_built',
  };
}
