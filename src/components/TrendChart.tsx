'use client';

import { useMemo, useRef, useState } from 'react';

/**
 * MicroFarm — a single-series trend line over dated points.
 *
 * One series, one axis, so no legend: the card title names what is plotted.
 * 2px line, 8px markers with a 2px surface ring, hairline recessive grid, the
 * last value labelled at the line end. Hover or focus snaps a crosshair to the
 * nearest point and shows its value and date; arrow keys step through points.
 * The table view is the log the chart is drawn from.
 */

export interface TrendChartPoint {
  id: string;
  date: string;
  value: number;
}

const W = 560;
const H = 190;
const M = { l: 48, r: 60, t: 14, b: 28 };

function niceCeiling(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function TrendChart({ points, label, format }: { points: readonly TrendChartPoint[]; label: string; format: (v: number) => string }) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const geo = useMemo(() => {
    const times = points.map((p) => Date.parse(`${p.date}T00:00:00Z`));
    const t0 = Math.min(...times);
    const t1 = Math.max(...times);
    const yMax = niceCeiling(Math.max(0, ...points.map((p) => p.value)) * 1.1);
    const plotW = W - M.l - M.r;
    const x = (ms: number) => (t1 === t0 ? M.l + plotW / 2 : M.l + ((ms - t0) / (t1 - t0)) * plotW);
    const y = (v: number) => M.t + (1 - v / yMax) * (H - M.t - M.b);
    return { xs: times.map(x), ys: points.map((p) => y(p.value)), yMax, y };
  }, [points]);

  if (points.length === 0) return <p className="farm-kpi-sub">No dated study yet.</p>;

  const last = points.length - 1;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * geo.yMax);
  const path = geo.xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${geo.ys[i]!.toFixed(1)}`).join(' ');
  const hover = active === null ? null : { x: geo.xs[active]!, p: points[active]! };

  const snapTo = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const px = ((clientX - box.left) / box.width) * W;
    let best = 0;
    geo.xs.forEach((x, i) => {
      if (Math.abs(x - px) < Math.abs(geo.xs[best]! - px)) best = i;
    });
    setActive(best);
  };

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`${label}: ${points.map((p) => `${p.date}, ${format(p.value)}`).join('; ')}`}
        tabIndex={0}
        onPointerMove={(e) => snapTo(e.clientX)}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(last)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, (i ?? last) - 1));
          if (e.key === 'ArrowRight') setActive((i) => Math.min(last, (i ?? 0) + 1));
        }}
        className="block! [outline:none]! [touch-action:none]!"
      >
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={M.l} x2={W - M.r} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--farm-line)" strokeWidth={1} />
            <text x={M.l - 6} y={geo.y(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--farm-ink-faint)">{format(v)}</text>
          </g>
        ))}
        <text x={M.l} y={H - 8} fontSize={10} fill="var(--farm-ink-faint)">{points[0]!.date}</text>
        {last > 0 && <text x={W - M.r} y={H - 8} textAnchor="end" fontSize={10} fill="var(--farm-ink-faint)">{points[last]!.date}</text>}
        {hover && <line x1={hover.x} x2={hover.x} y1={M.t} y2={H - M.b} stroke="var(--farm-ink-faint)" strokeWidth={1} />}
        <path d={path} fill="none" stroke="var(--farm-accent-hi)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {geo.xs.map((x, i) => (
          <circle key={points[i]!.id} cx={x} cy={geo.ys[i]} r={i === active ? 5 : 4} fill="var(--farm-accent-hi)" stroke="var(--farm-surface)" strokeWidth={2} />
        ))}
        <text x={geo.xs[last]! + 9} y={geo.ys[last]} dominantBaseline="middle" fontSize={11} fill="var(--farm-ink)">{format(points[last]!.value)}</text>
      </svg>
      {hover && (
        <div
          role="status"
          className="absolute top-0 bg-[color:var(--farm-surface-2)] border border-[color:var(--farm-line)] rounded-[0.35rem] py-[0.3rem] px-2 pointer-events-none whitespace-nowrap farm-fs-xs" style={{ left: `${(hover.x / W) * 100}%`, transform: hover.x > W * 0.6 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)' }}
        >
          <div className="font-bold farm-c-ink">{format(hover.p.value)}</div>
          <div className="farm-c-soft">{hover.p.date}</div>
        </div>
      )}
    </div>
  );
}
