'use client';

import { useMemo } from 'react';
import { PageHeader, Card, Kpi, StatusBadge, CheckPill, num } from '../_components/ui';
import { EditableNumber } from '../_components/EditableNumber';
import { SectionSave } from '../_components/SectionSave';
import { StaffingPanel } from '../_components/StaffingPanel';
import { deriveCapacity, platedPortionOz } from '../_engine';
import { BATCH_CAPACITY_BASIS_LABELS } from '../_data/capex';
import { ceilingByRecipe } from '../_engine/production-plan';
import { laborRequirement, ratedDaySlots, checkStaffing, newCrewDefaultsFor } from '../_engine/staffing';
import { RECIPE_STATUS_LABELS } from '../_data/plan-data';
import { otherCapacities, facility, type StatusTag } from '../_data/plan-data';
import { resolveScenarioInputs } from '../_engine/scenario';

/** The defaults an edit is measured against: the resolver with no overlay (Roadmap N10, C2). */
const DEFAULTS = resolveScenarioInputs({});
import { clock } from '../_data/crews';
import { useScenario } from '../_state/scenario-store';
import { useOperationsWorld } from '../_state/ledger';
import { PageControls } from '../_components/PageControls';
import { RecipeSelector, useSelectedRecipe } from '../_components/RecipeSelector';

const hoursOf = (min: number) => Math.round((min / 60) * 100) / 100;

