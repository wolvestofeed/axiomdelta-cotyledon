'use client';

import { PageControls } from '@/components/PageControls';
import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, StatusBadge, money, num } from '@/components/ui';
import { EditableNumber } from '@/components/EditableNumber';
import { SectionSave } from '@/components/SectionSave';
import { sowingCosting, costCropPlan, costToServe, deriveCapacity, canopyMassPerUnit, packedUnitOz, componentCosting, reconcileToSpec } from '@/engine';
import { creditCropPlan, creditableLines, minimumUnitFactor } from '@/engine/nutrition';
import { SOWING_CAPACITY_BASIS_LABELS } from '@/data/capex';
import { allergenMatrix, CROP_PLAN_STATUS_LABELS, type CropPlanStatus } from '@/data/plan-data';
import { CropPlanSelector, useSelectedCropPlan } from '@/components/CropPlanSelector';
import { CropPlanEditor } from '@/components/CropPlanEditor';
import { setCropPlanStatus } from '@/server/crop-plan-actions';
import { approveStandard } from '@/server/standard-actions';
import { standardInForce, standardHistory, standardDiffers, standardLabel, type StandardVersionDoc } from '@/engine/standards';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useScenario } from '@/state/scenario-store';
import { useOperationsWorld } from '@/state/ledger';
import { assumptionsFor, inputKey } from '@/engine/scenario';
import { clock } from '@/data/crews';
import { RatingPill, RatingLegend, ratingHeader } from '@/components/MarkRating';
import { inputRatings, ratingFor } from '@/data/mark';
import { SupplierPicker } from '@/components/SupplierPicker';
import { useLinkedSuppliers } from '@/components/useLinkedSuppliers';
import { CropPlanPackagingCard } from '@/app/(farm)/farm/crop-plans/CropPlanPackagingCard';
import { costCarrier, isGrowPlanCarrier } from '@/engine/grow-plan-bridge';
import { LINE_KIND_LABELS } from '@/data/grow-plan';
import { unitSku } from '@/data/tray-formats';

