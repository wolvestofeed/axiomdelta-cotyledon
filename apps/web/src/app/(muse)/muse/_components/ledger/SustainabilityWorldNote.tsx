'use client';

import Link from 'next/link';
import { num } from '../ui';
import type { useSustainabilityWorld } from '../../_state/sustainability';

/**
 * Which world a Sustainability page runs in and over what period (Roadmap N6 slice 4),
 * with the gaps the figures carry named: meals with no recipe, and recipes whose
 * ingredients have no food factor mapping.
 */
export function SustainabilityWorldNote({ world, children }: { world: ReturnType<typeof useSustainabilityWorld>; children?: React.ReactNode }) {
  const { basis, food } = world;
  return (
    <div
      className="mb-4 border! border-[color:var(--muse-line)]! bg-[color:var(--muse-surface-2)]! rounded-[0.6rem]! py-[0.6rem]! px-[1.1rem]! muse-fs-sm muse-c-soft"
      role="status"
    >
      {world.isPlan ? (
        <>
          <strong className="muse-c-ink">Plan</strong> — the open forecast&rsquo;s own run over its first year, {basis.from} to {basis.to}: the meals its customers are served, its batches and its purchases, with the quantities loaded into the forecast. A forecast carries no refrigerant leaks. Nothing is recorded here; switch to Actual in the scenario bar to enter bills and service records.
        </>
      ) : (
        <>
          <strong className="muse-c-ink">Actual</strong> — the records in reporting year {basis.from.slice(0, 4)}: batch records, receipts, deliveries, utility bills, lab results and refrigerant service tickets. The reporting year is set on <Link className="muse-link" href="/muse/sustainability/inventory">Inventory &amp; Audit</Link>.
        </>
      )}
      {world.pending && <> Recomputing…</>}
      {world.error && <span className="muse-c-over"> {world.error}</span>}
      {food.mealsNotCosted > 0 && <div className="mt-1">{num(food.mealsNotCosted)} meal{food.mealsNotCosted === 1 ? '' : 's'} delivered with no recipe named: counted in meals, not in food or mass.</div>}
      {food.recipesWithUnmappedLines.length > 0 && (
        <div className="mt-1">
          Ingredients with no mapping to a study product carry no food footprint: {food.recipesWithUnmappedLines.map((r) => `${r.code} (${r.unmapped.length} line${r.unmapped.length === 1 ? '' : 's'}, ${num(r.meals)} meals)`).join(' · ')}.
        </div>
      )}
      {children}
    </div>
  );
}
