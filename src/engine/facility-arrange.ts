/**
 * Cotyledon — the generated arrangement (Roadmap Q6). Pure.
 *
 * Lays the plant out in the register's flow order from the derived areas and
 * the spacing rules the register carries, so the editor's checks can verify
 * what it produced. It is a flow-order arrangement, not a designer's block
 * plan: it knows nothing of columns, the slab, utilities or the dock's real
 * position, and it is handed to the editor as a draft, never saved on its own.
 *
 * The shell is read as a U. Receiving and harvest share the dock wall.
 *
 *   Band A   waste rooms · warewash · cart wash · wares · lockers · toilets · lounge · office
 *   Band B1  receiving → dry store → chemical store → raw walk-ins
 *   Band B2  prep → hot line → grow
 *   Spine    5 ft, the length of the shell (C-02)
 *   Band C   harvest dock ← harvest staging ← finished-goods cold store ← packaging · a la carte
 *            (the Phase 3 line takes its own block and hood at the street end, or a band of its
 *            own when the shell is too narrow for it)
 *
 * Inside a block, units stand in rows along the block's wall side with their
 * working faces toward the aisle, at the zone's aisle width; a unit's published
 * side and rear clearances separate it from its neighbours; the two blast
 * blackout racks take different rows so the two streams reach them on different
 * bearings. Later phases' units stand at the far end of each block and a
 * boundary is drawn around them.
 */

import { SUPPORT_ALLOWANCES, type FacilityZone } from '@/data/facility-design';
import type { BuildPhase, FacilityRow, PhaseRequirement } from '@/engine/facility';
import { SNAP_FT, snap, unitClearanceFt, unitSizeFt, type FacilityLayout, type LayoutRoom, type LayoutUnit } from '@/engine/facility-layout';

export type DockWall = 'left' | 'right';

export interface ArrangeInput {
  /** Every counted row through Phase 3, with footprints. */
  rows: readonly FacilityRow[];
  /** The full-build requirement: block areas come from its zone gross and support allowances. */
  full: PhaseRequirement;
  dockWall: DockWall;
}

export interface ArrangeResult {
  layout: FacilityLayout;
  /** Rows with floor the arrangement could not place (none expected). */
  unplaced: string[];
}

const BLOCK_GAP_FT = 3; // between blocks in a band: the 36 in accessible route
const BAND_GAP_FT = 1.5; // between bands where no spine runs
const HOOD_OVERHANG_FT = 0.5;
const MIN_BAND_FT = 8;
const MAX_BAND_FT = 30;

