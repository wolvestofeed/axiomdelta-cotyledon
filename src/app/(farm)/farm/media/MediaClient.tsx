'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, StatusBadge, money, num } from '@/components/ui';
import { NO_MEDIUM_KEY } from '@/data/inputs-catalog';
import type { LibraryMedium } from '@/engine/media';
import { createMedium, deleteMedium, updateMedium } from '@/server/media-actions';

/** The form's working copy: text fields, parsed on save. Blank price fields leave the price as it is. */
interface Draft {
  name: string;
  form: 'loose' | 'mat';
  qtyPer1020: string;
  paid: string;
  quantity: string;
  ph: string;
  porosity: string;
  note: string;
  rows: string;
}

const BLANK: Draft = { name: '', form: 'loose', qtyPer1020: '', paid: '', quantity: '', ph: '', porosity: '', note: '', rows: '' };

function draftOf(m: LibraryMedium): Draft {
  return {
    name: m.name,
    form: m.form === 'mat' ? 'mat' : 'loose',
    qtyPer1020: String(m.qtyPer1020.value),
    paid: '',
    quantity: '',
    ph: m.traits.ph ?? '',
    porosity: m.traits.porosity ?? '',
    note: m.traits.note,
    rows: m.rows.join(', '),
  };
}

const rowsOf = (s: string): number[] => s.split(/[\s,]+/).filter(Boolean).map(Number);
const unitWord = (unit: string) => (unit === 'gal' ? 'gal' : unit === 'each' ? 'mat' : '—');

