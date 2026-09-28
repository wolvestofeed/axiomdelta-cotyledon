import 'server-only';
import { db } from '@/lib/db';
import type { LibraryNutrient } from '@/engine/nutrients';
import { listNutrientsWith } from '@/server/nutrient-rows';

/**
 * Cotyledon — the Nutrients & Supplements library read layer (server-only). The library seeds
 * itself from the code seed on first read; from then on the rows are the source a grow plan's
 * nutrient line is costed against.
 */
export async function listNutrients(): Promise<LibraryNutrient[]> {
  return listNutrientsWith(db);
}
