/**
 * Cotyledon — financial rollups, re-exported for existing importers.
 *
 * The production-day ledger that lived here was retired in Roadmap N6 (slice 2):
 * production posts day by day on the Plan ledger (`plan-ledger.ts`) and from sowing
 * records on the Actual ledger (`actuals-ledger.ts`).
 */

export { phaseEconomics } from '@/engine/phase';
export type { PhaseEconomics, PhaseOverride, PhaseOverrides } from '@/engine/phase';
export { capexRollup, fixedCosts, pmt, extendedCost } from '@/engine/proforma';
export type { CapexRollup, FixedCosts } from '@/engine/proforma';
