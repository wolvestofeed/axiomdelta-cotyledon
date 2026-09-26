'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import Link from 'next/link';
import { Card, Kpi, StatusBadge, money, num } from '../../_components/ui';
import { CompareTable } from '../../_components/CompareTable';
import { useScenario } from '../../_state/scenario-store';
import { interpretCropPlanInstruction, saveCropPlanVariant } from '../../_lib/agent-actions';
import { resolveProposal, type CropPlanVariantProposal, type ResolvedVariant } from '../../_engine/agent-proposal';
import { compareCropPlans } from '../../_engine/crop-plan-compare';
import { deriveCapacity } from '../../_engine/index';
import { laborStandardFor } from '../../_engine/unit-cost';
import type { CatalogLine } from '../../_engine/catalog';
import type { TimeStudyDoc } from '../../_data/time-studies';
import type { CropPlanDef } from '../../_data/plan-data';
import { isVegetableLine } from '../../_data/crop-plans-seed';

/**
 * Compare — the Crop plan tab (agentic-assistance build plan §6). Two crop plans
 * costed under the open forecast: side A a library crop plan, side B a variant
 * built from the chef's typed or dictated instruction. The model returns a
 * proposal; the engine resolves it (find, derive, ask) and costs both sides;
 * the admin reviews the proposal card, answers or waives its questions, and
 * saves the variant to the library only on click. Nothing on the table comes
 * from the model, and the table never picks a crop plan.
 */

