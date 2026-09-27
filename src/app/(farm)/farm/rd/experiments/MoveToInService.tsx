'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { moveToInService } from '@/server/experiment-actions';

/** Move a plan under development to in service, stating what the move writes. */
export function MoveToInService({ code }: { code: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  function move() {
    setMsg(null);
    start(async () => {
      const res = await moveToInService(code);
      if (res.ok) {
        setMsg({ kind: 'ok', text: `${code} is in service. Harvest per tray from the experiments: ${res.measured.join(', ') || 'none'}${res.unmeasured.length ? `; on the variety record: ${res.unmeasured.join(', ')}` : ''}.` });
        router.refresh();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }
  return (
    <div className="mt-2">
      {msg && <div className={`farm-scenariobar-msg ${msg.kind} mb-[0.6rem]!`} role="status">{msg.text}</div>}
      <button type="button" className="farm-btn primary" disabled={pending} onClick={move}>Move {code} to in service</button>
    </div>
  );
}
