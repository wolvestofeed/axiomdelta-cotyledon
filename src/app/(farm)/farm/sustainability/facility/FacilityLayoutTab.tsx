'use client';

import { useMemo, useRef, useState, useTransition, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Kpi, num } from '@/components/ui';

import { BRAND_LINE } from '@/components/ui';
import { FACILITY_ZONES, SUPPORT_ALLOWANCES, type FacilityZone } from '@/data/facility-design';
import { rowsThroughPhase, type BuildPhase, type FacilityRow } from '@/engine/facility';
import {
  ROOM_KIND_LABELS,
  emptyLayout,
  findFreeSpot,
  haloRect,
  layoutFindings,
  measureLayout,
  placedUnits,
  snap,
  unitRect,
  unitSizeFt,
  unplacedUnits,
  type FacilityLayout,
  type LayoutRoom,
  type LayoutUnit,
  type RoomKind,
} from '@/engine/facility-layout';
import { arrangeLayout, type DockWall } from '@/engine/facility-arrange';
import { saveFacilityLayout } from '@/server/facility-actions';
import type { SavedFacilityLayout } from '@/server/facility';
import type { FacilityView } from '@/app/(farm)/farm/sustainability/facility/facility-view';

const PHASES: BuildPhase[] = [1, 2, 3];
const MARKER_FT = 2;
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));

type Selected = { kind: 'unit' | 'room'; id: string } | null;

/** Scale for wrapped labels: the plan is drawn in feet, so text is laid out at K px per foot and scaled back. */
const K = 24;
const PAD_FT = 0.2;

/** A label that wraps inside its block: the text column is the block's width less a little padding on each side. */
function Label({ x, y, w, h, text, sub, fontFt, color }: { x: number; y: number; w: number; h: number; text: string; sub?: string; fontFt: number; color?: string }) {
  const cw = Math.max(0, w - 2 * PAD_FT);
  const ch = Math.max(0, h - 2 * PAD_FT);
  if (cw <= 0.3 || ch <= 0.3) return null;
  return (
    <foreignObject x={0} y={0} width={cw * K} height={ch * K} transform={`translate(${x + PAD_FT} ${y + PAD_FT}) scale(${1 / K})`} className="pointer-events-none! overflow-hidden!">
      <div className="overflow-hidden farm-mono leading-[1.15] [overflow-wrap:anywhere] break-words" style={{ width: `${cw * K}px`, height: `${ch * K}px`, fontSize: `${fontFt * K}px`, color: color ?? 'var(--farm-ink)' }}>
        {text}
        {sub && <div className="farm-c-faint" style={{ fontSize: `${fontFt * K * 0.8}px` }}>{sub}</div>}
      </div>
    </foreignObject>
  );
}
type Drag = { kind: 'unit' | 'room' | 'resize'; id: string; dx: number; dy: number } | null;

/**
 * Layout: the drawing (Roadmap Q6). One drawing per build phase under the
 * open scenario. Units come off the equipment library at their footprints and
 * are placed by drag on a half-foot grid; rooms, the cart spine, hood
 * canopies, exits, floor drains and hand sinks are drawn as rectangles. The
 * conformance checks run live on what is drawn, and the drawn areas are
 * measured against the derived requirement. Printing sets the plan at
 * 1/4 in = 1 ft.
 */
