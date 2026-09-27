'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { moveToInService } from '@/server/experiment-actions';

/** Move a plan under development to in service on the channels picked, every channel ticked to start. */
export function MoveToInService({ code, channels }: { code: string; channels: { phase: number; market: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [picked, setPicked] = useState<number[]>(channels.map((c) => c.phase));
  const names = (phases: readonly number[]) => channels.filter((c) => phases.includes(c.phase)).map((c) => c.market).join(', ');
  function move() {
    setMsg(null);
    start(async () => {
      const res = await moveToInService({ growPlanCode: code, channels: picked });
      if (res.ok) {
        setMsg({ kind: 'ok', text: `${code} is in service on ${picked.length ? names(picked) : 'no channel'}. Harvest per tray from the experiments: ${res.measured.join(', ') || 'none'}${res.unmeasured.length ? `; on the variety record: ${res.unmeasured.join(', ')}` : ''}.` });
        router.refresh();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }
  return (
    <div className="mt-2">
      {msg && <div className={`farm-scenariobar-msg ${msg.kind} mb-[0.6rem]!`} role="status">{msg.text}</div>}
      <div className="flex flex-wrap gap-x-4 gap-y-[0.4rem] items-center mb-2!">
        <span className="farm-kpi-sub">Offered on</span>
        {channels.map((c) => (
          <label key={c.phase} className="farm-kpi-sub inline-flex! gap-[0.3rem]! items-center!">
            <input type="checkbox" checked={picked.includes(c.phase)} onChange={(e) => setPicked((s) => (e.target.checked ? [...s, c.phase].sort((a, b) => a - b) : s.filter((p) => p !== c.phase)))} />
            {c.market}
          </label>
        ))}
      </div>
      {picked.length === 0 && <p className="farm-kpi-sub mb-2">With no channel, no subscriber&rsquo;s Flat Builder or flat plan offers {code}.</p>}
      <button type="button" className="farm-btn primary" disabled={pending} onClick={move}>Move {code} to in service</button>
    </div>
  );
}
