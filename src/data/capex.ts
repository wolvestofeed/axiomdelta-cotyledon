/**
 * MicroFarm — capital expenditure schedule: the seed of the equipment
 * library (`farm.equipment`, Roadmap N1), which is the source from first read.
 *
 * Two settings. HOME is the home grow room: Vallecito's starter rack as bought (DATED) and the
 * home grow list Rob named, each at quantity 1 with no price until he states them. COMMERCIAL is
 * a rented facility's equipment, seeded Unset: it counts toward nothing until a forecast selects
 * it, so a home forecast carries none of it. Commercial unit costs are unsourced working figures,
 * not quotes. Extended cost is COMPUTED in the engine (qty × unit cost, with a 50% discount
 * applied to lines marked 'Used'), never typed here.
 */

import { FOOTPRINT_SEED, type FacilityZone, type FootprintBasis } from '@/data/facility-design';

export const EQUIPMENT_CATEGORIES = [
  'Grow room',
  'Trays and jars',
  'Tools and supplies',
  'Monitoring and climate',
  'Prep',
  'Packaging',
  'Cold storage',
  'Warewash & sanitation',
  'Storage, smallwares, instruments',
  'Transport',
  'Technology',
] as const;

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

/** Where a row belongs: the home grow room, or a rented commercial facility. */
export type EquipmentSetting = 'home' | 'commercial';
export const EQUIPMENT_SETTINGS: readonly EquipmentSetting[] = ['home', 'commercial'];
export const EQUIPMENT_SETTING_LABELS: Record<EquipmentSetting, string> = { home: 'Home', commercial: 'Commercial' };

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
  setting: EquipmentSetting;
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
  /** A dark rack: it holds tray sowings only through germination and blackout (0020). */
  darkStagesOnly?: boolean;
  /** Each shelf's lights, top to bottom, where they differ from `fixtureKey` at its count a shelf (0021). */
  shelfLights?: { fixtureKey: string | null; count: number }[] | null;
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


/**
 * ESTIMATED resource attributes for the units the routing runs on — open fields
 * on Equipment, labelled Estimated until stated or observed. No overnight activity but soaking, and a blackout never runs into an
 * empty building (§0 decision 2), so no production unit may run unattended.
 */
export const RESOURCE_SEED: Record<string, ResourceSeed> = {
  'Tray sealer, semi-automatic': { concurrentSowings: 1, changeoverMinutes: 0, attendedRun: true, mayRunUnattended: false, note: 'Semi-automatic: fed by hand while it runs.' },
  'Walk-in cooler, 12x20, with refrigeration': { concurrentSowings: null, changeoverMinutes: null, attendedRun: false, mayRunUnattended: true, note: 'Cold storage runs with the building empty on its datalogger. Not bounded by sowings.' },
  'Walk-in cooler, 10x12, with refrigeration': { concurrentSowings: null, changeoverMinutes: null, attendedRun: false, mayRunUnattended: true, note: 'Cold storage runs with the building empty on its datalogger. Not bounded by sowings.' },
};

/**
 * The grow room's Phase 1 list. Vallecito's starter rack as bought (DATED, Break-even sheet 2023):
 * a 6-tier 24x48 shelving unit, five Mars Hydro VG80 fixtures, four clip fans and sixteen 1020
 * three-piece flat sets, $1,058. Rob's grow room for 20 trays a week: two lit racks, each five
 * growing shelves 24x48 and six feet tall with two Mars VG80 on each shelf, and two dark racks of
 * the same shelving. A week's trays germinate stacked on a dark rack, spread over it in blackout,
 * then fill a lit rack, so all four hold trays at once. A jar stand for sprouts is not on the list;
 * jars sit on a rack shelf at the format's placeholder count.
 */
const GROW_ROOM_SEED: readonly (ScheduleLine & { shelves?: number; shelfWidthIn?: number; fixtureKey?: string; darkStagesOnly?: boolean })[] = [
  { item: 'Grow rack, 6-tier 24x48 wire shelving', category: 'Grow room', setting: 'home', phase: 1, newUsed: 'New', qty: 2, unitCostNew: 200, critical: true, note: 'Vallecito 2023, $200 each; the second is to buy. Five growing shelves 24x48, six feet tall; four 1020 flats a shelf under two Mars VG80. Each shelf\'s lights can be set on Grow Units. Two lit racks hold a week of 20 trays under light and the overlap into the next.', shelves: 5, shelfWidthIn: 48, fixtureKey: 'mars-hydro-vg80' },
  { item: 'Dark rack, 6-tier 24x48 wire shelving', category: 'Grow room', setting: 'home', phase: 1, newUsed: 'New', qty: 2, unitCostNew: 200, critical: true, note: 'The germination and blackout racks, curtained: five tiers of four 1020 flats each. A week of 20 trays germinates stacked five high on about one shelf, then spreads over a whole rack in blackout. Priced at the lit rack\'s Vallecito $200 until a receipt.', shelves: 5, shelfWidthIn: 48, darkStagesOnly: true },
  { item: 'LED grow light, Mars Hydro VG80', category: 'Grow room', setting: 'home', phase: 1, newUsed: 'New', qty: 20, unitCostNew: 90, critical: true, note: 'Vallecito 2023, $450 for five. Two on each of the five shelves of the two lit racks.' },
  { item: 'Clip fan, 6 in', category: 'Grow room', setting: 'home', phase: 1, newUsed: 'New', qty: 4, unitCostNew: 50, critical: false, note: 'Vallecito 2023, $200 for four.' },
  { item: '1020 three-piece flat set', category: 'Grow room', setting: 'home', phase: 1, newUsed: 'New', qty: 16, unitCostNew: 13, critical: false, note: 'Vallecito 2023, $208 for sixteen: base, mesh and blackout top.' },
];