export function FacilityLayoutTab({ view, layouts }: { view: FacilityView; layouts: SavedFacilityLayout[] }) {
  const { rows, requirement, canEdit, scenarioKey, scenarioLabel } = view;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<BuildPhase>(1);
  const [drafts, setDrafts] = useState<Record<number, FacilityLayout>>(() => {
    const d: Record<number, FacilityLayout> = {};
    for (const p of PHASES) {
      const saved = layouts.find((l) => l.phase === p);
      d[p] = saved ? saved.layout : emptyLayout(requirement.phases[p - 1]!.buildingGrossSqFt);
    }
    return d;
  });
  const [dirty, setDirty] = useState<Record<number, boolean>>({});
  const [selected, setSelected] = useState<Selected>(null);
  const [showHalos, setShowHalos] = useState(true);
  const [showLater, setShowLater] = useState(true);
  const [newRoom, setNewRoom] = useState<{ kind: RoomKind; zone: FacilityZone | ''; supportKey: string; label: string }>({ kind: 'room', zone: '', supportKey: '', label: '' });
  const [dockWall, setDockWall] = useState<DockWall>('left');
  const drag = useRef<Drag>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const layout = drafts[phase]!;
  const update = (fn: (l: FacilityLayout) => FacilityLayout) => {
    setDrafts((d) => ({ ...d, [phase]: fn(d[phase]!) }));
    setDirty((x) => ({ ...x, [phase]: true }));
  };
  const saved = layouts.find((l) => l.phase === phase);

  // The rows the drawing knows: this phase's, plus later phases' as reserved positions.
  const allRows = useMemo(() => rowsThroughPhase(rows, 3), [rows]);
  const phaseRows = useMemo(() => rowsThroughPhase(rows, phase), [rows, phase]);
  const knownRows = showLater ? allRows : phaseRows;
  const placed = useMemo(() => placedUnits(layout, knownRows), [layout, knownRows]);
  const unplaced = useMemo(() => unplacedUnits(layout, knownRows), [layout, knownRows]);
  const findings = useMemo(() => layoutFindings(layout, knownRows, phase), [layout, knownRows, phase]);
  const derived = requirement.phases[phase - 1]!;
  const measured = useMemo(() => measureLayout(layout, derived.floor), [layout, derived.floor]);
  const flagged = useMemo(() => new Set(findings.filter((f) => f.severity === 'limit').flatMap((f) => f.subjectIds)), [findings]);

  // ── Pointer handling in feet: the SVG's viewBox is in feet, so the CTM gives feet directly.
  const toFeet = (ev: ReactPointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: pt.x, y: pt.y };
  };
  const down = (ev: ReactPointerEvent, kind: 'unit' | 'room' | 'resize', id: string, origin: { x: number; y: number }) => {
    if (!canEdit) {
      setSelected({ kind: kind === 'resize' ? 'room' : kind, id });
      return;
    }
    ev.stopPropagation();
    const p = toFeet(ev);
    drag.current = { kind, id, dx: p.x - origin.x, dy: p.y - origin.y };
    setSelected({ kind: kind === 'resize' ? 'room' : kind, id });
    svgRef.current?.setPointerCapture(ev.pointerId);
  };
  const move = (ev: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toFeet(ev);
    const x = snap(p.x - d.dx);
    const y = snap(p.y - d.dy);
    if (d.kind === 'unit') update((l) => ({ ...l, units: l.units.map((u) => (u.id === d.id ? { ...u, x, y } : u)) }));
    else if (d.kind === 'room') update((l) => ({ ...l, rooms: l.rooms.map((r) => (r.id === d.id ? { ...r, x, y } : r)) }));
    else update((l) => ({ ...l, rooms: l.rooms.map((r) => (r.id === d.id ? { ...r, w: Math.max(1, snap(p.x) - r.x), h: Math.max(1, snap(p.y) - r.y) } : r)) }));
  };
  const up = (ev: ReactPointerEvent) => {
    if (drag.current) svgRef.current?.releasePointerCapture(ev.pointerId);
    drag.current = null;
  };

  // ── Edits
  const place = (row: FacilityRow, unit: number) => {
    const size = unitSizeFt(row, 0);
    if (!size) return;
    const at = findFreeSpot(layout, knownRows, size);
    const u: LayoutUnit = { id: newId(), key: row.key, unit, x: at.x, y: at.y, rot: 0 };
    update((l) => ({ ...l, units: [...l.units, u] }));
    setSelected({ kind: 'unit', id: u.id });
  };
  const placeAll = () => {
    let next = layout;
    for (const { row, unit } of unplaced) {
      const size = unitSizeFt(row, 0);
      if (!size) continue;
      const at = findFreeSpot(next, knownRows, size);
      next = { ...next, units: [...next.units, { id: newId(), key: row.key, unit, x: at.x, y: at.y, rot: 0 }] };
    }
    update(() => next);
  };
  const rotate = () => {
    if (selected?.kind !== 'unit') return;
    update((l) => ({ ...l, units: l.units.map((u) => (u.id === selected.id ? { ...u, rot: u.rot === 0 ? 90 : 0 } : u)) }));
  };
  const remove = () => {
    if (!selected) return;
    update((l) => (selected.kind === 'unit' ? { ...l, units: l.units.filter((u) => u.id !== selected.id) } : { ...l, rooms: l.rooms.filter((r) => r.id !== selected.id) }));
    setSelected(null);
  };
  const addRoom = () => {
    const kind = newRoom.kind;
    const isMarker = kind === 'exit' || kind === 'drain' || kind === 'hand_sink';
    const allowance = kind === 'room' && newRoom.supportKey ? derived.support.lines.find((l) => l.key === newRoom.supportKey) : null;
    const zoneLine = kind === 'room' && newRoom.zone ? derived.floor.zones.find((z) => z.zone === newRoom.zone) : null;
    const area = allowance ? allowance.netSqFt : zoneLine ? zoneLine.grossSqFt : 100;
    const side = isMarker ? MARKER_FT : Math.max(4, snap(Math.sqrt(area)));
    const w = kind === 'spine' ? 5 : kind === 'hood' ? Math.max(6, snap(derived.hoodRuns.find((r) => r.phase === phase)?.lengthFt ?? 8)) : side;
    const h = kind === 'spine' ? snap(Math.min(layout.shell.depthFt - 4, Math.max(10, derived.floor.spineFt))) : kind === 'hood' ? 4.5 : side;
    const label = newRoom.label.trim() || (allowance ? allowance.space : zoneLine ? newRoom.zone : ROOM_KIND_LABELS[kind]);
    const room: LayoutRoom = { id: newId(), kind, label, x: 1, y: 1, w, h, zone: kind === 'room' && newRoom.zone ? newRoom.zone : null, supportKey: kind === 'room' && newRoom.supportKey ? newRoom.supportKey : null };
    update((l) => ({ ...l, rooms: [...l.rooms, room] }));
    setSelected({ kind: 'room', id: room.id });
    setNewRoom((n) => ({ ...n, label: '' }));
  };
  /** A flow-order arrangement from the register and the derived areas, handed over as a draft. */
  const generate = () => {
    const full = requirement.phases[requirement.phases.length - 1]!;
    const { layout: gen } = arrangeLayout({ rows: allRows, full, dockWall });
    update(() => gen);
    setSelected(null);
  };
  const setShell = (patch: Partial<FacilityLayout['shell']>) => update((l) => ({ ...l, shell: { ...l.shell, ...patch } }));
  const relabel = (id: string, label: string) => update((l) => ({ ...l, rooms: l.rooms.map((r) => (r.id === id ? { ...r, label } : r)) }));
  const resize = (id: string, patch: Partial<Pick<LayoutRoom, 'w' | 'h' | 'x' | 'y'>>) => update((l) => ({ ...l, rooms: l.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const reset = () => {
    setDrafts((d) => ({ ...d, [phase]: saved ? saved.layout : emptyLayout(derived.buildingGrossSqFt) }));
    setDirty((x) => ({ ...x, [phase]: false }));
    setSelected(null);
  };
  const save = () => {
    if (!canEdit) return;
    start(async () => {
      const r = await saveFacilityLayout({ scenarioKey, buildPhase: phase, label: `Phase ${phase} — ${scenarioLabel}`, shellWidthFt: layout.shell.widthFt, shellDepthFt: layout.shell.depthFt, rooms: layout.rooms, units: layout.units });
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        setDirty((x) => ({ ...x, [phase]: false }));
        router.refresh();
      }
    });
  };

  const W = layout.shell.widthFt;
  const H = layout.shell.depthFt;
  const selectedRoom = selected?.kind === 'room' ? layout.rooms.find((r) => r.id === selected.id) ?? null : null;
  const selectedUnit = selected?.kind === 'unit' ? placed.find((p) => p.unit.id === selected.id) ?? null : null;
  const grid: number[] = [];
  for (let g = 0; g <= Math.max(W, H); g += 5) grid.push(g);
  const limits = findings.filter((f) => f.severity === 'limit');

  return (
    <>
      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={`${num(W)} × ${num(H)} ft`} label="Shell drawn" sub={`${num(W * H)} sq ft against ${num(Math.round(derived.buildingGrossSqFt))} derived building gross`} />
        <Kpi value={`${num(placed.length)} / ${num(placed.length + unplaced.length)}`} label="Units placed" sub={showLater ? 'This phase and later phases as reserved positions' : 'This phase only'} />
        <Kpi value={num(limits.length)} label="Findings against a limit" sub={`${num(findings.length - limits.length)} measurements reported without a limit`} />
        <Kpi value={saved ? `v${saved.version}` : 'Unsaved'} label="Drawing on file" sub={saved ? `${saved.createdAt.slice(0, 10)}${dirty[phase] ? ' · edited' : ''}` : dirty[phase] ? 'Edited, not yet saved' : 'Nothing drawn yet'} />
      </div>

      <Card title="Drawing" className="mt-4">
        <div className="flex flex-wrap gap-2 items-center mb-[0.6rem]!">
          <select className="farm-input farm-cell-control w-30!" value={phase} aria-label="Build phase drawn" onChange={(ev) => { setPhase(Number(ev.target.value) as BuildPhase); setSelected(null); }}>
            {PHASES.map((p) => <option key={p} value={p}>Phase {p}</option>)}
          </select>
          <label className="farm-field flex-row! items-center! gap-[0.4rem]!">
            <span>Shell</span>
            <input type="number" className="farm-input farm-cell-control w-22!" min={10} step={1} value={W} disabled={!canEdit} aria-label="Shell width in feet" onChange={(ev) => setShell({ widthFt: Math.max(10, Number(ev.target.value) || 10) })} />
            <span>×</span>
            <input type="number" className="farm-input farm-cell-control w-22!" min={10} step={1} value={H} disabled={!canEdit} aria-label="Shell depth in feet" onChange={(ev) => setShell({ depthFt: Math.max(10, Number(ev.target.value) || 10) })} />
            <span className="farm-c-faint farm-fs-xs">ft</span>
          </label>
          <label className="inline-flex! gap-[0.35rem]! items-center! farm-fs-sm"><input type="checkbox" checked={showHalos} onChange={(ev) => setShowHalos(ev.target.checked)} /> Working clearances</label>
          <label className="inline-flex! gap-[0.35rem]! items-center! farm-fs-sm"><input type="checkbox" checked={showLater} onChange={(ev) => setShowLater(ev.target.checked)} /> Later phases as reserved positions</label>
          <span className="flex-1" />
          {canEdit && (
            <span className="inline-flex gap-[0.35rem] items-center">
              <select className="farm-input farm-cell-control w-34!" value={dockWall} aria-label="Dock wall" onChange={(ev) => setDockWall(ev.target.value as DockWall)}>
                <option value="left">Dock on the left</option>
                <option value="right">Dock on the right</option>
              </select>
              <button type="button" className="farm-btn" onClick={generate}>Generate arrangement</button>
            </span>
          )}
          <button type="button" className="farm-btn ghost" disabled={selected?.kind !== 'unit' || !canEdit} onClick={rotate}>Rotate</button>
          <button type="button" className="farm-btn ghost" disabled={!selected || !canEdit} onClick={remove}>Remove</button>
          <button type="button" className="farm-btn ghost" disabled={!dirty[phase]} onClick={reset}>Discard edits</button>
          <button type="button" className="farm-btn" onClick={() => window.print()}>Print at 1/4 in = 1 ft</button>
          {canEdit && <button type="button" className="farm-btn primary" disabled={pending || !dirty[phase]} onClick={save}>{pending ? 'Saving…' : 'Save drawing'}</button>}
        </div>
        {error && <p className="farm-kpi-sub farm-c-accent mb-2!">{error}</p>}

        <div className="farm-plan-sheet" style={{ '--plan-w': `${(W + 4) / 4}in` } as CSSProperties}>
          <div className="farm-plan-print-only hidden farm-mono mb-[0.2in]!" style={{ fontSize: '10pt' }}>
            {BRAND_LINE} · Facility layout · Phase {phase} · {scenarioLabel} · Scale 1/4 in = 1 ft · Shell {num(W)} × {num(H)} ft ({num(W * H)} sq ft) · Sheet {((W + 4) / 4).toFixed(1)} × {((H + 4) / 4).toFixed(1)} in · {new Date().toISOString().slice(0, 10)}
          </div>
          <svg
            ref={svgRef}
            className="farm-plan"
            viewBox={`-2 -2 ${W + 4} ${H + 4}`}
            style={{ aspectRatio: `${W + 4} / ${H + 4}` }}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerDown={() => setSelected(null)}
            role="img"
            aria-label={`Floor layout, Phase ${phase}, ${num(W)} by ${num(H)} feet`}
          >
            {grid.map((g) => (
              <g key={g}>
                {g <= W && <line className="grid" x1={g} y1={0} x2={g} y2={H} vectorEffect="non-scaling-stroke" />}
                {g <= H && <line className="grid" x1={0} y1={g} x2={W} y2={g} vectorEffect="non-scaling-stroke" />}
              </g>
            ))}
            <rect className="shell" x={0} y={0} width={W} height={H} vectorEffect="non-scaling-stroke" />
            <text x={0} y={-0.6} fontSize={1.1}>{num(W)} ft</text>
            <text x={-1.9} y={H} fontSize={1.1} transform={`rotate(-90 -1.9 ${H})`}>{num(H)} ft</text>

            {layout.rooms.map((r) => {
              const isSel = selected?.kind === 'room' && selected.id === r.id;
              return (
                <g key={r.id}>
                  <rect className={`room ${r.kind} ${isSel ? '[stroke-width:2px]! [stroke:var(--farm-accent-hi)]!' : ''}`} x={r.x} y={r.y} width={r.w} height={r.h} vectorEffect="non-scaling-stroke" onPointerDown={(ev) => down(ev, 'room', r.id, { x: r.x, y: r.y })} />
                  <Label x={r.x} y={r.y} w={r.w} h={r.h} text={r.label} fontFt={r.kind === 'boundary' ? 0.7 : Math.min(0.9, Math.max(0.5, r.w / 14))} sub={r.kind !== 'exit' && r.kind !== 'drain' && r.kind !== 'hand_sink' && r.kind !== 'boundary' ? `${num(r.w)} × ${num(r.h)} ft · ${num(Math.round(r.w * r.h))} sq ft` : undefined} color={r.kind === 'boundary' ? 'var(--farm-accent-hi)' : undefined} />
                  {canEdit && isSel && r.kind !== 'exit' && r.kind !== 'drain' && r.kind !== 'hand_sink' && <rect className="handle" x={r.x + r.w - 1} y={r.y + r.h - 1} width={1} height={1} onPointerDown={(ev) => down(ev, 'resize', r.id, { x: r.x + r.w, y: r.y + r.h })} />}
                </g>
              );
            })}

            {showHalos && placed.map((p) => {
              const h = haloRect(p.unit, p.row);
              return h ? <rect key={`halo-${p.unit.id}`} className="halo" x={h.x} y={h.y} width={h.w} height={h.h} vectorEffect="non-scaling-stroke" /> : null;
            })}

            {placed.map((p) => {
              const r = unitRect(p.unit, p.row)!;
              const isSel = selected?.kind === 'unit' && selected.id === p.unit.id;
              const later = p.row.phase > phase;
              const cls = `unit${isSel ? ' selected' : ''}${flagged.has(p.unit.id) ? ' flagged' : ''}${later ? ' phase-later' : ''}`;
              const label = `${p.row.item}${p.row.qty > 1 ? ` (${p.unit.unit})` : ''}${later ? ` · Ph ${p.row.phase}` : ''}`;
              return (
                <g key={p.unit.id}>
                  <rect className={cls} x={r.x} y={r.y} width={r.w} height={r.h} vectorEffect="non-scaling-stroke" onPointerDown={(ev) => down(ev, 'unit', p.unit.id, { x: r.x, y: r.y })} />
                  {p.row.underHood && <line x1={r.x} y1={r.y + r.h} x2={r.x + r.w} y2={r.y + r.h} vectorEffect="non-scaling-stroke" className="[stroke:var(--farm-placeholder)]! [stroke-width:3px]!" />}
                  <Label x={r.x} y={r.y} w={r.w} h={r.h} text={label} fontFt={Math.min(0.6, Math.max(0.36, Math.min(r.w, r.h) / 7))} />
                </g>
              );
            })}
          </svg>
        </div>
        <p className="farm-kpi-sub mt-2">
          Generate arrangement replaces this phase&rsquo;s draft with a flow-order arrangement built from the register and the derived areas: receiving and storage along one band, prep, hot line and grow along the next, the cart spine, then packaging, the finished-goods cold store and harvest back to the dock wall, with the support rooms across the top and the a la carte line at the street end. Later phases&rsquo; units stand at the far end of each block inside a dashed boundary. It is an arrangement from the rules, not a designer&rsquo;s plan: it knows nothing of columns, the slab or utilities, and it is a draft until saved. Feet from the shell&rsquo;s top-left corner, snapped to half a foot. Drag a unit or a room; the corner handle resizes a selected room. A unit&rsquo;s working clearance is its zone&rsquo;s aisle at the front (the +y face, or +x when rotated), its published clearances at the sides and rear, and a walk-in&rsquo;s panel clearance and apron. The thick edge on a hot-line unit is its growing face. Dashed units are later phases&rsquo; positions reserved on this drawing. A finding names the measured figure beside the cited one.
          {!canEdit && ' Editing is limited to admins.'}
        </p>
      </Card>

      <div className="grid gap-4 mt-4 farm-autofit-20">
        <Card title="Equipment to place">
          {unplaced.length === 0 && <p className="farm-c-soft farm-fs-base">Every unit with a footprint stands on the drawing.</p>}
          {unplaced.length > 0 && (
            <>
              {canEdit && <button type="button" className="farm-btn mb-2!" onClick={placeAll}>Place all {num(unplaced.length)} in flow order</button>}
              <div className="farm-scroll-x max-h-88! overflow-y-auto!">
                <table className="farm-table compact">
                  <thead><tr><th>Unit</th><th>Zone</th><th className="num">ft</th><th /></tr></thead>
                  <tbody>
                    {unplaced.map(({ row, unit }) => {
                      const s = unitSizeFt(row, 0)!;
                      return (
                        <tr key={`${row.key}#${unit}`} className={`${row.phase > phase ? 'farm-c-soft' : ''}`}>
                          <td className="farm-fs-sm">{row.item}{row.qty > 1 ? ` (${unit})` : ''}{row.phase > phase ? <span className="farm-c-faint farm-fs-xs"> · Ph {row.phase}</span> : null}</td>
                          <td className="farm-fs-xs">{row.zone}</td>
                          <td className="num farm-fs-xs whitespace-nowrap!">{s.w.toFixed(1)} × {s.h.toFixed(1)}</td>
                          <td>{canEdit && <button type="button" className="farm-btn ghost py-[0.15rem]! px-2!" onClick={() => place(row, unit)}>Place</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        <Card title="Rooms and markers">
          {canEdit && (
            <div className="flex flex-wrap gap-[0.4rem] items-center mb-[0.6rem]!">
              <select className="farm-input farm-cell-control w-32!" value={newRoom.kind} aria-label="Kind of room or marker to add" onChange={(ev) => setNewRoom((n) => ({ ...n, kind: ev.target.value as RoomKind, zone: '', supportKey: '' }))}>
                {(Object.keys(ROOM_KIND_LABELS) as RoomKind[]).map((k) => <option key={k} value={k}>{ROOM_KIND_LABELS[k]}</option>)}
              </select>
              {newRoom.kind === 'room' && (
                <>
                  <select className="farm-input farm-cell-control w-36!" value={newRoom.zone} aria-label="Zone the room belongs to" onChange={(ev) => setNewRoom((n) => ({ ...n, zone: ev.target.value as FacilityZone | '', supportKey: '' }))}>
                    <option value="">Zone…</option>
                    {FACILITY_ZONES.filter((z) => z !== 'Warewash').map((z) => <option key={z} value={z}>{z}</option>)}
                  </select>
                  <select className="farm-input farm-cell-control w-48!" value={newRoom.supportKey} aria-label="Support-program room" onChange={(ev) => setNewRoom((n) => ({ ...n, supportKey: ev.target.value, zone: '' }))}>
                    <option value="">Support room…</option>
                    {SUPPORT_ALLOWANCES.map((a) => <option key={a.key} value={a.key}>{a.space}</option>)}
                  </select>
                </>
              )}
              <input className="farm-input farm-cell-control w-40!" placeholder="Label" value={newRoom.label} aria-label="Label" onChange={(ev) => setNewRoom((n) => ({ ...n, label: ev.target.value }))} />
              <button type="button" className="farm-btn" onClick={addRoom}>Add</button>
            </div>
          )}
          {selectedRoom && (
            <div className="flex flex-wrap gap-[0.4rem] items-center mb-[0.6rem]! p-2 border border-[color:var(--farm-line)] rounded-[var(--farm-r-sm)]">
              <span className="farm-fs-sm font-semibold">{ROOM_KIND_LABELS[selectedRoom.kind]}</span>
              <input className="farm-input farm-cell-control w-44!" value={selectedRoom.label} disabled={!canEdit} aria-label="Selected room label" onChange={(ev) => relabel(selectedRoom.id, ev.target.value)} />
              <input type="number" className="farm-input farm-cell-control w-20!" min={0.5} step={0.5} value={selectedRoom.w} disabled={!canEdit} aria-label="Selected room width in feet" onChange={(ev) => resize(selectedRoom.id, { w: Math.max(0.5, Number(ev.target.value) || 0.5) })} />
              <span className="farm-c-faint farm-fs-xs">×</span>
              <input type="number" className="farm-input farm-cell-control w-20!" min={0.5} step={0.5} value={selectedRoom.h} disabled={!canEdit} aria-label="Selected room depth in feet" onChange={(ev) => resize(selectedRoom.id, { h: Math.max(0.5, Number(ev.target.value) || 0.5) })} />
              <span className="farm-c-faint farm-fs-xs">ft · {num(Math.round(selectedRoom.w * selectedRoom.h))} sq ft</span>
            </div>
          )}
          {selectedUnit && (
            <p className="farm-fs-sm mb-[0.6rem]!">
              <span className="font-semibold">{selectedUnit.row.item}</span>{selectedUnit.row.qty > 1 ? ` (${selectedUnit.unit.unit})` : ''} · {selectedUnit.rect.w.toFixed(2)} × {selectedUnit.rect.h.toFixed(2)} ft at ({selectedUnit.rect.x}, {selectedUnit.rect.y}) · {selectedUnit.row.zone} · {selectedUnit.row.source ?? ''}
            </p>
          )}
          <div className="farm-scroll-x max-h-72! overflow-y-auto!">
            <table className="farm-table compact">
              <thead><tr><th>Drawn</th><th>Kind</th><th className="num">ft</th><th className="num">sq ft</th></tr></thead>
              <tbody>
                {layout.rooms.length === 0 && <tr><td colSpan={4} className="farm-c-soft">Nothing drawn. Rooms take their default size from the support allowance or the zone gross; the spine from the derived spine; a hood from the phase&rsquo;s run length.</td></tr>}
                {layout.rooms.map((r) => (
                  <tr key={r.id} className={`${selected?.kind === 'room' && selected.id === r.id ? 'farm-c-accent-hi' : ''}`} onClick={() => setSelected({ kind: 'room', id: r.id })}>
                    <td className="farm-fs-sm cursor-pointer!">{r.label}</td>
                    <td className="farm-fs-xs">{ROOM_KIND_LABELS[r.kind]}</td>
                    <td className="num farm-fs-xs whitespace-nowrap!">{num(r.w)} × {num(r.h)}</td>
                    <td className="num farm-fs-xs">{num(Math.round(r.w * r.h))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Findings on the drawing" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead><tr><th>Item</th><th>Check</th><th>Finding</th></tr></thead>
            <tbody>
              {findings.length === 0 && <tr><td colSpan={3} className="farm-c-soft">Nothing to report: place units and draw the spine, hood, exits, drains and hand sinks and the checks run on them.</td></tr>}
              {findings.map((f, i) => (
                <tr key={i} className={`${f.severity === 'limit' ? '' : 'farm-c-soft'}`}>
                  <td className="farm-mono farm-fs-xs whitespace-nowrap!">{f.item}</td>
                  <td className={`farm-fs-xs whitespace-nowrap! ${(f.severity === 'limit' ? 'farm-c-over' : 'farm-c-faint')}`}>{f.severity === 'limit' ? 'Against a limit' : 'Measured'}</td>
                  <td className={`farm-fs-sm ${(f.subjectIds.length ? 'cursor-pointer!' : '')}`} onClick={() => f.subjectIds[0] && setSelected(layout.units.some((u) => u.id === f.subjectIds[0]) ? { kind: 'unit', id: f.subjectIds[0] } : { kind: 'room', id: f.subjectIds[0] })}>{f.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">Each check answers the register item it names (Conformance tab). Aisles are measured between footprints that face each other; egress is a straight line, not a travel path; the two-stream check reads both racks against the hot line&rsquo;s centre. Nothing here is a finish schedule, a fixture count or a plan review.</p>
      </Card>

      <Card title="Measured against derived" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead><tr><th>Figure</th><th className="num">Drawn</th><th className="num">Derived</th><th className="num">Gap</th></tr></thead>
            <tbody>
              {measured.zones.map((z) => (
                <tr key={z.zone}>
                  <td>{z.zone} zone</td>
                  <td className="num">{num(Math.round(z.measuredSqFt))}</td>
                  <td className="num">{num(Math.round(z.derivedSqFt))}</td>
                  <td className={`num ${z.measuredSqFt && z.measuredSqFt < z.derivedSqFt ? 'farm-c-over' : ''}`}>{z.measuredSqFt ? (z.measuredSqFt - z.derivedSqFt >= 0 ? '+' : '') + num(Math.round(z.measuredSqFt - z.derivedSqFt)) : '—'}</td>
                </tr>
              ))}
              <tr><td>Cart spine, length</td><td className="num">{num(Math.round(measured.spineFt))} ft</td><td className="num">{num(Math.round(measured.derived.spineFt))} ft</td><td className="num">{measured.spineFt ? num(Math.round(measured.spineFt - measured.derived.spineFt)) : '—'}</td></tr>
              <tr className="total"><td>Production floor</td><td className="num">{num(Math.round(measured.productionFloorSqFt))}</td><td className="num">{num(Math.round(measured.derived.productionFloorSqFt))}</td><td className="num">{measured.productionFloorSqFt ? num(Math.round(measured.productionFloorSqFt - measured.derived.productionFloorSqFt)) : '—'}</td></tr>
              {measured.support.map((s) => {
                const line = derived.support.lines.find((l) => l.key === s.supportKey);
                return line ? <tr key={s.supportKey}><td>{line.space}</td><td className="num">{num(Math.round(s.measuredSqFt))}</td><td className="num">{num(Math.round(line.netSqFt))} net</td><td className="num">{num(Math.round(s.measuredSqFt - line.netSqFt))}</td></tr> : null;
              })}
              <tr className="total"><td>Shell</td><td className="num">{num(W * H)}</td><td className="num">{num(Math.round(derived.buildingGrossSqFt))}</td><td className="num">{num(Math.round(W * H - derived.buildingGrossSqFt))}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">Derived figures come from the Space tab&rsquo;s factors; drawn figures are the rooms on this drawing. Once a room is drawn its area replaces the factor as the figure of record for that zone, and the gap is the finding. Mechanical and electrical rooms have no derived allowance; draw them and they count in the shell only.</p>
      </Card>
    </>
  );
}
