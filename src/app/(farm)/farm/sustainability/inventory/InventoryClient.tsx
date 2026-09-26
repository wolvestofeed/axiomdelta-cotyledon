'use client';

import { PageControls } from '@/components/PageControls';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, StatusBadge, CheckPill, num, pct } from '@/components/ui';
import { EditableNumber } from '@/components/EditableNumber';
import { SectionSave } from '@/components/SectionSave';
import { useLinkedSuppliers } from '@/components/useLinkedSuppliers';
import { factorRegistry } from '@/data/emission-factors';
import { lcaOptions as curatedOptions, type LcaOption } from '@/data/lca-options';
import { fullInventory, restatementCheck } from '@/engine/inventory';
import { AUDIT_DEFAULTS } from '@/engine/scenario';
import { useScenario } from '@/state/scenario-store';
import { useSustainabilityWorld } from '@/state/sustainability';
import { SustainabilityWorldNote } from '@/components/ledger/SustainabilityWorldNote';

export default function InventoryClient({ supplierOptions, liveLabel }: { supplierOptions: LcaOption[]; liveLabel: string | null }) {
  const { resolved, setSustainability, isSuperAdmin } = useScenario();
  const S = resolved.sustainability;
  const suppliers = useLinkedSuppliers(S.inputSupplier);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const options = useMemo(() => [...curatedOptions, ...supplierOptions], [supplierOptions]);
  // The statement on the selected ledger (Roadmap N6 slice 4): Plan the forecast's first year, Actual the reporting year's records.
  const world = useSustainabilityWorld(options);
  const asOf = !world.isPlan && today.startsWith(`${S.audit.reportingYear}-`) ? today : world.basis.to;
  const inv = useMemo(
    () => fullInventory(resolved, asOf, { basis: world.basis, energy: world.energy, refrigerantService: world.refrigerantService }, suppliers, options),
    [resolved, asOf, world.basis, world.energy, world.refrigerantService, suppliers, options],
  );
  const check = useMemo(() => restatementCheck(inv.reference.location.totalKg, inv.fingerprint, S.audit), [inv, S.audit]);
  const byStatus = useMemo(() => factorRegistry.reduce<Record<string, number>>((acc, f) => { acc[f.status] = (acc[f.status] ?? 0) + 1; return acc; }, {}), []);
  const t = (kg: number) => (kg / 1000).toFixed(2);

  const setAudit = (patch: Partial<typeof S.audit>) =>
    setSustainability((d) => {
      const a = (d.audit ??= {});
      for (const [k, v] of Object.entries(patch) as [keyof typeof S.audit, typeof S.audit[keyof typeof S.audit]][]) {
        if (v === null || v === undefined || v === AUDIT_DEFAULTS[k]) delete a[k];
        else (a as Record<string, unknown>)[k] = v;
      }
    });
  const recordBaseline = () =>
    setAudit({ baselineTotalKg: inv.reference.location.totalKg, baselineFingerprint: inv.fingerprint, baselineRecordedOn: asOf, baselineYear: S.audit.baselineYear ?? S.audit.reportingYear });

  return (
    <>
      <PageHeader
        title="Inventory & Audit"
        purpose="Assemble the year's greenhouse-gas inventory by scope, with the controls auditors check."
        functions={['Statement', 'Baseline and restatement', 'Factor registry', 'Evidence pack', 'Weakest status']}
        connects={[
          { href: '/farm/sustainability/energy', dir: 'from' },
          { href: '/farm/sustainability/refrigerants', dir: 'from' },
          { href: '/farm/sustainability/inputs', dir: 'from' },
          { href: '/farm/sustainability/logistics', dir: 'from' },
        ]}
        howItWorks={
          <ul>
            <li>The inventory is assembled from every posting in the model for the reporting year.</li>
            <li>Scope 1 is fuel burned and refrigerant leaked, Scope 2 is purchased electricity, and Scope 3 is purchased food, freight and waste.</li>
            <li>Every posting records the factor and version it used, and the factor registry carries every citation with a fingerprint of the set.</li>
            <li>Two bases run side by side: the reference basis from the study means, and the selected basis from cited or supplier figures.</li>
            <li>A recorded baseline and a materiality threshold feed the restatement check.</li>
            <li>The evidence pack exports all of it with every stored document.</li>
          </ul>
        }
        status="partial"
      />
      <PageControls group="action"><a className="farm-btn ghost" href="/farm/sustainability/inventory/evidence-pack">Evidence pack — {world.isPlan ? 'Plan' : 'Actual'}</a></PageControls>

      <SustainabilityWorldNote world={world} />

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={`${t(inv.reference.location.totalKg)} t`} label="Total, reference basis" sub="Scope 1 + 2 (location) + 3" />
        <Kpi value={`${t(inv.selected.location.totalKg)} t`} label="Total, selected basis" sub={inv.linesOnSelectedBasis ? `${inv.linesOnSelectedBasis} food line(s) on a cited or supplier figure` : 'no selections; equals the reference'} />
        <Kpi value={`${(inv.normalizers.reference.kgPerUnit ?? 0).toFixed(2)} kg`} label="CO2e per unit, reference" sub={`${num(inv.annualUnits)} units`} />
        <Kpi value={inv.weakest ? <StatusBadge status={inv.weakest} /> : '—'} label="Weakest status in the total" />
      </div>

      <Card title={`Statement — ${world.periodLabel}`} className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead><tr><th>Scope</th><th>Line</th><th className="num">t CO2e</th><th>Basis</th><th>Activity</th><th>Weakest status</th></tr></thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.category}>
                  <td className="font-medium!">{l.scope}</td>
                  <td>{l.label}</td>
                  <td className={`num ${l.kg === 0 ? 'farm-c-faint' : ''}`}>{l.kg === 0 ? '—' : (l.kg / 1000).toFixed(2)}</td>
                  <td className="farm-c-soft">{l.basis}</td>
                  <td className={`${(l.kg === 0 ? 'farm-c-faint' : 'farm-c-soft')}`}>{l.activity}</td>
                  <td>{l.weakest ? <StatusBadge status={l.weakest} /> : <span className="farm-c-faint">—</span>}</td>
                </tr>
              ))}
              <tr className="total"><td colSpan={2}>Total, reference food basis · Scope 2 location-based</td><td className="num">{t(inv.reference.location.totalKg)}</td><td colSpan={3} className="farm-c-soft">market-based {t(inv.reference.market.totalKg)}</td></tr>
              <tr className="total"><td colSpan={2}>Total, selected food basis · Scope 2 location-based</td><td className="num">{t(inv.selected.location.totalKg)}</td><td colSpan={3} className="farm-c-soft">market-based {t(inv.selected.market.totalKg)} · food gap {(inv.foodGapKg / 1000).toFixed(2)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          {world.isPlan ? <>The statement reads the working copy; the dashboard reads the last saved version ({liveLabel}) and the evidence pack reads the plan of record.</> : <>The statement reads the records in reporting year {S.audit.reportingYear}; the reporting year below sets it.</>} Empty rows mean no input has been applied, never an estimate. Freight uses invented pickupPoints and centroid distances and is tagged placeholder. Per sq ft, reference: {(inv.normalizers.reference.kgPerSqFt ?? 0).toFixed(1)} kg; per operating day: {((inv.normalizers.reference.kgPerOperatingDay ?? 0) / 1000).toFixed(2)} t.
        </p>
      </Card>

      <Card title="Baseline and restatement" className="mt-4">
        <div className="mb-3!">
          <SectionSave sections={['sustainability']} title="the audit settings" />
        </div>
        <div className="grid gap-3 farm-autofit-12">
          <div>
            <div className="farm-kpi-label">Reporting year</div>
            {isSuperAdmin ? <EditableNumber value={S.audit.reportingYear} defaultValue={AUDIT_DEFAULTS.reportingYear} onChange={(v) => setAudit({ reportingYear: Math.round(v) })} step={1} min={2020} max={2100} ariaLabel="Reporting year" /> : <div>{S.audit.reportingYear}</div>}
          </div>
          <div>
            <div className="farm-kpi-label">Baseline year</div>
            {isSuperAdmin ? <EditableNumber value={S.audit.baselineYear ?? S.audit.reportingYear} defaultValue={undefined} onChange={(v) => setAudit({ baselineYear: Math.round(v) })} step={1} min={2020} max={2100} ariaLabel="Baseline year" showBadge={false} /> : <div>{S.audit.baselineYear ?? '—'}</div>}
          </div>
          <div>
            <div className="farm-kpi-label">Materiality threshold</div>
            {isSuperAdmin ? <EditableNumber value={S.audit.materialityThreshold} defaultValue={AUDIT_DEFAULTS.materialityThreshold} onChange={(v) => setAudit({ materialityThreshold: Math.min(0.5, Math.max(0, v)) })} step={0.01} max={0.5} suffix="fraction" ariaLabel="Materiality threshold" /> : <div>{pct(S.audit.materialityThreshold, 0)}</div>}
            <div className="farm-kpi-sub">Band in practice 3–5%, unconfirmed against ISO 14064-1 §6.4.</div>
          </div>
          <div>
            <div className="farm-kpi-label">Factor fingerprint, current</div>
            <div className="farm-mono farm-fs-sm">{inv.fingerprint}</div>
            <div className="farm-kpi-sub">{num(factorRegistry.length)} factors · {num(byStatus.SOURCED ?? 0)} sourced · {num(byStatus.UNCONFIRMED ?? 0)} unconfirmed · {num(byStatus.DATED ?? 0)} dated</div>
          </div>
        </div>
        <div className="grid gap-3 mt-3 farm-autofit-12">
          <Kpi value={check.hasBaseline ? `${t(check.baselineTotalKg as number)} t` : '—'} label="Recorded baseline total" sub={S.audit.baselineRecordedOn ? `recorded ${S.audit.baselineRecordedOn} · fingerprint ${S.audit.baselineFingerprint}` : 'not recorded'} />
          <Kpi value={check.deltaShare === null ? '—' : pct(check.deltaShare, 1)} label="Recomputed vs baseline" sub={check.deltaKg === null ? '' : `${(check.deltaKg / 1000).toFixed(2)} t`} />
          <Kpi value={check.hasBaseline ? <CheckPill ok={!check.restatementIndicated} okLabel="NO RESTATEMENT INDICATED" overLabel="RESTATEMENT INDICATED" /> : '—'} label="Restatement check" sub={check.reasons.join('; ') || (check.hasBaseline ? 'within threshold; factor set unchanged' : '')} />
        </div>
        {isSuperAdmin ? (
          <div className="mt-3! flex gap-3 items-center flex-wrap">
            <button type="button" className="farm-btn" onClick={recordBaseline}>Record current reference total as the baseline</button>
            <span className="farm-kpi-sub">Stores the reference-basis total, today’s factor fingerprint and the date in the scenario. Apply to make it the live baseline.</span>
          </div>
        ) : null}
        <p className="farm-kpi-sub mt-2">
          ISO 14064-1 asks for a baseline year to be recalculated when the boundary, the method or a discovered error moves the total by more than a set materiality. The check compares today’s recomputation of the same inputs against the recorded baseline and flags a changed factor set separately.
        </p>
      </Card>

      <Card title="Factor registry" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead><tr><th>Id</th><th>Source</th><th>Version</th><th>Effective from</th><th>Status</th><th>Link</th></tr></thead>
            <tbody>
              {factorRegistry.map((f) => (
                <tr key={f.id} id={f.id}>
                  <td className="farm-mono farm-fs-xs">{f.id}</td>
                  <td>
                    <div>{f.source}</div>
                    {f.note ? <div className="farm-fs-xs farm-c-faint">{f.note}</div> : null}
                  </td>
                  <td className="farm-c-soft">{f.version}</td>
                  <td className="farm-c-soft">{f.effectiveFrom}</td>
                  <td><StatusBadge status={f.status} /></td>
                  <td><Link className="farm-link" href={`/farm/sources/by/${encodeURIComponent(f.id)}`}>registry</Link>{f.sourceUrl ? <> · <a className="farm-link" href={f.sourceUrl} target="_blank" rel="noopener noreferrer">publisher</a></> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
