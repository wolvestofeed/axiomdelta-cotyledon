'use client';

import { useMemo } from 'react';
import { PageHeader, Card, Kpi, StatusBadge } from '@/components/ui';
import { Cite } from '@/components/Cite';
import { SectionSave } from '@/components/SectionSave';
import { RatingPill, RatingLegend, ratingHeader } from '@/components/MarkRating';
import { inputRatings, ratingFor } from '@/data/mark';
import { foodFactorSource } from '@/data/emission-factors';
import { BOUNDARY_LABEL, lcaOptions as curatedOptions, type LcaOption } from '@/data/lca-options';
import { growPlanFoodFootprintDual } from '@/engine/carbon';
import { useSustainabilityWorld } from '@/state/sustainability';
import { SustainabilityWorldNote } from '@/components/ledger/SustainabilityWorldNote';
import { useScenario } from '@/state/scenario-store';
import { SupplierPicker } from '@/components/SupplierPicker';
import { useLinkedSuppliers } from '@/components/useLinkedSuppliers';
import { PageControls } from '@/components/PageControls';
import { GrowPlanSelector, useSelectedGrowPlan } from '@/components/GrowPlanSelector';

export default function InputsClient({ supplierOptions }: { supplierOptions: LcaOption[] }) {
  const { resolved: scenario, setInputBasis, setSustainability, isSuperAdmin: superAdmin } = useScenario();
  const { growPlan: selectedGrowPlan } = useSelectedGrowPlan();
  const resolved = useMemo(() => ({ ...scenario, growPlan: selectedGrowPlan }), [scenario, selectedGrowPlan]);
  const selection = resolved.sustainability.inputBasis;
  const links = resolved.sustainability.inputSupplier;
  const linked = useLinkedSuppliers(links);
  const options = useMemo(() => [...curatedOptions, ...supplierOptions], [supplierOptions]);

  const dual = useMemo(() => growPlanFoodFootprintDual(resolved.growPlan, selection, undefined, undefined, options), [resolved.growPlan, selection, options]);
  // The period's food across every grow plan distributed, on the selected ledger (Roadmap N6 slice 4).
  const world = useSustainabilityWorld(options);
  // The LCA basis and supplier links are forecast edits: on Plan only.
  const isSuperAdmin = superAdmin && world.isPlan;
  const setLink = (name: string, id: string | undefined) =>
    setSustainability((d) => {
      const m = (d.inputSupplier ??= {});
      if (id === undefined) delete m[name];
      else m[name] = id;
      if (Object.keys(m).length === 0) delete d.inputSupplier;
    });

  const fmt = (n: number, dp = 3) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(dp);

  return (
    <>
      <PageHeader
        title="Inputs (Scope 3)"
        purpose="Compare each unit's food footprint on the reference and selected bases."
        functions={['Reference basis', 'Selected basis', 'Gap', 'Per unit']}
        connects={[
          { href: '/farm/grow-plans', dir: 'from' },
          { href: '/farm/sustainability/supplier-lca', dir: 'from' },
          { href: '/farm/sustainability/inventory', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The food footprint of one unit is shown on two bases, always both.</li>
            <li>The reference basis is the mean for each input&rsquo;s product in <Cite p={foodFactorSource} label="the study" /> and is never edited.</li>
            <li>The selected basis is the choice per input among the study mean, a cited LCA from a registered document, or supplier data.</li>
            <li>The gap between the two is the practice or supplier credit.</li>
          </ul>
        }
        status="live"
      />
      <PageControls><GrowPlanSelector /></PageControls>

      <SustainabilityWorldNote world={world} />

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={`${fmt(dual.referenceTotalKgPerUnit, 2)} kg`} label="Reference basis / unit" sub="Study means, retail weight" />
        <Kpi value={`${fmt(dual.selectedTotalKgPerUnit, 2)} kg`} label="Selected basis / unit" sub={dual.linesOnSelectedBasis === 0 ? 'No selections; equals the reference' : `${dual.linesOnSelectedBasis} line${dual.linesOnSelectedBasis > 1 ? 's' : ''} on a cited or supplier figure`} />
        <Kpi value={`${fmt(dual.gapKgPerUnit, 2)} kg`} label="Gap / unit" sub="Selected minus reference" />
        <Kpi value={`${(world.food.referenceKg / 1000).toFixed(1)} t · ${(world.food.selectedKg / 1000).toFixed(1)} t`} label="All units distributed" sub={`Reference · selected, ${world.periodLabel}`} />
      </div>

      <Card title="Per unit, by input — both bases" className="mt-4">
        <div className="mb-3!">
          {world.isPlan ? <SectionSave sections={['sustainability']} title="the LCA basis and supplier links" /> : <p className="farm-kpi-sub">The forecast&rsquo;s LCA basis and supplier links, read-only on Actual. They are edited on Plan.</p>}
        </div>
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr>
                <th>Input</th><th>{ratingHeader()}</th><th>Supplier</th><th className="num">Mass</th>
                <th className="num">Reference basis</th><th className="num">kg CO2e</th>
                <th>Selected basis</th><th className="num">kg CO2e</th><th className="num">Gap</th>
              </tr>
            </thead>
            <tbody>
              {dual.lines.map((l) => {
                const r = l.reference;
                const s = l.selected;
                const chosen = selection[l.name] ?? '';
                return (
                  <tr key={l.name}>
                    <td className="font-medium!">
                      {l.name}
                      {l.category === null ? <div className="farm-fs-xs farm-c-faint">{l.excludedReason}</div> : null}
                    </td>
                    <td><RatingPill rating={ratingFor(inputRatings, l.name)} /></td>
                    <td>{l.category === null ? '—' : <SupplierPicker input={l.name} linked={links[l.name] ? linked[links[l.name]] ?? null : null} canEdit={isSuperAdmin} onLink={(id) => setLink(l.name, id)} />}</td>
                    <td className="num">{l.category ? `${(l.massKgPerUnit * 1000).toFixed(0)} g` : '—'}</td>
                    <td className="num">
                      {r ? (
                        <div>
                          <div className="inline-flex items-center gap-2">{r.rawKgPerKg.toFixed(2)} <Cite p={r.provenance} /></div>
                          <div className="farm-fs-2xs farm-c-faint">{r.label.replace('Study mean, ', '')}</div>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="num">{r ? r.kgCo2ePerUnit.toFixed(3) : '—'}</td>
                    <td>
                      {l.category === null ? '—' : l.options.length === 0 ? (
                        <span className="farm-c-faint farm-fs-xs">Study mean · no cited or supplier figure on file</span>
                      ) : (
                        <div>
                          {isSuperAdmin ? (
                            <select className="farm-input farm-fs-xs min-w-56!" value={chosen} onChange={(e) => setInputBasis(l.name, e.target.value || undefined)} aria-label={`${l.name} LCA basis`}>
                              <option value="">Study mean</option>
                              {l.options.map((o) => (
                                <option key={o.id} value={o.id}>{o.label}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="farm-fs-sm">{s?.label ?? 'Study mean'}</div>
                          )}
                          {s && s.optionId !== null ? (
                            <div className="farm-fs-2xs farm-c-soft mt-1! leading-[1.4]">
                              <span className="inline-flex items-center gap-2">{fmt(s.rawKgPerKg, 2)} {s.provenance && <Cite p={s.provenance} />}</span>
                              {' '}{BOUNDARY_LABEL[s.boundary]}
                              {s.boundary !== 'retail' ? <> · aligned to retail <strong>{fmt(s.alignedKgPerKg, 2)}</strong> <StatusBadge status="DERIVED" title="Option figure + the study's transport, packaging and retail stages, scaled by the study's loss ratio for this product" /></> : null}
                              {' '}<StatusBadge status={s.status} />
                            </div>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="num">{s ? s.kgCo2ePerUnit.toFixed(3) : '—'}</td>
                    <td className={`num ${(s && r && s.kgCo2ePerUnit - r.kgCo2ePerUnit < 0 ? 'farm-c-sourced' : '')}`}>
                      {s && r ? fmt(s.kgCo2ePerUnit - r.kgCo2ePerUnit) : '—'}
                    </td>
                  </tr>
                );
              })}
              <tr className="total">
                <td colSpan={5}>Total per unit</td>
                <td className="num">{dual.referenceTotalKgPerUnit.toFixed(3)}</td>
                <td />
                <td className="num">{fmt(dual.selectedTotalKgPerUnit)}</td>
                <td className="num">{fmt(dual.gapKgPerUnit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <RatingLegend />
        <p className="farm-kpi-sub mt-2">
          Reference factors are per kg at retail, losses included, from <Cite p={foodFactorSource} label={foodFactorSource.source.split(',')[0]} />. A cited figure at a narrower boundary is shown raw and aligned to retail; the aligned figure adds the study’s own post-slaughter stages for that product and applies its loss ratio, and is tagged derived. The basis selection and the supplier link are part of the forecast: saved with it; a super admin can set a forecast as the plan of record. A linked supplier’s own figure appears in the selector once it is recorded under Supplier LCA data.
        </p>
      </Card>

    </>
  );
}
