/**
 * MicroFarm — capital expenditure schedule: the seed of the equipment
 * library (`farm.equipment`, Roadmap N1), which is the source from first read.
 *
 * Every unit cost is a PLACEHOLDER pending quotes; the purpose is to establish
 * the SHAPE of the capital requirement. Extended cost is COMPUTED in the engine
 * (qty × unit cost, with a 50% discount applied to lines marked 'Used'), never
 * typed here.
 */

import { FOOTPRINT_SEED, type FacilityZone, type FootprintBasis } from './facility-design';

export const EQUIPMENT_CATEGORIES = [
  'Grow room',
  'Hot production',
  'Prep',
  'Grow critical path',
  'Packaging',
  'Cold storage',
  'Warewash & sanitation',
  'Storage, smallwares, instruments',
  'Transport',
  'Technology',
  'Phase 2 — restaurants',
  'Phase 3 — retail and wholesale',
] as const;

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

/**
 * Real-world status (Roadmap N1): in service, planned for its build-out phase,
 * considered and not selected, or on the list and not needed. Capital counts
 * in service and planned.
 */
export type EquipmentStatus = 'in_service' | 'planned' | 'no' | 'unset';

/** A line of the capex schedule as it was drawn up, before the build-out split. */
interface ScheduleLine {
  item: string;
  category: EquipmentCategory;
  /** Build-out phase. */
  phase: 1 | 2 | 3;
  newUsed: 'New' | 'Used';
  qty: number;
  unitCostNew: number;
  critical: boolean;
  note?: string;
}

/** How a grow unit's sowing capacity is known. Estimated until someone states or observes it. */
export type SowingCapacityBasis = 'estimated' | 'stated' | 'observed';

export const SOWING_CAPACITY_BASIS_LABELS: Record<SowingCapacityBasis, string> = { estimated: 'Estimated', stated: 'Stated', observed: 'Observed' };

/** A row of the equipment library (`farm.equipment`). */
export interface EquipmentLine extends ScheduleLine {
  /** The database row id; absent on the code seed. */
  id?: string;
  /** Stable reference: Sustainability attributes, spec-sheet links and entity links key on it. */
  key: string;
  status: EquipmentStatus;
  /** Null = TBD. */
  inServiceDate: string | null;
  /**
   * A grow unit (outline §4): growing shelves on one unit, the shelf width the tray formats are
   * counted against, and the fixture key (`inputs-catalog.ts`) on its shelves. Null on equipment
   * no tray sits on. Capacity in trays is derived from these (`_engine/grow-capacity.ts`).
   */
  shelves?: number | null;
  shelfWidthIn?: number | null;
  fixtureKey?: string | null;
  /**
   * Pounds of product ONE unit takes in one run — the sowing a grow unit bounds
   *.
   * Null on equipment a sowing does not pass through. An open field on Equipment.
   */
  sowingCapacityLb?: number | null;
  sowingCapacityBasis?: SowingCapacityBasis;
  /**
   * The unit as a scheduling resource (scheduler build plan §0, decision 1):
   * estimated open fields on Equipment, like the sowing capacity. Null on
   * equipment no sowing runs on.
   */
  /** Sowings one unit holds at once. */
  concurrentSowings?: number | null;
  /** Minutes the unit is unavailable between sowings beyond the study's own lines. */
  changeoverMinutes?: number | null;
  /** Crew is needed for the whole run. */
  attendedRun?: boolean | null;
  /** The unit may run with the building empty. */
  mayRunUnattended?: boolean | null;
  resourceBasis?: SowingCapacityBasis;
  /**
   * The unit's plan footprint (Roadmap Q1): width along the front and depth,
   * inches; null on a row that carries no incremental floor (bench-mounted,
   * stored on shelving, overhead, a vehicle). Published installation
   * clearances where a manufacturer states them, else null and the zone's
   * circulation factor applies. Open fields on Facility.
   */
  footprintWidthIn?: number | null;
  footprintDepthIn?: number | null;
  clearanceFrontIn?: number | null;
  clearanceRearIn?: number | null;
  clearanceSideIn?: number | null;
  /** Sourced off a named model's spec sheet, estimated (category-typical), stated or observed. */
  footprintBasis?: FootprintBasis;
  /** The zone the unit works in; null where it has no floor. */
  zone?: FacilityZone | null;
  /** Sits under a Type I hood, so its width counts toward the hood run. */
  underHood?: boolean;
  /** Where the dimensions came from, or why the row carries no floor. */
  footprintSource?: string | null;
  /** The representative model the footprint is read from, and its spec sheet. Shown on Facility, not on Equipment. */
  manufacturer?: string | null;
  model?: string | null;
  specSheetUrl?: string | null;
}

