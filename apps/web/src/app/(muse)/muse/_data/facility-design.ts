/**
 * Impact OS — facility design constants (Roadmap Phase Q, facility-design-roadmap.md).
 *
 * The equipment list is the input; the square footage is the output. Nothing
 * here is a facility size. What lives here is:
 *
 *   - the footprint seed for the equipment library (§5 of the build plan):
 *     width, depth, published clearances, the zone each row works in and
 *     whether it sits under a Type I hood — every row tagged SOURCED (a named
 *     model's spec sheet) or ESTIMATED (category-typical);
 *   - the zone circulation factors (§6), each with its derivation;
 *   - the walk-in, spine, structural and hood rules (§4, §6);
 *   - the support program allowances (§7), DoD Space Planning Criteria Ch. 510;
 *   - the Facility Design and Build plan: the approved configuration and the
 *     potential rooms, documented with area, cost, impact and risk (Robert,
 *     2026-09-17). The potential rooms are DOCUMENTED here and nowhere else —
 *     not equipment rows, not scenario overlays, not in the Plan or Actual
 *     ledger.
 *
 * `_engine/facility.ts` reads these; no page reads a figure from here directly
 * (conformance C2).
 */

import type { StatusTag } from './tagged';

// ── Zones ───────────────────────────────────────────────────────────────────

export const FACILITY_ZONES = [
  'Hot line',
  'A la carte',
  'Prep',
  'Packaging',
  'Cook-chill',
  'Cold storage',
  'Walk-in',
  'Warewash',
  'Dispatch',
] as const;

export type FacilityZone = (typeof FACILITY_ZONES)[number];

export const isFacilityZone = (v: unknown): v is FacilityZone => (FACILITY_ZONES as readonly string[]).includes(v as string);

/** How a footprint is known: off a named model's spec sheet, category-typical, stated by the operator, or measured. */
export type FootprintBasis = 'sourced' | 'estimated' | 'stated' | 'observed';

export const FOOTPRINT_BASIS_LABELS: Record<FootprintBasis, string> = { sourced: 'Sourced', estimated: 'Estimated', stated: 'Stated', observed: 'Observed' };

/** The provenance badge a footprint basis wears: a spec sheet is SOURCED, a measurement or statement is STATED, category-typical is a PLACEHOLDER. */
export const footprintTag = (b: FootprintBasis | null | undefined): StatusTag => (b === 'sourced' ? 'SOURCED' : b === 'stated' || b === 'observed' ? 'STATED' : 'PLACEHOLDER');

/**
 * A zone's circulation factor: gross = envelope × (depth + aisle) ÷ depth. The
 * aisle is the Berkeley UHS guidance (§4 item 7) chosen by whether the zone's
 * equipment swings doors or tilt arcs into it; the factor is carried rounded to
 * two places, as the build plan derives it.
 */
export interface ZoneFactor {
  zone: FacilityZone;
  factor: number;
  /** Average equipment depth the aisle is set against, inches; absent where the factor is not a depth-and-aisle derivation. */
  depthIn?: number;
  /** The aisle serving the zone, inches. */
  aisleIn?: number;
  derivation: string;
  authority: string;
}

export const ZONE_FACTORS: readonly ZoneFactor[] = [
  { zone: 'Hot line', factor: 2.23, depthIn: 44, aisleIn: 54, derivation: 'Single aisle with protruding equipment: combi and convection doors swing and the kettle and skillet tilt forward into a cart. (44 + 54) ÷ 44.', authority: 'UC Berkeley UHS Dining Design Guidelines, Space Requirements appendix (GUIDANCE)' },
  { zone: 'Prep', factor: 2.6, depthIn: 30, aisleIn: 48, derivation: 'Single aisle, little traffic, at 30 in table depth. (30 + 48) ÷ 30.', authority: 'UC Berkeley UHS Dining Design Guidelines (GUIDANCE)' },
  { zone: 'Packaging', factor: 2.6, depthIn: 30, aisleIn: 48, derivation: 'Same as Prep: 30 in table depth, 48 in aisle. Ambient in the baseline; the conditioned room is a potential room on the Design and Build plan.', authority: 'UC Berkeley UHS Dining Design Guidelines (GUIDANCE)' },
  { zone: 'Cook-chill', factor: 2.2, depthIn: 35, aisleIn: 42, derivation: 'Traulsen TBC13 is 59-1/8 in deep with the door open against a 35 in body, plus 5-1/2 in side clearance at 105°F ambient; the Cleveland MFS needs 36 in of front access. Units with published clearances (the tumble chiller) are grossed directly, not by this factor.', authority: 'Traulsen TBC13 and Cleveland MFS spec sheets (GUIDANCE, manufacturer)' },
  { zone: 'Cold storage', factor: 2.24, depthIn: 34, aisleIn: 42, derivation: 'Reach-in and mobile cabinets at 34 in depth with a 42 in front clearance (USOE 3.5 ft). (34 + 42) ÷ 34.', authority: 'USOE, Design Criteria: School Food Service Facilities, 1973 (GUIDANCE, dated)' },
  { zone: 'A la carte', factor: 2.45, depthIn: 33, aisleIn: 48, derivation: 'Average line depth 33 in with a 48 in aisle. (33 + 48) ÷ 33.', authority: 'UC Berkeley UHS Dining Design Guidelines (GUIDANCE)' },
  { zone: 'Dispatch', factor: 2.5, depthIn: 32, aisleIn: 48, derivation: 'Cart park plus a 48 in marshalling lane to the dock. (32 + 48) ÷ 32 at the average cart and cabinet depth.', authority: 'Foodservice Equipment Reports, personnel with carts at about 40 in (GUIDANCE)' },
  { zone: 'Warewash', factor: 3, depthIn: 24, aisleIn: 48, derivation: '20 in service clearance on both long faces of the conveyor, plus load and unload tables and a 48 in aisle. Counted in the support program as the warewash room, never on the production floor.', authority: 'Hobart CL44eN and Champion 80 PRO-HD spec sheets (GUIDANCE, manufacturer)' },
  { zone: 'Walk-in', factor: 1, derivation: 'Not a factor. Nominal box plus 2 in panel clearance on every side plus a 6 ft loading apron the width of the door wall.', authority: 'U.S. Cooler and Master-Bilt installation requirements (GUIDANCE, manufacturer)' },
];

