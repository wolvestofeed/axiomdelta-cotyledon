'use client';

import { money, num } from '@/components/ui';
import type { CompareRow } from '@/engine/compare';

/**
 * The side-by-side table both Compare tabs render: measure, A, B, Δ, what it
 * means. A bold Δ marks a row where more or less is plainly the direction; the
 * rest are facts. The rows come off an engine comparison; nothing is computed
 * here beyond formatting.
 */

const hrs = (h: number) => (Math.round(h * 10) / 10).toFixed(1);

export function cell(row: CompareRow, side: 'a' | 'b'): string {
  const v = side === 'a' ? row.a : row.b;
  if (v === null) return '—';
  if (typeof v === 'string') return v;
  switch (row.format) {
    case 'percent':
      return `${num(v * 100, 0)}%`;
    case 'hours':
      return `${hrs(v)} h`;
    case 'minutes':
      return `${num(v, v < 10 ? 2 : 0)} min`;
    case 'dollars':
      return money(v);
    case 'pounds':
      return `${num(v, 1)} lb`;
    default:
      return num(v);
  }
}

export function delta(row: CompareRow): string {
  if (row.delta === null) return row.a === row.b ? 'Same' : 'Changed';
  if (Math.abs(row.delta) < 1e-9) return '—';
  const sign = row.delta > 0 ? '+' : '−';
  const size = Math.abs(row.delta);
  switch (row.format) {
    case 'percent':
      return `${sign}${num(size * 100, 0)} pts`;
    case 'hours':
      return `${sign}${hrs(size)} h`;
    case 'minutes':
      return `${sign}${num(size, size < 10 ? 2 : 0)} min`;
    case 'dollars':
      return `${sign}${money(size)}`;
    case 'pounds':
      return `${sign}${num(size, 1)} lb`;
    default:
      return `${sign}${num(size)}`;
  }
}

export function CompareTable({ rows, labelA, labelB }: { rows: CompareRow[]; labelA: string; labelB: string }) {
  return (
    <div className="farm-scroll-x">
      <table className="farm-table">
        <thead>
          <tr>
            <th>Measure</th>
            <th className="num">{labelA}</th>
            <th className="num">{labelB}</th>
            <th className="num">Δ</th>
            <th>What it means</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="font-medium!">{r.label}</td>
              <td className="num">{cell(r, 'a')}</td>
              <td className="num">{cell(r, 'b')}</td>
              <td className={`num ${r.better === 'a' || r.better === 'b' ? 'font-semibold!' : ''}`}>{delta(r)}</td>
              <td className="farm-c-soft">{r.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