export interface ResourceSeed {
  concurrentSowings: number | null;
  changeoverMinutes: number | null;
  attendedRun: boolean;
  mayRunUnattended: boolean;
  note: string;
}

const TURNAROUND_NOTE = 'Cleaning between sowings is the line turnaround on the time study, so no changeover beyond it.';

/**
 * ESTIMATED resource attributes for the units the routing runs on — open fields
 * on Equipment, labelled Estimated until stated or observed. No overnight activity but soaking, and a blackout never runs into an
 * empty building (§0 decision 2), so no production unit may run unattended.
 */
export const RESOURCE_SEED: Record<string, ResourceSeed> = {
  'Blackout rack, 200 lb capacity': { concurrentSowings: 1, changeoverMinutes: 0, attendedRun: false, mayRunUnattended: false, note: 'One sowing a rack load. The blackout stage needs no one at the rack; load and unload do. No changeover between sowings: the rack is sanitized at the end of a shift or day, immediately after a spill, and between foods when allergens were uncovered; defrosting is periodic maintenance.' },
  'Tilting braising pan / shelf, 40 gal': { concurrentSowings: 1, changeoverMinutes: 0, attendedRun: true, mayRunUnattended: false, note: `A sauté is worked for its whole run. ${TURNAROUND_NOTE}` },
  'Steam-jacketed tilting sprouting rack, 100 gal': { concurrentSowings: 1, changeoverMinutes: 0, attendedRun: false, mayRunUnattended: false, note: `A simmer is tended, not stood at. ${TURNAROUND_NOTE}` },
  'Steam-jacketed tilting sprouting rack, 60 gal': { concurrentSowings: 1, changeoverMinutes: 0, attendedRun: false, mayRunUnattended: false, note: `A simmer is tended, not stood at. ${TURNAROUND_NOTE}` },
  'Jar stand oven, full size 20-pan': { concurrentSowings: 1, changeoverMinutes: 0, attendedRun: false, mayRunUnattended: false, note: `A roast or steam is loaded, checked and pulled. ${TURNAROUND_NOTE}` },
  'Convection oven, double stack': { concurrentSowings: 1, changeoverMinutes: 0, attendedRun: false, mayRunUnattended: false, note: `Loaded, checked and pulled. ${TURNAROUND_NOTE}` },
  'Vertical cutter mixer, 45 qt': { concurrentSowings: 1, changeoverMinutes: 0, attendedRun: true, mayRunUnattended: false, note: `Worked while it runs. ${TURNAROUND_NOTE}` },
  'Tray sealer, semi-automatic': { concurrentSowings: 1, changeoverMinutes: 0, attendedRun: true, mayRunUnattended: false, note: 'Semi-automatic: fed by hand while it runs.' },
  'Walk-in cooler, 12x20, with refrigeration': { concurrentSowings: null, changeoverMinutes: null, attendedRun: false, mayRunUnattended: true, note: 'Cold storage runs with the building empty on its datalogger (control-point-3). Not bounded by sowings.' },
  'Walk-in cooler, 10x12, with refrigeration': { concurrentSowings: null, changeoverMinutes: null, attendedRun: false, mayRunUnattended: true, note: 'Cold storage runs with the building empty on its datalogger (control-point-3). Not bounded by sowings.' },
};

