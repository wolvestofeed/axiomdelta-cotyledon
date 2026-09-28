/**
 * Cotyledon — the stage control points (outline §4). What is checked and recorded at each stage
 * of the grow, in place of the thermal critical control points of the Phase 1-era plan.
 *
 * Each control point names its stage, the hazard, the check, the record and its source. The
 * critical limits that are regulation are SOURCED to the FSMA Produce Safety Rule (21 CFR Part
 * 112; Subpart M for sprouts) as registered on the Sources page; the temperature and humidity
 * bands the facility holds are the operator's to set and carry PLACEHOLDER until they are, with
 * the science-library rows that describe the risk beside them. Nothing here is a number the
 * platform made up.
 */

import { tagged, type Tagged } from '@/data/tagged';
import type { StageControlPoint, StageKey } from '@/data/stage-schedule';

export interface ControlPointDef {
  id: StageControlPoint;
  name: string;
  /** The stages the check is recorded at. */
  stages: StageKey[];
  /** Sprout plans only, tray plans only, or every plan. */
  appliesTo: 'sprout' | 'tray' | 'all';
  hazard: string;
  criticalLimit: Tagged<string>;
  monitoring: string;
  correctiveAction: string;
  verification: string;
  record: string;
  /** Science-library rows that describe the hazard, where there are any. */
  rows: number[];
  /** The Sources-page key the limit rests on, where it is regulation. */
  sourceKey: string | null;
}

const PSR = 'fda:fsma-produce-safety-rule';

export const STAGE_CONTROL_POINTS: readonly ControlPointDef[] = [
  {
    id: 'seed-sanitation',
    name: 'Seed sanitation',
    stages: ['soak'],
    appliesTo: 'all',
    hazard: 'Pathogens carried on or in the seed coat: Salmonella and Shiga toxin-producing E. coli.',
    criticalLimit: tagged('Sprout seed is treated with a scientifically valid method immediately before sprouting (21 CFR 112.142); the treatment, its concentration and contact time are recorded per lot. Microgreen seed follows the same treatment record until the produce safety plan states otherwise.', 'SOURCED', 'rule', '21 CFR 112 Subpart M, §112.142 seed treatment'),
    monitoring: 'The treatment, concentration, contact time and seed lot on every soak, entered on the sowing record by the person who treated the seed.',
    correctiveAction: 'Seed not treated, or treated outside the recorded method, is not sown; the lot is held and the supplier is asked for its certificate of analysis.',
    verification: 'The sowing record carries a treatment line for every sowing; the record is reviewed weekly.',
    record: 'Seed treatment record on the sowing',
    rows: [],
    sourceKey: PSR,
  },
  {
    id: 'spent-water-test',
    name: 'Spent sprout irrigation water test',
    stages: ['germination'],
    appliesTo: 'sprout',
    hazard: 'Pathogens amplified in the warm, wet, dark conditions sprouts are grown in.',
    criticalLimit: tagged('Spent sprout irrigation water from each production batch is tested for Listeria species, Salmonella and E. coli O157:H7, no earlier than 48 hours after sprouting starts; no batch is distributed before a negative result (21 CFR 112.144, 112.147).', 'SOURCED', 'rule', '21 CFR 112 Subpart M, §112.144 to §112.147'),
    monitoring: 'A sample of the spent rinse water from every jar batch is sent to the laboratory at or after 48 hours; the result is entered against the batch.',
    correctiveAction: 'A positive result: the batch is held and destroyed, the equipment is cleaned and sanitized, the seed lot is withdrawn from use, and the corrective action is recorded (21 CFR 112.148).',
    verification: 'Every distributed sprout batch has a negative result on file dated before its distribution.',
    record: 'Spent irrigation water test result on the sowing',
    rows: [],
    sourceKey: PSR,
  },
  {
    id: 'temperature-humidity',
    name: 'Temperature and humidity',
    stages: ['germination', 'blackout', 'light', 'harvest-window'],
    appliesTo: 'all',
    hazard: 'Mold and bacterial growth in a warm, humid, still canopy; condensation under the blackout dome.',
    criticalLimit: tagged('No band is on file. The produce safety plan states the grow-room temperature and relative humidity range the facility holds and the reading interval; until then every reading is recorded and none is judged.', 'PLACEHOLDER', 'band', 'Set by the operator in the produce safety plan'),
    monitoring: 'Grow-room air temperature and relative humidity read at the inspection walk-through on the daily stream, recorded with the date and the person.',
    correctiveAction: 'A reading outside the stated band: fans, dome or light changed and the reading repeated; trays with visible mold are removed and the removal recorded as scrap.',
    verification: 'The readings are reviewed weekly against the band once one is stated.',
    record: 'Grow-room readings log',
    rows: [],
    sourceKey: null,
  },
  {
    id: 'harvest-check',
    name: 'Harvest check',
    stages: ['harvest-window'],
    appliesTo: 'all',
    hazard: 'A tray with mold, off-odor, damping-off or foreign matter reaching a subscriber.',
    criticalLimit: tagged('Every tray is inspected before it is packed; a tray with visible mold, off-odor, rot at the stem base or foreign matter is not distributed.', 'STATED', 'check', 'The harvest inspection on the harvest stream'),
    monitoring: 'The person packing inspects each tray; the count passed and the count removed are entered on the sowing record.',
    correctiveAction: 'A removed tray is scrap on the record with its reason; a pattern across a sowing is reviewed against the grow-room readings and the seed lot.',
    verification: 'The sowing record closes only with the inspection counts entered.',
    record: 'Harvest inspection counts on the sowing',
    rows: [],
    sourceKey: null,
  },
];

export const CONTROL_POINT_BY_ID: Readonly<Record<StageControlPoint, ControlPointDef>> = Object.fromEntries(STAGE_CONTROL_POINTS.map((c) => [c.id, c])) as Record<StageControlPoint, ControlPointDef>;
