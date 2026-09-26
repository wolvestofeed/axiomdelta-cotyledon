'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui';
import { CLOCK_STATE_LABELS, NEXT_PUNCHES, PUNCH_KIND_LABELS, clockStateOf, localClock, localDate, type PunchDoc, type StaffDoc, type WorkRole } from '@/engine/payroll';
import { punch } from '@/server/payroll-actions';

/** The time clock (Roadmap K5): each active person's state and the punches it accepts next, at the server's clock. */
/** `role` is the work role a clock-in here is recorded under (Roadmap P2): the Grow Room clocks operators in, the Sales portal clocks sales in. */
export function TimeClockCard({ staff, punches, title, role = 'operator' }: { staff: StaffDoc[]; punches: PunchDoc[]; title?: string; role?: WorkRole }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  return (
    <Card title={title ?? `Time clock — ${staff.length} on the register`}>
      {msg && <div className={`farm-scenariobar-msg ${msg.kind} mb-[0.6rem]!`} role="status">{msg.text}</div>}
      {staff.length === 0 ? (
        <p className="farm-kpi-sub">No one is on the staff register.</p>
      ) : (
        <div className="farm-floor-queue">
          {staff.map((s) => {
            const mine = punches.filter((p) => p.staffId === s.id);
            const state = clockStateOf(mine);
            const last = [...mine].sort((a, b) => b.punchedAt.localeCompare(a.punchedAt))[0];
            return (
              <div key={s.id} className="farm-floor-row">
                <div>
                  <div className="farm-floor-row-title">{s.name}</div>
                  <div className="farm-floor-row-sub">{CLOCK_STATE_LABELS[state]}{last ? ` · ${PUNCH_KIND_LABELS[last.kind].toLowerCase()} ${localDate(last.punchedAt)} ${localClock(last.punchedAt)}` : ''}</div>
                </div>
                <div className="flex gap-[0.4rem]">
                  {NEXT_PUNCHES[state].map((k) => (
                    <button key={k} type="button" className="farm-btn" disabled={pending} onClick={() => start(async () => {
                      const res = await punch({ staffId: s.id, kind: k, role });
                      setMsg(res.ok ? { kind: 'ok', text: `${s.name}: ${PUNCH_KIND_LABELS[k]} at ${localClock(res.at)}.` } : { kind: 'err', text: res.error });
                      if (res.ok) router.refresh();
                    })}>{PUNCH_KIND_LABELS[k]}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

