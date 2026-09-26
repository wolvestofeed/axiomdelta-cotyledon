/**
 * MicroFarm — curated LCA basis options per input.
 *
 * The REFERENCE basis for every input is the study mean (Poore & Nemecek)
 * and is never edited. The SELECTED basis is the operator's choice among the
 * study mean, a cited LCA from a registered document, or supplier-specific
 * data. Both are always computed and shown; the gap is the practice or
 * supplier credit.
 *
 * Every option carries its BOUNDARY. A farm-gate or slaughter-gate figure is
 * not comparable to the study's retail-weight mean until the study's own
 * downstream stages are added (see `alignToRetail` in the engine); pages show
 * the raw figure and the aligned figure side by side with the boundary named.
 *
 * Cited options are curated here; supplier-specific options move to the
 * database when vendors supply their own studies (S4).
 */

import type { FactorProvenance } from '@/data/emission-factors';

export type LcaBoundary = 'retail' | 'slaughter_gate' | 'farm_gate';

export const BOUNDARY_LABEL: Record<LcaBoundary, string> = {
  retail: 'Retail weight, losses included',
  slaughter_gate: 'Farm to slaughter gate',
  farm_gate: 'Farm gate',
};

export interface LcaOption {
  /** Stable id; also the provenance id of the registered figure it cites. */
  id: string;
  /** Crop plan input name this option applies to. */
  input: string;
  kind: 'cited_lca' | 'supplier';
  label: string;
  /** kg CO2e per kg of product at the stated boundary. */
  kgCo2ePerKg: number;
  unitNote: string;
  boundary: LcaBoundary;
  provenance: FactorProvenance;
}

/** Curated cited figures a line's selected basis can take, keyed by input name. None until the grow plan lines are mapped (Phase 5); a supplier's own figure is added from Supplier LCA data. */
export const lcaOptions: LcaOption[] = [];

export function optionsForInput(name: string, options: LcaOption[] = lcaOptions): LcaOption[] {
  return options.filter((o) => o.input === name);
}
