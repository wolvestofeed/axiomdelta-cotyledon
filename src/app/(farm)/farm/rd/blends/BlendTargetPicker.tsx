'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** The target set the Blends page reads every blend against: a subscriber's saved targets, or any set from the catalog. */
export function BlendTargetPicker({
  subscribers,
  targets,
  subscriberId: initialSubscriberId,
  chosen,
}: {
  subscribers: { id: string; name: string; nutritionTargets: string[] }[];
  targets: { key: string; name: string; kind: 'nutrient' | 'compound' }[];
  subscriberId: string;
  chosen: string[];
}) {
  const router = useRouter();
  const [subscriberId, setSubscriberId] = useState(initialSubscriberId);
  const [keys, setKeys] = useState<string[]>(chosen);

  const read = () => {
    const q = new URLSearchParams();
    if (subscriberId) q.set('subscriber', subscriberId);
    if (keys.length) q.set('targets', keys.join(','));
    router.push(q.size ? `/farm/rd/blends?${q}` : '/farm/rd/blends');
  };
  const clear = () => {
    setSubscriberId('');
    setKeys([]);
    router.push('/farm/rd/blends');
  };

  return (
    <>
      <div className="flex flex-wrap gap-4 items-end mb-3!">
        <label className="farm-kpi-sub">
          Subscriber
          <br />
          <select
            className="farm-select"
            value={subscriberId}
            onChange={(e) => {
              setSubscriberId(e.target.value);
              setKeys(subscribers.find((s) => s.id === e.target.value)?.nutritionTargets ?? []);
            }}
          >
            <option value="">None: a set chosen here</option>
            {subscribers.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.nutritionTargets.length} targets)</option>
            ))}
          </select>
        </label>
        <button type="button" className="farm-btn primary" onClick={read}>Read the blends</button>
        <button type="button" className="farm-btn ghost" onClick={clear}>Clear</button>
      </div>
      {(['nutrient', 'compound'] as const).map((kind) => (
        <div key={kind} className="mb-2!">
          <div className="farm-kpi-sub">{kind === 'nutrient' ? 'Nutrients' : 'Compounds'}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-[0.4rem]">
            {targets.filter((t) => t.kind === kind).map((t) => (
              <label key={t.key} className="farm-kpi-sub inline-flex! gap-[0.3rem]! items-center!">
                <input type="checkbox" checked={keys.includes(t.key)} onChange={(e) => setKeys((s) => (e.target.checked ? [...s, t.key] : s.filter((k) => k !== t.key)))} />
                {t.name}
              </label>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
