'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckPill, StatusBadge, num } from '@/components/ui';
import { recordSowing } from '@/server/actuals-actions';
import { sowingIdFor, laborFromCrew, type SowingRecordDoc, type CrewHoursLine } from '@/engine/actuals';
import { massBalance, type SowingIssue, type VarietyLot } from '@/engine/sowing';
import { sowingRecordChecks, type GrowSowingFields, type StageRecords, type GrowRoomReading } from '@/engine/sowing-record';
import { TRAY_FORMAT_BY_KEY } from '@/data/tray-formats';
import { STAGE_BY_KEY } from '@/data/stage-schedule';
import type { GrowPlanDef } from '@/data/grow-plan';
import type { GrowUnit } from '@/engine/grow-capacity';

/**
 * Close a sowing on the grow model (outline §4 Sowing): trays sown and the unit they sat on, one
 * lot per variety with the seed issued and the harvest weight, the stage records the control
 * points ask for, the harvest check, the crew's hours and a signature. The record does not close
 * until it mass-balances; a control point not recorded is a gap on the record, never a pass.
 * Weights start at the plan's standard for the trays entered; the operator types what differed.
 */

type Prefill = Omit<SowingRecordDoc, 'id' | 'closedAt'> & GrowSowingFields;

interface VarietyLine {
  variety: string;
  outputLotCode: string;
  seedLot: string;
  /** Seed issued for the sowing, grams, allowance included. */
  seedGrams: number;
  /** Harvest weight for the whole sowing, grams. */
  harvestGrams: number;
}

