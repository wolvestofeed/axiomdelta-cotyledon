'use client';

/**
 * Cotyledon — the timeline primitives (scheduler build plan §5.1).
 *
 * A grid with a sticky lane column and a scrolling track, blocks placed on a
 * time scale, precedence arrows drawn over them, and a crew load strip. No
 * icons and no decorative SVG: the only SVG is the arrows, which carry
 * precedence, and every chart is paired with its own table by the page.
 */

import { Fragment, useId, type ReactNode } from 'react';
import { hhmm, laneRows, type TimeScale } from '@/components/timeline/scale';

export interface TimelineBlock {
  id: string;
  startMin: number;
  endMin: number;
  label: string;
  /** A CSS colour; muted draws the outline only, for an unattended stage. */
  color: string;
  muted?: boolean;
  /** Outlined in the accent when a violation touches it. */
  flagged?: boolean;
  title?: string;
}

export interface TimelineLane {
  id: string;
  label: string;
  sub?: string;
  blocks: TimelineBlock[];
}

const ROW_REM = 1.6;

export function TimelineAxis({ scale }: { scale: TimeScale }) {
  return (
    <div className="relative h-4">
      {scale.ticks.map((t) => (
        <span key={t} className="absolute farm-fs-2xs farm-c-faint [transform:translateX(-50%)]" style={{ left: `${scale.pos(t)}%` }}>
          {hhmm(t)}
        </span>
      ))}
    </div>
  );
}

function Track({ scale, children, height }: { scale: TimeScale; children?: ReactNode; height: number }) {
  return (
    <div className="relative bg-[color:var(--farm-surface-2)] border border-[color:var(--farm-line)] rounded-[0.3rem]" style={{ height: `${height}rem` }}>
      {scale.ticks.map((t) => (
        <span key={t} className="absolute top-0 bottom-0 w-[1px] bg-[color:var(--farm-line)]" style={{ left: `${scale.pos(t)}%` }} />
      ))}
      {children}
    </div>
  );
}

function Block({ scale, block, row }: { scale: TimeScale; block: TimelineBlock; row: number }) {
  return (
    <div
      id={block.id}
      title={block.title ?? block.label}
      className={`absolute rounded-[0.25rem] farm-fs-2xs font-semibold flex items-center pl-[0.3rem] overflow-hidden whitespace-nowrap ${(block.muted ? 'farm-c-soft' : 'farm-c-strong')}`} style={{ left: `${scale.pos(block.startMin)}%`, width: `${Math.max(scale.width(block.startMin, block.endMin), 0.4)}%`, top: `${row * ROW_REM + 0.12}rem`, height: `${ROW_REM - 0.24}rem`, background: block.muted ? 'transparent' : block.color, border: block.muted ? `1px dashed ${block.color}` : block.flagged ? '2px solid var(--farm-accent)' : undefined }}
    >
      {block.label}
    </div>
  );
}

/**
 * Lanes of blocks against one scale. `laneColumn` is the sticky left column's
 * width; the track scrolls with the page, not on its own, so the arrows stay
 * aligned with the blocks.
 */