export default function CapacityPage() {
  const { resolved, config, setCapacity, setCrew, addCrew, removeCrew } = useScenario();
  const { recipe: selectedRecipe } = useSelectedRecipe();
  // Capacity and crew inputs are forecast edits: on Plan only (Roadmap N6 slice 3).
  const { forecastEditing } = useOperationsWorld({});
  const locked = !forecastEditing;
  const C = resolved.capacityInputs;
  const D = DEFAULTS.capacityInputs;

  const cap = useMemo(() => deriveCapacity(selectedRecipe, C), [selectedRecipe, C]);
  const W = cap.chillWindow;
  // Cabinets on the Phase 1 list: parallel streams, never a multiplier on the batch or the ceiling.
  const chillerUnits = cap.bounds.find((b) => b.component === null)?.vessel.units ?? 1;

  // The rated day: every cycle the plant has, placed on the clock. Its labor
  // requirement is derived from it; proposed crews are checked against it.
  const rated = useMemo(() => laborRequirement(ratedDaySlots(cap), C), [cap, C]);
  const staffing = useMemo(() => checkStaffing(rated, resolved.crews, cap, C), [rated, resolved.crews, cap, C]);

  // Batch size by customer portion — computed inline from resolved inputs so it
  // reacts to both capacity edits and per-phase portion factors.
  const perPhase = useMemo(
    () =>
      resolved.phaseProfiles.map((p) => {
        const pf = p.portionFactor.value;
        const c = deriveCapacity(selectedRecipe, C, pf);
        const meta = resolved.phases.find((x) => x.phase === p.phase);
        return {
          phase: p.phase,
          market: meta?.market ?? `Channel ${p.phase}`,
          portionFactor: pf,
          platedPortionOz: platedPortionOz(selectedRecipe, pf).totalOz,
          chilledMassPerPortion: c.chilledMassPerPortion,
          batchSize: c.batchSize,
          maxPortionsPerDay: c.maxPortionsPerDay,
        };
      }),
    [resolved.phaseProfiles, selectedRecipe, C],
  );

  // The daily ceiling per recipe: batch sizes differ with chilled mass per
  // portion; the cycles are the same cabinets. A day serving several recipes
  // puts the sum of their batches against one set of cycles (Production Planning).
  const byRecipe = useMemo(() => ceilingByRecipe(resolved.recipes, C), [resolved.recipes, C]);

  const crewRows = useMemo(
    () => [...resolved.crews].sort((a, b) => a.startMin.value - b.startMin.value),
    [resolved.crews],
  );

  const daysTyped = config.capacity?.productionDaysPerYear !== undefined;
  const chain: Array<{ step: string; value: string; status: StatusTag; note?: string; total?: boolean }> = [
    { step: 'One blast chiller cabinet on the Phase 1 equipment list: its load in one run', value: `${num(cap.lbPerCycle)} lb per cycle`, status: cap.bounds.some((b) => b.component === null && b.vessel.basis !== 'estimated') ? 'STATED' : 'PLACEHOLDER', note: `Estimated capacity, an open field on Equipment. Planned build-outs never count.${chillerUnits > 1 ? ` ${num(chillerUnits)} cabinets are ${num(chillerUnits)} parallel streams, not one larger batch.` : ''}` },
    { step: '÷ chilled mass per portion (hot components only)', value: `${cap.chilledMassPerPortion.toFixed(4)} lb/portion`, status: 'DERIVED' },
    { step: '= portions per chiller cycle (raw)', value: num(cap.portionsPerCycleRaw, 1), status: 'DERIVED' },
    ...cap.bounds
      .filter((b) => b.component !== null)
      .map((b) => ({
        step: `${b.vessel.item}, one unit: ${num(b.vessel.capacityLb)} lb ÷ ${b.lbPerPortion.toFixed(4)} lb/portion of ${b.component}`,
        value: `${num(b.portions, 1)} portions a run`,
        status: (b.vessel.basis === 'estimated' ? 'PLACEHOLDER' : 'STATED') as StatusTag,
        note: `${BATCH_CAPACITY_BASIS_LABELS[b.vessel.basis]} capacity — an open field on Equipment`,
      })),
    { step: 'The tightest vessel bounds the batch', value: cap.binding ? `${cap.binding.vessel.item}${cap.binding.component ? ` on ${cap.binding.component}` : ''}: ${num(cap.binding.portions, 1)}` : num(cap.portionsPerCycleRaw, 1), status: 'DERIVED', note: 'A batch is one unit of each vessel it passes through — one skillet, one cabinet — never the sum of the units on the list' },
    { step: `floor to nearest ${C.batchRoundingPortions} = STANDARD BATCH SIZE`, value: `${num(cap.batchSize)} portions`, status: 'DERIVED', note: 'Derived per recipe from the Phase 1 vessels and the recipe’s mass — never typed, and never moved by time', total: true },
    { step: 'Cabinet load', value: `${cap.loadMinutes} min`, status: C.loadMinutes.status },
    { step: '+ chill stage (equipment rating; the only element on the cooling clock)', value: `${cap.chillMinutes} min`, status: C.chillMinutes.status },
    { step: '+ cabinet unload', value: `${cap.unloadMinutes} min`, status: C.unloadMinutes.status },
    { step: '= CHILLER OCCUPANCY per batch', value: `${cap.occupancyMinutes} min`, status: 'DERIVED', note: 'The minutes the cabinet is unavailable, not the chill stage alone' },
    { step: 'Operating day', value: `${clock(W.openMin)}–${clock(W.closeMin)}`, status: C.operatingOpenMin.status, note: 'How the plant is run — a presumption, not a decision' },
    {
      step: 'Cook to chiller — the recipe’s longest component cook, the crew cooking from opening',
      value: W.firstLoadAfterOpenMin === null ? 'No cook time on file' : `${W.firstLoadAfterOpenMin} min`,
      status: 'DERIVED',
      note:
        W.firstLoadBasis === 'none'
          ? `No component of ${selectedRecipe.code} has a cook time on file`
          : `${cap.thermal.longestComponent ?? 'Overnight cook'} at the high end of its stated range${cap.thermal.gaps.length ? `; ${cap.thermal.gaps.length} component gap${cap.thermal.gaps.length === 1 ? '' : 's'} on Recipes` : ''}`,
    },
    { step: 'Chill window — first load to the operating day’s close', value: `${clock(W.startMin)}–${clock(W.endMin)} = ${W.minutes} min`, status: 'DERIVED' },
    { step: '÷ occupancy = cycles per day', value: `${W.minutes} ÷ ${cap.occupancyMinutes} = ${num(cap.cyclesPerDay)} cycles`, status: 'DERIVED' },
    { step: 'batch size × cycles per day = ONE-STREAM CEILING / DAY', value: `${num(cap.maxPortionsPerDay)} portions`, status: 'DERIVED', note: `One cabinet run serially. No crew enters it.${chillerUnits > 1 ? ` The plant has ${num(chillerUnits)} cabinets; what they make together is a placement on Production Planning, not ${num(chillerUnits)} × this.` : ''}`, total: true },
    { step: '× production days per year = ONE-STREAM ANNUAL CAPACITY', value: `${num(cap.maxPortionsPerDay)} × ${num(C.productionDaysPerYear.value)} = ${num(cap.maxPortionsPerDay * C.productionDaysPerYear.value)} base portions`, status: 'DERIVED', note: daysTyped ? 'Production days typed in this forecast' : 'Production days counted from the production calendar; reconciled against the year’s demand on the P&L' },
  ];

  return (
    <>
      <PageHeader
        title="Capacity"
        purpose="See the most one chiller stream makes a day, and what limits it."
        functions={['Constraint chain', 'One-stream ceiling', 'Plant inputs', 'Chill stage', 'Staffing']}
        connects={[
          { href: '/muse/equipment', dir: 'from' },
          { href: '/muse/production-planning', dir: 'to' },
          { href: '/muse/production-planning/schedule', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A batch is one unit of each vessel it passes through, and the tightest vessel sets it.</li>
            <li>A second unit is a parallel stream, never a larger batch.</li>
            <li>Cycles per day come from one cabinet&rsquo;s occupancy and the operating day, so the ceiling here is one stream; what several cabinets make together is placed on Production Planning.</li>
            <li>Vessel sizes are estimates until they are stated on Equipment. Planned build-outs never count.</li>
            <li>Labor is derived for the rated day. Proposed crews are checked against it and never set the ceiling.</li>
          </ul>
        }
        status="live"
      />
      <PageControls><RecipeSelector /></PageControls>

      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={num(cap.lbPerCycle)} label="lb per chiller cycle" sub={chillerUnits > 1 ? `One cabinet's load; ${num(chillerUnits)} cabinets on the Phase 1 list` : 'One cabinet\'s load'} />
        <Kpi value={num(cap.batchSize)} label="Standard batch size" sub={cap.binding ? `Bound by the ${cap.binding.vessel.item.toLowerCase()}${cap.binding.component ? ` on ${cap.binding.component.toLowerCase()}` : ''}` : `Derived, floored to nearest ${C.batchRoundingPortions}`} />
        <Kpi value={`${cap.occupancyMinutes} min`} label="Chiller occupancy / batch" sub={`${cap.loadMinutes} + ${cap.chillMinutes} + ${cap.unloadMinutes}`} />
        <Kpi value={num(cap.cyclesPerDay)} label="Cycles / day, one cabinet" sub={`${clock(W.startMin)}–${clock(W.endMin)} window ÷ ${cap.occupancyMinutes} min`} />
        <Kpi value={num(cap.maxPortionsPerDay)} label="One-stream ceiling / day" sub="One cabinet run serially" />
      </div>

      <Card title="The constraint chain" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table">
            <tbody>
              {chain.map((c, i) => (
                <tr key={i} className={c.total ? 'total' : ''}>
                  <td>{c.step}</td>
                  <td className="num min-w-48!">{c.value}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="muse-c-faint muse-fs-xs">{c.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {W.loadBeforeCloseExtraCycle && (
          <p className="muse-kpi-sub mt-2">
            One more batch could be loaded at {clock(W.startMin + W.cycles * W.occupancyMinutes)} before the operating day closes at {clock(W.closeMin)}; its chill and unload would run past close. That cycle is not counted above. Whether anyone is there to unload it is a staffing finding, below.
          </p>
        )}
      </Card>

      <Card title="One-stream ceiling across the recipes in the library" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead>
              <tr><th>Recipe</th><th>Status</th><th className="num">Chilled lb / portion</th><th className="num">Batch size</th><th className="num">Cook to chiller</th><th className="num">First load</th><th className="num">Cycles / day</th><th className="num">One-stream ceiling / day</th></tr>
            </thead>
            <tbody>
              {byRecipe.map((r) => (
                <tr key={r.recipeCode} className={r.recipeCode === selectedRecipe.code ? 'total' : ''}>
                  <td>{r.recipeCode}<div className="muse-c-faint muse-fs-xs">{r.recipeName}</div></td>
                  <td>{RECIPE_STATUS_LABELS[r.status]}</td>
                  <td className="num">{r.chilledMassPerPortion.toFixed(4)}</td>
                  <td className="num">{num(r.batchSize)}</td>
                  <td className="num">{r.cookToChillMinutes === null ? '—' : `${r.cookToChillMinutes} min`}{r.thermalGaps > 0 && <div className="muse-c-faint muse-fs-2xs">{r.thermalGaps} gap{r.thermalGaps === 1 ? '' : 's'}</div>}</td>
                  <td className="num">{r.firstLoadMin === null ? '—' : clock(r.firstLoadMin)}</td>
                  <td className="num">{num(r.cyclesPerDay)}</td>
                  <td className="num">{num(r.maxPortionsPerDay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2">
          Each recipe has its own batch size because its chilled mass per portion is its own, and its own first load because its cook times are its own: the components start staggered so they finish together at the recipe&rsquo;s longest cook, at the high end of each stated range, with the crew cooking from opening. A component with no cook time on file is a gap, counted here and listed on Recipes. A production day serving several recipes places their batches earliest-ready first on whichever cabinet is free — Production Planning places them and says when the day does not fit. Ceilings here are one cabinet, per recipe alone: not additive, and not multiplied by the cabinet count.
        </p>
      </Card>

      <div className="grid gap-4 mt-4 muse-autofit-20">
        <Card title="Plant inputs">
          <p className="muse-kpi-sub mb-2">Edit any input and the whole chain recomputes.</p>
          <div className="mb-3!">
            {forecastEditing ? <SectionSave sections={['capacity']} title="capacity" /> : <p className="muse-kpi-sub">The open forecast&rsquo;s inputs, read-only on Actual. They are edited on Plan.</p>}
          </div>
          <div className="muse-scroll-x">
            <table className="muse-table">
              <tbody>
                <tr><td>Facility size</td><td className="num">{num(facility.sizeSqFt.value)} {facility.sizeSqFt.unit}</td><td><StatusBadge status={facility.sizeSqFt.status} /></td></tr>
                {(C.batchVessels ?? []).map((v) => (
                  <tr key={v.key}>
                    <td>{v.item}</td>
                    <td className="num">{num(v.capacityLb)} lb a run{v.units > 1 ? ` · ${num(v.units)} units` : ''}</td>
                    <td><StatusBadge status={v.basis === 'estimated' ? 'PLACEHOLDER' : 'STATED'} title={`${BATCH_CAPACITY_BASIS_LABELS[v.basis]} batch capacity — edited on Equipment`} /></td>
                  </tr>
                ))}
                <tr>
                  <td>Cabinet load</td>
                  <td className="num"><EditableNumber disabled={locked} value={C.loadMinutes.value} defaultValue={D.loadMinutes.value} onChange={(v) => setCapacity('loadMinutes', v)} step={5} suffix="min" ariaLabel="Chiller load minutes per batch" showBadge={false} /></td>
                  <td><StatusBadge status={D.loadMinutes.status} title={D.loadMinutes.note} /></td>
                </tr>
                <tr>
                  <td>Chill stage (160°F to 38°F, rated)</td>
                  <td className="num"><EditableNumber disabled={locked} value={C.chillMinutes.value} defaultValue={D.chillMinutes.value} onChange={(v) => setCapacity('chillMinutes', v)} step={5} suffix="min" ariaLabel="Chill stage minutes" showBadge={false} /></td>
                  <td><StatusBadge status={D.chillMinutes.status} title={D.chillMinutes.note} /></td>
                </tr>
                <tr>
                  <td>Cabinet unload</td>
                  <td className="num"><EditableNumber disabled={locked} value={C.unloadMinutes.value} defaultValue={D.unloadMinutes.value} onChange={(v) => setCapacity('unloadMinutes', v)} step={5} suffix="min" ariaLabel="Chiller unload minutes per batch" showBadge={false} /></td>
                  <td><StatusBadge status={D.unloadMinutes.status} title={D.unloadMinutes.note} /></td>
                </tr>
                <tr>
                  <td>Operating day opens (clock hours)</td>
                  <td className="num"><EditableNumber disabled={locked} value={hoursOf(C.operatingOpenMin.value)} defaultValue={hoursOf(D.operatingOpenMin.value)} onChange={(v) => setCapacity('operatingOpenMin', Math.round(v * 60))} step={0.25} max={24} suffix={`h = ${clock(C.operatingOpenMin.value)}`} ariaLabel="Operating day opens, hours from midnight" showBadge={false} /></td>
                  <td><StatusBadge status={D.operatingOpenMin.status} title={D.operatingOpenMin.note} /></td>
                </tr>
                <tr>
                  <td>Operating day closes (clock hours)</td>
                  <td className="num"><EditableNumber disabled={locked} value={hoursOf(C.operatingCloseMin.value)} defaultValue={hoursOf(D.operatingCloseMin.value)} onChange={(v) => setCapacity('operatingCloseMin', Math.round(v * 60))} step={0.25} max={24} suffix={`h = ${clock(C.operatingCloseMin.value)}`} ariaLabel="Operating day closes, hours from midnight" showBadge={false} /></td>
                  <td><StatusBadge status={D.operatingCloseMin.status} title={D.operatingCloseMin.note} /></td>
                </tr>
                <tr>
                  <td>Production days per year</td>
                  <td className="num">
                    <EditableNumber disabled={locked} value={C.productionDaysPerYear.value} onChange={(v) => setCapacity('productionDaysPerYear', v)} step={5} max={366} suffix="days" ariaLabel="Production days per year" showBadge={false} />
                    {daysTyped && forecastEditing && (
                      <button type="button" className="muse-btn ml-[0.4rem]!" onClick={() => setCapacity('productionDaysPerYear', undefined)}>
                        Count from calendar
                      </button>
                    )}
                  </td>
                  <td><StatusBadge status={daysTyped ? 'STATED' : 'DERIVED'} title={D.productionDaysPerYear.note} /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muse-kpi-sub mt-2">
            Blast chiller capacities range 30–1,300 lb. The 160°F to 38°F in 90 minutes figure is an equipment rating; the Food Code’s 135°F to 70°F in 2 hours and to 41°F in 6 hours is the regulatory limit — different measurements of different things. The 25-minute load — pouring the finished cook into 2-inch hotel pans and loading the cabinet — and the 10-minute unload are estimates, labelled as placeholders. The cabinet is not sanitized between batches: it is sanitized at the end of a shift or day, immediately after a spill, and between foods when allergens were uncovered. Defrosting is periodic maintenance, not production. No operating day has been decided; the 07:00–19:00 seed is the two-shift presumption, and opening runs one shift on smaller demand.
          </p>
        </Card>

        <Card title="Chill stage against the Food Code cooling limit — CCP-2">
          <table className="muse-table">
            <tbody>
              <tr><td>Modelled chill stage</td><td className="num">{cap.cooling.modelledChillMin} min</td><td><StatusBadge status={C.chillMinutes.status} /></td></tr>
              <tr><td>Stage one — 135°F to 70°F within</td><td className="num">{cap.cooling.stageOneLimitMin} min</td><td><CheckPill ok={cap.cooling.stageOneOk} okLabel="INSIDE" overLabel="EXCEEDED" /></td></tr>
              <tr><td>Total — 135°F to 41°F within</td><td className="num">{cap.cooling.totalLimitMin} min</td><td><CheckPill ok={cap.cooling.totalOk} okLabel="INSIDE" overLabel="EXCEEDED" /></td></tr>
              <tr className="total"><td>Headroom against the 2-hour stage</td><td className="num">{cap.cooling.marginMin} min</td><td><StatusBadge status="SOURCED" title="FDA Food Code 3-501.14" /></td></tr>
            </tbody>
          </table>
          <p className="muse-kpi-sub mt-2">
            FDA Food Code 3-501.14, two-stage cooling. Only the chill stage is on the cooling clock: the product is not in the cooling window while the cabinet is loaded or unloaded, so occupancy is not tested here. A forecast may set a chill stage the Code forbids; the check says so rather than preventing the edit.
          </p>
        </Card>
      </div>

      <Card title="Staffing — the rated day's labor requirement, and proposed crews checked against it" className="mt-4">
        <p className="muse-kpi-sub mb-3!">
          No staff count or shift pattern has been decided. The rated day places every cycle the plant has on the clock and derives the labor it needs. A crew entered here is a proposed answer: it produces findings against that requirement and never changes the ceiling above.
        </p>
        <div className="mb-3! flex gap-3 items-center flex-wrap">
          {forecastEditing ? <SectionSave sections={['crews', 'capacity']} title="crews and staffing inputs" /> : <span className="muse-kpi-sub">The open forecast&rsquo;s proposed crews, read-only on Actual. They are edited on Plan.</span>}
        </div>
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead>
              <tr><th>Proposed crew</th><th className="num">Start</th><th className="num">End</th><th className="num">Hours</th><th className="num">Headcount</th><th>Focus</th><th /></tr>
            </thead>
            <tbody>
              {crewRows.length === 0 && (
                <tr><td colSpan={7} className="muse-c-soft">No crew proposed.</td></tr>
              )}
              {crewRows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <input className="muse-input" value={c.label} disabled={locked} aria-label="Crew label" onChange={(e) => setCrew(c.id, (d) => { d.label = e.target.value; })} />
                    <div className="mt-[0.15rem]!"><StatusBadge status={c.headcount.status} title={c.headcount.note} /></div>
                  </td>
                  <td className="num"><EditableNumber disabled={locked} value={hoursOf(c.startMin.value)} onChange={(v) => setCrew(c.id, (d) => { d.startMin = Math.round(v * 60); })} step={0.25} max={24} suffix={`h = ${clock(c.startMin.value)}`} ariaLabel={`${c.label} start, hours from midnight`} showBadge={false} /></td>
                  <td className="num"><EditableNumber disabled={locked} value={hoursOf(c.endMin.value)} onChange={(v) => setCrew(c.id, (d) => { d.endMin = Math.round(v * 60); })} step={0.25} max={24} suffix={`h = ${clock(c.endMin.value)}`} ariaLabel={`${c.label} end, hours from midnight`} showBadge={false} /></td>
                  <td className="num">{hoursOf(c.endMin.value - c.startMin.value).toFixed(2)}</td>
                  <td className="num"><EditableNumber disabled={locked} value={c.headcount.value} onChange={(v) => setCrew(c.id, (d) => { d.headcount = v; })} step={1} min={0} ariaLabel={`${c.label} headcount`} showBadge={false} /></td>
                  <td className="muse-c-soft">{c.focus ?? ''}</td>
                  <td>{forecastEditing && <button type="button" className="muse-btn" onClick={() => removeCrew(c.id)}>Remove</button>}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Staffed minutes</td>
                <td colSpan={5} className="muse-c-soft">
                  {staffing.staffedSpans.length === 0 ? 'None' : staffing.staffedSpans.map((s) => `${clock(s.startMin)}–${clock(s.endMin)}`).join(', ')}
                </td>
                <td>{forecastEditing && <button type="button" className="muse-btn" onClick={() => addCrew(newCrewDefaultsFor(rated))}>Add crew</button>}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2 mb-3">
          A new crew starts on the operating day with the most people the placed tasks need at once. Staff per cabinet task:{' '}
          load <EditableNumber disabled={locked} value={C.loadStaff.value} defaultValue={D.loadStaff.value} onChange={(v) => setCapacity('loadStaff', v)} step={1} min={0} ariaLabel="People per cabinet load" showBadge={false} />{' '}
          unload <EditableNumber disabled={locked} value={C.unloadStaff.value} defaultValue={D.unloadStaff.value} onChange={(v) => setCapacity('unloadStaff', v)} step={1} min={0} ariaLabel="People per cabinet unload" showBadge={false} />{' '}
          <StatusBadge status={D.loadStaff.status} title={`${D.loadStaff.note} ${D.unloadStaff.note}`} />
        </p>
        <StaffingPanel labor={rated} staffing={staffing} crews={resolved.crews} />
      </Card>

      <div className="grid gap-4 mt-4 muse-autofit-18">
        <Card title="Other capacities — shown for comparison only">
          <table className="muse-table">
            <tbody>
              <tr><td>Combi oven pan positions</td><td className="num">{otherCapacities.combiOvenPanPositions.value} pans</td><td><StatusBadge status={otherCapacities.combiOvenPanPositions.status} /></td></tr>
              <tr><td>Tilting skillet capacity</td><td className="num">{otherCapacities.tiltingSkilletGal.value} gal</td><td><StatusBadge status={otherCapacities.tiltingSkilletGal.status} /></td></tr>
              <tr><td>Kettle capacity (100 + 60 gal)</td><td className="num">{otherCapacities.kettleGal.value} gal</td><td><StatusBadge status={otherCapacities.kettleGal.status} /></td></tr>
            </tbody>
          </table>
          <p className="muse-kpi-sub mt-2">Not yet checked against the batch’s cooked mass, so the chiller is treated as binding. Whether it stays binding is computed, not assumed, once each station’s required volume per batch is compared to its capacity.</p>
        </Card>

        <Card title="Batch size by customer portion — same recipe">
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th className="num">Portion factor</th>
                  <th className="num">Plated portion (derived)</th>
                  <th className="num">Chilled mass / portion</th>
                  <th className="num">Batch size</th>
                  <th className="num">Max portions / day</th>
                </tr>
              </thead>
              <tbody>
                {perPhase.map((e) => (
                  <tr key={e.phase}>
                    <td>{e.market}</td>
                    <td className="num">{e.portionFactor.toFixed(2)}×</td>
                    <td className="num">{e.platedPortionOz.toFixed(1)} oz</td>
                    <td className="num">{e.chilledMassPerPortion.toFixed(4)} lb</td>
                    <td className="num">{num(e.batchSize)}</td>
                    <td className="num">{num(e.maxPortionsPerDay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muse-kpi-sub mt-2">
            The chiller capacity is fixed at {num(cap.lbPerCycle)} lb per cycle. A larger customer portion
            is more chilled mass per portion, so it yields fewer portions per batch and a lower daily
            ceiling — the same recipe produces different production numbers for different customers.
          </p>
        </Card>
      </div>
    </>
  );
}