export function MediaClient({ media, namedBy, canEdit }: { media: LibraryMedium[]; namedBy: Record<string, string[]>; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [d, setD] = useState<Draft>(BLANK);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const current = editing && editing !== 'new' ? media.find((m) => m.id === editing) : undefined;
  const formUnit = editing === 'new' ? (d.form === 'loose' ? 'gal' : 'each') : (current?.unit ?? 'gal');
  const noMedium = current?.key === NO_MEDIUM_KEY;

  const open = (target: LibraryMedium | 'new') => {
    setErr(null);
    setEditing(target === 'new' ? 'new' : target.id);
    setD(target === 'new' ? BLANK : draftOf(target));
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setErr(r.error ?? 'Not saved.');
        return;
      }
      setEditing(null);
      setErr(null);
      router.refresh();
    });

  const save = () => {
    const price = d.paid.trim() !== '' || d.quantity.trim() !== '' ? { paid: Number(d.paid), quantity: Number(d.quantity) } : undefined;
    if (editing === 'new') {
      if (!price) {
        setErr(`Enter what was paid and how many ${d.form === 'loose' ? 'gallons it gave' : 'mats it held'}.`);
        return;
      }
      run(() => createMedium({ name: d.name, form: d.form, qtyPer1020: Number(d.qtyPer1020), price, ph: d.ph, porosity: d.porosity, note: d.note, rows: rowsOf(d.rows) }));
      return;
    }
    if (!current) return;
    const was = draftOf(current);
    const patch: Record<string, unknown> = { id: current.id };
    if (d.name !== was.name) patch.name = d.name;
    if (d.qtyPer1020 !== was.qtyPer1020) patch.qtyPer1020 = Number(d.qtyPer1020);
    if (price) patch.price = price;
    if (d.ph !== was.ph) patch.ph = d.ph;
    if (d.porosity !== was.porosity) patch.porosity = d.porosity;
    if (d.note !== was.note) patch.note = d.note;
    if (d.rows !== was.rows) patch.rows = rowsOf(d.rows);
    if (Object.keys(patch).length === 1) {
      setEditing(null);
      return;
    }
    run(() => updateMedium(patch));
  };

  const form = (
    <div className="mt-3" id="medium-form">
      <div className="farm-card-title">{editing === 'new' ? 'Add medium' : `Edit ${current?.name ?? ''}`}</div>
      <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))' }}>
        <label className="farm-kpi-sub">Name<input className="farm-input block w-full" value={d.name} onChange={(e) => set('name', e.target.value)} /></label>
        {editing === 'new' && (
          <label className="farm-kpi-sub">Form
            <select className="farm-select block w-full" value={d.form} onChange={(e) => set('form', e.target.value as Draft['form'])}>
              <option value="loose">Loose fill, by the gallon</option>
              <option value="mat">Mat, one per tray</option>
            </select>
          </label>
        )}
        {!noMedium && (
          <>
            <label className="farm-kpi-sub">Per 1020, {unitWord(formUnit)}<input className="farm-input block w-full" type="number" min={0} step={0.01} value={d.qtyPer1020} onChange={(e) => set('qtyPer1020', e.target.value)} /></label>
            <label className="farm-kpi-sub">Paid, ${editing === 'new' ? '' : ' (blank keeps the price)'}<input className="farm-input block w-full" type="number" min={0} step={0.01} value={d.paid} onChange={(e) => set('paid', e.target.value)} /></label>
            <label className="farm-kpi-sub">It gave, {formUnit === 'gal' ? 'gal' : 'mats'}<input className="farm-input block w-full" type="number" min={0} step={0.1} value={d.quantity} onChange={(e) => set('quantity', e.target.value)} /></label>
          </>
        )}
        <label className="farm-kpi-sub">pH<input className="farm-input block w-full" value={d.ph} placeholder="none" onChange={(e) => set('ph', e.target.value)} /></label>
        <label className="farm-kpi-sub">Porosity<input className="farm-input block w-full" value={d.porosity} placeholder="none" onChange={(e) => set('porosity', e.target.value)} /></label>
      </div>
      <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))' }}>
        <label className="farm-kpi-sub">Traits<input className="farm-input block w-full" value={d.note} onChange={(e) => set('note', e.target.value)} /></label>
        <label className="farm-kpi-sub">Science library rows<input className="farm-input block w-full" value={d.rows} placeholder="e.g. 8, 65" onChange={(e) => set('rows', e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="button" className="farm-btn primary" disabled={pending} onClick={save}>{editing === 'new' ? 'Add' : 'Save'}</button>
        <button type="button" className="farm-btn" disabled={pending} onClick={() => setEditing(null)}>Cancel</button>
        {current && !noMedium && (namedBy[current.key]?.length ?? 0) === 0 && (
          <button type="button" className="farm-btn" disabled={pending} onClick={() => run(() => deleteMedium({ id: current.id }))}>Delete</button>
        )}
      </div>
      {err && <div className="farm-scenariobar-msg err mt-2" role="status">{err}</div>}
    </div>
  );

  return (
    <Card title="The library">
      <div className="farm-scroll-x">
        <table className="farm-table compact">
          <thead>
            <tr>
              <th>Name</th>
              <th>Form</th>
              <th className="num">Per 1020</th>
              <th className="num">Price per unit</th>
              <th className="num">Per 1020, $</th>
              <th><span className="farm-unit">pH</span></th>
              <th>Porosity</th>
              <th>Traits</th>
              <th>Named by</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {media.map((m) => (
              <tr key={m.id}>
                <td style={{ minWidth: '10rem' }}>{m.name}</td>
                <td>{m.form === 'loose' ? 'Loose fill' : m.form === 'mat' ? 'Mat' : 'None'}</td>
                <td className="num">{m.unit === 'none' ? '—' : <><StatusBadge status={m.qtyPer1020.status} title={m.qtyPer1020.note} /> {num(m.qtyPer1020.value, 2)} {unitWord(m.unit)}</>}</td>
                <td className="num">{m.unit === 'none' ? '—' : <><StatusBadge status={m.costPerUnit.status} title={m.costPerUnit.note} /> {money(m.costPerUnit.value, 3)} / {unitWord(m.unit)}</>}</td>
                <td className="num">{m.unit === 'none' ? '—' : <><StatusBadge status="DERIVED" title="Per 1020 × price per unit" /> {money(m.qtyPer1020.value * m.costPerUnit.value, 3)}</>}</td>
                <td>{m.traits.ph ?? '—'}</td>
                <td>{m.traits.porosity ?? '—'}</td>
                <td className="farm-kpi-sub" style={{ minWidth: '16rem' }}>{m.traits.note || '—'}{m.rows.length ? <div>Rows {m.rows.join(', ')}</div> : null}</td>
                <td className="farm-mono">{namedBy[m.key]?.length ? namedBy[m.key]!.join(', ') : '—'}</td>
                {canEdit && <td><button type="button" className="farm-btn" disabled={pending} onClick={() => open(m)}>Edit</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="farm-kpi-sub mt-2">A plan in another tray format takes the quantity per 1020 scaled by the format&rsquo;s area.</p>
      {canEdit && editing === null && (
        <button type="button" className="farm-btn mt-2" onClick={() => open('new')}>Add medium</button>
      )}
      {canEdit && editing !== null && form}
    </Card>
  );
}