interface Placement {
  row: FacilityRow;
  unit: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Block {
  id: string;
  label: string;
  zone: FacilityZone | null;
  supportKey: string | null;
  areaSqFt: number;
  units: { row: FacilityRow; unit: number }[];
  /** Packed geometry, set by `packBlock`. */
  width: number;
  depth: number;
  placements: Placement[];
  x: number;
  y: number;
  height: number;
}

const isBlackoutRack = (r: FacilityRow) => /blackout rack/i.test(r.item);
const isHandSinkRow = (r: FacilityRow) => /hand sink/i.test(r.item);
const isDishMachine = (r: FacilityRow) => /dishwasher/i.test(r.item);
const isDumpGrowUnit = (r: FacilityRow) => /sprouting rack|shelf|braising/i.test(r.item);
const isFinishedGoodsWalkIn = (r: FacilityRow) => r.zone === 'Walk-in' && /8x10/.test(r.item);

const expand = (row: FacilityRow): { row: FacilityRow; unit: number }[] => Array.from({ length: Math.round(row.qty) }, (_, i) => ({ row, unit: i + 1 }));

/** Up to the next half-foot, so an abutting neighbour never lands inside a footprint. */
const up = (v: number) => Math.ceil(v / SNAP_FT - 1e-9) * SNAP_FT;

/** Pack a block's units in rows along its top edge, fronts facing +y. Sets the width used and the depth needed. */
function packBlock(b: Block, targetWidth: number): void {
  // Phase order, deepest first within a phase; the first blackout rack leads the block and the second
  // closes it, so the two streams reach them at opposite ends rather than side by side.
  const rank = (u: { row: FacilityRow; unit: number }) => (isBlackoutRack(u.row) ? (u.unit === 1 ? -1 : 9) : 0);
  const units = [...b.units].sort((a, c) => rank(a) - rank(c) || a.row.phase - c.row.phase || (c.row.depthIn ?? 0) - (a.row.depthIn ?? 0) || a.row.item.localeCompare(c.row.item) || a.unit - c.unit);
  const placements: Placement[] = [];
  let x = 0;
  let rowTop = 0;
  let rowDepth = 0;
  let rowFront = 0;
  let prevSide = 0;
  let widest = 0;
  let rowHasUnits = false;
  const newRow = (rearNext: number) => {
    rowTop = up(rowTop + rowDepth + rowFront + rearNext);
    x = 0;
    rowDepth = 0;
    rowFront = 0;
    prevSide = 0;
    rowHasUnits = false;
  };
  for (const u of units) {
    const size = unitSizeFt(u.row, 0);
    if (!size) continue;
    const c = unitClearanceFt(u.row);
    const sides = Math.max(prevSide, c.side);
    const gap = rowHasUnits ? (sides <= 0.5 ? sides : Math.max(sides, BLOCK_GAP_FT)) : 0;
    const needsNewRow = rowHasUnits && x + gap + size.w > targetWidth + 1e-9;
    if (needsNewRow) newRow(c.rear);
    const px = rowHasUnits ? up(x + gap) : up(c.side);
    placements.push({ row: u.row, unit: u.unit, x: px, y: rowTop, w: size.w, h: size.h });
    x = px + size.w;
    widest = Math.max(widest, up(x + c.side));
    rowDepth = Math.max(rowDepth, size.h);
    rowFront = Math.max(rowFront, c.front);
    prevSide = c.side;
    rowHasUnits = true;
  }
  b.placements = placements;
  b.width = up(Math.max(widest, targetWidth));
  b.depth = placements.length ? up(rowTop + rowDepth + rowFront) : 0;
}

/** Pack at the narrowest width that keeps the block inside the band's height, widening in steps. */
function packBlockToHeight(b: Block, targetWidth: number, maxDepth: number): void {
  const widestUnit = Math.max(0, ...b.units.map((u) => (unitSizeFt(u.row, 0)?.w ?? 0) + 2 * unitClearanceFt(u.row).side));
  let w = Math.max(targetWidth, widestUnit, 4);
  packBlock(b, w);
  let guard = 0;
  while (b.depth > maxDepth + 1e-9 && guard < 12) {
    w = up(w * 1.25 + 1);
    packBlock(b, w);
    guard += 1;
  }
}

function makeBlock(id: string, label: string, zone: FacilityZone | null, supportKey: string | null, areaSqFt: number, units: { row: FacilityRow; unit: number }[]): Block {
  return { id, label, zone, supportKey, areaSqFt, units, width: 0, depth: 0, placements: [], x: 0, y: 0, height: 0 };
}

const SINK_RESERVE_FT = 1.5;

/**
 * Lay a band's blocks side by side. A block with units is packed square-ish
 * at its own depth (its room is drawn at that depth); a plain room takes the
 * band's height, which is what the band's total area needs at the shell's
 * target width. The band is as tall as its deepest block.
 */
function packBand(blocks: Block[], minHeight: number, targetWidth: number, sinkBlocks: ReadonlySet<string>): { width: number; height: number } {
  const gaps = BLOCK_GAP_FT * Math.max(0, blocks.length - 1);
  const reserve = (b: Block) => (sinkBlocks.has(b.id) ? SINK_RESERVE_FT : 0);
  // Unit blocks pack wider than square (8:5), which keeps every work position within reach of the sink below the rows.
  for (const b of blocks.filter((x) => x.units.length > 0)) {
    packBlockToHeight(b, Math.sqrt(b.areaSqFt * 1.6), MAX_BAND_FT - reserve(b));
    b.height = up(b.depth + reserve(b) + 0.5);
  }
  const unitBlocks = blocks.filter((x) => x.units.length > 0);
  const plainBlocks = blocks.filter((x) => x.units.length === 0);
  const plainArea = plainBlocks.reduce((sum, b) => sum + b.areaSqFt, 0);
  const unitWidth = unitBlocks.reduce((sum, b) => sum + b.width, 0);
  const plainHeight = up(Math.min(MAX_BAND_FT, Math.max(MIN_BAND_FT, minHeight, plainArea / Math.max(10, targetWidth - gaps - unitWidth))));
  for (const b of plainBlocks) {
    b.width = up(Math.max(4, b.areaSqFt / plainHeight));
    b.height = plainHeight;
  }
  const height = Math.max(MIN_BAND_FT, ...blocks.map((b) => b.height));
  let x = 0;
  for (const b of blocks) {
    b.x = x;
    x += b.width + BLOCK_GAP_FT;
  }
  return { width: Math.max(0, x - BLOCK_GAP_FT), height };
}

export function arrangeLayout(input: ArrangeInput): ArrangeResult {
  const rows = input.rows.filter((r) => r.counted);
  const zoneArea = (z: FacilityZone) => input.full.floor.zones.find((l) => l.zone === z)?.grossSqFt ?? 0;
  const support = (key: string) => input.full.support.lines.find((l) => l.key === key)?.netSqFt ?? SUPPORT_ALLOWANCES.find((a) => a.key === key)?.fixedSqFt ?? 0;
  const supportLabel = (key: string) => SUPPORT_ALLOWANCES.find((a) => a.key === key)?.space ?? key;
  const inZone = (z: FacilityZone, pred: (r: FacilityRow) => boolean = () => true) => rows.filter((r) => r.zone === z && r.unitSqFt !== null && pred(r)).flatMap(expand);
  const handSinks = rows.filter(isHandSinkRow).flatMap(expand);
  const notSink = (r: FacilityRow) => !isHandSinkRow(r);
  const rawWalkIns = inZone('Walk-in', (r) => !isFinishedGoodsWalkIn(r));
  const finishedWalkIns = inZone('Walk-in', isFinishedGoodsWalkIn);
  const walkInArea = (units: { row: FacilityRow }[]) => units.reduce((s, u) => s + (u.row.unitGrossSqFt ?? 0), 0);
  const dockArea = support('dock');

  // ── Band A: support and soiled side
  const bandA: Block[] = [
    makeBlock('trash', supportLabel('trash'), null, 'trash', support('trash'), []),
    makeBlock('refrigerated-waste', supportLabel('refrigerated-waste'), null, 'refrigerated-waste', support('refrigerated-waste'), []),
    makeBlock('recyclables', supportLabel('recyclables'), null, 'recyclables', support('recyclables'), []),
    makeBlock('warewash', supportLabel('warewash'), 'Warewash', 'warewash', support('warewash'), inZone('Warewash', notSink)),
    makeBlock('cart-wash', supportLabel('cart-wash'), null, 'cart-wash', support('cart-wash'), []),
    makeBlock('wares', supportLabel('wares'), null, 'wares', support('wares'), []),
    makeBlock('lockers', supportLabel('lockers'), null, 'lockers', support('lockers'), []),
    makeBlock('toilets', supportLabel('toilets'), null, 'toilets', support('toilets'), []),
    makeBlock('lounge', supportLabel('lounge'), null, 'lounge', support('lounge'), []),
    makeBlock('office', supportLabel('office'), null, 'office', support('office'), []),
  ];
  // ── Band B1: receiving → storage; Band B2: prep → hot line → grow
  const bandB1: Block[] = [
    makeBlock('dock-receiving', 'Receiving dock', null, 'dock', dockArea / 2, []),
    makeBlock('dry-food', supportLabel('dry-food'), null, 'dry-food', support('dry-food'), []),
    makeBlock('chemical', supportLabel('chemical'), null, 'chemical', support('chemical'), []),
    makeBlock('walk-ins-raw', 'Cold store, raw', 'Walk-in', null, walkInArea(rawWalkIns), rawWalkIns),
  ];
  const bandB2: Block[] = [
    makeBlock('prep', 'Prep', 'Prep', null, zoneArea('Prep'), inZone('Prep')),
    makeBlock('hot-line', 'Hot line', 'Hot line', null, zoneArea('Hot line'), inZone('Hot line')),
    makeBlock('grow', 'Grow', 'Grow', null, zoneArea('Grow'), inZone('Grow')),
  ];
  // ── Band C: harvest dock ← harvest ← finished goods ← packaging (flow runs right to left)
  const bandC: Block[] = [
    makeBlock('dock-harvest', 'Harvest dock', null, 'dock', dockArea / 2, []),
    makeBlock('harvest', 'Harvest staging', 'Harvest', null, zoneArea('Harvest'), inZone('Harvest')),
    makeBlock('cold-storage', 'Finished goods cold store', 'Cold storage', null, zoneArea('Cold storage') + walkInArea(finishedWalkIns), [...inZone('Cold storage'), ...finishedWalkIns]),
    makeBlock('packaging', 'Packaging', 'Packaging', null, zoneArea('Packaging'), inZone('Packaging')),
  ];
  // ── The a la carte line: its own block and hood at the street end of band C, or a band of its own.
  const alaCarte = inZone('A la carte');
  const alaCarteBlock = alaCarte.length ? makeBlock('a-la-carte', 'A la carte line', 'A la carte', null, zoneArea('A la carte'), alaCarte) : null;

  const sinkBlocks = new Set(['prep', 'hot-line', 'grow', 'packaging', 'a-la-carte', 'warewash', 'cold-storage', 'harvest']);
  // The shell's target width: a 4:3 shell at the derived building gross; the storage band sets the floor.
  const targetWidth = Math.max(60, Math.sqrt((input.full.buildingGrossSqFt * 4) / 3));
  const b1 = packBand(bandB1, 12, targetWidth, sinkBlocks);
  const wide = Math.max(targetWidth, b1.width);
  const a = packBand(bandA, 12, wide, sinkBlocks);
  const b2 = packBand(bandB2, 12, wide, sinkBlocks);
  const c = packBand(bandC, 12, wide, sinkBlocks);
  let d = { width: 0, height: 0 };
  const bandD: Block[] = [];
  if (alaCarteBlock) {
    packBand([alaCarteBlock], 10, 40, sinkBlocks);
    if (c.width + BLOCK_GAP_FT + alaCarteBlock.width <= wide) {
      // Room at the street end of band C: the line stands there with its own hood.
      alaCarteBlock.x = wide - alaCarteBlock.width;
      bandC.push(alaCarteBlock);
      c.width = wide;
      c.height = Math.max(c.height, alaCarteBlock.height);
    } else {
      bandD.push(alaCarteBlock);
      d = packBand(bandD, 10, 40, sinkBlocks);
    }
  }
  const W = up(Math.max(a.width, b1.width, b2.width, c.width, d.width) + 1);

  // Vertical stack: A, B1, B2, spine, C, D.
  const yA = 0;
  const yB1 = yA + a.height + BAND_GAP_FT;
  const yB2 = yB1 + b1.height + BAND_GAP_FT;
  const ySpine = yB2 + b2.height;
  const yC = ySpine + 5;
  const yD = yC + c.height + (bandD.length ? BAND_GAP_FT : 0);
  const H = up(yD + d.height + 0.5);

  const rooms: LayoutRoom[] = [];
  const units: LayoutUnit[] = [];
  const placedByBlock = new Map<string, Placement[]>();
  let n = 0;
  const id = (p: string) => `${p}-${(n += 1)}`;

  const lay = (blocks: Block[], y: number, _height: number, alignRight: boolean, bandWidth: number) => {
    const shift = alignRight ? W - 1 - bandWidth : 0.5;
    for (const bl of blocks) {
      const bx = snap(bl.x + shift);
      rooms.push({ id: id('room'), kind: 'room', label: bl.label, x: bx, y: snap(y), w: snap(bl.width), h: snap(bl.height), zone: bl.zone, supportKey: bl.supportKey });
      const abs: Placement[] = bl.placements.map((p) => ({ ...p, x: snap(bx + p.x), y: snap(y + p.y) }));
      placedByBlock.set(bl.id, abs);
      for (const p of abs) units.push({ id: id('unit'), key: p.row.key, unit: p.unit, x: p.x, y: p.y, rot: 0 });
    }
  };
  // Band A: the waste and warewash group from the dock end, the staff rooms from the street end.
  const staffKeys = new Set(['lockers', 'toilets', 'lounge', 'office']);
  const aLeft = bandA.filter((bl) => !staffKeys.has(bl.id));
  const aRight = bandA.filter((bl) => staffKeys.has(bl.id));
  const aRightWidth = aRight.reduce((s, bl) => s + bl.width, 0) + BLOCK_GAP_FT * (aRight.length - 1);
  let rx = 0;
  for (const bl of aRight) {
    bl.x = rx;
    rx += bl.width + BLOCK_GAP_FT;
  }
  lay(aLeft, yA, a.height, false, 0);
  lay(aRight, yA, a.height, true, aRightWidth);
  lay(bandB1, yB1, b1.height, false, 0);
  lay(bandB2, yB2, b2.height, false, 0);
  lay(bandC, yC, c.height, false, 0);
  if (bandD.length) lay(bandD, yD, d.height, true, d.width);

  // The spine, the length of the shell.
  rooms.push({ id: id('room'), kind: 'spine', label: 'Cart spine', x: 0.5, y: snap(ySpine), w: snap(W - 1), h: 5, zone: null, supportKey: null });

  // Hoods: one canopy per phase over the hot line's hooded units, and one over the a la carte line.
  const hoodOver = (ps: Placement[], label: string) => {
    const hooded = ps.filter((p) => p.row.underHood);
    if (!hooded.length) return;
    const x0 = Math.min(...hooded.map((p) => p.x)) - HOOD_OVERHANG_FT;
    const y0 = Math.min(...hooded.map((p) => p.y)) - HOOD_OVERHANG_FT;
    const x1 = Math.max(...hooded.map((p) => p.x + p.w)) + HOOD_OVERHANG_FT;
    const y1 = Math.max(...hooded.map((p) => p.y + p.h)) + HOOD_OVERHANG_FT;
    rooms.push({ id: id('room'), kind: 'hood', label, x: x0, y: y0, w: x1 - x0, h: y1 - y0, zone: null, supportKey: null });
  };
  const hot = placedByBlock.get('hot-line') ?? [];
  for (const phase of [1, 2, 3] as BuildPhase[]) hoodOver(hot.filter((p) => p.row.phase === phase), `Type I hood, Phase ${phase} run`);
  hoodOver(placedByBlock.get('a-la-carte') ?? [], 'Type I hood, a la carte');

  // Floor drains: under the sprouting rack and shelf dump arcs, and beside the dish machine.
  for (const p of [...hot, ...(placedByBlock.get('warewash') ?? [])]) {
    if (isDumpGrowUnit(p.row)) rooms.push({ id: id('room'), kind: 'drain', label: 'Floor drain', x: snap(p.x + p.w / 2 - 0.5), y: snap(p.y + p.h + 0.5), w: 1, h: 1, zone: null, supportKey: null });
    if (isDishMachine(p.row)) rooms.push({ id: id('room'), kind: 'drain', label: 'Trench drain', x: snap(p.x), y: snap(p.y + p.h + 0.5), w: snap(p.w), h: 1, zone: null, supportKey: null });
  }

  // Hand sinks: the library's own sinks, one at each production block's entry corner; the mop sink in warewash.
  const allBlocks = [...bandA, ...bandB1, ...bandB2, ...bandC, ...bandD];
  let s = 0;
  for (const blockId of sinkBlocks) {
    const sink = handSinks[s];
    const bl = allBlocks.find((x) => x.id === blockId);
    const room = bl && rooms.find((r) => r.kind === 'room' && r.label === bl.label);
    if (!sink || !bl || !room) continue;
    const size = unitSizeFt(sink.row, 0)!;
    const below = bl.depth + 0.5 + size.h <= room.h + 1e-9;
    const x = Math.min(W - size.w - 0.5, below ? up(room.x + room.w / 2 - size.w / 2) : up(room.x + room.w + 1));
    const y = below ? up(room.y + bl.depth + 0.5) : up(room.y + room.h / 2);
    units.push({ id: id('unit'), key: sink.row.key, unit: sink.unit, x, y, rot: 0 });
    s += 1;
  }

  // Exits: the dock wall at the harvest end, and the street wall.
  rooms.push({ id: id('room'), kind: 'exit', label: 'Exit, dock', x: 0.5, y: snap(yC + c.height - 1.5), w: 3, h: 1, zone: null, supportKey: null });
  rooms.push({ id: id('room'), kind: 'exit', label: 'Exit, street', x: snap(W - 3.5), y: 0.5, w: 3, h: 1, zone: null, supportKey: null });

  // Boundaries: one around each block's later-phase units, so the reserved positions read as such.
  for (const [blockId, ps] of placedByBlock) {
    for (const phase of [2, 3] as BuildPhase[]) {
      const later = ps.filter((p) => p.row.phase === phase);
      if (!later.length) continue;
      const cl = later.map((p) => unitClearanceFt(p.row));
      const x0 = Math.min(...later.map((p, i) => p.x - cl[i]!.side)) - 0.25;
      const y0 = Math.min(...later.map((p, i) => p.y - cl[i]!.rear)) - 0.25;
      const x1 = Math.max(...later.map((p, i) => p.x + p.w + cl[i]!.side)) + 0.25;
      const y1 = Math.max(...later.map((p, i) => p.y + p.h + cl[i]!.front)) + 0.25;
      const block = allBlocks.find((bl) => bl.id === blockId);
      rooms.push({ id: id('room'), kind: 'boundary', label: `Phase ${phase} reserved${block ? ` — ${block.label}` : ''}`, x: snap(x0), y: snap(y0), w: snap(x1 - x0), h: snap(y1 - y0), zone: null, supportKey: null });
    }
  }

  // Mirror for a dock on the right wall.
  if (input.dockWall === 'right') {
    for (const r of rooms) r.x = W - r.x - r.w;
    const byKey = new Map(rows.map((r) => [r.key, r]));
    for (const u of units) {
      const size = unitSizeFt(byKey.get(u.key)!, u.rot)!;
      u.x = W - u.x - size.w;
    }
  }

  const placedKeys = new Set(units.map((u) => `${u.key}#${u.unit}`));
  const unplaced = rows.filter((r) => r.unitSqFt !== null && r.qty > 0).flatMap(expand).filter((u) => !placedKeys.has(`${u.row.key}#${u.unit}`)).map((u) => `${u.row.item} (${u.unit})`);

  return { layout: { shell: { widthFt: W, depthFt: H }, rooms, units }, unplaced };
}