export const zoneFactorOf = (zone: FacilityZone): ZoneFactor => ZONE_FACTORS.find((z) => z.zone === zone)!;

// ── The rules that are not zone factors ─────────────────────────────────────

/** Clearance around walk-in panel exteriors, inches (manufacturer installation requirements). */
export const WALK_IN_PANEL_CLEARANCE_IN = 2;
/** The loading apron in front of a walk-in door wall, feet. */
export const WALK_IN_APRON_FT = 6;
/** The main cart route through the plant, feet clear. Berkeley puts a major-traffic aisle at 6 ft; FER puts personnel with carts at 40 in. */
export const SPINE_WIDTH_FT = 5;
/** Spine length as a multiple of the side of a square block of the zone gross: one run the length of the plant and a cross leg. */
export const SPINE_LENGTH_FACTOR = 1.7;
/** Walls, columns and partitions over the production floor, which already carries its own circulation. */
export const STRUCTURAL_GROSS_UP = 1.1;
/** DoD Space Planning Criteria Ch. 510, Food and Nutrition Service: net to department gross. */
export const SUPPORT_NET_TO_GROSS = 1.4;
/** IMC §507.4.1: the canopy overhangs the cooking surface by 6 in on every open side. A run against a wall has two open ends. */
export const HOOD_OVERHANG_IN = 6;
/** The warewash room over its zone gross: soiled landing, clean staging and a cart lane. */
export const WAREWASH_ROOM_FACTOR = 1.6;

/**
 * Peak Single Meals the support program is sized against. This is the space
 * planner's input, not a demand or capacity figure: it is not `phases[].mealsPerDay`
 * (demand) and no capacity or planning engine reads it. The value is the verbal
 * Phase 1 placeholder (Robert, 2026-09-17), read as the whole day dispatching in
 * one school-lunch wave — the conservative reading. A day split across two
 * dispatches lowers PSM and shrinks dry storage and the dock.
 */
export const SUPPORT_PROGRAM_PSM = { value: 1500, status: 'PLACEHOLDER' as StatusTag, unit: 'meals', note: 'Placeholder, read as one dispatch wave. Sizes the support program only; not a demand or capacity input.' };

// ── The support program (§7) ────────────────────────────────────────────────

export interface SupportAllowance {
  key: string;
  space: string;
  /** How the area is set: a fixed allowance, a formula on PSM, or derived from this project's own equipment. */
  kind: 'fixed' | 'psm' | 'derived';
  status: StatusTag;
  basis: string;
  /** Net square feet for a fixed allowance. */
  fixedSqFt?: number;
  /** For `psm`: base + perStep per `step` meals over `over`, optionally capped. */
  psm?: { base: number; perStep: number; step: number; over: number; cap?: number };
  /** For `derived`: which derivation the engine runs. */
  derived?: 'warewash_room' | 'loading_dock';
}

