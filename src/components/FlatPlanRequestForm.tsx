'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FlatPlanLine } from '@/data/subscriptions';
import { requestFlatPlanChange, withdrawFlatPlanRequest } from '@/server/flat-plan-request-actions';

export interface OfferedPlan {
  code: string;
  name: string;
}

/**
 * The Client Portal's flat plan request (Roadmap P6): the client composes the lines each distribution
 * is to carry from the grow plans offered on their channel and sends it to the farm. One request waits
 * at a time; a pending one can be withdrawn.
 */
export function FlatPlanRequestForm({ subscriptionId, current, offered, pendingRequestId }: { subscriptionId: string; current: FlatPlanLine[]; offered: OfferedPlan[]; pendingRequestId: string | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<FlatPlanLine[]>(current.length > 0 ? current.map((l) => ({ ...l })) : [{ growPlanCode: offered[0]?.code ?? '', units: 1 }]);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const unused = offered.filter((p) => !lines.some((l) => l.growPlanCode === p.code));

  if (pendingRequestId) {
    return (
      <span className="inline-flex gap-2 items-center flex-wrap">
        <span className="farm-kpi-sub">Your request is waiting for the farm.</span>
        <button type="button" className="farm-btn ghost py-[0.1rem]! px-[0.4rem]!" disabled={busy} onClick={() => start(async () => { const r = await withdrawFlatPlanRequest({ id: pendingRequestId }); setMsg(r.ok ? null : r.error); if (r.ok) router.refresh(); })}>Withdraw</button>
        {msg && <span className="farm-kpi-sub">{msg}</span>}
      </span>
    );
  }
  if (!open) return <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={offered.length === 0} onClick={() => setOpen(true)}>Ask to change the flat plan</button>;

  return (
    <div className="farm-card mt-2">
      <div className="farm-card-title">Ask to change the flat plan</div>
      <div className="flex flex-col gap-[0.3rem]">
        {lines.map((l, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-center">
            <select className="farm-select" value={l.growPlanCode} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, growPlanCode: e.target.value } : x)))}>
              {offered.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
            <input type="number" min={1} step={1} className="farm-input w-20!" aria-label="Units" value={l.units} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, units: Math.max(1, Math.round(Number(e.target.value))) } : x)))} />
            {lines.length > 1 && <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button>}
          </div>
        ))}
        <div><button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={unused.length === 0} onClick={() => setLines([...lines, { growPlanCode: unused[0]!.code, units: 1 }])}>+ grow plan</button></div>
      </div>
      <label className="farm-kpi-sub mt-2 block!">A note for the farm<br /><input className="farm-input w-full!" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="flex gap-2 mt-2 items-center flex-wrap">
        <button type="button" className="farm-btn primary" disabled={busy} onClick={() => start(async () => { const r = await requestFlatPlanChange({ subscriptionId, lines, note }); setMsg(r.ok ? null : r.error); if (r.ok) { setOpen(false); router.refresh(); } })}>Send to the farm</button>
        <button type="button" className="farm-btn ghost" onClick={() => setOpen(false)}>Cancel</button>
        {msg && <span className="farm-kpi-sub">{msg}</span>}
      </div>
      <p className="farm-kpi-sub mt-2">The farm reviews every change. Once approved it runs from the first distribution not yet sown; a decline comes back with the reason.</p>
    </div>
  );
}