/**
 * ESTIMATED sowing capacities for the grow units a sowing passes through — best
 * available working figures, open fields on Equipment, labelled Estimated until
 * stated or observed. Nothing here is a rating sheet.
 */
export const SOWING_CAPACITY_SEED: Record<string, { lb: number; note: string }> = {
  'Blackout rack, 200 lb capacity': { lb: 200, note: 'The rated load in the item name.' },
  'Tilting braising pan / shelf, 40 gal': { lb: 200, note: '40 gal at about 8 lb a gallon, worked at roughly 60% fill for a sauté.' },
  'Steam-jacketed tilting sprouting rack, 100 gal': { lb: 600, note: '100 gal at about 8 lb a gallon, filled to roughly 75%.' },
  'Steam-jacketed tilting sprouting rack, 60 gal': { lb: 360, note: '60 gal at about 8 lb a gallon, filled to roughly 75%.' },
  'Jar stand oven, full size 20-pan': { lb: 240, note: '20 full hotel pans at about 12 lb of product each.' },
  'Convection oven, double stack': { lb: 120, note: '10 sheet pans at about 12 lb of product each.' },
};

/**
 * The grow room's Phase 1 list: Vallecito's starter rack as bought (DATED, Break-even sheet
 * 2023): a 6-tier 24x48 shelving unit with five lit growing tiers, five Mars Hydro VG80
 * fixtures, four clip fans and sixteen 1020 three-piece flat sets, $1,058 the rack. The sixth
 * tier is the top of the unit and holds no tray. A jar stand for sprouts is not on the list;
 * jars sit on a rack shelf at the format's placeholder count.
 */
const GROW_ROOM_SEED: readonly (ScheduleLine & { shelves?: number; shelfWidthIn?: number; fixtureKey?: string })[] = [
  { item: 'Grow rack, 6-tier 24x48 wire shelving', category: 'Grow room', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 200, critical: true, note: 'Vallecito 2023, $200. Five lit growing tiers; four 1020 flats a shelf.', shelves: 5, shelfWidthIn: 48, fixtureKey: 'mars-hydro-vg80' },
  { item: 'LED grow light, Mars Hydro VG80', category: 'Grow room', phase: 1, newUsed: 'New', qty: 5, unitCostNew: 90, critical: true, note: 'Vallecito 2023, $450 for five; one a tier.' },
  { item: 'Clip fan, 6 in', category: 'Grow room', phase: 1, newUsed: 'New', qty: 4, unitCostNew: 50, critical: false, note: 'Vallecito 2023, $200 for four.' },
  { item: '1020 three-piece flat set', category: 'Grow room', phase: 1, newUsed: 'New', qty: 16, unitCostNew: 13, critical: false, note: 'Vallecito 2023, $208 for sixteen: base, mesh and blackout top.' },
];

