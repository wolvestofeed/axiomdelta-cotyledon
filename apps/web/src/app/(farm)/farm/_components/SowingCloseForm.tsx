'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckPill } from './ui';
import { recordSowing } from '../_lib/actuals-actions';
import { sowingIdFor, type SowingRecordDoc, laborFromCrew, type CrewHoursLine } from '../_engine/actuals';
import { massBalance, ABNORMAL_SCRAP_REASONS, SCRAP_STAGES, type ComponentExecution, type ScrapReason, type ScrapStage, stageLoadsOf, type StageRecord } from '../_engine/sowing';
import { CCP2_LIMITS } from '../_engine/produce-safety';
import type { RawLot } from '../_engine/net-requirements';

/**
 * Close a sowing record — the production performance object the ledger posts
 * from. Weights start at the crop plan standard for the units entered; the
 * operator types what actually happened. The record does not close until it
 * mass-balances and someone signs it (docs/farm/CLAUDE.md §2 rule 9).
 *
 * Lives on Production Planning (the distribution-day view) since Roadmap H4 and on
 * the floor surface since Roadmap I3; the Actuals page lists the closed records.
 *
 * Phase I3 added the control-point-1 end-of-sow temperature and the control-point-2 cooling
 * record per hot component, and input-lot pickers drawn from the lots on hand
 * (a code can still be typed when the case is not in the register). A missing
 * temperature is recorded as a gap, never as a pass.
 */

/** control-point-1 minimum internal sow temperature, °F — the HACCP plan's limit for the ground-beef step. */
const CCP1_MIN_F = 155;

const SCRAP_REASONS: ScrapReason[] = [
  'TRIM', 'SOW_LOSS', 'UNIT_OVERAGE', 'BLACKOUT_FAILURE', 'TEMPERATURE_EXCURSION',
  'EQUIPMENT_FAILURE', 'CONTAMINATION', 'DROPPED_OR_DAMAGED', 'RECALL_OR_WITHDRAWAL', 'EXPIRED_SHELF_LIFE',
];

