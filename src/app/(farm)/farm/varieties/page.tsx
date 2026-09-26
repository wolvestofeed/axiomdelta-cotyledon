import Link from 'next/link';
import { PageHeader, Card, StatusBadge, money, num } from '@/components/ui';
import { VARIETIES } from '@/data/varieties';
import { cycleDays, daysToHarvest } from '@/data/stage-schedule';
import { MEDIUM_BY_KEY, REGIME_BY_KEY } from '@/data/inputs-catalog';
import { SCIENCE_SOURCE_BY_ROW } from '@/data/science-library';
import { GLOSSARY_BY_KEY } from '@/data/glossary';
import { targetsOfPlan } from '@/engine/nutrition-targets';
import { singleVarietyPlan } from '@/data/grow-plan';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/** The variety library (outline §4): the master record and the cost basis, one card per variety. */
export default async function VarietiesPage() {
  return withWorkspace(() => VarietiesPageInner());
}

async function VarietiesPageInner() {
  const rowTitle = (r: number) => SCIENCE_SOURCE_BY_ROW[r]?.title ?? `row ${r}`;
  return (
    <>
      <PageHeader
        title="Varieties"
        purpose="Read each variety's record: seed, density, stages, light and media, and what the science states."
        functions={['Seed and supplier', 'Density and stages', 'Light and media', 'Nutrient profile', 'Targets']}
        connects={[
          { href: '/farm/crop-plans', dir: 'to' },
          { href: '/farm/sources', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A variety is the master record: its seed source and supplier code, its price per pound (the rolling cost from receipts once there are receipts), its grams per 1020 and per jar, its soak and stage days, and its harvest weight until a closed sowing observes one.</li>
            <li>Every stated benefit and every light or media note cites rows of the science library, registered on Sources.</li>
            <li>The targets a variety carries are what the Flat Builder reads a subscriber&rsquo;s nutrition targets against.</li>
          </ul>
        }
        status="live"
      />

      <Card title="The library">
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead>
              <tr><th>Code</th><th>Variety</th><th>Kind</th><th>Supplier</th><th className="num">$ / lb</th><th className="num">g / 1020</th><th className="num">Soak h</th><th className="num">To harvest</th><th className="num">Cycle</th><th className="num">Harvest g</th><th>Light</th><th>Medium</th></tr>
            </thead>
            <tbody>
              {VARIETIES.map((v) => (
                <tr key={v.key}>
                  <td className="farm-mono">{v.code}</td>
                  <td><a className="farm-link" href={`#${v.key}`}>{v.name}</a><div className="farm-kpi-sub">{v.latinName}</div></td>
                  <td>{v.kind}</td>
                  <td>{v.supplier.code}{v.supplier.sku ? ` ${v.supplier.sku}` : ''}{v.supplier.organic ? ' · organic' : ''}</td>
                  <td className="num"><StatusBadge status={v.seedPricePerLb.status} title={v.seedPricePerLb.note} /> {money(v.seedPricePerLb.value)}</td>
                  <td className="num"><StatusBadge status={v.seedGramsPer1020.status} title={v.seedGramsPer1020.note} /> {num(v.seedGramsPer1020.value, 0)}</td>
                  <td className="num">{num(v.soakHours.value, 0)}</td>
                  <td className="num">{daysToHarvest(v.stageDays.value)} d</td>
                  <td className="num">{cycleDays(v.stageDays.value)} d</td>
                  <td className="num"><StatusBadge status={v.harvestGramsPer1020.status} title={v.harvestGramsPer1020.note} /> {num(v.harvestGramsPer1020.value, 0)}</td>
                  <td>{REGIME_BY_KEY[v.light.defaultRegime].name}</td>
                  <td>{MEDIUM_BY_KEY[v.media.defaultMedium].name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">Prices are True Leaf Market&rsquo;s 5-pound tier as Vallecito bought it in January 2024 (DATED); densities are what Vallecito sowed (STATED); harvest weights are PLACEHOLDER until closed sowings observe them. Each variety&rsquo;s plan is on <Link className="farm-link" href="/farm/crop-plans">Crop plans</Link>.</p>
      </Card>

      {VARIETIES.map((v) => {
        const d = v.stageDays.value;
        const targets = targetsOfPlan(singleVarietyPlan(v));
        return (
          <Card key={v.key} title={`${v.code} · ${v.name}`} className="mt-4">
            <div id={v.key} className="scroll-mt-4" />
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="farm-kpi-sub">Seed</div>
                <div>{v.latinName} · {v.family} · {v.kind}. {v.supplier.name} ({v.supplier.code}){v.supplier.sku ? `, item ${v.supplier.sku}` : ''}{v.supplier.organic ? ', organic' : ''}{v.supplier.heirloom ? ', heirloom' : ''}{v.supplier.origin ? `, origin ${v.supplier.origin}` : ''}. {v.flavor}; {v.color}.</div>
                <div className="farm-kpi-sub mt-2!">Density and stages</div>
                <div>{num(v.seedGramsPer1020.value, 0)} g per {v.kind === 'sprout' ? 'jar' : '1020'} (supplier rates {v.supplierRate}); soak {num(v.soakHours.value, 0)} h; sow {d.sow}, germination {d.germination}, blackout {d.blackout}, light {d.light}, harvest window {d['harvest-window']} days: {daysToHarvest(d)} to harvest, {cycleDays(d)} on the shelf. <span className="farm-kpi-sub">{v.stageDays.note}</span></div>
                <div className="farm-kpi-sub mt-2!">Light</div>
                <ul className="list-disc pl-5">
                  <li>Default regime {REGIME_BY_KEY[v.light.defaultRegime].name}{v.light.ppfdRange ? `; own range ${v.light.ppfdRange.min} to ${v.light.ppfdRange.max} µmol/m²/s (rows ${v.light.ppfdRange.rows.join(', ')})` : ''}.</li>
                  {v.light.notes.map((n, i) => <li key={i}>{n.text} <span className="farm-kpi-sub">(rows {n.rows.join(', ') || '—'})</span></li>)}
                </ul>
                <div className="farm-kpi-sub mt-2!">Medium</div>
                <ul className="list-disc pl-5">
                  <li>Default {MEDIUM_BY_KEY[v.media.defaultMedium].name}.</li>
                  {v.media.notes.map((n, i) => <li key={i}>{n.text} <span className="farm-kpi-sub">(rows {n.rows.join(', ') || '—'})</span></li>)}
                </ul>
              </div>
              <div>
                <div className="farm-kpi-sub">Compounds</div>
                <div>{v.profile.compounds.join(', ') || '—'}</div>
                <div className="farm-kpi-sub mt-2!">Nutrients</div>
                <div>{v.profile.nutrients.join(', ') || '—'}</div>
                <div className="farm-kpi-sub mt-2!">Targets carried</div>
                <div>{targets.map((t) => t.name).join(', ') || '—'}</div>
                <div className="farm-kpi-sub mt-2!">Stated benefits</div>
                <ul className="list-disc pl-5">
                  {v.profile.benefits.map((b, i) => (
                    <li key={i}>{b.statement} <span className="farm-kpi-sub">({b.evidence}; {b.rows.map((r) => <span key={r} title={rowTitle(r)}>row {r} </span>)})</span></li>
                  ))}
                  {v.profile.benefits.length === 0 && <li className="farm-kpi-sub">No stated benefit on file.</li>}
                </ul>
                {v.profile.glossary.length > 0 && (
                  <>
                    <div className="farm-kpi-sub mt-2!">Glossary</div>
                    <div>{v.profile.glossary.map((k) => GLOSSARY_BY_KEY[k]?.term ?? k).join(', ')}</div>
                  </>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </>
  );
}
