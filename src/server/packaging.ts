import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { farmPackages, farmGrowPlanPackages, farmGrowPlans, farmSupplierItems, farmSupplierItemPrices } from '@/db';
import { db } from '@/lib/db';
import { packagingSeed, type PackagingLibrary } from '@/data/packaging';
import { packageFromRow } from '@/engine/packaging';
import { withSeedLock, insertPackages } from '@/server/seed-writes';
import { leanSuppliersById } from '@/server/supplier-links';

/**
 * Cotyledon — packaging library read layer (server-only).
 *
 * On first read of an empty table the packages the per-unit placeholder names
 * are inserted, `source = 'seed'`, under an advisory lock. Returns the library,
 * every grow plan's picks (by grow plan code) and the supplier catalog prices a
 * package can link to — each at the price IN FORCE TODAY, resolved here so the
 * engine takes one number rather than a history (Roadmap N1).
 */

async function seedIfEmpty(): Promise<void> {
  const any = await db.select({ id: farmPackages.id }).from(farmPackages).limit(1);
  if (any[0]) return;
  await withSeedLock(db, 'packaging', async (tx) => {
    const again = await tx.select({ id: farmPackages.id }).from(farmPackages).limit(1);
    if (again[0]) return;
    await insertPackages(tx, packagingSeed);
  });
}

export async function listPackagingLibrary(): Promise<PackagingLibrary> {
  await seedIfEmpty();
  const [rows, picks, items, prices] = await Promise.all([
    db.select().from(farmPackages).orderBy(asc(farmPackages.createdAt), asc(farmPackages.name)),
    db
      .select({ id: farmGrowPlanPackages.id, growPlanCode: farmGrowPlans.code, packageId: farmGrowPlanPackages.packageId, qtyPerUnit: farmGrowPlanPackages.qtyPerUnit })
      .from(farmGrowPlanPackages)
      .innerJoin(farmGrowPlans, eq(farmGrowPlans.id, farmGrowPlanPackages.growPlanId))
      .orderBy(asc(farmGrowPlanPackages.createdAt)),
    db
      .select({ id: farmSupplierItems.id, supplierId: farmSupplierItems.supplierId, item: farmSupplierItems.item, packSize: farmSupplierItems.packSize })
      .from(farmSupplierItems)
      .orderBy(asc(farmSupplierItems.item)),
    db
      .select({ itemId: farmSupplierItemPrices.itemId, effectiveFrom: farmSupplierItemPrices.effectiveFrom, unitPrice: farmSupplierItemPrices.unitPrice, priceBasis: farmSupplierItemPrices.priceBasis })
      .from(farmSupplierItemPrices)
      .orderBy(asc(farmSupplierItemPrices.effectiveFrom)),
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