export function SowingCloseForm({
  prefill,
  sowingCountByDate,
  standardSowingSize,
  cropPlanName,
  rawLots = [],
  onDone,
  onCancel,
}: {
  /** The standard sowing for the crop plan and units, from `standardSowingRecordPrefill`. */
  prefill: Omit<SowingRecordDoc, 'id' | 'closedAt'>;
  sowingCountByDate: Record<string, number>;
  standardSowingSize: number;
  cropPlanName?: string;
  /** Raw lots on hand, so an input lot is picked from the register rather than retyped. */
  rawLots?: RawLot[];
  onDone: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [bDate, setBDate] = useState(prefill.productionDate);
  const [bUnits, setBPortions] = useState(prefill.goodUnits);
  const [bSowings, setBBatches] = useState(prefill.sowingsRun);
  const [bServings, setBMeals] = useState<number | ''>('');
  const [bComponents, setBComponents] = useState<ComponentExecution[]>(prefill.components);
  const [bHours, setBHours] = useState<number | ''>('');
  const [bRate, setBRate] = useState<number | ''>('');
  const [bCrew, setBCrew] = useState<CrewHoursLine[]>(prefill.crew ?? []);
  const crewTotals = useMemo(() => laborFromCrew(bCrew), [bCrew]);
  const crewRows = bCrew.length > 0;
  const [bClosedBy, setBClosedBy] = useState('');
  const [bNotes, setBNotes] = useState('');

  const bSowingId = useMemo(() => sowingIdFor(bDate, (sowingCountByDate[bDate] ?? 0) + 1), [bDate, sowingCountByDate]);

  /** Standard weights for the units typed: every stage scaled from the prefill's standard sowing. */
  function rescaleToStandard(units: number) {
    const f = prefill.goodUnits > 0 ? units / prefill.goodUnits : standardSowingSize > 0 ? units / standardSowingSize : 1;
    setBComponents(
      prefill.components.map((c) => ({
        ...c,
        consumed: c.consumed.map((l) => ({ ...l, qty: l.qty * f })),
        seedIssuedLb: c.seedIssuedLb * f,
        harvestedLb: c.harvestedLb === null ? null : c.harvestedLb * f,
        blackoutLb: c.blackoutLb === null ? null : c.blackoutLb * f,
        packedLb: c.packedLb * f,
        ...(c.shrinkAllowanceLb === undefined ? {} : { shrinkAllowanceLb: c.shrinkAllowanceLb * f }),
        // The standard's own scrap — the shrink allowance before the sprouting rack — scales with the issue.
        scrap: c.scrap.map((s) => ({ ...s, lb: s.lb * f })),
      })),
    );
  }

  const bBalance = useMemo(
    () =>
      massBalance({
        sowingId: bSowingId,
        cropPlanCode: prefill.cropPlanCode,
        productionDate: bDate,
        standardVersion: prefill.standardVersion,
        plannedUnits: bUnits,
        goodUnits: bUnits,
        components: bComponents,
        actualLaborHours: null,
        actualLaborRate: null,
        closedBy: '',
      }),
    [bSowingId, bDate, bUnits, bComponents, prefill.cropPlanCode, prefill.standardVersion],
  );

  const setComp = (idx: number, fn: (c: ComponentExecution) => ComponentExecution) =>
    setBComponents((cs) => cs.map((c, i) => (i === idx ? fn(c) : c)));
  // One stage record per rack load: patch load `li` of component `idx`, padding the list to it.
  const EMPTY_LOAD: StageRecord = { t0F: Number.NaN, t2F: Number.NaN, t6F: Number.NaN, startedAt: '', endedAt: '' };
  const setLoad = (idx: number, li: number, patch: Partial<StageRecord>) =>
    setComp(idx, (x) => {
      const loads = stageLoadsOf(x).slice();
      while (loads.length <= li) loads.push({ ...EMPTY_LOAD });
      loads[li] = { ...loads[li]!, ...patch };
      return { ...x, cooling: loads };
    });

  function submitSowing() {
    start(async () => {
      // A stage record is complete or absent: three temperatures and both
      // times, or nothing. One per rack load the sow filled (the sow is the
      // lot); an incomplete load is a gap on the lot, not data.
      const components = bComponents.map((c) => {
        const loads = stageLoadsOf(c)
          .slice(0, bSowings)
          .filter((k) => [k.t0F, k.t2F, k.t6F].every((t) => Number.isFinite(t)) && k.startedAt && k.endedAt);
        const rest: ComponentExecution = { ...c };
        delete rest.cooling;
        return loads.length ? { ...rest, cooling: loads } : rest;
      });
      const res = await recordSowing({
        sowingId: bSowingId,
        cropPlanCode: prefill.cropPlanCode,
        productionDate: bDate,
        standardVersion: prefill.standardVersion,
        plannedUnits: bUnits,
        goodUnits: bUnits,
        sowingsRun: bSowings,
        servingsProduced: bServings === '' ? null : bServings,
        components,
        crew: bCrew.filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim() })),
        actualLaborHours: crewRows ? crewTotals.hours : bHours === '' ? null : bHours,
        actualLaborRate: crewRows ? crewTotals.rate : bRate === '' ? null : bRate,
        closedBy: bClosedBy,
        notes: bNotes || null,
      });
      if (res.ok) {
        setMsg({ kind: 'ok', text: `Closed sowing ${bSowingId}.` });
        router.refresh();
        onDone();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  return (
    <div className="farm-card mb-4!">
      <div className="farm-card-title">Close a sowing record — {bSowingId} · {prefill.cropPlanCode}{cropPlanName ? ` ${cropPlanName}` : ''}</div>
      {msg && <div className={`farm-scenariobar-msg ${msg.kind} mb-[0.6rem]!`} role="status">{msg.text}</div>}
      <p className="farm-kpi-sub mb-[0.6rem]!">
        Weights start at the cropPlan standard for the units entered; type what actually happened. The issue
        carries the shrink allowance and the allowance is on the record as normal scrap before the sproutingRack; scrap
        with a normal reason beyond the allowance is abnormal. Every pound issued must resolve to packed product,
        a named stage loss, or scrap with a reason. The record does not close until it balances and someone signs it.
      </p>
      <div className="flex flex-wrap gap-3 items-end mb-3!">
        <label className="farm-kpi-sub">Production date<br /><input className="farm-input" type="date" value={bDate} onChange={(e) => setBDate(e.target.value)} /></label>
        <label className="farm-kpi-sub">Good units (base)<br /><input className="farm-input w-28!" type="number" min={0} value={bUnits} onChange={(e) => { const v = Number(e.target.value); setBPortions(v); rescaleToStandard(v); }} /></label>
        <label className="farm-kpi-sub">Blackout rack sowings run<br /><input className="farm-input w-28!" type="number" min={1} step={1} value={bSowings} onChange={(e) => setBBatches(Number(e.target.value))} /></label>
        <label className="farm-kpi-sub">Units (blank = one per unit)<br /><input className="farm-input w-28!" type="number" min={0} value={bServings} onChange={(e) => setBMeals(e.target.value === '' ? '' : Number(e.target.value))} /></label>
        {crewRows ? (
          <>
            <span className="farm-kpi-sub">Labor hours<br /><strong className="farm-c-ink">{crewTotals.hours === null ? '—' : crewTotals.hours.toFixed(2)}</strong> from the crew</span>
            <span className="farm-kpi-sub">Loaded rate $/h<br /><strong className="farm-c-ink">{crewTotals.rate === null ? 'not every line priced' : crewTotals.rate.toFixed(2)}</strong></span>
          </>
        ) : (
          <>
            <label className="farm-kpi-sub">Actual labor hours<br /><input className="farm-input w-28!" type="number" min={0} step={0.25} value={bHours} onChange={(e) => setBHours(e.target.value === '' ? '' : Number(e.target.value))} /></label>
            <label className="farm-kpi-sub">Actual loaded rate $/h<br /><input className="farm-input w-28!" type="number" min={0} step={0.01} value={bRate} onChange={(e) => setBRate(e.target.value === '' ? '' : Number(e.target.value))} /></label>
          </>
        )}
      </div>
      <div className="mb-3!">
        <div className="farm-kpi-sub mb-[0.3rem]!">Crew on the sowing — hours by person; the labor totals derive from these rows when any are entered</div>
        {bCrew.map((c, ci) => (
          <div key={ci} className="flex flex-wrap gap-[0.4rem] items-center mb-[0.3rem]!">
            <input className="farm-input w-48!" placeholder="Name or crew" value={c.name} onChange={(e) => setBCrew((cs) => cs.map((x, xi) => (xi === ci ? { ...x, name: e.target.value } : x)))} />
            <input className="farm-num-input" type="number" min={0} step={0.25} placeholder="hours" value={c.hours} onChange={(e) => setBCrew((cs) => cs.map((x, xi) => (xi === ci ? { ...x, hours: Number(e.target.value) } : x)))} />
            <span className="farm-kpi-sub">h ·</span>
            <input className="farm-num-input" type="number" min={0} step={0.01} placeholder="$/h" value={c.ratePerHour ?? ''} onChange={(e) => setBCrew((cs) => cs.map((x, xi) => (xi === ci ? { ...x, ratePerHour: e.target.value === '' ? null : Number(e.target.value) } : x)))} />
            <span className="farm-kpi-sub">$/h loaded</span>
            <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setBCrew((cs) => cs.filter((_, xi) => xi !== ci))}>×</button>
          </div>
        ))}
        <button type="button" className="farm-btn py-[0.1rem]! px-[0.45rem]! farm-fs-2xs" onClick={() => setBCrew((cs) => [...cs, { name: '', hours: 0, ratePerHour: null }])}>+ person</button>
      </div>
      <div className="farm-scroll-x">
        <table className="farm-table">
          <thead>
            <tr><th>Component</th><th className="num">Issued lb</th><th className="num">Harvested lb</th><th className="num">Blackout lb</th><th className="num">Packed lb</th><th>Scrap</th><th>Input lots</th><th>control-point-1 / control-point-2</th><th className="num">Residual</th></tr>
          </thead>
          <tbody>
            {bComponents.map((c, i) => {
              const bal = bBalance.components[i];
              return (
                <tr key={c.component}>
                  <td>{c.component}<div className="farm-c-faint farm-fs-2xs">{c.outputLotCode}</div></td>
                  <td className="num"><input className="farm-num-input" type="number" min={0} step={0.1} value={Number(c.seedIssuedLb.toFixed(2))} onChange={(e) => setComp(i, (x) => ({ ...x, seedIssuedLb: Number(e.target.value) }))} /></td>
                  <td className="num">{c.harvestedLb === null ? '—' : <input className="farm-num-input" type="number" min={0} step={0.1} value={Number(c.harvestedLb.toFixed(2))} onChange={(e) => setComp(i, (x) => ({ ...x, harvestedLb: Number(e.target.value) }))} />}</td>
                  <td className="num">{c.blackoutLb === null ? '—' : <input className="farm-num-input" type="number" min={0} step={0.1} value={Number(c.blackoutLb.toFixed(2))} onChange={(e) => setComp(i, (x) => ({ ...x, blackoutLb: Number(e.target.value) }))} />}</td>
                  <td className="num"><input className="farm-num-input" type="number" min={0} step={0.1} value={Number(c.packedLb.toFixed(2))} onChange={(e) => setComp(i, (x) => ({ ...x, packedLb: Number(e.target.value) }))} /></td>
                  <td>
                    {c.scrap.map((s, si) => (
                      <div key={si} className="flex gap-[0.3rem] items-center mb-[0.2rem]!">
                        <select className="farm-select" value={s.reason} onChange={(e) => setComp(i, (x) => ({ ...x, scrap: x.scrap.map((y, yi) => (yi === si ? { ...y, reason: e.target.value as ScrapReason } : y)) }))}>
                          {SCRAP_REASONS.map((r) => <option key={r} value={r}>{r}{ABNORMAL_SCRAP_REASONS.has(r) ? ' (abnormal)' : ''}</option>)}
                        </select>
                        <input className="farm-num-input" type="number" min={0} step={0.1} value={s.lb} onChange={(e) => setComp(i, (x) => ({ ...x, scrap: x.scrap.map((y, yi) => (yi === si ? { ...y, lb: Number(e.target.value) } : y)) }))} />
                        <select className="farm-select" value={s.stage} onChange={(e) => setComp(i, (x) => ({ ...x, scrap: x.scrap.map((y, yi) => (yi === si ? { ...y, stage: e.target.value as ScrapStage } : y)) }))}>
                          {SCRAP_STAGES.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                        <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setComp(i, (x) => ({ ...x, scrap: x.scrap.filter((_, yi) => yi !== si) }))}>×</button>
                      </div>
                    ))}
                    <button type="button" className="farm-btn py-[0.1rem]! px-[0.45rem]! farm-fs-2xs" onClick={() => setComp(i, (x) => ({ ...x, scrap: [...x.scrap, { reason: 'TRIM', lb: 0, stage: 'SOW', note: '' }] }))}>+ scrap</button>
                    {bal && bal.allowanceLb !== null && (
                      <div className="farm-fs-2xs farm-c-faint mt-[0.2rem]!">
                        Allowance {bal.allowanceLb.toFixed(2)} lb · normal {bal.normalScrapLb.toFixed(2)} · abnormal {bal.abnormalScrapLb.toFixed(2)}
                      </div>
                    )}
                  </td>
                  <td>
                    {c.consumed.map((l, li) => (
                      <div key={l.input} className="flex gap-[0.3rem] items-center mb-[0.2rem]!">
                        <span className="farm-fs-xs farm-c-soft min-w-32">{l.input}</span>
                        <input className="farm-input w-40!" list={`lots-${i}-${li}`} value={l.inputLotCode} onChange={(e) => setComp(i, (x) => ({ ...x, consumed: x.consumed.map((y, yi) => (yi === li ? { ...y, inputLotCode: e.target.value } : y)) }))} />
                        <datalist id={`lots-${i}-${li}`}>
                          {rawLots.filter((r) => r.input === l.input && r.remaining > 0).map((r) => (
                            <option key={r.lotCode} value={r.lotCode}>{`${r.remaining.toFixed(1)} ${r.unit} on hand · received ${r.receivedOn}${r.useBy ? ` · use by ${r.useBy}` : ''}`}</option>
                          ))}
                        </datalist>
                        {l.onFoodTraceabilityList && <span className="farm-fs-2xs farm-c-faint">FTL</span>}
                      </div>
                    ))}
                  </td>
                  <td>
                    {c.harvestedLb === null ? (
                      <span className="farm-fs-xs farm-c-faint">cold-packed — no CONTROL POINT</span>
                    ) : (
                      <div className="grid gap-1 farm-fs-xs">
                        <label className="farm-kpi-sub flex! gap-[0.3rem]! items-center!">
                          <span className="min-w-22">Sow end °F</span>
                          <input className="farm-num-input" type="number" step={1} value={c.sowEndTempF ?? ''} onChange={(e) => setComp(i, (x) => ({ ...x, sowEndTempF: e.target.value === '' ? null : Number(e.target.value) }))} />
                          {c.sowEndTempF === null || c.sowEndTempF === undefined ? <span className="farm-c-faint">not recorded</span> : <CheckPill ok={c.sowEndTempF >= CCP1_MIN_F} okLabel={`≥ ${CCP1_MIN_F}°F`} overLabel={`below ${CCP1_MIN_F}°F`} />}
                        </label>
                        {Array.from({ length: Math.max(1, bSowings) }, (_, li) => {
                          const k = stageLoadsOf(c)[li];
                          const label = bSowings > 1 ? `Load ${li + 1} of ${bSowings}` : 'Blackout';
                          return (
                            <div key={li} className="grid gap-1">
                              <label className="farm-kpi-sub flex! gap-[0.3rem]! items-center!">
                                <span className="min-w-22">{label} 0 / 2 / 6 h °F</span>
                                {(['t0F', 't2F', 't6F'] as const).map((f) => (
                                  <input key={f} className="farm-num-input w-[3.6rem]!" type="number" step={1} value={k && Number.isFinite(k[f]) ? k[f] : ''} onChange={(e) => setLoad(i, li, { [f]: e.target.value === '' ? Number.NaN : Number(e.target.value) })} />
                                ))}
                                {k && Number.isFinite(k.t2F) && Number.isFinite(k.t6F) ? (
                                  <CheckPill ok={k.t2F <= CCP2_LIMITS.twoHourMaxF && k.t6F <= CCP2_LIMITS.sixHourMaxF} okLabel="within limits" overLabel="limit exceeded" />
                                ) : (
                                  <span className="farm-c-faint">not recorded</span>
                                )}
                              </label>
                              <label className="farm-kpi-sub flex! gap-[0.3rem]! items-center!">
                                <span className="min-w-22">{bSowings > 1 ? `Load ${li + 1} start / end` : 'Blackout start / end'}</span>
                                <input className="farm-input w-26!" type="time" value={k?.startedAt ?? ''} onChange={(e) => setLoad(i, li, { startedAt: e.target.value })} />
                                <input className="farm-input w-26!" type="time" value={k?.endedAt ?? ''} onChange={(e) => setLoad(i, li, { endedAt: e.target.value })} />
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
        <label className="farm-kpi-sub">Closed by (signature)<br /><input className="farm-input w-48!" value={bClosedBy} onChange={(e) => setBClosedBy(e.target.value)} /></label>
        <label className="farm-kpi-sub flex-1!">Notes<br /><input className="farm-input w-full!" value={bNotes} onChange={(e) => setBNotes(e.target.value)} /></label>
        <CheckPill ok={bBalance.balanced} okLabel="Mass balance reconciled" overLabel="Does not balance" />
        <span className="farm-kpi-sub">Scrap {bBalance.totalScrapLb.toFixed(1)} lb: normal {bBalance.normalScrapLb.toFixed(1)}, abnormal {bBalance.abnormalScrapLb.toFixed(1)}</span>
        <button type="button" className="farm-btn primary" onClick={submitSowing} disabled={pending || !bBalance.balanced || !bClosedBy.trim()}>Close sowing</button>
        {onCancel && <button type="button" className="farm-btn" onClick={onCancel} disabled={pending}>Cancel</button>}
      </div>
    </div>
  );
}
