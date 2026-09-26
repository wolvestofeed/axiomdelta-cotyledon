'use client';

import { useState } from 'react';
import { Card } from '@/app/(muse)/muse/_components/ui';
import { MARK } from '@/app/(muse)/muse/_data/mark';

/** The three things a supplier submits (Robert, 2026-09-16). Not connected yet: the fields are laid out, nothing is sent. */
export function SupplierPortalForms({ suppliers }: { suppliers: { id: string; name: string }[] }) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const notConnected = <p className="muse-kpi-sub mt-2">Not connected yet: nothing is sent or stored from this form.</p>;
  return (
    <>
      <Card title="Supplier" className="mt-4">
        <label className="muse-kpi-sub">Submitting as<br />
          <select className="muse-select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.length === 0 && <option value="">No supplier with a catalog on file</option>}
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <p className="muse-kpi-sub mt-2">A supplier login is not built; the supplier is picked here while the portal is developed.</p>
      </Card>

      <div className="grid gap-4 mt-4 muse-autofit-20">
        <Card title="Line sheet or specials">
          <div className="grid gap-[0.6rem]">
            <label className="muse-kpi-sub">Kind<br />
              <select className="muse-select"><option>New line sheet</option><option>Specials</option></select>
            </label>
            <label className="muse-kpi-sub">Effective from<br /><input type="date" className="muse-input" /></label>
            <label className="muse-kpi-sub">Effective to (specials)<br /><input type="date" className="muse-input" /></label>
            <label className="muse-kpi-sub">File<br /><input type="file" className="muse-input" disabled /></label>
            <label className="muse-kpi-sub">Notes<br /><textarea className="muse-input w-full!" rows={2} /></label>
            <button type="button" className="muse-btn primary" disabled>Upload</button>
          </div>
          {notConnected}
        </Card>

        <Card title="Submit a new item">
          <div className="grid gap-[0.6rem]">
            <label className="muse-kpi-sub">Item<br /><input className="muse-input w-full!" /></label>
            <label className="muse-kpi-sub">Variety or grade<br /><input className="muse-input w-full!" /></label>
            <label className="muse-kpi-sub">Pack size<br /><input className="muse-input" /></label>
            <label className="muse-kpi-sub">Unit<br /><select className="muse-select"><option>lb</option><option>each</option><option>case</option></select></label>
            <label className="muse-kpi-sub">Price per unit ($)<br /><input type="number" min={0} step="0.01" className="muse-input" /></label>
            <label className="muse-kpi-sub">Certifications and notes<br /><textarea className="muse-input w-full!" rows={2} /></label>
            <button type="button" className="muse-btn primary" disabled>Submit item</button>
          </div>
          {notConnected}
        </Card>

        <Card title={`${MARK.label} rating assessment`}>
          <div className="grid gap-[0.6rem]">
            <label className="muse-kpi-sub">Operation or products assessed<br /><input className="muse-input w-full!" /></label>
            <label className="muse-kpi-sub">Supporting documents<br /><input type="file" className="muse-input" multiple disabled /></label>
            <label className="muse-kpi-sub">Notes<br /><textarea className="muse-input w-full!" rows={3} /></label>
            <button type="button" className="muse-btn primary" disabled>Submit assessment</button>
          </div>
          <p className="muse-kpi-sub mt-2">{MARK.scope} Ratings are assigned by Muse Kitchen.</p>
          {notConnected}
        </Card>
      </div>
    </>
  );
}
