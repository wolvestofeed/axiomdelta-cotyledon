'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Kpi, num } from '@/components/ui';
import { InlineNumber } from '@/components/InlineCells';
import { PageControls } from '@/components/PageControls';
import { GrowPlanSelector, useSelectedGrowPlan } from '@/components/GrowPlanSelector';
import { SectionSave } from '@/components/SectionSave';
import { ProcessMap, type ProcessEdge, type ProcessNode } from '@/components/timeline/ProcessMap';
import { TIME_STUDY_BASIS_LABELS, TIME_STUDY_STREAM_LABELS, type TimeStudyDoc, type TimeStudyStream } from '@/data/time-studies';
import { planStageDays, planStages } from '@/data/grow-plan';
import { CONTROL_POINT_BY_ID } from '@/data/produce-safety';
import { cycleDays, daysToHarvest, type StageDays } from '@/data/stage-schedule';
import { unitWordsFor } from '@/data/tray-formats';
import { deriveCapacity } from '@/engine';
import { deriveRoute, routeDepths, routeOverlayFor, stepDuration, stepLaborMinutes, type RouteStep, type RouteStepOverlay } from '@/engine/routing';
import { laborStandard, studiesForGrowPlan } from '@/engine/time-studies';
import { useScenario } from '@/state/scenario-store';
import { useOperationsWorld } from '@/state/ledger';

const mins = (m: number) => `${Math.round(m * 10) / 10} min`;
const STREAM_TITLES: Record<'sowing' | 'harvest', (one: string) => string> = { sowing: (one) => `on the sow day, per ${one} sown`, harvest: (one) => `on the distribution day, per ${one} shipped` };

