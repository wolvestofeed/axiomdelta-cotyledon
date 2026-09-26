import 'server-only';
import { loadDefinitions, resolveWithDefinitions } from './scenarios';

/** The School lunches channel (plan-data `phases`). */
const SCHOOL_LUNCHES = 1;

/**
 * The School lunches price per meal on record: the definitions with no forecast
 * edit. The Parent Portal is Actual only (Roadmap N6 slice 4, Robert 2026-09-16) —
 * a parent never sees a forecast's price.
 */
export async function schoolLunchPriceOnRecord(): Promise<number> {
  const inputs = resolveWithDefinitions({}, await loadDefinitions());
  return inputs.phases.find((p) => p.phase === SCHOOL_LUNCHES)?.pricePerMeal ?? 0;
}
