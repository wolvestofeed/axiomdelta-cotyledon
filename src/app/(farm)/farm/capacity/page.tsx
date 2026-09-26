'use client';

import { useMemo } from 'react';
import { PageHeader, Card, Kpi, StatusBadge, CheckPill, num } from '@/components/ui';
import { EditableNumber } from '@/components/EditableNumber';
import { SectionSave } from '@/components/SectionSave';
import { StaffingPanel } from '@/components/StaffingPanel';
import { deriveCapacity, packedUnitOz } from '@/engine';
import { SOWING_CAPACITY_BASIS_LABELS } from '@/data/capex';
import { ceilingByCropPlan } from '@/engine/production-plan';
import { laborRequirement, ratedDaySlots, checkStaffing, newCrewDefaultsFor } from '@/engine/staffing';
import { CROP_PLAN_STATUS_LABELS } from '@/data/plan-data';
import { otherCapacities, facility, type StatusTag } from '@/data/plan-data';
import { resolveScenarioInputs } from '@/engine/scenario';

/** The defaults an edit is measured against: the resolver with no overlay (Roadmap N10, C2). */
const DEFAULTS = resolveScenarioInputs({});
import { clock } from '@/data/crews';
import { useScenario } from '@/state/scenario-store';
import { useOperationsWorld } from '@/state/ledger';
import { PageControls } from '@/components/PageControls';
import { CropPlanSelector, useSelectedCropPlan } from '@/components/CropPlanSelector';

const hoursOf = (min: number) => Math.round((min / 60) * 100) / 100;

