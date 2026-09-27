'use client';

import type { GrowPlanDef } from '@/data/grow-plan';
import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useScenario } from '@/state/scenario-store';
import { GROW_PLAN_STATUS_LABELS } from '@/data/plan-data';

/**
 * Which library grow plan a page is looking at. The choice is the `growPlan` search
 * parameter, so it survives a refresh and can be linked to; it is view state,
 * not a scenario input. With no parameter the page shows the reference grow plan
 * (the first In Service).
 */
export function useSelectedGrowPlan(): {
  growPlan: GrowPlanDef;
  code: string;
  setCode: (code: string) => void;
  growPlans: GrowPlanDef[];
} {
  const { resolved } = useScenario();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const wanted = params.get('growPlan');
  const growPlan = resolved.growPlans.find((r) => r.code === wanted) ?? resolved.growPlan;
  const setCode = useCallback(
    (code: string) => {
      const next = new URLSearchParams(params.toString());
      if (code === resolved.growPlan.code) next.delete('growPlan');
      else next.set('growPlan', code);
      const qs = next.toString();
      // View state only: the page must not move when a grow plan is picked.
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname, resolved.growPlan.code],
  );
  return { growPlan, code: growPlan.code, setCode, growPlans: resolved.growPlans };
}

export function GrowPlanSelector({ label = 'Grow plan' }: { label?: string }) {
  const { code, setCode, growPlans } = useSelectedGrowPlan();
  return (
    <label className="farm-kpi-sub inline-flex! items-center! gap-2!">
      {label}
      <select className="farm-select max-w-[15rem]! truncate" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Select a grow plan" title={growPlans.find((r) => r.code === code)?.name}>
        {growPlans.map((r) => (
          <option key={r.code} value={r.code}>
            {r.name}{r.status === 'in_service' ? '' : ` · ${GROW_PLAN_STATUS_LABELS[r.status]}`}
          </option>
        ))}
      </select>
    </label>
  );
}
