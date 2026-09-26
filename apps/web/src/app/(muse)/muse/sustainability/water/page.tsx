'use client';

import { useMemo, useState } from 'react';
import { PageHeader, Card, Kpi, CheckPill, StatusBadge, money, num } from '../../_components/ui';
import { Cite } from '../../_components/Cite';
import { EditableNumber } from '../../_components/EditableNumber';
import { SectionSave } from '../../_components/SectionSave';
import { SourceLink, useDocumentSources } from '../../_components/SourceLink';
import { docKey, evidenceCoverage } from '../../_engine/entity-links';
import { austinWaterEffluent } from '../../_data/emission-factors';
import { waterProjection } from '../../_engine/carbon';
import { WATER_DEFAULTS, type WaterActivity } from '../../_engine/scenario';
import { READING_METRICS } from '../../_engine/sustainability-records';
import { useScenario } from '../../_state/scenario-store';
import { useSustainabilityWorld } from '../../_state/sustainability';
import { SustainabilityWorldNote } from '../../_components/ledger/SustainabilityWorldNote';
import { SustainabilityReadingsCard } from '../../_components/SustainabilityReadingsCard';

type NumKey = Exclude<keyof WaterActivity, 'greaseTrapLastPumpOut'>;

const DOC_ROWS: { field: string; hint: string; label: string }[] = [
  { field: 'meteredGalPerMonth', hint: 'Water invoice', label: 'metered water' },
  { field: 'billedWastewaterMGalPerMonth', hint: 'Wastewater invoice; a share of metered water', label: 'billed wastewater volume' },
  { field: 'bodMgL', hint: 'Sampling lab report', label: 'BOD result' },
  { field: 'tssMgL', hint: 'Sampling lab report', label: 'TSS result' },
  { field: 'codMgL', hint: 'Sampling lab report', label: 'COD result' },
  { field: 'fogMgL', hint: 'Sampling lab report; discharge limit, not surcharged', label: 'FOG result' },
  { field: 'greaseTrapLastPumpOut', hint: 'Hauler manifest', label: 'grease-trap pump-out' },
  { field: 'greaseTrapFill', hint: 'Inspection log', label: 'grease-trap fill' },
];

const pctText = (v: number) => `${Math.round(v * 100)}%`;

