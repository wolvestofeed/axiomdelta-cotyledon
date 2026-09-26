'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, StatusBadge, money, num } from '@/components/ui';
import { WATER_ONLY_KEY } from '@/data/inputs-catalog';
import { ML_PER_GAL, type LibraryNutrient } from '@/engine/nutrients';
import { createNutrient, deleteNutrient, updateNutrient } from '@/server/nutrient-actions';

/** The form's working copy: text fields, parsed on save. Blank price fields leave the price as it is. */
interface Draft {
  name: string;
  mlPerGal: string;
  paid: string;
  containerGal: string;
  ecTarget: string;
  phTarget: string;
  elicitsEffect: string;
  elicitsRows: string;
  note: string;
}

const BLANK: Draft = { name: '', mlPerGal: '', paid: '', containerGal: '', ecTarget: '', phTarget: '', elicitsEffect: '', elicitsRows: '', note: '' };

function draftOf(n: LibraryNutrient): Draft {
  return {
    name: n.name,
    mlPerGal: String(n.mlPerGal.value),
    paid: '',
    containerGal: '',
    ecTarget: n.ecTarget ? String(n.ecTarget.value) : '',
    phTarget: n.phTarget ? String(n.phTarget.value) : '',
    elicitsEffect: n.elicits?.effect ?? '',
    elicitsRows: n.elicits?.rows.join(', ') ?? '',
    note: n.note,
  };
}

const numOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s));
const rowsOf = (s: string): number[] => s.split(/[\s,]+/).filter(Boolean).map(Number);

