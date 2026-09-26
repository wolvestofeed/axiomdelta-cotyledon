/**
 * MicroFarm — tray formats (outline §4, glossary tier 1).
 *
 * A format is the physical thing a unit is: a 1020 flat, a 7x11 large tray, a 5x5 insert,
 * a pint jar for sprouts, or a cut ounce. A grow plan names its format; a variety's seeding
 * density is written for the 1020 and scales by growing area to the other trays. The
 * 48-inch shelf takes four 1020s side by side (On The Grow, 2023), which is how a grow unit's
 * capacity in trays is counted.
 */

import { tagged, type Tagged } from '@/data/tagged';

export const GRAMS_PER_OZ = 28.349523125;
export const OZ_PER_LB = 16;
export const GRAMS_PER_LB = GRAMS_PER_OZ * OZ_PER_LB;

export type TrayFormatKey = 'flat-1020' | 'tray-7x11' | 'insert-5x5' | 'pint-jar' | 'cut-oz';

export type UnitKind = 'live' | 'sprout' | 'cut';

export interface TrayFormatDef {
  key: TrayFormatKey;
  /** The suffix on a unit SKU: `BROC-01-1020` is the first broccoli plan packed as a 1020 flat. */
  code: string;
  name: string;
  /** What the subscriber receives: a living tray, a jar of sprouts, or cut greens by weight. */
  kind: UnitKind;
  /** Inside growing area, square inches; zero for a cut ounce, which has no tray. */
  areaSqIn: Tagged;
  /** Seeding density relative to the 1020 flat, by area. Derived. */
  densityFactor: Tagged;
  /** How many fit side by side on a 48-inch shelf, front to back one deep. */
  perShelf48in: Tagged;
  /** The tray set used, for the packaging library. */
  traySet: string;
  /** What one tray set costs and how many uses it gives; the per-tray consumable is the quotient. */
  traySetCost: Tagged;
  traySetUses: Tagged;
}

const AREA_1020 = 21 * 10.75;

export const TRAY_FORMATS: readonly TrayFormatDef[] = [
  {
    key: 'flat-1020',
    code: '1020',
    name: '1020 flat',
    kind: 'live',
    areaSqIn: tagged(AREA_1020, 'SOURCED', 'sq in', 'On The Grow tray specs: 21 x 10¾ x 1¼ in'),
    densityFactor: tagged(1, 'DERIVED', '×', 'The reference format'),
    perShelf48in: tagged(4, 'SOURCED', 'trays', 'On The Grow: four 1020 trays fit side by side on a 48-inch rack shelf'),
    traySet: '1020 three-piece set (bottom, mesh, blackout top)',
    traySetCost: tagged(13.33, 'DATED', '$', 'Vallecito 2023: On The Grow 1020 base, grow and top set'),
    traySetUses: tagged(1000, 'STATED', 'uses', 'Vallecito amortized the set over 1,000 uses'),
  },
  {
    key: 'tray-7x11',
    code: '7X11',
    name: '7x11 large tray',
    kind: 'live',
    areaSqIn: tagged(7.25 * 14.4, 'SOURCED', 'sq in', 'On The Grow 7x14 tray specs, 14.4 x 7.25 in; Vallecito sold this as the large tray'),
    densityFactor: tagged((7.25 * 14.4) / AREA_1020, 'DERIVED', '×', 'Area over the 1020 area'),
    perShelf48in: tagged(6, 'DERIVED', 'trays', 'Two rows of three 14-inch trays on a 48 x 24 shelf'),
    traySet: 'Large green/white tray set',
    traySetCost: tagged(5, 'DATED', '$', 'Vallecito 2023: On The Grow large green/white tray set'),
    traySetUses: tagged(1000, 'STATED', 'uses', 'Vallecito amortized the set over 1,000 uses'),
  },
  {
    key: 'insert-5x5',
    code: '5X5',
    name: '5x5 insert',
    kind: 'live',
    areaSqIn: tagged(25, 'STATED', 'sq in', 'Vallecito: 5x5 inserts grown eight to a 1020'),
    densityFactor: tagged(25 / AREA_1020, 'DERIVED', '×', 'Area over the 1020 area'),
    perShelf48in: tagged(32, 'DERIVED', 'trays', 'Eight inserts per 1020, four 1020s per shelf'),
    traySet: 'Small green/white tray set',
    traySetCost: tagged(3, 'DATED', '$', 'Vallecito 2023: On The Grow small green/white tray set'),
    traySetUses: tagged(1000, 'STATED', 'uses', 'Vallecito amortized the set over 1,000 uses'),
  },
  {
    key: 'pint-jar',
    code: 'PINT',
    name: 'Pint jar',
    kind: 'sprout',
    areaSqIn: tagged(0, 'STATED', 'sq in', 'A jar has no growing area; sprouts are sown by seed weight per jar'),
    densityFactor: tagged(0, 'STATED', '×', 'Not area-based: the variety states grams per jar'),
    perShelf48in: tagged(12, 'PLACEHOLDER', 'jars', 'Jar stands on a 48-inch shelf; no count observed'),
    traySet: 'Pint mason jar with sprouting lid',
    traySetCost: tagged(0, 'PLACEHOLDER', '$', 'No jar and lid price on file'),
    traySetUses: tagged(1, 'PLACEHOLDER', 'uses', 'No use count on file'),
  },
  {
    key: 'cut-oz',
    code: 'OZ',
    name: 'Cut ounce',
    kind: 'cut',
    areaSqIn: tagged(0, 'STATED', 'sq in', 'Harvested by weight from any tray'),
    densityFactor: tagged(0, 'STATED', '×', 'Not a growing format'),
    perShelf48in: tagged(0, 'STATED', 'trays', 'Not a growing format'),
    traySet: 'Clamshell or bag',
    traySetCost: tagged(0, 'PLACEHOLDER', '$', 'No clamshell price on file; the packaging library carries it once quoted'),
    traySetUses: tagged(1, 'STATED', 'uses', 'Single use'),
  },
];

export const TRAY_FORMAT_BY_KEY: Readonly<Record<TrayFormatKey, TrayFormatDef>> = Object.fromEntries(TRAY_FORMATS.map((f) => [f.key, f])) as Record<TrayFormatKey, TrayFormatDef>;

/** The growing formats: those with a tray on a shelf. */
export const GROWING_FORMATS: readonly TrayFormatDef[] = TRAY_FORMATS.filter((f) => f.kind === 'live');

/** The formats a grow plan is written for: a tray on a shelf or a jar on a stand. A cut ounce is harvested from one of them. */
export const PLAN_FORMATS: readonly TrayFormatDef[] = TRAY_FORMATS.filter((f) => f.kind !== 'cut');

/**
 * The seeding density factor a plan applies to a variety's grams per 1020: by growing area for a
 * tray, one for a jar (the variety states grams per jar), zero for a cut ounce.
 */
export function densityFactorOf(format: TrayFormatDef): number {
  return format.kind === 'sprout' ? 1 : format.densityFactor.value;
}

/** The tray-set consumable one unit of the format carries: the set's cost over its uses. */
export function traySetCostPerUnit(format: TrayFormatDef): number {
  return format.traySetUses.value > 0 ? format.traySetCost.value / format.traySetUses.value : 0;
}

/**
 * The SKU a subscriber sees: the grow plan's code and the packaged format. One grow plan packed as a
 * 1020 flat and as a 7x11 tray are two customer SKUs on one plan.
 */
export function unitSku(planCode: string, format: TrayFormatKey): string {
  return `${planCode}-${TRAY_FORMAT_BY_KEY[format].code}`;
}
