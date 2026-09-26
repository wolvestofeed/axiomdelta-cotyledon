'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckPill } from './ui';
import { recordBatch } from '../_lib/actuals-actions';
import { batchIdFor, type BatchRecordDoc, laborFromCrew, type CrewHoursLine } from '../_engine/actuals';
import { massBalance, ABNORMAL_SCRAP_REASONS, SCRAP_STAGES, type ComponentExecution, type ScrapReason, type ScrapStage, coolingLoadsOf, type CoolingRecord } from '../_engine/batch';
import { CCP2_LIMITS } from '../_engine/food-safety';
import type { RawLot } from '../_engine/net-requirements';

/**
 * Close a batch record — the production performance object the ledger posts
 * from. Weights start at the recipe standard for the portions entered; the
 * operator types what actually happened. The record does not close until it
 * mass-balances and someone signs it (docs/muse/CLAUDE.md §2 rule 9).
 *
 * Lives on Production Planning (the delivery-day view) since Roadmap H4 and on
 * the floor surface since Roadmap I3; the Actuals page lists the closed records.
 *
 * Phase I3 added the CCP-1 end-of-cook temperature and the CCP-2 cooling
 * record per hot component, and input-lot pickers drawn from the lots on hand
 * (a code can still be typed when the case is not in the register). A missing
 * temperature is recorded as a gap, never as a pass.
 */

/** CCP-1 minimum internal cook temperature, °F — the HACCP plan's limit for the ground-beef step. */
const CCP1_MIN_F = 155;

const SCRAP_REASONS: ScrapReason[] = [
  'TRIM', 'COOK_LOSS', 'PORTION_OVERAGE', 'CHILL_FAILURE', 'TEMPERATURE_EXCURSION',
  'EQUIPMENT_FAILURE', 'CONTAMINATION', 'DROPPED_OR_DAMAGED', 'RECALL_OR_WITHDRAWAL', 'EXPIRED_HOLD_LIFE',
];

