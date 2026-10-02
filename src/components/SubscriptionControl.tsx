'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { pauseSubscription, resumeSubscription, skipDistribution, unskipDistribution } from '@/server/subscription-actions';

type Kind = 'skip' | 'unskip' | 'pause' | 'resume';
const LABEL: Record<Kind, string> = { skip: 'Skip', unskip: 'Unskip', pause: 'Pause', resume: 'Resume' };

/**
 * One button on the Client Portal's Subscriptions page (Roadmap P5): a client skips or unskips a
 * distribution and pauses or resumes a subscription on their own record. The server actions hold the
 * sow-date rules and refuse past them; the reason shows beside the button.
 */
export function SubscriptionControl({ kind, id, date }: { kind: Kind; id: string; date?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const act = () =>
    start(async () => {
      const r =
        kind === 'skip' ? await skipDistribution({ id, date }) :
        kind === 'unskip' ? await unskipDistribution({ id, date }) :
        kind === 'pause' ? await pauseSubscription({ id }) :
        await resumeSubscription({ id });
      if (r.ok) {
        setMsg(null);
        router.refresh();
      } else setMsg(r.error);
    });
  return (
    <span className="inline-flex gap-1 items-center">
      <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={act}>{LABEL[kind]}</button>
      {msg && <span className="farm-kpi-sub">{msg}</span>}
    </span>
  );
}