/** Rob's home grow list: each at quantity 1 with no price until he states them on Equipment. */
const NOT_STATED = 'Quantity and price not stated.';
const home = (item: string, category: EquipmentCategory, note = NOT_STATED): ScheduleLine => ({ item, category, setting: 'home', phase: 1, newUsed: 'New', qty: 1, unitCostNew: 0, critical: false, note });
const HOME_SEED: readonly ScheduleLine[] = [
  home('5x5 tray set', 'Trays and jars', `Solid bottom and lattice insert, one set. ${NOT_STATED}`),
  home('1010 tray set', 'Trays and jars', `Solid bottom and lattice insert, one set. ${NOT_STATED}`),
  home('1020 tray set', 'Trays and jars', `Solid bottom and lattice insert, one set. ${NOT_STATED}`),
  home('1020 solid bottom, top tray', 'Trays and jars', `Set upside down on a tray in blackout after it comes out of the weighted germination stack. ${NOT_STATED}`),
  home('Humidity dome, large', 'Trays and jars'),
  home('Sprout stand', 'Trays and jars'),
  home('Mason jar, 12 oz', 'Trays and jars'),
  home('Mason jar, 16 oz', 'Trays and jars'),
  home('Harvest knife', 'Tools and supplies'),
  home('Scoop', 'Tools and supplies'),
  home('Measuring cup', 'Tools and supplies'),
  home('Colored ID tape', 'Tools and supplies'),
  home('Labels', 'Tools and supplies'),
  home('Sharpie pens', 'Tools and supplies'),
  home('Stainless steel sheet pan', 'Tools and supplies'),
  home('Drying rack', 'Tools and supplies'),
  home('Watering sprayer', 'Tools and supplies'),
  home('pH water test kit', 'Monitoring and climate'),
  home('Soil moisture meter', 'Monitoring and climate'),
  home('Digital air monitor (humidity, temperature, pressure)', 'Monitoring and climate'),
  home('Fan', 'Monitoring and climate'),
  home('Dehumidifier, residential', 'Monitoring and climate'),
  home('Dehumidifier, commercial', 'Monitoring and climate'),
  home('Stainless steel prep table', 'Prep'),
  home('Refrigerator', 'Cold storage'),
];

/**
 * A rented facility's equipment. Seeded Unset: it counts toward capital, capacity and the facility
 * only once a forecast selects it. Every unit cost is an unsourced working figure, not a quote.
 */
