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

import type { FactorProvenance } from './emission-factors';

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

export const lcaOptions: LcaOption[] = [
  {
    id: 'quantis-wop-2019:beef-net',
    input: 'Ground beef, 85/15',
    kind: 'cited_lca',
    label: 'White Oak Pastures regenerative beef (Quantis 2019)',
    kgCo2ePerKg: -3.5,
    unitNote: 'per kg fresh meat',
    boundary: 'slaughter_gate',
    provenance: {
      id: 'quantis-wop-2019:beef-net',
      source: 'Quantis, Carbon Footprint Evaluation of Regenerative Grazing at White Oak Pastures',
      sourceUrl: '',
      version: 'Results presentation, 25 February 2019',
      effectiveFrom: '2019-02-25',
      status: 'SOURCED',
      note: 'Carbon only; field to slaughter for 2017; economic allocation of sequestration; not ISO-compliant or peer-reviewed at the time. One Georgia ranch, not a Central Texas measurement.',
    },
  },
  {
    id: 'msu-ucs-amp-2018:beef-net',
    input: 'Ground beef, 85/15',
    kind: 'cited_lca',
    label: 'Adaptive multi-paddock grazing, Upper Midwest finishing (Stanley et al. 2018)',
    // −6.65 kg CO2e per kg carcass weight ÷ 0.6803 kg retail per kg carcass (study-workbook beef-herd mean).
    kgCo2ePerKg: -9.7751,
    unitNote: '−6.65 per kg carcass weight, finishing phase only; shown per kg retail mass at 0.68 kg retail per kg carcass',
    boundary: 'farm_gate',
    provenance: {
      id: 'msu-ucs-amp-2018:beef-net',
      source: 'Stanley, Rowntree, Beede, DeLonge & Hamm (2018), Impacts of soil carbon sequestration on life cycle greenhouse gas emissions in Midwestern USA beef finishing systems, Agricultural Systems 162, 249–258',
      sourceUrl: 'https://doi.org/10.1016/j.agsy.2018.02.003',
      version: 'Agricultural Systems 162 (2018), open access CC BY 4.0',
      effectiveFrom: '2018-02-13',
      status: 'SOURCED',
      note: 'Finishing phase only; cow-calf and backgrounding excluded. Upper Midwest, on-farm data; soil carbon 3.59 Mg C/ha/yr over four years, which the authors expect to diminish and caution against extrapolating. Carcass-to-retail conversion derived from the study workbook.',
    },
  },
];

export function optionsForInput(name: string, options: LcaOption[] = lcaOptions): LcaOption[] {
  return options.filter((o) => o.input === name);
}
