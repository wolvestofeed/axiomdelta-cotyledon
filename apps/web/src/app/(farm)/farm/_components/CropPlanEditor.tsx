'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCropPlan, updateCropPlan } from '../_lib/crop-plan-actions';
import { blankInputLine, nextCropPlanCode } from '../_engine/crop-plan-library';
import { CROP_PLAN_STATUS_LABELS, type CropPlanDef, type CropPlanStatus, type InputLine } from '../_data/plan-data';
import type { TrayFormat } from '../_data/nutrient-profile';
import { FOOD_TRACEABILITY_LIST_CATEGORIES } from '../_engine/traceability';

/**
 * Add New Crop plan / Edit crop plan — writes to the LIBRARY, not the forecast.
 *
 * A crop plan saved here is a library crop plan from that moment: it can be selected
 * on Unit Economics, Capacity and Inputs, costed, credited and sowing-sized
 * like any other. Lines can start blank or be copied from an existing crop plan.
 * Every provenance tag on a new line starts as Placeholder; nothing here dresses
 * a typed figure as sourced.
 */

const CREDIT_COMPONENTS = ['NONE', 'MMA', 'GRAINS', 'VEG', 'FRUIT'] as const;
const GRAIN_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] as const;
const VEG_SUBGROUPS = ['DARK_GREEN', 'RED_ORANGE', 'BEANS_PEAS_LENTILS', 'STARCHY', 'OTHER'] as const;

type EditableCropPlan = Pick<
  CropPlanDef,
  'code' | 'name' | 'category' | 'status' | 'channels' | 'components' | 'productionMethod' | 'allergensPresent' | 'allergenFreeClaims' | 'sowingUnits'
> & { trayFormat: TrayFormat; servingGrowUnitCapacityOz: number; inputs: InputLine[] };