export default function WaterPage() {
  const { resolved, setSustainability } = useScenario();
  const world = useSustainabilityWorld();
  // Plan: the quantities loaded into the forecast. Actual: the year's bills, lab results and inspections (Roadmap N6 slice 4).
  const w = world.water;
  const year = resolved.sustainability.audit.reportingYear;
  const waterRecords = (world.records?.readings ?? []).filter((r) => READING_METRICS[r.metric]?.group === 'water' && r.readOn.startsWith(`${year}-`));
  const sources = useDocumentSources();
  const evidence = evidenceCoverage(
    DOC_ROWS.map((r) => docKey.water(r.field)),
    resolved.sustainability.documents,
  );
  const docCell = (field: string) => {
    const row = DOC_ROWS.find((r) => r.field === field)!;
    return (
      <SourceLink
        docKey={docKey.water(field)}
        sources={sources}
        hint={row.hint}
        ariaLabel={`Link the document behind the ${row.label}`}
      />
    );
  };
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  // The trap's due date reads today on Actual in the current year, else the period's end.
  const asOf = !world.isPlan && today.startsWith(`${year}-`) ? today : world.basis.to;
  const meals = world.basis.totalMeals;
  const proj = useMemo(() => waterProjection(w, meals, asOf), [w, meals, asOf]);
  const lim = austinWaterEffluent;

  const setNum = (key: NumKey, value: number) =>
    setSustainability((d) => {
      const wa = (d.water ??= {});
      if (value === WATER_DEFAULTS[key]) delete wa[key];
      else wa[key] = value;
    });
  const setDate = (value: string) =>
    setSustainability((d) => {
      const wa = (d.water ??= {});
      if (!value) delete wa.greaseTrapLastPumpOut;
      else wa.greaseTrapLastPumpOut = value;
    });

  const s = proj.surchargeMonthly;

  return (
    <>
      <PageHeader
        title="Water & Effluent"
        purpose="Project the city's wastewater surcharge from metered water and lab results."
        functions={['Monthly inputs', 'Water per meal', 'Grease trap', 'Surcharge projection']}
        howItWorks={
          <ul>
            <li>Metered water in, wastewater strength out.</li>
            <li>The city applies a surcharge when a sample exceeds normal-strength limits, on one of two formulas chosen by the ratio of COD to BOD.</li>
            <li>Enter the month&rsquo;s volumes and the latest lab result. The projection applies the city&rsquo;s own formula and unit charges.</li>
          </ul>
        }
        status="partial"
      />

      <SustainabilityWorldNote world={world} />

      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={s ? money(s.surcharge) : '—'} label="Projected surcharge / month" sub={s ? `${s.branch === 'BOD' ? 'Biochemical oxygen demand' : 'Chemical oxygen demand'} formula, COD ÷ BOD ${s.codToBodRatio.toFixed(2)}` : 'needs a sample and a billed volume'} />
        <Kpi value={s ? money(proj.surchargeAnnual, 0) : '—'} label="Projected surcharge / yr" sub="Month × 12 at this strength" />
        <Kpi value={proj.galPerMeal !== null ? `${proj.galPerMeal.toFixed(1)} gal` : '—'} label="Water per meal" sub={`${num(proj.annualMeteredGal)} gal over ${num(meals)} meals delivered`} />
        <Kpi value={proj.greaseTrap ? <CheckPill ok={!proj.greaseTrap.intervalExceeded && !proj.greaseTrap.fillTriggered} okLabel="OK" overLabel="DUE" /> : '—'} label="Grease trap" sub={proj.greaseTrap ? `next due ${proj.greaseTrap.nextDueBy}` : 'no pump-out date on file'} />
        {world.isPlan ? (
          <Kpi value={`${evidence.rowsWithDocument} / ${evidence.rowsTotal}`} label="Inputs with a document linked" sub="Invoices, lab reports, manifests" />
        ) : (
          <Kpi value={`${waterRecords.filter((r) => r.sourceId).length} / ${waterRecords.length}`} label="Records with a document linked" sub={`Reporting year ${year}`} />
        )}
      </div>

      {world.isPlan ? (
      <Card title="Monthly inputs and latest sample — loaded into the forecast" className="mt-4">
        <div className="mb-3!">
          <SectionSave sections={['sustainability']} title="the water inputs" />
        </div>
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead><tr><th>Input</th><th className="num">Value</th><th className="num">Limit</th><th>Source document</th></tr></thead>
            <tbody>
              <tr><td className="font-medium!">Metered water</td><td className="num"><EditableNumber value={w.meteredGalPerMonth} defaultValue={0} onChange={(v) => setNum('meteredGalPerMonth', v)} step={100} suffix="gal / month" ariaLabel="Metered water per month" /></td><td className="num">—</td><td>{docCell('meteredGalPerMonth')}</td></tr>
              <tr><td className="font-medium!">Billed wastewater volume</td><td className="num"><EditableNumber value={w.billedWastewaterMGalPerMonth} defaultValue={0} onChange={(v) => setNum('billedWastewaterMGalPerMonth', v)} step={0.01} suffix="million gal / month" ariaLabel="Billed wastewater volume per month" /></td><td className="num">—</td><td>{docCell('billedWastewaterMGalPerMonth')}</td></tr>
              <tr><td className="font-medium!">Biochemical oxygen demand (BOD)</td><td className="num"><EditableNumber value={w.bodMgL} defaultValue={0} onChange={(v) => setNum('bodMgL', v)} step={10} suffix="mg/L" ariaLabel="BOD" /></td><td className="num">{lim.limits.bodMgL}</td><td>{docCell('bodMgL')}</td></tr>
              <tr><td className="font-medium!">Total suspended solids (TSS)</td><td className="num"><EditableNumber value={w.tssMgL} defaultValue={0} onChange={(v) => setNum('tssMgL', v)} step={10} suffix="mg/L" ariaLabel="TSS" /></td><td className="num">{lim.limits.tssMgL}</td><td>{docCell('tssMgL')}</td></tr>
              <tr><td className="font-medium!">Chemical oxygen demand (COD)</td><td className="num"><EditableNumber value={w.codMgL} defaultValue={0} onChange={(v) => setNum('codMgL', v)} step={10} suffix="mg/L" ariaLabel="COD" /></td><td className="num">{lim.limits.codMgL}</td><td>{docCell('codMgL')}</td></tr>
              <tr><td className="font-medium!">Fats, oils and grease (FOG)</td><td className="num"><EditableNumber value={w.fogMgL} defaultValue={0} onChange={(v) => setNum('fogMgL', v)} step={10} suffix="mg/L" ariaLabel="FOG" /></td><td className="num">{lim.limits.fogMgL} instantaneous</td><td>{docCell('fogMgL')}</td></tr>
              <tr><td className="font-medium!">Grease-trap last pump-out</td><td className="num"><input type="date" className="muse-input muse-fs-sm" value={w.greaseTrapLastPumpOut} onChange={(ev) => setDate(ev.target.value)} aria-label="Grease trap last pump-out date" /></td><td className="num">every {lim.greaseTrap.maxIntervalDays} days</td><td>{docCell('greaseTrapLastPumpOut')}</td></tr>
              <tr><td className="font-medium!">Grease-trap fill</td><td className="num"><EditableNumber value={w.greaseTrapFill} defaultValue={0} onChange={(v) => setNum('greaseTrapFill', Math.min(1, Math.max(0, v)))} step={0.05} max={1} suffix="of wetted height" ariaLabel="Grease trap fill fraction" /></td><td className="num">pump at {Math.round(lim.greaseTrap.pumpOutFillFraction * 100)}%</td><td>{docCell('greaseTrapFill')}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2">
          A surcharge is computed from a lab result, so the result should name the report it came from.
          Each row links to its document in the registry on Sources; the link is part of the scenario.
        </p>
      </Card>
      ) : (
        <>
          <Card title={`The year from the records — ${year}`} className="mt-4">
            <div className="muse-scroll-x">
              <table className="muse-table">
                <thead><tr><th>Input</th><th className="num">Value</th><th className="num">Limit</th></tr></thead>
                <tbody>
                  <tr><td className="font-medium!">Metered water, a month</td><td className="num">{num(w.meteredGalPerMonth)} gal</td><td className="num">—</td></tr>
                  <tr><td className="font-medium!">Billed wastewater volume, a month</td><td className="num">{w.billedWastewaterMGalPerMonth.toFixed(3)} million gal</td><td className="num">—</td></tr>
                  <tr><td className="font-medium!">BOD, latest</td><td className="num">{num(w.bodMgL)} mg/L</td><td className="num">{lim.limits.bodMgL}</td></tr>
                  <tr><td className="font-medium!">TSS, latest</td><td className="num">{num(w.tssMgL)} mg/L</td><td className="num">{lim.limits.tssMgL}</td></tr>
                  <tr><td className="font-medium!">COD, latest</td><td className="num">{num(w.codMgL)} mg/L</td><td className="num">{lim.limits.codMgL}</td></tr>
                  <tr><td className="font-medium!">FOG, latest</td><td className="num">{num(w.fogMgL)} mg/L</td><td className="num">{lim.limits.fogMgL} instantaneous</td></tr>
                  <tr><td className="font-medium!">Grease-trap last pump-out</td><td className="num">{w.greaseTrapLastPumpOut || '—'}</td><td className="num">every {lim.greaseTrap.maxIntervalDays} days</td></tr>
                  <tr><td className="font-medium!">Grease-trap fill, latest</td><td className="num">{pctText(w.greaseTrapFill)}</td><td className="num">pump at {Math.round(lim.greaseTrap.pumpOutFillFraction * 100)}%</td></tr>
                </tbody>
              </table>
            </div>
          </Card>
          <SustainabilityReadingsCard group="water" records={world.records} year={year} onChanged={world.reload} />
        </>
      )}

      <Card title="Surcharge projection" className="mt-4">
        {s ? (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th>Term</th><th className="num">Excess, mg/L</th><th className="num">Unit charge</th><th className="num">Charge / month</th></tr></thead>
              <tbody>
                <tr><td className="font-medium!">Biochemical oxygen demand (BOD){s.branch === 'BOD' ? '' : ' — not charged on the COD formula'}</td><td className="num">{s.excessBodMgL}</td><td className="num">${lim.unitCharges.bodPerLb.toFixed(4)} / lb</td><td className="num">{money(s.chargeBod)}</td></tr>
                <tr><td className="font-medium!">Total suspended solids (TSS)</td><td className="num">{s.excessTssMgL}</td><td className="num">${lim.unitCharges.tssPerLb.toFixed(4)} / lb</td><td className="num">{money(s.chargeTss)}</td></tr>
                <tr><td className="font-medium!">Chemical oxygen demand (COD){s.branch === 'COD' ? '' : ' — not charged on the BOD formula'}</td><td className="num">{s.excessCodMgL}</td><td className="num">${lim.unitCharges.codPerLb.toFixed(4)} / lb</td><td className="num">{money(s.chargeCod)}</td></tr>
                <tr className="total"><td colSpan={3}>Projected surcharge, month</td><td className="num">{money(s.surcharge)}</td></tr>
              </tbody>
            </table>
            {s.fogExceeded ? <p className="muse-kpi-sub mt-2 muse-c-over">FOG sample exceeds the {lim.limits.fogMgL} mg/L instantaneous discharge limit.</p> : null}
          </div>
        ) : (
          <p className="muse-kpi-sub">Enter a billed wastewater volume and at least one strength result to project the surcharge.</p>
        )}
        <pre className="mt-3 muse-mono muse-fs-xs leading-[1.6]! m-0! whitespace-pre-wrap! muse-c-soft">
{`if COD ≤ ${lim.codToBodRatioThreshold} × BOD:   S = V × ${lim.lbPerGallon} × [ A × (BOD − ${lim.limits.bodMgL}) + B × (TSS − ${lim.limits.tssMgL}) ]
otherwise:            S = V × ${lim.lbPerGallon} × [ C × (COD − ${lim.limits.codMgL}) + B × (TSS − ${lim.limits.tssMgL}) ]`}
        </pre>
        <p className="muse-kpi-sub mt-2">
          Limits: <Cite p={lim.provenance.limits} /> <StatusBadge status={lim.provenance.limits.status} />. Unit charges: <Cite p={lim.provenance.unitCharges} /> <StatusBadge status={lim.provenance.unitCharges.status} title={lim.provenance.unitCharges.note} />. Grease trap: <Cite p={lim.provenance.greaseTrap} />.
        </p>
      </Card>
    </>
  );
}
