'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useScenario } from '../_state/scenario-store';
import { RECIPE_STATUS_LABELS, type RecipeDef } from '../_data/plan-data';

/**
 * Which library recipe a page is looking at. The choice is the `recipe` search
 * parameter, so it survives a refresh and can be linked to; it is view state,
 * not a scenario input. With no parameter the page shows the reference recipe
 * (the first In Service).
 */
export function useSelectedRecipe(): {
  recipe: RecipeDef;
  code: string;
  setCode: (code: string) => void;
  recipes: RecipeDef[];
} {
  const { resolved } = useScenario();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const wanted = params.get('recipe');
  const recipe = resolved.recipes.find((r) => r.code === wanted) ?? resolved.recipe;
  const setCode = useCallback(
    (code: string) => {
      const next = new URLSearchParams(params.toString());
      if (code === resolved.recipe.code) next.delete('recipe');
      else next.set('recipe', code);
      const qs = next.toString();
      // View state only: the page must not move when a recipe is picked.
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname, resolved.recipe.code],
  );
  return { recipe, code: recipe.code, setCode, recipes: resolved.recipes };
}

export function RecipeSelector({ label = 'Recipe' }: { label?: string }) {
  const { code, setCode, recipes } = useSelectedRecipe();
  return (
    <label className="muse-kpi-sub inline-flex! items-center! gap-2!">
      {label}
      <select className="muse-select max-w-[15rem]! truncate" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Select a recipe" title={recipes.find((r) => r.code === code)?.name}>
        {recipes.map((r) => (
          <option key={r.code} value={r.code}>
            {r.name}{r.status === 'in_service' ? '' : ` · ${RECIPE_STATUS_LABELS[r.status]}`}
          </option>
        ))}
      </select>
    </label>
  );
}
