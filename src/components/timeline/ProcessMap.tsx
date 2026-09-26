'use client';

/**
 * MicroFarm — the process map (scheduler build plan §5.1): a crop plan's route as
 * a DAG. Columns are precedence depth, so steps drawn in one column may run
 * alongside each other; the lines are the finish-to-start edges. Nodes are
 * buttons: picking one opens it for editing in the scenario.
 *
 * The nodes are HTML so their text wraps and reads; only the edges are SVG,
 * drawn over them. No icons and no decoration.
 */

import { useId } from 'react';

export interface ProcessNode {
  id: string;
  column: number;
  label: string;
  /** Unit, crew and duration — the three things the map answers at a glance. */
  lines: string[];
  /** Sowing or harvest; the two streams are drawn apart. */
  group: string;
  edited?: boolean;
  flagged?: boolean;
}

export interface ProcessEdge {
  fromId: string;
  toId: string;
}

const NODE_W = 172;
const NODE_H = 62;
const GAP_X = 40;
const GAP_Y = 14;

export function ProcessMap({
  nodes,
  edges,
  selectedId,
  onSelect,
}: {
  nodes: ProcessNode[];
  edges: ProcessEdge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const id = useId();
  const columns = [...new Set(nodes.map((n) => n.column))].sort((a, b) => a - b);
  const place = new Map<string, { x: number; y: number }>();
  for (const c of columns) {
    nodes
      .filter((n) => n.column === c)
      .forEach((n, row) => place.set(n.id, { x: columns.indexOf(c) * (NODE_W + GAP_X), y: row * (NODE_H + GAP_Y) }));
  }
  const rows = Math.max(1, ...columns.map((c) => nodes.filter((n) => n.column === c).length));
  const width = Math.max(NODE_W, columns.length * (NODE_W + GAP_X) - GAP_X);
  const height = rows * (NODE_H + GAP_Y) - GAP_Y;

  return (
    <div className="farm-scroll-x">
      <div className="relative min-w-full" style={{ width: `${width}px`, height: `${height}px` }}>
        <svg aria-hidden className="absolute! inset-0! pointer-events-none!" style={{ width: `${width}px`, height: `${height}px` }}>
          <defs>
            <marker id={`${id}-head`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill="var(--farm-ink-faint)" />
            </marker>
          </defs>
          {edges.map((e) => {
            const a = place.get(e.fromId);
            const b = place.get(e.toId);
            if (!a || !b) return null;
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const mid = x1 + Math.max(12, (x2 - x1) / 2);
            return (
              <path
                key={`${e.fromId}->${e.toId}`}
                d={`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`}
                fill="none"
                stroke="var(--farm-ink-faint)"
                strokeWidth="1"
                markerEnd={`url(#${id}-head)`}
              />
            );
          })}
        </svg>
        {nodes.map((n) => {
          const p = place.get(n.id)!;
          const selected = n.id === selectedId;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelect(n.id)}
              aria-pressed={selected}
              className={`absolute! text-left! py-[0.3rem]! px-[0.45rem]! rounded-[0.35rem]! farm-c-ink [font:inherit]! cursor-pointer! overflow-hidden! ${(selected ? 'bg-[color:var(--farm-accent-wash)]!' : 'bg-[color:var(--farm-surface-2)]!')}`} style={{ left: `${p.x}px`, top: `${p.y}px`, width: `${NODE_W}px`, height: `${NODE_H}px`, border: n.flagged ? '2px solid var(--farm-accent)' : `1px solid ${selected ? 'var(--farm-ink)' : 'var(--farm-line)'}` }}
            >
              <span className="farm-fs-xs font-semibold block whitespace-nowrap overflow-hidden [text-overflow:ellipsis]">
                {n.label}
                {n.edited ? ' ·' : ''}
              </span>
              {n.lines.map((l) => (
                <span key={l} className="farm-fs-2xs farm-c-faint block whitespace-nowrap overflow-hidden [text-overflow:ellipsis]">
                  {l}
                </span>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
