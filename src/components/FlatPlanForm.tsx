'use client';

import { useState } from 'react';
import { Card } from '@/components/ui';
import { CROP_PLAN_STATUS_LABELS, type CropPlanDef } from '@/data/plan-data';
import { DEFAULT_WEEKDAYS, WEEKDAY_LABELS, type SubscriptionCycleDef, type SubscriptionCycleStatus } from '@/data/subscription-cycles';

/**
 * The form for a crop plan sequence — a saved subscription cycle or a subscriber's flat plan
 * (Roadmap N4a). One shape for both; the page decides where a save goes (the
 * record, or the open forecast). `channel` limits the crop plans offered to the
 * ones listed on the subscriber's channel; a saved cycle offers every crop plan.
 */

export interface SequenceValues {
  name: string;
  startDate: string;
  endDate: string | null;
  lengthDays: number;
  weekdays: number[];
  status: SubscriptionCycleStatus;
  notes: string | null;
  subscriberServiceId: string | null;
  days: { day: number; cropPlanCode: string | null }[];
}

export const valuesOf = (c: SubscriptionCycleDef): SequenceValues => ({
  name: c.name,
  startDate: c.startDate,
  endDate: c.endDate,
  lengthDays: c.lengthDays,
  weekdays: [...c.weekdays],
  status: c.status,
  notes: c.notes,
  subscriberServiceId: c.subscriberServiceId,
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
  subscriberServiceId: null,
  days: [],
});

export function FlatPlanForm({
  title,
  initial,
  cropPlans,
  channel = null,
  services = [],
  pending = false,
  onSave,
  onCancel,
  children,
}: {
  title: string;
  initial: SequenceValues;
  cropPlans: readonly CropPlanDef[];
  /** The subscriber's channel: only crop plans listed on it are offered. Null = every crop plan (a saved cycle). */
  channel?: number | null;
  /** The subscriber's services, for a plan that serves one service only. Empty = no service scope offered. */
  services?: readonly { id: string; label: string }[];
  pending?: boolean;
  onSave: (values: SequenceValues) => void;
  onCancel: () => void;
  /** Extra controls under the sequence — the apply-to picker on a saved cycle. */
  children?: React.ReactNode;
}) {
  const [f, setF] = useState<SequenceValues>(initial);
  const byDay = new Map(f.days.map((d) => [d.day, d.cropPlanCode]));
  const offered = channel === null ? cropPlans : cropPlans.filter((r) => r.channels.includes(channel));
  const set = (patch: Partial<SequenceValues>) => setF({ ...f, ...patch });
  const setDay = (day: number, cropPlanCode: string | null) =>
    set({ days: [...f.days.filter((d) => d.day !== day), { day, cropPlanCode }].sort((a, b) => a.day - b.day) });

  function save() {
    const days = Array.from({ length: f.lengthDays }, (_, i) => i + 1).map((day) => ({ day, cropPlanCode: byDay.get(day) ?? null }));
    onSave({ ...f, name: f.name.trim(), notes: f.notes?.trim() || null, days });
  }

  return (
    <Card title={title} className="mt-4">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="farm-kpi-sub">Name<br /><input className="farm-input w-56!" value={f.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="farm-kpi-sub">Start date (day 1)<br /><input className="farm-input" type="date" value={f.startDate} onChange={(e) => e.target.value && set({ startDate: e.target.value })} /></label>
        <label className="farm-kpi-sub">End date (blank = open)<br /><input className="farm-input" type="date" value={f.endDate ?? ''} onChange={(e) => set({ endDate: e.target.value || null })} /></label>
        <label className="farm-kpi-sub">Length (service days)<br /><input className="farm-input w-26!" type="number" min={1} max={60} value={f.lengthDays} onChange={(e) => set({ lengthDays: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} /></label>
        <div className="farm-kpi-sub">Advances on<br />
          <span className="inline-flex gap-2 mt-[0.2rem]!">
            {WEEKDAY_LABELS.map((w, i) => (
              <label key={w} className="inline-flex! gap-[0.2rem]! items-center!">
                <input type="checkbox" checked={f.weekdays.includes(i)} onChange={(e) => set({ weekdays: e.target.checked ? [...f.weekdays, i].sort() : f.weekdays.filter((x) => x !== i) })} />{w}
              </label>
            ))}
          </span>
        </div>
        {services.length > 0 && (
          <label className="farm-kpi-sub">Serves<br />
            <select className="farm-select" value={f.subscriberServiceId ?? ''} onChange={(e) => set({ subscriberServiceId: e.target.value || null })}>
              <option value="">Every service</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.label} only</option>)}
            </select>
          </label>
        )}
        <label className="farm-kpi-sub">Status<br />
          <select className="farm-select" value={f.status} onChange={(e) => set({ status: e.target.value as SubscriptionCycleStatus })}>
            <option value="active">active</option><option value="inactive">inactive</option>
          </select>
        </label>
        <label className="farm-kpi-sub flex-1! min-w-56!">Notes<br /><input className="farm-input w-full!" value={f.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></label>
      </div>
      <div className="farm-scroll-x mt-3!">
        <table className="farm-table">
          <thead><tr><th>Day</th><th>Crop plan served</th></tr></thead>
          <tbody>
            {Array.from({ length: f.lengthDays }, (_, i) => i + 1).map((d) => (
              <tr key={d}>
                <td>Day {d}</td>
                <td>
                  <select className="farm-select" value={byDay.get(d) ?? ''} onChange={(e) => setDay(d, e.target.value || null)}>
                    <option value="">No service</option>
                    {offered.map((r) => <option key={r.code} value={r.code}>{r.code} — {r.name} · {CROP_PLAN_STATUS_LABELS[r.status]}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {children}
      <div className="flex gap-2 mt-3!">
        <button type="button" className="farm-btn primary" onClick={save} disabled={pending || !f.name.trim() || f.weekdays.length === 0}>Save</button>
        <button type="button" className="farm-btn" onClick={onCancel} disabled={pending}>Cancel</button>
      </div>
    </Card>
  );
}

/** The days of a sequence as a one-row table. */
export function SequenceTable({ plan, cropPlanNames }: { plan: Pick<SubscriptionCycleDef, 'days'>; cropPlanNames: Record<string, string> }) {
  return (
    <table className="farm-table mt-[0.3rem]!">
      <thead><tr>{plan.days.map((d) => <th key={d.day}>Day {d.day}</th>)}</tr></thead>
      <tbody>
        <tr>
          {plan.days.map((d) => (
            <td key={d.day}>
              {d.cropPlanCode ? <>{d.cropPlanCode}<div className="farm-c-faint farm-fs-2xs">{cropPlanNames[d.cropPlanCode] ?? 'not in library'}</div></> : <span className="farm-kpi-sub">no service</span>}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
