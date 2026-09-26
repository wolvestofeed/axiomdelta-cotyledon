'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, StatusBadge, num, pct } from '@/components/ui';
import { Cite } from '@/components/Cite';
import { EditableNumber } from '@/components/EditableNumber';
import { SectionSave } from '@/components/SectionSave';
import { SourceLink, useDocumentSources } from '@/components/SourceLink';
import { docKey, evidenceCoverage } from '@/engine/entity-links';
import { combustionFactors, gridFactorERCT, gwpAR5 } from '@/data/emission-factors';
import { energyInventory, normalize } from '@/engine/carbon';
import { ENERGY_DEFAULTS, type EnergyActivity } from '@/engine/scenario';
import { READING_METRICS } from '@/engine/sustainability-records';
import { useScenario } from '@/state/scenario-store';
import { useSustainabilityWorld } from '@/state/sustainability';
import { SustainabilityWorldNote } from '@/components/ledger/SustainabilityWorldNote';
import { SustainabilityReadingsCard } from '@/components/SustainabilityReadingsCard';

const INPUTS: { key: keyof EnergyActivity; label: string; unit: string; step: number; note: string }[] = [
  { key: 'naturalGasTherms', label: 'Natural gas', unit: 'therms / yr', step: 10, note: 'Gas invoices; therms or ccf on the bill' },
  { key: 'propaneGal', label: 'Propane (liquid)', unit: 'gal / yr', step: 10, note: 'Distribution tickets' },
  { key: 'fleetGasolineGal', label: 'Fleet gasoline', unit: 'gal / yr', step: 10, note: 'Fuel log or card statement' },
  { key: 'fleetDieselGal', label: 'Fleet diesel', unit: 'gal / yr', step: 10, note: 'Fuel log or card statement' },
  { key: 'electricityKwh', label: 'Electricity', unit: 'kWh / yr', step: 100, note: 'Electric invoices' },
];