export const SUPPORT_ALLOWANCES: readonly SupportAllowance[] = [
  { key: 'warewash', space: 'Warewash room', kind: 'derived', derived: 'warewash_room', status: 'DERIVED', basis: 'Derived: the warewash zone gross × 1.6 for soiled landing, clean staging and a cart lane. DoD 510 sizes 650 + 253 + 120 + 80 for a tray-service dining facility, which this commissary is not.' },
  { key: 'cart-wash', space: 'Cart wash', kind: 'fixed', fixedSqFt: 120, status: 'SOURCED', basis: 'DoD Space Planning Criteria Ch. 510' },
  { key: 'dock', space: 'Loading dock', kind: 'derived', derived: 'loading_dock', status: 'SOURCED', basis: 'DoD 510: 200 base for two lanes, +80 per lane beyond two. Lanes are one receiving lane plus one per delivery van on the list.' },
  { key: 'dry-food', space: 'Dry food storage', kind: 'psm', psm: { base: 100, perStep: 10, step: 20, over: 200 }, status: 'SOURCED', basis: 'DoD 510: 100 + 10 per 20 PSM over 200. The one line that moves with the PSM figure.' },
  { key: 'wares', space: 'Wares storage', kind: 'fixed', fixedSqFt: 300, status: 'PLACEHOLDER', basis: 'Substituted: 60 linear ft of 24 in shelving × 2.5 circulation. DoD 510 gives 900 sq ft, but it sizes for on-premise tray service; this commissary ships in single-use packaging.' },
  { key: 'chemical', space: 'Non-food and chemical storage', kind: 'psm', psm: { base: 100, perStep: 50, step: 20, over: 200, cap: 500 }, status: 'SOURCED', basis: 'DoD 510: 100 + 50 per 20 PSM over 200, capped at 500. At the cap; the largest soft number in the program.' },
  { key: 'office', space: 'Office, chief food service', kind: 'fixed', fixedSqFt: 120, status: 'SOURCED', basis: 'DoD 510. Scales on FTE; no staffing count is decided, so it holds at the minimum.' },
  { key: 'lounge', space: 'Staff lounge', kind: 'fixed', fixedSqFt: 120, status: 'SOURCED', basis: 'DoD 510: 120 minimum at 10 FTE or fewer.' },
  { key: 'lockers', space: 'Locker and changing, two rooms', kind: 'fixed', fixedSqFt: 240, status: 'SOURCED', basis: 'DoD 510: 120 each. Food Code 6-305.11 requires a designated dressing area where employees change on site; no minimum area is codified.' },
  { key: 'toilets', space: 'Staff toilet and shower, two', kind: 'fixed', fixedSqFt: 120, status: 'SOURCED', basis: 'DoD 510: 60 per unit. Fixture count comes from the Austin-adopted plumbing code, not the food rules.' },
  { key: 'trash', space: 'Trash holding', kind: 'fixed', fixedSqFt: 90, status: 'SOURCED', basis: 'DoD 510' },
  { key: 'refrigerated-waste', space: 'Refrigerated waste', kind: 'fixed', fixedSqFt: 90, status: 'SOURCED', basis: 'DoD 510' },
  { key: 'recyclables', space: 'Recyclables holding', kind: 'fixed', fixedSqFt: 90, status: 'SOURCED', basis: 'DoD 510' },
];

/** DoD 510 loading dock: 200 sq ft covers two lanes; each lane beyond two adds 80. */
export const DOCK_ALLOWANCE = { baseSqFt: 200, baseLanes: 2, perExtraLaneSqFt: 80, receivingLanes: 1 };

// ── The footprint seed (§5) ─────────────────────────────────────────────────

export interface FootprintSeed {
  /** Width along the front, inches; null = no incremental floor. */
  widthIn: number | null;
  depthIn: number | null;
  /** Published installation clearances, inches. Present only where a manufacturer publishes them; the engine then grosses the unit directly instead of by zone factor. */
  clearanceFrontIn?: number;
  clearanceRearIn?: number;
  clearanceSideIn?: number;
  basis: FootprintBasis;
  zone: FacilityZone | null;
  underHood?: boolean;
  /** Where the dimensions came from, or why the row carries no floor. */
  source: string;
  /** The representative model the dimensions are read from, and its spec sheet. */
  manufacturer?: string;
  model?: string;
  specSheetUrl?: string;
}

/**
 * Keyed by item name, so a line split across build phases seeds the same
 * footprint on both rows. A walk-in's width is its door wall (the short side)
 * and its nominal box is taken from the item name. Every row with floor is
 * SOURCED to a named representative model's spec sheet (re-sourced 2026-09-17);
 * the walk-ins are nominal from their names. Rows without floor say why.
 */