export function TimelineGrid({ scale, lanes, laneColumn = '13rem', arrows }: { scale: TimeScale; lanes: TimelineLane[]; laneColumn?: string; arrows?: { fromId: string; toId: string }[] }) {
  const id = useId();
  const packed = lanes.map((lane) => ({ lane, rows: laneRows(lane.blocks) }));
  const rowsBefore = new Map<string, number>();
  let acc = 0;
  for (const { lane, rows } of packed) {
    rowsBefore.set(lane.id, acc);
    acc += Math.max(1, rows.length);
  }
  const totalRows = Math.max(1, acc);
  const place = new Map<string, { row: number; startMin: number; endMin: number }>();
  for (const { lane, rows } of packed) {
    rows.forEach((row, i) => {
      for (const b of row) place.set(b.id, { row: (rowsBefore.get(lane.id) ?? 0) + i, startMin: b.startMin, endMin: b.endMin });
    });
  }
  return (
    <div className="relative">
      <div className="grid gap-[0.6rem] mb-[0.3rem]!" style={{ gridTemplateColumns: `${laneColumn} 1fr` }}>
        <div />
        <TimelineAxis scale={scale} />
      </div>
      <div className="relative grid gap-[0.6rem]" style={{ gridTemplateColumns: `${laneColumn} 1fr` }}>
        <div>
          {packed.map(({ lane, rows }) => (
            <div key={lane.id} className="flex flex-col justify-center farm-fs-xs font-medium" style={{ height: `${Math.max(1, rows.length) * ROW_REM}rem` }}>
              {lane.label}
              {lane.sub ? <span className="farm-c-faint farm-fs-2xs font-normal">{lane.sub}</span> : null}
            </div>
          ))}
        </div>
        <div className="relative">
          <Track scale={scale} height={totalRows * ROW_REM}>
            {packed.map(({ lane, rows }) => (
              <Fragment key={lane.id}>
                {rows.map((row, i) => row.map((b) => <Block key={b.id} scale={scale} block={b} row={(rowsBefore.get(lane.id) ?? 0) + i} />))}
              </Fragment>
            ))}
          </Track>
          {arrows && arrows.length > 0 && (
            <svg aria-hidden className="absolute! inset-0! w-full! h-full! pointer-events-none!" preserveAspectRatio="none">
              <defs>
                <marker id={`${id}-head`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 z" fill="var(--farm-ink-faint)" />
                </marker>
              </defs>
              {arrows.map((a) => {
                const from = place.get(a.fromId);
                const to = place.get(a.toId);
                if (!from || !to) return null;
                const x1 = scale.pos(from.endMin);
                const y1 = (from.row + 0.5) * ROW_REM;
                const x2 = scale.pos(to.startMin);
                const y2 = (to.row + 0.5) * ROW_REM;
                return <line key={`${a.fromId}->${a.toId}`} x1={`${x1}%`} y1={`${y1}rem`} x2={`${x2}%`} y2={`${y2}rem`} stroke="var(--farm-ink-faint)" strokeWidth="1" markerEnd={`url(#${id}-head)`} />;
              })}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

export interface CrewLoadBucket {
  startMin: number;
  endMin: number;
  /** People the placed work needs at once. */
  required: number;
  /** People the proposed crews have on the floor. */
  scheduled: number;
}

/**
 * Crew demand against the people scheduled, bucket by bucket. The bar is the
 * requirement; the line behind it is what is scheduled. A bucket short of
 * people is drawn in the accent, and the page tables the same numbers.
 */
export function CrewLoadStrip({ scale, buckets, heightRem = 4 }: { scale: TimeScale; buckets: CrewLoadBucket[]; heightRem?: number }) {
  const peak = Math.max(1, ...buckets.map((b) => Math.max(b.required, b.scheduled)));
  return (
    <div className="relative bg-[color:var(--farm-surface-2)] border border-[color:var(--farm-line)] rounded-[0.3rem]" style={{ height: `${heightRem}rem` }}>
      {buckets.map((b) => {
        const short = b.required > b.scheduled;
        return (
          <Fragment key={b.startMin}>
            <div
              title={`${hhmm(b.startMin)}–${hhmm(b.endMin)}: ${b.required} needed, ${b.scheduled} scheduled`}
              className={`absolute bottom-0 ${(short ? 'bg-[color:var(--farm-accent)]' : 'bg-[color:var(--farm-olive)]')}`} style={{ left: `${scale.pos(b.startMin)}%`, width: `${Math.max(scale.width(b.startMin, b.endMin), 0.2)}%`, height: `${(b.required / peak) * 100}%` }}
            />
            <div
              className="absolute h-[1px] bg-[color:var(--farm-ink)]" style={{ left: `${scale.pos(b.startMin)}%`, width: `${Math.max(scale.width(b.startMin, b.endMin), 0.2)}%`, bottom: `${(b.scheduled / peak) * 100}%` }}
            />
          </Fragment>
        );
      })}
    </div>
  );
}
