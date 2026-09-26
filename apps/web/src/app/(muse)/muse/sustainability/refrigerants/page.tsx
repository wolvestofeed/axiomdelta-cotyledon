'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, StatusBadge, pct } from '../../_components/ui';
import { Cite } from '../../_components/Cite';
import { aimActRules, greenChillCriteria, refrigerantGwpAR4 } from '../../_data/emission-factors';
import { countsTowardCapital } from '../../_engine/equipment';
import { refrigerantInventory } from '../../_engine/carbon';
import { useScenario } from '../../_state/scenario-store';
import { useSustainabilityWorld } from '../../_state/sustainability';
import { SustainabilityWorldNote } from '../../_components/ledger/SustainabilityWorldNote';
import { EntityPicker } from '../../_components/EntityPicker';
import { useLinkedEntities } from '../../_components/useLinkedEntities';
import { entityRef } from '../../_engine/entity-links';
import { deleteRefrigerantService, recordRefrigerantService } from '../../_lib/sustainability-record-actions';

const STATUS_LABEL = { triggered: 'TRIGGERED', 'within-limit': 'WITHIN LIMIT', 'not-applicable': 'NOT IN SCOPE' } as const;

export default function RefrigerantsPage() {
  const { resolved, isSuperAdmin } = useScenario();
  const world = useSustainabilityWorld();
  const attrs = resolved.sustainability.equipment;
  // Plan: a forecast carries no leaks. Actual: the service records (Roadmap N6 slice 4).
  const service = world.refrigerantService;
  const year = resolved.sustainability.audit.reportingYear;
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const asOf = !world.isPlan && today.startsWith(`${year}-`) ? today : world.basis.to;
  const [draft, setDraft] = useState<Record<string, { date: string; lb: string; sourceId?: string; technician: string }>>({});
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, start] = useTransition();

  const carried = useMemo(() => resolved.equipment.filter((e) => countsTowardCapital(e.status)), [resolved.equipment]);
  const inv = useMemo(() => refrigerantInventory(carried.map((e) => ({ item: e.key, qty: e.qty })), attrs, service, asOf), [carried, attrs, service, asOf]);
  const records = useMemo(() => world.records?.refrigerantService ?? [], [world.records]);
  const sourceRefs = useMemo(
    () => [...new Set([...records.map((r) => r.sourceId), ...Object.values(draft).map((d) => d.sourceId)].filter((x): x is string => Boolean(x)))].map((id) => entityRef('source', id)),
    [records, draft],
  );
  const sources = useLinkedEntities(sourceRefs);
  const sourceOf = (id: string | null | undefined) => (id ? sources[entityRef('source', id)] ?? null : null);
  const inYear = records.filter((r) => r.servicedOn.startsWith(`${year}-`));
  const candidates = carried.filter((e) => e.category === 'Cold storage' || /chiller/i.test(e.item));
  const unregistered = candidates.filter((e) => !inv.rows.some((r) => r.circuit.id === e.key));

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setMsg({ kind: 'ok', text: ok });
        after?.();
        world.reload();
      } else setMsg({ kind: 'err', text: r.error });
    });
  const addService = (item: string, name: string) => {
    const d = draft[item];
    const lb = Number(d?.lb);
    if (!d?.date || !Number.isFinite(lb) || lb <= 0) return;
    run(
      () => recordRefrigerantService({ equipmentKey: item, servicedOn: d.date, lbAdded: lb, sourceId: d.sourceId ?? null, technician: d.technician || null }),
      `Entered: ${name}, ${d.date}, ${lb} lb.`,
      () => setDraft((x) => ({ ...x, [item]: { date: '', lb: '', technician: '' } })),
    );
  };
  const setDraftField = (item: string, patch: Partial<{ date: string; lb: string; sourceId?: string; technician: string }>) =>
    setDraft((x) => ({ ...x, [item]: { ...{ date: '', lb: '', technician: '' }, ...x[item], ...patch } }));

  return (
    <>
      <PageHeader
        title="Refrigerants"
        purpose="Track each circuit's annual leak rate against the rule thresholds."
        functions={['Circuit register', 'Service additions', 'Aggregate leak rate', 'Rule thresholds']}
        connects={[
          { href: '/muse/sustainability/equipment', dir: 'from' },
          { href: '/muse/sustainability/inventory', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Every equipment line with a refrigerant and a factory charge on file is a circuit.</li>
            <li>Refrigerant added at service is treated as leaked.</li>
            <li>The annualized leak rate is the addition as a share of full charge, scaled to twelve months.</li>
            <li>Findings state the computed rate against the thresholds in <Cite p={aimActRules.provenance} label="the EPA leak-repair rule" />.</li>
          </ul>
        }
        status="partial"
      />

      <SustainabilityWorldNote world={world} />
      {msg && <div className={`muse-scenariobar-msg ${msg.kind} mb-3!`} role="status">{msg.text}</div>}

      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={inv.circuitsOnFile} label="Circuits on file" sub={`${unregistered.length} cold-chain line${unregistered.length === 1 ? '' : 's'} without refrigerant or charge`} />
        <Kpi value={`${(inv.totalCo2eKgInYear / 1000).toFixed(2)} t`} label={`Fugitive CO2e, ${asOf.slice(0, 4)}`} sub={world.isPlan ? 'A forecast carries no leaks' : 'AR4 basis, as the rule uses'} />
        <Kpi value={inv.circuitsOnFile ? pct(inv.greenChill.aggregateLeakRate, 1) : '—'} label="Aggregate leak rate" sub={`GreenChill limit ${pct(greenChillCriteria.maxAggregateLeakRate, 0)}`} />
        <Kpi value={inv.rows.filter((r) => r.findings.some((f) => f.status === 'triggered' && f.id !== 'aim-applicability')).length} label="Circuits with a triggered finding" />
        <Kpi value={inYear.length === 0 ? '—' : `${inYear.filter((r) => r.sourceId).length} / ${inYear.length}`} label="Service additions with a ticket linked" sub={world.isPlan ? 'Entered on Actual' : `The technician's document, ${year}`} />
      </div>

      <Card title="Circuit register" className="mt-4">
        {inv.rows.length === 0 ? (
          <p className="muse-kpi-sub">
            No circuit has a refrigerant and charge on file. Enter them per line on <Link className="muse-link" href="/muse/sustainability/equipment">Equipment &amp; Rebates</Link>; the register fills from there.
          </p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th>Equipment</th><th>Refrigerant</th><th className="num">Units</th><th className="num">Full charge, lb</th><th className="num">Added this year, lb</th><th className="num">Latest annualized rate</th><th className="num">CO2e kg this year</th><th>Rule findings</th></tr></thead>
              <tbody>
                {inv.rows.map((r) => (
                  <tr key={r.circuit.id}>
                    <td className="font-medium!">{r.circuit.equipment}{r.circuit.installedOn ? <div className="muse-fs-2xs muse-c-faint">installed {r.circuit.installedOn}</div> : null}</td>
                    <td>{r.circuit.refrigerant}{!r.gwpOnFile ? <div className="muse-fs-2xs muse-c-placeholder">no GWP on file</div> : null}</td>
                    <td className="num">{r.quantity}</td>
                    <td className="num">{r.circuit.fullChargeLb.toFixed(1)}</td>
                    <td className="num">{r.lbAddedInYear.toFixed(1)}</td>
                    <td className="num">{r.latestRate === null ? '—' : pct(r.latestRate, 1)}</td>
                    <td className="num">{r.co2eKgInYear.toFixed(0)}</td>
                    <td>
                      {r.findings.map((f) => (
                        <div key={f.id} className="muse-fs-xs mb-[0.2rem]!">
                          <span className={`muse-pill ${f.status === 'triggered' ? 'over' : 'ok'}`}>{STATUS_LABEL[f.status]}</span>{' '}
                          <span className="muse-c-soft">{f.rule}</span>
                          {f.computed.repairWindowEnds ? <span> · repair window ends {String(f.computed.repairWindowEnds)}</span> : null}
                          {f.computed.reportDue ? <span> · report due {String(f.computed.reportDue)}</span> : null}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {inv.rows.length > 0 && world.isPlan && (
          <p className="muse-kpi-sub mt-3">A forecast carries no refrigerant leaks. Service additions are facts, entered from the technician&rsquo;s ticket on Actual.</p>
        )}
        {inv.rows.length > 0 && !world.isPlan ? (
          <div className="mt-3">
            <div className="muse-card-title">Service additions on record</div>
            {inv.rows.map((r) => {
              const mine = records.filter((x) => x.equipmentKey === r.circuit.id);
              const d = draft[r.circuit.id];
              return (
                <div key={r.circuit.id} className="flex flex-wrap gap-y-2 gap-x-3 items-center py-[0.4rem] px-0 border-t border-t-[color:var(--muse-line)] muse-fs-sm">
                  <span className="font-medium min-w-64">{r.circuit.equipment}</span>
                  {mine.map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-[0.4rem] border border-[color:var(--muse-line)] rounded-[0.4rem] py-1 px-[0.45rem] bg-[color:var(--muse-surface-2)]">
                      <span className="muse-pill ok">{a.servicedOn} · {a.lbAdded} lb</span>
                      <span className={`muse-fs-xs ${(a.sourceId ? '' : 'muse-c-faint')}`}>{sourceOf(a.sourceId)?.name ?? 'No ticket linked'}{a.technician ? ` · ${a.technician}` : ''}</span>
                      {isSuperAdmin && <button type="button" className="muse-btn py-0! px-[0.35rem]! muse-fs-2xs" disabled={pending || reason.trim().length < 3} onClick={() => run(() => deleteRefrigerantService({ id: a.id, reason }), 'Removed the service record.', () => setReason(''))} aria-label="Remove service addition">×</button>}
                    </span>
                  ))}
                  <input type="date" className="muse-input min-w-36! muse-fs-xs" value={d?.date ?? ''} onChange={(ev) => setDraftField(r.circuit.id, { date: ev.target.value })} aria-label="Service date" />
                  <input type="number" min={0} step={0.5} placeholder="lb added" className="muse-input min-w-24! muse-fs-xs" value={d?.lb ?? ''} onChange={(ev) => setDraftField(r.circuit.id, { lb: ev.target.value })} aria-label="Pounds added" />
                  <input placeholder="Technician" className="muse-input min-w-32! muse-fs-xs" value={d?.technician ?? ''} onChange={(ev) => setDraftField(r.circuit.id, { technician: ev.target.value })} aria-label="Technician" />
                  <EntityPicker kinds={['source']} linked={sourceOf(d?.sourceId)} canEdit compact label="ticket" emptyText="No ticket linked" addLabel={d?.sourceId ? 'Change' : 'Link ticket'} ariaLabel={`Link the service ticket for ${r.circuit.equipment}`} placeholder="Search title, publisher, kind…" onLink={(id) => setDraftField(r.circuit.id, { sourceId: id })} />
                  <button type="button" className="muse-btn" disabled={pending} onClick={() => addService(r.circuit.id, r.circuit.equipment)}>Enter</button>
                </div>
              );
            })}
            {isSuperAdmin && records.length > 0 && (
              <label className="muse-kpi-sub mt-2 block!">Reason for a removal<br /><input className="muse-input w-full! max-w-112!" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            )}
            <p className="muse-kpi-sub mt-2">From the technician’s ticket: date and pounds added, with the ticket itself linked from the registry on <Link className="muse-link" href="/muse/sources">Sources</Link>. The latest addition sets the annualized rate against the interval since the previous addition or installation, and a triggered finding rests on the ticket behind it. An entry and a removal are each on the posting trail.</p>
          </div>
        ) : null}
      </Card>

      <Card title="Rule thresholds on file" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead><tr><th>Rule</th><th className="num">Threshold</th><th>Computed</th></tr></thead>
            <tbody>
              <tr><td className="font-medium!">Applicability</td><td className="num">≥ {aimActRules.applicabilityMinChargeLb} lb charge and GWP &gt; {aimActRules.applicabilityMinGwp}</td><td className="muse-c-soft">Per circuit</td></tr>
              <tr><td className="font-medium!">Commercial refrigeration trigger</td><td className="num">{pct(aimActRules.commercialRefrigerationTriggerRate, 0)} annualized</td><td className="muse-c-soft">Latest addition; {aimActRules.repairWindowDays}-day repair window</td></tr>
              <tr><td className="font-medium!">Chronic leak</td><td className="num">≥ {pct(aimActRules.chronicLeakShareOfCharge, 0)} of charge in a calendar year</td><td className="muse-c-soft">Report due 1 March following</td></tr>
              <tr><td className="font-medium!">GreenChill aggregate</td><td className="num">≤ {pct(greenChillCriteria.maxAggregateLeakRate, 0)}</td><td className="muse-c-soft">{inv.circuitsOnFile ? `${pct(inv.greenChill.aggregateLeakRate, 1)} across ${inv.circuitsOnFile} circuit(s)` : '—'}</td></tr>
              <tr><td className="font-medium!">GreenChill new equipment</td><td className="num">GWP ≤ {greenChillCriteria.maxGwpNewEquipment}</td><td className="muse-c-soft">{inv.greenChill.newEquipmentAboveGwp.length ? inv.greenChill.newEquipmentAboveGwp.map((x) => `${x.circuitId} (${x.refrigerant}, ${x.gwp})`).join('; ') : 'none installed this year above the limit'}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2">
          Leak-repair provisions: <Cite p={aimActRules.provenance} /> <StatusBadge status={aimActRules.provenance.status} title={aimActRules.provenance.note} />. GreenChill: <Cite p={greenChillCriteria.provenance} /> <StatusBadge status={greenChillCriteria.provenance.status} title={greenChillCriteria.provenance.note} />. Refrigerants with a GWP on file: {Object.keys(refrigerantGwpAR4).join(', ')}.
        </p>
      </Card>
    </>
  );
}
