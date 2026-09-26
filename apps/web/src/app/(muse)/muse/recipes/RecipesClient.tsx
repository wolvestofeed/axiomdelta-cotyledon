'use client';

import { PageControls } from '../_components/PageControls';
import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, StatusBadge, money, num } from '../_components/ui';
import { EditableNumber } from '../_components/EditableNumber';
import { SectionSave } from '../_components/SectionSave';
import { batchCosting, costRecipe, costToServe, deriveCapacity, chilledMassPerPortion, platedPortionOz, componentCosting, reconcileToSpec } from '../_engine';
import { creditRecipe, creditableLines, minimumPortionFactor } from '../_engine/crediting';
import { BATCH_CAPACITY_BASIS_LABELS } from '../_data/capex';
import { allergenMatrix, RECIPE_STATUS_LABELS, type RecipeStatus } from '../_data/plan-data';
import { RecipeSelector, useSelectedRecipe } from '../_components/RecipeSelector';
import { RecipeEditor } from '../_components/RecipeEditor';
import { setRecipeStatus } from '../_lib/recipe-actions';
import { approveStandard } from '../_lib/standard-actions';
import { standardInForce, standardHistory, standardDiffers, standardLabel, type StandardVersionDoc } from '../_engine/standards';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useScenario } from '../_state/scenario-store';
import { useOperationsWorld } from '../_state/ledger';
import { assumptionsFor, ingredientKey } from '../_engine/scenario';
import { clock } from '../_data/crews';
import { RatingPill, RatingLegend, ratingHeader } from '../_components/MarkRating';
import { ingredientRatings, ratingFor } from '../_data/mark';
import { SupplierPicker } from '../_components/SupplierPicker';
import { useLinkedSuppliers } from '../_components/useLinkedSuppliers';
import { RecipePackagingCard } from './RecipePackagingCard';

