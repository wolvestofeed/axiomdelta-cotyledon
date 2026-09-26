'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Kpi, num } from '@/components/ui';
import { InlineNumber } from '@/components/InlineCells';
import { PageControls } from '@/components/PageControls';
import { CropPlanSelector, useSelectedCropPlan } from '@/components/CropPlanSelector';
import { SectionSave } from '@/components/SectionSave';
import { ProcessMap, type ProcessEdge, type ProcessNode } from '@/components/timeline/ProcessMap';
import { TIME_STUDY_BASIS_LABELS, TIME_STUDY_STREAM_LABELS, type TimeStudyDoc, type TimeStudyStream } from '@/data/time-studies';
import { deriveCapacity } from '@/engine';
import { deriveRoute, routeDepths, routeOverlayFor, stepDuration, stepLaborMinutes, type RouteStep, type RouteStepOverlay } from '@/engine/routing';
import { laborStandard, studiesForCropPlan } from '@/engine/time-studies';
import { useScenario } from '@/state/scenario-store';
import { useOperationsWorld } from '@/state/ledger';

const mins = (m: number) => `${Math.round(m * 10) / 10} min`;
const STREAMS: TimeStudyStream[] = ['sowing', 'harvest'];

export function ProcessClient({ studies, canEdit: canEditRole }: { studies: TimeStudyDoc[]; canEdit: boolean }) {
  const { resolved, setRouteStep } = useScenario();
  // The route is a forecast edit: on Plan only (Roadmap N6 slice 3).
  const { forecastEditing } = useOperationsWorld({});
  const canEdit = canEditRole && forecastEditing;
  const { cropPlan } = useSelectedCropPlan();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const standard = useMemo(() => laborStandard(studiesForCropPlan(studies, cropPlan.code)), [studies, cropPlan.code]);
  const overlay = useMemo(() => routeOverlayFor(resolved.routing, cropPlan.code), [resolved.routing, cropPlan.code]);
  const route = useMemo(
    () => deriveRoute({ cropPlan, standard, equipment: resolved.equipment, overlay }),
    [cropPlan, standard, resolved.equipment, overlay],
  );
  // Durations are shown at the sowing the study was timed at, so the map reads against its own basis.
  const basis = route.sowingSize;
  const derivedSowing = useMemo(() => deriveCapacity(cropPlan, resolved.capacityInputs).sowingSize, [cropPlan, resolved.capacityInputs]);
  const depths = useMemo(() => routeDepths(route.steps), [route.steps]);
  const flagged = useMemo(() => new Set(route.findings.flatMap((f) => (f.stepId ? [f.stepId] : []))), [route.findings]);
  const byId = useMemo(() => new Map(route.steps.map((s) => [s.id, s])), [route.steps]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const unitName = (key: string | null) => (key ? resolved.resources.find((r) => r.key === key)?.item ?? key : null);

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

  const set = (stepId: string, fn: (d: RouteStepOverlay) => void) => setRouteStep(cropPlan.code, stepId, fn);
  const clear = (stepId: string) =>
    setRouteStep(cropPlan.code, stepId, (d) => {
      for (const k of Object.keys(d) as (keyof RouteStepOverlay)[]) delete d[k];
    });
  const togglePredecessor = (step: RouteStep, id: string) => {
    const next = step.after.includes(id) ? step.after.filter((a) => a !== id) : [...step.after, id];
    set(step.id, (d) => {
      d.after = next;
    });
  };

  return (
    <>
      <PageControls><CropPlanSelector /></PageControls>
      {forecastEditing && (
        <div className="mb-3!">
          <SectionSave sections={['routing']} title="the route" />
        </div>
      )}

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={num(route.steps.length)} label="Steps on the route" sub={`${num(route.steps.filter((s) => s.stream === 'sowing').length)} sowing · ${num(route.steps.filter((s) => s.stream === 'harvest').length)} harvest`} />
        <Kpi value={standard ? TIME_STUDY_BASIS_LABELS[standard.basis] : 'None'} label="Labor standard" sub={standard ? `Timed at a ${num(basis)}-unit sowing` : 'No time study on file for this crop plan'} />
        <Kpi value={num(derivedSowing)} label="Derived sowing" sub={basis === derivedSowing ? 'The study is on the derived sowing' : `The study was timed at ${num(basis)}; per-unit figures scale`} />
        <Kpi value={num(route.steps.filter((s) => s.edited).length)} label="Steps edited here" sub={route.steps.some((s) => s.edited) ? 'This forecast differs from the derived route' : 'The route is as derived'} />
        <Kpi value={num(route.findings.length)} label="Findings" sub={route.findings.length ? 'Listed below; nothing is repaired' : 'Every step has a unit and an order'} />
      </div>

      {STREAMS.map((stream) => {
        const nodes = nodesFor(stream);
        return (
          <Card key={stream} title={`${TIME_STUDY_STREAM_LABELS[stream]} stream — ${stream === 'sowing' ? 'per sowing harvested' : 'per distribution day, from staged components'}`} className="mt-4">
            {nodes.length === 0 ? (
              <p className="farm-kpi-sub">No {TIME_STUDY_STREAM_LABELS[stream].toLowerCase()}-stream step on this cropPlan&rsquo;s standard.</p>
            ) : (
              <ProcessMap nodes={nodes} edges={edgesFor(stream)} selectedId={selectedId} onSelect={setSelectedId} />
            )}
          </Card>
        );
      })}

      <p className="farm-kpi-sub mt-2">
        Columns are precedence depth: a step is drawn one column past its deepest predecessor, so steps in a column may run alongside each other. The sows sit together and the blackoutRack
        waits for all of them; on harvest the cold assemblies sit together and the packing waits for them. A node marked · is edited in this forecast; a node outlined in the accent
        is named in a finding. Pick a node to edit its figures.
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
                  <td className="farm-c-faint farm-fs-xs">Clock minutes that do not scale with units.</td>
                </tr>
                <tr>
                  <td>Run minutes per unit</td>
                  <td className="num"><InlineNumber value={selected.runMinutesPerUnit} step={0.01} disabled={!canEdit} label={`${selected.task} run minutes per unit`} onCommit={(n) => n !== null && set(selected.id, (d) => { d.runMinutesPerUnit = n; })} /></td>
                  <td className="farm-c-faint farm-fs-xs">Duration at the {num(basis)}-unit basis: {mins(stepDuration(selected, basis))}.</td>
                </tr>
                <tr>
                  <td>Labor minutes, fixed</td>
                  <td className="num"><InlineNumber value={selected.laborMinutesFixed} step={5} disabled={!canEdit} label={`${selected.task} fixed labor minutes`} onCommit={(n) => n !== null && set(selected.id, (d) => { d.laborMinutesFixed = n; })} /></td>
                  <td className="farm-c-faint farm-fs-xs">People-minutes that do not scale.</td>
                </tr>
                <tr>
                  <td>Labor minutes per unit</td>
                  <td className="num"><InlineNumber value={selected.laborMinutesPerUnit} step={0.01} disabled={!canEdit} label={`${selected.task} labor minutes per unit`} onCommit={(n) => n !== null && set(selected.id, (d) => { d.laborMinutesPerUnit = n; })} /></td>
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
                  <td className="farm-c-faint farm-fs-xs">Phase 1 units with resource attributes on <Link className="farm-link" href="/farm/grow-units">Equipment</Link>.</td>
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

      <Card title={`The route — ${cropPlan.code} ${cropPlan.name}`} className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead>
              <tr><th className="num">Seq</th><th>Step</th><th>Stream</th><th className="num">Depth</th><th>Unit</th><th className="num">People</th><th className="num">Duration</th><th className="num">Labor</th><th>Waits for</th><th>CONTROL POINT</th></tr>
            </thead>
            <tbody>
              {route.steps.length === 0 && <tr><td colSpan={10} className="farm-c-soft">No route: this crop plan has no time study on file.</td></tr>}
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
          Durations and labor are at the {num(basis)}-unit sowing the study was timed at; a per-unit figure scales to the sowing or the units shipped when the day is placed.
          The steps come from <Link className="farm-link" href="/farm/time-studies">Time Studies</Link>; the units from <Link className="farm-link" href="/farm/grow-units">Equipment</Link>.
        </p>
      </Card>

      <Card title={`Findings — ${num(route.findings.length)}`} className="mt-4">
        {route.findings.length === 0 ? (
          <p className="farm-kpi-sub">Nothing: every step is a task the scaffold names, every sow has a grow unit on the Phase 1 list, and the edges hold an order.</p>
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
