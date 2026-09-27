'use client';

import { formatNameOf, varietyNamesOf } from '@/data/grow-plan';
import { costPlan } from '@/engine/grow-costing';
import { PageControls } from '@/components/PageControls';
import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, StatusBadge, money, num } from '@/components/ui';
import { sowingCosting, costPlanPerUnit, costToServe, deriveCapacity } from '@/engine';
import { GROW_PLAN_STATUS_LABELS, type GrowPlanStatus } from '@/data/plan-data';
import { GrowPlanSelector, useSelectedGrowPlan } from '@/components/GrowPlanSelector';
import { GrowPlanEditor } from '@/components/GrowPlanEditor';
import { setGrowPlanStatus } from '@/server/grow-plan-actions';
import { approveStandard } from '@/server/standard-actions';
import { standardInForce, standardHistory, standardDiffers, standardLabel, type StandardVersionDoc } from '@/engine/standards';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useScenario } from '@/state/scenario-store';
import { assumptionsFor } from '@/engine/scenario';
import { GrowPlanPackagingCard } from '@/app/(farm)/farm/grow-plans/GrowPlanPackagingCard';

import { LINE_KIND_LABELS, leadVariety, planStageDays, planStages } from '@/data/grow-plan';
import { CONTROL_POINT_BY_ID } from '@/data/produce-safety';
import { targetsOfPlan } from '@/engine/nutrition-targets';
import { unitSku } from '@/data/tray-formats';

