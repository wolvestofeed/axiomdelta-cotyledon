/**
 * Impact OS — financial rollups, re-exported for existing importers.
 *
 * The production-day ledger that lived here was retired in Roadmap N6 (slice 2):
 * production posts day by day on the Plan ledger (`plan-ledger.ts`) and from batch
 * records on the Actual ledger (`actuals-ledger.ts`).
 */

export { phaseEconomics } from './phase';
export type { PhaseEconomics, PhaseOverride, PhaseOverrides } from './phase';
export { capexRollup, fixedCosts, pmt, extendedCost } from './proforma';
export type { CapexRollup, FixedCosts } from './proforma';
