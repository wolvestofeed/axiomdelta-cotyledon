'use client';

import Link from 'next/link';
import { PageHeader, Card, Kpi, StatusBadge } from '@/components/ui';
import { Cite } from '@/components/Cite';
import { SectionSave } from '@/components/SectionSave';
import { SourceLink, useDocumentSources } from '@/components/SourceLink';
import { docKey, evidenceCoverage } from '@/engine/entity-links';
import { austinEnergyRebates, refrigerantGwpAR4 } from '@/data/emission-factors';
import { countsTowardCapital } from '@/engine/equipment';
import type { EquipmentAttrs, EquipmentFuel } from '@/engine/scenario';
import { useScenario } from '@/state/scenario-store';

const FUEL_LABEL: Record<EquipmentFuel, string> = { electric: 'Electric', natural_gas: 'Natural gas', propane: 'Propane', none: 'None' };

export default function EquipmentPage() {
  const { resolved, setSustainability } = useScenario();
  const attrs = resolved.sustainability.equipment;
  const lines = resolved.equipment.filter((e) => e.phase === 1 && countsTowardCapital(e.status));
  const sources = useDocumentSources();
  const specEvidence = evidenceCoverage(
    lines.map((e) => docKey.equipmentSpec(e.key)),
    resolved.sustainability.documents,
  );
  const withAttrs = lines.filter((e) => attrs[e.key] && Object.keys(attrs[e.key]).length > 0).length;
  const circuits = lines.filter((e) => attrs[e.key]?.refrigerant && (attrs[e.key]?.chargeLbPerUnit ?? 0) > 0).length;
  const energyStar = lines.filter((e) => attrs[e.key]?.energyStar).length;
  const ratedKw = lines.reduce((s, e) => s + (attrs[e.key]?.ratedKw ?? 0) * e.qty, 0);

  const patch = (item: string, p: Partial<EquipmentAttrs>) =>
    setSustainability((d) => {
      const eq = (d.equipment ??= {});
      const row = (eq[item] ??= {});
      for (const [k, v] of Object.entries(p) as [keyof EquipmentAttrs, EquipmentAttrs[keyof EquipmentAttrs]][]) {
        if (v === undefined || v === '' || v === 'none' || v === 0 || v === false) delete row[k];
        else (row as Record<string, unknown>)[k] = v;
      }
      if (Object.keys(row).length === 0) delete eq[item];
    });

  return (
    <>
      <PageHeader
        title="Equipment & Rebates"
        purpose="Set each equipment line's energy and refrigerant attributes, and review the utility's rebate list."
        functions={['Equipment energy attributes', 'Refrigerant circuits', 'Rated draw', 'ENERGY STAR', 'Utility rebate inventory']}
        connects={[
          { href: '/farm/grow-units', dir: 'from' },
          { href: '/farm/sustainability/energy', dir: 'to' },
          { href: '/farm/sustainability/refrigerants', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Each line carries the attributes that drive its energy and refrigerant postings: fuel, rated draw, refrigerant and factory charge, installation date, and ENERGY STAR listing.</li>
            <li>A line with a refrigerant and charge becomes a circuit on the Refrigerants page.</li>
            <li>The rebate table is the utility&rsquo;s published inventory with its conditions.</li>
          </ul>
        }
        status="partial"
      />

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={`${withAttrs} / ${lines.length}`} label="Phase 1 lines with attributes" />
        <Kpi value={circuits} label="Refrigerant circuits registered" sub="Refrigerant and charge on file" />
        <Kpi value={`${ratedKw.toFixed(1)} kW`} label="Rated draw on file" sub="Sum of rated kW × units" />
        <Kpi value={energyStar} label="ENERGY STAR listed" />
        <Kpi value={`${specEvidence.rowsWithDocument} / ${specEvidence.rowsTotal}`} label="Lines with a spec sheet linked" sub="The document the attributes came from" />
      </div>

      <Card title="Equipment energy attributes — phase 1 schedule" className="mt-4">
        <div className="mb-3!">
          <SectionSave sections={['sustainability']} title="the equipment attributes" />
        </div>
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead><tr><th>Equipment</th><th>Category</th><th className="num">Qty</th><th>Fuel</th><th className="num">Rated kW / unit</th><th>Refrigerant</th><th className="num">Charge lb / unit</th><th>Installed</th><th>ENERGY STAR</th><th>Spec sheet</th></tr></thead>
            <tbody>
              {lines.map((e) => {
                const a = attrs[e.key] ?? {};
                return (
                  <tr key={e.key}>
                    <td className="font-medium!">{e.item}</td>
                    <td className="farm-c-soft">{e.category}</td>
                    <td className="num">{e.qty}</td>
                    <td>
                      <select className="farm-input farm-fs-xs min-w-24!" value={a.fuel ?? 'none'} onChange={(ev) => patch(e.key, { fuel: ev.target.value as EquipmentFuel })} aria-label={`${e.item} fuel`}>
                        {(Object.keys(FUEL_LABEL) as EquipmentFuel[]).map((f) => <option key={f} value={f}>{FUEL_LABEL[f]}</option>)}
                      </select>
                    </td>
                    <td className="num"><input type="number" min={0} step={0.1} className="farm-input farm-fs-xs min-w-24!" value={a.ratedKw ?? ''} onChange={(ev) => patch(e.key, { ratedKw: ev.target.value === '' ? undefined : Number(ev.target.value) })} aria-label={`${e.item} rated kW`} /></td>
                    <td>
                      <select className="farm-input farm-fs-xs min-w-24!" value={a.refrigerant ?? ''} onChange={(ev) => patch(e.key, { refrigerant: ev.target.value || undefined })} aria-label={`${e.item} refrigerant`}>
                        <option value="">—</option>
                        {Object.keys(refrigerantGwpAR4).map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="num"><input type="number" min={0} step={0.5} className="farm-input farm-fs-xs min-w-24!" value={a.chargeLbPerUnit ?? ''} onChange={(ev) => patch(e.key, { chargeLbPerUnit: ev.target.value === '' ? undefined : Number(ev.target.value) })} aria-label={`${e.item} charge per unit`} /></td>
                    <td><input type="date" className="farm-input farm-fs-xs min-w-24! min-w-36!" value={a.installedOn ?? ''} onChange={(ev) => patch(e.key, { installedOn: ev.target.value || undefined })} aria-label={`${e.item} installed on`} /></td>
                    <td><input type="checkbox" checked={!!a.energyStar} onChange={(ev) => patch(e.key, { energyStar: ev.target.checked })} aria-label={`${e.item} ENERGY STAR`} /></td>
                    <td>
                      <SourceLink
                        docKey={docKey.equipmentSpec(e.key)}
                        sources={sources}
                        hint="Spec sheet or nameplate photo"
                        ariaLabel={`Link the spec sheet for ${e.item}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          Attributes come from spec sheets at quotation and nameplates at installation, and each line links to that document in the registry on <Link className="farm-link" href="/farm/sources">Sources</Link> — a rated draw with no spec sheet behind it is a figure someone typed. Refrigerants offered are those with a GWP on file. Lines are the in-service and planned Phase 1 rows of the <Link className="farm-link" href="/farm/grow-units">equipment library</Link>; circuits appear on <Link className="farm-link" href="/farm/sustainability/refrigerants">Refrigerants</Link>. A manufacturer or vendor picker joins this row once a vendor directory exists; no such list is on file, and none is invented.
        </p>
      </Card>

      <Card title="Utility rebate inventory" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead><tr><th>Category</th><th>Published rebate</th><th>Condition</th></tr></thead>
            <tbody>
              {austinEnergyRebates.lines.map((r) => (
                <tr key={r.category}>
                  <td className="font-medium!">{r.category}</td>
                  <td>{r.rebate}</td>
                  <td className="farm-c-soft">{r.condition}</td>
                </tr>
              ))}
              <tr><td className="font-medium!">Bonus</td><td colSpan={2}>{austinEnergyRebates.bonus}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          <Cite p={austinEnergyRebates.provenance} /> <StatusBadge status={austinEnergyRebates.provenance.status} title={austinEnergyRebates.provenance.note} />. Amounts as published for the programme year on file; eligibility is the utility’s determination.
        </p>
      </Card>
    </>
  );
}
