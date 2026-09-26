'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useScenario } from '@/state/scenario-store';
import { CROP_PLAN_STATUS_LABELS, type CropPlanDef } from '@/data/plan-data';

/**
 * Which library crop plan a page is looking at. The choice is the `crop_plan` search
 * parameter, so it survives a refresh and can be linked to; it is view state,
 * not a scenario input. With no parameter the page shows the reference crop plan
 * (the first In Service).
 */
export function useSelectedCropPlan(): {
  cropPlan: CropPlanDef;
  code: string;
  setCode: (code: string) => void;
  cropPlans: CropPlanDef[];
} {
  const { resolved } = useScenario();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const wanted = params.get('cropPlan');
  const cropPlan = resolved.cropPlans.find((r) => r.code === wanted) ?? resolved.cropPlan;
  const setCode = useCallback(
    (code: string) => {
      const next = new URLSearchParams(params.toString());
      if (code === resolved.cropPlan.code) next.delete('cropPlan');
      else next.set('cropPlan', code);
      const qs = next.toString();
      // View state only: the page must not move when a crop plan is picked.
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname, resolved.cropPlan.code],
  );
  return { cropPlan, code: cropPlan.code, setCode, cropPlans: resolved.cropPlans };
}

export function CropPlanSelector({ label = 'Crop plan' }: { label?: string }) {
  const { code, setCode, cropPlans } = useSelectedCropPlan();
  return (
    <label className="farm-kpi-sub inline-flex! items-center! gap-2!">
      {label}
      <select className="farm-select max-w-[15rem]! truncate" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Select a crop plan" title={cropPlans.find((r) => r.code === code)?.name}>
        {cropPlans.map((r) => (
          <option key={r.code} value={r.code}>
            {r.name}{r.status === 'in_service' ? '' : ` · ${CROP_PLAN_STATUS_LABELS[r.status]}`}
          </option>
        ))}
      </select>
    </label>
  );
}
