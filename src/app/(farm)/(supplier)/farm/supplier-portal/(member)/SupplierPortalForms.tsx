'use client';

import { useState } from 'react';
import { Card } from '@/components/ui';

/** The two things a supplier submits. Not connected yet: the fields are laid out, nothing is sent. */
export function SupplierPortalForms({ suppliers }: { suppliers: { id: string; name: string }[] }) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const notConnected = <p className="farm-kpi-sub mt-2">Not connected yet: nothing is sent or stored from this form.</p>;
  return (
    <>
      <Card title="Supplier" className="mt-4">
        <label className="farm-kpi-sub">Submitting as<br />
          <select className="farm-select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.length === 0 && <option value="">No supplier with a catalog on file</option>}
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <p className="farm-kpi-sub mt-2">A supplier login is not built; the supplier is picked here while the portal is developed.</p>
      </Card>

      <div className="grid gap-4 mt-4 farm-autofit-20">
        <Card title="Line sheet or specials">
          <div className="grid gap-[0.6rem]">
            <label className="farm-kpi-sub">Kind<br />
              <select className="farm-select"><option>New line sheet</option><option>Specials</option></select>
            </label>
            <label className="farm-kpi-sub">Effective from<br /><input type="date" className="farm-input" /></label>
            <label className="farm-kpi-sub">Effective to (specials)<br /><input type="date" className="farm-input" /></label>
            <label className="farm-kpi-sub">File<br /><input type="file" className="farm-input" disabled /></label>
            <label className="farm-kpi-sub">Notes<br /><textarea className="farm-input w-full!" rows={2} /></label>
            <button type="button" className="farm-btn primary" disabled>Upload</button>
          </div>
          {notConnected}
        </Card>

        <Card title="Submit a new item">
          <div className="grid gap-[0.6rem]">
            <label className="farm-kpi-sub">Item<br /><input className="farm-input w-full!" /></label>
            <label className="farm-kpi-sub">Variety or grade<br /><input className="farm-input w-full!" /></label>
            <label className="farm-kpi-sub">Pack size<br /><input className="farm-input" /></label>
            <label className="farm-kpi-sub">Unit<br /><select className="farm-select"><option>lb</option><option>each</option><option>case</option></select></label>
            <label className="farm-kpi-sub">Price per unit ($)<br /><input type="number" min={0} step="0.01" className="farm-input" /></label>
            <label className="farm-kpi-sub">Certifications and notes<br /><textarea className="farm-input w-full!" rows={2} /></label>
            <button type="button" className="farm-btn primary" disabled>Submit item</button>
          </div>
          {notConnected}
        </Card>
      </div>
    </>
  );
}