export default function CapacityPage() {
  const { resolved, config, setCapacity, setCrew, addCrew, removeCrew } = useScenario();
  const { cropPlan: selectedCropPlan } = useSelectedCropPlan();
  // Capacity and crew inputs are forecast edits: on Plan only (Roadmap N6 slice 3).
  const { forecastEditing } = useOperationsWorld({});
  const locked = !forecastEditing;
  const C = resolved.capacityInputs;
  const D = DEFAULTS.capacityInputs;

  const cap = useMemo(() => deriveCapacity(selectedCropPlan, C), [selectedCropPlan, C]);
  const W = cap.blackoutWindow;
  // Racks on the Phase 1 list: parallel streams, never a multiplier on the sowing or the ceiling.
  const blackoutRackUnits = cap.bounds.find((b) => b.component === null)?.growUnit.units ?? 1;

  // The rated day: every cycle the plant has, placed on the clock. Its labor
  // requirement is derived from it; proposed crews are checked against it.
  const rated = useMemo(() => laborRequirement(ratedDaySlots(cap), C), [cap, C]);
  const staffing = useMemo(() => checkStaffing(rated, resolved.crews, cap, C), [rated, resolved.crews, cap, C]);

  // Sowing size by subscriber unit — computed inline from resolved inputs so it
  // reacts to both capacity edits and per-phase unit factors.
  const perPhase = useMemo(
    () =>
      resolved.phaseProfiles.map((p) => {
        const pf = p.unitFactor.value;
        const c = deriveCapacity(selectedCropPlan, C, pf);
        const meta = resolved.phases.find((x) => x.phase === p.phase);
        return {
          phase: p.phase,
          market: meta?.market ?? `Channel ${p.phase}`,
          unitFactor: pf,
          packedUnitOz: packedUnitOz(selectedCropPlan, pf).totalOz,
          canopyMassPerUnit: c.canopyMassPerUnit,
          sowingSize: c.sowingSize,
          maxUnitsPerDay: c.maxUnitsPerDay,
        };
      }),
    [resolved.phaseProfiles, selectedCropPlan, C],
  );

  // The daily ceiling per crop plan: sowing sizes differ with canopy mass per
  // unit; the cycles are the same racks. A day serving several crop plans
  // puts the sum of their sowings against one set of cycles (Production Planning).
  const byCropPlan = useMemo(() => ceilingByCropPlan(resolved.cropPlans, C), [resolved.cropPlans, C]);

  const crewRows = useMemo(
    () => [...resolved.crews].sort((a, b) => a.startMin.value - b.startMin.value),
    [resolved.crews],
  );

  const daysTyped = config.capacity?.productionDaysPerYear !== undefined;
  const chain: Array<{ step: string; value: string; status: StatusTag; note?: string; total?: boolean }> = [
    { step: 'One blackout rack rack on the Phase 1 equipment list: its load in one run', value: `${num(cap.lbPerCycle)} lb per cycle`, status: cap.bounds.some((b) => b.component === null && b.growUnit.basis !== 'estimated') ? 'STATED' : 'PLACEHOLDER', note: `Estimated capacity, an open field on Equipment. Planned build-outs never count.${blackoutRackUnits > 1 ? ` ${num(blackoutRackUnits)} racks are ${num(blackoutRackUnits)} parallel streams, not one larger sowing.` : ''}` },
    { step: '÷ canopy mass per unit (hot components only)', value: `${cap.canopyMassPerUnit.toFixed(4)} lb/unit`, status: 'DERIVED' },
    { step: '= units per blackout rack cycle (raw)', value: num(cap.unitsPerCycleRaw, 1), status: 'DERIVED' },
    ...cap.bounds
      .filter((b) => b.component !== null)
      .map((b) => ({
        step: `${b.growUnit.item}, one unit: ${num(b.growUnit.capacityLb)} lb ÷ ${b.lbPerUnit.toFixed(4)} lb/unit of ${b.component}`,
        value: `${num(b.units, 1)} units a run`,
        status: (b.growUnit.basis === 'estimated' ? 'PLACEHOLDER' : 'STATED') as StatusTag,
        note: `${SOWING_CAPACITY_BASIS_LABELS[b.growUnit.basis]} capacity — an open field on Equipment`,
      })),
    { step: 'The tightest grow unit bounds the sowing', value: cap.binding ? `${cap.binding.growUnit.item}${cap.binding.component ? ` on ${cap.binding.component}` : ''}: ${num(cap.binding.units, 1)}` : num(cap.unitsPerCycleRaw, 1), status: 'DERIVED', note: 'A sowing is one unit of each grow unit it passes through — one shelf, one rack — never the sum of the units on the list' },
    { step: `floor to nearest ${C.sowingRoundingUnits} = STANDARD SOWING SIZE`, value: `${num(cap.sowingSize)} units`, status: 'DERIVED', note: 'Derived per crop plan from the Phase 1 grow units and the crop plan’s mass — never typed, and never moved by time', total: true },
    { step: 'Rack load', value: `${cap.loadMinutes} min`, status: C.loadMinutes.status },
    { step: '+ blackout stage (equipment rating; the only element on the cooling clock)', value: `${cap.blackoutMinutes} min`, status: C.blackoutMinutes.status },
    { step: '+ rack unload', value: `${cap.unloadMinutes} min`, status: C.unloadMinutes.status },
    { step: '= BLACKOUT RACK OCCUPANCY per sowing', value: `${cap.occupancyMinutes} min`, status: 'DERIVED', note: 'The minutes the rack is unavailable, not the blackout stage alone' },
    { step: 'Operating day', value: `${clock(W.openMin)}–${clock(W.closeMin)}`, status: C.operatingOpenMin.status, note: 'How the plant is run — a presumption, not a decision' },
    {
      step: 'Sow to blackout rack — the crop plan’s longest component sow, the crew growing from opening',
      value: W.firstLoadAfterOpenMin === null ? 'No sow time on file' : `${W.firstLoadAfterOpenMin} min`,
      status: 'DERIVED',
      note:
        W.firstLoadBasis === 'none'
          ? `No component of ${selectedCropPlan.code} has a sow time on file`
          : `${cap.stage.longestComponent ?? 'Overnight sow'} at the high end of its stated range${cap.stage.gaps.length ? `; ${cap.stage.gaps.length} component gap${cap.stage.gaps.length === 1 ? '' : 's'} on CropPlans` : ''}`,
    },
    { step: 'Blackout window — first load to the operating day’s close', value: `${clock(W.startMin)}–${clock(W.endMin)} = ${W.minutes} min`, status: 'DERIVED' },
    { step: '÷ occupancy = cycles per day', value: `${W.minutes} ÷ ${cap.occupancyMinutes} = ${num(cap.cyclesPerDay)} cycles`, status: 'DERIVED' },
    { step: 'sowing size × cycles per day = ONE-STREAM CEILING / DAY', value: `${num(cap.maxUnitsPerDay)} units`, status: 'DERIVED', note: `One rack run serially. No crew enters it.${blackoutRackUnits > 1 ? ` The plant has ${num(blackoutRackUnits)} racks; what they make together is a placement on Production Planning, not ${num(blackoutRackUnits)} × this.` : ''}`, total: true },
    { step: '× production days per year = ONE-STREAM ANNUAL CAPACITY', value: `${num(cap.maxUnitsPerDay)} × ${num(C.productionDaysPerYear.value)} = ${num(cap.maxUnitsPerDay * C.productionDaysPerYear.value)} base units`, status: 'DERIVED', note: daysTyped ? 'Production days typed in this forecast' : 'Production days counted from the production calendar; reconciled against the year’s demand on the P&L' },
  ];

  return (
    <>
      <PageHeader
        title="Capacity"
        purpose="See the most one blackout rack stream makes a day, and what limits it."
        functions={['Constraint chain', 'One-stream ceiling', 'Plant inputs', 'Blackout stage', 'Staffing']}
        connects={[
          { href: '/farm/grow-units', dir: 'from' },
          { href: '/farm/production-planning', dir: 'to' },
          { href: '/farm/production-planning/schedule', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A sowing is one unit of each grow unit it passes through, and the tightest grow unit sets it.</li>
            <li>A second unit is a parallel stream, never a larger sowing.</li>
            <li>Cycles per day come from one rack&rsquo;s occupancy and the operating day, so the ceiling here is one stream; what several racks make together is placed on Production Planning.</li>
            <li>Grow unit sizes are estimates until they are stated on Equipment. Planned build-outs never count.</li>
            <li>Labor is derived for the rated day. Proposed crews are checked against it and never set the ceiling.</li>
          </ul>
        }
        status="live"
      />
      <PageControls><CropPlanSelector /></PageControls>

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={num(cap.lbPerCycle)} label="lb per blackout rack cycle" sub={blackoutRackUnits > 1 ? `One rack's load; ${num(blackoutRackUnits)} racks on the Phase 1 list` : 'One rack\'s load'} />
        <Kpi value={num(cap.sowingSize)} label="Standard sowing size" sub={cap.binding ? `Bound by the ${cap.binding.growUnit.item.toLowerCase()}${cap.binding.component ? ` on ${cap.binding.component.toLowerCase()}` : ''}` : `Derived, floored to nearest ${C.sowingRoundingUnits}`} />
        <Kpi value={`${cap.occupancyMinutes} min`} label="Blackout rack occupancy / sowing" sub={`${cap.loadMinutes} + ${cap.blackoutMinutes} + ${cap.unloadMinutes}`} />
        <Kpi value={num(cap.cyclesPerDay)} label="Cycles / day, one rack" sub={`${clock(W.startMin)}–${clock(W.endMin)} window ÷ ${cap.occupancyMinutes} min`} />
        <Kpi value={num(cap.maxUnitsPerDay)} label="One-stream ceiling / day" sub="One rack run serially" />
      </div>

      <Card title="The constraint chain" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <tbody>
              {chain.map((c, i) => (
                <tr key={i} className={c.total ? 'total' : ''}>
                  <td>{c.step}</td>
                  <td className="num min-w-48!">{c.value}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="farm-c-faint farm-fs-xs">{c.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {W.loadBeforeCloseExtraCycle && (
          <p className="farm-kpi-sub mt-2">
            One more sowing could be loaded at {clock(W.startMin + W.cycles * W.occupancyMinutes)} before the operating day closes at {clock(W.closeMin)}; its blackout and unload would run past close. That cycle is not counted above. Whether anyone is there to unload it is a staffing finding, below.
          </p>
        )}
      </Card>

      <Card title="One-stream ceiling across the crop plans in the library" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr><th>Crop plan</th><th>Status</th><th className="num">Blackout lb / unit</th><th className="num">Sowing size</th><th className="num">Sow to blackout rack</th><th className="num">First load</th><th className="num">Cycles / day</th><th className="num">One-stream ceiling / day</th></tr>
            </thead>
            <tbody>
              {byCropPlan.map((r) => (
                <tr key={r.cropPlanCode} className={r.cropPlanCode === selectedCropPlan.code ? 'total' : ''}>
                  <td>{r.cropPlanCode}<div className="farm-c-faint farm-fs-xs">{r.cropPlanName}</div></td>
                  <td>{CROP_PLAN_STATUS_LABELS[r.status]}</td>
                  <td className="num">{r.canopyMassPerUnit.toFixed(4)}</td>
                  <td className="num">{num(r.sowingSize)}</td>
                  <td className="num">{r.sowToBlackoutMinutes === null ? '—' : `${r.sowToBlackoutMinutes} min`}{r.stageGaps > 0 && <div className="farm-c-faint farm-fs-2xs">{r.stageGaps} gap{r.stageGaps === 1 ? '' : 's'}</div>}</td>
                  <td className="num">{r.firstLoadMin === null ? '—' : clock(r.firstLoadMin)}</td>
                  <td className="num">{num(r.cyclesPerDay)}</td>
                  <td className="num">{num(r.maxUnitsPerDay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          Each cropPlan has its own sowing size because its canopy mass per unit is its own, and its own first load because its sow times are its own: the components start staggered so they finish together at the cropPlan&rsquo;s longest sow, at the high end of each stated range, with the crew growing from opening. A component with no sow time on file is a gap, counted here and listed on CropPlans. A production day serving several cropPlans places their sowings earliest-ready first on whichever rack is free — Production Planning places them and says when the day does not fit. Ceilings here are one rack, per cropPlan alone: not additive, and not multiplied by the rack count.
        </p>
      </Card>

      <div className="grid gap-4 mt-4 farm-autofit-20">
        <Card title="Plant inputs">
          <p className="farm-kpi-sub mb-2">Edit any input and the whole chain recomputes.</p>
          <div className="mb-3!">
            {forecastEditing ? <SectionSave sections={['capacity']} title="capacity" /> : <p className="farm-kpi-sub">The open forecast&rsquo;s inputs, read-only on Actual. They are edited on Plan.</p>}
          </div>
          <div className="farm-scroll-x">
            <table className="farm-table">
              <tbody>
                <tr><td>Facility size</td><td className="num">{num(facility.sizeSqFt.value)} {facility.sizeSqFt.unit}</td><td><StatusBadge status={facility.sizeSqFt.status} /></td></tr>
                {(C.sowingGrowUnits ?? []).map((v) => (
                  <tr key={v.key}>
                    <td>{v.item}</td>
                    <td className="num">{num(v.capacityLb)} lb a run{v.units > 1 ? ` · ${num(v.units)} units` : ''}</td>
                    <td><StatusBadge status={v.basis === 'estimated' ? 'PLACEHOLDER' : 'STATED'} title={`${SOWING_CAPACITY_BASIS_LABELS[v.basis]} sowing capacity — edited on Equipment`} /></td>
                  </tr>
                ))}
                <tr>
                  <td>Rack load</td>
                  <td className="num"><EditableNumber disabled={locked} value={C.loadMinutes.value} defaultValue={D.loadMinutes.value} onChange={(v) => setCapacity('loadMinutes', v)} step={5} suffix="min" ariaLabel="Blackout rack load minutes per sowing" showBadge={false} /></td>
                  <td><StatusBadge status={D.loadMinutes.status} title={D.loadMinutes.note} /></td>
                </tr>
                <tr>
                  <td>Blackout stage (160°F to 38°F, rated)</td>
                  <td className="num"><EditableNumber disabled={locked} value={C.blackoutMinutes.value} defaultValue={D.blackoutMinutes.value} onChange={(v) => setCapacity('blackoutMinutes', v)} step={5} suffix="min" ariaLabel="Blackout stage minutes" showBadge={false} /></td>
                  <td><StatusBadge status={D.blackoutMinutes.status} title={D.blackoutMinutes.note} /></td>
                </tr>
                <tr>
                  <td>Rack unload</td>
                  <td className="num"><EditableNumber disabled={locked} value={C.unloadMinutes.value} defaultValue={D.unloadMinutes.value} onChange={(v) => setCapacity('unloadMinutes', v)} step={5} suffix="min" ariaLabel="Blackout rack unload minutes per sowing" showBadge={false} /></td>
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
                      <button type="button" className="farm-btn ml-[0.4rem]!" onClick={() => setCapacity('productionDaysPerYear', undefined)}>
                        Count from calendar
                      </button>
                    )}
                  </td>
                  <td><StatusBadge status={daysTyped ? 'STATED' : 'DERIVED'} title={D.productionDaysPerYear.note} /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="farm-kpi-sub mt-2">
            Blackout rack capacities range 30–1,300 lb. The 160°F to 38°F in 90 minutes figure is an equipment rating; the Food Code’s 135°F to 70°F in 2 hours and to 41°F in 6 hours is the regulatory limit — different measurements of different things. The 25-minute load — pouring the finished sow into 2-inch hotel pans and loading the rack — and the 10-minute unload are estimates, labelled as placeholders. The rack is not sanitized between sowings: it is sanitized at the end of a shift or day, immediately after a spill, and between foods when allergens were uncovered. Defrosting is periodic maintenance, not production. No operating day has been decided; the 07:00–19:00 seed is the two-shift presumption, and opening runs one shift on smaller demand.
          </p>
        </Card>

        <Card title="Blackout stage against the Food Code cooling limit — control-point-2">
          <table className="farm-table">
            <tbody>
              <tr><td>Modelled blackout stage</td><td className="num">{cap.cooling.modelledBlackoutMin} min</td><td><StatusBadge status={C.blackoutMinutes.status} /></td></tr>
              <tr><td>Stage one — 135°F to 70°F within</td><td className="num">{cap.cooling.stageOneLimitMin} min</td><td><CheckPill ok={cap.cooling.stageOneOk} okLabel="INSIDE" overLabel="EXCEEDED" /></td></tr>
              <tr><td>Total — 135°F to 41°F within</td><td className="num">{cap.cooling.totalLimitMin} min</td><td><CheckPill ok={cap.cooling.totalOk} okLabel="INSIDE" overLabel="EXCEEDED" /></td></tr>
              <tr className="total"><td>Headroom against the 2-hour stage</td><td className="num">{cap.cooling.marginMin} min</td><td><StatusBadge status="SOURCED" title="FDA Food Code 3-501.14" /></td></tr>
            </tbody>
          </table>
          <p className="farm-kpi-sub mt-2">
            FDA Food Code 3-501.14, two-stage cooling. Only the blackout stage is on the cooling clock: the product is not in the cooling window while the rack is loaded or unloaded, so occupancy is not tested here. A forecast may set a blackout stage the Code forbids; the check says so rather than preventing the edit.
          </p>
        </Card>
      </div>

      <Card title="Staffing — the rated day's labor requirement, and proposed crews checked against it" className="mt-4">
        <p className="farm-kpi-sub mb-3!">
          No staff count or shift pattern has been decided. The rated day places every cycle the plant has on the clock and derives the labor it needs. A crew entered here is a proposed answer: it produces findings against that requirement and never changes the ceiling above.
        </p>
        <div className="mb-3! flex gap-3 items-center flex-wrap">
          {forecastEditing ? <SectionSave sections={['crews', 'capacity']} title="crews and staffing inputs" /> : <span className="farm-kpi-sub">The open forecast&rsquo;s proposed crews, read-only on Actual. They are edited on Plan.</span>}
        </div>
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr><th>Proposed crew</th><th className="num">Start</th><th className="num">End</th><th className="num">Hours</th><th className="num">Headcount</th><th>Focus</th><th /></tr>
            </thead>
            <tbody>
              {crewRows.length === 0 && (
                <tr><td colSpan={7} className="farm-c-soft">No crew proposed.</td></tr>
              )}
              {crewRows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <input className="farm-input" value={c.label} disabled={locked} aria-label="Crew label" onChange={(e) => setCrew(c.id, (d) => { d.label = e.target.value; })} />
                    <div className="mt-[0.15rem]!"><StatusBadge status={c.headcount.status} title={c.headcount.note} /></div>
                  </td>
                  <td className="num"><EditableNumber disabled={locked} value={hoursOf(c.startMin.value)} onChange={(v) => setCrew(c.id, (d) => { d.startMin = Math.round(v * 60); })} step={0.25} max={24} suffix={`h = ${clock(c.startMin.value)}`} ariaLabel={`${c.label} start, hours from midnight`} showBadge={false} /></td>
                  <td className="num"><EditableNumber disabled={locked} value={hoursOf(c.endMin.value)} onChange={(v) => setCrew(c.id, (d) => { d.endMin = Math.round(v * 60); })} step={0.25} max={24} suffix={`h = ${clock(c.endMin.value)}`} ariaLabel={`${c.label} end, hours from midnight`} showBadge={false} /></td>
                  <td className="num">{hoursOf(c.endMin.value - c.startMin.value).toFixed(2)}</td>
                  <td className="num"><EditableNumber disabled={locked} value={c.headcount.value} onChange={(v) => setCrew(c.id, (d) => { d.headcount = v; })} step={1} min={0} ariaLabel={`${c.label} headcount`} showBadge={false} /></td>
                  <td className="farm-c-soft">{c.focus ?? ''}</td>
                  <td>{forecastEditing && <button type="button" className="farm-btn" onClick={() => removeCrew(c.id)}>Remove</button>}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Staffed minutes</td>
                <td colSpan={5} className="farm-c-soft">
                  {staffing.staffedSpans.length === 0 ? 'None' : staffing.staffedSpans.map((s) => `${clock(s.startMin)}–${clock(s.endMin)}`).join(', ')}
                </td>
                <td>{forecastEditing && <button type="button" className="farm-btn" onClick={() => addCrew(newCrewDefaultsFor(rated))}>Add crew</button>}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2 mb-3">
          A new crew starts on the operating day with the most people the placed tasks need at once. Staff per rack task:{' '}
          load <EditableNumber disabled={locked} value={C.loadStaff.value} defaultValue={D.loadStaff.value} onChange={(v) => setCapacity('loadStaff', v)} step={1} min={0} ariaLabel="People per rack load" showBadge={false} />{' '}
          unload <EditableNumber disabled={locked} value={C.unloadStaff.value} defaultValue={D.unloadStaff.value} onChange={(v) => setCapacity('unloadStaff', v)} step={1} min={0} ariaLabel="People per rack unload" showBadge={false} />{' '}
          <StatusBadge status={D.loadStaff.status} title={`${D.loadStaff.note} ${D.unloadStaff.note}`} />
        </p>
        <StaffingPanel labor={rated} staffing={staffing} crews={resolved.crews} />
      </Card>

      <div className="grid gap-4 mt-4 farm-autofit-18">
        <Card title="Other capacities — shown for comparison only">
          <table className="farm-table">
            <tbody>
              <tr><td>Jar stand oven pan positions</td><td className="num">{otherCapacities.jarStandOvenPanPositions.value} pans</td><td><StatusBadge status={otherCapacities.jarStandOvenPanPositions.status} /></td></tr>
              <tr><td>Tilting shelf capacity</td><td className="num">{otherCapacities.tiltingShelfGal.value} gal</td><td><StatusBadge status={otherCapacities.tiltingShelfGal.status} /></td></tr>
              <tr><td>Sprouting rack capacity (100 + 60 gal)</td><td className="num">{otherCapacities.sproutingRackGal.value} gal</td><td><StatusBadge status={otherCapacities.sproutingRackGal.status} /></td></tr>
            </tbody>
          </table>
          <p className="farm-kpi-sub mt-2">Not yet checked against the sowing’s harvested mass, so the blackout rack is treated as binding. Whether it stays binding is computed, not assumed, once each station’s required volume per sowing is compared to its capacity.</p>
        </Card>

        <Card title="Sowing size by subscriber unit — same crop plan">
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th className="num">Unit factor</th>
                  <th className="num">Packed unit (derived)</th>
                  <th className="num">Canopy mass / unit</th>
                  <th className="num">Sowing size</th>
                  <th className="num">Max units / day</th>
                </tr>
              </thead>
              <tbody>
                {perPhase.map((e) => (
                  <tr key={e.phase}>
                    <td>{e.market}</td>
                    <td className="num">{e.unitFactor.toFixed(2)}×</td>
                    <td className="num">{e.packedUnitOz.toFixed(1)} oz</td>
                    <td className="num">{e.canopyMassPerUnit.toFixed(4)} lb</td>
                    <td className="num">{num(e.sowingSize)}</td>
                    <td className="num">{num(e.maxUnitsPerDay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="farm-kpi-sub mt-2">
            The blackoutRack capacity is fixed at {num(cap.lbPerCycle)} lb per cycle. A larger subscriber unit
            is more canopy mass per unit, so it yields fewer units per sowing and a lower daily
            ceiling — the same cropPlan produces different production numbers for different subscribers.
          </p>
        </Card>
      </div>
    </>
  );
}