/** The capex schedule as drawn up — what the library seeds from. Nothing reads it directly. */
const schedule: ScheduleLine[] = [
  // Hot production
  { item: 'Steam-jacketed tilting sprouting rack, 100 gal', category: 'Hot production', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 46000, critical: true, note: 'Bean and sauce production, the grow workhorse' },
  { item: 'Steam-jacketed tilting sprouting rack, 60 gal', category: 'Hot production', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 34000, critical: true, note: 'Second sowing stream, avoids single point of failure' },
  { item: 'Tilting braising pan / shelf, 40 gal', category: 'Hot production', phase: 1, newUsed: 'New', qty: 2, unitCostNew: 27500, critical: true, note: 'Protein browning' },
  { item: 'Jar stand oven, full size 20-pan', category: 'Hot production', phase: 1, newUsed: 'New', qty: 2, unitCostNew: 39000, critical: true, note: 'Rice, roasting, reheat validation' },
  { item: 'Convection oven, double stack', category: 'Hot production', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 13500, critical: false, note: 'Overflow and bakery' },
  // Prep
  { item: 'Vertical cutter mixer, 45 qt', category: 'Prep', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 23500, critical: false, note: 'Highest-labor line is veg prep; this is the offset' },
  { item: 'Buffalo chopper / food processor', category: 'Prep', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 6800, critical: false },
  { item: 'Planetary mixer, 80 qt', category: 'Prep', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 19000, critical: false },
  { item: 'Commercial slicer', category: 'Prep', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 4200, critical: false },
  { item: 'Stainless prep tables, 8 ft', category: 'Prep', phase: 1, newUsed: 'Used', qty: 6, unitCostNew: 1150, critical: false, note: 'Stainless that sits still. Buy used.' },
  { item: 'Prep sinks, 3-comp and 2-comp', category: 'Prep', phase: 1, newUsed: 'Used', qty: 2, unitCostNew: 2400, critical: false, note: 'Buy used' },
  // Grow critical path
  { item: 'Blackout rack, 200 lb capacity', category: 'Grow critical path', phase: 1, newUsed: 'New', qty: 2, unitCostNew: 36000, critical: true, note: 'control-point-2. Never buy this used.' },
  { item: 'Tumble blackout rack / ice water bath system', category: 'Grow critical path', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 62000, critical: true, note: 'Enables the 30-day slush hold' },
  { item: 'Grow pump fill station', category: 'Grow critical path', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 28000, critical: true, note: 'Bags direct from sprouting rack' },
  { item: 'Casing handling, blackout carts', category: 'Grow critical path', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 9500, critical: true },
  // Packaging
  { item: 'Tray sealer, semi-automatic', category: 'Packaging', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 36000, critical: true, note: 'Seal integrity is a produce safety control' },
  { item: 'Date and lot coder, inkjet', category: 'Packaging', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 9800, critical: true, note: 'Traceability and recall' },
  { item: 'Vacuum packaging machine, chamber', category: 'Packaging', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 12500, critical: true },
  { item: 'Label printer / applicator', category: 'Packaging', phase: 1, newUsed: 'New', qty: 2, unitCostNew: 3400, critical: false, note: 'Allergen labelling' },
  { item: 'Packaging tables, stainless', category: 'Packaging', phase: 1, newUsed: 'Used', qty: 3, unitCostNew: 1150, critical: false, note: 'Buy used' },
  // Cold storage
  { item: 'Walk-in cooler, 12x20, with refrigeration', category: 'Cold storage', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 52000, critical: true, note: 'Primary. Cold storage is the binding constraint on buying at volume.' },
  { item: 'Walk-in cooler, 10x12, with refrigeration', category: 'Cold storage', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 38000, critical: true, note: 'Produce separated from protein and finished goods' },
  { item: 'Walk-in freezer, 10x12, with refrigeration', category: 'Cold storage', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 41000, critical: true, note: 'Bulk protein' },
  { item: 'Walk-in freezer, 8x10, with refrigeration', category: 'Cold storage', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 34000, critical: true, note: 'Finished goods and blast holding' },
  { item: 'Reach-in refrigerator, 2-door', category: 'Cold storage', phase: 1, newUsed: 'Used', qty: 4, unitCostNew: 6800, critical: false, note: 'Buy used' },
  { item: 'Mobile refrigerated holding rack', category: 'Cold storage', phase: 1, newUsed: 'New', qty: 6, unitCostNew: 8900, critical: true, note: 'control-point-4 transport temperature' },
  // Warewash & sanitation
  { item: 'Rack conveyor dishwasher + booster', category: 'Warewash & sanitation', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 48000, critical: true, note: 'Sanitiser temperature is a control point' },
  { item: 'Pot sink, 3-comp with drainboards', category: 'Warewash & sanitation', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 9500, critical: false, note: 'Two drainboards; scrap goes by hand to the refrigerated waste room. No disposer: Austin City Code §25-12-153 (UPC §616.0).' },
  { item: 'Hand sinks and mop sink', category: 'Warewash & sanitation', phase: 1, newUsed: 'Used', qty: 6, unitCostNew: 700, critical: false, note: 'Buy used' },
  { item: 'Sanitation cart, chemical dispensing', category: 'Warewash & sanitation', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 5200, critical: false },
  // Storage, smallwares, instruments
  { item: 'Wire shelving and dunnage racks', category: 'Storage, smallwares, instruments', phase: 1, newUsed: 'Used', qty: 1, unitCostNew: 18000, critical: false, note: 'Lot. Buy used.' },
  { item: 'Sheet pans, hotel pans, cambros, smallwares', category: 'Storage, smallwares, instruments', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 32000, critical: false, note: 'Lot' },
  { item: 'Scales, receiving and unit', category: 'Storage, smallwares, instruments', phase: 1, newUsed: 'New', qty: 6, unitCostNew: 1500, critical: true, note: 'Unit control drives input cost' },
  { item: 'Thermometers, dataloggers, calibration kit', category: 'Storage, smallwares, instruments', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 8500, critical: true, note: 'Every CONTROL POINT depends on these reading true' },
  // Transport
  { item: 'Insulated transport carts', category: 'Transport', phase: 1, newUsed: 'New', qty: 12, unitCostNew: 2100, critical: true },
  { item: 'Refrigerated distribution van', category: 'Transport', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 72000, critical: true, note: 'Phase 1 prospect routes' },
  // Technology
  { item: 'Network, temperature monitoring, cameras', category: 'Technology', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 16000, critical: true, note: 'Continuous cold-chain logging' },
  { item: 'Terminals, tablets, label printers', category: 'Technology', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 14000, critical: false, note: 'Lot' },
  // Phase 2 — restaurants
  { item: 'Hot holding racks, insulated', category: 'Phase 2 — restaurants', phase: 2, newUsed: 'New', qty: 4, unitCostNew: 4200, critical: false, note: 'Corporate is hot distribution, not grow' },
  { item: 'Restaurant transport, chafing, beverage', category: 'Phase 2 — restaurants', phase: 2, newUsed: 'New', qty: 1, unitCostNew: 12000, critical: false, note: 'Lot' },
  { item: 'Refrigerated distribution van, second', category: 'Phase 2 — restaurants', phase: 2, newUsed: 'New', qty: 1, unitCostNew: 72000, critical: false, note: 'Second route' },
  { item: 'Buffet and action station equipment', category: 'Phase 2 — restaurants', phase: 2, newUsed: 'New', qty: 1, unitCostNew: 9500, critical: false, note: 'Lot' },
  // Phase 3 — retail and wholesale
  { item: 'Fry station, double vat', category: 'Phase 3 — retail and wholesale', phase: 3, newUsed: 'New', qty: 1, unitCostNew: 14000, critical: false, note: 'A la carte is a different discipline' },
  { item: 'Griddle / plancha, 36 in', category: 'Phase 3 — retail and wholesale', phase: 3, newUsed: 'New', qty: 1, unitCostNew: 8500, critical: false },
  { item: 'Charbroiler and salamander', category: 'Phase 3 — retail and wholesale', phase: 3, newUsed: 'New', qty: 1, unitCostNew: 6500, critical: false },
  { item: 'A la carte line refrigeration units', category: 'Phase 3 — retail and wholesale', phase: 3, newUsed: 'New', qty: 2, unitCostNew: 7800, critical: false },
  { item: 'Heated expo and pickup shelving', category: 'Phase 3 — retail and wholesale', phase: 3, newUsed: 'New', qty: 1, unitCostNew: 6200, critical: false },
  { item: 'Hood extension for the line', category: 'Phase 3 — retail and wholesale', phase: 3, newUsed: 'New', qty: 1, unitCostNew: 18000, critical: false, note: 'Equipment unit only' },
  { item: 'POS and distribution integration hardware', category: 'Phase 3 — retail and wholesale', phase: 3, newUsed: 'New', qty: 1, unitCostNew: 9000, critical: false, note: 'Lot' },
];

