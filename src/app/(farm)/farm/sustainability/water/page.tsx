'use client';

import { useMemo } from 'react';
import { PageHeader, Card, Kpi, num, pct } from '@/components/ui';
import Link from 'next/link';
import { EditableNumber } from '@/components/EditableNumber';
import { SectionSave } from '@/components/SectionSave';
import { SourceLink, useDocumentSources } from '@/components/SourceLink';
import { docKey, evidenceCoverage } from '@/engine/entity-links';
import { waterProjection } from '@/engine/carbon';
import { WATER_DEFAULTS, type WaterActivity } from '@/engine/scenario';
import { READING_METRICS } from '@/engine/sustainability-records';
import { useScenario } from '@/state/scenario-store';
import { useSustainabilityWorld } from '@/state/sustainability';
import { SustainabilityWorldNote } from '@/components/ledger/SustainabilityWorldNote';
import { SustainabilityReadingsCard } from '@/components/SustainabilityReadingsCard';

const DOC_ROWS: { field: keyof WaterActivity; hint: string; label: string }[] = [
  { field: 'meteredGalPerMonth', hint: 'Water invoice', label: 'metered water' },
  { field: 'billedWastewaterMGalPerMonth', hint: 'Wastewater invoice; a share of metered water', label: 'billed wastewater volume' },
];

export default function WaterPage() {
  const { resolved, setSustainability } = useScenario();
  const world = useSustainabilityWorld();
  // Plan: the volumes loaded into the forecast. Actual: the year's bills (Roadmap N6 slice 4).
  const w = world.water;
  // One entry for water in a home forecast: the home water line's gallons, at the grow room's share.
  const homeWater = resolved.fixedCostLines.find((l) => l.key === 'home-water' && l.householdQuantity != null && l.allocatedShare != null);
  const year = resolved.sustainability.audit.reportingYear;
  const waterRecords = (world.records?.readings ?? []).filter((r) => READING_METRICS[r.metric]?.group === 'water' && r.readOn.startsWith(`${year}-`));
  const sources = useDocumentSources();
  const evidence = evidenceCoverage(
    DOC_ROWS.map((r) => docKey.water(r.field)),
    resolved.sustainability.documents,
  );
  const docCell = (field: keyof WaterActivity) => {
    const row = DOC_ROWS.find((r) => r.field === field)!;
    return <SourceLink docKey={docKey.water(field)} sources={sources} hint={row.hint} ariaLabel={`Link the document behind the ${row.label}`} />;
  };
  const units = world.basis.totalUnits;
  const proj = useMemo(() => waterProjection(w, units), [w, units]);

  const setNum = (key: keyof WaterActivity, value: number) =>
    setSustainability((d) => {
      const wa = (d.water ??= {});
      if (value === WATER_DEFAULTS[key]) delete wa[key];
      else wa[key] = value;
    });

  return (
    <>
      <PageHeader
        title="Water"
        purpose="Measure the water the grow room takes, planned or billed, and the water each unit distributed took."
        functions={['Monthly volumes', 'Water per unit', 'Bills on record']}
        howItWorks={
          <ul>
            <li>Metered water in, billed wastewater out, by the month.</li>
            <li>On Plan the volumes are the ones loaded into the forecast; at home the metered figure is the household&rsquo;s water at the grow room&rsquo;s share. On Actual they are the bills on record.</li>
            <li>Water per unit divides the year&rsquo;s metered gallons by the units distributed in the same period. The water a tray takes by stage is on its grow plan&rsquo;s cost card.</li>
          </ul>
        }
        status="partial"
      />

      <SustainabilityWorldNote world={world} />

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={`${num(proj.annualMeteredGal)} gal`} label="Metered water / yr" sub="Twelve months of the monthly volume" />
        <Kpi value={`${proj.annualWastewaterMGal.toFixed(3)} million gal`} label="Billed wastewater / yr" sub="Twelve months of the monthly volume" />
        <Kpi value={proj.galPerUnit !== null ? `${proj.galPerUnit.toFixed(1)} gal` : '—'} label="Water per unit" sub={`${num(proj.annualMeteredGal)} gal over ${num(units)} units distributed`} />
        {world.isPlan ? (
          <Kpi value={`${evidence.rowsWithDocument} / ${evidence.rowsTotal}`} label="Inputs with a document linked" sub="Water and wastewater invoices" />
        ) : (
          <Kpi value={`${waterRecords.filter((r) => r.sourceId).length} / ${waterRecords.length}`} label="Bills with a document linked" sub={`Reporting year ${year}`} />
        )}
      </div>

      {world.isPlan ? (
        <Card title="Monthly volumes — loaded into the forecast" className="mt-4">
          <div className="mb-3!">
            <SectionSave sections={['sustainability']} title="the water inputs" />
          </div>
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead><tr><th>Input</th><th className="num">Value</th><th>Source document</th></tr></thead>
              <tbody>
                <tr><td className="font-medium!">Metered water</td><td className="num">{homeWater ? <span title="Entered on Equipment, Home: the household's gallons at the grow room's share">{num(w.meteredGalPerMonth)} gal / month<div className="farm-kpi-sub farm-fs-2xs">{num(homeWater.householdQuantity ?? 0)} household gal at {pct(homeWater.allocatedShare ?? 0, 1)}, on <Link className="farm-link" href="/farm/grow-units">Equipment, Home</Link></div></span> : <EditableNumber value={w.meteredGalPerMonth} defaultValue={0} onChange={(v) => setNum('meteredGalPerMonth', v)} step={100} suffix="gal / month" ariaLabel="Metered water per month" />}</td><td>{docCell('meteredGalPerMonth')}</td></tr>
                <tr><td className="font-medium!">Billed wastewater volume</td><td className="num"><EditableNumber value={w.billedWastewaterMGalPerMonth} defaultValue={0} onChange={(v) => setNum('billedWastewaterMGalPerMonth', v)} step={0.01} suffix="million gal / month" ariaLabel="Billed wastewater volume per month" /></td><td>{docCell('billedWastewaterMGalPerMonth')}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="farm-kpi-sub mt-2">Each row links to its invoice in the registry on Sources; the link is part of the scenario.</p>
        </Card>
      ) : (
        <>
          <Card title={`The year from the bills — ${year}`} className="mt-4">
            <div className="farm-scroll-x">
              <table className="farm-table">
                <thead><tr><th>Input</th><th className="num">Value</th></tr></thead>
                <tbody>
                  <tr><td className="font-medium!">Metered water, a month</td><td className="num">{num(w.meteredGalPerMonth)} gal</td></tr>
                  <tr><td className="font-medium!">Billed wastewater volume, a month</td><td className="num">{w.billedWastewaterMGalPerMonth.toFixed(3)} million gal</td></tr>
                </tbody>
              </table>
            </div>
            <p className="farm-kpi-sub mt-2">A monthly figure is the year&rsquo;s bills divided by the months billed.</p>
          </Card>
          <SustainabilityReadingsCard group="water" records={world.records} year={year} onChanged={world.reload} />
        </>
      )}
    </>
  );
}
