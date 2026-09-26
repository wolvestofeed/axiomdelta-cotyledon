'use client';

import { useState } from 'react';
import { Card } from './ui';
import { RECIPE_STATUS_LABELS, type RecipeDef } from '../_data/plan-data';
import { DEFAULT_WEEKDAYS, WEEKDAY_LABELS, type MenuCycleDef, type MenuCycleStatus } from '../_data/menu-cycles';

/**
 * The form for a recipe sequence — a saved menu cycle or a customer's meal plan
 * (Roadmap N4a). One shape for both; the page decides where a save goes (the
 * record, or the open forecast). `channel` limits the recipes offered to the
 * ones listed on the customer's channel; a saved cycle offers every recipe.
 */

export interface SequenceValues {
  name: string;
  startDate: string;
  endDate: string | null;
  lengthDays: number;
  weekdays: number[];
  status: MenuCycleStatus;
  notes: string | null;
  customerServiceId: string | null;
  days: { day: number; recipeCode: string | null }[];
}

export const valuesOf = (c: MenuCycleDef): SequenceValues => ({
  name: c.name,
  startDate: c.startDate,
  endDate: c.endDate,
  lengthDays: c.lengthDays,
  weekdays: [...c.weekdays],
  status: c.status,
  notes: c.notes,
  customerServiceId: c.customerServiceId,
  days: c.days.map((d) => ({ ...d })),
});

export const emptySequence = (today: string, name = ''): SequenceValues => ({
  name,
  startDate: today,
  endDate: null,
  lengthDays: 5,
  weekdays: [...DEFAULT_WEEKDAYS],
  status: 'active',
  notes: null,
  customerServiceId: null,
  days: [],
});

export function MealPlanForm({
  title,
  initial,
  recipes,
  channel = null,
  services = [],
  pending = false,
  onSave,
  onCancel,
  children,
}: {
  title: string;
  initial: SequenceValues;
  recipes: readonly RecipeDef[];
  /** The customer's channel: only recipes listed on it are offered. Null = every recipe (a saved cycle). */
  channel?: number | null;
  /** The customer's services, for a plan that serves one service only. Empty = no service scope offered. */
  services?: readonly { id: string; label: string }[];
  pending?: boolean;
  onSave: (values: SequenceValues) => void;
  onCancel: () => void;
  /** Extra controls under the sequence — the apply-to picker on a saved cycle. */
  children?: React.ReactNode;
}) {
  const [f, setF] = useState<SequenceValues>(initial);
  const byDay = new Map(f.days.map((d) => [d.day, d.recipeCode]));
  const offered = channel === null ? recipes : recipes.filter((r) => r.channels.includes(channel));
  const set = (patch: Partial<SequenceValues>) => setF({ ...f, ...patch });
  const setDay = (day: number, recipeCode: string | null) =>
    set({ days: [...f.days.filter((d) => d.day !== day), { day, recipeCode }].sort((a, b) => a.day - b.day) });

  function save() {
    const days = Array.from({ length: f.lengthDays }, (_, i) => i + 1).map((day) => ({ day, recipeCode: byDay.get(day) ?? null }));
    onSave({ ...f, name: f.name.trim(), notes: f.notes?.trim() || null, days });
  }

  return (
    <Card title={title} className="mt-4">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="muse-kpi-sub">Name<br /><input className="muse-input w-56!" value={f.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="muse-kpi-sub">Start date (day 1)<br /><input className="muse-input" type="date" value={f.startDate} onChange={(e) => e.target.value && set({ startDate: e.target.value })} /></label>
        <label className="muse-kpi-sub">End date (blank = open)<br /><input className="muse-input" type="date" value={f.endDate ?? ''} onChange={(e) => set({ endDate: e.target.value || null })} /></label>
        <label className="muse-kpi-sub">Length (service days)<br /><input className="muse-input w-26!" type="number" min={1} max={60} value={f.lengthDays} onChange={(e) => set({ lengthDays: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} /></label>
        <div className="muse-kpi-sub">Advances on<br />
          <span className="inline-flex gap-2 mt-[0.2rem]!">
            {WEEKDAY_LABELS.map((w, i) => (
              <label key={w} className="inline-flex! gap-[0.2rem]! items-center!">
                <input type="checkbox" checked={f.weekdays.includes(i)} onChange={(e) => set({ weekdays: e.target.checked ? [...f.weekdays, i].sort() : f.weekdays.filter((x) => x !== i) })} />{w}
              </label>
            ))}
          </span>
        </div>
        {services.length > 0 && (
          <label className="muse-kpi-sub">Serves<br />
            <select className="muse-select" value={f.customerServiceId ?? ''} onChange={(e) => set({ customerServiceId: e.target.value || null })}>
              <option value="">Every service</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.label} only</option>)}
            </select>
          </label>
        )}
        <label className="muse-kpi-sub">Status<br />
          <select className="muse-select" value={f.status} onChange={(e) => set({ status: e.target.value as MenuCycleStatus })}>
            <option value="active">active</option><option value="inactive">inactive</option>
          </select>
        </label>
        <label className="muse-kpi-sub flex-1! min-w-56!">Notes<br /><input className="muse-input w-full!" value={f.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></label>
      </div>
      <div className="muse-scroll-x mt-3!">
        <table className="muse-table">
          <thead><tr><th>Day</th><th>Recipe served</th></tr></thead>
          <tbody>
            {Array.from({ length: f.lengthDays }, (_, i) => i + 1).map((d) => (
              <tr key={d}>
                <td>Day {d}</td>
                <td>
                  <select className="muse-select" value={byDay.get(d) ?? ''} onChange={(e) => setDay(d, e.target.value || null)}>
                    <option value="">No service</option>
                    {offered.map((r) => <option key={r.code} value={r.code}>{r.code} — {r.name} · {RECIPE_STATUS_LABELS[r.status]}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {children}
      <div className="flex gap-2 mt-3!">
        <button type="button" className="muse-btn primary" onClick={save} disabled={pending || !f.name.trim() || f.weekdays.length === 0}>Save</button>
        <button type="button" className="muse-btn" onClick={onCancel} disabled={pending}>Cancel</button>
      </div>
    </Card>
  );
}

/** The days of a sequence as a one-row table. */
export function SequenceTable({ plan, recipeNames }: { plan: Pick<MenuCycleDef, 'days'>; recipeNames: Record<string, string> }) {
  return (
    <table className="muse-table mt-[0.3rem]!">
      <thead><tr>{plan.days.map((d) => <th key={d.day}>Day {d.day}</th>)}</tr></thead>
      <tbody>
        <tr>
          {plan.days.map((d) => (
            <td key={d.day}>
              {d.recipeCode ? <>{d.recipeCode}<div className="muse-c-faint muse-fs-2xs">{recipeNames[d.recipeCode] ?? 'not in library'}</div></> : <span className="muse-kpi-sub">no service</span>}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