// ── The build-out split ─────────────────────────────────
// Phase 1 is one hot line and one cold chain with about a quarter of the
// starting wares; Phase 2 is the second hot line and cold-chain storage and the
// rest of the wares. Every row seeds Planned with its service date TBD.

/** Lines that move whole to Phase 2: the second sowing stream and the second cold-chain storage. */
const SECOND_LINE = new Set([
  'Steam-jacketed tilting sprouting rack, 60 gal',
  'Convection oven, double stack',
  'Planetary mixer, 80 qt',
  'Tumble blackout rack / ice water bath system',
  'Grow pump fill station',
  'Walk-in cooler, 10x12, with refrigeration',
  'Walk-in freezer, 8x10, with refrigeration',
]);

/** Units kept at Phase 1 on multi-unit lines; the rest are the second line's, at Phase 2. */
const PHASE_1_UNITS: Record<string, number> = {
  'Tilting braising pan / shelf, 40 gal': 1,
  'Jar stand oven, full size 20-pan': 1,
  'Stainless prep tables, 8 ft': 3,
  // Both blackout racks are Phase 1: a concurrency
  // decision, not a capacity one — two racks are two 200 lb streams.
  'Label printer / applicator': 1,
  'Reach-in refrigerator, 2-door': 2,
  'Mobile refrigerated holding rack': 3,
  'Scales, receiving and unit': 3,
  'Insulated transport carts': 6,
};

