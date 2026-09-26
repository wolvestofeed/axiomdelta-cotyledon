'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createRecipe, updateRecipe } from '../_lib/recipe-actions';
import { blankIngredientLine, nextRecipeCode } from '../_engine/recipe-library';
import { RECIPE_STATUS_LABELS, type RecipeDef, type RecipeStatus, type IngredientLine } from '../_data/plan-data';
import type { GradeGroup } from '../_data/meal-pattern';
import { FOOD_TRACEABILITY_LIST_CATEGORIES } from '../_engine/traceability';

/**
 * Add New Recipe / Edit recipe — writes to the LIBRARY, not the forecast.
 *
 * A recipe saved here is a library recipe from that moment: it can be selected
 * on Unit Economics, Capacity and Ingredients, costed, credited and batch-sized
 * like any other. Lines can start blank or be copied from an existing recipe.
 * Every provenance tag on a new line starts as Placeholder; nothing here dresses
 * a typed figure as sourced.
 */

const CREDIT_COMPONENTS = ['NONE', 'MMA', 'GRAINS', 'VEG', 'FRUIT'] as const;
const GRAIN_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] as const;
const VEG_SUBGROUPS = ['DARK_GREEN', 'RED_ORANGE', 'BEANS_PEAS_LENTILS', 'STARCHY', 'OTHER'] as const;

type EditableRecipe = Pick<
  RecipeDef,
  'code' | 'name' | 'category' | 'status' | 'channels' | 'components' | 'productionMethod' | 'allergensPresent' | 'allergenFreeClaims' | 'batchPortions'
> & { gradeGroup: GradeGroup; servingVesselCapacityOz: number; ingredients: IngredientLine[] };

