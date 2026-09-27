'use client';

import Link from 'next/link';
import { num } from '@/components/ui';
import type { useSustainabilityWorld } from '@/state/sustainability';

/**
 * Which world a Sustainability page runs in and over what period (Roadmap N6 slice 4),
 * with the gaps the figures carry named: units with no grow plan, and grow plans whose
 * inputs have no food factor mapping.
 */
export function SustainabilityWorldNote({ world, children }: { world: ReturnType<typeof useSustainabilityWorld>; children?: React.ReactNode }) {
  const { basis, food } = world;
  return (
    <div
      className="mb-4 border! border-[color:var(--farm-line)]! bg-[color:var(--farm-surface-2)]! rounded-[0.6rem]! py-[0.6rem]! px-[1.1rem]! farm-fs-sm farm-c-soft"
      role="status"
    >
      {world.isPlan ? (
        <>
          <strong className="farm-c-ink">Plan</strong> — the open forecast&rsquo;s own run over its first year, {basis.from} to {basis.to}: the units its subscribers are served, its sowings and its purchases, with the quantities loaded into the forecast. A forecast carries no refrigerant leaks. Nothing is recorded here; switch to Actual in the scenario bar to enter bills and service records.
        </>
      ) : (
        <>
          <strong className="farm-c-ink">Actual</strong> — the records in reporting year {basis.from.slice(0, 4)}: sowing records, receipts, distributions, utility bills, lab results and refrigerant service tickets. The reporting year is set on <Link className="farm-link" href="/farm/sustainability/inventory">Inventory &amp; Audit</Link>.
        </>
      )}
      {world.pending && <> Recomputing…</>}
      {world.error && <span className="farm-c-over"> {world.error}</span>}
      {food.unitsNotCosted > 0 && <div className="mt-1">{num(food.unitsNotCosted)} unit{food.unitsNotCosted === 1 ? '' : 's'} distributed with no grow plan named: counted in units, not in food or mass.</div>}
      {food.growPlansWithUnmappedLines.length > 0 && (
        <div className="mt-1">
          Inputs with no mapping to a study product carry no food footprint: {food.growPlansWithUnmappedLines.map((r) => `${r.code} (${r.unmapped.length} line${r.unmapped.length === 1 ? '' : 's'}, ${num(r.units)} units)`).join(' · ')}.
        </div>
      )}
      {children}
    </div>
  );
}
