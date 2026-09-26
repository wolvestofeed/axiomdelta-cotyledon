'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createSupplierLcaOption, deleteSupplierLcaOption } from '../_lib/supplier-lca-actions';
import { SupplierPicker } from './SupplierPicker';
import { EntityPicker } from './EntityPicker';
import { useLinkedSuppliers } from './useLinkedSuppliers';
import { useLinkedEntity } from './useLinkedEntities';
import { entityRef } from '../_engine/entity-links';
import { BOUNDARY_LABEL, type LcaBoundary } from '../_data/lca-options';

/**
 * Super-admin form to record a supplier-specific figure. Both references — the
 * operation the figure belongs to and the document it comes from — are searchable
 * pickers over their directory, not selects: the sources registry is already long
 * enough that a select is the wrong control.
 */
export function SupplierLcaForm({ ingredients }: { ingredients: string[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
  const linked = useLinkedSuppliers(supplierId ? { pick: supplierId } : {});
  const [sourceId, setSourceId] = useState<string | undefined>(undefined);
  const linkedSource = useLinkedEntity(sourceId ? entityRef('source', sourceId) : undefined);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    if (!supplierId) {
      setMsg({ kind: 'err', text: 'Link a supplier first.' });
      return;
    }
    start(async () => {
      const res = await createSupplierLcaOption({ ...data, supplierId, sourceId: sourceId ?? '' });
      if (res.ok) {
        setMsg({ kind: 'ok', text: 'Recorded.' });
        form.reset();
        setSupplierId(undefined);
        setSourceId(undefined);
        router.refresh();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  return (
    <form onSubmit={onSubmit} className="muse-card mt-4">
      <div className="muse-card-title">Record a supplier figure</div>
      <div className="grid gap-3 muse-autofit-14">
        <div className="muse-field">
          <span className="muse-kpi-label">Supplier</span>
          <SupplierPicker ingredient="this figure" linked={supplierId ? linked[supplierId] ?? null : null} canEdit onLink={setSupplierId} />
        </div>
        <label className="muse-field">
          <span className="muse-kpi-label">Ingredient</span>
          <select name="ingredient" className="muse-input" required defaultValue="">
            <option value="" disabled>Choose…</option>
            {ingredients.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </label>
        <label className="muse-field">
          <span className="muse-kpi-label">Figure label</span>
          <input name="label" className="muse-input" required maxLength={200} placeholder="e.g. 2025 ranch LCA, net" />
        </label>
        <label className="muse-field">
          <span className="muse-kpi-label">kg CO2e per kg</span>
          <input name="kgCo2ePerKg" type="number" step="0.01" className="muse-input" required />
        </label>
        <label className="muse-field">
          <span className="muse-kpi-label">Unit note</span>
          <input name="unitNote" className="muse-input" maxLength={120} placeholder="per kg fresh meat" />
        </label>
        <label className="muse-field">
          <span className="muse-kpi-label">Boundary</span>
          <select name="boundary" className="muse-input" defaultValue="farm_gate">
            {(Object.keys(BOUNDARY_LABEL) as LcaBoundary[]).map((b) => <option key={b} value={b}>{BOUNDARY_LABEL[b]}</option>)}
          </select>
        </label>
        <div className="muse-field">
          <span className="muse-kpi-label">Document (registered source)</span>
          <EntityPicker
            kinds={['source']}
            linked={linkedSource}
            canEdit
            label="document"
            ariaLabel="Search registered sources for this figure's document"
            placeholder="Search title, publisher, kind…"
            onLink={setSourceId}
          />
        </div>
        <label className="muse-field">
          <span className="muse-kpi-label">Status</span>
          <select name="status" className="muse-input" defaultValue="STATED">
            <option value="SOURCED">Sourced — document on file</option>
            <option value="STATED">Stated — supplier’s word</option>
            <option value="UNCONFIRMED">Unconfirmed</option>
            <option value="PLACEHOLDER">Placeholder</option>
            <option value="DATED">Dated</option>
          </select>
        </label>
        <label className="muse-field col-span-full!">
          <span className="muse-kpi-label">Note</span>
          <textarea name="note" rows={2} maxLength={1000} className="muse-input" placeholder="Method, year, allocation, who prepared it" />
        </label>
      </div>
      <div className="flex items-center gap-3 mt-3! flex-wrap">
        <button type="submit" className="muse-btn" disabled={pending}>{pending ? 'Saving…' : 'Record'}</button>
        {msg ? <span className={`muse-kpi-sub ${(msg.kind === 'ok' ? 'muse-c-sourced' : 'muse-c-over')}`}>{msg.text}</span> : null}
      </div>
    </form>
  );
}

export function DeleteSupplierLcaButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="muse-btn muse-fs-xs" disabled={pending} onClick={() => start(async () => { await deleteSupplierLcaOption(id); router.refresh(); })}>
      Remove
    </button>
  );
}
