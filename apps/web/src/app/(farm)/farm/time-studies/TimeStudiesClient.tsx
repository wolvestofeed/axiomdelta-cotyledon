'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Kpi, money, num } from '../_components/ui';

import { PageControls } from '../_components/PageControls';
import { CropPlanSelector, useSelectedCropPlan } from '../_components/CropPlanSelector';
import { TrendChart } from '../_components/TrendChart';
import { deriveCapacity } from '../_engine';
import { QUALITY_RESULTS, QUALITY_RESULT_LABELS, TIME_STUDY_BASIS_LABELS, TIME_STUDY_STREAMS, TIME_STUDY_STREAM_LABELS, type QualityResult, type TimeStudyDoc, type TimeStudyLibrary, type TimeStudyLine, type TimeStudyStream } from '../_data/time-studies';
import { laborMinutesForSowing, laborStandard, nextStudyDue, standardIsEstimated, studiesForCropPlan, studyTrend, summarizeStudy } from '../_engine/time-studies';
import { useScenario } from '../_state/scenario-store';
import { adoptTimeStudy, recordTimeStudy, setRestudyInterval } from '../_lib/time-study-actions';

type ActionResult = { ok: true } | { ok: false; error: string };

/** Row height in the log panel; the panel shows ten rows and scrolls. */
const LOG_ROW_REM = 2.35;

interface DraftLine {
  task: string;
  station: string;
  staff: string;
  elapsed: string;
  labor: string;
  scalesWith: 'fixed' | 'variable';
  stream: TimeStudyStream;
}

interface StudyForm {
  studiedOn: string;
  sowingSize: string;
  observer: string;
  qualityResult: QualityResult;
  qualityNotes: string;
  lines: DraftLine[];
}

const emptyLine = (): DraftLine => ({ task: '', station: '', staff: '1', elapsed: '', labor: '', scalesWith: 'variable', stream: 'sowing' });
const draftFrom = (lines: readonly TimeStudyLine[]): DraftLine[] =>
  lines.length ? lines.map((l) => ({ task: l.task, station: l.station ?? '', staff: String(l.staff), elapsed: String(l.elapsedMinutes), labor: String(l.laborMinutes), scalesWith: l.scalesWith, stream: l.stream })) : [emptyLine()];
const mins = (m: number, dp = 0) => `${num(m, dp)} min`;
const studyDate = (s: TimeStudyDoc) => (s.basis === 'estimated' ? 'Estimated' : s.studiedOn ?? 'Date not recorded');

export function TimeStudiesClient({ library, canEdit, today }: { library: TimeStudyLibrary; canEdit: boolean; today: string }) {
  const { cropPlan } = useSelectedCropPlan();
  return (
    <>
      <PageControls><CropPlanSelector /></PageControls>
      <PageControls group="action"><a className="farm-btn ghost" href={`/farm/time-studies/time-study-sheet?crop plan=${encodeURIComponent(cropPlan.code)}`}>Time Study Sheet</a></PageControls>
      <CropPlanLabor key={cropPlan.code} library={library} canEdit={canEdit} today={today} />
    </>
  );
}

