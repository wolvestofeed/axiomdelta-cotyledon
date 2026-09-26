/**
 * Impact OS — the packaging library's shapes and seed (Roadmap N1).
 *
 * Packaging is what a meal leaves the kitchen in — containers, lids, labels,
 * liners — each a unit cost on the meal. The packaging EQUIPMENT (tray sealer,
 * coder, vacuum packer) is capital in the equipment library, not here.
 */

export const PACKAGE_TEMPERATURES = ['hot', 'cold'] as const;
export type PackageTemperature = (typeof PACKAGE_TEMPERATURES)[number];

/** A package in the library (`muse.packages`). */
export interface PackageDef {
  id: string;
  name: string;
  /** Channel numbers the package is used on. */
  channels: number[];
  temperature: PackageTemperature | null;
  material: string | null;
  sizeValue: number | null;
  sizeUnit: string | null;
  endOfUse: string | null;
  /** 1 is first; null = not ranked. */
  endOfUseRank: number | null;
  /** Dollars per unit, typed. */
  manualUnitCost: number | null;
  /** The supplier catalog item whose price is the supplier-based cost. */
  supplierItemId: string | null;
  /** Units in the supplier's pack when the catalog price is not per each. */
  supplierUnitsPerPack: number;
  notes: string | null;
  source: 'seed' | 'user_built';
}

/** A supplier catalog line's price, as the packaging library reads it. */
export interface SupplierItemPrice {
  id: string;
  supplierId: string;
  supplierName: string | null;
  item: string;
  unitPrice: number | null;
  /** What the price is per: 'each' | 'case' | 'lb' | … */
  priceBasis: string | null;
  packSize: string | null;
}

/** A package a recipe picks (`muse.recipe_packages`). */
export interface RecipePackagePick {
  id: string;
  recipeCode: string;
  packageId: string;
  qtyPerMeal: number;
}

export interface PackagingLibrary {
  packages: PackageDef[];
  picks: RecipePackagePick[];
  supplierItems: SupplierItemPrice[];
}

export type PackageSeed = Omit<PackageDef, 'id' | 'source'>;

const SEED_NOTE =
  'Named in the per-meal packaging placeholder ("Compostable bowl, lid, label") and sized to the 16 oz serving-vessel placeholder. No cost, temperature or end-of-use rank on file.';

/** The three packages the placeholder names. Nothing beyond what it states is filled in. */
export const packagingSeed: PackageSeed[] = [
  { name: 'Compostable bowl, 16 oz', channels: [1], temperature: null, material: 'Compostable', sizeValue: 16, sizeUnit: 'oz', endOfUse: 'Compostable', endOfUseRank: null, manualUnitCost: null, supplierItemId: null, supplierUnitsPerPack: 1, notes: SEED_NOTE },
  { name: 'Lid, 16 oz compostable bowl', channels: [1], temperature: null, material: 'Compostable', sizeValue: 16, sizeUnit: 'oz', endOfUse: 'Compostable', endOfUseRank: null, manualUnitCost: null, supplierItemId: null, supplierUnitsPerPack: 1, notes: SEED_NOTE },
  { name: 'Label', channels: [1], temperature: null, material: null, sizeValue: null, sizeUnit: null, endOfUse: null, endOfUseRank: null, manualUnitCost: null, supplierItemId: null, supplierUnitsPerPack: 1, notes: SEED_NOTE },
];

/** The seed as a library, for the engine's defaults and tests: no picks, no catalog. */
export function seedPackagingLibrary(): PackagingLibrary {
  return {
    packages: packagingSeed.map((p, i) => ({ ...p, id: `seed-package-${i + 1}`, source: 'seed' })),
    picks: [],
    supplierItems: [],
  };
}
