'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, StatusBadge, num, pct } from '../../_components/ui';
import { Cite } from '../../_components/Cite';
import { SectionSave } from '../../_components/SectionSave';
import { RatingPill, RatingLegend, ratingHeader } from '../../_components/MarkRating';
import { ingredientRatings, ratingFor } from '../../_data/mark';
import { foodFactorSource, recipeFoodCategoryMap } from '../../_data/emission-factors';
import { BOUNDARY_LABEL, lcaOptions as curatedOptions, type LcaOption } from '../../_data/lca-options';
import { recipeFoodFootprint, recipeFoodFootprintDual } from '../../_engine/carbon';
import { useSustainabilityWorld } from '../../_state/sustainability';
import { SustainabilityWorldNote } from '../../_components/ledger/SustainabilityWorldNote';
import { useScenario } from '../../_state/scenario-store';
import { SupplierPicker } from '../../_components/SupplierPicker';
import { useLinkedSuppliers } from '../../_components/useLinkedSuppliers';
import { PageControls } from '../../_components/PageControls';
import { RecipeSelector, useSelectedRecipe } from '../../_components/RecipeSelector';

const BEEF = 'Ground beef, 85/15';

export default function IngredientsClient({ supplierOptions }: { supplierOptions: LcaOption[] }) {
  const { resolved: scenario, setIngredientBasis, setSustainability, isSuperAdmin: superAdmin } = useScenario();
  const { recipe: selectedRecipe } = useSelectedRecipe();
  const resolved = useMemo(() => ({ ...scenario, recipe: selectedRecipe }), [scenario, selectedRecipe]);
  const selection = resolved.sustainability.ingredientBasis;
  const links = resolved.sustainability.ingredientSupplier;
  const linked = useLinkedSuppliers(links);
  const [beefShare, setBeefShare] = useState(1);
  const options = useMemo(() => [...curatedOptions, ...supplierOptions], [supplierOptions]);

  const dual = useMemo(() => recipeFoodFootprintDual(resolved.recipe, selection, undefined, undefined, options), [resolved.recipe, selection, options]);
  // The period's food across every recipe delivered, on the selected ledger (Roadmap N6 slice 4).
  const world = useSustainabilityWorld(options);
  // The LCA basis and supplier links are forecast edits: on Plan only.
  const isSuperAdmin = superAdmin && world.isPlan;
  const recipeMeals = world.basis.meals.filter((m) => m.recipeCode === selectedRecipe.code).reduce((t, m) => t + m.meals, 0);
  const setLink = (name: string, id: string | undefined) =>
    setSustainability((d) => {
      const m = (d.ingredientSupplier ??= {});
      if (id === undefined) delete m[name];
      else m[name] = id;
      if (Object.keys(m).length === 0) delete d.ingredientSupplier;
    });

  // What-if: scale the beef line's as-purchased quantity. Local to this page.
  const recipe = resolved.recipe;
  const whatIf = useMemo(() => {
    const r: typeof recipe = {
      ...recipe,
      ingredients: recipe.ingredients.map((i) => (i.name === BEEF ? { ...i, apQtyPerBatch: i.apQtyPerBatch * beefShare } : i)),
    };
    return recipeFoodFootprint(r);
  }, [recipe, beefShare]);
  const baseRef = dual.referenceTotalKgPerPortion;

  const fmt = (n: number, dp = 3) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(dp);

  return (
    <>
      <PageHeader
        title="Ingredients (Scope 3)"
        purpose="Compare each portion's food footprint on the reference and selected bases."
        functions={['Reference basis', 'Selected basis', 'Gap', 'Per portion', 'What-if']}
        connects={[
          { href: '/muse/recipes', dir: 'from' },
          { href: '/muse/sustainability/supplier-lca', dir: 'from' },
          { href: '/muse/sustainability/inventory', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The food footprint of one portion is shown on two bases, always both.</li>
            <li>The reference basis is the mean for each ingredient&rsquo;s product in <Cite p={foodFactorSource} label="the study" /> and is never edited.</li>
            <li>The selected basis is the choice per ingredient among the study mean, a cited LCA from a registered document, or supplier data.</li>
            <li>The gap between the two is the practice or supplier credit.</li>
          </ul>
        }
        status="live"
      />
      <PageControls><RecipeSelector /></PageControls>

      <SustainabilityWorldNote world={world} />

      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={`${fmt(dual.referenceTotalKgPerPortion, 2)} kg`} label="Reference basis / portion" sub="Study means, retail weight" />
        <Kpi value={`${fmt(dual.selectedTotalKgPerPortion, 2)} kg`} label="Selected basis / portion" sub={dual.linesOnSelectedBasis === 0 ? 'No selections; equals the reference' : `${dual.linesOnSelectedBasis} line${dual.linesOnSelectedBasis > 1 ? 's' : ''} on a cited or supplier figure`} />
        <Kpi value={`${fmt(dual.gapKgPerPortion, 2)} kg`} label="Gap / portion" sub="Selected minus reference" />
        <Kpi value={`${(world.food.referenceKg / 1000).toFixed(1)} t · ${(world.food.selectedKg / 1000).toFixed(1)} t`} label="All meals delivered" sub={`Reference · selected, ${world.periodLabel}`} />
      </div>

      <Card title="Per portion, by ingredient — both bases" className="mt-4">
        <div className="mb-3!">
          {world.isPlan ? <SectionSave sections={['sustainability']} title="the LCA basis and supplier links" /> : <p className="muse-kpi-sub">The forecast&rsquo;s LCA basis and supplier links, read-only on Actual. They are edited on Plan.</p>}
        </div>
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead>
              <tr>
                <th>Ingredient</th><th>{ratingHeader()}</th><th>Supplier</th><th className="num">Mass</th>
                <th className="num">Reference basis</th><th className="num">kg CO2e</th>
                <th>Selected basis</th><th className="num">kg CO2e</th><th className="num">Gap</th>
              </tr>
            </thead>
            <tbody>
              {dual.lines.map((l) => {
                const r = l.reference;
                const s = l.selected;
                const chosen = selection[l.name] ?? '';
                return (
                  <tr key={l.name}>
                    <td className="font-medium!">
                      {l.name}
                      {l.category === null ? <div className="muse-fs-xs muse-c-faint">{l.excludedReason}</div> : null}
                    </td>
                    <td><RatingPill rating={ratingFor(ingredientRatings, l.name)} /></td>
                    <td>{l.category === null ? '—' : <SupplierPicker ingredient={l.name} linked={links[l.name] ? linked[links[l.name]] ?? null : null} canEdit={isSuperAdmin} onLink={(id) => setLink(l.name, id)} />}</td>
                    <td className="num">{l.category ? `${(l.massKgPerPortion * 1000).toFixed(0)} g` : '—'}</td>
                    <td className="num">
                      {r ? (
                        <div>
                          <div className="inline-flex items-center gap-2">{r.rawKgPerKg.toFixed(2)} <Cite p={r.provenance} /></div>
                          <div className="muse-fs-2xs muse-c-faint">{r.label.replace('Study mean, ', '')}</div>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="num">{r ? r.kgCo2ePerPortion.toFixed(3) : '—'}</td>
                    <td>
                      {l.category === null ? '—' : l.options.length === 0 ? (
                        <span className="muse-c-faint muse-fs-xs">Study mean · no cited or supplier figure on file</span>
                      ) : (
                        <div>
                          {isSuperAdmin ? (
                            <select className="muse-input muse-fs-xs min-w-56!" value={chosen} onChange={(e) => setIngredientBasis(l.name, e.target.value || undefined)} aria-label={`${l.name} LCA basis`}>
                              <option value="">Study mean</option>
                              {l.options.map((o) => (
                                <option key={o.id} value={o.id}>{o.label}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="muse-fs-sm">{s?.label ?? 'Study mean'}</div>
                          )}
                          {s && s.optionId !== null ? (
                            <div className="muse-fs-2xs muse-c-soft mt-1! leading-[1.4]">
                              <span className="inline-flex items-center gap-2">{fmt(s.rawKgPerKg, 2)} {s.provenance && <Cite p={s.provenance} />}</span>
                              {' '}{BOUNDARY_LABEL[s.boundary]}
                              {s.boundary !== 'retail' ? <> · aligned to retail <strong>{fmt(s.alignedKgPerKg, 2)}</strong> <StatusBadge status="DERIVED" title="Option figure + the study's transport, packaging and retail stages, scaled by the study's loss ratio for this product" /></> : null}
                              {' '}<StatusBadge status={s.status} />
                            </div>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="num">{s ? s.kgCo2ePerPortion.toFixed(3) : '—'}</td>
                    <td className={`num ${(s && r && s.kgCo2ePerPortion - r.kgCo2ePerPortion < 0 ? 'muse-c-sourced' : '')}`}>
                      {s && r ? fmt(s.kgCo2ePerPortion - r.kgCo2ePerPortion) : '—'}
                    </td>
                  </tr>
                );
              })}
              <tr className="total">
                <td colSpan={5}>Total per portion</td>
                <td className="num">{dual.referenceTotalKgPerPortion.toFixed(3)}</td>
                <td />
                <td className="num">{fmt(dual.selectedTotalKgPerPortion)}</td>
                <td className="num">{fmt(dual.gapKgPerPortion)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <RatingLegend />
        <p className="muse-kpi-sub mt-2">
          Reference factors are per kg at retail, losses included, from <Cite p={foodFactorSource} label={foodFactorSource.source.split(',')[0]} />. A cited figure at a narrower boundary is shown raw and aligned to retail; the aligned figure adds the study’s own post-slaughter stages for that product and applies its loss ratio, and is tagged derived. The basis selection and the supplier link are part of the forecast: saved with it; a super admin can set a forecast as the plan of record. A linked supplier’s own figure appears in the selector once it is recorded under Supplier LCA data.
          {recipeFoodCategoryMap[BEEF]?.note ? ` ${recipeFoodCategoryMap[BEEF].note}` : ''}
        </p>
      </Card>

      <Card title="What-if: beef quantity (reference basis)" className="mt-4">
        <div className="flex flex-wrap gap-4 items-center">
          <label className="muse-fs-sm flex! items-center! gap-[0.6rem]!">
            <span className="muse-kpi-label">Beef at</span>
            <input type="range" min={0} max={1} step={0.05} value={beefShare} onChange={(e) => setBeefShare(Number(e.target.value))} className="w-56!" />
            <strong className="tabular-nums">{pct(beefShare, 0)}</strong>
            <span className="muse-c-faint">of the recipe quantity</span>
          </label>
        </div>
        <div className="grid gap-3 mt-3 muse-autofit-11">
          <Kpi value={`${whatIf.totalKgCo2ePerPortion.toFixed(2)} kg`} label="CO2e per portion at this beef quantity" />
          <Kpi value={`${fmt(whatIf.totalKgCo2ePerPortion - baseRef, 2)} kg`} label="Change per portion" sub="Against the recipe as written" />
          <Kpi value={`${fmt(((whatIf.totalKgCo2ePerPortion - baseRef) * recipeMeals) / 1000, 1)} t`} label="Change over the period" sub={`${num(recipeMeals)} ${selectedRecipe.code} meals delivered`} />
        </div>
        <p className="muse-kpi-sub mt-2">
          Only the beef mass moves; nothing is substituted for it. Cost effects of a recipe change are on <Link className="muse-link" href="/muse/recipes">Recipes</Link>.
        </p>
      </Card>
    </>
  );
}
