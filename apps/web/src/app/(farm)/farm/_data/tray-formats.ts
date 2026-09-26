/**
 * MicroFarm — tray formats (outline §4, glossary tier 1).
 *
 * A format is the physical thing a unit is: a 1020 flat, a 7x11 large tray, a 5x5 insert,
 * a pint jar for sprouts, or a cut ounce. A grow plan names its format; a variety's seeding
 * density is written for the 1020 and scales by growing area to the other trays. The
 * 48-inch shelf takes four 1020s side by side (On The Grow, 2023), which is how a grow unit's
 * capacity in trays is counted.
 */

import { tagged, type Tagged } from './tagged';

export type TrayFormatKey = 'flat-1020' | 'tray-7x11' | 'insert-5x5' | 'pint-jar' | 'cut-oz';

export type UnitKind = 'live' | 'sprout' | 'cut';

export interface TrayFormatDef {
  key: TrayFormatKey;
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
}

const AREA_1020 = 21 * 10.75;

export const TRAY_FORMATS: readonly TrayFormatDef[] = [
  {
    key: 'flat-1020',
    name: '1020 flat',
    kind: 'live',
    areaSqIn: tagged(AREA_1020, 'SOURCED', 'sq in', 'On The Grow tray specs: 21 x 10¾ x 1¼ in'),
    densityFactor: tagged(1, 'DERIVED', '×', 'The reference format'),
    perShelf48in: tagged(4, 'SOURCED', 'trays', 'On The Grow: four 1020 trays fit side by side on a 48-inch rack shelf'),
    traySet: '1020 three-piece set (bottom, mesh, blackout top)',
  },
  {
    key: 'tray-7x11',
    name: '7x11 large tray',
    kind: 'live',
    areaSqIn: tagged(7.25 * 14.4, 'SOURCED', 'sq in', 'On The Grow 7x14 tray specs, 14.4 x 7.25 in; Vallecito sold this as the large tray'),
    densityFactor: tagged((7.25 * 14.4) / AREA_1020, 'DERIVED', '×', 'Area over the 1020 area'),
    perShelf48in: tagged(6, 'DERIVED', 'trays', 'Two rows of three 14-inch trays on a 48 x 24 shelf'),
    traySet: 'Large green/white tray set',
  },
  {
    key: 'insert-5x5',
    name: '5x5 insert',
    kind: 'live',
    areaSqIn: tagged(25, 'STATED', 'sq in', 'Vallecito: 5x5 inserts grown eight to a 1020'),
    densityFactor: tagged(25 / AREA_1020, 'DERIVED', '×', 'Area over the 1020 area'),
    perShelf48in: tagged(32, 'DERIVED', 'trays', 'Eight inserts per 1020, four 1020s per shelf'),
    traySet: 'Small green/white tray set',
  },
  {
    key: 'pint-jar',
    name: 'Pint jar',
    kind: 'sprout',
    areaSqIn: tagged(0, 'STATED', 'sq in', 'A jar has no growing area; sprouts are sown by seed weight per jar'),
    densityFactor: tagged(0, 'STATED', '×', 'Not area-based: the variety states grams per jar'),
    perShelf48in: tagged(12, 'PLACEHOLDER', 'jars', 'Jar stands on a 48-inch shelf; no count observed'),
    traySet: 'Pint mason jar with sprouting lid',
  },
  {
    key: 'cut-oz',
    name: 'Cut ounce',
    kind: 'cut',
    areaSqIn: tagged(0, 'STATED', 'sq in', 'Harvested by weight from any tray'),
    densityFactor: tagged(0, 'STATED', '×', 'Not a growing format'),
    perShelf48in: tagged(0, 'STATED', 'trays', 'Not a growing format'),
    traySet: 'Clamshell or bag',
  },
];

export const TRAY_FORMAT_BY_KEY: Readonly<Record<TrayFormatKey, TrayFormatDef>> = Object.fromEntries(TRAY_FORMATS.map((f) => [f.key, f])) as Record<TrayFormatKey, TrayFormatDef>;

/** The growing formats: those with a tray on a shelf. */
export const GROWING_FORMATS: readonly TrayFormatDef[] = TRAY_FORMATS.filter((f) => f.kind === 'live');