export function NutrientsClient({ nutrients, namedBy, canEdit }: { nutrients: LibraryNutrient[]; namedBy: Record<string, string[]>; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [d, setD] = useState<Draft>(BLANK);
  const set = <K extends keyof Draft>(k: K, v: string) => setD((x) => ({ ...x, [k]: v }));
  const current = editing && editing !== 'new' ? nutrients.find((n) => n.id === editing) : undefined;

  const open = (target: LibraryNutrient | 'new') => {
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
    const price = d.paid.trim() !== '' || d.containerGal.trim() !== '' ? { paid: Number(d.paid), containerGal: Number(d.containerGal) } : undefined;
    if (editing === 'new') {
      if (!price) {
        setErr('Enter what was paid and the container size in gallons.');
        return;
      }
      run(() =>
        createNutrient({
          name: d.name,
          mlPerGal: Number(d.mlPerGal),
          price,
          ecTarget: numOrNull(d.ecTarget),
          phTarget: numOrNull(d.phTarget),
          elicitsEffect: d.elicitsEffect,
          elicitsRows: rowsOf(d.elicitsRows),
          note: d.note,
        }),
      );
      return;
    }
    if (!current) return;
    const was = draftOf(current);
    const patch: Record<string, unknown> = { id: current.id };
    if (d.name !== was.name) patch.name = d.name;
    if (d.mlPerGal !== was.mlPerGal) patch.mlPerGal = Number(d.mlPerGal);
    if (price) patch.price = price;
    if (d.ecTarget !== was.ecTarget) patch.ecTarget = numOrNull(d.ecTarget);
    if (d.phTarget !== was.phTarget) patch.phTarget = numOrNull(d.phTarget);
    if (d.elicitsEffect !== was.elicitsEffect || d.elicitsRows !== was.elicitsRows) {
      patch.elicitsEffect = d.elicitsEffect;
      patch.elicitsRows = rowsOf(d.elicitsRows);
    }
    if (d.note !== was.note) patch.note = d.note;
    if (Object.keys(patch).length === 1) {
      setEditing(null);
      return;
    }
    run(() => updateNutrient(patch));
  };

  const form = (
    <div className="mt-3" id="nutrient-form">
      <div className="farm-card-title">{editing === 'new' ? 'Add supplement' : `Edit ${current?.name ?? ''}`}</div>
      <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))' }}>
        <label className="farm-kpi-sub">Name<input className="farm-input block w-full" value={d.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label className="farm-kpi-sub">Strength, ml per gal<input className="farm-input block w-full" type="number" min={0} step={0.1} value={d.mlPerGal} onChange={(e) => set('mlPerGal', e.target.value)} /></label>
        <label className="farm-kpi-sub">Paid, ${editing === 'new' ? '' : ' (blank keeps the price)'}<input className="farm-input block w-full" type="number" min={0} step={0.01} value={d.paid} onChange={(e) => set('paid', e.target.value)} /></label>
        <label className="farm-kpi-sub">Container, gal<input className="farm-input block w-full" type="number" min={0} step={0.05} value={d.containerGal} onChange={(e) => set('containerGal', e.target.value)} /></label>
        <label className="farm-kpi-sub">EC target, mS/cm<input className="farm-input block w-full" type="number" min={0} step={0.1} placeholder="none" value={d.ecTarget} onChange={(e) => set('ecTarget', e.target.value)} /></label>
        <label className="farm-kpi-sub">pH target<input className="farm-input block w-full" type="number" min={0} max={14} step={0.1} placeholder="none" value={d.phTarget} onChange={(e) => set('phTarget', e.target.value)} /></label>
      </div>
      <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))' }}>
        <label className="farm-kpi-sub">Meant to elicit<input className="farm-input block w-full" value={d.elicitsEffect} placeholder="none" onChange={(e) => set('elicitsEffect', e.target.value)} /></label>
        <label className="farm-kpi-sub">Science library rows<input className="farm-input block w-full" value={d.elicitsRows} placeholder="e.g. 21, 65" onChange={(e) => set('elicitsRows', e.target.value)} /></label>
        <label className="farm-kpi-sub">Note<input className="farm-input block w-full" value={d.note} onChange={(e) => set('note', e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="button" className="farm-btn primary" disabled={pending} onClick={save}>{editing === 'new' ? 'Add' : 'Save'}</button>
        <button type="button" className="farm-btn" disabled={pending} onClick={() => setEditing(null)}>Cancel</button>
        {current && current.key !== WATER_ONLY_KEY && (namedBy[current.key]?.length ?? 0) === 0 && (
          <button type="button" className="farm-btn" disabled={pending} onClick={() => run(() => deleteNutrient({ id: current.id }))}>Delete</button>
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
              <th className="num">ml / gal</th>
              <th className="num">$ / ml</th>
              <th className="num">$ / gal of water</th>
              <th className="num">EC</th>
              <th className="num">pH</th>
              <th>Meant to elicit</th>
              <th>Named by</th>
              <th>Note</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {nutrients.map((n) => (
              <tr key={n.id}>
                <td style={{ minWidth: '10rem' }}>{n.name}</td>
                <td className="num"><StatusBadge status={n.mlPerGal.status} title={n.mlPerGal.note} /> {num(n.mlPerGal.value, 1)}</td>
                <td className="num"><StatusBadge status={n.costPerMl.status} title={n.costPerMl.note} /> {money(n.costPerMl.value, 4)}</td>
                <td className="num"><StatusBadge status="DERIVED" title="Strength × price per ml" /> {money(n.mlPerGal.value * n.costPerMl.value, 3)}</td>
                <td className="num">{n.ecTarget ? <><StatusBadge status={n.ecTarget.status} title={n.ecTarget.note} /> {num(n.ecTarget.value, 1)}</> : '—'}</td>
                <td className="num">{n.phTarget ? <><StatusBadge status={n.phTarget.status} title={n.phTarget.note} /> {num(n.phTarget.value, 1)}</> : '—'}</td>
                <td style={{ minWidth: '14rem' }}>{n.elicits ? <>{n.elicits.effect}{n.elicits.rows.length ? <div className="farm-kpi-sub">Rows {n.elicits.rows.join(', ')}</div> : null}</> : '—'}</td>
                <td className="farm-mono">{namedBy[n.key]?.length ? namedBy[n.key]!.join(', ') : '—'}</td>
                <td className="farm-kpi-sub" style={{ minWidth: '14rem' }}>{n.note || '—'}</td>
                {canEdit && <td><button type="button" className="farm-btn" disabled={pending} onClick={() => open(n)}>Edit</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="farm-kpi-sub mt-2">Per gallon of water is the strength times the price per ml. {num(ML_PER_GAL, 0)} ml make a gallon.</p>
      {canEdit && editing === null && (
        <button type="button" className="farm-btn mt-2" onClick={() => open('new')}>Add supplement</button>
      )}
      {canEdit && editing !== null && form}
    </Card>
  );
}