export const FOOTPRINT_SEED: Readonly<Record<string, FootprintSeed>> = {
  'Combi oven, full size 20-pan': { widthIn: 42.625, depthIn: 44, basis: 'sourced', zone: 'Hot line', underHood: true, source: 'Rational iCombi Pro 20-full, 42-5/8 x 44 in total', manufacturer: 'Rational', model: 'iCombi Pro 20-full', specSheetUrl: 'https://www.webstaurantstore.com/documents/specsheets/pro_20-full.pdf' },
  'Steam-jacketed tilting kettle, 100 gal': { widthIn: 51, depthIn: 44, basis: 'sourced', zone: 'Hot line', underHood: true, source: 'Cleveland KEL-100-T, 51 x 44 in', manufacturer: 'Cleveland', model: 'KEL-100-T', specSheetUrl: 'https://www.clevelandrange.com/product/kel100t-electric-steam-kettles-quad-leg-tilting/' },
  'Tilting braising pan / skillet, 40 gal': { widthIn: 48, depthIn: 44, basis: 'sourced', zone: 'Hot line', underHood: true, source: 'Cleveland SGL-40-TR, 48 x 44 in', manufacturer: 'Cleveland', model: 'SGL-40-TR', specSheetUrl: 'https://www.clevelandrange.com/wp-content/uploads/2025/02/KE004046-93-SGL-30-40TR.pdf' },
  'Convection oven, double stack': { widthIn: 40.25, depthIn: 41.125, basis: 'sourced', zone: 'Hot line', underHood: true, source: 'Vulcan VC44ED, 40-1/4 x 41-1/8 in', manufacturer: 'Vulcan', model: 'VC44ED', specSheetUrl: 'https://www.vulcanequipment.com/sites/default/files/webdam_asset/85620879.pdf' },
  'Steam-jacketed tilting kettle, 60 gal': { widthIn: 49.375, depthIn: 47.25, basis: 'sourced', zone: 'Hot line', underHood: true, source: 'Cleveland KGL-60-T, 49-3/8 x 47-1/4 in', manufacturer: 'Cleveland', model: 'KGL-60-T', specSheetUrl: 'https://www.clevelandrange.com/wp-content/uploads/2025/02/KE004046-73-KGL-40-60-80-T.pdf' },
  'Buffalo chopper / food processor': { widthIn: null, depthIn: null, basis: 'estimated', zone: null, source: 'Bench-mounted on a prep table; no incremental floor' },
  'Commercial slicer': { widthIn: null, depthIn: null, basis: 'estimated', zone: null, source: 'Bench-mounted on a prep table; no incremental floor' },
  'Prep sinks, 3-comp and 2-comp': { widthIn: 94, depthIn: 27, basis: 'sourced', zone: 'Prep', source: 'Advance Tabco 94-3-54-24RL (103 x 27 in) and 94-2-36-24RL (85 x 27 in), one of each, averaged to 94 x 27 in', manufacturer: 'Advance Tabco', model: '94-3-54-24RL / 94-2-36-24RL', specSheetUrl: 'https://www.webstaurantstore.com/advance-tabco-94-3-54-24rl-spec-line-three-compartment-pot-sink-with-two-drainboards-103/1099435424B.html' },
  'Stainless prep tables, 8 ft': { widthIn: 96, depthIn: 30, basis: 'sourced', zone: 'Prep', source: 'Advance Tabco TTS-308, 96 x 30 in', manufacturer: 'Advance Tabco', model: 'TTS-308', specSheetUrl: 'https://www.gofoodservice.com/p/advance-tabco-tts-308' },
  'Vertical cutter mixer, 45 qt': { widthIn: 36.125, depthIn: 34, basis: 'sourced', zone: 'Prep', source: 'Hobart HCM450, 36-1/8 x 34 in', manufacturer: 'Hobart', model: 'HCM450', specSheetUrl: 'https://www.hobartcorp.com/sites/default/files/webdam-assets/HCM450%20Cutter%20Mixer%20Spec%20Sheet%20F7734%20(04-23).pdf' },
  'Planetary mixer, 80 qt': { widthIn: 27.25, depthIn: 46, clearanceFrontIn: 14.1875, basis: 'sourced', zone: 'Prep', source: 'Hobart HL800, 27-1/4 x 46 in; the bowl swings out to 60-3/16 in, carried as 14-3/16 in front clearance', manufacturer: 'Hobart', model: 'HL800', specSheetUrl: 'https://www.hobartcorp.com/sites/default/files/webdam-assets/HL800%20Legacy%20PLUS%20Spec%20Sheet%20F40113%20(07-21).pdf' },
  'Blast chiller, 200 lb capacity': { widthIn: 41, depthIn: 35, basis: 'sourced', zone: 'Cook-chill', source: 'Traulsen TBC13 (supersedes RBC200), 41 x 35 in, 200 lb rated', manufacturer: 'Traulsen', model: 'TBC13', specSheetUrl: 'https://www.hobart.ca/wp-content/uploads/2024/03/TBC13-Blast-Chiller-Reach-In-Spec-Sheet-TR36053-10-23.pdf' },
  'Casing handling, chill carts': { widthIn: 62, depthIn: 35.5, basis: 'sourced', zone: 'Cook-chill', source: 'Cres Cor R-171-SUA-20E ChillTemp two-door mobile refrigerated cabinet, 62 x 35-1/2 in', manufacturer: 'Cres Cor', model: 'R-171-SUA-20E', specSheetUrl: 'https://www.crescor.com/product/r171sua20e/' },
  'Cook-chill pump fill station': { widthIn: 48, depthIn: 22, basis: 'sourced', zone: 'Cook-chill', source: 'Cleveland MFS Metering Filling Station, 48 x 22 in', manufacturer: 'Cleveland', model: 'MFS', specSheetUrl: 'https://www.clevelandrange.com/product/fam_lfgsem/mfs-metering-filling-station/' },
  'Tumble chiller / ice water bath system': { widthIn: 98, depthIn: 93, clearanceFrontIn: 60, clearanceRearIn: 24, clearanceSideIn: 24, basis: 'sourced', zone: 'Cook-chill', source: 'Cleveland P-TC-220 vertical tumble chiller, 98 x 93 in. Published clearances 60 in front, 24 in rear, 12 in one side and 36 in the electrical side (carried as 24 in each side)', manufacturer: 'Cleveland', model: 'P-TC-220', specSheetUrl: 'https://www.clevelandrange.com/wp-content/uploads/2026/06/Tumble_Chiller.pdf' },
  'Date and lot coder, inkjet': { widthIn: null, depthIn: null, basis: 'estimated', zone: null, source: 'Mounts on the sealer or its conveyor; no incremental floor' },
  'Label printer / applicator': { widthIn: null, depthIn: null, basis: 'estimated', zone: null, source: 'Bench-mounted; no incremental floor' },
  'Packaging tables, stainless': { widthIn: 96, depthIn: 30, basis: 'sourced', zone: 'Packaging', source: 'Advance Tabco TTS-308, 96 x 30 in', manufacturer: 'Advance Tabco', model: 'TTS-308', specSheetUrl: 'https://www.gofoodservice.com/p/advance-tabco-tts-308' },
  'Tray sealer, semi-automatic': { widthIn: 50.39, depthIn: 42.83, basis: 'sourced', zone: 'Packaging', source: 'Ilpra FoodPack Synergy, 1280 x 1088 mm', manufacturer: 'Ilpra', model: 'FoodPack Synergy', specSheetUrl: 'https://ilpra.com/packaging_machine/foodpack-synergy/' },
  'Vacuum packaging machine, chamber': { widthIn: 75, depthIn: 41, basis: 'sourced', zone: 'Packaging', source: 'VacMaster VP800 double chamber, 75 x 41 in', manufacturer: 'VacMaster', model: 'VP800', specSheetUrl: 'https://alfaco.com/product/vacmaster-vp800-double-chamber-vacuum-sealer/' },
  'Mobile refrigerated holding cabinet': { widthIn: 28.3125, depthIn: 37.375, basis: 'sourced', zone: 'Cold storage', source: 'Cres Cor R-171-SUA-10E ChillTemp single-door mobile refrigerated cabinet, 28-5/16 x 37-3/8 in', manufacturer: 'Cres Cor', model: 'R-171-SUA-10E', specSheetUrl: 'https://www.katom.com/546-R171SUA10E.html' },
  'Reach-in refrigerator, 2-door': { widthIn: 54.125, depthIn: 29.5, basis: 'sourced', zone: 'Cold storage', source: 'True T-49-HC two-section reach-in, 54-1/8 x 29-1/2 in', manufacturer: 'True', model: 'T-49-HC', specSheetUrl: 'https://www.truemfg.com/product/t-49-hc/' },
  'Walk-in cooler, 12x20, with refrigeration': { widthIn: 144, depthIn: 240, basis: 'sourced', zone: 'Walk-in', source: 'Nominal 12 x 20 ft from the item name; door on the 12 ft wall' },
  'Walk-in freezer, 10x12, with refrigeration': { widthIn: 120, depthIn: 144, basis: 'sourced', zone: 'Walk-in', source: 'Nominal 10 x 12 ft from the item name; door on the 10 ft wall' },
  'Walk-in cooler, 10x12, with refrigeration': { widthIn: 120, depthIn: 144, basis: 'sourced', zone: 'Walk-in', source: 'Nominal 10 x 12 ft from the item name; door on the 10 ft wall' },
  'Walk-in freezer, 8x10, with refrigeration': { widthIn: 96, depthIn: 120, basis: 'sourced', zone: 'Walk-in', source: 'Nominal 8 x 10 ft from the item name; door on the 8 ft wall' },
  'Hand sinks and mop sink': { widthIn: 17.25, depthIn: 15.25, basis: 'sourced', zone: 'Warewash', source: 'Lot of 6: five Advance Tabco 7-PS-60 wall-hung hand sinks, 17-1/4 x 15-1/4 in each (the unit carried), and one 9-OP-40 floor mop sink, 25 x 21 in', manufacturer: 'Advance Tabco', model: '7-PS-60 / 9-OP-40', specSheetUrl: 'https://www.webstaurantstore.com/advance-tabco-7-ps-60-hand-sink-with-splash-mount-faucet-17-1-4-x-15-1-4/1097PS60.html' },
  'Pot sink, 3-comp with drainboards': { widthIn: 127, depthIn: 31, basis: 'sourced', zone: 'Warewash', source: 'Advance Tabco 94-43-72-24RL, three 24 x 24 in compartments and two 24 in drainboards, 127 x 31 in', manufacturer: 'Advance Tabco', model: '94-43-72-24RL', specSheetUrl: 'https://www.webstaurantstore.com/advance-tabco-94-43-72-24rl-spec-line-three-compartment-pot-sink-with-two-drainboards-127/10994437224B.html' },
  'Rack conveyor dishwasher + booster': { widthIn: 84, depthIn: 26.6875, basis: 'sourced', zone: 'Warewash', source: 'Champion 80 PRO-HD, 84 x 26-11/16 in', manufacturer: 'Champion', model: '80 PRO-HD', specSheetUrl: 'https://www.championindustries.com/80-PRO-Heavy-Duty-Prewash-Rack-Conveyor' },
  'Sanitation cart, chemical dispensing': { widthIn: 48.25, depthIn: 22, basis: 'sourced', zone: 'Warewash', source: 'Rubbermaid FG9T7200 high-capacity janitor cart, 48-1/4 x 22 in', manufacturer: 'Rubbermaid Commercial', model: 'FG9T7200', specSheetUrl: 'https://www.katom.com/007-FG9T7200BLA.html' },
  'Wire shelving and dunnage racks': { widthIn: null, depthIn: null, basis: 'estimated', zone: null, source: 'Lives in dry storage; that room is sized by program allowance' },
  'Sheet pans, hotel pans, cambros, smallwares': { widthIn: null, depthIn: null, basis: 'estimated', zone: null, source: 'Stored on the shelving above; no incremental floor' },
  'Scales, receiving and portion': { widthIn: null, depthIn: null, basis: 'estimated', zone: null, source: 'Bench and dock-mounted; no incremental floor' },
  'Thermometers, dataloggers, calibration kit': { widthIn: null, depthIn: null, basis: 'estimated', zone: null, source: 'No floor' },
  'Insulated transport carts': { widthIn: 18, depthIn: 25, basis: 'sourced', zone: 'Dispatch', source: 'Cambro UPC400 Ultra Pan Carrier, front loading, 18 x 25 in', manufacturer: 'Cambro', model: 'UPC400', specSheetUrl: 'https://www.webstaurantstore.com/cambro-upc400110-ultra-pan-carrier-black-front-loading-insulated-food-pan-carrier/214UPC400BK.html' },
  'Refrigerated delivery van': { widthIn: null, depthIn: null, basis: 'estimated', zone: null, source: 'Vehicle. Dock and parking, not enclosed building area' },
  'Network, temperature monitoring, cameras': { widthIn: null, depthIn: null, basis: 'estimated', zone: null, source: 'IT closet; inside the support program' },
  'Terminals, tablets, label printers': { widthIn: null, depthIn: null, basis: 'estimated', zone: null, source: 'Bench-mounted; no incremental floor' },
  'Hot holding cabinets, insulated': { widthIn: 28.75, depthIn: 32.75, basis: 'sourced', zone: 'Dispatch', source: 'Cres Cor H-137-UA-12D insulated holding cabinet, 28-3/4 x 32-3/4 in', manufacturer: 'Cres Cor', model: 'H-137-UA-12D', specSheetUrl: 'https://www.webstaurantstore.com/cres-cor-h-137-ua-12d-insulated-holding-cabinet-solid-dutch-doors-120v/265H137UA12D.html' },
  'Catering transport, chafing, beverage': { widthIn: null, depthIn: null, basis: 'estimated', zone: null, source: 'Lot; stored on shelving in wares storage' },
  'Refrigerated delivery van, second': { widthIn: null, depthIn: null, basis: 'estimated', zone: null, source: 'Vehicle. Dock and parking, not enclosed building area' },
  'Buffet and action station equipment': { widthIn: null, depthIn: null, basis: 'estimated', zone: null, source: 'Lot; stored on shelving in wares storage' },
  'Fry station, double vat': { widthIn: 31.25, depthIn: 34.375, basis: 'sourced', zone: 'A la carte', underHood: true, source: 'Pitco SG14-2FD Solstice two-vat floor fryer with filter drawer, 31-1/4 x 34-3/8 in', manufacturer: 'Pitco', model: 'SG14-2FD', specSheetUrl: 'https://www.pitco.com/wp-content/uploads/2022/02/L10-294-R2-SG14-with-Options.pdf' },
  'Griddle / plancha, 36 in': { widthIn: 36, depthIn: 31.5, basis: 'sourced', zone: 'A la carte', underHood: true, source: 'Vulcan MSA36 heavy-duty countertop griddle on an equipment stand, 36 x 31-1/2 in', manufacturer: 'Vulcan', model: 'MSA36', specSheetUrl: 'https://www.vulcanequipment.com/griddles/36-msa-series-flat-top-gas-griddle' },
  'Charbroiler and salamander': { widthIn: 36, depthIn: 27.25, basis: 'sourced', zone: 'A la carte', underHood: true, source: 'Vulcan VCCB36 radiant charbroiler on a stand, 36 x 27-1/4 in; salamander wall-mounted above', manufacturer: 'Vulcan', model: 'VCCB36', specSheetUrl: 'https://www.katom.com/207-VCCB36NG.html' },
  'A la carte line refrigeration units': { widthIn: 48.375, depthIn: 31.125, basis: 'sourced', zone: 'A la carte', source: 'True TWT-48-HC two-section worktop refrigerator, 48-3/8 x 31-1/8 in', manufacturer: 'True', model: 'TWT-48-HC', specSheetUrl: 'https://www.truemfg.com/wp-content/uploads/true-media/spec-sheets/TWT-48-HC.pdf' },
  'Heated expo and pickup shelving': { widthIn: 60, depthIn: 19.5, basis: 'sourced', zone: 'A la carte', source: 'Hatco GRS-60-I Glo-Ray free-standing heated shelf, 60 x 19-1/2 in', manufacturer: 'Hatco', model: 'GRS-60-I', specSheetUrl: 'https://www.hatcocorp.com/cms/SPECSHEETS/000000004171201-00014-20161121.PDF' },
  'Hood extension for the line': { widthIn: null, depthIn: null, basis: 'estimated', zone: null, source: 'Overhead; no floor. Drives hood linear feet through the units under it' },
  'POS and delivery integration hardware': { widthIn: null, depthIn: null, basis: 'estimated', zone: null, source: 'Bench and wall-mounted; no incremental floor' },
};

