'use client';

import { useMemo, useState, useTransition } from 'react';
import { Card, num } from './ui';
import { EntityPicker } from './EntityPicker';
import { useLinkedEntities } from './useLinkedEntities';
import { entityRef } from '../_engine/entity-links';
import { READING_METRICS, READING_METRIC_KEYS, type ReadingMetric, type SustainabilityRecords } from '../_engine/sustainability-records';
import { deleteReading, recordReading } from '../_lib/sustainability-record-actions';
import { useScenario } from '../_state/scenario-store';

/**
 * Bills, lab results and inspections on Actual (Roadmap N6 slice 4). An operator
 * enters one with the document it came from; a super admin removes one with the
 * reason. The year's figures on the page fold from these rows.
 */
export function SustainabilityReadingsCard({ group, records, year, onChanged }: { group: 'energy' | 'water'; records: SustainabilityRecords | null; year: number; onChanged: () => void }) {
  const { isSuperAdmin } = useScenario();
  const metrics = READING_METRIC_KEYS.filter((k) => READING_METRICS[k].group === group);
  const [form, setForm] = useState<{ metric: ReadingMetric; periodStart: string; readOn: string; quantity: string; sourceId: string | undefined; notes: string }>({ metric: metrics[0], periodStart: '', readOn: '', quantity: '', sourceId: undefined, notes: '' });
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, start] = useTransition();
  const rows = useMemo(
    () => (records?.readings ?? []).filter((r) => READING_METRICS[r.metric]?.group === group && r.readOn.startsWith(`${year}-`)).sort((a, b) => b.readOn.localeCompare(a.readOn)),
    [records, group, year],
  );
  const refs = useMemo(() => [...new Set([...rows.map((r) => r.sourceId), form.sourceId].filter((x): x is string => Boolean(x)))].map((id) => entityRef('source', id)), [rows, form.sourceId]);
  const sources = useLinkedEntities(refs);
  const sourceOf = (id: string | null | undefined) => (id ? sources[entityRef('source', id)] ?? null : null);
  const def = READING_METRICS[form.metric];

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setMsg({ kind: 'ok', text: ok });
        after?.();
        onChanged();
      } else setMsg({ kind: 'err', text: r.error });
    });

  const submit = () => {
    const quantity = def.fold === 'event' ? null : form.quantity === '' ? null : Number(form.quantity);
    run(
      () => recordReading({ metric: form.metric, periodStart: def.fold === 'flow' && form.periodStart ? form.periodStart : null, readOn: form.readOn, quantity, sourceId: form.sourceId ?? null, notes: form.notes || null }),
      `Entered: ${def.label}, ${form.readOn}.`,
      () => setForm((f) => ({ ...f, periodStart: '', readOn: '', quantity: '', sourceId: undefined, notes: '' })),
    );
  };

  return (
    <Card title={`${group === 'energy' ? 'Bills' : 'Bills, lab results and inspections'} on record — ${year}`} className="mt-4">
      {msg && <div className={`muse-scenariobar-msg ${msg.kind} mb-[0.6rem]!`} role="status">{msg.text}</div>}
      <div className="flex flex-wrap gap-[0.6rem] items-end">
        <label className="muse-kpi-sub">Record<br />
          <select className="muse-select" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value as ReadingMetric })}>
            {metrics.map((k) => <option key={k} value={k}>{READING_METRICS[k].label}</option>)}
          </select>
        </label>
        {def.fold === 'flow' && <label className="muse-kpi-sub">Period from<br /><input type="date" className="muse-input" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} /></label>}
        <label className="muse-kpi-sub">{def.fold === 'flow' ? 'Period to' : def.fold === 'event' ? 'Date' : 'Sampled or inspected on'}<br /><input type="date" className="muse-input" value={form.readOn} onChange={(e) => setForm({ ...form, readOn: e.target.value })} /></label>
        {def.fold !== 'event' && <label className="muse-kpi-sub">Quantity, {def.unit}<br /><input type="number" min={0} step="any" className="muse-input w-36!" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>}
        <div className="muse-kpi-sub">Document<br />
          <EntityPicker kinds={['source']} linked={sourceOf(form.sourceId)} canEdit compact label="document" emptyText={def.document} addLabel={form.sourceId ? 'Change' : 'Link document'} ariaLabel={`Link the ${def.document.toLowerCase()}`} placeholder="Search title, publisher, kind…" onLink={(id) => setForm({ ...form, sourceId: id })} />
        </div>
        <label className="muse-kpi-sub">Notes<br /><input className="muse-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <button type="button" className="muse-btn primary" disabled={pending || !form.readOn || (def.fold !== 'event' && form.quantity === '')} onClick={submit}>Enter</button>
      </div>

      <div className="muse-scroll-x mt-3">
        <table className="muse-table">
          <thead><tr><th>Record</th><th>Period</th><th className="num">Quantity</th><th>Document</th><th>Entered by</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="muse-c-soft">Nothing on record in {year}. Every figure above reads zero until a record is entered.</td></tr>}
            {rows.map((r) => {
              const m = READING_METRICS[r.metric];
              const src = sourceOf(r.sourceId);
              return (
                <tr key={r.id}>
                  <td className="font-medium!">{m.label}{r.notes ? <div className="muse-c-faint muse-fs-xs font-normal">{r.notes}</div> : null}</td>
                  <td>{r.periodStart ? `${r.periodStart} to ${r.readOn}` : r.readOn}</td>
                  <td className="num">{r.quantity === null ? '—' : `${num(r.quantity, 2)} ${m.unit}`}</td>
                  <td className={`${(src ? '' : 'muse-c-faint')}`}>{src ? src.name : 'No document linked'}</td>
                  <td className="muse-c-soft">{r.recordedBy ?? '—'}</td>
                  <td className="num">{isSuperAdmin && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending || reason.trim().length < 3} onClick={() => run(() => deleteReading({ id: r.id, reason }), 'Removed the record.', () => setReason(''))}>Remove</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isSuperAdmin && rows.length > 0 && (
        <label className="muse-kpi-sub mt-2 block!">Reason for a removal<br /><input className="muse-input w-full! max-w-112!" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      )}
      <p className="muse-kpi-sub mt-2">
        A bill&rsquo;s quantity counts in the year its period ends. {group === 'water' ? 'Monthly volumes are the year’s bills over the months billed; a lab result and the trap fill read the latest on or before the year’s end. ' : 'Renewable share is the kWh under renewable supply over all kWh billed. '}
        An entry and a removal are each on the posting trail; no record is edited.
      </p>
    </Card>
  );
}