/** Wares bought as a lot: this share at Phase 1, the rest at Phase 2. */
const WARES_PHASE_1_SHARE = 0.25;
const WARES_LOTS = new Set(['Wire shelving and dunnage racks', 'Sheet pans, hotel pans, cambros, smallwares']);

function footprintSeedFor(item: string): Partial<EquipmentLine> {
  const f = FOOTPRINT_SEED[item];
  if (!f) return { footprintBasis: 'estimated', zone: null, underHood: false, footprintSource: null };
  return {
    footprintWidthIn: f.widthIn,
    footprintDepthIn: f.depthIn,
    clearanceFrontIn: f.clearanceFrontIn ?? null,
    clearanceRearIn: f.clearanceRearIn ?? null,
    clearanceSideIn: f.clearanceSideIn ?? null,
    footprintBasis: f.basis,
    zone: f.zone,
    underHood: f.underHood ?? false,
    footprintSource: f.source,
    manufacturer: f.manufacturer ?? null,
    model: f.model ?? null,
    specSheetUrl: f.specSheetUrl ?? null,
  };
}

function resourceSeedFor(item: string): Partial<EquipmentLine> {
  const s = RESOURCE_SEED[item];
  if (!s) return {};
  return { concurrentSowings: s.concurrentSowings, changeoverMinutes: s.changeoverMinutes, attendedRun: s.attendedRun, mayRunUnattended: s.mayRunUnattended, resourceBasis: 'estimated' };
}

const planned = (l: ScheduleLine, over: Partial<EquipmentLine> = {}): EquipmentLine => ({
  ...l,
  key: l.item,
  status: 'planned',
  inServiceDate: null,
  ...(SOWING_CAPACITY_SEED[l.item] ? { sowingCapacityLb: SOWING_CAPACITY_SEED[l.item]!.lb, sowingCapacityBasis: 'estimated' as const } : {}),
  ...resourceSeedFor(l.item),
  ...footprintSeedFor(l.item),
  ...over,
});