const c = (l: Omit<ScheduleLine, 'setting' | 'phase'> & { phase?: 1 | 2 | 3 }): ScheduleLine => ({ phase: 1, ...l, setting: 'commercial' });
const schedule: ScheduleLine[] = [
  // Prep
  c({ item: 'Stainless prep tables, 8 ft', category: 'Prep', newUsed: 'Used', qty: 6, unitCostNew: 1150, critical: false, note: 'Stainless that sits still. Buy used.' }),
  c({ item: 'Prep sinks, 3-comp and 2-comp', category: 'Prep', newUsed: 'Used', qty: 2, unitCostNew: 2400, critical: false, note: 'Buy used' }),
  // Packaging
  c({ item: 'Tray sealer, semi-automatic', category: 'Packaging', newUsed: 'New', qty: 1, unitCostNew: 36000, critical: true, note: 'Seal integrity is a produce safety control' }),
  c({ item: 'Date and lot coder, inkjet', category: 'Packaging', newUsed: 'New', qty: 1, unitCostNew: 9800, critical: true, note: 'Traceability and recall' }),
  c({ item: 'Vacuum packaging machine, chamber', category: 'Packaging', newUsed: 'New', qty: 1, unitCostNew: 12500, critical: true }),
  c({ item: 'Label printer / applicator', category: 'Packaging', newUsed: 'New', qty: 2, unitCostNew: 3400, critical: false }),
  c({ item: 'Packaging tables, stainless', category: 'Packaging', newUsed: 'Used', qty: 3, unitCostNew: 1150, critical: false, note: 'Buy used' }),
  // Cold storage
  c({ item: 'Walk-in cooler, 12x20, with refrigeration', category: 'Cold storage', newUsed: 'New', qty: 1, unitCostNew: 52000, critical: true, note: 'Primary cold storage.' }),
  c({ item: 'Walk-in cooler, 10x12, with refrigeration', category: 'Cold storage', newUsed: 'New', qty: 1, unitCostNew: 38000, critical: true }),
  c({ item: 'Reach-in refrigerator, 2-door', category: 'Cold storage', newUsed: 'Used', qty: 4, unitCostNew: 6800, critical: false, note: 'Buy used' }),
  // Warewash & sanitation
  c({ item: 'Pot sink, 3-comp with drainboards', category: 'Warewash & sanitation', newUsed: 'New', qty: 1, unitCostNew: 9500, critical: false, note: 'Two drainboards.' }),
  c({ item: 'Hand sinks and mop sink', category: 'Warewash & sanitation', newUsed: 'Used', qty: 6, unitCostNew: 700, critical: false, note: 'Buy used' }),
  c({ item: 'Sanitation cart, chemical dispensing', category: 'Warewash & sanitation', newUsed: 'New', qty: 1, unitCostNew: 5200, critical: false }),
  // Storage, smallwares, instruments
  c({ item: 'Wire shelving and dunnage racks', category: 'Storage, smallwares, instruments', newUsed: 'Used', qty: 1, unitCostNew: 18000, critical: false, note: 'Lot. Buy used.' }),
  c({ item: 'Scales, receiving and unit', category: 'Storage, smallwares, instruments', newUsed: 'New', qty: 6, unitCostNew: 1500, critical: true }),
  c({ item: 'Thermometers, dataloggers, calibration kit', category: 'Storage, smallwares, instruments', newUsed: 'New', qty: 1, unitCostNew: 8500, critical: true, note: 'Every control point depends on these reading true' }),
  // Transport
  c({ item: 'Insulated transport carts', category: 'Transport', newUsed: 'New', qty: 12, unitCostNew: 2100, critical: true }),
  c({ item: 'Refrigerated distribution van', category: 'Transport', newUsed: 'New', qty: 1, unitCostNew: 72000, critical: true }),
  c({ item: 'Refrigerated distribution van, second', category: 'Transport', phase: 2, newUsed: 'New', qty: 1, unitCostNew: 72000, critical: false, note: 'Second route' }),
  // Technology
  c({ item: 'Network, temperature monitoring, cameras', category: 'Technology', newUsed: 'New', qty: 1, unitCostNew: 16000, critical: true, note: 'Continuous cold-chain logging' }),
  c({ item: 'Terminals, tablets, label printers', category: 'Technology', newUsed: 'New', qty: 1, unitCostNew: 14000, critical: false, note: 'Lot' }),
];

// ── The build-out split of the commercial list ────────────────
// A commercial Phase 1 is one cold chain with about a quarter of the wares; Phase 2 is the second
// cold room and the rest of the wares.

/** Lines that move whole to Phase 2. */
const SECOND_LINE = new Set(['Walk-in cooler, 10x12, with refrigeration']);

/** Units kept at Phase 1 on multi-unit lines; the rest are Phase 2's. */
const PHASE_1_UNITS: Record<string, number> = {
  'Stainless prep tables, 8 ft': 3,
  'Label printer / applicator': 1,
  'Reach-in refrigerator, 2-door': 2,
  'Scales, receiving and unit': 3,
  'Insulated transport carts': 6,
};

/** Wares bought as a lot: this share at Phase 1, the rest at Phase 2. */
const WARES_PHASE_1_SHARE = 0.25;
const WARES_LOTS = new Set(['Wire shelving and dunnage racks']);

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

/** A seed row: a home row Planned, a commercial row Unset until a forecast selects it. */
const planned = (l: ScheduleLine, over: Partial<EquipmentLine> = {}): EquipmentLine => ({
  ...l,
  key: l.item,
  status: l.setting === 'home' ? 'planned' : 'unset',
  inServiceDate: null,
  ...resourceSeedFor(l.item),
  ...footprintSeedFor(l.item),
  ...over,
});

/** The equipment library's seed: the home grow room and list, then the commercial list split into build-out phases. */
export const equipmentSeed: EquipmentLine[] = [
  ...GROW_ROOM_SEED.map(({ shelves, shelfWidthIn, fixtureKey, darkStagesOnly, ...l }): EquipmentLine => planned(l, { shelves: shelves ?? null, shelfWidthIn: shelfWidthIn ?? null, fixtureKey: fixtureKey ?? null, darkStagesOnly: darkStagesOnly === true })),
  ...HOME_SEED.map((l) => planned(l)),
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
 * A build-out line of a rented commercial facility (Roadmap N1). `extended` is the figure of
 * record in dollars; dollars per square foot are DERIVED from it against the facility size
 * (`perSqFtOf`), so the two cannot disagree.
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

/** No build-out is seeded: a home grow room has none, and a commercial facility's lines are entered on Equipment. */
export const leaseholdSeed: LeaseholdLine[] = [];

// The financing terms and the three monthly fixed costs that used to sit here
// are definitions now, not constants: `_data/finance.ts` carries their shapes
// and their seed, `farm.loans` and `farm.fixed_cost_lines` hold the rows, and
// the used-equipment purchase factor moved to `equipmentPurchase` (Roadmap N1).