// ── Dictation: the browser's Web Speech API into the same text box (decision 12) ──

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
interface SpeechRecognizer {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type SpeechCtor = new () => SpeechRecognizer;

function speechCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const subscribeNothing = () => () => {};

/** What the browser reports when dictation stops on its own, in plain words. */
const DICTATION_ERRORS: Record<string, string> = {
  'not-allowed': 'The browser refused microphone access for this pickup point. Allow the microphone in the address bar and try again.',
  'service-not-allowed': 'The browser’s speech service is not allowed here.',
  'audio-capture': 'No microphone was found.',
  network: 'The browser’s speech service could not be reached. Chrome and Edge send audio to their speech service; it needs a network connection.',
  'no-speech': 'No speech was heard before the browser stopped listening.',
  aborted: 'Dictation was stopped.',
};

function useDictation(onFinal: (text: string) => void) {
  // Support is a property of the browser, read as a snapshot: false on the server, so the markup matches.
  const supported = useSyncExternalStore(subscribeNothing, () => speechCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SpeechRecognizer | null>(null);
  const stop = useCallback(() => {
    rec.current?.stop();
    rec.current = null;
    setListening(false);
    setInterim('');
  }, []);
  const start = useCallback(() => {
    const Ctor = speechCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onresult = (e) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        const t = res[0]?.transcript ?? '';
        if (res.isFinal) finalText += t;
        else interimText += t;
      }
      if (finalText) onFinal(finalText);
      setInterim(interimText);
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      setInterim('');
    };
    r.onerror = (e) => {
      setError(DICTATION_ERRORS[e.error] ?? `Dictation stopped (${e.error}).`);
      stop();
    };
    rec.current = r;
    setError(null);
    try {
      r.start();
      setListening(true);
    } catch (e) {
      setError(`Dictation could not start: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [onFinal, stop]);
  useEffect(() => () => rec.current?.stop(), []);
  return { supported, listening, interim, error, start, stop };
}

// ── The tab ──────────────────────────────────────────────────────────────────

const DEFAULT_SOURCE = 'AMK-E-003';

const fmt = (v: string | number | null): string => (v === null ? '—' : typeof v === 'number' ? num(v, Number.isInteger(v) ? 0 : 2) : v);

/**
 * The example in the empty text box, written against the crop plan that is
 * selected so every part it names is on that crop plan: a hot vegetable line
 * where there is one, else the first hot line. It shows the shape of a complete
 * instruction — the line, its new form, the step with minutes and staff, the
 * name — and nothing the chef would have to look up.
 */
function exampleInstruction(r: CropPlanDef): string {
  const hot = r.inputs.filter((l) => l.isHotComponent);
  const line = hot.find(isVegetableLine) ?? hot[0] ?? r.inputs[0];
  if (!line) return 'Describe the change to this crop plan.';
  const item = line.name.split(',')[0]!.trim().toLowerCase();
  const part = line.component.toLowerCase();
  const form = isVegetableLine(line) ? 'cut' : 'prepped';
  return `Duplicate this crop plan with the ${item} bought already ${form} from the supplier. The ${part} prep step drops to 10 labor minutes with one person; the sow step is unchanged. Call it the pre-${form} ${part}.`;
}

export function CropPlanCompareClient({ studies, catalog, supplierNames, today }: { studies: TimeStudyDoc[]; catalog: Record<string, CatalogLine[]>; supplierNames: Record<string, string>; today: string }) {
  const { resolved } = useScenario();
  // The tab opens on the sweet potato hash, the crop plan the Crop plan tab was built and tested on; the list is by code.
  const [sourceCode, setSourceCode] = useState(resolved.cropPlans.some((r) => r.code === DEFAULT_SOURCE) ? DEFAULT_SOURCE : resolved.cropPlan.code);
  const cropPlanOptions = useMemo(() => [...resolved.cropPlans].sort((a, b) => a.code.localeCompare(b.code)), [resolved.cropPlans]);
  const [text, setText] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [proposal, setProposal] = useState<CropPlanVariantProposal | null>(null);
  const [waived, setWaived] = useState<Set<string>>(() => new Set());
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set());
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ code: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [savePending, startSave] = useTransition();

  const appendDictated = useCallback((t: string) => setText((prev) => (prev.trim().length === 0 ? t.trim() : `${prev.trimEnd()} ${t.trim()}`)), []);
  const dictation = useDictation(appendDictated);

  const source = resolved.cropPlans.find((r) => r.code === sourceCode) ?? resolved.cropPlan;
  const approvedCatalog = useMemo(() => Object.values(catalog).flat().filter((c) => c.status === 'approved'), [catalog]);
  const sourceSowing = useMemo(() => deriveCapacity(source, resolved.capacityInputs).sowingSize, [source, resolved.capacityInputs]);

  const variant: ResolvedVariant | { error: string } | null = useMemo(() => {
    if (!proposal) return null;
    return resolveProposal({ ...proposal, sourceCropPlan: proposal.sourceCropPlan || source.code }, { library: resolved.cropPlans, studies, catalog: approvedCatalog, supplierNames, asOf: today, sowingSize: sourceSowing, waived, confirmed });
  }, [proposal, source.code, resolved.cropPlans, studies, approvedCatalog, supplierNames, today, sourceSowing, waived, confirmed]);
  const ready = variant !== null && !('error' in variant) && variant.ready;

  const comparison = useMemo(() => {
    if (!variant || 'error' in variant || !variant.ready) return null;
    const a = { label: variant.source.name, cropPlan: variant.source, cost: resolved.cropPlanCosts[variant.source.code] ?? { labor: laborStandardFor(variant.source, studies, sourceSowing), packagingPerUnit: 0 }, placeholders: 0 };
    const doc: TimeStudyDoc = { id: 'variant', cropPlanCode: variant.variant.code, adoptedAt: null, adoptedBy: null, source: 'user_built', ...variant.study };
    const sowingB = deriveCapacity(variant.variant, resolved.capacityInputs).sowingSize;
    const b = { label: variant.variant.name, cropPlan: variant.variant, cost: { labor: laborStandardFor(variant.variant, [doc], sowingB), packagingPerUnit: a.cost.packagingPerUnit }, placeholders: variant.placeholderCount };
    return compareCropPlans(a, b, resolved.capacityInputs, resolved.assumptions);
  }, [variant, resolved.cropPlanCosts, resolved.capacityInputs, resolved.assumptions, studies, sourceSowing]);

  const interpret = (withAnswers: boolean) => {
    setError(null);
    setSaved(null);
    const instruction = followUp.trim().length > 0 ? `${text.trim()}\n\nFollow-up: ${followUp.trim()}` : text.trim();
    const questions = variant && !('error' in variant) ? variant.questions : [];
    const answerRows = withAnswers ? questions.filter((q) => (answers[q.id] ?? '').trim().length > 0).map((q) => ({ questionId: q.id, question: q.question, answer: answers[q.id]!.trim() })) : [];
    start(async () => {
      const res = await interpretCropPlanInstruction({ instruction, sourceCropPlanCode: source.code, answers: answerRows });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setProposal(res.proposal);
      if (withAnswers) {
        setText(instruction);
        setFollowUp('');
        setAnswers({});
      }
    });
  };

  const toggle = (set: (f: (prev: Set<string>) => Set<string>) => void, id: string) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = () => {
    if (!variant || 'error' in variant || !variant.ready) return;
    setSaveError(null);
    const v = variant.variant;
    startSave(async () => {
      const res = await saveCropPlanVariant({
        sourceCode: variant.source.code,
        cropPlan: {
          name: v.name,
          category: v.category,
          status: 'developing',
          channels: v.channels,
          components: v.components,
          productionMethod: v.productionMethod,
          allergensPresent: v.allergensPresent,
          allergenFreeClaims: v.allergenFreeClaims,
          sowingUnits: v.sowingUnits,
          trayFormat: v.spec.trayFormat.value,
          servingGrowUnitCapacityOz: v.spec.servingGrowUnitCapacityOz.value,
          inputs: v.inputs,
        },
        study: { sowingSize: variant.study.sowingSize, qualityNotes: variant.study.qualityNotes, lines: variant.study.lines },
      });
      if (!res.ok) setSaveError(res.error);
      else setSaved({ code: res.code });
    });
  };

  const questions = variant && !('error' in variant) ? variant.questions : [];
  const blocking = questions.filter((q) => q.blocking);

  return (
    <>
      <Card title="Describe the change">
        <label className="flex items-center gap-2 mb-2">
          <span>Crop plan</span>
          <select className="farm-select" value={source.code} aria-label="Crop plan to change" onChange={(e) => setSourceCode(e.target.value)}>
            {cropPlanOptions.map((r) => (
              <option key={r.code} value={r.code}>{r.code} — {r.name}</option>
            ))}
          </select>
        </label>
        <textarea
          className="farm-input w-full!"
          rows={4}
          value={dictation.interim ? `${text}${text ? ' ' : ''}${dictation.interim}` : text}
          onChange={(e) => setText(e.target.value)}
          placeholder={exampleInstruction(source)}
          aria-label="The change to describe"
          disabled={pending}
        />
        <div className="flex gap-3 flex-wrap mt-2 items-center">
          <button type="button" className="farm-btn primary" disabled={pending || text.trim().length === 0} onClick={() => interpret(false)}>
            {pending ? 'Interpreting…' : 'Interpret'}
          </button>
          {dictation.supported && (
            <button type="button" className="farm-btn" aria-pressed={dictation.listening} disabled={pending} onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}>
              {dictation.listening ? 'Stop dictating' : 'Dictate'}
            </button>
          )}
          {dictation.listening && <span className="farm-kpi-sub">Listening — speech is written into the box as it is recognised; nothing is recorded.</span>}
          {dictation.error && <span className="farm-kpi-sub farm-c-err">{dictation.error}</span>}
          {proposal && (
            <button type="button" className="farm-btn" disabled={pending} onClick={() => { setProposal(null); setWaived(new Set()); setConfirmed(new Set()); setAnswers({}); setFollowUp(''); setSaved(null); setSaveError(null); setError(null); }}>
              Clear proposal
            </button>
          )}
        </div>
        {error && <div className="farm-scenariobar-msg err mt-2" role="status">{error}</div>}
      </Card>

      {variant && 'error' in variant && (
        <Card title="Proposal" className="mt-4">
          <p className="farm-kpi-sub">{variant.error}</p>
        </Card>
      )}

      {variant && !('error' in variant) && (
        <Card title={`Proposal — ${variant.variant.name}`} className="mt-4">
          {proposal && proposal.facts.length > 0 && (
            <ul className="farm-kpi-sub mb-3 list-disc pl-5">
              {proposal.facts.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 farm-autofit-11 mb-3">
            <Kpi value={num(variant.changes.filter((c) => c.target === 'line').length)} label="Line changes" sub={`${num(variant.variant.inputs.length)} lines on the variant`} />
            <Kpi value={num(variant.changes.filter((c) => c.target === 'step').length)} label="Step changes" sub={`${num(variant.study.lines.length)} steps, ${variant.sourceStudyBasis === 'built' ? 'built estimate' : `${variant.sourceStudyBasis} standard`} as the base`} />
            <Kpi value={num(questions.length)} label="Open questions" sub={blocking.length > 0 ? `${num(blocking.length)} block the run` : 'None block the run'} />
            <Kpi value={num(variant.placeholderCount)} label="Placeholders" sub="Figures carried from waived questions" />
          </div>

          {variant.findings.length > 0 && (
            <div className="farm-scenariobar-msg err mb-3" role="status">
              {variant.findings.map((f, i) => (
                <div key={i}>{f}</div>
              ))}
            </div>
          )}

          <div className="farm-card-title">What changes, and where each figure came from</div>
          {variant.changes.length === 0 ? (
            <p className="farm-kpi-sub">No change was read from the instruction.</p>
          ) : (
            <div className="farm-scroll-x">
              <table className="farm-table compact">
                <thead>
                  <tr><th>On</th><th>Name</th><th>Field</th><th className="num">From</th><th className="num">To</th><th>Tag</th><th>Where it came from</th></tr>
                </thead>
                <tbody>
                  {variant.changes.map((c, i) => (
                    <tr key={i}>
                      <td>{c.target === 'line' ? 'Line' : c.target === 'step' ? 'Step' : 'Crop plan'}</td>
                      <td className="font-medium!">{c.name}</td>
                      <td>{c.field}</td>
                      <td className="num">{fmt(c.from)}</td>
                      <td className="num">{fmt(c.to)}</td>
                      <td><StatusBadge status={c.status} title={c.note} /></td>
                      <td className="farm-c-soft">{c.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="farm-card-title mt-4">Open questions</div>
          {questions.length === 0 ? (
            <p className="farm-kpi-sub">The instruction stated everything the variant needs.</p>
          ) : (
            <div className="grid gap-2">
              {questions.map((q) => (
                <div key={q.id} className="farm-card">
                  <div className="flex gap-3 flex-wrap items-start">
                    <div className="flex-1 min-w-56">
                      <div>{q.question}</div>
                      <div className="farm-kpi-sub">
                        {q.kind === 'confirm'
                          ? q.confirmed
                            ? 'Confirmed — its figures are on the variant, each with its own tag.'
                            : 'Confirm to use these figures, or answer with what to use instead.'
                          : q.waived
                            ? 'Waived — carried as a placeholder.'
                            : q.waivable
                              ? 'Answer it, or waive it to carry a placeholder.'
                              : 'Must be answered before the run.'}
                      </div>
                    </div>
                    <input className="farm-input w-64!" placeholder={q.kind === 'confirm' ? 'Or use instead…' : 'Answer'} aria-label={`Answer: ${q.question}`} value={answers[q.id] ?? ''} disabled={q.waived || q.confirmed || pending} onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))} />
                    {q.kind === 'confirm' && (
                      <button type="button" className={`farm-btn ${q.confirmed ? '' : 'primary'}`} disabled={pending} onClick={() => toggle(setConfirmed, q.id)}>
                        {q.confirmed ? 'Undo' : 'Use it'}
                      </button>
                    )}
                    {q.kind === 'ask' && q.waivable && (
                      <button type="button" className="farm-btn" disabled={pending} onClick={() => toggle(setWaived, q.id)}>
                        {q.waived ? 'Unwaive' : 'Waive'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3">
            <textarea className="farm-input w-full!" rows={2} value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="Anything else to add or correct, in plain words." aria-label="Follow-up" disabled={pending} />
            <div className="flex gap-3 flex-wrap mt-2 items-center">
              <button type="button" className="farm-btn" disabled={pending || (followUp.trim().length === 0 && Object.values(answers).every((a) => a.trim().length === 0))} onClick={() => interpret(true)}>
                {pending ? 'Interpreting…' : 'Re-interpret with answers'}
              </button>
              <span className="farm-kpi-sub">Answers and the follow-up are read with the original instruction as one turn; a settled question is not asked again.</span>
            </div>
          </div>
        </Card>
      )}

      {comparison && variant && !('error' in variant) && (
        <Card title={`${comparison.labelA} against ${comparison.labelB} — under the open forecast`} className="mt-4">
          <CompareTable rows={comparison.rows} labelA={comparison.labelA} labelB={comparison.labelB} />
          <p className="farm-kpi-sub mt-2">
            {comparison.identical ? 'The two crop plans cost the same on every row.' : 'Both crop plans are costed at the same forecast: the same plant and derived sowing rule, the same shrink allowance, packaging and distribution. A bold Δ is a row where less is plainly less; the rest are facts, not scores.'}{' '}
            Labor dollars are at the forecast’s blended loaded wage, {money(comparison.wage.value)}/hr ({comparison.wage.status.toLowerCase()}); pay is held in Staffing.
          </p>
          <div className="flex gap-3 flex-wrap mt-3 items-center">
            <button type="button" className="farm-btn primary" disabled={savePending || !ready || saved !== null} onClick={save}>
              {savePending ? 'Saving…' : saved ? `Saved as ${saved.code}` : 'Save variant to library'}
            </button>
            <span className="farm-kpi-sub">
              {saved ? (
                <>
                  Saved at status Developing with its estimated study. Open it on <Link className="farm-link" href={`/farm/crop-plans?crop plan=${saved.code}`}>Crop plans</Link>.
                </>
              ) : (
                'Writes the variant to the library at status Developing, with its estimated study, so it never enters production planning until its status is changed. Until saved it lives on this page only.'
              )}
            </span>
          </div>
          {saveError && <div className="farm-scenariobar-msg err mt-2" role="status">The variant was not saved: {saveError}</div>}

        </Card>
      )}

      {variant && !('error' in variant) && !comparison && (
        <Card title="Comparison" className="mt-4">
          <p className="farm-kpi-sub">{variant.findings.length > 0 ? 'The variant cannot be built as instructed; see the finding above.' : `${num(blocking.length)} open question${blocking.length === 1 ? '' : 's'} must be answered or waived before the two crop plans are costed.`}</p>
        </Card>
      )}
    </>
  );
}
