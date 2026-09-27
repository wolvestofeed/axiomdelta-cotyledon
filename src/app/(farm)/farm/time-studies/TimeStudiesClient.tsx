'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Kpi, money, num } from '@/components/ui';

import { PageControls } from '@/components/PageControls';
import { GrowPlanSelector, useSelectedGrowPlan } from '@/components/GrowPlanSelector';
import { TrendChart } from '@/components/TrendChart';
import { deriveCapacity } from '@/engine';
import { QUALITY_RESULTS, QUALITY_RESULT_LABELS, TIME_STUDY_BASIS_LABELS, TIME_STUDY_STREAMS, TIME_STUDY_STREAM_LABELS, type QualityResult, type SupplementEntry, type TimeStudyDoc, type TimeStudyLibrary, type TimeStudyLine, type TimeStudyStream, type WaterEntry } from '@/data/time-studies';
import { inStandard, laborMinutesForSowing, laborStandard, nextStudyDue, standardIsEstimated, studiesForGrowPlan, studySupplementMl, studyTrend, studyWaterOz, summarizeStudy, wateringDays } from '@/engine/time-studies';
import { planStageDays, planStages } from '@/data/grow-plan';
import { STAGE_BY_KEY, STAGES, type StageKey } from '@/data/stage-schedule';
import { WATER_ONLY_KEY } from '@/data/inputs-catalog';
import { useScenario } from '@/state/scenario-store';
import { approveTimeStudy, recordTimeStudy, setRestudyInterval } from '@/server/time-study-actions';

type ActionResult = { ok: true } | { ok: false; error: string };

type WaterMethod = WaterEntry['method'];
const METHOD_LABELS: Record<WaterMethod, string> = { mist: 'Mist', bottom: 'Bottom water', rinse: 'Jar rinse' };

interface DraftWater {
  day: string;
  stage: StageKey;
  method: WaterMethod;
  oz: string;
  waterings: string;
  trays: string;
}

interface DraftSupplement {
  day: string;
  stage: StageKey;
  nutrientKey: string;
  ml: string;
  trays: string;
}

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
  cycleDays: string;
  water: DraftWater[];
  supplements: DraftSupplement[];
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
  const { growPlan } = useSelectedGrowPlan();
  return (
    <>
      <PageControls><GrowPlanSelector /></PageControls>
      <PageControls group="action"><a className="farm-btn ghost" href={`/farm/time-studies/time-study-sheet?growPlan=${encodeURIComponent(growPlan.code)}`}>Time Study Sheet</a></PageControls>
      <GrowPlanLabor key={growPlan.code} library={library} canEdit={canEdit} today={today} />
    </>
  );
}