export function RecipesClient({ standards, today }: { standards: StandardVersionDoc[]; today: string }) {
  const { resolved, setIngredient, setSustainability, isSuperAdmin, library } = useScenario();
  const { recipe: selected, setCode } = useSelectedRecipe();
  // Ingredient lines and supplier links are forecast edits: on Plan only. The library,
  // packaging and standards are records and edit in both worlds (Roadmap N6 slice 3).
  const { forecastEditing } = useOperationsWorld({});
  const libraryRecipe = library.find((r) => r.code === selected.code);
  const router = useRouter();
  const [editor, setEditor] = useState<'create' | 'duplicate' | 'edit' | null>(null);
  // The editor opens inside the library card; a toolbar button sits far above it, so bring it into view.
  useEffect(() => {
    if (editor) document.getElementById('recipe-editor')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [editor]);
  const [statusPending, startStatus] = useTransition();

  // The library view shows 10 rows a frame, or 25 when expanded; paged, so a
  // long library does not push the recipe detail off the screen.
  const [pageSize, setPageSize] = useState<10 | 25>(10);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(resolved.recipes.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const pageRows = resolved.recipes.slice(current * pageSize, current * pageSize + pageSize);

  // The recipe is where a line's source is set. Ingredients (Scope 3),
  // Procurement and Logistics read the same link.
  const links = resolved.sustainability.ingredientSupplier;
  const linkedSuppliers = useLinkedSuppliers(links);
  const setLink = (name: string, id: string | undefined) =>
    setSustainability((d) => {
      const m = (d.ingredientSupplier ??= {});
      if (id === undefined) delete m[name];
      else m[name] = id;
      if (Object.keys(m).length === 0) delete d.ingredientSupplier;
    });
  const costing = useMemo(() => costRecipe(selected), [selected]);
  const linesLinked = costing.lines.filter((l) => links[l.name]).length;
  const cap = useMemo(
    () => deriveCapacity(selected, resolved.capacityInputs),
    [selected, resolved.capacityInputs],
  );
  const mass = useMemo(() => chilledMassPerPortion(selected), [selected]);
  // Batch costing → yield → costing down to the unit (the costing rule, `batchCosting`).
  const batch = useMemo(() => batchCosting(selected, resolved.capacityInputs, resolved.assumptions.yield.shrinkAllowance.value), [selected, resolved.capacityInputs, resolved.assumptions.yield.shrinkAllowance.value]);
  // The selected recipe at its OWN labor standard and packaging (Roadmap N3).
  const selectedAssumptions = useMemo(() => assumptionsFor(resolved, selected.code), [resolved, selected.code]);
  const serve = useMemo(() => costToServe(selected, selectedAssumptions, resolved.capacityInputs), [selected, selectedAssumptions, resolved.capacityInputs]);
  /** Authored quantities are shown and edited at the derived batch: typed × this. */
  const scale = batch.scale;
  const plated = useMemo(() => platedPortionOz(selected), [selected]);
  const gradeGroup = selected.spec.gradeGroup.value;
  const credit = useMemo(
    () => creditRecipe(creditableLines(selected), gradeGroup),
    [selected, gradeGroup],
  );
  const minPortion = useMemo(
    () => minimumPortionFactor(creditableLines(selected), gradeGroup),
    [selected, gradeGroup],
  );
  const spec = useMemo(
    () => reconcileToSpec(selected, minPortion.factor, minPortion.bindingComponent),
    [selected, minPortion],
  );
  const components = useMemo(() => componentCosting(selected), [selected]);

  // ── The standard in force (Roadmap J5) ───────────────────────────────────
  const shrink = resolved.assumptions.yield.shrinkAllowance.value;
  const inForce = useMemo(() => standardInForce(standards, selected.code, today), [standards, selected.code, today]);
  const history = useMemo(() => standardHistory(standards, selected.code), [standards, selected.code]);
  const differs = useMemo(
    () => (inForce ? standardDiffers(inForce.snapshot, { recipe: selected, assumptions: selectedAssumptions }) : null),
    [inForce, selected, selectedAssumptions],
  );
  const foodAtStandard = inForce ? costRecipe(inForce.snapshot.recipe, inForce.snapshot.assumptions.yield.shrinkAllowance.value).totalFoodCostPerPortion : null;
  const foodLive = costRecipe(selected, shrink).totalFoodCostPerPortion;
  const [stdDate, setStdDate] = useState(today);
  const [stdNotes, setStdNotes] = useState('');
  const [stdMsg, setStdMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [stdPending, startStd] = useTransition();
  function approve() {
    startStd(async () => {
      const res = await approveStandard({ recipeCode: selected.code, effectiveFrom: stdDate, notes: stdNotes || null });
      if (res.ok) {
        setStdMsg({ kind: 'ok', text: `Approved ${res.label}, effective ${stdDate}.` });
        setStdNotes('');
        router.refresh();
      } else setStdMsg({ kind: 'err', text: res.error });
    });
  }

  // Plan-data defaults, for the "your input" comparison on each editable field.
  const defByName = useMemo(
    () => new Map((libraryRecipe ?? selected).ingredients.map((d) => [d.name, d])),
    [libraryRecipe, selected],
  );

  const allergenCols: Array<[keyof (typeof allergenMatrix)[number], string]> = [
    ['milk', 'Milk'],
    ['egg', 'Egg'],
    ['wheat', 'Wheat'],
    ['soy', 'Soy'],
    ['peanut', 'Peanut'],
    ['treeNut', 'Tree nut'],
    ['fishShellfishSesame', 'Fish / shellfish / sesame'],
  ];

  return (
    <>
      <PageHeader
        title="Recipes"
        purpose="Pick a recipe to see its cost per portion, batch size and portion spec."
        functions={['Recipe library', 'Unit food cost', 'Batch costing', 'Portion spec', 'Standard in force']}
        connects={[
          { href: '/muse/equipment', dir: 'from' },
          { href: '/muse/packaging', dir: 'from' },
          { href: '/muse/production-planning', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Every recipe that can be costed, credited, batch-sized or planned is a library row with a status.</li>
            <li>The code recipe is the seed, not the source.</li>
            <li>Editing an ingredient&rsquo;s AP cost, quantity or yield here is a forecast edit measured against the library. Edit recipe changes the library.</li>
            <li>The standard a batch is costed at changes only when a super admin approves a version with an effective date.</li>
          </ul>
        }
        status="live"
      />

      <Card title="Recipe library">
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead>
              <tr><th>Code</th><th>Recipe</th><th>Status</th><th>Channels</th><th className="num">Food cost / portion</th><th className="num">Plated oz</th><th className="num">Batch</th><th className="num">Cook to chiller</th><th /></tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const c = costRecipe(r, resolved.assumptions.yield.shrinkAllowance.value);
                const k = deriveCapacity(r, resolved.capacityInputs);
                const lib = library.find((x) => x.code === r.code) as (typeof library)[number] & { id?: string } | undefined;
                const isSel = r.code === selected.code;
                return (
                  <tr key={r.code} className={`${isSel ? 'bg-[color:var(--muse-surface-2)]!' : ''}`}>
                    <td className="muse-mono muse-fs-xs">{r.code}</td>
                    <td className={`${(isSel ? 'font-semibold!' : 'font-medium!')}`}>{r.name}<div className="muse-c-faint muse-fs-xs">{r.category}</div></td>
                    <td>
                      {isSuperAdmin && lib?.id ? (
                        <select className="muse-select" value={r.status} disabled={statusPending} onChange={(e) => { const status = e.target.value as RecipeStatus; startStatus(async () => { await setRecipeStatus({ id: lib.id, status }); router.refresh(); }); }}>
                          {(Object.keys(RECIPE_STATUS_LABELS) as RecipeStatus[]).map((st) => <option key={st} value={st}>{RECIPE_STATUS_LABELS[st]}</option>)}
                        </select>
                      ) : RECIPE_STATUS_LABELS[r.status]}
                    </td>
                    <td>{r.channels.length === 0 ? '—' : r.channels.map((ph) => resolved.phases.find((p) => p.phase === ph)?.market ?? `Channel ${ph}`).join(', ')}</td>
                    <td className="num">{money(c.totalFoodCostPerPortion)}</td>
                    <td className="num">{c.platedOzPerPortion.toFixed(2)}</td>
                    <td className="num">{num(k.batchSize)}</td>
                    <td className="num">{k.thermal.cookToChillMinutes === null ? '—' : `${k.thermal.cookToChillMinutes} min`}{k.thermal.gaps.length > 0 && <div className="muse-c-faint muse-fs-2xs">{k.thermal.gaps.length} gap{k.thermal.gaps.length === 1 ? '' : 's'}</div>}</td>
                    <td className="num">{isSel ? <span className="muse-kpi-sub">selected</span> : <button type="button" className="muse-btn py-[0.1rem]! px-2!" onClick={() => setCode(r.code)}>Select</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-[0.6rem]!">
          <span className="muse-kpi-sub">
            {resolved.recipes.length === 0 ? 'No recipes.' : `Recipes ${current * pageSize + 1}–${Math.min(resolved.recipes.length, (current + 1) * pageSize)} of ${resolved.recipes.length}`}
          </span>
          <span className="inline-flex gap-[0.4rem] items-center">
            <button type="button" className="muse-btn py-[0.1rem]! px-2!" onClick={() => setPage(0)} disabled={current === 0}>First</button>
            <button type="button" className="muse-btn py-[0.1rem]! px-2!" onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0}>Previous</button>
            <span className="muse-kpi-sub">Page {current + 1} of {pageCount}</span>
            <button type="button" className="muse-btn py-[0.1rem]! px-2!" onClick={() => setPage(Math.min(pageCount - 1, current + 1))} disabled={current >= pageCount - 1}>Next</button>
            <button type="button" className="muse-btn py-[0.1rem]! px-2!" onClick={() => setPage(pageCount - 1)} disabled={current >= pageCount - 1}>Last</button>
            <button type="button" className="muse-btn py-[0.1rem]! px-2!" onClick={() => { setPageSize(pageSize === 10 ? 25 : 10); setPage(0); }}>{pageSize === 10 ? 'Show 25 a frame' : 'Show 10 a frame'}</button>
          </span>
        </div>
        {isSuperAdmin && (
          <PageControls group="action">
            <button type="button" className="muse-btn ghost" onClick={() => setEditor(editor === 'create' ? null : 'create')}>Add New Recipe</button>
          </PageControls>
        )}
        {isSuperAdmin && (
          <div className="flex gap-2 mt-3!">
            <button type="button" className="muse-btn primary" onClick={() => setEditor(editor === 'create' ? null : 'create')}>Add New Recipe</button>
            {libraryRecipe && 'id' in libraryRecipe && (
              <button type="button" className="muse-btn" onClick={() => setEditor(editor === 'edit' ? null : 'edit')}>Edit {selected.code} in the library</button>
            )}
          </div>
        )}
        <div id="recipe-editor" className="scroll-mt-4" />
        {editor === 'create' && (
          <RecipeEditor mode="create" library={library} channels={resolved.phases.map((ph) => ({ phase: ph.phase, market: ph.market }))} onDone={() => setEditor(null)} />
        )}
        {editor === 'duplicate' && libraryRecipe && (
          <RecipeEditor key={`dup-${libraryRecipe.code}`} mode="create" recipe={libraryRecipe} library={library} channels={resolved.phases.map((ph) => ({ phase: ph.phase, market: ph.market }))} onDone={() => setEditor(null)} />
        )}
        {editor === 'edit' && libraryRecipe && (
          <RecipeEditor mode="edit" recipe={libraryRecipe} recipeId={(libraryRecipe as { id?: string }).id} library={library} channels={resolved.phases.map((ph) => ({ phase: ph.phase, market: ph.market }))} onDone={() => setEditor(null)} />
        )}
        <p className="muse-kpi-sub mt-2">
          Production Planning plans recipes In Service; Planned and Developing recipes can be run singly. Each channel
          is an expansion phase with its own menu; a recipe lists the channels it serves.
        </p>
      </Card>

      <PageControls>
        <RecipeSelector />
        {isSuperAdmin && libraryRecipe && (
          <button type="button" className="muse-btn ghost" aria-pressed={editor === 'duplicate'} onClick={() => setEditor(editor === 'duplicate' ? null : 'duplicate')}>Duplicate recipe</button>
        )}
      </PageControls>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-6!">
        <div className="muse-card-title m-0!">Recipe detail</div>
      </div>
      <Card className="mt-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="muse-page-title muse-fs-lg">{selected.name}</div>
            <div className="muse-kpi-sub mt-1!">
              {selected.code} · {selected.category}
            </div>
          </div>
          <div className="text-sm muse-c-soft max-w-120!">
            {selected.components}
          </div>
        </div>
      </Card>

      <div className="grid gap-3 mt-4 muse-autofit-11">
        <Kpi value={money(costing.totalFoodCostPerPortion)} label="Unit food cost" sub="Batch cost over the batch's portions, with the shrink allowance" />
        <Kpi value={num(cap.batchSize)} label="Batch — one unit of each vessel" sub={cap.binding ? `Bound by the ${cap.binding.vessel.item.toLowerCase()}${cap.binding.component ? ` on ${cap.binding.component.toLowerCase()}` : ''} (${BATCH_CAPACITY_BASIS_LABELS[cap.binding.vessel.basis].toLowerCase()} capacity)` : `${mass.toFixed(4)} lb chilled mass/portion`} />
        <Kpi value={money(serve.costToServe)} label="Cost to serve" sub={`Food ${money(serve.food)} · labor ${money(serve.directLabor)} · packaging ${money(serve.packaging)} · distribution ${money(serve.distribution)}`} />
        <Kpi value={`${plated.totalOz.toFixed(2)} oz`} label="Plated portion (derived)" sub={`${(mass * 16).toFixed(1)} oz hot cooked mass · ${plated.apOz.toFixed(2)} oz as-purchased — the as-purchased figure is not the bowl`} />
        <Kpi value={money(costing.costPerPlatedOz, 4)} label="Food cost / plated oz" sub={`${money(costing.costPerCookedLb)}/lb cooked · ${money(costing.costPerApLb)}/lb as-purchased`} />
        <Kpi value={num(cap.maxPortionsPerDay)} label="One-stream ceiling / day" sub={`${cap.cyclesPerDay} cycles × ${num(cap.batchSize)} on one cabinet`} />
        <Kpi value={`${linesLinked} / ${costing.lines.length}`} label="Lines with a supplier linked" sub="Inherited by Procurement and Logistics" />
        <Kpi
          value={cap.thermal.cookToChillMinutes === null ? '—' : `${cap.thermal.cookToChillMinutes} min`}
          label="Cook to chiller"
          sub={cap.chillWindow.firstLoadBasis === 'none' ? 'No cook time on file' : `First load ${clock(cap.chillWindow.startMin)} with cooking from ${clock(cap.chillWindow.openMin)}${cap.thermal.gaps.length ? ` · ${cap.thermal.gaps.length} gap${cap.thermal.gaps.length === 1 ? '' : 's'}` : ''}`}
        />
      </div>

      <Card title="Batch costing → yield → costing down to the unit" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table">
            <tbody>
              <tr><td>The batch</td><td className="num">{num(batch.batchPortions)} portions</td><td className="muse-c-faint muse-fs-xs">One unit of each vessel: the tightest of the vessels a batch passes through{cap.binding ? `, the ${cap.binding.vessel.item.toLowerCase()}` : ''}. The recipe is written for {num(batch.authoredPortions)} portions; every quantity below is scaled × {batch.scale.toFixed(3)}.</td></tr>
              <tr><td>Batch cost — bulk inputs as purchased</td><td className="num">{money(batch.batchFoodCost)}</td><td className="muse-c-faint muse-fs-xs">{batch.apLb.toFixed(1)} lb purchased at as-purchased prices.</td></tr>
              <tr><td>Yield — cooked over purchased</td><td className="num">{(batch.yieldCookedOverAp * 100).toFixed(1)}%</td><td className="muse-c-faint muse-fs-xs">{batch.apLb.toFixed(1)} lb purchased → {batch.epLb.toFixed(1)} lb edible → {batch.cookedLb.toFixed(1)} lb cooked → {batch.chilledLb.toFixed(1)} lb chilled → {batch.platedLb.toFixed(1)} lb plated ({(batch.yieldPlatedOverAp * 100).toFixed(1)}% of purchased). Measured on the batch record when one is closed; the yields on file until then.</td></tr>
              <tr><td>Shrink allowance ({(batch.shrinkAllowance * 100).toFixed(0)}%)</td><td className="num">{money(batch.batchFoodCostWithShrink - batch.batchFoodCost)}</td><td className="muse-c-faint muse-fs-xs">Trim, over-portioning and spoilage bought and never plated.</td></tr>
              <tr className="total"><td>Unit food cost — batch cost ÷ portions</td><td className="num">{money(batch.unitFoodCost, 4)}</td><td className="muse-c-faint muse-fs-xs">{money(batch.batchFoodCostWithShrink)} ÷ {num(batch.batchPortions)}.</td></tr>
              <tr><td>+ conversion labor</td><td className="num">{money(serve.directLabor, 4)}</td><td className="muse-c-faint muse-fs-xs">The time study at the batch, at the placeholder loaded rate.</td></tr>
              <tr><td>+ packaging</td><td className="num">{money(serve.packaging, 4)}</td><td className="muse-c-faint muse-fs-xs">Per meal.</td></tr>
              <tr><td>+ distribution to the sites</td><td className="num">{money(serve.distribution, 4)}</td><td className="muse-c-faint muse-fs-xs">Per meal. Storage is a fixed cost and is not in the cost to serve.</td></tr>
              <tr className="total"><td>Cost to serve</td><td className="num">{money(serve.costToServe, 4)}</td><td className="muse-c-faint muse-fs-xs">The cost of a meal the ledger carries is food, labor and packaging ({money(serve.total, 4)}); distribution is a selling cost there.</td></tr>
            </tbody>
          </table>
        </div>
        {cap.bounds.length > 0 && (
          <p className="muse-kpi-sub mt-2">
            Vessel bounds on the batch, one unit each, tightest first: {cap.bounds.map((b) => `${b.vessel.item} (${num(b.vessel.capacityLb)} lb a run, ${BATCH_CAPACITY_BASIS_LABELS[b.vessel.basis].toLowerCase()}${b.vessel.units > 1 ? `, ${num(b.vessel.units)} units as parallel streams` : ''}) on ${b.component ?? 'the chilled portion'} at ${b.lbPerPortion.toFixed(3)} lb/portion → ${num(Math.floor(b.portions))} portions`).join('; ')}. Capacities are open fields on <Link className="muse-link" href="/muse/equipment">Equipment</Link>.
          </p>
        )}
      </Card>

      <Card title="Cook to chiller — the thermal processing standards" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead>
              <tr><th>Hot component</th><th>Process</th><th>Equipment and mode</th><th className="num">Stated range</th><th className="num">Plan (high end)</th><th>Gap</th></tr>
            </thead>
            <tbody>
              {cap.thermal.components.map((c) => (
                <tr key={c.component} className={c.component === cap.thermal.longestComponent ? 'total' : ''}>
                  <td>{c.component}{c.basis && <div className="muse-c-faint muse-fs-2xs">{c.basis}</div>}</td>
                  <td>{c.process ? c.process.name : '—'}{c.process?.overnight && <div className="muse-c-faint muse-fs-2xs">Overnight, before the production day</div>}</td>
                  <td className="muse-c-soft">{c.process ? `${c.process.equipment} — ${c.process.mode}` : '—'}</td>
                  <td className="num">{c.process ? `${c.process.minMinutes}–${c.process.maxMinutes} min` : '—'}</td>
                  <td className="num">{c.minutes === null ? '—' : `${c.minutes} min`}</td>
                  <td className={`${(c.gap ? 'muse-c-placeholder' : 'muse-c-faint')}`}>{c.gap ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2">
          The cooling clock starts the moment a cook ends: the product is poured into 2-inch hotel pans and loaded (25 minutes). The components start staggered, longest first, so they finish together and fill one chiller batch; the recipe&rsquo;s time to the chiller is its longest component cook{cap.thermal.longestComponent ? ` — ${cap.thermal.longestComponent}` : ''}, read at the high end of each stated range. A component with no cook time on file is a gap and is not filled in. Source: the kitchen&rsquo;s thermal processing standards (2026-09-14).
        </p>
      </Card>


      <Card title="Portion spec — what the plated weight is anchored to" className="mt-4">
        <p className="text-sm muse-c-soft mb-3!">
          The plated weight is not a preference. It is the weight that delivers this
          entree&rsquo;s crediting contribution for its grade group under 7 CFR 210.10(c).
          Crediting runs on the as-served weight of each served COMPONENT, and USDA rounds
          every component total down &mdash; to the nearest quarter ounce equivalent for
          meats/meat alternates and grains, and to the nearest eighth cup for vegetables.
        </p>
        <div className="grid gap-3 muse-autofit-11">
          <Kpi
            value={`${credit.mmaOzEq.toFixed(2)} oz eq`}
            label="Meats / meat alternates"
            sub={`Grades ${gradeGroup} daily minimum ${credit.pattern.mma.dailyMin} oz eq · raw ${credit.rawMmaOzEq.toFixed(3)}`}
          />
          <Kpi
            value={`${credit.grainsOzEq.toFixed(2)} oz eq`}
            label="Grains"
            sub={`Grades ${gradeGroup} daily minimum ${credit.pattern.grains.dailyMin} oz eq · raw ${credit.rawGrainsOzEq.toFixed(3)}`}
          />
          <Kpi
            value={`${credit.vegCups.toFixed(3)} cup`}
            label="Vegetables"
            sub={`Grades ${gradeGroup} daily minimum ${credit.pattern.vegetables.dailyMin} cup · the entree does not carry the whole requirement`}
          />
          <Kpi
            value={`${((1 - minPortion.factor) * 100).toFixed(1)}%`}
            label="Portion headroom"
            sub={`The portion can fall this far before the grades ${gradeGroup} ${minPortion.bindingComponent === 'GRAINS' ? 'grain' : 'meats/meat alternates'} daily minimum is not met`}
          />
        </div>

        <div className="muse-scroll-x mt-4!">
          <table className="muse-table">
            <thead>
              <tr>
                <th>Served component</th>
                <th>Chill?</th>
                <th className="num">Plated oz</th>
                <th className="num">$ / portion</th>
                <th className="num">$ / lb cooked</th>
                <th className="num">M/MA oz eq</th>
                <th className="num">Grains oz eq</th>
                <th className="num">Veg cup</th>
              </tr>
            </thead>
            <tbody>
              {credit.components.map((k) => {
                const cost = components.find((c) => c.name === k.component);
                return (
                  <tr key={k.component}>
                    <td className="font-medium!">{k.component}</td>
                    <td className="muse-c-soft">{cost?.isHot ? 'Hot' : 'Cold-pack'}</td>
                    <td className="num">{(cost?.platedOz ?? 0).toFixed(3)}</td>
                    <td className="num">{money(cost?.costPerPortion ?? 0, 4)}</td>
                    <td className="num">{cost?.cookedCostPerLb == null ? '—' : money(cost.cookedCostPerLb)}</td>
                    <td className="num">{k.mmaOzEqRaw > 0 ? k.mmaOzEqRaw.toFixed(3) : '—'}</td>
                    <td className="num">{k.grainsOzEqRaw > 0 ? k.grainsOzEqRaw.toFixed(3) : '—'}</td>
                    <td className="num">{k.vegCupsRaw > 0 ? k.vegCupsRaw.toFixed(3) : '—'}</td>
                  </tr>
                );
              })}
              <tr className="total">
                <td colSpan={2}>Plated portion</td>
                <td className="num">{costing.platedOzPerPortion.toFixed(3)}</td>
                <td className="num">{money(costing.foodCostPerPortion, 4)}</td>
                <td className="num">{money(costing.costPerCookedLb)}</td>
                <td className="num">{credit.rawMmaOzEq.toFixed(3)}</td>
                <td className="num">{credit.rawGrainsOzEq.toFixed(3)}</td>
                <td className="num">{credit.rawVegCups.toFixed(3)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="text-sm muse-c-soft mt-3! grid! gap-[0.35rem]!">
          <div>
            <strong className="muse-c-ink">As-purchased is not the bowl.</strong>{' '}
            One portion is {plated.apOz.toFixed(2)} oz as purchased and{' '}
            {costing.platedOzPerPortion.toFixed(2)} oz plated. Dry rice and dry beans take on
            water; the two columns are different weights of the same portion.
          </div>
          <div>
            <strong className="muse-c-ink">Spec floor.</strong>{' '}
            {spec.specPlatedOz.toFixed(2)} oz is the lightest plated portion that still meets the
            grades {gradeGroup} daily minimums, binding on{' '}
            {minPortion.bindingComponent === 'GRAINS' ? 'grains' : 'meats/meat alternates'}.
            {spec.vesselCapacityOz !== null
              ? ` The serving vessel holds ${spec.vesselCapacityOz} oz.`
              : ' No serving vessel capacity is on file.'}
          </div>
          <div>
            <strong className="muse-c-ink">Grade group.</strong>{' '}
            <StatusBadge
              status={selected.spec.gradeGroup.status}
              title={selected.spec.gradeGroup.note}
            />{' '}
            {selected.spec.gradeGroup.note}
          </div>
          {credit.blocked.length > 0 && (
            <div>
              <strong className="muse-c-ink">Not credited:</strong>{' '}
              {credit.blocked.join(' ')}
            </div>
          )}
        </div>
      </Card>

      <RecipePackagingCard
        recipeCode={selected.code}
        recipeId={(libraryRecipe as { id?: string } | undefined)?.id}
        recipeChannels={selected.channels ?? []}
      />

      <Card title={`Ingredient lines — the ${num(batch.batchPortions)}-portion batch`} className="mt-4">
        <div className="mb-3!">
          {forecastEditing ? <SectionSave sections={['ingredients', 'sustainability']} title="the recipe" /> : <p className="muse-kpi-sub">The open forecast&rsquo;s ingredient lines, read-only on Actual. They are edited on Plan.</p>}
        </div>
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>{ratingHeader()}</th>
                <th>Supplier</th>
                <th>Chill?</th>
                <th className="num">As purchased / batch</th>
                <th className="num">Yield (× AP)</th>
                <th className="num">Cooked / batch</th>
                <th className="num">As served, oz / portion</th>
                <th className="num">AP $/unit</th>
                <th className="num">$ / lb AP</th>
                <th className="num">$ / lb cooked</th>
                <th className="num">$ / plated oz</th>
                <th className="num">$ / batch</th>
                <th className="num">$ / portion</th>
              </tr>
            </thead>
            <tbody>
              {costing.lines.map((l) => {
                const def = defByName.get(l.name);
                return (
                  <tr key={l.name}>
                    <td>
                      <div className="font-medium">{l.name}</div>
                      <div className="mt-[0.15rem]!"><StatusBadge status={l.status} title={l.source} /></div>
                    </td>
                    <td><RatingPill rating={ratingFor(ingredientRatings, l.name)} /></td>
                    <td>
                      <SupplierPicker
                        ingredient={l.name}
                        linked={links[l.name] ? linkedSuppliers[links[l.name]] ?? null : null}
                        canEdit={isSuperAdmin && forecastEditing}
                        onLink={(id) => setLink(l.name, id)}
                      />
                    </td>
                    <td className="muse-c-soft">{l.isHotComponent ? 'Hot' : 'Cold-pack'}</td>
                    <td className="num">
                      <EditableNumber
                        disabled={!forecastEditing}
                        value={l.apQtyPerBatch * scale}
                        defaultValue={def === undefined ? undefined : def.apQtyPerBatch * scale}
                        onChange={(v) => setIngredient(selected.code, l.name, 'apQtyPerBatch', scale > 0 ? v / scale : v)}
                        step={0.125}
                        suffix={l.unit}
                        ariaLabel={`${l.name} as-purchased quantity for the batch`}
                        showBadge={false}
                      />
                    </td>
                    <td className="num">
                      <EditableNumber
                        disabled={!forecastEditing}
                        value={l.yieldToCooked}
                        defaultValue={def?.yieldToCooked}
                        onChange={(v) => setIngredient(selected.code, l.name, 'yieldToCooked', v)}
                        step={0.05}
                        suffix="×"
                        ariaLabel={`${l.name} yield to cooked`}
                        showBadge={false}
                      />
                      <div className="mt-[0.15rem]!"><StatusBadge status={l.yieldStatus} title={l.yieldSource} /></div>
                    </td>
                    <td className="num">{num(l.cookedYieldPerBatch * scale, 2)}</td>
                    <td className="num">{l.platedOz.toFixed(3)}</td>
                    <td className="num">
                      <EditableNumber
                        disabled={!forecastEditing}
                        value={l.apUnitCost}
                        defaultValue={def?.apUnitCost}
                        onChange={(v) => setIngredient(selected.code, l.name, 'apUnitCost', v)}
                        step={0.05}
                        prefix="$"
                        ariaLabel={`${l.name} as-purchased unit cost`}
                        showBadge={false}
                      />
                      {/* Where the price came from: the supplier catalog when one is on
                          file, else the recipe's own figure with the reason why. */}
                      {(() => {
                        const pr = resolved.ingredientPrices[ingredientKey(selected.code, l.name)];
                        return (
                          <div className="mt-[0.15rem]!">
                            <StatusBadge status={l.status} title={pr?.gap ? `${l.source} — ${pr.gap}` : l.source} />
                          </div>
                        );
                      })()}
                    </td>
                    <td className="num">{l.apCostPerLb === null ? '—' : money(l.apCostPerLb)}</td>
                    <td className="num">{l.cookedCostPerLb === null ? '—' : money(l.cookedCostPerLb)}</td>
                    <td className="num">{l.costPerPlatedOz === null ? '—' : money(l.costPerPlatedOz, 4)}</td>
                    <td className="num">{money(l.extCostPerBatch * scale)}</td>
                    <td className="num">{money(l.costPerPortion, 4)}</td>
                  </tr>
                );
              })}
              <tr className="total">
                <td colSpan={12}>Subtotal — food cost</td>
                <td className="num">{money(costing.foodCostPerBatch * scale)}</td>
                <td className="num">{money(costing.foodCostPerPortion, 4)}</td>
              </tr>
              <tr>
                <td colSpan={12} className="muse-c-soft">Waste / shrink allowance ({(resolved.assumptions.yield.shrinkAllowance.value * 100).toFixed(0)}%)</td>
                <td />
                <td className="num">{money(costing.shrinkPerPortion, 4)}</td>
              </tr>
              <tr className="total">
                <td colSpan={8}>Total food cost per portion</td>
                <td />
                <td className="num">{money(costing.totalFoodCostPerPortion, 4)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <RatingLegend />
        <p className="muse-kpi-sub mt-2">
          Quantities are shown for the batch — one unit of each Phase 1 vessel — and stored for the {num(selected.batchPortions)} portions the
          recipe is written for. Editing an as-purchased quantity or a yield recomputes the cooked yield, which drives the
          mass per portion and therefore the batch. Cold-pack components (tortilla, cheese) are excluded from
          chilled mass, which is why they don’t move the batch size. The supplier on a line is set
          here and read everywhere else: it carries the certification and rating shown on{' '}
          <Link className="muse-link" href="/muse/procurement">Procurement</Link>, the inbound
          ton-miles on <Link className="muse-link" href="/muse/sustainability/logistics">Logistics</Link>,
          and the supplier figures offered on{' '}
          <Link className="muse-link" href="/muse/sustainability/ingredients">Ingredients (Scope 3)</Link>.
          The link is part of the scenario, saved with a forecast.
        </p>
      </Card>

      <Card title="Allergen matrix" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead>
              <tr>
                <th>Component</th>
                {allergenCols.map(([, label]) => (
                  <th key={label} className="num">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allergenMatrix.map((row) => (
                <tr key={row.component}>
                  <td className="font-medium!">{row.component}</td>
                  {allergenCols.map(([key, label]) => (
                    <td key={label} className={`num ${(row[key] ? 'muse-c-accent' : 'muse-c-faint')} ${(row[key] ? 'font-semibold!' : 'font-normal!')}`}>
                      {row[key] ? 'YES' : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`Standard in force — ${selected.code}`} className="mt-4">
        {stdMsg && <div className={`muse-scenariobar-msg ${stdMsg.kind} mb-[0.6rem]!`} role="status">{stdMsg.text}</div>}
        {inForce ? (
          <p className="muse-kpi-sub">
            <strong className="muse-c-ink">{standardLabel(inForce)}</strong>, effective {inForce.effectiveFrom}, approved by {inForce.approvedBy} on {inForce.approvedAt.slice(0, 10)}{inForce.notes ? ` — ${inForce.notes}` : ''}.
            Food cost per portion at the standard {money(foodAtStandard ?? 0, 4)}; at the live library and plan {money(foodLive, 4)}.
            {differs ? ' The live recipe or assumptions differ from the standard in force; batches are costed at the standard until a new version is approved.' : ' The live recipe and assumptions match the standard in force.'}
          </p>
        ) : (
          <p className="muse-kpi-sub">No approved standard is in force for {selected.code} as of {today}. Batches are costed at the live library ({selected.code}@library) and the record says so.</p>
        )}
        {isSuperAdmin && (
          <div className="flex flex-wrap gap-3 items-end mt-3!">
            <label className="muse-kpi-sub">Effective from<br /><input className="muse-input" type="date" value={stdDate} onChange={(e) => setStdDate(e.target.value)} /></label>
            <label className="muse-kpi-sub">Notes<br /><input className="muse-input w-80!" value={stdNotes} onChange={(e) => setStdNotes(e.target.value)} placeholder="what changed and why" /></label>
            <button type="button" className="muse-btn primary" onClick={approve} disabled={stdPending || !stdDate}>Approve the plan of record as the standard</button>
          </div>
        )}
        {history.length > 0 && (
          <table className="muse-table mt-3">
            <thead><tr><th>Version</th><th>Effective from</th><th>Approved by</th><th>Approved on</th><th className="num">Food $/portion</th><th>Notes</th></tr></thead>
            <tbody>
              {history.map((v) => (
                <tr key={v.id}>
                  <td className="muse-mono muse-fs-xs">{standardLabel(v)}</td>
                  <td>{v.effectiveFrom}</td>
                  <td>{v.approvedBy}</td>
                  <td>{v.approvedAt.slice(0, 10)}</td>
                  <td className="num">{money(costRecipe(v.snapshot.recipe, v.snapshot.assumptions.yield.shrinkAllowance.value).totalFoodCostPerPortion, 4)}</td>
                  <td className="muse-c-soft">{v.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muse-kpi-sub mt-2">
          A standard is the recipe as resolved on the plan of record plus the cost assumptions, frozen with an effective date. The ledger costs each batch at the version in force on its production date and the batch record names it. Editing the library or the plan changes what the next approval will freeze; it does not move a standard already in force. An effective date inside a locked period is refused.
        </p>
      </Card>

      <p className="muse-kpi-sub mt-4">
        Continue the golden path: <Link className="muse-link" href="/muse/capacity">Capacity</Link> derives the batch size ·{' '}
        <Link className="muse-link" href="/muse/production-planning">Production Planning</Link> runs the loop ·{' '}
        <Link className="muse-link" href="/muse/financials/unit-economics">Unit Economics</Link> builds the cost per meal.
      </p>
    </>
  );
}
