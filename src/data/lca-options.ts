/**
 * Cotyledon — curated LCA basis options per input.
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

export type LcaBoundary = 'retail' | 'slaughter_gate' | 'farm_gate' | 'cradle_to_gate';

export const BOUNDARY_LABEL: Record<LcaBoundary, string> = {
  retail: 'Retail weight, losses included',
  slaughter_gate: 'Farm to slaughter gate',
  farm_gate: 'Farm gate',
  cradle_to_gate: 'Cradle to gate (production site)',
};

export interface LcaOption {
  /** Stable id; also the provenance id of the registered figure it cites. */
  id: string;
  /** Grow plan input name this option applies to. */
  input: string;
  kind: 'cited_lca' | 'supplier';
  label: string;
  /** kg CO2e per kg of product at the stated boundary. */
  kgCo2ePerKg: number;
  unitNote: string;
  boundary: LcaBoundary;
  provenance: FactorProvenance;
}

const BRASSICA_SEED_PROVENANCE: FactorProvenance = {
  id: 'parkes-2022:brassica-seed',
  source: 'Parkes et al. (2022), Atmosphere 13(8), 1317: seeds 4.04 kg CO2e per kg fresh weight at 0.07 kg seed per kg, on the Agribalyse process "Cauliflower seed, conventional, at production site/FR U"',
  sourceUrl: 'https://www.mdpi.com/2073-4433/13/8/1317',
  version: 'Published 18 August 2022; Sections 2.4.2 and 3.1.1',
  effectiveFrom: '2022-08-18',
  status: 'DERIVED',
  note: '4.04 ÷ 0.07 = 57.7 kg CO2e per kg of brassica seed: arithmetic on the study\'s two figures. A French cauliflower seed process standing in for an American broccoli, radish or cabbage seed; cradle to the seed production site.',
};

const brassicaSeedOption = (input: string): LcaOption => ({
  id: `parkes-2022:brassica-seed:${input.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  input,
  kind: 'cited_lca',
  label: 'Brassica seed, Agribalyse cauliflower seed process via Parkes et al. 2022',
  kgCo2ePerKg: 4.04 / 0.07,
  unitNote: 'per kg of seed, cradle to the seed production site',
  boundary: 'cradle_to_gate',
  provenance: BRASSICA_SEED_PROVENANCE,
});

/**
 * Curated cited figures a line's selected basis can take, keyed by input name. The brassica seed
 * option is the one cited seed figure on file; a supplier's own figure is added from Supplier LCA data.
 */
export const lcaOptions: LcaOption[] = [brassicaSeedOption('Di Cicco broccoli'), brassicaSeedOption('Rambo purple radish'), brassicaSeedOption('Red Acre cabbage')];

export function optionsForInput(name: string, options: LcaOption[] = lcaOptions): LcaOption[] {
  return options.filter((o) => o.input === name);
}