/** A delivery van on the list: counts a dock lane, occupies no enclosed floor. */
export const isDeliveryVan = (item: string): boolean => /delivery van/i.test(item);

// ── The Facility Design and Build plan ──────────────────────────────────────

/**
 * The master document of the approved configuration and the potential design
 * and build-out options (Robert, 2026-09-17). A potential room is documented
 * here with its area, cost, impact and risk. It is not an equipment row, not a
 * forecast, and never enters the Plan or Actual ledger; the Facility page
 * computes what each would add to the shell from `geometry` and shows it
 * beside the baseline.
 */
export interface DesignRoom {
  id: string;
  name: string;
  status: 'approved' | 'potential';
  /** Whether and when, as a plain status statement. No quotations, no attributions: the decision record is the build plan's. */
  statusNote: string;
  buildPhase: string;
  geometry:
    | { kind: 'walk_in'; widthFt: number; depthFt: number; note: string }
    | { kind: 'zone_delta'; sqFt: number; note: string };
  cost: { value: number | null; status: StatusTag; note: string };
  authority: string;
  impact: string[];
  risk: string[];
  /** The hold life this room delivers, days, where it changes one. */
  holdLifeDays?: number;
}

// Decision record (build plan §2 decisions 8 and 12, 2026-09-17): the 34°F room was referred to as a
// "freezer room" and is read here as the build plan's Option A; both rooms are undecided. None of that
// commentary is rendered — the UI shows status statements only.
export const DESIGN_ROOMS: readonly DesignRoom[] = [
  {
    id: 'hold-room-34f',
    name: '34°F finished-goods hold room',
    status: 'potential',
    statusNote: 'Potential. Not planned for Phase 1; whether it is built at all is open. Delivers the 30-day path, Food Code 3-502.12(D)(a). A room held frozen is path (d), no time limit while frozen, and is a different room.',
    buildPhase: 'Not Phase 1',
    geometry: { kind: 'walk_in', widthFt: 8, depthFt: 10, note: 'An 8 × 10 walk-in grossed by the same method as the other boxes: 2 in panel clearance and a 6 ft apron on the door wall. Sized against the 5-day cover target; at 0.5537 lb chilled per portion and 1,500 meals a day, 5 days of cover is 4,153 lb and about 39 sq ft of interior floor, so the box covers it three times over and holds cover targets out past 15 days.' },
    cost: { value: null, status: 'PLACEHOLDER', note: 'No quote. The equipment library carries the 8 × 10 walk-in freezer at $34,000, itself a placeholder, as the nearest comparable box. The 34°F refrigeration duty and the second-stage chill load from 41°F to 34°F within 48 hours are not in that figure.' },
    authority: 'Food Code 2017 3-502.12(D)(a), as adopted by 25 TAC §228.1: cooled to 34°F within 48 hours of reaching 41°F and held there; consumed or discarded within 30 days of packaging. Continuous electronic time and temperature monitoring, examined twice daily; records kept 6 months.',
    impact: [
      'Hold life 7 days → 30 days from packaging. Days of cover is what is actually kept; the room changes the expiry limit, not the stock.',
      'Adds an 8 × 10 box to the cold-storage zone gross; the production floor and the building gross recompute from it below.',
      'Refrigeration duty: a second-stage chill load from 41°F to 34°F within 48 hours, on top of the box\'s hold load.',
      'Monitoring: continuous electronic recording with a visible readout at the unit, on the equipment schedule for plan review.',
    ],
    risk: [
      'The days-of-cover target under a 30-day hold is not decided; a 30-day hold exists to run larger, less frequent batches, which raises cover and re-sizes the room.',
      'Austin Public Health guidance reads "all units must hold foods at 41°F or below"; a 34°F room is stricter, and the HACCP plan that relies on it goes to APH before implementation.',
      'The rack density behind the interior-floor figure (28 lb per cubic foot, 7 ft usable height, 55% of floor) is a placeholder; no published figure for bagged cook-chill product was found.',
    ],
    holdLifeDays: 30,
  },
  {
    id: 'packaging-room',
    name: 'Conditioned packaging room, ≤50°F',
    status: 'potential',
    statusNote: 'Potential. Undecided. The design intent is a conditioned room with its own envelope; whether the budget and the appetite exist for it is open.',
    buildPhase: 'Undecided',
    geometry: { kind: 'zone_delta', sqFt: 77.5, note: 'The packaging zone gross (250.5 sq ft ambient) plus 21.5 sq ft for a 4 in insulated-panel envelope plus a 56 sq ft gowning vestibule (7 × 8 ft: bench barrier, footwear change, hand sink, sanitiser) = 328 sq ft, a delta of 77.5 over the ambient zone. The vestibule is a placeholder: no published standard gives a changing-room area per person or a step-over barrier dimension.' },
    cost: { value: null, status: 'PLACEHOLDER', note: 'No quote and no comparable line on the leasehold schedule. Insulated metal panel walls and ceiling inside the shell, filtered positive-pressure air at 10 air changes an hour minimum, humidity held 40–60%. The air handling has no home in the square footage: no published foodservice allowance covers mechanical space.' },
    authority: 'No US code sets a room temperature for a chilled packaging room: not the Food Code, not 9 CFR 416.2, not FSIS guidance. ECFF Recommendations §2.2.2 puts production areas at ≤12°C (53.6°F); ≤50°F is the design target, more conservative than the only published benchmark. A HACCP control on the 3-501.14 cooling clock and post-lethality exposure, not a code-mandated space.',
    impact: [
      'Changes no shelf life. It buys the high-risk zoning posture: floor-to-ceiling segregation, filtered positive-pressure air, drains falling away from the room, captive footwear and a gowning sequence at entry (BRCGS).',
      'Adds 77.5 sq ft to the packaging zone gross; the production floor and the building gross recompute from it below.',
      'Phase 1 packs after cooking, so product is exposed after the kill step and the room is high risk. The Phase 2 pump fill station bags direct from the kettle, sealed before chilling, and on that flow the room is not a high-risk zone.',
    ],
    risk: [
      'Whether Muse Kitchen is audited against BRCGS, SQF or FSSC 22000 decides whether the segregation is a requirement or prudent practice. Unanswered; it changes the envelope cost more than any other item.',
      'If the Phase 2 pump fill station arrives early the room\'s justification weakens considerably; the room would be built for a Phase 1 flow that Phase 2 equipment removes.',
      'No published pascal figure for the positive-pressure differential and no published sizing rule for a chilled packaging room; the area is derived from the equipment, not from a benchmark.',
      'BRCGS Appendix 2 zone definitions are paywalled; the high-risk classification is built from secondary sources and needs one copy of the Standard before it is quoted to an auditor.',
    ],
  },
];