export default function EnergyPage() {
  const { resolved, setSustainability } = useScenario();
  const world = useSustainabilityWorld();
  // Plan: the quantities loaded into the forecast. Actual: the year's bills (Roadmap N6 slice 4).
  const e = world.energy;
  const year = resolved.sustainability.audit.reportingYear;
  const energyRecords = (world.records?.readings ?? []).filter((r) => READING_METRICS[r.metric]?.group === 'energy' && r.readOn.startsWith(`${year}-`));
  const sources = useDocumentSources();
  const evidence = evidenceCoverage(
    [...INPUTS.map((i) => docKey.energy(i.key)), docKey.energy('renewableShare')],
    resolved.sustainability.documents,
  );
  const inv = useMemo(() => energyInventory(e), [e]);
  const units = world.basis.totalUnits;
  const nLoc = normalize(inv.location.totalKg, { units, sqFt: resolved.facilitySqFt ?? undefined });
  const fuels = Object.values(combustionFactors);

  const set = (key: keyof EnergyActivity, value: number) =>
    setSustainability((d) => {
      const en = (d.energy ??= {});
      if (value === ENERGY_DEFAULTS[key]) delete en[key];
      else en[key] = value;
    });

  return (
    <>
      <PageHeader
        title="Energy (Scope 1 & 2)"
        purpose="Measure the year's fuel and electricity emissions, planned or billed."
        functions={['Scope 1', 'Scope 2', 'Annual activity inputs', 'Postings', 'Factors on file']}
        connects={[
          { href: '/farm/sustainability/equipment', dir: 'from' },
          { href: '/farm/sustainability/inventory', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Scope 1 is fuel burned on pickup point and in the fleet over the year.</li>
            <li>Purchased electricity is reported two ways: location-based on the grid&rsquo;s actual mix, and market-based after any renewable supply or certificates.</li>
            <li>On Plan the quantities are the ones loaded into the forecast. On Actual they are the bills on record.</li>
            <li>Every posting records the factor and version it used.</li>
          </ul>
        }
        status="partial"
      />

      <SustainabilityWorldNote world={world} />

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={`${(inv.location.scope1Kg / 1000).toFixed(2)} t`} label="Scope 1 / yr" sub="Stationary and mobile combustion" />
        <Kpi value={`${(inv.location.scope2Kg / 1000).toFixed(2)} t`} label="Scope 2 / yr, location-based" sub="Grid mix" />
        <Kpi value={`${(inv.market.scope2Kg / 1000).toFixed(2)} t`} label="Scope 2 / yr, market-based" sub={`${pct(e.renewableShare, 0)} renewable supply`} />
        <Kpi value={nLoc.kgPerUnit !== undefined ? `${nLoc.kgPerUnit.toFixed(3)} kg` : '—'} label="Scope 1 + 2 per unit" sub={`Location-based, ${num(units)} units distributed`} />
        {world.isPlan ? (
          <Kpi value={`${evidence.rowsWithDocument} / ${evidence.rowsTotal}`} label="Inputs with a document linked" sub="Invoices and distribution tickets on file" />
        ) : (
          <Kpi value={`${energyRecords.filter((r) => r.sourceId).length} / ${energyRecords.length}`} label="Bills with a document linked" sub={`Reporting year ${year}`} />
        )}
      </div>

      {world.isPlan ? (
      <Card title="Annual activity inputs — loaded into the forecast" className="mt-4">
        <div className="mb-3!">
          <SectionSave sections={['sustainability']} title="the energy inputs" />
        </div>
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead><tr><th>Input</th><th className="num">Quantity</th><th>Scope</th><th>Source document</th></tr></thead>
            <tbody>
              {INPUTS.map((i) => (
                <tr key={i.key}>
                  <td className="font-medium!">{i.label}</td>
                  <td className="num">
                    <EditableNumber value={e[i.key]} defaultValue={ENERGY_DEFAULTS[i.key]} onChange={(v) => set(i.key, v)} step={i.step} suffix={i.unit} ariaLabel={`${i.label} annual quantity`} />
                  </td>
                  <td className="farm-c-soft">{i.key === 'electricityKwh' ? '2, both methods' : i.key.startsWith('fleet') ? '1, mobile' : '1, stationary'}</td>
                  <td>
                    <SourceLink
                      docKey={docKey.energy(i.key)}
                      sources={sources}
                      hint={i.note}
                      ariaLabel={`Link the document behind the ${i.label.toLowerCase()} figure`}
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td className="font-medium!">Renewable share of kWh</td>
                <td className="num">
                  <EditableNumber value={e.renewableShare} defaultValue={0} onChange={(v) => set('renewableShare', Math.min(1, Math.max(0, v)))} step={0.05} max={1} suffix="0–1" ariaLabel="Renewable share of electricity" />
                </td>
                <td className="farm-c-soft">2, market-based only</td>
                <td>
                  <SourceLink
                    docKey={docKey.energy('renewableShare')}
                    sources={sources}
                    hint="Utility renewable programme enrolment or certificates"
                    ariaLabel="Link the document behind the renewable share"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          {inv.hasActivity ? 'Typed quantities are the operator’s own input and carry the "Your input" mark; the postings below are computed from them.' : 'No activity entered. The farm has no utility history yet; quantities entered here are the operator’s input until bills exist.'}
          {' '}Each row links to the document it came from, searched from the registry on{' '}
          <Link className="farm-link" href="/farm/sources">Sources</Link>. The link is part of the
          scenario, so a saved forecast carries its own evidence trail.
        </p>
      </Card>
      ) : (
        <>
          <Card title={`The year from the bills — ${year}`} className="mt-4">
            <div className="farm-scroll-x">
              <table className="farm-table">
                <thead><tr><th>Input</th><th className="num">Quantity</th><th>Scope</th></tr></thead>
                <tbody>
                  {INPUTS.map((i) => (
                    <tr key={i.key}><td className="font-medium!">{i.label}</td><td className="num">{num(e[i.key], 1)} {i.unit.replace(' / yr', '')}</td><td className="farm-c-soft">{i.key === 'electricityKwh' ? '2, both methods' : i.key.startsWith('fleet') ? '1, mobile' : '1, stationary'}</td></tr>
                  ))}
                  <tr><td className="font-medium!">Renewable share of kWh</td><td className="num">{pct(e.renewableShare, 0)}</td><td className="farm-c-soft">2, market-based only</td></tr>
                </tbody>
              </table>
            </div>
          </Card>
          <SustainabilityReadingsCard group="energy" records={world.records} year={year} onChanged={world.reload} />
        </>
      )}

      <Card title="Postings" className="mt-4">
        {inv.postings.length === 0 ? (
          <p className="farm-kpi-sub">No postings; enter a quantity above.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead><tr><th>Category</th><th>Scope</th><th className="num">CO2 kg</th><th className="num">CH4 kg</th><th className="num">N2O kg</th><th className="num">CO2e kg</th><th>Basis</th><th>Factor</th><th>Status</th></tr></thead>
              <tbody>
                {inv.postings.map((p) => (
                  <tr key={`${p.activityId}-${p.scope2Method ?? ''}`}>
                    <td className="font-medium!">{p.category}{p.scope2Method ? ` (${p.scope2Method}-based)` : ''}</td>
                    <td>{p.scope}</td>
                    <td className="num">{num(p.co2Kg, 1)}</td>
                    <td className="num">{p.ch4Kg.toFixed(3)}</td>
                    <td className="num">{p.n2oKg.toFixed(3)}</td>
                    <td className="num">{num(p.co2eKg, 1)}</td>
                    <td className="farm-c-soft">{p.gwpBasis}</td>
                    <td className="farm-mono farm-fs-2xs farm-c-faint">{p.factorId} · {p.factorVersion}</td>
                    <td><StatusBadge status={p.factorStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="farm-kpi-sub mt-2">
          The statement on <Link className="farm-link" href="/farm/sustainability/inventory">Inventory &amp; Audit</Link> carries these totals on the same ledger. Weakest factor status in the location-based total: {inv.location.weakestFactorStatus ? <StatusBadge status={inv.location.weakestFactorStatus} /> : '—'}.
        </p>
      </Card>

      <Card title="Factors on file" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead><tr><th>Fuel or grid</th><th className="num">Heat content</th><th className="num">CO2</th><th className="num">CH4</th><th className="num">N2O</th><th>Status</th><th>Cite</th></tr></thead>
            <tbody>
              {fuels.map((f) => (
                <tr key={f.fuel}>
                  <td className="font-medium!">{f.label}</td>
                  <td className="num">{f.heatContentMmbtuPerUnit} MMBtu / {f.heatContentUnit}</td>
                  <td className="num">{f.co2KgPerMmbtu.toFixed(2)} kg / MMBtu</td>
                  <td className="num">{f.ch4GPerMmbtu.toFixed(2)} g / MMBtu</td>
                  <td className="num">{f.n2oGPerMmbtu.toFixed(2)} g / MMBtu</td>
                  <td><StatusBadge status={f.provenance.status} title={f.provenance.note} /></td>
                  <td><Cite p={f.provenance} /></td>
                </tr>
              ))}
              <tr>
                <td className="font-medium!">{gridFactorERCT.label}</td>
                <td className="num">—</td>
                <td className="num">{gridFactorERCT.co2LbPerMwh} lb / MWh</td>
                <td className="num">{gridFactorERCT.ch4LbPerMwh} lb / MWh</td>
                <td className="num">{gridFactorERCT.n2oLbPerMwh} lb / MWh</td>
                <td><StatusBadge status={gridFactorERCT.provenance.status} title={gridFactorERCT.provenance.note} /></td>
                <td><Cite p={gridFactorERCT.provenance} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          Gases convert to CO2e at AR5 100-year potentials, CH4 {gwpAR5.CH4} and N2O {gwpAR5.N2O} (<Cite p={gwpAR5.provenance} />). Gasoline and diesel CH4 and N2O are stationary values; per-mile vehicle factors are a separate table not yet on file.
        </p>
      </Card>
    </>
  );
}
