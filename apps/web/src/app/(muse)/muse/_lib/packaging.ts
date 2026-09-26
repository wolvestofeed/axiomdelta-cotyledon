import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { musePackages, museRecipePackages, museRecipes, museSupplierItems, museSupplierItemPrices } from '@ct/db';
import { db } from '@/lib/db';
import { packagingSeed, type PackagingLibrary } from '../_data/packaging';
import { packageFromRow } from '../_engine/packaging';
import { withSeedLock, insertPackages } from './seed-writes';
import { leanSuppliersById } from './supplier-links';

/**
 * Impact OS — packaging library read layer (server-only).
 *
 * On first read of an empty table the packages the per-meal placeholder names
 * are inserted, `source = 'seed'`, under an advisory lock. Returns the library,
 * every recipe's picks (by recipe code) and the supplier catalog prices a
 * package can link to — each at the price IN FORCE TODAY, resolved here so the
 * engine takes one number rather than a history (Roadmap N1).
 */

async function seedIfEmpty(): Promise<void> {
  const any = await db.select({ id: musePackages.id }).from(musePackages).limit(1);
  if (any[0]) return;
  await withSeedLock(db, 'packaging', async (tx) => {
    const again = await tx.select({ id: musePackages.id }).from(musePackages).limit(1);
    if (again[0]) return;
    await insertPackages(tx, packagingSeed);
  });
}

export async function listPackagingLibrary(): Promise<PackagingLibrary> {
  await seedIfEmpty();
  const [rows, picks, items, prices] = await Promise.all([
    db.select().from(musePackages).orderBy(asc(musePackages.createdAt), asc(musePackages.name)),
    db
      .select({ id: museRecipePackages.id, recipeCode: museRecipes.code, packageId: museRecipePackages.packageId, qtyPerMeal: museRecipePackages.qtyPerMeal })
      .from(museRecipePackages)
      .innerJoin(museRecipes, eq(museRecipes.id, museRecipePackages.recipeId))
      .orderBy(asc(museRecipePackages.createdAt)),
    db
      .select({ id: museSupplierItems.id, supplierId: museSupplierItems.supplierId, item: museSupplierItems.item, packSize: museSupplierItems.packSize })
      .from(museSupplierItems)
      .orderBy(asc(museSupplierItems.item)),
    db
      .select({ itemId: museSupplierItemPrices.itemId, effectiveFrom: museSupplierItemPrices.effectiveFrom, unitPrice: museSupplierItemPrices.unitPrice, priceBasis: museSupplierItemPrices.priceBasis })
      .from(museSupplierItemPrices)
      .orderBy(asc(museSupplierItemPrices.effectiveFrom)),
  ]);
  // The price in force today: the latest row on or before it, the rows being in
  // date order, so the last one that qualifies wins.
  const today = new Date().toISOString().slice(0, 10);
  const inForce = new Map<string, { unitPrice: number | null; priceBasis: string | null }>();
  for (const p of prices) {
    const on = typeof p.effectiveFrom === 'string' ? p.effectiveFrom.slice(0, 10) : p.effectiveFrom;
    if (on > today) continue;
    inForce.set(p.itemId, { unitPrice: p.unitPrice, priceBasis: p.priceBasis });
  }
  const names = leanSuppliersById([...new Set(items.map((i) => i.supplierId))]);
  return {
    packages: rows.map(packageFromRow),
    picks,
    supplierItems: items.map((i) => ({
      ...i,
      unitPrice: inForce.get(i.id)?.unitPrice ?? null,
      priceBasis: inForce.get(i.id)?.priceBasis ?? null,
      supplierName: names[i.supplierId]?.name ?? null,
    })),
  };
}