function CropPlanLabor({ library, canEdit, today }: { library: TimeStudyLibrary; canEdit: boolean; today: string }) {
  const { resolved } = useScenario();
  const { cropPlan } = useSelectedCropPlan();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<StudyForm | null>(null);
  const [intervalDraft, setIntervalDraft] = useState('');

  const studies = useMemo(() => studiesForCropPlan(library.studies, cropPlan.code), [library.studies, cropPlan.code]);
  const standard = laborStandard(studies);
  const onEstimate = standardIsEstimated(standard);
  const basis = standard ?? studies[0] ?? null;
  const selected = studies.find((s) => s.id === selectedId) ?? basis;
  const cropPlanId = library.cropPlanIds[cropPlan.code];

  const cap = useMemo(() => deriveCapacity(cropPlan, resolved.capacityInputs), [cropPlan, resolved.capacityInputs]);
  // Labor cost uses the plan's loaded labor rate, a placeholder until Staffing's
  // loaded rates arrive. It is never displayed: no wage or pay appears here.
  const loadedRate = resolved.assumptions.labor.blendedLoadedWage.value;
  const basisSummary = basis ? summarizeStudy(basis) : null;
  const sowingMinutes = basisSummary ? laborMinutesForSowing(basisSummary, cap.sowingSize) : null;
  const dayMinutes = sowingMinutes === null ? null : sowingMinutes * cap.cyclesPerDay;
  const due = nextStudyDue(studies, library.intervals[cropPlan.code], today);
  const perUnitTrend = useMemo(() => studyTrend(studies, (s) => summarizeStudy(s).laborMinutesPerUnit), [studies]);
  const fixedTrend = useMemo(() => studyTrend(studies, (s) => summarizeStudy(s).fixedMinutesPerSowing), [studies]);

  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        after?.();
        router.refresh();
      }
    });

  const saveStudy = () => {
    if (!form || !cropPlanId) return;
    const lines = form.lines
      .filter((l) => l.task.trim())
      .map((l) => ({ task: l.task.trim(), station: l.station.trim() || null, staff: Math.round(Number(l.staff) || 0), elapsedMinutes: Number(l.elapsed) || 0, laborMinutes: Number(l.labor) || 0, scalesWith: l.scalesWith, stream: l.stream }));
    run(
      () => recordTimeStudy({ cropPlanId, studiedOn: form.studiedOn, sowingSize: Math.round(Number(form.sowingSize)), observer: form.observer, qualityResult: form.qualityResult, qualityNotes: form.qualityNotes || null, lines }),
      () => setForm(null),
    );
  };
  const setLine = (i: number, patch: Partial<DraftLine>) => setForm((f) => (f ? { ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : f));

  const dueText =
    due.intervalDays === null
      ? 'No re-study interval set'
      : due.dueOn === null
        ? 'No dated study yet'
        : due.daysUntilDue! >= 0
          ? `Due ${due.dueOn}, in ${num(due.daysUntilDue!)} ${due.daysUntilDue === 1 ? 'day' : 'days'}`
          : `Due ${due.dueOn}, ${num(-due.daysUntilDue!)} ${due.daysUntilDue === -1 ? 'day' : 'days'} past`;

  return (
    <>
      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={num(studies.length)} label={`Time studies — ${cropPlan.code}`} sub={standard ? (onEstimate ? 'Standard: the estimate, until an observed study is adopted' : `Standard adopted from the ${studyDate(standard)} study`) : studies.length ? 'None adopted; the latest study is shown' : 'None logged'} />
        <Kpi value={basisSummary ? num(basisSummary.laborMinutesPerUnit, 2) : '—'} label="Labor minutes per unit" sub={basis ? `At the ${num(basis.sowingSize)}-unit sowing studied` : undefined} />
        <Kpi value={sowingMinutes === null ? '—' : num(sowingMinutes / 60, 2)} label="Labor hours per sowing" sub={`At the derived ${num(cap.sowingSize)}-unit sowing`} />
        <Kpi value={sowingMinutes === null ? '—' : money((sowingMinutes / 60) * loadedRate, 0)} label="Labor cost per sowing" sub="At the plan's placeholder loaded rate" />
        <Kpi value={dayMinutes === null ? '—' : money((dayMinutes / 60) * loadedRate, 0)} label="Labor cost per rated day" sub={`${num(cap.cyclesPerDay)} sowings; ${dayMinutes === null ? '—' : num(dayMinutes / 60, 1)} labor hours`} />
        <Kpi value={due.dueOn ?? '—'} label="Next study due" sub={dueText} />
      </div>
      {error && <p className="farm-kpi-sub mt-3 farm-c-accent">{error}</p>}

      <Card title={`Time study log — ${cropPlan.code} ${cropPlan.name}`} className="mt-4">
        {studies.length === 0 ? (
          <p className="farm-kpi-sub">No time study is logged for this cropPlan.{canEdit ? ' Record one below.' : ''}</p>
        ) : (
          <div className="farm-scroll-x overflow-y-auto! border! border-[color:var(--farm-line)]! rounded-[0.4rem]!" style={{ maxHeight: `${LOG_ROW_REM * 10 + 2.6}rem` }}>
            <table className="farm-table compact">
              <thead className="sticky! top-0! z-[1]!">
                <tr>
                  <th>Studied on</th>
                  <th>Basis</th>
                  <th className="num">Sowing</th>
                  <th>Observer</th>
                  <th className="num">Labor min</th>
                  <th className="num">Sowing stream min</th>
                  <th className="num">Harvest stream min</th>
                  <th className="num">Fixed min / sowing</th>
                  <th className="num">Variable min / unit</th>
                  <th className="num">Min / unit</th>
                  <th>Quality</th>
                  <th>Standard</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {studies.map((s) => {
                  const sum = summarizeStudy(s);
                  const isSelected = selected?.id === s.id;
                  return (
                    <tr key={s.id} className={`${isSelected ? 'bg-[color:var(--farm-accent-wash)]!' : ''}`}>
                      <td className="whitespace-nowrap!">{s.basis === 'estimated' ? '—' : studyDate(s)}</td>
                      <td>{TIME_STUDY_BASIS_LABELS[s.basis]}</td>
                      <td className="num">{num(s.sowingSize)}</td>
                      <td>{s.observer ?? '—'}</td>
                      <td className="num">{num(sum.laborMinutes)}</td>
                      <td className="num">{num(sum.sowingLaborMinutes)}</td>
                      <td className="num">{num(sum.harvestLaborMinutes)}</td>
                      <td className="num">{num(sum.fixedMinutesPerSowing)}</td>
                      <td className="num">{num(sum.variableMinutesPerUnit, 3)}</td>
                      <td className="num">{num(sum.laborMinutesPerUnit, 3)}</td>
                      <td>{s.qualityResult ? QUALITY_RESULT_LABELS[s.qualityResult] : 'Not recorded'}</td>
                      <td>{standard?.id === s.id ? (s.adoptedAt ? 'Adopted' : 'Stands in') : s.adoptedAt ? 'Adopted earlier' : '—'}</td>
                      <td className="num">
                        <button type="button" className="farm-btn py-[0.1rem]! px-[0.45rem]! farm-fs-xs" aria-pressed={isSelected} onClick={() => setSelectedId(s.id)}>
                          {isSelected ? 'Shown' : 'Show'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="farm-kpi-sub mt-2">Newest first; the estimated study and any study recorded without a date are listed last and have no point on the trends. An estimated study is a mock estimate per step, seeded so the crop plan has a labor standard before a sowing is timed; it stands in until an observed study is adopted. Fixed minutes are the tasks that do not scale; variable minutes per unit are the tasks that scale, over the sowing size studied. Each line is on the sowing stream — counted per sowing harvested — or the harvest stream — run first thing each distribution day from staged components and counted per unit shipped that day. The Time Study Sheet above is the printable instrument for timing a sowing; a timed sowing is recorded below, dated, with the observer and the quality result, and joins this log.</p>
      </Card>

      <div className="grid gap-4 mt-4 farm-autofit-20">
        <Card title="Trend — labor minutes per unit">
          <TrendChart points={perUnitTrend} label="Labor minutes per unit" format={(v) => num(v, 2)} />
        </Card>
        <Card title="Trend — fixed minutes per sowing">
          <TrendChart points={fixedTrend} label="Fixed minutes per sowing" format={(v) => num(v, 0)} />
        </Card>
      </div>
      <p className="farm-kpi-sub mt-2">One point per dated study, oldest to newest. The log above is the table behind both charts.</p>

      {selected && (
        <Card title={`Study — ${studyDate(selected)}${standard?.id === selected.id ? (selected.adoptedAt ? ' · the labor standard' : ' · stands in as the labor standard') : ''}`} className="mt-4">
          {(() => {
            const sum = summarizeStudy(selected);
            return (
              <div className="grid gap-3 farm-autofit-10 mb-3!">
                <Kpi value={num(selected.sowingSize)} label="Sowing studied" sub="Units" />
                <Kpi value={mins(sum.laborMinutes)} label="Labor minutes" sub={`${num(sum.laborMinutes / 60, 2)} labor hours`} />
                <Kpi value={mins(sum.fixedMinutesPerSowing)} label="Fixed per sowing" sub={sum.laborMinutes ? `${num((sum.fixedMinutesPerSowing / sum.laborMinutes) * 100, 1)}% of the sowing` : undefined} />
                <Kpi value={num(sum.variableMinutesPerUnit, 3)} label="Variable min / unit" />
                <Kpi value={num(sum.peakStaff)} label="Most people on a task" />
              </div>
            );
          })()}
          <div className="farm-scroll-x">
            <table className="farm-table compact">
              <thead><tr><th>Task</th><th>Stream</th><th>Station</th><th className="num">Staff</th><th className="num">Elapsed min</th><th className="num">Labor min</th><th>Scales</th></tr></thead>
              <tbody>
                {selected.lines.map((l, i) => (
                  <tr key={`${selected.id}:${i}`}>
                    <td className="font-medium!">{l.task}</td>
                    <td className="farm-c-soft">{TIME_STUDY_STREAM_LABELS[l.stream]}</td>
                    <td className="farm-c-soft">{l.station ?? '—'}</td>
                    <td className="num">{num(l.staff)}</td>
                    <td className="num">{num(l.elapsedMinutes)}</td>
                    <td className="num">{num(l.laborMinutes)}</td>
                    <td className="farm-c-soft">{l.scalesWith === 'fixed' ? 'Fixed per sowing' : 'Per unit'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="farm-kpi-sub mt-2">
            Observer: {selected.observer ?? 'not recorded'}. Quality: {selected.qualityResult ? QUALITY_RESULT_LABELS[selected.qualityResult] : 'not recorded'}.
            {selected.qualityNotes ? ` ${selected.qualityNotes}` : ''}
            {selected.adoptedAt ? ` Adopted ${selected.adoptedAt.slice(0, 10)}${selected.adoptedBy ? ` by ${selected.adoptedBy}` : ''}.` : ''}
          </p>
          {canEdit && selected.basis === 'observed' && !(standard?.id === selected.id && selected.adoptedAt) && (
            <button type="button" className="farm-btn primary mt-2" disabled={pending} onClick={() => run(() => adoptTimeStudy({ id: selected.id }))}>
              Adopt as {cropPlan.code}&rsquo;s labor standard
            </button>
          )}
        </Card>
      )}

      <Card title="Re-study interval" className="mt-4">
        <p className="farm-kpi-sub">
          {due.intervalDays === null ? 'No re-study interval is set for this crop plan.' : `Every ${num(due.intervalDays)} days from the last dated study (${due.lastStudiedOn ?? 'none yet'}).`} {dueText}.
        </p>
        {canEdit && cropPlanId && (
          <div className="flex flex-wrap gap-2 items-center mt-[0.6rem]!">
            <input type="number" min={1} step={1} className="farm-input farm-cell-control w-28! text-right!" placeholder={due.intervalDays === null ? 'days' : String(due.intervalDays)} value={intervalDraft} aria-label="Re-study interval in days" onChange={(e) => setIntervalDraft(e.target.value)} />
            <span className="farm-kpi-sub">days</span>
            <button type="button" className="farm-btn" disabled={pending || !(Number(intervalDraft) >= 1)} onClick={() => run(() => setRestudyInterval({ cropPlanId, intervalDays: Math.round(Number(intervalDraft)) }), () => setIntervalDraft(''))}>Set interval</button>
            {due.intervalDays !== null && <button type="button" className="farm-btn" disabled={pending} onClick={() => run(() => setRestudyInterval({ cropPlanId, intervalDays: null }))}>Clear</button>}
          </div>
        )}
      </Card>

      {canEdit && cropPlanId && (
        <Card title={`Record a time study — ${cropPlan.code}`} className="mt-4">
          {!form ? (
            <button type="button" className="farm-btn" onClick={() => setForm({ studiedOn: today, sowingSize: String(cap.sowingSize), observer: '', qualityResult: 'pass', qualityNotes: '', lines: draftFrom(basis?.lines ?? []) })}>
              Start a study
            </button>
          ) : (
            <>
              <div className="flex flex-wrap gap-3 items-end">
                <label className="farm-kpi-sub">Studied on<br /><input type="date" className="farm-input farm-cell-control w-41!" value={form.studiedOn} onChange={(e) => setForm({ ...form, studiedOn: e.target.value })} /></label>
                <label className="farm-kpi-sub">Sowing size<br /><input type="number" min={1} step={1} className="farm-input farm-cell-control w-28! text-right!" value={form.sowingSize} onChange={(e) => setForm({ ...form, sowingSize: e.target.value })} /></label>
                <label className="farm-kpi-sub">Observer<br /><input className="farm-input farm-cell-control w-56!" value={form.observer} onChange={(e) => setForm({ ...form, observer: e.target.value })} /></label>
                <label className="farm-kpi-sub">Quality<br />
                  <select className="farm-input farm-cell-control w-24!" value={form.qualityResult} onChange={(e) => setForm({ ...form, qualityResult: e.target.value as QualityResult })}>
                    {QUALITY_RESULTS.map((q) => <option key={q} value={q}>{QUALITY_RESULT_LABELS[q]}</option>)}
                  </select>
                </label>
                <label className="farm-kpi-sub flex-1! min-w-64!">Quality notes<br /><input className="farm-input farm-cell-control w-full!" value={form.qualityNotes} onChange={(e) => setForm({ ...form, qualityNotes: e.target.value })} /></label>
              </div>
              <div className="farm-scroll-x mt-3">
                <table className="farm-table compact">
                  <thead><tr><th>Task</th><th>Stream</th><th>Station</th><th className="num">Staff</th><th className="num">Elapsed min</th><th className="num">Labor min</th><th>Scales</th><th /></tr></thead>
                  <tbody>
                    {form.lines.map((l, i) => (
                      <tr key={i}>
                        <td><input className="farm-input farm-cell-control w-64!" value={l.task} aria-label={`Task ${i + 1}`} onChange={(e) => setLine(i, { task: e.target.value })} /></td>
                        <td>
                          <select className="farm-input farm-cell-control w-28!" value={l.stream} aria-label={`Stream ${i + 1}`} onChange={(e) => setLine(i, { stream: e.target.value === 'harvest' ? 'harvest' : 'sowing' })}>
                            {TIME_STUDY_STREAMS.map((s) => <option key={s} value={s}>{TIME_STUDY_STREAM_LABELS[s]}</option>)}
                          </select>
                        </td>
                        <td><input className="farm-input farm-cell-control w-44!" value={l.station} aria-label={`Station ${i + 1}`} onChange={(e) => setLine(i, { station: e.target.value })} /></td>
                        <td className="num"><input type="number" min={0} step={1} className="farm-input farm-cell-control w-20! text-right!" value={l.staff} aria-label={`Staff ${i + 1}`} onChange={(e) => setLine(i, { staff: e.target.value })} /></td>
                        <td className="num"><input type="number" min={0} step={1} className="farm-input farm-cell-control w-24! text-right!" value={l.elapsed} aria-label={`Elapsed minutes ${i + 1}`} onChange={(e) => setLine(i, { elapsed: e.target.value })} /></td>
                        <td className="num"><input type="number" min={0} step={1} className="farm-input farm-cell-control w-24! text-right!" value={l.labor} aria-label={`Labor minutes ${i + 1}`} onChange={(e) => setLine(i, { labor: e.target.value })} /></td>
                        <td>
                          <select className="farm-input farm-cell-control w-34!" value={l.scalesWith} aria-label={`Scales ${i + 1}`} onChange={(e) => setLine(i, { scalesWith: e.target.value === 'fixed' ? 'fixed' : 'variable' })}>
                            <option value="fixed">Fixed per sowing</option>
                            <option value="variable">Per unit</option>
                          </select>
                        </td>
                        <td><button type="button" className="farm-btn py-[0.1rem]! px-[0.45rem]! farm-fs-xs" disabled={form.lines.length === 1} onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })}>Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2 mt-3!">
                <button type="button" className="farm-btn" onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })}>Add a task line</button>
                <button type="button" className="farm-btn primary" disabled={pending || !form.observer.trim() || !(Number(form.sowingSize) >= 1)} onClick={saveStudy}>Record the study</button>
                <button type="button" className="farm-btn" disabled={pending} onClick={() => setForm(null)}>Cancel</button>
              </div>
              <p className="farm-kpi-sub mt-2">Task lines start from {standard ? (onEstimate ? 'the estimated study' : 'the labor standard') : basis ? 'the latest study' : 'nothing on file'}; edit them to what was observed. Labor minutes are the people-minutes a task took (staff × elapsed where everyone worked the whole task). A recorded study is observed; once adopted it replaces the estimate as the standard.</p>
            </>
          )}
        </Card>
      )}

      <p className="farm-kpi-sub mt-4">
        The day&rsquo;s labor requirement by clock interval and proposed crews are on <Link className="farm-link" href="/farm/schedule">Schedule</Link>. Pay is held in Staffing (<Link className="farm-link" href="/farm/staffing">HR</Link>).
      </p>
    </>
  );
}