/** The equipment library's seed: the grow room, then the schedule split into build-out phases. */
export const equipmentSeed: EquipmentLine[] = [
  ...GROW_ROOM_SEED.map(({ shelves, shelfWidthIn, fixtureKey, ...l }): EquipmentLine => planned(l, { shelves: shelves ?? null, shelfWidthIn: shelfWidthIn ?? null, fixtureKey: fixtureKey ?? null })),
  ...schedule.flatMap((l): EquipmentLine[] => {
  if (l.phase !== 1) return [planned(l)];
  if (SECOND_LINE.has(l.item)) return [planned(l, { phase: 2 })];
  const second = { key: `${l.item} (Phase 2)`, phase: 2 as const };
  const units = PHASE_1_UNITS[l.item];
  if (units !== undefined && units < l.qty) return [planned(l, { qty: units }), planned(l, { ...second, qty: l.qty - units })];
  if (WARES_LOTS.has(l.item)) {
    return [
      planned(l, { unitCostNew: l.unitCostNew * WARES_PHASE_1_SHARE }),
      planned(l, { ...second, unitCostNew: l.unitCostNew * (1 - WARES_PHASE_1_SHARE) }),
    ];
  }
  return [planned(l)];
  }),
];

/**
 * A leasehold-improvement line (Roadmap N1). `extended` is the figure of record
 * in dollars; dollars per square foot are DERIVED from it against the facility
 * size (`perSqFtOf`), so the two cannot disagree.
 *
 * Every rate in the seed is an unsourced working figure authored when the capex
 * tab was built on 2026-09-10. None is a quote.
 */
export interface LeaseholdLine {
  /** The database row id; absent on the code seed. */
  id?: string;
  /** Stable across a reseed; a saved forecast's overlay keys on it. */
  key: string;
  item: string;
  extended: number;
  /** False = on record, out of the rollup. */
  counted: boolean;
  note?: string;
}

/** Dollars per square foot for a line, against the facility size. */
export const perSqFtOf = (extended: number, sizeSqFt: number): number => (sizeSqFt > 0 ? extended / sizeSqFt : 0);

/**
 * The seed. Twelve lines, $787,000 over the 5,000 sq ft shell — every figure a
 * working number from the day the capex tab was built, not a quote.
 */
export const leaseholdSeed: LeaseholdLine[] = [
  { key: 'design-engineering-plan-review-permits', item: 'Design, engineering, plan review, permits', extended: 62000, counted: true, note: 'Austin Public Health plan review included' },
  { key: 'grease-interceptor-and-underground-plumbing', item: 'Grease interceptor and underground plumbing', extended: 88000, counted: true, note: 'Cannot be added later without breaking slab' },
  { key: 'floor-and-trench-drains', item: 'Floor and trench drains', extended: 46000, counted: true, note: 'Decided at slab' },
  { key: 'electrical-service-upgrade-and-distribution', item: 'Electrical service upgrade and distribution', extended: 105000, counted: true, note: 'Sprouting racks, combis, blackout racks and walk-ins all at once' },
  { key: 'hvac-and-makeup-air', item: 'HVAC and makeup air', extended: 78000, counted: true, note: 'Makeup air is a code requirement once the hood goes in' },
  { key: 'exhaust-hood-system-and-fire-suppression', item: 'Exhaust hood system and fire suppression', extended: 92000, counted: true },
  { key: 'flooring-urethane-or-quarry-tile', item: 'Flooring, urethane or quarry tile', extended: 85000, counted: true, note: 'Food production floor, not warehouse floor' },
  { key: 'walls-frp-ceilings', item: 'Walls, FRP, ceilings', extended: 52000, counted: true },
  { key: 'partitions-doors-office-build-out', item: 'Partitions, doors, office build-out', extended: 38000, counted: true },
  { key: 'plumbing-rough-and-fixtures', item: 'Plumbing rough and fixtures', extended: 44000, counted: true },
  { key: 'sprinkler-modification', item: 'Sprinkler modification', extended: 22000, counted: true },
  { key: 'general-conditions-and-contractor-fee', item: 'General conditions and contractor fee', extended: 75000, counted: true },
];

// The financing terms and the three monthly fixed costs that used to sit here
// are definitions now, not constants: `_data/finance.ts` carries their shapes
// and their seed, `farm.loans` and `farm.fixed_cost_lines` hold the rows, and
// the used-equipment purchase factor moved to `equipmentPurchase` (Roadmap N1).
