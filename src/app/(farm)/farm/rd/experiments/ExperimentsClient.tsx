'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, num } from '@/components/ui';
import { GrowSowingCloseForm } from '@/components/GrowSowingCloseForm';
import { isGrowSowing } from '@/engine/sowing-record';
import { startExperiment, deleteExperiment } from '@/server/experiment-actions';
import type { ExperimentDoc, ExperimentStatus } from '@/engine/experiments';
import type { SowingRecordDoc } from '@/engine/actuals';
import type { GrowPlanDef } from '@/data/grow-plan';
import type { GrowUnit } from '@/engine/grow-capacity';

export interface ExperimentRow {
  experiment: ExperimentDoc;
  planName: string;
  window: { harvestFrom: string; harvestTo: string } | null;
  status: ExperimentStatus;
  statusLabel: string;
  /** The grow units whose fixture delivers the plan's light line. */
  units: string[];
  record: { sowingId: string; traysSown: number; traysPacked: number } | null;
  /** Present while the experiment is open: the plan and the grow form's prefill at its standard. */
  plan: GrowPlanDef | null;
  prefill: Omit<SowingRecordDoc, 'id' | 'closedAt'> | null;
}

export function ExperimentsClient({
  today,
  candidates,
  rows,
  growUnits,
  sowingCountByDate,
  isAdmin,
}: {
  today: string;
  candidates: { code: string; name: string; status: string; units: string[] }[];
  rows: ExperimentRow[];
  growUnits: readonly GrowUnit[];
  sowingCountByDate: Record<string, number>;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState(candidates[0]?.code ?? '');
  const [sowDate, setSowDate] = useState(today);
  const [trays, setTrays] = useState(1);
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState<string | null>(null);
  const chosen = candidates.find((c) => c.code === code);

  function submit() {
    setMsg(null);
    start(async () => {
      const res = await startExperiment({ title, growPlanCode: code, sowDate, trays, note });
      if (res.ok) {
        setMsg({ kind: 'ok', text: `Started "${title}": ${code}, ${num(trays)} trays sown ${sowDate}.` });
        setTitle('');
        setNote('');
        router.refresh();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  function remove(e: ExperimentDoc) {
    setMsg(null);
    start(async () => {
      const res = await deleteExperiment(e.id);
      if (res.ok) {
        setMsg({ kind: 'ok', text: `Removed "${e.title}".` });
        router.refresh();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  const closingRow = rows.find((r) => r.experiment.id === closing) ?? null;

  return (
    <>
      <Card title="Start an experiment">
        {msg && <div className={`farm-scenariobar-msg ${msg.kind} mb-[0.6rem]!`} role="status">{msg.text}</div>}
        {candidates.length === 0 ? (
          <p className="farm-kpi-sub">Every grow plan in the library is in service; an experiment runs a plan under development.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="farm-kpi-sub flex-[1_1_18rem]!">Title<br /><input className="farm-input w-full!" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
              <label className="farm-kpi-sub">Grow plan<br />
                <select className="farm-select" value={code} onChange={(e) => setCode(e.target.value)}>
                  {candidates.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name} · {c.status}</option>)}
                </select>
              </label>
              <label className="farm-kpi-sub">Sow date<br /><input type="date" className="farm-input" value={sowDate} onChange={(e) => setSowDate(e.target.value)} /></label>
              <label className="farm-kpi-sub">Trays<br /><input type="number" min={1} step={1} className="farm-input w-24!" value={trays} onChange={(e) => setTrays(Math.max(1, Math.round(Number(e.target.value))))} /></label>
              <button type="button" className="farm-btn primary" disabled={pending || !title.trim() || !code} onClick={submit}>Start experiment</button>
            </div>
            <label className="farm-kpi-sub block mt-2">Note<br /><textarea className="farm-input w-full!" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            {chosen && (
              <p className="farm-kpi-sub mt-2">
                {chosen.units.length ? `Grow units whose fixture delivers ${chosen.code}'s light line: ${chosen.units.join(', ')}.` : `No grow unit's fixture delivers ${chosen.code}'s light line: the experiment will show no room on the Grow Calendar until a unit that does is on Grow Units or the plan's light line changes.`}
              </p>
            )}
          </>
        )}
      </Card>

      <Card title="Experiments" className="mt-4">
        {rows.length === 0 ? (
          <p className="farm-kpi-sub">No experiment is on file.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table compact">
              <thead>
                <tr><th>Title</th><th>Plan</th><th>Sow date</th><th className="num">Trays</th><th>Harvest window</th><th>Status</th><th>Sowing record</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.experiment.id}>
                    <td>{r.experiment.title}{r.experiment.note ? <div className="farm-kpi-sub">{r.experiment.note}</div> : null}</td>
                    <td><span className="farm-mono">{r.experiment.growPlanCode}</span> {r.planName}</td>
                    <td>{r.experiment.sowDate}</td>
                    <td className="num">{num(r.experiment.trays)}</td>
                    <td>{r.window ? `${r.window.harvestFrom} to ${r.window.harvestTo}` : '—'}</td>
                    <td>{r.statusLabel}{r.status !== 'closed' && r.units.length === 0 ? <div className="farm-kpi-sub farm-c-accent">no grow unit delivers its light</div> : null}</td>
                    <td>{r.record ? `${r.record.sowingId}: ${num(r.record.traysPacked)} of ${num(r.record.traysSown)} trays packed` : '—'}</td>
                    <td className="whitespace-nowrap">
                      {r.prefill && r.status !== 'planned' && (
                        <button type="button" className={`farm-btn${closing === r.experiment.id ? ' primary' : ''}`} onClick={() => setClosing((c) => (c === r.experiment.id ? null : r.experiment.id))}>Close sowing record</button>
                      )}
                      {isAdmin && !r.record && (
                        <button type="button" className="farm-btn ghost" disabled={pending} onClick={() => remove(r.experiment)}>Remove</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {closingRow?.plan && closingRow.prefill && isGrowSowing(closingRow.prefill) && (
          <div className="mt-3">
            <GrowSowingCloseForm
              key={closingRow.experiment.id}
              prefill={closingRow.prefill}
              plan={closingRow.plan}
              sowingCountByDate={sowingCountByDate}
              growUnits={growUnits}
              planName={closingRow.planName}
              experiment={{ id: closingRow.experiment.id, title: closingRow.experiment.title }}
              onDone={() => setClosing(null)}
              onCancel={() => setClosing(null)}
            />
          </div>
        )}
      </Card>
    </>
  );
}
