'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, money } from '@/components/ui';
import { EditableNumber } from '@/components/EditableNumber';
import { perSqFtOf } from '@/data/capex';
import { capexRollup } from '@/engine/proforma';
import { createLeaseholdLine, deleteLeaseholdLine } from '@/server/finance-actions';
import { useScenario } from '@/state/scenario-store';

/** A rented facility's build-out lines: the extended cost of record, $/sq ft derived, counted or on record only. */
export function BuildOutCard({ className }: { className?: string }) {
  const { resolved, setLeasehold, isSuperAdmin } = useScenario();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setErr(null);
        after();
        router.refresh();
      } else setErr(res.error);
    });
  const [newLeasehold, setNewLeasehold] = useState('');
  const roll = useMemo(() => capexRollup(resolved), [resolved]);
  const sqFt = resolved.facilitySqFt;
  return (
      <Card title="Build-out" className={className}>
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr><th>Item</th><th className="num">$/sq ft</th><th className="num">Extended</th><th>In the rollup</th>{isSuperAdmin ? <th /> : null}</tr>
            </thead>
            <tbody>
              {resolved.leasehold.length === 0 ? <tr><td colSpan={isSuperAdmin ? 5 : 4} className="farm-c-soft">No build-out entered.</td></tr> : null}
          {resolved.leasehold.map((l) => (
                <tr key={l.key} className={`${l.counted ? '' : 'farm-c-faint'}`}>
                  <td>
                    {l.item}
                    {l.note ? <div className="farm-kpi-sub farm-fs-2xs">{l.note}</div> : null}
                  </td>
                  <td className="num">{sqFt ? money(perSqFtOf(l.extended, sqFt)) : '—'}</td>
                  <td className="num">
                    <EditableNumber
                      value={l.extended}
                      onChange={(v) => setLeasehold(l.key, { extended: v })}
                      step={1000}
                      prefix="$"
                      ariaLabel={`${l.item} extended cost`}
                      showBadge={false}
                    />
                  </td>
                  <td>
                    <label className="inline-flex! items-center! gap-[0.35rem]! farm-fs-xs">
                      <input
                        type="checkbox"
                        checked={l.counted}
                        onChange={(e) => setLeasehold(l.key, { counted: e.target.checked })}
                        aria-label={`Count ${l.item} in the capital rollup`}
                      />
                      {l.counted ? 'Counted' : 'On record only'}
                    </label>
                  </td>
                  {isSuperAdmin ? (
                    <td>
                      {l.id ? (
                        <button
                          type="button"
                          className="farm-btn farm-fs-2xs"
                          disabled={pending}
                          onClick={() => run(() => deleteLeaseholdLine(l.id!), () => {})}
                        >
                          Remove
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
              <tr className="total">
                <td>Build-out subtotal — in the rollup</td>
                <td className="num">{sqFt ? money(perSqFtOf(roll.leaseholdSubtotal, sqFt)) : '—'}</td>
                <td className="num">{money(roll.leaseholdSubtotal, 0)}</td>
                <td />
                {isSuperAdmin ? <td /> : null}
              </tr>
              {roll.leaseholdOnRecordOnly > 0 ? (
                <tr>
                  <td className="farm-c-soft">On record, not counted</td>
                  <td className="num farm-c-soft">{sqFt ? money(perSqFtOf(roll.leaseholdOnRecordOnly, sqFt)) : '—'}</td>
                  <td className="num farm-c-soft">{money(roll.leaseholdOnRecordOnly, 0)}</td>
                  <td />
                  {isSuperAdmin ? <td /> : null}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {isSuperAdmin ? (
          <div className="flex gap-2 items-center mt-[0.7rem]! flex-wrap">
            <input
              className="farm-input w-64!"
              value={newLeasehold}
              placeholder="Name a build-out item"
              onChange={(e) => setNewLeasehold(e.target.value)}
              aria-label="New build-out line name"
            />
            <button
              type="button"
              className="farm-btn"
              disabled={pending || newLeasehold.trim() === ''}
              onClick={() => run(() => createLeaseholdLine({ item: newLeasehold, extendedCents: 0, counted: true }), () => setNewLeasehold(''))}
            >
              Add a line
            </button>
          </div>
        ) : null}
        {err ? <p className="farm-kpi-sub farm-c-over mt-1">{err}</p> : null}
        <p className="farm-kpi-sub mt-2">
          The work a rented facility needs before it can grow: permits, electrical, HVAC, plumbing,
          floors and walls. Extended cost is the figure of record; dollars per square foot are derived
          from it against the facility size{sqFt ? `, ${sqFt.toLocaleString()} sq ft` : ', once one is entered'}. A line set to
          &ldquo;on record only&rdquo; keeps its figure and stays out of the subtotal, total capital,
          depreciation and a build-out loan.
        </p>
      </Card>
  );
}
