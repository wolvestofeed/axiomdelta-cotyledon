/**
 * Impact OS — what an ingredient costs, and where that figure came from (pure).
 *
 * Decision 7 (Robert, 2026-09-14, operating-model-roadmap §3.7): the supplier
 * catalog item's price is the source when one is on file; the recipe line's own
 * price stands only until then.
 *
 * One function answers it for every surface, so a recipe, a purchase order, the
 * net requirement and both ledgers cannot disagree about what a pound of beef
 * costs on a date:
 *
 *   1. The line's linked supplier, from the scenario's ingredient → supplier
 *      links. No link, no catalog price.
 *   2. That supplier's APPROVED catalog line matching the ingredient. A
 *      candidate is a quote on file, not a price (Roadmap N1).
 *   3. The price in force on the date asked for.
 *   4. Its basis must be the unit the recipe line is bought in. A price per case
 *      against a line bought by the pound is NOT converted — the pack size on
 *      the catalog line is free text, and a guessed conversion would be a
 *      fabricated cost. The gap is reported and the recipe's figure stands.
 *
 * Every refusal carries the reason with it. A surface states why a line still
 * prices off the recipe rather than leaving the operator to infer it.
 */

import { matchCatalogPrice, type CatalogLine } from './catalog';

export type PriceBasisSource = 'catalog' | 'recipe';

export interface ResolvedIngredientPrice {
  /** The price to use, per the recipe line's own unit. */
  unitPrice: number;
  basis: PriceBasisSource;
  /** The supplier the line is linked to, whether or not it priced the line. */
  supplierId: string | null;
  /** The catalog line that priced it. */
  itemId: string | null;
  item: string | null;
  /** The date that price came into force. */
  effectiveFrom: string | null;
  /** Why the catalog did not price this line. Null when it did. */
  gap: string | null;
}

export interface IngredientPriceQuery {
  ingredient: string;
  /** The unit the recipe line is bought in; a catalog price must be per this. */
  unit: string;
  /** The line's own figure, which stands until a catalog price is on file. */
  recipeUnitCost: number;
  /** The supplier this ingredient is linked to, if any. */
  supplierId: string | null;
  /** That supplier's catalog lines. */
  catalog: readonly CatalogLine[];
  /** The date the price is read for. */
  asOf: string;
}

/**
 * The one price an ingredient carries on a date, and where it came from.
 * Falls back to the recipe line's figure with the reason stated — never to
 * zero, and never to a converted figure.
 */
export function resolveIngredientPrice(q: IngredientPriceQuery): ResolvedIngredientPrice {
  const fallback = (gap: string, extra: Partial<ResolvedIngredientPrice> = {}): ResolvedIngredientPrice => ({
    unitPrice: q.recipeUnitCost,
    basis: 'recipe',
    supplierId: q.supplierId,
    itemId: null,
    item: null,
    effectiveFrom: null,
    gap,
    ...extra,
  });

  if (!q.supplierId) return fallback('No supplier linked to this line.');
  if (q.catalog.length === 0) return fallback('The linked supplier has no catalog on file.');

  const { line, price, candidate } = matchCatalogPrice(q.ingredient, [...q.catalog], q.asOf);
  if (candidate) return fallback(`${candidate.item} is a candidate line, not approved.`);
  if (!line) return fallback('No approved catalog line matches this ingredient.');
  if (!price || price.unitPrice === null) {
    return fallback(`${line.item} is approved but carries no price in force on ${q.asOf}.`, { item: line.item, itemId: line.id });
  }

  // A catalog price with no basis recorded is per the catalog line's own unit.
  const basisUnit = price.priceBasis ?? line.unit;
  if (basisUnit.trim().toLowerCase() !== q.unit.trim().toLowerCase()) {
    return fallback(
      `${line.item} is priced per ${basisUnit}; this line is bought by the ${q.unit}. The pack size is free text, so the conversion is not made here.`,
      { item: line.item, itemId: line.id },
    );
  }

  return {
    unitPrice: price.unitPrice,
    basis: 'catalog',
    supplierId: q.supplierId,
    itemId: line.id,
    item: line.item,
    effectiveFrom: price.effectiveFrom,
    gap: null,
  };
}
