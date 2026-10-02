import 'server-only';
import { loadDefinitions, resolveWithDefinitions } from '@/server/scenarios';

/** The Subscriptions channel (plan-data `phases`). */
const PROSPECT_UNITS = 1;

/**
 * The Subscriptions price per unit on record: the definitions with no forecast
 * edit. The Client Portal is Actual only —
 * a subscriber never sees a forecast's price.
 */
export async function prospectUnitPriceOnRecord(): Promise<number> {
  const inputs = resolveWithDefinitions({}, await loadDefinitions());
  return inputs.phases.find((p) => p.phase === PROSPECT_UNITS)?.pricePerUnit ?? 0;
}