export function ProcessClient({ studies, canEdit: canEditRole }: { studies: TimeStudyDoc[]; canEdit: boolean }) {
  const { resolved, setRouteStep } = useScenario();
  // The route is a forecast edit: on Plan only (Roadmap N6 slice 3).
  const { forecastEditing } = useOperationsWorld({});
  const canEdit = canEditRole && forecastEditing;
  const { growPlan } = useSelectedGrowPlan();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const standard = useMemo(() => laborStandard(studiesForGrowPlan(studies, growPlan.code)), [studies, growPlan.code]);
  const overlay = useMemo(() => routeOverlayFor(resolved.routing, growPlan.code), [resolved.routing, growPlan.code]);
  const route = useMemo(
    () => deriveRoute({ growPlan, standard, equipment: resolved.equipment, overlay }),
    [growPlan, standard, resolved.equipment, overlay],
  );
  // Durations are shown at the sowing the study was timed at, so the map reads against its own basis.
  const basis = route.sowingSize;
  const derivedSowing = useMemo(() => deriveCapacity(growPlan, resolved.capacityInputs).sowingSize, [growPlan, resolved.capacityInputs]);
  const depths = useMemo(() => routeDepths(route.steps), [route.steps]);
  const flagged = useMemo(() => new Set(route.findings.flatMap((f) => (f.stepId ? [f.stepId] : []))), [route.findings]);
  const byId = useMemo(() => new Map(route.steps.map((s) => [s.id, s])), [route.steps]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const unitName = (key: string | null) => (key ? resolved.resources.find((r) => r.key === key)?.item ?? key : null);

  // A grow plan's cycle on its grow unit, day by day from the sow date, and the daily stream every tray takes.
  const u = unitWordsFor(growPlan?.format ?? 'flat-1020');
  const stageDays = useMemo(() => (growPlan ? planStageDays(growPlan) : null), [growPlan]);
  const stageRows = useMemo(() => {
    if (!growPlan || !stageDays) return [];
    let cursor = 0;
    return planStages(growPlan)
      .filter((st) => st.key !== 'packed')
      .map((st) => {
        const days = stageDays[st.key as keyof StageDays];
        // The soak runs the days before the sow date; every other stage follows the one before it.
        const from = st.key === 'soak' ? -days : cursor;
        if (st.key !== 'soak') cursor += days;
        return { st, days, from, to: from + days - 1 };
      });
  }, [growPlan, stageDays]);
  const cycle = stageDays ? cycleDays(stageDays) : 0;
  const dailyLines = useMemo(() => (standard ? standard.lines.filter((l) => l.stream === 'daily') : []), [standard]);
  // A per-tray daily line is one day's minutes for the sowing studied; a fixed one is once a day whatever the trays.
  const perTrayDay = (l: { laborMinutes: number; scalesWith: string }) => (l.scalesWith === 'variable' && basis > 0 ? l.laborMinutes / basis : 0);
  const dailyPerTrayDay = dailyLines.reduce((t, l) => t + perTrayDay(l), 0);
  const dailyFixedPerDay = dailyLines.filter((l) => l.scalesWith === 'fixed').reduce((t, l) => t + l.laborMinutes, 0);

  const nodesFor = (stream: TimeStudyStream): ProcessNode[] =>
    route.steps
      .filter((s) => s.stream === stream)
      .map((s) => ({
        id: s.id,
        column: depths.get(s.id) ?? 0,
        label: s.task,
        group: stream,
        edited: s.edited,
        flagged: flagged.has(s.id),
        lines: [
          unitName(s.resourceKey) ?? 'No unit',
          `${num(s.staff)} ${s.staff === 1 ? 'person' : 'people'} · ${mins(stepDuration(s, basis))}`,
        ],
      }));
  const edgesFor = (stream: TimeStudyStream): ProcessEdge[] =>
    route.steps.filter((s) => s.stream === stream).flatMap((s) => s.after.filter((a) => byId.get(a)?.stream === stream).map((a) => ({ fromId: a, toId: s.id })));

  const set = (stepId: string, fn: (d: RouteStepOverlay) => void) => setRouteStep(growPlan.code, stepId, fn);
  const clear = (stepId: string) =>
    setRouteStep(growPlan.code, stepId, (d) => {
      for (const k of Object.keys(d) as (keyof RouteStepOverlay)[]) delete d[k];
    });
  const togglePredecessor = (step: RouteStep, id: string) => {
    const next = step.after.includes(id) ? step.after.filter((a) => a !== id) : [...step.after, id];
    set(step.id, (d) => {
      d.after = next;
    });
  };

  const streamCard = (stream: 'sowing' | 'harvest') => {
    const nodes = nodesFor(stream);
    return (
      <Card title={`${TIME_STUDY_STREAM_LABELS[stream]} stream — ${STREAM_TITLES[stream](u.one)}`} className="mt-4">
        {nodes.length === 0 ? (
          <p className="farm-kpi-sub">No {TIME_STUDY_STREAM_LABELS[stream].toLowerCase()}-stream step on this plan&rsquo;s standard.</p>
        ) : (
          <ProcessMap nodes={nodes} edges={edgesFor(stream)} selectedId={selectedId} onSelect={setSelectedId} />
        )}
      </Card>
    );
  };

  return (
    <>
      <PageControls><GrowPlanSelector /></PageControls>
      {forecastEditing && (
        <div className="mb-3!">
          <SectionSave sections={['routing']} title="the route" />
        </div>
      )}

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={num(route.steps.length)} label="Steps on the route" sub={`${num(route.steps.filter((s) => s.stream === 'sowing').length)} sowing · ${num(route.steps.filter((s) => s.stream === 'harvest').length)} harvest`} />
        <Kpi value={standard ? TIME_STUDY_BASIS_LABELS[standard.basis] : 'None'} label="Labor standard" sub={standard ? `Timed at a ${num(basis)}-${u.one} sowing` : 'No time study on file for this plan'} />
        <Kpi value={`${num(derivedSowing)} ${u.many}`} label="Sowing" sub={basis === derivedSowing ? 'What one grow unit takes; the study is on it' : `What one grow unit takes; the study was timed at ${num(basis)}, per-${u.one} figures scale`} />
        {stageDays && <Kpi value={`${num(cycle)} days`} label="Cycle on the grow unit" sub={`${num(daysToHarvest(stageDays))} to harvest · ${num(stageDays['harvest-window'])}-day harvest window`} />}
        <Kpi value={num(route.steps.filter((s) => s.edited).length)} label="Steps edited here" sub={route.steps.some((s) => s.edited) ? 'This forecast differs from the derived route' : 'The route is as derived'} />
        <Kpi value={num(route.findings.length)} label="Findings" sub={route.findings.length ? 'Listed below; nothing is repaired' : 'Every step has an order'} />
      </div>

      {streamCard('sowing')}

      {growPlan && (
        <div className="grid gap-4 mt-4 farm-autofit-26">
          <Card title={`Stage schedule — ${num(cycle)} days on the grow unit`}>
            <div className="farm-scroll-x">
              <table className="farm-table compact">
                <thead><tr><th>Stage</th><th className="num">Days</th><th>From the sow date</th><th>Watering</th><th>Control point</th></tr></thead>
                <tbody>
                  {stageRows.map(({ st, days, from, to }) => (
                    <tr key={st.key} className={days === 0 ? 'farm-c-faint' : ''}>
                      <td>{st.name}</td>
                      <td className="num">{num(days)}</td>
                      <td className="farm-c-soft">{days === 0 ? '—' : from === to ? `day ${from}` : `days ${from} to ${to}`}</td>
                      <td>{st.watering === 'none' ? '—' : `${st.watering}, ${st.wateringsPerDay} a day`}{st.underLight ? ' · under light' : ''}</td>
                      <td>{st.controlPoint ? CONTROL_POINT_BY_ID[st.controlPoint].name : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="farm-kpi-sub mt-2">
              Day 0 is the sow date. The days are the plan&rsquo;s stage days on <Link className="farm-link" href="/farm/grow-plans">Grow plans</Link>; the {u.many} hold the grow unit from the sow date to the end of the harvest window.
            </p>
          </Card>
          <Card title={`Daily stream — every day a ${u.one} is on the shelves`}>
            {dailyLines.length === 0 ? (
              <p className="farm-kpi-sub">No daily-stream line on this plan&rsquo;s standard.</p>
            ) : (
              <div className="farm-scroll-x">
                <table className="farm-table compact">
                  <thead><tr><th>Task</th><th>Station</th><th className="num">Min per {u.one} a day</th><th className="num">Min per {u.one} over the cycle</th></tr></thead>
                  <tbody>
                    {dailyLines.map((l) => (
                      <tr key={`${l.task}|${l.station ?? ''}`}>
                        <td>{l.task}</td>
                        <td className="farm-c-soft">{l.station ?? '—'}</td>
                        <td className="num">{l.scalesWith === 'fixed' ? `${num(l.laborMinutes, 1)} a day` : num(perTrayDay(l), 2)}</td>
                        <td className="num">{l.scalesWith === 'fixed' ? '—' : num(perTrayDay(l) * cycle, 1)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold!">
                      <td colSpan={2}>Daily stream</td>
                      <td className="num">{num(dailyPerTrayDay, 2)}</td>
                      <td className="num">{num(dailyPerTrayDay * cycle, 1)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p className="farm-kpi-sub mt-2">
              One day&rsquo;s minutes per {u.one} from the labor standard, over the {num(cycle)} days of the cycle{dailyFixedPerDay > 0 ? `; a fixed line runs once a day whatever the ${u.many}, ${num(dailyFixedPerDay, 1)} min a day` : ''}. For a {num(basis)}-{u.one} sowing that is {num((dailyPerTrayDay * basis * cycle) / 60, 1)} h over the cycle. The daily stream is not a route step: the <Link className="farm-link" href="/farm/production-planning/schedule">Day Schedule</Link> lists it beside the clock for the {u.many} on the shelves each day.
            </p>
          </Card>
        </div>
      )}

      {streamCard('harvest')}

      <p className="farm-kpi-sub mt-2">
        Columns are precedence depth: a step is drawn one column past its deepest predecessor, so steps in a column may run alongside each other. A node marked · is edited in this
        forecast; a node outlined in the accent is named in a finding. Pick a node to edit its figures.
      </p>

      {selected && (
        <Card title={`${selected.task} — ${TIME_STUDY_STREAM_LABELS[selected.stream]} stream`} className="mt-4">
          {!canEdit ? (
            <p className="farm-kpi-sub">{canEditRole ? 'The route is a forecast edit, made on Plan.' : 'Editing the route is limited to super admins.'} The figures below are this forecast&rsquo;s.</p>
          ) : null}
          <div className="farm-scroll-x">
            <table className="farm-table compact">
              <tbody>
                <tr>
                  <td>People at once</td>
                  <td className="num"><InlineNumber value={selected.staff} step={1} disabled={!canEdit} label={`${selected.task} people`} onCommit={(n) => n !== null && set(selected.id, (d) => { d.staff = n; })} /></td>
                  <td className="farm-c-faint farm-fs-xs">The study line&rsquo;s crew size. More people mean more steps at once, never a faster step.</td>
                </tr>
                <tr>
                  <td>Setup minutes</td>
                  <td className="num"><InlineNumber value={selected.setupMinutes} step={5} disabled={!canEdit} label={`${selected.task} setup minutes`} onCommit={(n) => n !== null && set(selected.id, (d) => { d.setupMinutes = n; })} /></td>
                  <td className="farm-c-faint farm-fs-xs">Clock minutes that do not scale with {u.many}.</td>
                </tr>
                <tr>
                  <td>Run minutes per {u.one}</td>
                  <td className="num"><InlineNumber value={selected.runMinutesPerUnit} step={0.01} disabled={!canEdit} label={`${selected.task} run minutes per ${u.one}`} onCommit={(n) => n !== null && set(selected.id, (d) => { d.runMinutesPerUnit = n; })} /></td>
                  <td className="farm-c-faint farm-fs-xs">Duration at the {num(basis)}-{u.one} basis: {mins(stepDuration(selected, basis))}.</td>
                </tr>
                <tr>
                  <td>Labor minutes, fixed</td>
                  <td className="num"><InlineNumber value={selected.laborMinutesFixed} step={5} disabled={!canEdit} label={`${selected.task} fixed labor minutes`} onCommit={(n) => n !== null && set(selected.id, (d) => { d.laborMinutesFixed = n; })} /></td>
                  <td className="farm-c-faint farm-fs-xs">People-minutes that do not scale.</td>
                </tr>
                <tr>
                  <td>Labor minutes per {u.one}</td>
                  <td className="num"><InlineNumber value={selected.laborMinutesPerUnit} step={0.01} disabled={!canEdit} label={`${selected.task} labor minutes per ${u.one}`} onCommit={(n) => n !== null && set(selected.id, (d) => { d.laborMinutesPerUnit = n; })} /></td>
                  <td className="farm-c-faint farm-fs-xs">Labor at the basis: {mins(stepLaborMinutes(selected, basis))}.</td>
                </tr>
                <tr>
                  <td>Unit</td>
                  <td>
                    <select className="farm-input farm-cell-control w-56!" value={selected.resourceKey ?? ''} disabled={!canEdit} aria-label={`${selected.task} unit`} onChange={(e) => set(selected.id, (d) => { d.resourceKey = e.target.value || null; })}>
                      <option value="">No unit — labor only</option>
                      {resolved.resources.map((r) => (
                        <option key={r.key} value={r.key}>{r.item}</option>
                      ))}
                    </select>
                  </td>
                  <td className="farm-c-faint farm-fs-xs">The units with resource attributes on <Link className="farm-link" href="/farm/grow-units">Grow Units</Link>. A sow or harvest step at a station needs none.</td>
                </tr>
                <tr>
                  <td>Waits for</td>
                  <td colSpan={2}>
                    <div className="flex flex-wrap gap-2">
                      {route.steps.filter((s) => s.stream === selected.stream && s.id !== selected.id).map((s) => (
                        <label key={s.id} className="farm-kpi-sub farm-cell-control inline-flex! items-center! gap-[0.3rem]!">
                          <input type="checkbox" checked={selected.after.includes(s.id)} disabled={!canEdit} onChange={() => togglePredecessor(selected, s.id)} aria-label={`${selected.task} waits for ${s.task}`} />
                          {s.task}
                        </label>
                      ))}
                      {route.steps.filter((s) => s.stream === selected.stream && s.id !== selected.id).length === 0 && <span className="farm-c-soft">Nothing else on this stream.</span>}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 mt-3! flex-wrap">
            {canEdit && selected.edited && <button type="button" className="farm-btn" onClick={() => clear(selected.id)}>Reset this step to the derived route</button>}
            <button type="button" className="farm-btn" onClick={() => setSelectedId(null)}>Close</button>
          </div>
          <p className="farm-kpi-sub mt-2">
            An edit here is this forecast&rsquo;s, held against the derived route; Save the section to keep it. The <Link className="farm-link" href="/farm/production-planning/schedule">Day Schedule</Link> re-places the day with it.
          </p>
        </Card>
      )}

      <Card title={`The route — ${growPlan.code} ${growPlan.name}`} className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead>
              <tr><th className="num">Seq</th><th>Step</th><th>Stream</th><th className="num">Depth</th><th>Unit</th><th className="num">People</th><th className="num">Duration</th><th className="num">Labor</th><th>Waits for</th><th>CONTROL POINT</th></tr>
            </thead>
            <tbody>
              {route.steps.length === 0 && <tr><td colSpan={10} className="farm-c-soft">No route: this plan has no time study on file.</td></tr>}
              {route.steps.map((s) => (
                <tr key={s.id} className={`${s.id === selectedId ? 'bg-[color:var(--farm-accent-wash)]!' : ''}`}>
                  <td className="num">{s.seq}</td>
                  <td>
                    <button type="button" className="farm-link bg-none! border-0! p-0! [font:inherit]! cursor-pointer! text-left!" onClick={() => setSelectedId(s.id)}>{s.task}</button>
                    {s.edited ? <div className="farm-c-faint farm-fs-xs">Edited in this forecast</div> : null}
                  </td>
                  <td className="farm-c-soft">{TIME_STUDY_STREAM_LABELS[s.stream]}</td>
                  <td className="num">{depths.get(s.id) ?? 0}</td>
                  <td className="farm-c-soft">{unitName(s.resourceKey) ?? '—'}</td>
                  <td className="num">{num(s.staff)}</td>
                  <td className="num">{mins(stepDuration(s, basis))}</td>
                  <td className="num">{mins(stepLaborMinutes(s, basis))}</td>
                  <td className="farm-c-soft">{s.after.length ? s.after.map((a) => byId.get(a)?.task ?? a).join('; ') : '—'}</td>
                  <td>{s.controlPoint ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          Durations and labor are at the {num(basis)}-{u.one} sowing the study was timed at; a per-{u.one} figure scales to the {u.many} sown or shipped when the day is placed.
          The steps come from <Link className="farm-link" href="/farm/time-studies">Time Studies</Link>; the units from <Link className="farm-link" href="/farm/grow-units">Grow Units</Link>.
        </p>
      </Card>

      <Card title={`Findings — ${num(route.findings.length)}`} className="mt-4">
        {route.findings.length === 0 ? (
          <p className="farm-kpi-sub">Nothing: every step is a task the scaffold names, every unit named is on Grow Units, and the edges hold an order.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table compact">
              <thead><tr><th>Finding</th><th>Step</th><th>Detail</th></tr></thead>
              <tbody>
                {route.findings.map((f, i) => (
                  <tr key={`${f.kind}-${i}`}>
                    <td className="whitespace-nowrap! font-medium!">{f.kind}</td>
                    <td className="farm-c-soft">{f.stepId ? byId.get(f.stepId)?.task ?? f.stepId : '—'}</td>
                    <td>{f.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