/** The approved Phase 1 configuration: what the baseline figures describe. */
export const APPROVED_CONFIGURATION: readonly { item: string; value: string; why: string }[] = [
  { item: 'Equipment', value: 'The Phase 1 list as it stands, both blast chillers included', why: 'Current capability. Both cabinets on Phase 1 is a concurrency decision, not a capacity one: two 200 lb streams, never one 400 lb batch.' },
  { item: 'Packaging', value: 'Ambient, on the open production floor', why: 'The conditioned room is a potential room, not a decision.' },
  { item: 'Cold storage', value: 'The four walk-ins on the library, none at 34°F', why: 'No 34°F room on the list.' },
  { item: 'Hold life', value: '7 days', why: 'Food Code 3-502.12(D)(c), as adopted by 25 TAC §228.1: held at 41°F or less, consumed or discarded within 7 days. The current operational status, not a defect.' },
  { item: 'Hood', value: 'Type I canopy over the hot line, 6 in overhang on open sides', why: 'IMC §507.4.1. The hood and fire suppression and the HVAC and makeup air leasehold lines were authored before any run was laid out and are flagged for re-quote against the derived length.' },
];

/** The decisions the block plan needs (§10.6), carried on the plan so none is lost. */
export const OPEN_DECISIONS: readonly { question: string; consequence: string }[] = [
  { question: 'Is Muse Kitchen audited against BRCGS, SQF or FSSC 22000?', consequence: 'If yes, the packaging room\'s floor-to-ceiling segregation, filtered positive-pressure air and gowning sequence are requirements, not choices. This single answer changes the envelope cost more than any other item.' },
  { question: 'Raw protein prep: a separate area or time separation?', consequence: 'Food Code 3-302.11 permits either. A separate area costs floor; a time-separation SOP costs schedule and depends on the scheduler placing it. The prep zone is modelled as one zone.' },
  { question: 'The 34°F holding room.', consequence: 'Without it the shelf life is 7 days, not 30. Documented above as a potential room.' },
  { question: 'Does the Phase 2 pump fill station change the packaging room\'s classification?', consequence: 'Sealed before chilling removes the post-lethality exposure; decide the station\'s timing before committing capital to the room.' },
  { question: 'Does the ghost kitchen share the commissary shell?', consequence: 'Phase 3 adds a la carte floor and hood for fry, griddle and charbroiler, a different hood, suppression zone and rhythm. The difference between the Phase 1+2 shell and the Phase 1+2+3 shell is the number to weigh against a second lease.' },
];