export function GrowSowingCloseForm({
  prefill,
  plan,
  sowingCountByDate,
  growUnits,
  planName,
  onDone,
  onCancel,
}: {
  prefill: Prefill;
  plan: GrowPlanDef;
  sowingCountByDate: Record<string, number>;
  growUnits: readonly GrowUnit[];
  planName?: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const format = TRAY_FORMAT_BY_KEY[prefill.format];
  const sprout = format.kind === 'sprout';
  const unitWord = sprout ? 'jars' : 'trays';

  const [sowDate, setSowDate] = useState(prefill.productionDate);
  const [packedOn, setPackedOn] = useState(prefill.packedOn ?? '');
  const [traysSown, setTraysSown] = useState(prefill.traysSown);
  const [growUnitKey, setGrowUnitKey] = useState(prefill.growUnitKey ?? growUnits[0]?.key ?? '');
  const [lines, setLines] = useState<VarietyLine[]>(
    prefill.lots.map((l) => ({ variety: l.variety, outputLotCode: l.outputLotCode, seedLot: '', seedGrams: l.seedIssuedG, harvestGrams: l.harvestedG })),
  );
  const [issueLots, setIssueLots] = useState<string[]>(prefill.issues.map(() => ''));
  const [records, setRecords] = useState<StageRecords>(prefill.stageRecords);
  const [removed, setRemoved] = useState(0);
  const [removedNote, setRemovedNote] = useState('');
  const [crew, setCrew] = useState<CrewHoursLine[]>(prefill.crew ?? []);
  const [closedBy, setClosedBy] = useState('');
  const [notes, setNotes] = useState('');
  const sowingId = useMemo(() => sowingIdFor(sowDate, (sowingCountByDate[sowDate] ?? 0) + 1), [sowDate, sowingCountByDate]);
  const traysPacked = Math.max(0, traysSown - removed);
  const crewTotals = useMemo(() => laborFromCrew(crew), [crew]);

  /** Rescale every weight and issue to the trays typed: the standard per tray times the trays. */
  const scale = prefill.traysSown > 0 ? traysSown / prefill.traysSown : 1;
  function rescale(trays: number) {
    const f = prefill.traysSown > 0 ? trays / prefill.traysSown : 1;
    setTraysSown(trays);
    setLines((ls) => ls.map((l, i) => ({ ...l, seedGrams: prefill.lots[i]!.seedIssuedG * f, harvestGrams: prefill.lots[i]!.harvestedG * f })));
  }

  /** The lots the ledger reads: seed issued, harvested, packed less the trays removed at the check. */
  const lots = useMemo((): VarietyLot[] => {
    const share = traysSown > 0 ? removed / traysSown : 0;
    return prefill.lots.map((lot, i) => {
      const l = lines[i]!;
      const removedG = l.harvestGrams * share;
      const sown = lot.scrap.filter((x) => x.stage === 'SOW').map((x) => ({ ...x, g: Math.min(x.g, l.seedGrams) }));
      const scrap = [...sown, ...(removedG > 0 ? [{ reason: 'CONTAMINATION' as const, g: removedG, stage: 'PACK' as const, note: removedNote || `${num(removed)} ${unitWord} removed at the harvest check` }] : [])];
      return {
        ...lot,
        seedLotCode: l.seedLot.trim() || 'not recorded',
        seedIssuedG: l.seedGrams,
        shrinkAllowanceG: Math.min(lot.shrinkAllowanceG * scale, l.seedGrams),
        harvestedG: l.harvestGrams,
        packedG: Math.max(0, l.harvestGrams - removedG),
        scrap,
      };
    });
  }, [prefill.lots, lines, traysSown, removed, removedNote, unitWord, scale]);
  const issues = useMemo((): SowingIssue[] => prefill.issues.map((x, i) => ({ ...x, qty: x.qty * scale, lotCode: issueLots[i]?.trim() || 'not recorded' })), [prefill.issues, issueLots, scale]);

  const balance = useMemo(() => massBalance({ sowingId, lots }), [sowingId, lots]);
  const stageRecords = useMemo((): StageRecords => ({ ...records, harvestCheck: { traysPassed: traysPacked, traysRemoved: removed, note: removedNote } }), [records, traysPacked, removed, removedNote]);
  const checks = useMemo(() => sowingRecordChecks(stageRecords, plan), [stageRecords, plan]);

  const setLine = (i: number, patch: Partial<VarietyLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const setReading = (i: number, patch: Partial<GrowRoomReading>) => setRecords((r) => ({ ...r, readings: r.readings.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const addReading = () => setRecords((r) => ({ ...r, readings: [...r.readings, { at: new Date().toISOString().slice(0, 16), tempF: null, rhPct: null, by: '' }] }));
  const setCrewLine = (i: number, patch: Partial<CrewHoursLine>) => setCrew((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  function submit() {
    start(async () => {
      const res = await recordSowing({
        sowingId,
        cropPlanCode: prefill.cropPlanCode,
        productionDate: sowDate,
        standardVersion: prefill.standardVersion,
        plannedUnits: prefill.traysSown,
        goodUnits: traysPacked,
        sowingsRun: 1,
        servingsProduced: null,
        lots,
        issues,
        crew,
        actualLaborHours: crew.length > 0 ? crewTotals.hours : null,
        actualLaborRate: crew.length > 0 ? crewTotals.rate : null,
        closedBy,
        notes: notes || null,
        format: prefill.format,
        traysSown,
        traysPacked,
        growUnitKey: growUnitKey || null,
        packedOn: packedOn || null,
        stageRecords,
      });
      if (res.ok) {
        setMsg({ kind: 'ok', text: `Closed ${sowingId}: ${num(traysPacked)} ${unitWord} packed.` });
        router.refresh();
        onDone();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  const nf = (v: string): number | null => (v.trim() === '' ? null : Number(v));

  return (
    <div className="farm-card">
      <div className="farm-card-title">Close {sowingId}{planName ? ` — ${planName}` : ''} · one lot per variety, the stage records, the harvest check</div>
      {msg && <div className={`farm-scenariobar-msg ${msg.kind} mb-[0.6rem]!`} role="status">{msg.text}</div>}

      <div className="flex flex-wrap gap-3 items-end mb-3!">
        <label className="farm-kpi-sub">Sow date<br /><input type="date" className="farm-input" value={sowDate} onChange={(e) => setSowDate(e.target.value)} /></label>
        <label className="farm-kpi-sub">{sprout ? 'Jars' : 'Trays'} sown<br /><input type="number" min={0} step={1} className="farm-input w-24!" value={traysSown} onChange={(e) => rescale(Math.max(0, Number(e.target.value)))} /></label>
        <label className="farm-kpi-sub">Grow unit<br />
          <select className="farm-select" value={growUnitKey} onChange={(e) => setGrowUnitKey(e.target.value)}>
            <option value="">Not recorded</option>
            {growUnits.map((u) => <option key={u.key} value={u.key}>{u.item}</option>)}
          </select>
        </label>
        <label className="farm-kpi-sub">Packed on<br /><input type="date" className="farm-input" value={packedOn} onChange={(e) => setPackedOn(e.target.value)} /></label>
        <span className="farm-kpi-sub">{format.name} · {prefill.standardVersion}</span>
      </div>

      <div className="farm-scroll-x">
        <table className="farm-table compact">
          <thead><tr><th>Variety (lot)</th><th>Seed lot received</th><th className="num">Seed issued, g</th><th className="num">Harvest, g</th><th className="num">Packed, g</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.variety}>
                <td>{l.variety}<div className="farm-mono farm-fs-2xs farm-c-faint">{l.outputLotCode}</div></td>
                <td><input className="farm-input w-40!" placeholder="not recorded" value={l.seedLot} onChange={(e) => setLine(i, { seedLot: e.target.value })} /></td>
                <td className="num"><input type="number" min={0} step={1} className="farm-num-input" value={Math.round(l.seedGrams)} onChange={(e) => setLine(i, { seedGrams: Number(e.target.value) })} /></td>
                <td className="num"><input type="number" min={0} step={1} className="farm-num-input" value={Math.round(l.harvestGrams)} onChange={(e) => setLine(i, { harvestGrams: Number(e.target.value) })} /></td>
                <td className="num">{num(lots[i]!.packedG, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {issues.length > 0 && (
        <div className="farm-scroll-x mt-2">
          <table className="farm-table compact">
            <thead><tr><th>Medium and nutrient issued</th><th>Lot received</th><th className="num">Quantity</th></tr></thead>
            <tbody>
              {issues.map((x, i) => (
                <tr key={`${x.kind}-${x.input}`}>
                  <td>{x.input}<div className="farm-fs-2xs farm-c-faint">{x.kind}</div></td>
                  <td><input className="farm-input w-40!" placeholder="not recorded" value={issueLots[i] ?? ''} onChange={(e) => setIssueLots((ls) => ls.map((v, j) => (j === i ? e.target.value : v)))} /></td>
                  <td className="num">{num(x.qty, 1)} {x.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="farm-kpi-sub mt-1">Seed issued includes the shrink allowance sorted out before sowing; the medium and nutrient are the plan&rsquo;s quantity per tray for the trays sown. The harvest weight is the whole sowing; a live tray packs what it harvests less the trays removed at the check.</p>

      <div className="grid gap-4 mt-3! md:grid-cols-2">
        <div>
          <div className="farm-card-title">Seed sanitation — {STAGE_BY_KEY.soak.name}</div>
          <div className="grid gap-2">
            <label className="farm-kpi-sub">Treatment<br /><input className="farm-input w-full!" placeholder="as the produce safety plan names it" value={records.seedTreatment?.method ?? ''} onChange={(e) => setRecords((r) => ({ ...r, seedTreatment: { method: e.target.value, concentration: r.seedTreatment?.concentration ?? '', contactMinutes: r.seedTreatment?.contactMinutes ?? null, seedLot: r.seedTreatment?.seedLot ?? '', by: r.seedTreatment?.by ?? '' } }))} /></label>
            <div className="flex flex-wrap gap-2">
              <label className="farm-kpi-sub">Concentration<br /><input className="farm-input w-32!" value={records.seedTreatment?.concentration ?? ''} onChange={(e) => setRecords((r) => ({ ...r, seedTreatment: { ...(r.seedTreatment ?? { method: '', contactMinutes: null, seedLot: '', by: '' }), concentration: e.target.value } }))} /></label>
              <label className="farm-kpi-sub">Contact min<br /><input type="number" min={0} className="farm-input w-24!" value={records.seedTreatment?.contactMinutes ?? ''} onChange={(e) => setRecords((r) => ({ ...r, seedTreatment: { ...(r.seedTreatment ?? { method: '', concentration: '', seedLot: '', by: '' }), contactMinutes: nf(e.target.value) } }))} /></label>
              <label className="farm-kpi-sub">Seed lot<br /><input className="farm-input w-32!" value={records.seedTreatment?.seedLot ?? ''} onChange={(e) => setRecords((r) => ({ ...r, seedTreatment: { ...(r.seedTreatment ?? { method: '', concentration: '', contactMinutes: null, by: '' }), seedLot: e.target.value } }))} /></label>
              <label className="farm-kpi-sub">By<br /><input className="farm-input w-28!" value={records.seedTreatment?.by ?? ''} onChange={(e) => setRecords((r) => ({ ...r, seedTreatment: { ...(r.seedTreatment ?? { method: '', concentration: '', contactMinutes: null, seedLot: '' }), by: e.target.value } }))} /></label>
            </div>
          </div>

          {sprout && (
            <>
              <div className="farm-card-title mt-3!">Spent sprout irrigation water test</div>
              <div className="flex flex-wrap gap-2">
                <label className="farm-kpi-sub">Sampled at, h<br /><input type="number" min={0} className="farm-input w-24!" value={records.spentWaterTest?.sampledAtHours ?? ''} onChange={(e) => setRecords((r) => ({ ...r, spentWaterTest: { ...(r.spentWaterTest ?? { listeria: null, salmonella: null, ecoliO157: null, sampledOn: null, resultOn: null, lab: '' }), sampledAtHours: Number(e.target.value) } }))} /></label>
                {(['listeria', 'salmonella', 'ecoliO157'] as const).map((k) => (
                  <label key={k} className="farm-kpi-sub">{k === 'ecoliO157' ? 'E. coli O157:H7' : k === 'listeria' ? 'Listeria spp.' : 'Salmonella'}<br />
                    <select className="farm-select" value={records.spentWaterTest?.[k] === null || records.spentWaterTest?.[k] === undefined ? '' : records.spentWaterTest[k] ? 'positive' : 'negative'} onChange={(e) => setRecords((r) => ({ ...r, spentWaterTest: { ...(r.spentWaterTest ?? { sampledAtHours: 0, listeria: null, salmonella: null, ecoliO157: null, sampledOn: null, resultOn: null, lab: '' }), [k]: e.target.value === '' ? null : e.target.value === 'positive' } }))}>
                      <option value="">no result</option><option value="negative">negative</option><option value="positive">positive</option>
                    </select>
                  </label>
                ))}
                <label className="farm-kpi-sub">Result on<br /><input type="date" className="farm-input" value={records.spentWaterTest?.resultOn ?? ''} onChange={(e) => setRecords((r) => ({ ...r, spentWaterTest: { ...(r.spentWaterTest ?? { sampledAtHours: 0, listeria: null, salmonella: null, ecoliO157: null, sampledOn: null, lab: '' }), resultOn: e.target.value || null } }))} /></label>
                <label className="farm-kpi-sub">Lab<br /><input className="farm-input w-32!" value={records.spentWaterTest?.lab ?? ''} onChange={(e) => setRecords((r) => ({ ...r, spentWaterTest: { ...(r.spentWaterTest ?? { sampledAtHours: 0, listeria: null, salmonella: null, ecoliO157: null, sampledOn: null, resultOn: null }), lab: e.target.value } }))} /></label>
              </div>
            </>
          )}
        </div>

        <div>
          <div className="farm-card-title">Grow-room readings</div>
          <table className="farm-table compact">
            <thead><tr><th>When</th><th className="num">°F</th><th className="num">RH %</th><th>By</th><th /></tr></thead>
            <tbody>
              {records.readings.map((r, i) => (
                <tr key={i}>
                  <td><input type="datetime-local" className="farm-input" value={r.at} onChange={(e) => setReading(i, { at: e.target.value })} /></td>
                  <td className="num"><input type="number" className="farm-num-input" value={r.tempF ?? ''} onChange={(e) => setReading(i, { tempF: nf(e.target.value) })} /></td>
                  <td className="num"><input type="number" min={0} max={100} className="farm-num-input" value={r.rhPct ?? ''} onChange={(e) => setReading(i, { rhPct: nf(e.target.value) })} /></td>
                  <td><input className="farm-input w-24!" value={r.by} onChange={(e) => setReading(i, { by: e.target.value })} /></td>
                  <td><button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setRecords((x) => ({ ...x, readings: x.readings.filter((_, j) => j !== i) }))}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="farm-btn mt-2" onClick={addReading}>+ reading</button>

          <div className="farm-card-title mt-3!">Harvest check</div>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="farm-kpi-sub">{sprout ? 'Jars' : 'Trays'} removed<br /><input type="number" min={0} max={traysSown} step={1} className="farm-input w-24!" value={removed} onChange={(e) => setRemoved(Math.min(traysSown, Math.max(0, Number(e.target.value))))} /></label>
            <label className="farm-kpi-sub flex-1! min-w-48!">Why<br /><input className="farm-input w-full!" placeholder="mold, off-odor, rot at the stem base, foreign matter" value={removedNote} onChange={(e) => setRemovedNote(e.target.value)} /></label>
            <span className="farm-kpi-sub">{num(traysPacked)} of {num(traysSown)} {unitWord} packed</span>
          </div>
        </div>
      </div>

      <div className="mt-3!">
        <div className="farm-card-title">Control points on this record</div>
        <ul className="farm-kpi-sub list-disc pl-5">
          {checks.points.map((c) => <li key={c.point.id}>{c.point.name}: <CheckPill ok={c.status === 'recorded'} okLabel="RECORDED" overLabel={c.status === 'failed' ? 'FAILED' : 'GAP'} /> {c.detail}</li>)}
        </ul>
      </div>

      <div className="mt-3!">
        <div className="farm-card-title">Crew hours</div>
        <table className="farm-table compact">
          <thead><tr><th>Person</th><th className="num">Hours</th><th className="num">Loaded $/h</th><th /></tr></thead>
          <tbody>
            {crew.map((c, i) => (
              <tr key={i}>
                <td><input className="farm-input w-40!" value={c.name} onChange={(e) => setCrewLine(i, { name: e.target.value })} /></td>
                <td className="num"><input type="number" min={0} step={0.25} className="farm-num-input" value={c.hours} onChange={(e) => setCrewLine(i, { hours: Number(e.target.value) })} /></td>
                <td className="num"><input type="number" min={0} step={0.5} className="farm-num-input" value={c.ratePerHour ?? ''} onChange={(e) => setCrewLine(i, { ratePerHour: nf(e.target.value) })} /></td>
                <td><button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setCrew((cs) => cs.filter((_, j) => j !== i))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="farm-btn mt-2" onClick={() => setCrew((cs) => [...cs, { name: '', hours: 0, ratePerHour: null }])}>+ person</button>
        <span className="farm-kpi-sub ml-3">{crewTotals.hours === null ? 'No hours: labor posts at standard.' : `${num(crewTotals.hours, 2)} h${crewTotals.rate === null ? ', rate at standard' : ` at ${num(crewTotals.rate, 2)}/h`}`}</span>
      </div>

      <div className="mt-3! flex flex-wrap gap-3 items-end">
        <label className="farm-kpi-sub">Closed by<br /><input className="farm-input w-48!" value={closedBy} onChange={(e) => setClosedBy(e.target.value)} /></label>
        <label className="farm-kpi-sub flex-1! min-w-64!">Notes<br /><input className="farm-input w-full!" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <span className="farm-kpi-sub">Mass balance <CheckPill ok={balance.balanced} okLabel="BALANCES" overLabel="OPEN" /></span>
        <StatusBadge status={checks.complete ? 'STATED' : 'PLACEHOLDER'} title={checks.complete ? 'Every control point on the plan is recorded' : checks.gaps.join(' ')} />
      </div>
      {!balance.balanced && <p className="farm-kpi-sub mt-1">{balance.failures.join(' ')}</p>}
      {checks.gaps.length > 0 && <p className="farm-kpi-sub mt-1">Gaps on the record: {checks.gaps.join(' ')} A gap is recorded as a gap, never as a pass; the record still closes.</p>}
      <div className="flex gap-2 mt-3!">
        <button type="button" className="farm-btn primary" disabled={pending || !balance.balanced || !closedBy.trim()} onClick={submit}>Close sowing record</button>
        {onCancel && <button type="button" className="farm-btn" disabled={pending} onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