export function BatchCloseForm({
  prefill,
  batchCountByDate,
  standardBatchSize,
  recipeName,
  rawLots = [],
  onDone,
  onCancel,
}: {
  /** The standard batch for the recipe and portions, from `standardBatchRecordPrefill`. */
  prefill: Omit<BatchRecordDoc, 'id' | 'closedAt'>;
  batchCountByDate: Record<string, number>;
  standardBatchSize: number;
  recipeName?: string;
  /** Raw lots on hand, so an input lot is picked from the register rather than retyped. */
  rawLots?: RawLot[];
  onDone: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [bDate, setBDate] = useState(prefill.productionDate);
  const [bPortions, setBPortions] = useState(prefill.goodPortions);
  const [bBatches, setBBatches] = useState(prefill.batchesRun);
  const [bMeals, setBMeals] = useState<number | ''>('');
  const [bComponents, setBComponents] = useState<ComponentExecution[]>(prefill.components);
  const [bHours, setBHours] = useState<number | ''>('');
  const [bRate, setBRate] = useState<number | ''>('');
  const [bCrew, setBCrew] = useState<CrewHoursLine[]>(prefill.crew ?? []);
  const crewTotals = useMemo(() => laborFromCrew(bCrew), [bCrew]);
  const crewRows = bCrew.length > 0;
  const [bClosedBy, setBClosedBy] = useState('');
  const [bNotes, setBNotes] = useState('');

  const bBatchId = useMemo(() => batchIdFor(bDate, (batchCountByDate[bDate] ?? 0) + 1), [bDate, batchCountByDate]);

  /** Standard weights for the portions typed: every stage scaled from the prefill's standard batch. */
  function rescaleToStandard(portions: number) {
    const f = prefill.goodPortions > 0 ? portions / prefill.goodPortions : standardBatchSize > 0 ? portions / standardBatchSize : 1;
    setBComponents(
      prefill.components.map((c) => ({
        ...c,
        consumed: c.consumed.map((l) => ({ ...l, qty: l.qty * f })),
        apIssuedLb: c.apIssuedLb * f,
        cookedLb: c.cookedLb === null ? null : c.cookedLb * f,
        chilledLb: c.chilledLb === null ? null : c.chilledLb * f,
        packedLb: c.packedLb * f,
        ...(c.shrinkAllowanceLb === undefined ? {} : { shrinkAllowanceLb: c.shrinkAllowanceLb * f }),
        // The standard's own scrap — the shrink allowance before the kettle — scales with the issue.
        scrap: c.scrap.map((s) => ({ ...s, lb: s.lb * f })),
      })),
    );
  }

  const bBalance = useMemo(
    () =>
      massBalance({
        batchId: bBatchId,
        recipeCode: prefill.recipeCode,
        productionDate: bDate,
        standardVersion: prefill.standardVersion,
        plannedPortions: bPortions,
        goodPortions: bPortions,
        components: bComponents,
        actualLaborHours: null,
        actualLaborRate: null,
        closedBy: '',
      }),
    [bBatchId, bDate, bPortions, bComponents, prefill.recipeCode, prefill.standardVersion],
  );

  const setComp = (idx: number, fn: (c: ComponentExecution) => ComponentExecution) =>
    setBComponents((cs) => cs.map((c, i) => (i === idx ? fn(c) : c)));
  // One cooling record per cabinet load: patch load `li` of component `idx`, padding the list to it.
  const EMPTY_LOAD: CoolingRecord = { t0F: Number.NaN, t2F: Number.NaN, t6F: Number.NaN, startedAt: '', endedAt: '' };
  const setLoad = (idx: number, li: number, patch: Partial<CoolingRecord>) =>
    setComp(idx, (x) => {
      const loads = coolingLoadsOf(x).slice();
      while (loads.length <= li) loads.push({ ...EMPTY_LOAD });
      loads[li] = { ...loads[li]!, ...patch };
      return { ...x, cooling: loads };
    });

  function submitBatch() {
    start(async () => {
      // A cooling record is complete or absent: three temperatures and both
      // times, or nothing. One per cabinet load the cook filled (the cook is the
      // lot); an incomplete load is a gap on the lot, not data.
      const components = bComponents.map((c) => {
        const loads = coolingLoadsOf(c)
          .slice(0, bBatches)
          .filter((k) => [k.t0F, k.t2F, k.t6F].every((t) => Number.isFinite(t)) && k.startedAt && k.endedAt);
        const rest: ComponentExecution = { ...c };
        delete rest.cooling;
        return loads.length ? { ...rest, cooling: loads } : rest;
      });
      const res = await recordBatch({
        batchId: bBatchId,
        recipeCode: prefill.recipeCode,
        productionDate: bDate,
        standardVersion: prefill.standardVersion,
        plannedPortions: bPortions,
        goodPortions: bPortions,
        batchesRun: bBatches,
        mealsProduced: bMeals === '' ? null : bMeals,
        components,
        crew: bCrew.filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim() })),
        actualLaborHours: crewRows ? crewTotals.hours : bHours === '' ? null : bHours,
        actualLaborRate: crewRows ? crewTotals.rate : bRate === '' ? null : bRate,
        closedBy: bClosedBy,
        notes: bNotes || null,
      });
      if (res.ok) {
        setMsg({ kind: 'ok', text: `Closed batch ${bBatchId}.` });
        router.refresh();
        onDone();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  return (
    <div className="muse-card mb-4!">
      <div className="muse-card-title">Close a batch record — {bBatchId} · {prefill.recipeCode}{recipeName ? ` ${recipeName}` : ''}</div>
      {msg && <div className={`muse-scenariobar-msg ${msg.kind} mb-[0.6rem]!`} role="status">{msg.text}</div>}
      <p className="muse-kpi-sub mb-[0.6rem]!">
        Weights start at the recipe standard for the portions entered; type what actually happened. The issue
        carries the shrink allowance and the allowance is on the record as normal scrap before the kettle; scrap
        with a normal reason beyond the allowance is abnormal. Every pound issued must resolve to packed product,
        a named stage loss, or scrap with a reason. The record does not close until it balances and someone signs it.
      </p>
      <div className="flex flex-wrap gap-3 items-end mb-3!">
        <label className="muse-kpi-sub">Production date<br /><input className="muse-input" type="date" value={bDate} onChange={(e) => setBDate(e.target.value)} /></label>
        <label className="muse-kpi-sub">Good portions (base)<br /><input className="muse-input w-28!" type="number" min={0} value={bPortions} onChange={(e) => { const v = Number(e.target.value); setBPortions(v); rescaleToStandard(v); }} /></label>
        <label className="muse-kpi-sub">Chiller batches run<br /><input className="muse-input w-28!" type="number" min={1} step={1} value={bBatches} onChange={(e) => setBBatches(Number(e.target.value))} /></label>
        <label className="muse-kpi-sub">Meals (blank = one per portion)<br /><input className="muse-input w-28!" type="number" min={0} value={bMeals} onChange={(e) => setBMeals(e.target.value === '' ? '' : Number(e.target.value))} /></label>
        {crewRows ? (
          <>
            <span className="muse-kpi-sub">Labor hours<br /><strong className="muse-c-ink">{crewTotals.hours === null ? '—' : crewTotals.hours.toFixed(2)}</strong> from the crew</span>
            <span className="muse-kpi-sub">Loaded rate $/h<br /><strong className="muse-c-ink">{crewTotals.rate === null ? 'not every line priced' : crewTotals.rate.toFixed(2)}</strong></span>
          </>
        ) : (
          <>
            <label className="muse-kpi-sub">Actual labor hours<br /><input className="muse-input w-28!" type="number" min={0} step={0.25} value={bHours} onChange={(e) => setBHours(e.target.value === '' ? '' : Number(e.target.value))} /></label>
            <label className="muse-kpi-sub">Actual loaded rate $/h<br /><input className="muse-input w-28!" type="number" min={0} step={0.01} value={bRate} onChange={(e) => setBRate(e.target.value === '' ? '' : Number(e.target.value))} /></label>
          </>
        )}
      </div>
      <div className="mb-3!">
        <div className="muse-kpi-sub mb-[0.3rem]!">Crew on the batch — hours by person; the labor totals derive from these rows when any are entered</div>
        {bCrew.map((c, ci) => (
          <div key={ci} className="flex flex-wrap gap-[0.4rem] items-center mb-[0.3rem]!">
            <input className="muse-input w-48!" placeholder="Name or crew" value={c.name} onChange={(e) => setBCrew((cs) => cs.map((x, xi) => (xi === ci ? { ...x, name: e.target.value } : x)))} />
            <input className="muse-num-input" type="number" min={0} step={0.25} placeholder="hours" value={c.hours} onChange={(e) => setBCrew((cs) => cs.map((x, xi) => (xi === ci ? { ...x, hours: Number(e.target.value) } : x)))} />
            <span className="muse-kpi-sub">h ·</span>
            <input className="muse-num-input" type="number" min={0} step={0.01} placeholder="$/h" value={c.ratePerHour ?? ''} onChange={(e) => setBCrew((cs) => cs.map((x, xi) => (xi === ci ? { ...x, ratePerHour: e.target.value === '' ? null : Number(e.target.value) } : x)))} />
            <span className="muse-kpi-sub">$/h loaded</span>
            <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setBCrew((cs) => cs.filter((_, xi) => xi !== ci))}>×</button>
          </div>
        ))}
        <button type="button" className="muse-btn py-[0.1rem]! px-[0.45rem]! muse-fs-2xs" onClick={() => setBCrew((cs) => [...cs, { name: '', hours: 0, ratePerHour: null }])}>+ person</button>
      </div>
      <div className="muse-scroll-x">
        <table className="muse-table">
          <thead>
            <tr><th>Component</th><th className="num">Issued lb</th><th className="num">Cooked lb</th><th className="num">Chilled lb</th><th className="num">Packed lb</th><th>Scrap</th><th>Input lots</th><th>CCP-1 / CCP-2</th><th className="num">Residual</th></tr>
          </thead>
          <tbody>
            {bComponents.map((c, i) => {
              const bal = bBalance.components[i];
              return (
                <tr key={c.component}>
                  <td>{c.component}<div className="muse-c-faint muse-fs-2xs">{c.outputLotCode}</div></td>
                  <td className="num"><input className="muse-num-input" type="number" min={0} step={0.1} value={Number(c.apIssuedLb.toFixed(2))} onChange={(e) => setComp(i, (x) => ({ ...x, apIssuedLb: Number(e.target.value) }))} /></td>
                  <td className="num">{c.cookedLb === null ? '—' : <input className="muse-num-input" type="number" min={0} step={0.1} value={Number(c.cookedLb.toFixed(2))} onChange={(e) => setComp(i, (x) => ({ ...x, cookedLb: Number(e.target.value) }))} />}</td>
                  <td className="num">{c.chilledLb === null ? '—' : <input className="muse-num-input" type="number" min={0} step={0.1} value={Number(c.chilledLb.toFixed(2))} onChange={(e) => setComp(i, (x) => ({ ...x, chilledLb: Number(e.target.value) }))} />}</td>
                  <td className="num"><input className="muse-num-input" type="number" min={0} step={0.1} value={Number(c.packedLb.toFixed(2))} onChange={(e) => setComp(i, (x) => ({ ...x, packedLb: Number(e.target.value) }))} /></td>
                  <td>
                    {c.scrap.map((s, si) => (
                      <div key={si} className="flex gap-[0.3rem] items-center mb-[0.2rem]!">
                        <select className="muse-select" value={s.reason} onChange={(e) => setComp(i, (x) => ({ ...x, scrap: x.scrap.map((y, yi) => (yi === si ? { ...y, reason: e.target.value as ScrapReason } : y)) }))}>
                          {SCRAP_REASONS.map((r) => <option key={r} value={r}>{r}{ABNORMAL_SCRAP_REASONS.has(r) ? ' (abnormal)' : ''}</option>)}
                        </select>
                        <input className="muse-num-input" type="number" min={0} step={0.1} value={s.lb} onChange={(e) => setComp(i, (x) => ({ ...x, scrap: x.scrap.map((y, yi) => (yi === si ? { ...y, lb: Number(e.target.value) } : y)) }))} />
                        <select className="muse-select" value={s.stage} onChange={(e) => setComp(i, (x) => ({ ...x, scrap: x.scrap.map((y, yi) => (yi === si ? { ...y, stage: e.target.value as ScrapStage } : y)) }))}>
                          {SCRAP_STAGES.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                        <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setComp(i, (x) => ({ ...x, scrap: x.scrap.filter((_, yi) => yi !== si) }))}>×</button>
                      </div>
                    ))}
                    <button type="button" className="muse-btn py-[0.1rem]! px-[0.45rem]! muse-fs-2xs" onClick={() => setComp(i, (x) => ({ ...x, scrap: [...x.scrap, { reason: 'TRIM', lb: 0, stage: 'COOK', note: '' }] }))}>+ scrap</button>
                    {bal && bal.allowanceLb !== null && (
                      <div className="muse-fs-2xs muse-c-faint mt-[0.2rem]!">
                        Allowance {bal.allowanceLb.toFixed(2)} lb · normal {bal.normalScrapLb.toFixed(2)} · abnormal {bal.abnormalScrapLb.toFixed(2)}
                      </div>
                    )}
                  </td>
                  <td>
                    {c.consumed.map((l, li) => (
                      <div key={l.ingredient} className="flex gap-[0.3rem] items-center mb-[0.2rem]!">
                        <span className="muse-fs-xs muse-c-soft min-w-32">{l.ingredient}</span>
                        <input className="muse-input w-40!" list={`lots-${i}-${li}`} value={l.inputLotCode} onChange={(e) => setComp(i, (x) => ({ ...x, consumed: x.consumed.map((y, yi) => (yi === li ? { ...y, inputLotCode: e.target.value } : y)) }))} />
                        <datalist id={`lots-${i}-${li}`}>
                          {rawLots.filter((r) => r.ingredient === l.ingredient && r.remaining > 0).map((r) => (
                            <option key={r.lotCode} value={r.lotCode}>{`${r.remaining.toFixed(1)} ${r.unit} on hand · received ${r.receivedOn}${r.useBy ? ` · use by ${r.useBy}` : ''}`}</option>
                          ))}
                        </datalist>
                        {l.onFoodTraceabilityList && <span className="muse-fs-2xs muse-c-faint">FTL</span>}
                      </div>
                    ))}
                  </td>
                  <td>
                    {c.cookedLb === null ? (
                      <span className="muse-fs-xs muse-c-faint">cold-packed — no CCP</span>
                    ) : (
                      <div className="grid gap-1 muse-fs-xs">
                        <label className="muse-kpi-sub flex! gap-[0.3rem]! items-center!">
                          <span className="min-w-22">Cook end °F</span>
                          <input className="muse-num-input" type="number" step={1} value={c.cookEndTempF ?? ''} onChange={(e) => setComp(i, (x) => ({ ...x, cookEndTempF: e.target.value === '' ? null : Number(e.target.value) }))} />
                          {c.cookEndTempF === null || c.cookEndTempF === undefined ? <span className="muse-c-faint">not recorded</span> : <CheckPill ok={c.cookEndTempF >= CCP1_MIN_F} okLabel={`≥ ${CCP1_MIN_F}°F`} overLabel={`below ${CCP1_MIN_F}°F`} />}
                        </label>
                        {Array.from({ length: Math.max(1, bBatches) }, (_, li) => {
                          const k = coolingLoadsOf(c)[li];
                          const label = bBatches > 1 ? `Load ${li + 1} of ${bBatches}` : 'Chill';
                          return (
                            <div key={li} className="grid gap-1">
                              <label className="muse-kpi-sub flex! gap-[0.3rem]! items-center!">
                                <span className="min-w-22">{label} 0 / 2 / 6 h °F</span>
                                {(['t0F', 't2F', 't6F'] as const).map((f) => (
                                  <input key={f} className="muse-num-input w-[3.6rem]!" type="number" step={1} value={k && Number.isFinite(k[f]) ? k[f] : ''} onChange={(e) => setLoad(i, li, { [f]: e.target.value === '' ? Number.NaN : Number(e.target.value) })} />
                                ))}
                                {k && Number.isFinite(k.t2F) && Number.isFinite(k.t6F) ? (
                                  <CheckPill ok={k.t2F <= CCP2_LIMITS.twoHourMaxF && k.t6F <= CCP2_LIMITS.sixHourMaxF} okLabel="within limits" overLabel="limit exceeded" />
                                ) : (
                                  <span className="muse-c-faint">not recorded</span>
                                )}
                              </label>
                              <label className="muse-kpi-sub flex! gap-[0.3rem]! items-center!">
                                <span className="min-w-22">{bBatches > 1 ? `Load ${li + 1} start / end` : 'Chill start / end'}</span>
                                <input className="muse-input w-26!" type="time" value={k?.startedAt ?? ''} onChange={(e) => setLoad(i, li, { startedAt: e.target.value })} />
                                <input className="muse-input w-26!" type="time" value={k?.endedAt ?? ''} onChange={(e) => setLoad(i, li, { endedAt: e.target.value })} />
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="num">{bal ? <CheckPill ok={bal.balanced} okLabel="0.0 lb" overLabel={`${bal.residualLb.toFixed(2)} lb`} /> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-3 items-end mt-3!">
        <label className="muse-kpi-sub">Closed by (signature)<br /><input className="muse-input w-48!" value={bClosedBy} onChange={(e) => setBClosedBy(e.target.value)} /></label>
        <label className="muse-kpi-sub flex-1!">Notes<br /><input className="muse-input w-full!" value={bNotes} onChange={(e) => setBNotes(e.target.value)} /></label>
        <CheckPill ok={bBalance.balanced} okLabel="Mass balance reconciled" overLabel="Does not balance" />
        <span className="muse-kpi-sub">Scrap {bBalance.totalScrapLb.toFixed(1)} lb: normal {bBalance.normalScrapLb.toFixed(1)}, abnormal {bBalance.abnormalScrapLb.toFixed(1)}</span>
        <button type="button" className="muse-btn primary" onClick={submitBatch} disabled={pending || !bBalance.balanced || !bClosedBy.trim()}>Close batch</button>
        {onCancel && <button type="button" className="muse-btn" onClick={onCancel} disabled={pending}>Cancel</button>}
      </div>
    </div>
  );
}