export function RecipeEditor({
  mode,
  recipe,
  recipeId,
  library,
  channels,
  onDone,
}: {
  mode: 'create' | 'edit';
  /** For edit: the library recipe (un-overlaid). For create: the recipe to duplicate — every field copied under the next code, the name marked as a copy (Robert, 2026-09-18). */
  recipe?: RecipeDef;
  recipeId?: string;
  library: RecipeDef[];
  channels: { phase: number; market: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const initial: EditableRecipe = useMemo(
    () => ({
      code: mode === 'edit' && recipe ? recipe.code : nextRecipeCode(library.map((r) => r.code)),
      name: mode === 'edit' && recipe ? recipe.name : recipe ? `${recipe.name} (copy)` : '',
      category: recipe?.category ?? '',
      status: mode === 'edit' && recipe ? recipe.status : 'developing',
      channels: recipe?.channels ?? [],
      components: recipe?.components ?? '',
      productionMethod: recipe?.productionMethod ?? 'Cook-chill. Components cooked, blast chilled, assembled cold, reheated at site.',
      allergensPresent: recipe?.allergensPresent ?? '',
      batchPortions: recipe?.batchPortions ?? 100,
      allergenFreeClaims: recipe?.allergenFreeClaims ?? '',
      gradeGroup: recipe?.spec.gradeGroup.value ?? '9-12',
      servingVesselCapacityOz: recipe?.spec.servingVesselCapacityOz.value ?? 16,
      ingredients: recipe ? structuredClone(recipe.ingredients) : [blankIngredientLine('')],
    }),
    [mode, recipe, library],
  );
  const [r, setR] = useState<EditableRecipe>(initial);
  const set = <K extends keyof EditableRecipe>(k: K, v: EditableRecipe[K]) => setR((x) => ({ ...x, [k]: v }));
  const setLine = (i: number, fn: (l: IngredientLine) => IngredientLine) =>
    setR((x) => ({ ...x, ingredients: x.ingredients.map((l, li) => (li === i ? fn(l) : l)) }));

  function copyFrom(code: string) {
    const src = library.find((x) => x.code === code);
    if (!src) return;
    setR((x) => ({ ...x, ingredients: structuredClone(src.ingredients), components: x.components || src.components }));
  }

  function save() {
    setErr(null);
    start(async () => {
      const payload = { ...r, ...(mode === 'edit' && recipeId ? { id: recipeId } : {}) };
      const res = mode === 'edit' ? await updateRecipe(payload) : await createRecipe(payload);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="muse-card mt-3!">
      <div className="muse-card-title">{mode === 'edit' ? `Edit recipe — ${r.code} (library)` : recipe ? `Duplicate recipe — from ${recipe.code}, saved to the library as ${r.code}` : 'Add New Recipe — saved to the library'}</div>
      <div className="flex flex-wrap gap-3 items-end mb-3!">
        <label className="muse-kpi-sub">Code<br /><input className="muse-input w-32!" value={r.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></label>
        <label className="muse-kpi-sub flex-1! min-w-56!">Name<br /><input className="muse-input w-full!" value={r.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label className="muse-kpi-sub">Category<br /><input className="muse-input w-48!" value={r.category} onChange={(e) => set('category', e.target.value)} placeholder="Hot entree, school lunch" /></label>
        <label className="muse-kpi-sub">Status<br />
          <select className="muse-select" value={r.status} onChange={(e) => set('status', e.target.value as RecipeStatus)}>
            {(Object.keys(RECIPE_STATUS_LABELS) as RecipeStatus[]).map((s) => <option key={s} value={s}>{RECIPE_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <div className="muse-kpi-sub">Channels served<br />
          <span className="inline-flex gap-[0.6rem] mt-[0.2rem]!">
            {channels.map((c) => (
              <label key={c.phase} className="inline-flex! gap-1! items-center!">
                <input type="checkbox" checked={r.channels.includes(c.phase)} onChange={(e) => set('channels', e.target.checked ? [...r.channels, c.phase].sort() : r.channels.filter((p) => p !== c.phase))} />
                {c.market}
              </label>
            ))}
          </span>
        </div>
        <label className="muse-kpi-sub">Grade group<br />
          <select className="muse-select" value={r.gradeGroup} onChange={(e) => set('gradeGroup', e.target.value as GradeGroup)}>
            {(['K-5', '6-8', '9-12'] as GradeGroup[]).map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="muse-kpi-sub">Vessel oz<br /><input className="muse-input w-24!" type="number" min={1} value={r.servingVesselCapacityOz} onChange={(e) => set('servingVesselCapacityOz', Number(e.target.value))} /></label>
      </div>
      <div className="grid gap-2 mb-3!">
        <label className="muse-kpi-sub">Components (as served)<br /><input className="muse-input w-full!" value={r.components} onChange={(e) => set('components', e.target.value)} /></label>
        <label className="muse-kpi-sub">Production method<br /><input className="muse-input w-full!" value={r.productionMethod} onChange={(e) => set('productionMethod', e.target.value)} /></label>
        <div className="flex gap-3 flex-wrap">
          <label className="muse-kpi-sub flex-1! min-w-56!">Allergens present<br /><input className="muse-input w-full!" value={r.allergensPresent} onChange={(e) => set('allergensPresent', e.target.value)} /></label>
          <label className="muse-kpi-sub flex-1! min-w-56!">Allergen-free claims<br /><input className="muse-input w-full!" value={r.allergenFreeClaims} onChange={(e) => set('allergenFreeClaims', e.target.value)} /></label>
        </div>
      </div>

      <div className="flex gap-2 items-center mb-2!">
        <span className="muse-card-title m-0!">Ingredient lines — as written for</span>
        <input className="muse-input w-24!" type="number" min={1} step={1} value={r.batchPortions} aria-label="Portions the quantities are written for" onChange={(e) => set('batchPortions', Math.max(1, Math.round(Number(e.target.value) || 1)))} />
        <span className="muse-kpi-sub">portions (the production batch is derived from the Phase 1 line, never typed)</span>
        <select className="muse-select" defaultValue="" onChange={(e) => { if (e.target.value) copyFrom(e.target.value); e.target.value = ''; }}>
          <option value="" disabled>Copy lines from…</option>
          {library.map((x) => <option key={x.code} value={x.code}>{x.code} — {x.name}</option>)}
        </select>
        <button type="button" className="muse-btn" onClick={() => setR((x) => ({ ...x, ingredients: [...x.ingredients, blankIngredientLine('')] }))}>+ line</button>
      </div>
      <div className="muse-scroll-x">
        <table className="muse-table">
          <thead>
            <tr><th>Ingredient</th><th>Spec</th><th className="num">AP qty</th><th>Unit</th><th className="num">Yield ×</th><th className="num">AP $/unit</th><th className="num">Pack</th><th>Hot?</th><th>Served component</th><th>Credits as</th><th className="num">g / cup or each</th><th>Traceability list</th><th /></tr>
          </thead>
          <tbody>
            {r.ingredients.map((l, i) => (
              <tr key={i}>
                <td><input className="muse-input w-44!" value={l.name} onChange={(e) => setLine(i, (x) => ({ ...x, name: e.target.value }))} /></td>
                <td><input className="muse-input w-40!" value={l.spec} onChange={(e) => setLine(i, (x) => ({ ...x, spec: e.target.value }))} /></td>
                <td className="num"><input className="muse-num-input" type="number" min={0} step={0.125} value={l.apQtyPerBatch} onChange={(e) => setLine(i, (x) => ({ ...x, apQtyPerBatch: Number(e.target.value) }))} /></td>
                <td>
                  <select className="muse-select" value={l.unit} onChange={(e) => setLine(i, (x) => ({ ...x, unit: e.target.value as 'lb' | 'each', unitMassOz: e.target.value === 'each' ? (x.unitMassOz ?? 1) : undefined }))}>
                    <option value="lb">lb</option><option value="each">each</option>
                  </select>
                  {l.unit === 'each' && <input className="muse-num-input" type="number" min={0} step={0.01} title="oz per each" value={l.unitMassOz ?? 0} onChange={(e) => setLine(i, (x) => ({ ...x, unitMassOz: Number(e.target.value) }))} />}
                </td>
                <td className="num"><input className="muse-num-input" type="number" min={0} step={0.01} title="0 is an absorbed line: its mass is carried on another line" value={l.yieldToCooked} onChange={(e) => setLine(i, (x) => ({ ...x, yieldToCooked: Number(e.target.value) }))} /></td>
                <td className="num"><input className="muse-num-input" type="number" min={0} step={0.01} value={l.apUnitCost} onChange={(e) => setLine(i, (x) => ({ ...x, apUnitCost: Number(e.target.value) }))} /></td>
                <td className="num"><input className="muse-num-input" type="number" min={0.01} step={1} value={l.packSize} onChange={(e) => setLine(i, (x) => ({ ...x, packSize: Number(e.target.value) }))} /></td>
                <td><input type="checkbox" checked={l.isHotComponent} onChange={(e) => setLine(i, (x) => ({ ...x, isHotComponent: e.target.checked }))} /></td>
                <td><input className="muse-input w-40!" value={l.component} onChange={(e) => setLine(i, (x) => ({ ...x, component: e.target.value }))} /></td>
                <td>
                  <select className="muse-select" value={l.crediting?.component ?? 'NONE'} onChange={(e) => setLine(i, (x) => ({ ...x, crediting: { ...(x.crediting ?? { status: 'PLACEHOLDER', source: 'Crediting assigned in the library; conversion basis to be sourced.' }), component: e.target.value as NonNullable<IngredientLine['crediting']>['component'], status: x.crediting?.status ?? 'PLACEHOLDER', source: x.crediting?.source ?? 'Crediting assigned in the library; conversion basis to be sourced.' } }))}>
                    {CREDIT_COMPONENTS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {l.crediting?.component === 'GRAINS' && (
                    <select className="muse-select" value={l.crediting.grainGroup ?? ''} onChange={(e) => setLine(i, (x) => ({ ...x, crediting: { ...x.crediting!, grainGroup: (e.target.value || undefined) as NonNullable<IngredientLine['crediting']>['grainGroup'] } }))}>
                      <option value="">Exhibit A group…</option>
                      {GRAIN_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  )}
                  {l.crediting?.component === 'VEG' && (
                    <select className="muse-select" value={l.crediting.vegSubgroup ?? ''} onChange={(e) => setLine(i, (x) => ({ ...x, crediting: { ...x.crediting!, vegSubgroup: (e.target.value || undefined) as NonNullable<IngredientLine['crediting']>['vegSubgroup'] } }))}>
                      <option value="">Subgroup…</option>
                      {VEG_SUBGROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  )}
                </td>
                <td className="num">
                  {l.crediting && l.crediting.component !== 'NONE' && (
                    l.unit === 'each'
                      ? <input className="muse-num-input" type="number" min={0} step={1} title="grams per each" value={l.crediting.unitWeightG ?? 0} onChange={(e) => setLine(i, (x) => ({ ...x, crediting: { ...x.crediting!, unitWeightG: Number(e.target.value) || undefined } }))} />
                      : <input className="muse-num-input" type="number" min={0} step={1} title="grams per cooked cup" value={l.crediting.cupWeightG ?? 0} onChange={(e) => setLine(i, (x) => ({ ...x, crediting: { ...x.crediting!, cupWeightG: Number(e.target.value) || undefined } }))} />
                  )}
                </td>
                <td>
                  <select className="muse-select" title="FDA Food Traceability List category (21 CFR 1.1990); blank is out of scope" value={l.foodTraceabilityList ?? ''} onChange={(e) => setLine(i, (x) => { const { foodTraceabilityList: _f, ...rest } = x; return e.target.value ? { ...rest, foodTraceabilityList: e.target.value } : rest; })}>
                    <option value="">Not listed</option>
                    {FOOD_TRACEABILITY_LIST_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td><button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setR((x) => ({ ...x, ingredients: x.ingredients.filter((_, li) => li !== i) }))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muse-kpi-sub mt-2">
        New lines carry Placeholder provenance for both price and yield until a quote or a USDA Food Buying Guide
        figure replaces them. A volume-credited line (vegetables, legumes, Group H grains) needs a cooked cup weight
        before it credits; the engine reports it as uncredited rather than guessing a density.
      </p>
      {err && <div className="muse-scenariobar-msg err mt-2" role="status">{err}</div>}
      <div className="flex gap-2 mt-3!">
        <button type="button" className="muse-btn primary" onClick={save} disabled={pending || !r.name.trim() || r.ingredients.length === 0}>{mode === 'edit' ? 'Save to library' : 'Add to library'}</button>
        <button type="button" className="muse-btn" onClick={onDone} disabled={pending}>Cancel</button>
      </div>
    </div>
  );
}
