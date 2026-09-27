'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, money } from '@/components/ui';
import { InlineNumber } from '@/components/InlineCells';
import { PACKAGE_COST_BASIS_LABELS, PACKAGE_TEMPERATURE_LABELS, packageSizeLabel, packagingOrder, growPlanPackagingCost } from '@/engine/packaging';
import { useScenario } from '@/state/scenario-store';
import { addGrowPlanPackage, removeGrowPlanPackage, updateGrowPlanPackage } from '@/server/packaging-actions';

type ActionResult = { ok: true } | { ok: false; error: string };

/** The packages a grow plan picks from the packaging library, and its packaging per unit (Roadmap N1). */
export function GrowPlanPackagingCard({ growPlanCode, growPlanId, growPlanChannels }: { growPlanCode: string; growPlanId: string | undefined; growPlanChannels: readonly number[] }) {
  const { resolved, isSuperAdmin } = useScenario();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState('');
  const [qty, setQty] = useState('1');

  const lib = resolved.packaging;
  const cost = growPlanPackagingCost(growPlanCode, lib);
  const picked = new Set(cost.lines.map((l) => l.pick.packageId));
  const onChannel = (channels: readonly number[]) => channels.some((c) => growPlanChannels.includes(c));
  const options = lib.packages.filter((p) => !picked.has(p.id)).sort((a, b) => Number(!onChannel(a.channels)) - Number(!onChannel(b.channels)) || packagingOrder(a, b));
  const canEdit = isSuperAdmin && !!growPlanId && !pending;

  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        after?.();
        router.refresh();
      }
    });

  const add = () => {
    const n = Number(qty);
    if (!growPlanId || !choice || !Number.isFinite(n) || n <= 0) return;
    run(() => addGrowPlanPackage({ growPlanId, packageId: choice, qtyPerUnit: n }), () => {
      setChoice('');
      setQty('1');
    });
  };

  return (
    <Card title={`Packaging — ${growPlanCode}`} className="mt-4">
      {cost.lines.length === 0 ? (
        <p className="farm-kpi-sub">No packages picked for this growPlan. Packaging per unit: {money(0, 4)}.</p>
      ) : (
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead>
              <tr>
                <th>Package</th>
                <th>Hot/Cold</th>
                <th>Material</th>
                <th>Size</th>
                <th className="num">Per unit</th>
                <th className="num">Unit cost</th>
                <th className="num">Cost per unit</th>
                {isSuperAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {cost.lines.map((l) => (
                <tr key={l.pick.id}>
                  <td className="font-medium!">{l.pkg?.name ?? 'Package no longer in the library'}</td>
                  <td>{l.pkg?.temperature ? PACKAGE_TEMPERATURE_LABELS[l.pkg.temperature] : '–'}</td>
                  <td>{l.pkg?.material ?? '—'}</td>
                  <td>{l.pkg ? packageSizeLabel(l.pkg) : '—'}</td>
                  <td className="num">
                    <InlineNumber value={l.pick.qtyPerUnit} step={1} minChars={2} disabled={!canEdit} label={`${l.pkg?.name ?? 'Package'} per unit`} onCommit={(n) => n !== null && n > 0 && run(() => updateGrowPlanPackage({ id: l.pick.id, qtyPerUnit: n }))} />
                  </td>
                  <td className="num">
                    {money(l.unit.cost ?? 0, 4)}
                    <div className="farm-c-faint farm-fs-xs">{PACKAGE_COST_BASIS_LABELS[l.unit.basis]}</div>
                  </td>
                  <td className="num">{money(l.extended, 4)}</td>
                  {isSuperAdmin && (
                    <td>
                      <button type="button" className="farm-btn py-[0.1rem]! px-[0.45rem]! farm-fs-2xs" disabled={!canEdit} onClick={() => run(() => removeGrowPlanPackage({ id: l.pick.id }))}>
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              <tr className="total">
                <td colSpan={6}>Packaging per unit</td>
                <td className="num">{money(cost.perUnit, 4)}</td>
                {isSuperAdmin && <td />}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {isSuperAdmin && growPlanId && (
        <div className="flex flex-wrap gap-2 items-center mt-3!">
          <select className="farm-input farm-cell-control w-80!" value={choice} aria-label="Package to pick" onChange={(ev) => setChoice(ev.target.value)}>
            <option value="">Pick a package…</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.sizeValue !== null ? ` · ${packageSizeLabel(p)}` : ''}
                {onChannel(p.channels) ? '' : ' · not on this grow plan’s channels'}
              </option>
            ))}
          </select>
          <input type="number" min={0} step={1} className="farm-input farm-cell-control w-24! text-right!" value={qty} aria-label="Packages per unit" onChange={(ev) => setQty(ev.target.value)} />
          <span className="farm-kpi-sub">per unit</span>
          <button type="button" className="farm-btn" disabled={!canEdit || !choice} onClick={add}>Add package</button>
        </div>
      )}
      {isSuperAdmin && !growPlanId && <p className="farm-kpi-sub mt-2">This grow plan is not saved in the library yet; packages are picked once it is.</p>}
      {error && <p className="farm-kpi-sub mt-2 farm-c-accent">{error}</p>}
      <p className="farm-kpi-sub mt-2">
        Packages come from the <Link className="farm-link" href="/farm/packaging">packaging library</Link>, each at its supplier price when one is on file, else its manual cost. A package with no cost entered counts as zero; enter its cost in the library and every growPlan that picks it updates. Packages on this growPlan&rsquo;s channels are listed first.
      </p>
    </Card>
  );
}
