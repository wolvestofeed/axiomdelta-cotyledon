/**
 * Cotyledon — the timeline primitives' arithmetic (scheduler build plan §5.1). Pure.
 *
 * A time scale maps minutes from midnight onto a track, and lane packing puts
 * blocks that overlap on separate rows so nothing is drawn on top of anything
 * else. Kept out of the components so it can be tested without a browser.
 */

export type Granularity = '15min' | 'hour' | 'day';

const STEP: Record<Granularity, number> = { '15min': 15, hour: 60, day: 24 * 60 };

export interface TimeScale {
  startMin: number;
  endMin: number;
  minutes: number;
  /** Tick marks across the span, at the granularity's step. */
  ticks: number[];
  /** Percent across the track, clamped to the span. */
  pos: (min: number) => number;
  /** Percent of the track between two minutes, clamped and never negative. */
  width: (a: number, b: number) => number;
}

/** A scale over [startMin, endMin], rounded out to whole steps and never empty. */
export function timeScale(startMin: number, endMin: number, granularity: Granularity = 'hour'): TimeScale {
  const step = STEP[granularity];
  const start = Math.floor(startMin / step) * step;
  const end = Math.max(start + step, Math.ceil(endMin / step) * step);
  const minutes = end - start;
  const ticks = Array.from({ length: Math.round(minutes / step) + 1 }, (_, i) => start + i * step);
  const clamp = (m: number) => Math.min(end, Math.max(start, m));
  return {
    startMin: start,
    endMin: end,
    minutes,
    ticks,
    pos: (m) => ((clamp(m) - start) / minutes) * 100,
    width: (a, b) => Math.max(0, ((clamp(b) - clamp(a)) / minutes) * 100),
  };
}

/** The span a set of blocks covers, with a fallback when there is nothing to show. */
export function spanOf(blocks: readonly { startMin: number; endMin: number }[], fallback: { startMin: number; endMin: number }): { startMin: number; endMin: number } {
  if (blocks.length === 0) return fallback;
  return {
    startMin: Math.min(fallback.startMin, ...blocks.map((b) => b.startMin)),
    endMin: Math.max(fallback.endMin, ...blocks.map((b) => b.endMin)),
  };
}

/**
 * Pack blocks into rows so no two in a row overlap: earliest first, each block
 * on the first row whose last block has finished. One row is the common case;
 * a resource with concurrent slots gets as many rows as it runs at once.
 */
export function laneRows<T extends { startMin: number; endMin: number }>(blocks: readonly T[]): T[][] {
  const rows: T[][] = [];
  for (const b of [...blocks].sort((x, y) => x.startMin - y.startMin || x.endMin - y.endMin)) {
    const row = rows.find((r) => (r[r.length - 1]?.endMin ?? -Infinity) <= b.startMin + 1e-9);
    if (row) row.push(b);
    else rows.push([b]);
  }
  return rows;
}

/** Minutes as HH:MM, for axis ticks and table cells. */
export const hhmm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