function GrowPlanLabor({ library, canEdit, today }: { library: TimeStudyLibrary; canEdit: boolean; today: string }) {
  const { resolved, nutrients } = useScenario();
  const supplementChoices = useMemo(() => nutrients.filter((n) => n.key !== WATER_ONLY_KEY), [nutrients]);
  const { growPlan } = useSelectedGrowPlan();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<StudyForm | null>(null);
  const [intervalDraft, setIntervalDraft] = useState('');

  const studies = useMemo(() => studiesForGrowPlan(library.studies, growPlan.code), [library.studies, growPlan.code]);
  const standard = laborStandard(studies);
  const onEstimate = standardIsEstimated(standard);
  const approvedCount = studies.filter((s) => s.basis === 'observed' && s.approvedAt).length;
  const basis = standard ?? studies[0] ?? null;
  const planStageList = growPlan ? planStages(growPlan) : STAGES;

  const selected = studies.find((s) => s.id === selectedId) ?? basis;
  const growPlanId = library.growPlanIds[growPlan.code];

  const cap = useMemo(() => deriveCapacity(growPlan, resolved.capacityInputs), [growPlan, resolved.capacityInputs]);
  const planCycleDays = cap.grow?.cycleDays ?? basis?.cycleDays ?? 0;
  // Labor cost uses the plan's loaded labor rate, a placeholder until Staffing's
  // loaded rates arrive. It is never displayed: no wage or pay appears here.
  const loadedRate = resolved.assumptions.labor.blendedLoadedWage.value;
  const basisSummary = basis ? summarizeStudy(basis) : null;
  const sowingMinutes = basisSummary ? laborMinutesForSowing(basisSummary, cap.sowingSize) : null;
  const dayMinutes = sowingMinutes === null ? null : sowingMinutes * cap.cyclesPerDay;
  const due = nextStudyDue(studies, library.intervals[growPlan.code], today);
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

  const startStudy = () => {
    const trays = String(cap.sowingSize);
    const scaffold = growPlan ? wateringDays(planStageList, planStageDays(growPlan), today, cap.sowingSize) : [];
    setForm({
      studiedOn: today,
      sowingSize: trays,
      cycleDays: String(planCycleDays),
      observer: '',
      qualityResult: 'pass',
      qualityNotes: '',
      lines: draftFrom(basis?.lines ?? []),
      water: scaffold.map((w) => ({ day: w.day, stage: w.stage, method: w.method, oz: '', waterings: String(w.waterings), trays: String(w.trays) })),
      supplements: [],
    });
  };

  const saveStudy = () => {
    if (!form || !growPlanId) return;
    const lines = form.lines
      .filter((l) => l.task.trim())
      .map((l) => ({ task: l.task.trim(), station: l.station.trim() || null, staff: Math.round(Number(l.staff) || 0), elapsedMinutes: Number(l.elapsed) || 0, laborMinutes: Number(l.labor) || 0, scalesWith: l.scalesWith, stream: l.stream }));
    if (form.water.some((w) => w.oz.trim() === '')) {
      setError('Enter the fluid ounces per watering on every watering row, or remove the row.');
      return;
    }
    if (form.supplements.some((x) => x.ml.trim() === '' || !x.nutrientKey)) {
      setError('Enter the supplement and its ml on every supplement row, or remove the row.');
      return;
    }
    const water: WaterEntry[] = form.water.map((w) => ({ day: w.day, stage: w.stage, method: w.method, ozPerWatering: Number(w.oz), waterings: Math.round(Number(w.waterings) || 0), trays: Math.round(Number(w.trays) || 0) }));
    const supplements: SupplementEntry[] = form.supplements.map((x) => ({ day: x.day, stage: x.stage, nutrientKey: x.nutrientKey, ml: Number(x.ml), trays: Math.round(Number(x.trays) || 0) }));
    run(
      () =>
        recordTimeStudy({
          growPlanId,
          studiedOn: form.studiedOn,
          sowingSize: Math.round(Number(form.sowingSize)),
          cycleDays: Math.round(Number(form.cycleDays) || 0),
          observer: form.observer,
          qualityResult: form.qualityResult,
          qualityNotes: form.qualityNotes || null,
          lines,
          consumption: { water, supplements },
        }),
      () => setForm(null),
    );
  };
  const setLine = (i: number, patch: Partial<DraftLine>) => setForm((f) => (f ? { ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : f));
  const setWater = (i: number, patch: Partial<DraftWater>) => setForm((f) => (f ? { ...f, water: f.water.map((w, j) => (j === i ? { ...w, ...patch } : w)) } : f));
  const setSupplement = (i: number, patch: Partial<DraftSupplement>) => setForm((f) => (f ? { ...f, supplements: f.supplements.map((x, j) => (j === i ? { ...x, ...patch } : x)) } : f));
  const lastDay = (f: StudyForm) => f.water.at(-1)?.day ?? f.supplements.at(-1)?.day ?? f.studiedOn;

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
        <Kpi value={num(studies.length)} label={`Time studies — ${growPlan.code}`} sub={standard ? (onEstimate ? 'Standard: the estimate, until an observed study is approved' : approvedCount > 1 ? `Standard: the average of ${num(approvedCount)} approved studies` : `Standard: the ${studyDate(standard)} study, approved`) : studies.length ? 'None approved; the latest study is shown' : 'None logged'} />
        <Kpi value={basisSummary ? num(basisSummary.laborMinutesPerUnit, 2) : '—'} label="Labor minutes per unit" sub={basis ? `At the ${num(basis.sowingSize)}-unit sowing studied` : undefined} />
        <Kpi value={sowingMinutes === null ? '—' : num(sowingMinutes / 60, 2)} label="Labor hours per sowing" sub={`At the derived ${num(cap.sowingSize)}-unit sowing`} />
        <Kpi value={sowingMinutes === null ? '—' : money((sowingMinutes / 60) * loadedRate, 0)} label="Labor cost per sowing" sub="At the plan's placeholder loaded rate" />
        <Kpi value={dayMinutes === null ? '—' : money((dayMinutes / 60) * loadedRate, 0)} label="Labor cost per rated day" sub={`${num(cap.cyclesPerDay)} sowings; ${dayMinutes === null ? '—' : num(dayMinutes / 60, 1)} labor hours`} />
        <Kpi value={due.dueOn ?? '—'} label="Next study due" sub={dueText} />
      </div>
      {error && <p className="farm-kpi-sub mt-3 farm-c-accent">{error}</p>}

      <Card title={`Time study log — ${growPlan.code} ${growPlan.name}`} className="mt-4">
        {studies.length === 0 ? (
          <p className="farm-kpi-sub">No time study is logged for this grow plan.{canEdit ? ' Record one below.' : ''}</p>
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
                      <td>{s.approvedAt ? (inStandard(s, standard) ? 'Approved, in the standard' : 'Approved') : s.basis === 'estimated' ? (standard?.id === s.id ? 'Stands in' : '—') : 'Not approved'}</td>
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
        <p className="farm-kpi-sub mt-2">Newest first; the estimated study and any study recorded without a date are listed last and have no point on the trends. An estimated study is a mock estimate per step, seeded so the grow plan has a labor standard before a sowing is timed; it stands in until an observed study is approved. Every observed study is approved by an admin, and the standard is the average of the approved studies weighted by the trays each timed; approving one also approves a standard version effective that day. Fixed minutes are the tasks that do not scale; variable minutes per unit are the tasks that scale, over the sowing size studied. Each line is on the sowing stream — counted per sowing harvested — or the harvest stream — run first thing each distribution day from staged components and counted per unit shipped that day. The Time Study Sheet above is the printable instrument for timing a sowing; a timed sowing is recorded below, dated, with the observer and the quality result, and joins this log.</p>
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
        <Card title={selected.averageOf ? `The labor standard — the average of ${num(selected.averageOf.length)} approved studies` : `Study — ${studyDate(selected)}${standard?.id === selected.id ? (selected.approvedAt ? ' · the labor standard' : ' · stands in as the labor standard') : ''}`} className="mt-4">
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
            {selected.averageOf ? ` Averaged from the approved studies, weighted by the trays each timed, at the latest study's ${num(selected.sowingSize)}-unit sowing over a ${num(selected.cycleDays, 1)}-day cycle.` : selected.approvedAt ? ` Approved ${selected.approvedAt.slice(0, 10)}${selected.approvedBy ? ` by ${selected.approvedBy}` : ''}.` : ''}
          </p>
          {!selected.averageOf && (selected.consumption.water.length > 0 || selected.consumption.supplements.length > 0) && (
            <>
              <div className="farm-card-title mt-3">Water and supplements applied</div>
              <div className="grid gap-3 farm-autofit-10 mt-2 mb-2!">
                <Kpi value={`${num(selected.sowingSize > 0 ? studyWaterOz(selected.consumption) / selected.sowingSize : 0, 1)} fl oz`} label="Water per tray" sub={`${num(studyWaterOz(selected.consumption) / 128, 2)} gal over the sowing`} />
                {Object.entries(studySupplementMl(selected.consumption)).map(([key, ml]) => (
                  <Kpi key={key} value={`${num(selected.sowingSize > 0 ? ml / selected.sowingSize : 0, 2)} ml`} label={`${nutrients.find((n) => n.key === key)?.name ?? key} per tray`} sub={`${num(ml, 1)} ml over the sowing`} />
                ))}
              </div>
              <div className="farm-scroll-x">
                <table className="farm-table compact">
                  <thead><tr><th>Day</th><th>Stage</th><th>Applied</th><th className="num">Per tray per watering</th><th className="num">Waterings</th><th className="num">Trays</th><th className="num">In all</th></tr></thead>
                  <tbody>
                    {selected.consumption.water.map((w, i) => (
                      <tr key={`w${i}`}><td>{w.day}</td><td>{STAGE_BY_KEY[w.stage]?.name ?? w.stage}</td><td>{METHOD_LABELS[w.method]}</td><td className="num">{num(w.ozPerWatering, 1)} fl oz</td><td className="num">{num(w.waterings)}</td><td className="num">{num(w.trays)}</td><td className="num">{num(w.ozPerWatering * w.waterings * w.trays, 0)} fl oz</td></tr>
                    ))}
                    {selected.consumption.supplements.map((x, i) => (
                      <tr key={`s${i}`}><td>{x.day}</td><td>{STAGE_BY_KEY[x.stage]?.name ?? x.stage}</td><td>{nutrients.find((n) => n.key === x.nutrientKey)?.name ?? x.nutrientKey}</td><td className="num">—</td><td className="num">—</td><td className="num">{num(x.trays)}</td><td className="num">{num(x.ml, 1)} ml</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {canEdit && selected.basis === 'observed' && !selected.averageOf && !selected.approvedAt && (
            <>
              <button type="button" className="farm-btn primary mt-2" disabled={pending} onClick={() => run(() => approveTimeStudy({ id: selected.id }))}>
                Approve
              </button>
              <p className="farm-kpi-sub mt-1">Approving puts this study in {growPlan.code}&rsquo;s averaged labor standard and measured water and supplements, and approves a standard version effective today: sowings from today are costed at the new average; trays already sown keep the standard they were sown at.</p>
            </>
          )}
        </Card>
      )}

      <Card title="Re-study interval" className="mt-4">
        <p className="farm-kpi-sub">
          {due.intervalDays === null ? 'No re-study interval is set for this grow plan.' : `Every ${num(due.intervalDays)} days from the last dated study (${due.lastStudiedOn ?? 'none yet'}).`} {dueText}.
        </p>
        {canEdit && growPlanId && (
          <div className="flex flex-wrap gap-2 items-center mt-[0.6rem]!">
            <input type="number" min={1} step={1} className="farm-input farm-cell-control w-28! text-right!" placeholder={due.intervalDays === null ? 'days' : String(due.intervalDays)} value={intervalDraft} aria-label="Re-study interval in days" onChange={(e) => setIntervalDraft(e.target.value)} />
            <span className="farm-kpi-sub">days</span>
            <button type="button" className="farm-btn" disabled={pending || !(Number(intervalDraft) >= 1)} onClick={() => run(() => setRestudyInterval({ growPlanId, intervalDays: Math.round(Number(intervalDraft)) }), () => setIntervalDraft(''))}>Set interval</button>
            {due.intervalDays !== null && <button type="button" className="farm-btn" disabled={pending} onClick={() => run(() => setRestudyInterval({ growPlanId, intervalDays: null }))}>Clear</button>}
          </div>
        )}
      </Card>

      {canEdit && growPlanId && (
        <Card title={`Record a time study — ${growPlan.code}`} className="mt-4">
          {!form ? (
            <button type="button" className="farm-btn" onClick={startStudy}>
              Start a study
            </button>
          ) : (
            <>
              <div className="flex flex-wrap gap-3 items-end">
                <label className="farm-kpi-sub">Studied on<br /><input type="date" className="farm-input farm-cell-control w-41!" value={form.studiedOn} onChange={(e) => setForm({ ...form, studiedOn: e.target.value })} /></label>
                <label className="farm-kpi-sub">Sowing size<br /><input type="number" min={1} step={1} className="farm-input farm-cell-control w-28! text-right!" value={form.sowingSize} onChange={(e) => setForm({ ...form, sowingSize: e.target.value })} /></label>
                <label className="farm-kpi-sub">Cycle days<br /><input type="number" min={0} step={1} className="farm-input farm-cell-control w-24! text-right!" value={form.cycleDays} onChange={(e) => setForm({ ...form, cycleDays: e.target.value })} /></label>
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
                          <select className="farm-input farm-cell-control w-28!" value={l.stream} aria-label={`Stream ${i + 1}`} onChange={(e) => setLine(i, { stream: e.target.value === 'harvest' ? 'harvest' : e.target.value === 'daily' ? 'daily' : 'sowing' })}>
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
              </div>

              <div className="farm-card-title mt-4">Water applied</div>
              <p className="farm-kpi-sub">One row per day and method: fluid ounces per tray per watering, the waterings that day, the trays watered. The rows start from the stage schedule from the study date; the ounces are what was measured.</p>
              <div className="farm-scroll-x mt-2">
                <table className="farm-table compact">
                  <thead><tr><th>Day</th><th>Stage</th><th>Method</th><th className="num">Fl oz per tray per watering</th><th className="num">Waterings</th><th className="num">Trays</th><th /></tr></thead>
                  <tbody>
                    {form.water.map((w, i) => (
                      <tr key={i}>
                        <td><input type="date" className="farm-input farm-cell-control w-41!" value={w.day} aria-label={`Watering day ${i + 1}`} onChange={(e) => setWater(i, { day: e.target.value })} /></td>
                        <td>
                          <select className="farm-input farm-cell-control w-36!" value={w.stage} aria-label={`Watering stage ${i + 1}`} onChange={(e) => setWater(i, { stage: e.target.value as StageKey })}>
                            {planStageList.map((st) => <option key={st.key} value={st.key}>{st.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className="farm-input farm-cell-control w-36!" value={w.method} aria-label={`Watering method ${i + 1}`} onChange={(e) => setWater(i, { method: e.target.value as WaterMethod })}>
                            {(Object.keys(METHOD_LABELS) as WaterMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
                          </select>
                        </td>
                        <td className="num"><input type="number" min={0} step={0.1} className="farm-input farm-cell-control w-24! text-right!" value={w.oz} aria-label={`Fluid ounces per watering ${i + 1}`} onChange={(e) => setWater(i, { oz: e.target.value })} /></td>
                        <td className="num"><input type="number" min={0} step={1} className="farm-input farm-cell-control w-20! text-right!" value={w.waterings} aria-label={`Waterings ${i + 1}`} onChange={(e) => setWater(i, { waterings: e.target.value })} /></td>
                        <td className="num"><input type="number" min={0} step={1} className="farm-input farm-cell-control w-20! text-right!" value={w.trays} aria-label={`Trays watered ${i + 1}`} onChange={(e) => setWater(i, { trays: e.target.value })} /></td>
                        <td><button type="button" className="farm-btn py-[0.1rem]! px-[0.45rem]! farm-fs-xs" onClick={() => setForm({ ...form, water: form.water.filter((_, j) => j !== i) })}>Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2 mt-2!">
                <button type="button" className="farm-btn" onClick={() => setForm({ ...form, water: [...form.water, { day: lastDay(form), stage: form.water.at(-1)?.stage ?? 'light', method: form.water.at(-1)?.method ?? 'bottom', oz: '', waterings: '1', trays: form.sowingSize }] })}>Add a watering row</button>
              </div>

              <div className="farm-card-title mt-4">Supplements applied</div>
              <div className="farm-scroll-x mt-2">
                {form.supplements.length > 0 && (
                  <table className="farm-table compact">
                    <thead><tr><th>Day</th><th>Stage</th><th>Supplement</th><th className="num">Ml in all</th><th className="num">Trays</th><th /></tr></thead>
                    <tbody>
                      {form.supplements.map((x, i) => (
                        <tr key={i}>
                          <td><input type="date" className="farm-input farm-cell-control w-41!" value={x.day} aria-label={`Supplement day ${i + 1}`} onChange={(e) => setSupplement(i, { day: e.target.value })} /></td>
                          <td>
                            <select className="farm-input farm-cell-control w-36!" value={x.stage} aria-label={`Supplement stage ${i + 1}`} onChange={(e) => setSupplement(i, { stage: e.target.value as StageKey })}>
                              {planStageList.map((st) => <option key={st.key} value={st.key}>{st.name}</option>)}
                            </select>
                          </td>
                          <td>
                            <select className="farm-input farm-cell-control w-56!" value={x.nutrientKey} aria-label={`Supplement ${i + 1}`} onChange={(e) => setSupplement(i, { nutrientKey: e.target.value })}>
                              {supplementChoices.map((n) => <option key={n.key} value={n.key}>{n.name}</option>)}
                            </select>
                          </td>
                          <td className="num"><input type="number" min={0} step={0.1} className="farm-input farm-cell-control w-24! text-right!" value={x.ml} aria-label={`Supplement ml ${i + 1}`} onChange={(e) => setSupplement(i, { ml: e.target.value })} /></td>
                          <td className="num"><input type="number" min={0} step={1} className="farm-input farm-cell-control w-20! text-right!" value={x.trays} aria-label={`Supplement trays ${i + 1}`} onChange={(e) => setSupplement(i, { trays: e.target.value })} /></td>
                          <td><button type="button" className="farm-btn py-[0.1rem]! px-[0.45rem]! farm-fs-xs" onClick={() => setForm({ ...form, supplements: form.supplements.filter((_, j) => j !== i) })}>Remove</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-2!">
                <button type="button" className="farm-btn" disabled={supplementChoices.length === 0} onClick={() => setForm({ ...form, supplements: [...form.supplements, { day: lastDay(form), stage: 'light', nutrientKey: supplementChoices[0]?.key ?? '', ml: '', trays: form.sowingSize }] })}>Add supplement</button>
              </div>

              <div className="flex flex-wrap gap-2 mt-4!">
                <button type="button" className="farm-btn primary" disabled={pending || !form.observer.trim() || !(Number(form.sowingSize) >= 1)} onClick={saveStudy}>Record the study</button>
                <button type="button" className="farm-btn" disabled={pending} onClick={() => setForm(null)}>Cancel</button>
              </div>
              <p className="farm-kpi-sub mt-2">Task lines start from {standard ? (onEstimate ? 'the estimated study' : 'the labor standard') : basis ? 'the latest study' : 'nothing on file'}; edit them to what was observed. Labor minutes are the people-minutes a task took (staff × elapsed where everyone worked the whole task). A recorded study is observed; once approved it joins the standard in place of the estimate.</p>
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
