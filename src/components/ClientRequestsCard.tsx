'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { num } from '@/components/ui';
import { CADENCE_LABELS } from '@/data/subscriptions';
import type { FlatPlanRequestDef } from '@/server/flat-plan-requests';
import { approveFlatPlanRequest, declineFlatPlanRequest } from '@/server/flat-plan-request-actions';

/**
 * The Dashboard's alert (Roadmap P6): flat plan changes clients have asked for, each read against what
 * the subscription carries today, approved or declined here by an operator or admin. Approval applies the
 * change from the first distribution not yet sown; the date comes back in the message.
 */
export function ClientRequestsCard({ requests, planNames }: { requests: FlatPlanRequestDef[]; planNames: Record<string, string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [declining, setDeclining] = useState<{ id: string; reason: string } | null>(null);
  const name = (code: string) => planNames[code] ?? code;
  const lines = (ls: { growPlanCode: string; units: number }[]) => (ls.length === 0 ? '—' : ls.map((l) => `${num(l.units)} × ${name(l.growPlanCode)}`).join(', '));
  const run = (fn: () => Promise<{ ok: true; from?: string } | { ok: false; error: string }>, ok: (r: { from?: string }) => string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? ok(r) : r.error);
      if (r.ok) {
        setDeclining(null);
        router.refresh();
      }
    });

  if (requests.length === 0) return null;
  return (
    <div className="farm-card mt-4">
      <div className="farm-card-title">Alerts — client requests waiting ({num(requests.length)})</div>
      <p className="farm-kpi-sub mb-2">A client has asked for a flat plan change in the Client Portal. Approving applies it from the first distribution not yet sown; declining sends the reason to the client.</p>
      <div className="farm-scroll-x">
        <table className="farm-table">
          <thead><tr><th>Client</th><th>Subscription</th><th>Carries today</th><th>Asks for</th><th>Note</th><th>Asked</th><th></th></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.subscriberName}</td>
                <td>{CADENCE_LABELS[r.cadence]}{r.pickupPointName ? ` · ${r.pickupPointName}` : ''}</td>
                <td>{lines(r.currentLines)}</td>
                <td className="farm-c-ink">{lines(r.lines)}</td>
                <td>{r.note ?? '—'}</td>
                <td>{r.requestedAt.slice(0, 10)}</td>
                <td>
                  {declining?.id === r.id ? (
                    <span className="inline-flex gap-1 items-center flex-wrap">
                      <input className="farm-input min-w-40!" placeholder="The reason, for the client" value={declining.reason} onChange={(e) => setDeclining({ id: r.id, reason: e.target.value })} />
                      <button type="button" className="farm-btn primary py-[0.1rem]! px-[0.4rem]!" disabled={pending || declining.reason.trim() === ''} onClick={() => run(() => declineFlatPlanRequest({ id: r.id, reason: declining.reason }), () => `Declined; ${r.subscriberName} sees the reason in the portal.`)}>Send</button>
                      <button type="button" className="farm-btn ghost py-[0.1rem]! px-[0.4rem]!" onClick={() => setDeclining(null)}>Cancel</button>
                    </span>
                  ) : (
                    <span className="inline-flex gap-1">
                      <button type="button" className="farm-btn primary py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => run(() => approveFlatPlanRequest({ id: r.id }), (x) => `Approved; the new flat plan runs from ${x.from ?? 'the next distribution'}.`)}>Approve</button>
                      <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => setDeclining({ id: r.id, reason: '' })}>Decline</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <p className="farm-kpi-sub mt-2">{msg}</p>}
    </div>
  );
}