export function GrowPlansClient({ standards, today }: { standards: StandardVersionDoc[]; today: string }) {
  const { resolved, isSuperAdmin, library } = useScenario();
  const { growPlan: selected, setCode } = useSelectedGrowPlan();
  const libraryGrowPlan = library.find((r) => r.code === selected.code);
  const libraryPlan = libraryGrowPlan;
  const router = useRouter();
  const [editor, setEditor] = useState<'create' | 'duplicate' | 'edit' | null>(null);
  // The editor opens inside the library card; a toolbar button sits far above it, so bring it into view.
  useEffect(() => {
    if (editor) document.getElementById('grow-plan-editor')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [editor]);
  const [statusPending, startStatus] = useTransition();

  // The library view shows 10 rows a frame, or 25 when expanded; paged, so a
  // long library does not push the grow plan detail off the screen.
  const [pageSize, setPageSize] = useState<10 | 25>(10);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(resolved.growPlans.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const pageRows = resolved.growPlans.slice(current * pageSize, current * pageSize + pageSize);

  const growCosting = useMemo(() => costPlan(selected), [selected]);
  const leadVarietyOf = selected ? leadVariety(selected) : undefined;
  const planTargets = useMemo(() => targetsOfPlan(selected), [selected]);
  const cap = useMemo(
    () => deriveCapacity(selected, resolved.capacityInputs),
    [selected, resolved.capacityInputs],
  );
  // Sowing costing → yield → costing down to the unit (the costing rule, `sowingCosting`).
  const sowing = useMemo(() => sowingCosting(selected, resolved.capacityInputs, resolved.assumptions.yield.shrinkAllowance.value), [selected, resolved.capacityInputs, resolved.assumptions.yield.shrinkAllowance.value]);
  // The selected grow plan at its OWN labor standard and packaging (Roadmap N3).
  const selectedAssumptions = useMemo(() => assumptionsFor(resolved, selected.code), [resolved, selected.code]);
  const serve = useMemo(() => costToServe(selected, selectedAssumptions, resolved.capacityInputs), [selected, selectedAssumptions, resolved.capacityInputs]);
  // ── The standard in force (Roadmap J5) ───────────────────────────────────
  const shrink = resolved.assumptions.yield.shrinkAllowance.value;
  const inForce = useMemo(() => standardInForce(standards, selected.code, today), [standards, selected.code, today]);
  const history = useMemo(() => standardHistory(standards, selected.code), [standards, selected.code]);
  const differs = useMemo(
    () => (inForce ? standardDiffers(inForce.snapshot, { growPlan: selected, assumptions: selectedAssumptions }) : null),
    [inForce, selected, selectedAssumptions],
  );
  const foodAtStandard = inForce ? costPlanPerUnit(inForce.snapshot.growPlan, inForce.snapshot.assumptions.yield.shrinkAllowance.value).totalInputCostPerUnit : null;
  const foodLive = costPlanPerUnit(selected, shrink).totalInputCostPerUnit;
  const [stdDate, setStdDate] = useState(today);
  const [stdNotes, setStdNotes] = useState('');
  const [stdMsg, setStdMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [stdPending, startStd] = useTransition();
  function approve() {
    startStd(async () => {
      const res = await approveStandard({ growPlanCode: selected.code, effectiveFrom: stdDate, notes: stdNotes || null });
      if (res.ok) {
        setStdMsg({ kind: 'ok', text: `Approved ${res.label}, effective ${stdDate}.` });
        setStdNotes('');
        router.refresh();
      } else setStdMsg({ kind: 'err', text: res.error });
    });
  }

  return (
    <>
      <PageHeader
        title="Grow plans"
        purpose="Pick a grow plan to see its cost per tray, its sowing and its stage schedule."
        functions={['Library', 'Grow plan lines', 'Sowing costing', 'Stage schedule', 'Nutrient profile']}
        connects={[
          { href: '/farm/grow-units', dir: 'from' },
          { href: '/farm/packaging', dir: 'from' },
          { href: '/farm/production-planning', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Every plan that can be costed, sowing-sized or planned is a library row with a status: one seed line per variety, or a mixed tray, with its medium, nutrient and light lines.</li>
            <li>The twelve seed plans are built from the variety records; the library is the source from first read.</li>
            <li>Editing a seed price here is a forecast edit measured against the library. Edit in the library changes the plan.</li>
            <li>The standard a sowing is costed at changes only when a super admin approves a version with an effective date.</li>
          </ul>
        }
        status="live"
      />

      <Card title="Library">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr><th>Code</th><th>Plan</th><th>Status</th><th>Channels</th><th className="num">Input cost / tray</th><th className="num">Harvest g</th><th className="num">Sowing</th><th className="num">Cycle</th><th /></tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const c = costPlanPerUnit(r, resolved.assumptions.yield.shrinkAllowance.value);
                const k = deriveCapacity(r, resolved.capacityInputs);
                const g = costPlan(r);
                const lib = library.find((x) => x.code === r.code) as (typeof library)[number] & { id?: string } | undefined;
                const isSel = r.code === selected.code;
                return (
                  <tr key={r.code} className={`${isSel ? 'bg-[color:var(--farm-surface-2)]!' : ''}`}>
                    <td className="farm-mono farm-fs-xs">{r.code}</td>
                    <td className={`${(isSel ? 'font-semibold!' : 'font-medium!')}`}>{r.name}<div className="farm-c-faint farm-fs-xs">{formatNameOf(r)}</div></td>
                    <td>
                      {isSuperAdmin && lib?.id ? (
                        <select className="farm-select" value={r.status} disabled={statusPending} onChange={(e) => { const status = e.target.value as GrowPlanStatus; startStatus(async () => { await setGrowPlanStatus({ id: lib.id, status }); router.refresh(); }); }}>
                          {(Object.keys(GROW_PLAN_STATUS_LABELS) as GrowPlanStatus[]).map((st) => <option key={st} value={st}>{GROW_PLAN_STATUS_LABELS[st]}</option>)}
                        </select>
                      ) : GROW_PLAN_STATUS_LABELS[r.status]}
                    </td>
                    <td>{r.channels.length === 0 ? '—' : r.channels.map((ph) => resolved.phases.find((p) => p.phase === ph)?.market ?? `Channel ${ph}`).join(', ')}</td>
                    <td className="num">{money(c.totalInputCostPerUnit)}</td>
                    <td className="num">{g ? num(g.harvestGramsPerTray, 0) : c.packedOzPerUnit.toFixed(2)}</td>
                    <td className="num">{num(k.sowingSize)}{k.grow && k.grow.sowingTrays === 0 && <div className="farm-c-faint farm-fs-2xs">no unit lights it</div>}</td>
                    <td className="num">{k.grow ? `${num(k.grow.cycleDays)} d` : '—'}</td>
                    <td className="num">{isSel ? <span className="farm-kpi-sub">selected</span> : <button type="button" className="farm-btn py-[0.1rem]! px-2!" onClick={() => setCode(r.code)}>Select</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-[0.6rem]!">
          <span className="farm-kpi-sub">
            {resolved.growPlans.length === 0 ? 'No plans.' : `Plans ${current * pageSize + 1}–${Math.min(resolved.growPlans.length, (current + 1) * pageSize)} of ${resolved.growPlans.length}`}
          </span>
          <span className="inline-flex gap-[0.4rem] items-center">
            <button type="button" className="farm-btn py-[0.1rem]! px-2!" onClick={() => setPage(0)} disabled={current === 0}>First</button>
            <button type="button" className="farm-btn py-[0.1rem]! px-2!" onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0}>Previous</button>
            <span className="farm-kpi-sub">Page {current + 1} of {pageCount}</span>
            <button type="button" className="farm-btn py-[0.1rem]! px-2!" onClick={() => setPage(Math.min(pageCount - 1, current + 1))} disabled={current >= pageCount - 1}>Next</button>
            <button type="button" className="farm-btn py-[0.1rem]! px-2!" onClick={() => setPage(pageCount - 1)} disabled={current >= pageCount - 1}>Last</button>
            <button type="button" className="farm-btn py-[0.1rem]! px-2!" onClick={() => { setPageSize(pageSize === 10 ? 25 : 10); setPage(0); }}>{pageSize === 10 ? 'Show 25 a frame' : 'Show 10 a frame'}</button>
          </span>
        </div>
        {isSuperAdmin && (
          <PageControls group="action">
            <button type="button" className="farm-btn ghost" onClick={() => setEditor(editor === 'create' ? null : 'create')}>Add grow plan</button>
          </PageControls>
        )}
        {isSuperAdmin && (
          <div className="flex gap-2 mt-3!">
            <button type="button" className="farm-btn primary" onClick={() => setEditor(editor === 'create' ? null : 'create')}>Add grow plan</button>
            {libraryGrowPlan && 'id' in libraryGrowPlan && (
              <button type="button" className="farm-btn" onClick={() => setEditor(editor === 'edit' ? null : 'edit')}>Edit {selected.code} in the library</button>
            )}
          </div>
        )}
        <div id="grow-plan-editor" className="scroll-mt-4" />
        {editor === 'create' && (
          <GrowPlanEditor mode="create" library={library} channels={resolved.phases.map((ph) => ({ phase: ph.phase, market: ph.market }))} onDone={() => setEditor(null)} />
        )}
        {editor === 'duplicate' && libraryGrowPlan && libraryPlan && (
          <GrowPlanEditor key={`dup-${libraryGrowPlan.code}`} mode="create" plan={libraryPlan} library={library} channels={resolved.phases.map((ph) => ({ phase: ph.phase, market: ph.market }))} onDone={() => setEditor(null)} />
        )}
        {editor === 'edit' && libraryGrowPlan && libraryPlan && (
          <GrowPlanEditor mode="edit" plan={libraryPlan} growPlanId={(libraryGrowPlan as { id?: string }).id} library={library} channels={resolved.phases.map((ph) => ({ phase: ph.phase, market: ph.market }))} onDone={() => setEditor(null)} />
        )}
        <p className="farm-kpi-sub mt-2">
          Production Planning plans grow plans In Service; Planned and Developing plans can be run singly. A plan lists
          the channels it is offered on. The code of a plan is the lead variety code and a serial; a mixed tray is MIX.
        </p>
      </Card>

      <PageControls>
        <GrowPlanSelector />
        {isSuperAdmin && libraryGrowPlan && (
          <button type="button" className="farm-btn ghost" aria-pressed={editor === 'duplicate'} onClick={() => setEditor(editor === 'duplicate' ? null : 'duplicate')}>Duplicate grow plan</button>
        )}
      </PageControls>
      {growCosting && (
        <Card title={`Grow plan — one ${growCosting.format.name}`}>
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead><tr><th>Kind</th><th>Line</th><th className="num">Quantity</th><th>Reads from</th><th>Price</th><th className="num">Cost per tray</th></tr></thead>
              <tbody>
                {growCosting.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{LINE_KIND_LABELS[l.line.kind]}</td>
                    <td>{l.label}</td>
                    <td className="num">{num(l.quantity, l.quantityUnit === 'g' || l.quantityUnit === 'tray-days' ? 0 : 2)} {l.quantityUnit}</td>
                    <td className="farm-kpi-sub">{l.basis}</td>
                    <td><StatusBadge status={l.status} /> <span className="farm-kpi-sub">{l.source}</span></td>
                    <td className="num">{money(l.costPerTray)}</td>
                  </tr>
                ))}
                <tr><td>Consumables</td><td>Tray set over its uses, sanitizer</td><td className="num">1 tray</td><td className="farm-kpi-sub">{growCosting.format.traySet}</td><td><StatusBadge status={growCosting.format.traySetCost.status} /></td><td className="num">{money(growCosting.perTray.consumables)}</td></tr>
              </tbody>
              <tfoot>
                <tr><td colSpan={5}><strong>One tray</strong> · seed {money(growCosting.perTray.seed)} · medium {money(growCosting.perTray.medium)} · nutrient {money(growCosting.perTray.nutrient)} · light {money(growCosting.perTray.light)} · consumables {money(growCosting.perTray.consumables)}</td><td className="num"><strong>{money(growCosting.perTray.total)}</strong></td></tr>
              </tfoot>
            </table>
          </div>
          <div className="farm-kpi-row mt-3!">
            <Kpi label="Seed per tray" value={`${num(growCosting.seedGramsPerTray, 0)} g`} />
            <Kpi label="Harvest per tray" value={`${num(growCosting.harvestGramsPerTray, 0)} g`} sub="from the variety record until a closed sowing observes it" />
            <Kpi label="Cycle" value={`${growCosting.cycleDays} days`} sub={`${growCosting.daysToHarvest} to harvest, ${growCosting.lightDays} under light`} />
            <Kpi label="Water per tray" value={`${num(growCosting.waterOzPerTray, 0)} fl oz`} sub={growCosting.measured ? 'over the cycle, measured by approved time studies' : 'over the cycle, placeholder volumes'} />
            <Kpi label="Sowing" value={`${cap.grow?.sowingTrays ?? 0} trays`} sub={cap.grow?.binding ? `one ${cap.grow.binding.unit.item}` : 'no grow unit takes this plan'} />
            <Kpi label="Ceiling" value={`${num(cap.grow?.traysPerDay ?? 0, 2)} trays/day`} sub={`${cap.grow?.totalTrays ?? 0} trays across ${cap.grow?.unitCount ?? 0} units over the cycle`} />
            <Kpi label="Unit SKU" value={unitSku(selected.code, growCosting.format.key)} sub="the plan code and the packaged format" />
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-6!">
        <div className="farm-card-title m-0!">Grow plan detail</div>
      </div>
      <Card className="mt-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="farm-page-title farm-fs-lg">{selected.name}</div>
            <div className="farm-kpi-sub mt-1!">
              {selected.code} · {formatNameOf(selected)}
            </div>
          </div>
          <div className="text-sm farm-c-soft max-w-120!">
            {varietyNamesOf(selected)}
          </div>
        </div>
        <div className="farm-kpi-sub mt-2!">
          Allergens present: {selected.allergensPresent || 'none stated'} · Allergen-free claims: {selected.allergenFreeClaims || 'none stated'}
        </div>
      </Card>

      {growCosting && cap.grow && (
        <div className="grid gap-3 mt-4 farm-autofit-11">
          <Kpi value={money(growCosting.perTray.total)} label="Input cost per tray" sub={`seed ${money(growCosting.perTray.seed)} · medium ${money(growCosting.perTray.medium)} · nutrient ${money(growCosting.perTray.nutrient)} · light ${money(growCosting.perTray.light)} · consumables ${money(growCosting.perTray.consumables)}`} />
          <Kpi value={`${num(cap.grow.sowingTrays)} trays`} label="Sowing — what one grow unit takes" sub={cap.grow.binding ? `one ${cap.grow.binding.unit.item.toLowerCase()}` : 'no grow unit takes this plan'} />
          <Kpi value={money(serve.costToServe)} label="Cost to serve" sub={`inputs ${money(serve.food)} · labor ${money(serve.directLabor)} · packaging ${money(serve.packaging)} · distribution ${money(serve.distribution)}`} />
          <Kpi value={`${num(growCosting.harvestGramsPerTray, 0)} g`} label="Harvest per tray" sub={`${num(growCosting.seedGramsPerTray, 0)} g sown · from the variety record until a closed sowing observes it`} />
          <Kpi value={money(growCosting.costPerHarvestOz, 4)} label="Input cost per harvested ounce" sub={`${money(growCosting.perTray.total / Math.max(1e-9, growCosting.harvestGramsPerTray / 453.59237))} a pound`} />
          <Kpi value={`${num(cap.grow.cycleDays)} days`} label="Cycle on the shelf" sub={`${num(cap.grow.daysToHarvest)} to the first harvest day · ${num(growCosting.lightDays)} under light`} />
          <Kpi value={num(cap.grow.traysPerDay, 2)} label="Sustained ceiling, trays a day" sub={`${num(cap.grow.totalTrays)} trays across ${num(cap.grow.unitCount)} units over the cycle`} />
          <Kpi value={unitSku(selected.code, growCosting.format.key)} label="Unit SKU" sub="the plan code and the packaged format" />
        </div>
      )}

      {growCosting && cap.grow && selected && (
        <>
          <Card title="Sowing costing → yield → costing down to the unit" className="mt-4">
            <div className="farm-scroll-x">
              <table className="farm-table">
                <tbody>
                  <tr><td>The sowing</td><td className="num">{num(cap.grow.sowingTrays)} trays</td><td className="farm-c-faint farm-fs-xs">What one grow unit takes of the {growCosting.format.name}{cap.grow.binding ? `: the ${cap.grow.binding.unit.item.toLowerCase()}` : ''}. Every line is written per tray; the sowing is trays × the tray.</td></tr>
                  <tr><td>Sowing cost — the four line kinds and consumables</td><td className="num">{money(growCosting.perTray.total * cap.grow.sowingTrays)}</td><td className="farm-c-faint farm-fs-xs">{money(growCosting.perTray.total)} a tray × {num(cap.grow.sowingTrays)}: seed {money(growCosting.perTray.seed)}, medium {money(growCosting.perTray.medium)}, nutrient {money(growCosting.perTray.nutrient)}, light {money(growCosting.perTray.light)}, consumables {money(growCosting.perTray.consumables)}.</td></tr>
                  <tr><td>Yield — harvest over seed</td><td className="num">{num(growCosting.yieldToHarvest, 2)}×</td><td className="farm-c-faint farm-fs-xs">{num(growCosting.seedGramsPerTray, 0)} g sown → {num(growCosting.harvestGramsPerTray, 0)} g harvested a tray; a live tray packs what it harvests. Measured on the sowing record when one is closed; the record figure until then.</td></tr>
                  <tr><td>Shrink allowance ({(sowing.shrinkAllowance * 100).toFixed(0)}%)</td><td className="num">{money(sowing.sowingInputCostWithShrink - sowing.sowingInputCost)}</td><td className="farm-c-faint farm-fs-xs">Trays sown and never distributed.</td></tr>
                  <tr className="total"><td>Unit input cost — one tray</td><td className="num">{money(sowing.unitInputCost, 4)}</td><td className="farm-c-faint farm-fs-xs">With the shrink allowance.</td></tr>
                  <tr><td>+ labor on the three streams</td><td className="num">{money(serve.directLabor, 4)}</td><td className="farm-c-faint farm-fs-xs">Sow day, every day on the shelf, harvest day: {num(selectedAssumptions.laborSplit.fixedMinutesPerSowing.value / Math.max(1, cap.grow.sowingTrays) + selectedAssumptions.laborSplit.variableMinutesPerUnit.value + (selectedAssumptions.laborSplit.dailyMinutesPerUnit?.value ?? 0), 1)} minutes a tray at the {money(selectedAssumptions.labor.blendedLoadedWage.value)}/h placeholder rate.</td></tr>
                  <tr><td>+ packaging</td><td className="num">{money(serve.packaging, 4)}</td><td className="farm-c-faint farm-fs-xs">Per tray.</td></tr>
                  <tr><td>+ distribution to the pickup points</td><td className="num">{money(serve.distribution, 4)}</td><td className="farm-c-faint farm-fs-xs">Per tray. Storage is a fixed cost and is not in the cost to serve.</td></tr>
                  <tr className="total"><td>Cost to serve</td><td className="num">{money(serve.costToServe, 4)}</td><td className="farm-c-faint farm-fs-xs">The cost of a unit the ledger carries is inputs, labor and packaging ({money(serve.total, 4)}); distribution is a selling cost there.</td></tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Stage schedule" className="mt-4">
            <div className="farm-scroll-x">
              <table className="farm-table">
                <thead><tr><th>Stage</th><th className="num">Days</th><th>Watering</th><th>Control point</th><th>What happens</th></tr></thead>
                <tbody>
                  {planStages(selected).filter((st) => st.key !== 'packed').map((st) => {
                    const d = planStageDays(selected)[st.key as keyof ReturnType<typeof planStageDays>];
                    return (
                      <tr key={st.key} className={d === 0 ? 'farm-c-faint' : ''}>
                        <td>{st.name}</td>
                        <td className="num">{num(d)}</td>
                        <td>{st.watering === 'none' ? '—' : `${st.watering}, ${st.wateringsPerDay} a day`}{st.underLight ? ' · under light' : ''}</td>
                        <td>{st.controlPoint ? CONTROL_POINT_BY_ID[st.controlPoint].name : '—'}</td>
                        <td className="farm-c-soft">{st.action}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="farm-kpi-sub mt-2">The days are the varieties&rsquo; ({leadVarietyOf?.stageDays.note ?? ''}) unless the plan overrides them; a mixed tray runs on the slowest variety at each stage. A nutrient line names the stage it enters the water; the light line the stage the lights come on. The control points are on <Link className="farm-link" href="/farm/produce-safety">Produce Safety</Link>.</p>
          </Card>
        </>
      )}

      {growCosting && leadVarietyOf && (
        <Card title={`Nutrient profile — ${leadVarietyOf.name}`} className="mt-4">
          <p className="farm-kpi-sub mb-2">What the variety record states, each benefit citing its rows of the science library. The targets this plan carries are what the Flat Builder reads it against.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="farm-kpi-sub">Compounds</div>
              <div>{leadVarietyOf.profile.compounds.join(', ') || '—'}</div>
              <div className="farm-kpi-sub mt-2!">Nutrients</div>
              <div>{leadVarietyOf.profile.nutrients.join(', ') || '—'}</div>
              <div className="farm-kpi-sub mt-2!">Targets carried</div>
              <div>{planTargets.map((t) => t.name).join(', ') || '—'}</div>
            </div>
            <div>
              <div className="farm-kpi-sub">Stated benefits</div>
              <ul className="list-disc pl-5">
                {leadVarietyOf.profile.benefits.map((b, i) => <li key={i}>{b.statement} <span className="farm-kpi-sub">({b.evidence}; rows {b.rows.join(', ')})</span></li>)}
                {leadVarietyOf.profile.benefits.length === 0 && <li className="farm-kpi-sub">No stated benefit on file.</li>}
              </ul>
            </div>
          </div>
        </Card>
      )}
      <GrowPlanPackagingCard
        growPlanCode={selected.code}
        growPlanId={(libraryGrowPlan as { id?: string } | undefined)?.id}
        growPlanChannels={selected.channels ?? []}
      />

      <Card title={`Standard in force — ${selected.code}`} className="mt-4">
        {stdMsg && <div className={`farm-scenariobar-msg ${stdMsg.kind} mb-[0.6rem]!`} role="status">{stdMsg.text}</div>}
        {inForce ? (
          <p className="farm-kpi-sub">
            <strong className="farm-c-ink">{standardLabel(inForce)}</strong>, effective {inForce.effectiveFrom}, approved by {inForce.approvedBy} on {inForce.approvedAt.slice(0, 10)}{inForce.notes ? ` — ${inForce.notes}` : ''}.
            Input cost per unit at the standard {money(foodAtStandard ?? 0, 4)}; at the live library and plan {money(foodLive, 4)}.
            {differs ? ' The live grow plan or assumptions differ from the standard in force; sowings are costed at the standard until a new version is approved.' : ' The live grow plan and assumptions match the standard in force.'}
          </p>
        ) : (
          <p className="farm-kpi-sub">No approved standard is in force for {selected.code} as of {today}. Sowings are costed at the live library ({selected.code}@library) and the record says so.</p>
        )}
        {isSuperAdmin && (
          <div className="flex flex-wrap gap-3 items-end mt-3!">
            <label className="farm-kpi-sub">Effective from<br /><input className="farm-input" type="date" value={stdDate} onChange={(e) => setStdDate(e.target.value)} /></label>
            <label className="farm-kpi-sub">Notes<br /><input className="farm-input w-80!" value={stdNotes} onChange={(e) => setStdNotes(e.target.value)} placeholder="what changed and why" /></label>
            <button type="button" className="farm-btn primary" onClick={approve} disabled={stdPending || !stdDate}>Approve the plan of record as the standard</button>
          </div>
        )}
        {history.length > 0 && (
          <table className="farm-table mt-3">
            <thead><tr><th>Version</th><th>Effective from</th><th>Approved by</th><th>Approved on</th><th className="num">Food $/unit</th><th>Notes</th></tr></thead>
            <tbody>
              {history.map((v) => (
                <tr key={v.id}>
                  <td className="farm-mono farm-fs-xs">{standardLabel(v)}</td>
                  <td>{v.effectiveFrom}</td>
                  <td>{v.approvedBy}</td>
                  <td>{v.approvedAt.slice(0, 10)}</td>
                  <td className="num">{money(costPlanPerUnit(v.snapshot.growPlan, v.snapshot.assumptions.yield.shrinkAllowance.value).totalInputCostPerUnit, 4)}</td>
                  <td className="farm-c-soft">{v.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="farm-kpi-sub mt-2">
          A standard is the grow plan as resolved on the plan of record plus the cost assumptions, frozen with an effective date. The ledger costs each sowing at the version in force on its production date and the sowing record names it. Editing the library or the plan changes what the next approval will freeze; it does not move a standard already in force. An effective date inside a locked period is refused.
        </p>
      </Card>

      <p className="farm-kpi-sub mt-4">
        Continue the golden path: <Link className="farm-link" href="/farm/capacity">Capacity</Link> derives the sowing size ·{' '}
        <Link className="farm-link" href="/farm/production-planning">Production Planning</Link> runs the loop ·{' '}
        <Link className="farm-link" href="/farm/financials/unit-economics">Unit Economics</Link> builds the cost per unit.
      </p>
    </>
  );
}