export function CropPlansClient({ standards, today }: { standards: StandardVersionDoc[]; today: string }) {
  const { resolved, setInput, setSustainability, isSuperAdmin, library } = useScenario();
  const { cropPlan: selected, setCode } = useSelectedCropPlan();
  // Input lines and supplier links are forecast edits: on Plan only. The library,
  // packaging and standards are records and edit in both worlds (Roadmap N6 slice 3).
  const { forecastEditing } = useOperationsWorld({});
  const libraryCropPlan = library.find((r) => r.code === selected.code);
  const libraryPlan = libraryCropPlan && isGrowPlanCarrier(libraryCropPlan) ? libraryCropPlan.plan : undefined;
  const router = useRouter();
  const [editor, setEditor] = useState<'create' | 'duplicate' | 'edit' | null>(null);
  // The editor opens inside the library card; a toolbar button sits far above it, so bring it into view.
  useEffect(() => {
    if (editor) document.getElementById('crop-plan-editor')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [editor]);
  const [statusPending, startStatus] = useTransition();

  // The library view shows 10 rows a frame, or 25 when expanded; paged, so a
  // long library does not push the crop plan detail off the screen.
  const [pageSize, setPageSize] = useState<10 | 25>(10);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(resolved.cropPlans.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const pageRows = resolved.cropPlans.slice(current * pageSize, current * pageSize + pageSize);

  // The crop plan is where a line's source is set. Inputs (Scope 3),
  // Procurement and Logistics read the same link.
  const links = resolved.sustainability.inputSupplier;
  const linkedSuppliers = useLinkedSuppliers(links);
  const setLink = (name: string, id: string | undefined) =>
    setSustainability((d) => {
      const m = (d.inputSupplier ??= {});
      if (id === undefined) delete m[name];
      else m[name] = id;
      if (Object.keys(m).length === 0) delete d.inputSupplier;
    });
  const costing = useMemo(() => costCropPlan(selected), [selected]);
  const growCosting = useMemo(() => (isGrowPlanCarrier(selected) ? costCarrier(selected) : null), [selected]);
  const linesLinked = costing.lines.filter((l) => links[l.name]).length;
  const cap = useMemo(
    () => deriveCapacity(selected, resolved.capacityInputs),
    [selected, resolved.capacityInputs],
  );
  const mass = useMemo(() => canopyMassPerUnit(selected), [selected]);
  // Sowing costing → yield → costing down to the unit (the costing rule, `sowingCosting`).
  const sowing = useMemo(() => sowingCosting(selected, resolved.capacityInputs, resolved.assumptions.yield.shrinkAllowance.value), [selected, resolved.capacityInputs, resolved.assumptions.yield.shrinkAllowance.value]);
  // The selected crop plan at its OWN labor standard and packaging (Roadmap N3).
  const selectedAssumptions = useMemo(() => assumptionsFor(resolved, selected.code), [resolved, selected.code]);
  const serve = useMemo(() => costToServe(selected, selectedAssumptions, resolved.capacityInputs), [selected, selectedAssumptions, resolved.capacityInputs]);
  /** Authored quantities are shown and edited at the derived sowing: typed × this. */
  const scale = sowing.scale;
  const packed = useMemo(() => packedUnitOz(selected), [selected]);
  const trayFormat = selected.spec.trayFormat.value;
  const credit = useMemo(
    () => creditCropPlan(creditableLines(selected), trayFormat),
    [selected, trayFormat],
  );
  const minUnit = useMemo(
    () => minimumUnitFactor(creditableLines(selected), trayFormat),
    [selected, trayFormat],
  );
  const spec = useMemo(
    () => reconcileToSpec(selected, minUnit.factor, minUnit.bindingComponent),
    [selected, minUnit],
  );
  const components = useMemo(() => componentCosting(selected), [selected]);

  // ── The standard in force (Roadmap J5) ───────────────────────────────────
  const shrink = resolved.assumptions.yield.shrinkAllowance.value;
  const inForce = useMemo(() => standardInForce(standards, selected.code, today), [standards, selected.code, today]);
  const history = useMemo(() => standardHistory(standards, selected.code), [standards, selected.code]);
  const differs = useMemo(
    () => (inForce ? standardDiffers(inForce.snapshot, { cropPlan: selected, assumptions: selectedAssumptions }) : null),
    [inForce, selected, selectedAssumptions],
  );
  const foodAtStandard = inForce ? costCropPlan(inForce.snapshot.cropPlan, inForce.snapshot.assumptions.yield.shrinkAllowance.value).totalInputCostPerUnit : null;
  const foodLive = costCropPlan(selected, shrink).totalInputCostPerUnit;
  const [stdDate, setStdDate] = useState(today);
  const [stdNotes, setStdNotes] = useState('');
  const [stdMsg, setStdMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [stdPending, startStd] = useTransition();
  function approve() {
    startStd(async () => {
      const res = await approveStandard({ cropPlanCode: selected.code, effectiveFrom: stdDate, notes: stdNotes || null });
      if (res.ok) {
        setStdMsg({ kind: 'ok', text: `Approved ${res.label}, effective ${stdDate}.` });
        setStdNotes('');
        router.refresh();
      } else setStdMsg({ kind: 'err', text: res.error });
    });
  }

  // Plan-data defaults, for the "your input" comparison on each editable field.
  const defByName = useMemo(
    () => new Map((libraryCropPlan ?? selected).inputs.map((d) => [d.name, d])),
    [libraryCropPlan, selected],
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
        title="Crop plans"
        purpose="Pick a crop plan to see its cost per unit, sowing size and unit spec."
        functions={['Crop plan library', 'Unit input cost', 'Sowing costing', 'Unit spec', 'Standard in force']}
        connects={[
          { href: '/farm/grow-units', dir: 'from' },
          { href: '/farm/packaging', dir: 'from' },
          { href: '/farm/production-planning', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Every crop plan that can be costed, credited, sowing-sized or planned is a library row with a status.</li>
            <li>The code crop plan is the seed, not the source.</li>
            <li>Editing an input&rsquo;s SEED cost, quantity or yield here is a forecast edit measured against the library. Edit crop plan changes the library.</li>
            <li>The standard a sowing is costed at changes only when a super admin approves a version with an effective date.</li>
          </ul>
        }
        status="live"
      />

      <Card title="Crop plan library">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr><th>Code</th><th>Crop plan</th><th>Status</th><th>Channels</th><th className="num">Input cost / unit</th><th className="num">Packed oz</th><th className="num">Sowing</th><th className="num">Sow to blackout rack</th><th /></tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const c = costCropPlan(r, resolved.assumptions.yield.shrinkAllowance.value);
                const k = deriveCapacity(r, resolved.capacityInputs);
                const lib = library.find((x) => x.code === r.code) as (typeof library)[number] & { id?: string } | undefined;
                const isSel = r.code === selected.code;
                return (
                  <tr key={r.code} className={`${isSel ? 'bg-[color:var(--farm-surface-2)]!' : ''}`}>
                    <td className="farm-mono farm-fs-xs">{r.code}</td>
                    <td className={`${(isSel ? 'font-semibold!' : 'font-medium!')}`}>{r.name}<div className="farm-c-faint farm-fs-xs">{r.category}</div></td>
                    <td>
                      {isSuperAdmin && lib?.id ? (
                        <select className="farm-select" value={r.status} disabled={statusPending} onChange={(e) => { const status = e.target.value as CropPlanStatus; startStatus(async () => { await setCropPlanStatus({ id: lib.id, status }); router.refresh(); }); }}>
                          {(Object.keys(CROP_PLAN_STATUS_LABELS) as CropPlanStatus[]).map((st) => <option key={st} value={st}>{CROP_PLAN_STATUS_LABELS[st]}</option>)}
                        </select>
                      ) : CROP_PLAN_STATUS_LABELS[r.status]}
                    </td>
                    <td>{r.channels.length === 0 ? '—' : r.channels.map((ph) => resolved.phases.find((p) => p.phase === ph)?.market ?? `Channel ${ph}`).join(', ')}</td>
                    <td className="num">{money(c.totalInputCostPerUnit)}</td>
                    <td className="num">{c.packedOzPerUnit.toFixed(2)}</td>
                    <td className="num">{num(k.sowingSize)}</td>
                    <td className="num">{k.stage.sowToBlackoutMinutes === null ? '—' : `${k.stage.sowToBlackoutMinutes} min`}{k.stage.gaps.length > 0 && <div className="farm-c-faint farm-fs-2xs">{k.stage.gaps.length} gap{k.stage.gaps.length === 1 ? '' : 's'}</div>}</td>
                    <td className="num">{isSel ? <span className="farm-kpi-sub">selected</span> : <button type="button" className="farm-btn py-[0.1rem]! px-2!" onClick={() => setCode(r.code)}>Select</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-[0.6rem]!">
          <span className="farm-kpi-sub">
            {resolved.cropPlans.length === 0 ? 'No crop plans.' : `Crop plans ${current * pageSize + 1}–${Math.min(resolved.cropPlans.length, (current + 1) * pageSize)} of ${resolved.cropPlans.length}`}
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
            {libraryCropPlan && 'id' in libraryCropPlan && (
              <button type="button" className="farm-btn" onClick={() => setEditor(editor === 'edit' ? null : 'edit')}>Edit {selected.code} in the library</button>
            )}
          </div>
        )}
        <div id="crop-plan-editor" className="scroll-mt-4" />
        {editor === 'create' && (
          <CropPlanEditor mode="create" library={library} channels={resolved.phases.map((ph) => ({ phase: ph.phase, market: ph.market }))} onDone={() => setEditor(null)} />
        )}
        {editor === 'duplicate' && libraryCropPlan && libraryPlan && (
          <CropPlanEditor key={`dup-${libraryCropPlan.code}`} mode="create" plan={libraryPlan} library={library} channels={resolved.phases.map((ph) => ({ phase: ph.phase, market: ph.market }))} onDone={() => setEditor(null)} />
        )}
        {editor === 'edit' && libraryCropPlan && libraryPlan && (
          <CropPlanEditor mode="edit" plan={libraryPlan} cropPlanId={(libraryCropPlan as { id?: string }).id} library={library} channels={resolved.phases.map((ph) => ({ phase: ph.phase, market: ph.market }))} onDone={() => setEditor(null)} />
        )}
        <p className="farm-kpi-sub mt-2">
          Production Planning plans grow plans In Service; Planned and Developing plans can be run singly. A plan lists
          the channels it is offered on. The code of a plan is the lead variety code and a serial; a mixed tray is MIX.
        </p>
      </Card>

      <PageControls>
        <CropPlanSelector />
        {isSuperAdmin && libraryCropPlan && (
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
            <Kpi label="Water per tray" value={`${num(growCosting.waterLitersPerTray, 1)} L`} sub="over the cycle, placeholder volumes" />
            <Kpi label="Sowing" value={`${cap.grow?.sowingTrays ?? 0} trays`} sub={cap.grow?.binding ? `one ${cap.grow.binding.unit.item}` : 'no grow unit takes this plan'} />
            <Kpi label="Ceiling" value={`${num(cap.grow?.traysPerDay ?? 0, 2)} trays/day`} sub={`${cap.grow?.totalTrays ?? 0} trays across ${cap.grow?.unitCount ?? 0} units over the cycle`} />
            <Kpi label="Unit SKU" value={unitSku(selected.code, growCosting.format.key)} sub="the plan code and the packaged format" />
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-6!">
        <div className="farm-card-title m-0!">Crop plan detail</div>
      </div>
      <Card className="mt-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="farm-page-title farm-fs-lg">{selected.name}</div>
            <div className="farm-kpi-sub mt-1!">
              {selected.code} · {selected.category}
            </div>
          </div>
          <div className="text-sm farm-c-soft max-w-120!">
            {selected.components}
          </div>
        </div>
      </Card>

      <div className="grid gap-3 mt-4 farm-autofit-11">
        <Kpi value={money(costing.totalInputCostPerUnit)} label="Unit input cost" sub="Sowing cost over the sowing's units, with the shrink allowance" />
        <Kpi value={num(cap.sowingSize)} label="Sowing — one unit of each grow unit" sub={cap.binding ? `Bound by the ${cap.binding.growUnit.item.toLowerCase()}${cap.binding.component ? ` on ${cap.binding.component.toLowerCase()}` : ''} (${SOWING_CAPACITY_BASIS_LABELS[cap.binding.growUnit.basis].toLowerCase()} capacity)` : `${mass.toFixed(4)} lb canopy mass/unit`} />
        <Kpi value={money(serve.costToServe)} label="Cost to serve" sub={`Food ${money(serve.food)} · labor ${money(serve.directLabor)} · packaging ${money(serve.packaging)} · distribution ${money(serve.distribution)}`} />
        <Kpi value={`${packed.totalOz.toFixed(2)} oz`} label="Packed unit (derived)" sub={`${(mass * 16).toFixed(1)} oz hot harvested mass · ${packed.seedOz.toFixed(2)} oz as-purchased — the as-purchased figure is not the bowl`} />
        <Kpi value={money(costing.costPerPackedOz, 4)} label="Input cost / packed oz" sub={`${money(costing.costPerHarvestedLb)}/lb harvested · ${money(costing.costPerSeedLb)}/lb as-purchased`} />
        <Kpi value={num(cap.maxUnitsPerDay)} label="One-stream ceiling / day" sub={`${cap.cyclesPerDay} cycles × ${num(cap.sowingSize)} on one rack`} />
        <Kpi value={`${linesLinked} / ${costing.lines.length}`} label="Lines with a supplier linked" sub="Inherited by Procurement and Logistics" />
        <Kpi
          value={cap.stage.sowToBlackoutMinutes === null ? '—' : `${cap.stage.sowToBlackoutMinutes} min`}
          label="Sow to blackout rack"
          sub={cap.blackoutWindow.firstLoadBasis === 'none' ? 'No sow time on file' : `First load ${clock(cap.blackoutWindow.startMin)} with growing from ${clock(cap.blackoutWindow.openMin)}${cap.stage.gaps.length ? ` · ${cap.stage.gaps.length} gap${cap.stage.gaps.length === 1 ? '' : 's'}` : ''}`}
        />
      </div>

      <Card title="Sowing costing → yield → costing down to the unit" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <tbody>
              <tr><td>The sowing</td><td className="num">{num(sowing.sowingUnits)} units</td><td className="farm-c-faint farm-fs-xs">One unit of each growUnit: the tightest of the growUnits a sowing passes through{cap.binding ? `, the ${cap.binding.growUnit.item.toLowerCase()}` : ''}. The cropPlan is written for {num(sowing.authoredUnits)} units; every quantity below is scaled × {sowing.scale.toFixed(3)}.</td></tr>
              <tr><td>Sowing cost — bulk inputs as purchased</td><td className="num">{money(sowing.sowingInputCost)}</td><td className="farm-c-faint farm-fs-xs">{sowing.seedLb.toFixed(1)} lb purchased at as-purchased prices.</td></tr>
              <tr><td>Yield — harvested over purchased</td><td className="num">{(sowing.yieldHarvestedOverSeed * 100).toFixed(1)}%</td><td className="farm-c-faint farm-fs-xs">{sowing.seedLb.toFixed(1)} lb purchased → {sowing.sownLb.toFixed(1)} lb edible → {sowing.harvestedLb.toFixed(1)} lb harvested → {sowing.blackoutLb.toFixed(1)} lb blackout → {sowing.packedLb.toFixed(1)} lb packed ({(sowing.yieldPackedOverSeed * 100).toFixed(1)}% of purchased). Measured on the sowing record when one is closed; the yields on file until then.</td></tr>
              <tr><td>Shrink allowance ({(sowing.shrinkAllowance * 100).toFixed(0)}%)</td><td className="num">{money(sowing.sowingInputCostWithShrink - sowing.sowingInputCost)}</td><td className="farm-c-faint farm-fs-xs">Trim, over-packing and spoilage bought and never packed.</td></tr>
              <tr className="total"><td>Unit input cost — sowing cost ÷ units</td><td className="num">{money(sowing.unitInputCost, 4)}</td><td className="farm-c-faint farm-fs-xs">{money(sowing.sowingInputCostWithShrink)} ÷ {num(sowing.sowingUnits)}.</td></tr>
              <tr><td>+ conversion labor</td><td className="num">{money(serve.directLabor, 4)}</td><td className="farm-c-faint farm-fs-xs">The time study at the sowing, at the placeholder loaded rate.</td></tr>
              <tr><td>+ packaging</td><td className="num">{money(serve.packaging, 4)}</td><td className="farm-c-faint farm-fs-xs">Per unit.</td></tr>
              <tr><td>+ distribution to the pickup points</td><td className="num">{money(serve.distribution, 4)}</td><td className="farm-c-faint farm-fs-xs">Per unit. Storage is a fixed cost and is not in the cost to serve.</td></tr>
              <tr className="total"><td>Cost to serve</td><td className="num">{money(serve.costToServe, 4)}</td><td className="farm-c-faint farm-fs-xs">The cost of a unit the ledger carries is food, labor and packaging ({money(serve.total, 4)}); distribution is a selling cost there.</td></tr>
            </tbody>
          </table>
        </div>
        {cap.bounds.length > 0 && (
          <p className="farm-kpi-sub mt-2">
            GrowUnit bounds on the sowing, one unit each, tightest first: {cap.bounds.map((b) => `${b.growUnit.item} (${num(b.growUnit.capacityLb)} lb a run, ${SOWING_CAPACITY_BASIS_LABELS[b.growUnit.basis].toLowerCase()}${b.growUnit.units > 1 ? `, ${num(b.growUnit.units)} units as parallel streams` : ''}) on ${b.component ?? 'the blackout unit'} at ${b.lbPerUnit.toFixed(3)} lb/unit → ${num(Math.floor(b.units))} units`).join('; ')}. Capacities are open fields on <Link className="farm-link" href="/farm/grow-units">Equipment</Link>.
          </p>
        )}
      </Card>

      <Card title="Sow to blackout rack — the stage processing standards" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr><th>Hot component</th><th>Process</th><th>Equipment and mode</th><th className="num">Stated range</th><th className="num">Plan (high end)</th><th>Gap</th></tr>
            </thead>
            <tbody>
              {cap.stage.components.map((c) => (
                <tr key={c.component} className={c.component === cap.stage.longestComponent ? 'total' : ''}>
                  <td>{c.component}{c.basis && <div className="farm-c-faint farm-fs-2xs">{c.basis}</div>}</td>
                  <td>{c.process ? c.process.name : '—'}{c.process?.overnight && <div className="farm-c-faint farm-fs-2xs">Overnight, before the production day</div>}</td>
                  <td className="farm-c-soft">{c.process ? `${c.process.equipment} — ${c.process.mode}` : '—'}</td>
                  <td className="num">{c.process ? `${c.process.minMinutes}–${c.process.maxMinutes} min` : '—'}</td>
                  <td className="num">{c.minutes === null ? '—' : `${c.minutes} min`}</td>
                  <td className={`${(c.gap ? 'farm-c-placeholder' : 'farm-c-faint')}`}>{c.gap ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          The cooling clock starts the moment a sow ends: the product is poured into 2-inch hotel pans and loaded (25 minutes). The components start staggered, longest first, so they finish together and fill one blackoutRack sowing; the cropPlan&rsquo;s time to the blackoutRack is its longest component sow{cap.stage.longestComponent ? ` — ${cap.stage.longestComponent}` : ''}, read at the high end of each stated range. A component with no sow time on file is a gap and is not filled in. Source: the farm&rsquo;s stage processing standards (2026-09-14).
        </p>
      </Card>


      <Card title="Unit spec — what the packed weight is anchored to" className="mt-4">
        <p className="text-sm farm-c-soft mb-3!">
          The packed weight is not a preference. It is the weight that distributes this
          entree&rsquo;s nutrition contribution for its tray format under 7 CFR 210.10(c).
          Nutrition runs on the as-served weight of each served COMPONENT, and USDA rounds
          every component total down &mdash; to the nearest quarter ounce equivalent for
          meats/meat alternates and grains, and to the nearest eighth cup for vegetables.
        </p>
        <div className="grid gap-3 farm-autofit-11">
          <Kpi
            value={`${credit.mmaOzEq.toFixed(2)} oz eq`}
            label="Meats / meat alternates"
            sub={`Grades ${trayFormat} daily minimum ${credit.pattern.mma.dailyMin} oz eq · raw ${credit.rawMmaOzEq.toFixed(3)}`}
          />
          <Kpi
            value={`${credit.grainsOzEq.toFixed(2)} oz eq`}
            label="Grains"
            sub={`Grades ${trayFormat} daily minimum ${credit.pattern.grains.dailyMin} oz eq · raw ${credit.rawGrainsOzEq.toFixed(3)}`}
          />
          <Kpi
            value={`${credit.vegCups.toFixed(3)} cup`}
            label="Vegetables"
            sub={`Grades ${trayFormat} daily minimum ${credit.pattern.vegetables.dailyMin} cup · the entree does not carry the whole requirement`}
          />
          <Kpi
            value={`${((1 - minUnit.factor) * 100).toFixed(1)}%`}
            label="Unit headroom"
            sub={`The unit can fall this far before the grades ${trayFormat} ${minUnit.bindingComponent === 'GRAINS' ? 'grain' : 'meats/meat alternates'} daily minimum is not met`}
          />
        </div>

        <div className="farm-scroll-x mt-4!">
          <table className="farm-table">
            <thead>
              <tr>
                <th>Served component</th>
                <th>Blackout?</th>
                <th className="num">Packed oz</th>
                <th className="num">$ / unit</th>
                <th className="num">$ / lb harvested</th>
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
                    <td className="farm-c-soft">{cost?.isHot ? 'Hot' : 'Cold-pack'}</td>
                    <td className="num">{(cost?.packedOz ?? 0).toFixed(3)}</td>
                    <td className="num">{money(cost?.costPerUnit ?? 0, 4)}</td>
                    <td className="num">{cost?.harvestedCostPerLb == null ? '—' : money(cost.harvestedCostPerLb)}</td>
                    <td className="num">{k.mmaOzEqRaw > 0 ? k.mmaOzEqRaw.toFixed(3) : '—'}</td>
                    <td className="num">{k.grainsOzEqRaw > 0 ? k.grainsOzEqRaw.toFixed(3) : '—'}</td>
                    <td className="num">{k.vegCupsRaw > 0 ? k.vegCupsRaw.toFixed(3) : '—'}</td>
                  </tr>
                );
              })}
              <tr className="total">
                <td colSpan={2}>Packed unit</td>
                <td className="num">{costing.packedOzPerUnit.toFixed(3)}</td>
                <td className="num">{money(costing.inputCostPerUnit, 4)}</td>
                <td className="num">{money(costing.costPerHarvestedLb)}</td>
                <td className="num">{credit.rawMmaOzEq.toFixed(3)}</td>
                <td className="num">{credit.rawGrainsOzEq.toFixed(3)}</td>
                <td className="num">{credit.rawVegCups.toFixed(3)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="text-sm farm-c-soft mt-3! grid! gap-[0.35rem]!">
          <div>
            <strong className="farm-c-ink">As-purchased is not the bowl.</strong>{' '}
            One unit is {packed.seedOz.toFixed(2)} oz as purchased and{' '}
            {costing.packedOzPerUnit.toFixed(2)} oz packed. Dry rice and dry beans take on
            water; the two columns are different weights of the same unit.
          </div>
          <div>
            <strong className="farm-c-ink">Spec floor.</strong>{' '}
            {spec.specPackedOz.toFixed(2)} oz is the lightest packed unit that still meets the
            grades {trayFormat} daily minimums, binding on{' '}
            {minUnit.bindingComponent === 'GRAINS' ? 'grains' : 'meats/meat alternates'}.
            {spec.growUnitCapacityOz !== null
              ? ` The serving grow unit holds ${spec.growUnitCapacityOz} oz.`
              : ' No serving grow unit capacity is on file.'}
          </div>
          <div>
            <strong className="farm-c-ink">Tray format.</strong>{' '}
            <StatusBadge
              status={selected.spec.trayFormat.status}
              title={selected.spec.trayFormat.note}
            />{' '}
            {selected.spec.trayFormat.note}
          </div>
          {credit.blocked.length > 0 && (
            <div>
              <strong className="farm-c-ink">Not credited:</strong>{' '}
              {credit.blocked.join(' ')}
            </div>
          )}
        </div>
      </Card>

      <CropPlanPackagingCard
        cropPlanCode={selected.code}
        cropPlanId={(libraryCropPlan as { id?: string } | undefined)?.id}
        cropPlanChannels={selected.channels ?? []}
      />

      <Card title={`Input lines — the ${num(sowing.sowingUnits)}-unit sowing`} className="mt-4">
        <div className="mb-3!">
          {forecastEditing ? <SectionSave sections={['inputs', 'sustainability']} title="the crop plan" /> : <p className="farm-kpi-sub">The open forecast&rsquo;s input lines, read-only on Actual. They are edited on Plan.</p>}
        </div>
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr>
                <th>Input</th>
                <th>{ratingHeader()}</th>
                <th>Supplier</th>
                <th>Blackout?</th>
                <th className="num">As purchased / sowing</th>
                <th className="num">Yield (× SEED)</th>
                <th className="num">Harvested / sowing</th>
                <th className="num">As served, oz / unit</th>
                <th className="num">SEED $/unit</th>
                <th className="num">$ / lb SEED</th>
                <th className="num">$ / lb harvested</th>
                <th className="num">$ / packed oz</th>
                <th className="num">$ / sowing</th>
                <th className="num">$ / unit</th>
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
                    <td><RatingPill rating={ratingFor(inputRatings, l.name)} /></td>
                    <td>
                      <SupplierPicker
                        input={l.name}
                        linked={links[l.name] ? linkedSuppliers[links[l.name]] ?? null : null}
                        canEdit={isSuperAdmin && forecastEditing}
                        onLink={(id) => setLink(l.name, id)}
                      />
                    </td>
                    <td className="farm-c-soft">{l.isHotComponent ? 'Hot' : 'Cold-pack'}</td>
                    <td className="num">
                      <EditableNumber
                        disabled={!forecastEditing}
                        value={l.seedQtyPerSowing * scale}
                        defaultValue={def === undefined ? undefined : def.seedQtyPerSowing * scale}
                        onChange={(v) => setInput(selected.code, l.name, 'seedQtyPerSowing', scale > 0 ? v / scale : v)}
                        step={0.125}
                        suffix={l.unit}
                        ariaLabel={`${l.name} as-purchased quantity for the sowing`}
                        showBadge={false}
                      />
                    </td>
                    <td className="num">
                      <EditableNumber
                        disabled={!forecastEditing}
                        value={l.yieldToHarvest}
                        defaultValue={def?.yieldToHarvest}
                        onChange={(v) => setInput(selected.code, l.name, 'yieldToHarvest', v)}
                        step={0.05}
                        suffix="×"
                        ariaLabel={`${l.name} yield to harvest`}
                        showBadge={false}
                      />
                      <div className="mt-[0.15rem]!"><StatusBadge status={l.yieldStatus} title={l.yieldSource} /></div>
                    </td>
                    <td className="num">{num(l.harvestedYieldPerSowing * scale, 2)}</td>
                    <td className="num">{l.packedOz.toFixed(3)}</td>
                    <td className="num">
                      <EditableNumber
                        disabled={!forecastEditing}
                        value={l.seedUnitCost}
                        defaultValue={def?.seedUnitCost}
                        onChange={(v) => setInput(selected.code, l.name, 'seedUnitCost', v)}
                        step={0.05}
                        prefix="$"
                        ariaLabel={`${l.name} as-purchased unit cost`}
                        showBadge={false}
                      />
                      {/* Where the price came from: the supplier catalog when one is on
                          file, else the crop plan's own figure with the reason why. */}
                      {(() => {
                        const pr = resolved.inputPrices[inputKey(selected.code, l.name)];
                        return (
                          <div className="mt-[0.15rem]!">
                            <StatusBadge status={l.status} title={pr?.gap ? `${l.source} — ${pr.gap}` : l.source} />
                          </div>
                        );
                      })()}
                    </td>
                    <td className="num">{l.seedCostPerLb === null ? '—' : money(l.seedCostPerLb)}</td>
                    <td className="num">{l.harvestedCostPerLb === null ? '—' : money(l.harvestedCostPerLb)}</td>
                    <td className="num">{l.costPerPackedOz === null ? '—' : money(l.costPerPackedOz, 4)}</td>
                    <td className="num">{money(l.extCostPerSowing * scale)}</td>
                    <td className="num">{money(l.costPerUnit, 4)}</td>
                  </tr>
                );
              })}
              <tr className="total">
                <td colSpan={12}>Subtotal — input cost</td>
                <td className="num">{money(costing.inputCostPerSowing * scale)}</td>
                <td className="num">{money(costing.inputCostPerUnit, 4)}</td>
              </tr>
              <tr>
                <td colSpan={12} className="farm-c-soft">Waste / shrink allowance ({(resolved.assumptions.yield.shrinkAllowance.value * 100).toFixed(0)}%)</td>
                <td />
                <td className="num">{money(costing.shrinkPerUnit, 4)}</td>
              </tr>
              <tr className="total">
                <td colSpan={8}>Total input cost per unit</td>
                <td />
                <td className="num">{money(costing.totalInputCostPerUnit, 4)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <RatingLegend />
        <p className="farm-kpi-sub mt-2">
          Quantities are shown for the sowing — one unit of each Phase 1 growUnit — and stored for the {num(selected.sowingUnits)} units the
          cropPlan is written for. Editing an as-purchased quantity or a yield recomputes the harvested yield, which drives the
          mass per unit and therefore the sowing. Cold-pack components (tortilla, cheese) are excluded from
          canopy mass, which is why they don’t move the sowing size. The supplier on a line is set
          here and read everywhere else: it carries the certification and rating shown on{' '}
          <Link className="farm-link" href="/farm/procurement">Procurement</Link>, the inbound
          ton-miles on <Link className="farm-link" href="/farm/sustainability/logistics">Logistics</Link>,
          and the supplier figures offered on{' '}
          <Link className="farm-link" href="/farm/sustainability/inputs">Inputs (Scope 3)</Link>.
          The link is part of the scenario, saved with a forecast.
        </p>
      </Card>

      <Card title="Allergen matrix" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
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
                    <td key={label} className={`num ${(row[key] ? 'farm-c-accent' : 'farm-c-faint')} ${(row[key] ? 'font-semibold!' : 'font-normal!')}`}>
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
        {stdMsg && <div className={`farm-scenariobar-msg ${stdMsg.kind} mb-[0.6rem]!`} role="status">{stdMsg.text}</div>}
        {inForce ? (
          <p className="farm-kpi-sub">
            <strong className="farm-c-ink">{standardLabel(inForce)}</strong>, effective {inForce.effectiveFrom}, approved by {inForce.approvedBy} on {inForce.approvedAt.slice(0, 10)}{inForce.notes ? ` — ${inForce.notes}` : ''}.
            Input cost per unit at the standard {money(foodAtStandard ?? 0, 4)}; at the live library and plan {money(foodLive, 4)}.
            {differs ? ' The live crop plan or assumptions differ from the standard in force; sowings are costed at the standard until a new version is approved.' : ' The live crop plan and assumptions match the standard in force.'}
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
                  <td className="num">{money(costCropPlan(v.snapshot.cropPlan, v.snapshot.assumptions.yield.shrinkAllowance.value).totalInputCostPerUnit, 4)}</td>
                  <td className="farm-c-soft">{v.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="farm-kpi-sub mt-2">
          A standard is the cropPlan as resolved on the plan of record plus the cost assumptions, frozen with an effective date. The ledger costs each sowing at the version in force on its production date and the sowing record names it. Editing the library or the plan changes what the next approval will freeze; it does not move a standard already in force. An effective date inside a locked period is refused.
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