export function CropPlanEditor({
  mode,
  cropPlan,
  cropPlanId,
  library,
  channels,
  onDone,
}: {
  mode: 'create' | 'edit';
  /** For edit: the library crop plan (un-overlaid). For create: the crop plan to duplicate — every field copied under the next code, the name marked as a copy. */
  cropPlan?: CropPlanDef;
  cropPlanId?: string;
  library: CropPlanDef[];
  channels: { phase: number; market: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const initial: EditableCropPlan = useMemo(
    () => ({
      code: mode === 'edit' && cropPlan ? cropPlan.code : nextCropPlanCode(library.map((r) => r.code)),
      name: mode === 'edit' && cropPlan ? cropPlan.name : cropPlan ? `${cropPlan.name} (copy)` : '',
      category: cropPlan?.category ?? '',
      status: mode === 'edit' && cropPlan ? cropPlan.status : 'developing',
      channels: cropPlan?.channels ?? [],
      components: cropPlan?.components ?? '',
      productionMethod: cropPlan?.productionMethod ?? 'Grow. Components harvested, blackouted, assembled cold, reheated at pickup point.',
      allergensPresent: cropPlan?.allergensPresent ?? '',
      sowingUnits: cropPlan?.sowingUnits ?? 100,
      allergenFreeClaims: cropPlan?.allergenFreeClaims ?? '',
      trayFormat: cropPlan?.spec.trayFormat.value ?? '9-12',
      servingGrowUnitCapacityOz: cropPlan?.spec.servingGrowUnitCapacityOz.value ?? 16,
      inputs: cropPlan ? structuredClone(cropPlan.inputs) : [blankInputLine('')],
    }),
    [mode, cropPlan, library],
  );
  const [r, setR] = useState<EditableCropPlan>(initial);
  const set = <K extends keyof EditableCropPlan>(k: K, v: EditableCropPlan[K]) => setR((x) => ({ ...x, [k]: v }));
  const setLine = (i: number, fn: (l: InputLine) => InputLine) =>
    setR((x) => ({ ...x, inputs: x.inputs.map((l, li) => (li === i ? fn(l) : l)) }));

  function copyFrom(code: string) {
    const src = library.find((x) => x.code === code);
    if (!src) return;
    setR((x) => ({ ...x, inputs: structuredClone(src.inputs), components: x.components || src.components }));
  }

  function save() {
    setErr(null);
    start(async () => {
      const payload = { ...r, ...(mode === 'edit' && cropPlanId ? { id: cropPlanId } : {}) };
      const res = mode === 'edit' ? await updateCropPlan(payload) : await createCropPlan(payload);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="farm-card mt-3!">
      <div className="farm-card-title">{mode === 'edit' ? `Edit crop plan — ${r.code} (library)` : cropPlan ? `Duplicate crop plan — from ${cropPlan.code}, saved to the library as ${r.code}` : 'Add New Crop plan — saved to the library'}</div>
      <div className="flex flex-wrap gap-3 items-end mb-3!">
        <label className="farm-kpi-sub">Code<br /><input className="farm-input w-32!" value={r.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></label>
        <label className="farm-kpi-sub flex-1! min-w-56!">Name<br /><input className="farm-input w-full!" value={r.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label className="farm-kpi-sub">Category<br /><input className="farm-input w-48!" value={r.category} onChange={(e) => set('category', e.target.value)} placeholder="Hot entree, subscription" /></label>
        <label className="farm-kpi-sub">Status<br />
          <select className="farm-select" value={r.status} onChange={(e) => set('status', e.target.value as CropPlanStatus)}>
            {(Object.keys(CROP_PLAN_STATUS_LABELS) as CropPlanStatus[]).map((s) => <option key={s} value={s}>{CROP_PLAN_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <div className="farm-kpi-sub">Channels served<br />
          <span className="inline-flex gap-[0.6rem] mt-[0.2rem]!">
            {channels.map((c) => (
              <label key={c.phase} className="inline-flex! gap-1! items-center!">
                <input type="checkbox" checked={r.channels.includes(c.phase)} onChange={(e) => set('channels', e.target.checked ? [...r.channels, c.phase].sort() : r.channels.filter((p) => p !== c.phase))} />
                {c.market}
              </label>
            ))}
          </span>
        </div>
        <label className="farm-kpi-sub">Tray format<br />
          <select className="farm-select" value={r.trayFormat} onChange={(e) => set('trayFormat', e.target.value as TrayFormat)}>
            {(['K-5', '6-8', '9-12'] as TrayFormat[]).map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="farm-kpi-sub">Grow unit oz<br /><input className="farm-input w-24!" type="number" min={1} value={r.servingGrowUnitCapacityOz} onChange={(e) => set('servingGrowUnitCapacityOz', Number(e.target.value))} /></label>
      </div>
      <div className="grid gap-2 mb-3!">
        <label className="farm-kpi-sub">Components (as served)<br /><input className="farm-input w-full!" value={r.components} onChange={(e) => set('components', e.target.value)} /></label>
        <label className="farm-kpi-sub">Production method<br /><input className="farm-input w-full!" value={r.productionMethod} onChange={(e) => set('productionMethod', e.target.value)} /></label>
        <div className="flex gap-3 flex-wrap">
          <label className="farm-kpi-sub flex-1! min-w-56!">Allergens present<br /><input className="farm-input w-full!" value={r.allergensPresent} onChange={(e) => set('allergensPresent', e.target.value)} /></label>
          <label className="farm-kpi-sub flex-1! min-w-56!">Allergen-free claims<br /><input className="farm-input w-full!" value={r.allergenFreeClaims} onChange={(e) => set('allergenFreeClaims', e.target.value)} /></label>
        </div>
      </div>

      <div className="flex gap-2 items-center mb-2!">
        <span className="farm-card-title m-0!">Input lines — as written for</span>
        <input className="farm-input w-24!" type="number" min={1} step={1} value={r.sowingUnits} aria-label="Units the quantities are written for" onChange={(e) => set('sowingUnits', Math.max(1, Math.round(Number(e.target.value) || 1)))} />
        <span className="farm-kpi-sub">units (the production sowing is derived from the Phase 1 line, never typed)</span>
        <select className="farm-select" defaultValue="" onChange={(e) => { if (e.target.value) copyFrom(e.target.value); e.target.value = ''; }}>
          <option value="" disabled>Copy lines from…</option>
          {library.map((x) => <option key={x.code} value={x.code}>{x.code} — {x.name}</option>)}
        </select>
        <button type="button" className="farm-btn" onClick={() => setR((x) => ({ ...x, inputs: [...x.inputs, blankInputLine('')] }))}>+ line</button>
      </div>
      <div className="farm-scroll-x">
        <table className="farm-table">
          <thead>
            <tr><th>Input</th><th>Spec</th><th className="num">SEED qty</th><th>Unit</th><th className="num">Yield ×</th><th className="num">SEED $/unit</th><th className="num">Pack</th><th>Hot?</th><th>Served component</th><th>Credits as</th><th className="num">g / cup or each</th><th>Traceability list</th><th /></tr>
          </thead>
          <tbody>
            {r.inputs.map((l, i) => (
              <tr key={i}>
                <td><input className="farm-input w-44!" value={l.name} onChange={(e) => setLine(i, (x) => ({ ...x, name: e.target.value }))} /></td>
                <td><input className="farm-input w-40!" value={l.spec} onChange={(e) => setLine(i, (x) => ({ ...x, spec: e.target.value }))} /></td>
                <td className="num"><input className="farm-num-input" type="number" min={0} step={0.125} value={l.seedQtyPerSowing} onChange={(e) => setLine(i, (x) => ({ ...x, seedQtyPerSowing: Number(e.target.value) }))} /></td>
                <td>
                  <select className="farm-select" value={l.unit} onChange={(e) => setLine(i, (x) => ({ ...x, unit: e.target.value as 'lb' | 'each', unitMassOz: e.target.value === 'each' ? (x.unitMassOz ?? 1) : undefined }))}>
                    <option value="lb">lb</option><option value="each">each</option>
                  </select>
                  {l.unit === 'each' && <input className="farm-num-input" type="number" min={0} step={0.01} title="oz per each" value={l.unitMassOz ?? 0} onChange={(e) => setLine(i, (x) => ({ ...x, unitMassOz: Number(e.target.value) }))} />}
                </td>
                <td className="num"><input className="farm-num-input" type="number" min={0} step={0.01} title="0 is an absorbed line: its mass is carried on another line" value={l.yieldToHarvest} onChange={(e) => setLine(i, (x) => ({ ...x, yieldToHarvest: Number(e.target.value) }))} /></td>
                <td className="num"><input className="farm-num-input" type="number" min={0} step={0.01} value={l.seedUnitCost} onChange={(e) => setLine(i, (x) => ({ ...x, seedUnitCost: Number(e.target.value) }))} /></td>
                <td className="num"><input className="farm-num-input" type="number" min={0.01} step={1} value={l.packSize} onChange={(e) => setLine(i, (x) => ({ ...x, packSize: Number(e.target.value) }))} /></td>
                <td><input type="checkbox" checked={l.isHotComponent} onChange={(e) => setLine(i, (x) => ({ ...x, isHotComponent: e.target.checked }))} /></td>
                <td><input className="farm-input w-40!" value={l.component} onChange={(e) => setLine(i, (x) => ({ ...x, component: e.target.value }))} /></td>
                <td>
                  <select className="farm-select" value={l.nutrition?.component ?? 'NONE'} onChange={(e) => setLine(i, (x) => ({ ...x, nutrition: { ...(x.nutrition ?? { status: 'PLACEHOLDER', source: 'Nutrition assigned in the library; conversion basis to be sourced.' }), component: e.target.value as NonNullable<InputLine['nutrition']>['component'], status: x.nutrition?.status ?? 'PLACEHOLDER', source: x.nutrition?.source ?? 'Nutrition assigned in the library; conversion basis to be sourced.' } }))}>
                    {CREDIT_COMPONENTS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {l.nutrition?.component === 'GRAINS' && (
                    <select className="farm-select" value={l.nutrition.grainGroup ?? ''} onChange={(e) => setLine(i, (x) => ({ ...x, nutrition: { ...x.nutrition!, grainGroup: (e.target.value || undefined) as NonNullable<InputLine['nutrition']>['grainGroup'] } }))}>
                      <option value="">Exhibit A group…</option>
                      {GRAIN_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  )}
                  {l.nutrition?.component === 'VEG' && (
                    <select className="farm-select" value={l.nutrition.vegSubgroup ?? ''} onChange={(e) => setLine(i, (x) => ({ ...x, nutrition: { ...x.nutrition!, vegSubgroup: (e.target.value || undefined) as NonNullable<InputLine['nutrition']>['vegSubgroup'] } }))}>
                      <option value="">Subgroup…</option>
                      {VEG_SUBGROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  )}
                </td>
                <td className="num">
                  {l.nutrition && l.nutrition.component !== 'NONE' && (
                    l.unit === 'each'
                      ? <input className="farm-num-input" type="number" min={0} step={1} title="grams per each" value={l.nutrition.unitWeightG ?? 0} onChange={(e) => setLine(i, (x) => ({ ...x, nutrition: { ...x.nutrition!, unitWeightG: Number(e.target.value) || undefined } }))} />
                      : <input className="farm-num-input" type="number" min={0} step={1} title="grams per harvested cup" value={l.nutrition.cupWeightG ?? 0} onChange={(e) => setLine(i, (x) => ({ ...x, nutrition: { ...x.nutrition!, cupWeightG: Number(e.target.value) || undefined } }))} />
                  )}
                </td>
                <td>
                  <select className="farm-select" title="FDA Food Traceability List category (21 CFR 1.1990); blank is out of scope" value={l.foodTraceabilityList ?? ''} onChange={(e) => setLine(i, (x) => { const { foodTraceabilityList: _f, ...rest } = x; return e.target.value ? { ...rest, foodTraceabilityList: e.target.value } : rest; })}>
                    <option value="">Not listed</option>
                    {FOOD_TRACEABILITY_LIST_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td><button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setR((x) => ({ ...x, inputs: x.inputs.filter((_, li) => li !== i) }))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="farm-kpi-sub mt-2">
        New lines carry Placeholder provenance for both price and yield until a quote or a USDA Food Buying Guide
        figure replaces them. A volume-credited line (vegetables, legumes, Group H grains) needs a harvested cup weight
        before it credits; the engine reports it as uncredited rather than guessing a density.
      </p>
      {err && <div className="farm-scenariobar-msg err mt-2" role="status">{err}</div>}
      <div className="flex gap-2 mt-3!">
        <button type="button" className="farm-btn primary" onClick={save} disabled={pending || !r.name.trim() || r.inputs.length === 0}>{mode === 'edit' ? 'Save to library' : 'Add to library'}</button>
        <button type="button" className="farm-btn" onClick={onDone} disabled={pending}>Cancel</button>
      </div>
    </div>
  );
}