/** What would move the number (§13): named so none reads as a surprise later. */
export const WHAT_MOVES_THE_NUMBER: readonly string[] = [
  'A foodservice designer\'s block plan: the single largest source of movement, in the direction of more space. Equipment is 42% of the derived production floor against the one published rule of thumb of 30%; at 30% the shell would be nearer 8,700 sq ft.',
  'Mechanical and electrical room area: no published foodservice allowance exists; excluded entirely and not zero. It has to come from an MEP engineer.',
  'Actual selected models: twenty rows are SOURCED against a representative model, not a purchase order.',
  'The walk-in manufacturer\'s sizing convention: nominal, exterior and interior clear differ by up to 8 in per dimension, and the two Phase 1 boxes alone are 31% of the Phase 1 production floor.',
  'The Peak Single Meals figure and whether the day dispatches as one wave: dry food storage is the one line that moves with it.',
  'The Phase 2 and Phase 3 volumes, both 0 meals a day in the plan data; real corporate and ghost-kitchen volumes grow storage, warewash and the dock.',
  'Austin Public Health plan review and the adopted IBC and IMC editions; the Austin Building Criteria Manual Section 2 (Food Establishments) and City Code Chapter 10-3 Article 4 (Central Preparation Facilities), whose text could not be retrieved and is the highest-priority gap before plan review.',
];
