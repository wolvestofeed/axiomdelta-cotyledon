/**
 * Cotyledon — the footprint of one tray (Phase 5, step 3). Pure.
 *
 * For one grow plan in its format: what one tray takes on every line of its cost card (seed, medium,
 * nutrient, light, water), the freight that brought the seed and the medium, the share of the
 * fixture's manufacture the tray's light-days carry, and the mat's end of life, each as a quantity
 * with its unit, a mass where it has one, and the CO2e the factor on file gives it on the reference
 * basis and on the selected basis. Per tray is the operational unit; per kg fresh weight divides by
 * the plan's harvest grams and carries their tag (decision 1). A line with no factor on file is
 * listed with the reason, never silently dropped; a proxy is named as one. Light is derived from the
 * fixture rows and the regime, never typed (decision 7). Nothing here is stored.
 */

import { seedLineHarvest, type GrowPlanDef } from '@/data/grow-plan';
import { TRAY_FORMAT_BY_KEY, densityFactorOf } from '@/data/tray-formats';
import { HEMP_MAT_GRADE_G_PER_M2, TRAYS_PER_SHELF_1020, type LightRegimeDef } from '@/data/inputs-catalog';
import type { StatusTag } from '@/data/tagged';
import {
  inputFactors,
  growPlanFoodCategoryMap,
  gridFactorERCT,
  mediaFactorsZhaw,
  GAL_PER_M3,
  ledEmbodiedFactors,
  warmYardTrimmings,
  freightFactorsHub,
  type FactorProvenance,
  type FoodFactor,
  type GridFactor,
  type GrowPlanFoodMapping,
  type FreightMode,
} from '@/data/emission-factors';
import { lcaOptions as defaultOptions, optionsForInput, type LcaOption } from '@/data/lca-options';
import { suppliers } from '@/data/suppliers';
import { FARM_HOME } from '@/data/farm-location';
import { haversineMiles } from '@/engine/geo';
import { co2e, postElectricity } from '@/engine/carbon';
import { costContextFor, costGrowPlan, type GrowCostContext, type GrowPlanCosting } from '@/engine/grow-costing';

// ── Unit identities ─────────────────────────────────────────────────────────

export const L_PER_FL_OZ = 0.0295735295625;
export const SQ_M_PER_SQ_IN = 0.00064516;
export const KG_PER_SHORT_TON_MASS = 907.18474;
/** WARM's MTCO2E per short ton as kg CO2e per kg of material. */
export const WARM_KG_PER_KG = 1000 / KG_PER_SHORT_TON_MASS;

// ── Types ───────────────────────────────────────────────────────────────────

export type FootprintLineKind = 'seed' | 'medium' | 'nutrient' | 'light' | 'water' | 'freight' | 'capital' | 'end-of-life';

export interface FootprintBasis {
  kind: 'study_mean' | 'cited_lca' | 'supplier' | 'factor';
  optionId: string | null;
  label: string;
  kgCo2ePerTray: number;
  provenance: FactorProvenance;
  status: StatusTag;
  /** The boundary or the arithmetic the figure rests on, for the page. */
  note: string;
}

export interface TrayFootprintLine {
  kind: FootprintLineKind;
  name: string;
  quantityPerTray: number;
  quantityUnit: string;
  /** Null where the line has no mass (light, water). */
  massKgPerTray: number | null;
  reference: FootprintBasis | null;
  selected: FootprintBasis | null;
  options: LcaOption[];
  /** The weakest tag among the quantity and the factor; null where the line carries no figure. */
  status: StatusTag | null;
  excludedReason?: string;
  note: string;
}

export interface FootprintTotals {
  seed: number;
  medium: number;
  nutrient: number;
  light: number;
  freight: number;
  capital: number;
  endOfLife: number;
  total: number;
}

export interface TrayFootprint {
  code: string;
  formatName: string;
  lines: TrayFootprintLine[];
  perTray: { reference: FootprintTotals; selected: FootprintTotals };
  harvestGramsPerTray: { value: number; status: StatusTag };
  /** Per kg fresh weight; null while the plan has no harvest weight. Carries the harvest tag. */
  perKg: { reference: FootprintTotals; selected: FootprintTotals; status: StatusTag } | null;
  kwhPerTray: number;
  lightDays: number;
  waterLPerTray: number;
  /** The weakest tag on any line that carries a figure. */
  weakestStatus: StatusTag | null;
  /** Lines listed without a figure, with their reasons. */
  excluded: { name: string; reason: string }[];
}

export interface FreightLeg {
  mode: FreightMode;
  miles: number;
  status: StatusTag;
  note: string;
}

export interface TrayFootprintOptions {
  /** Input name → option id for the selected basis. */
  selection?: Record<string, string>;
  options?: LcaOption[];
  factors?: FoodFactor[];
  map?: Record<string, GrowPlanFoodMapping>;
  grid?: GridFactor;
  /** Share of the kWh under renewable supply, for the market-based (selected) light figure. */
  renewableShare?: number;
  /** Purchase name → the leg that brought it; the default is the supplier record's city to the home pin. */
  freight?: Record<string, FreightLeg>;
  /** Share of spent mats composted; the rest landfilled. */
  compostShare?: number;
  /** The mat grade the mass is read at, g/m². */
  hempMatGradeGPerM2?: number;
  costContext?: Partial<GrowCostContext>;
}

// ── Status ──────────────────────────────────────────────────────────────────

const RANK: Record<StatusTag, number> = { SOURCED: 0, STATED: 1, DERIVED: 1, DATED: 2, UNCONFIRMED: 3, PLACEHOLDER: 4 };

export function weakest(...tags: (StatusTag | null | undefined)[]): StatusTag | null {
  let w: StatusTag | null = null;
  for (const t of tags) if (t && (w === null || RANK[t] > RANK[w])) w = t;
  return w;
}

// ── Freight legs of record ──────────────────────────────────────────────────

const legFrom = (supplierId: string, what: string): FreightLeg | null => {
  const s = suppliers.find((x) => x.id === supplierId);
  if (!s || s.lat === null || s.lng === null) return null;
  return {
    mode: 'truck',
    miles: haversineMiles({ lat: s.lat, lng: s.lng }, { lat: FARM_HOME.lat, lng: FARM_HOME.lng }),
    status: 'DERIVED',
    note: `${what}: ${s.city}, ${s.state} to the home pin, great-circle; road miles are longer, and the home pin is ${FARM_HOME.approximate ? 'approximate' : 'stated'}.`,
  };
};

/** Seed from True Leaf Market and the hemp mat from Bootstrap Farmer, by truck, great-circle to the home pin. */
export function defaultFreightLegs(): Record<string, FreightLeg> {
  const out: Record<string, FreightLeg> = {};
  const seed = legFrom('true-leaf-market', 'Seed');
  const mat = legFrom('bootstrap-farmer', 'Hemp mats');
  for (const [name, m] of Object.entries(growPlanFoodCategoryMap)) if (seed && m) out[name] = seed;
  if (mat) out['Medium: hemp-mat'] = mat;
  return out;
}

function freightKg(massKg: number, leg: FreightLeg): number {
  const f = freightFactorsHub[leg.mode];
  const tonMiles = (massKg / KG_PER_SHORT_TON_MASS) * leg.miles;
  return co2e({ co2Kg: tonMiles * f.co2KgPerTonMile, ch4Kg: (tonMiles * f.ch4GPerTonMile) / 1000, n2oKg: (tonMiles * f.n2oGPerTonMile) / 1000 });
}

// ── The engine ──────────────────────────────────────────────────────────────

const zero = (): FootprintTotals => ({ seed: 0, medium: 0, nutrient: 0, light: 0, freight: 0, capital: 0, endOfLife: 0, total: 0 });
const bucketOf: Record<FootprintLineKind, keyof Omit<FootprintTotals, 'total'> | null> = { seed: 'seed', medium: 'medium', nutrient: 'nutrient', light: 'light', water: null, freight: 'freight', capital: 'capital', 'end-of-life': 'endOfLife' };

export function trayFootprint(plan: GrowPlanDef, opts: TrayFootprintOptions = {}): TrayFootprint {
  const ctx = costContextFor(plan, opts.costContext ?? {});
  const costing: GrowPlanCosting = costGrowPlan(plan, ctx);
  const format = TRAY_FORMAT_BY_KEY[plan.format]!;
  const density = densityFactorOf(format);
  const factors = opts.factors ?? inputFactors;
  const map = opts.map ?? growPlanFoodCategoryMap;
  const options = opts.options ?? defaultOptions;
  const selection = opts.selection ?? {};
  const grid = opts.grid ?? gridFactorERCT;
  const freight = opts.freight ?? defaultFreightLegs();
  const compostShare = Math.min(1, Math.max(0, opts.compostShare ?? 0));
  const matGrade = opts.hempMatGradeGPerM2 ?? HEMP_MAT_GRADE_G_PER_M2.value;
  const matGradeStatus: StatusTag = opts.hempMatGradeGPerM2 === undefined ? HEMP_MAT_GRADE_G_PER_M2.status : 'STATED';

  const lines: TrayFootprintLine[] = [];
  const freightLines: TrayFootprintLine[] = [];
  const endOfLife: TrayFootprintLine[] = [];
  let kwhPerTray = 0;
  let lightDays = 0;

  const withFreight = (name: string, massKg: number, massStatus: StatusTag) => {
    const leg = freight[name];
    if (!leg || massKg <= 0) return;
    const f = freightFactorsHub[leg.mode];
    const kg = freightKg(massKg, leg);
    const basis: FootprintBasis = { kind: 'factor', optionId: null, label: `${f.label}, ${leg.miles.toFixed(0)} miles`, kgCo2ePerTray: kg, provenance: f.provenance, status: weakest(f.provenance.status, leg.status, massStatus)!, note: leg.note };
    freightLines.push({ kind: 'freight', name: `Freight: ${name}`, quantityPerTray: (massKg / KG_PER_SHORT_TON_MASS) * leg.miles, quantityUnit: 'short ton-miles', massKgPerTray: massKg, reference: basis, selected: basis, options: [], status: basis.status, note: `${massKg.toFixed(4)} kg over ${leg.miles.toFixed(0)} miles by ${f.label.toLowerCase()}.` });
  };

  for (const c of costing.lines) {
    const line = c.line;
    switch (line.kind) {
      case 'seed': {
        const name = c.label;
        const grams = c.quantity;
        const massKg = grams / 1000;
        const m = map[name];
        const quantityStatus = line.gramsPerTray.status;
        const avail = optionsForInput(name, options);
        if (!m || m.category === null) {
          lines.push({ kind: 'seed', name, quantityPerTray: grams, quantityUnit: 'g', massKgPerTray: massKg, reference: null, selected: null, options: avail, status: null, excludedReason: m?.note ?? 'No mapping to a study product.', note: '' });
          withFreight(name, massKg, quantityStatus);
          break;
        }
        const f = factors.find((x) => x.category === m.category);
        if (!f) throw new Error(`No study factor on file for ${m.category}`);
        const reference: FootprintBasis = { kind: 'study_mean', optionId: null, label: `Study mean, ${m.proxy ?? f.label}`, kgCo2ePerTray: massKg * f.kgCo2ePerKg, provenance: f.provenance, status: weakest(f.provenance.status, m.basisStatus, quantityStatus)!, note: `${f.kgCo2ePerKg.toFixed(3)} kg CO2e per kg at retail weight, losses included; ${m.note ?? ''}`.trim() };
        const chosen = avail.find((o) => o.id === selection[name]);
        const selected: FootprintBasis = chosen
          ? { kind: chosen.kind, optionId: chosen.id, label: chosen.label, kgCo2ePerTray: massKg * chosen.kgCo2ePerKg, provenance: chosen.provenance, status: weakest(chosen.provenance.status, quantityStatus)!, note: `${chosen.kgCo2ePerKg.toFixed(2)} kg CO2e per kg, ${chosen.unitNote}; boundary ${chosen.boundary.replace(/_/g, ' ')}, not aligned to the study's retail weight.` }
          : reference;
        lines.push({ kind: 'seed', name, quantityPerTray: grams, quantityUnit: 'g', massKgPerTray: massKg, reference, selected, options: avail, status: weakest(reference.status, selected.status), note: `${grams.toFixed(1)} g sown (${quantityStatus}).` });
        withFreight(name, massKg, quantityStatus);
        break;
      }
      case 'medium': {
        const name = c.label === 'No medium' || c.quantityUnit === 'none' ? null : `Medium: ${line.mediumKey}`;
        if (!name) break;
        const qty = c.quantity;
        const quantityStatus: StatusTag = line.qtyPerTray?.status ?? ctx.media[line.mediumKey]?.qtyPer1020.status ?? 'PLACEHOLDER';
        const avail = optionsForInput(name, options);
        if (line.mediumKey === 'hemp-mat') {
          const massKg = (format.areaSqIn.value * SQ_M_PER_SQ_IN * matGrade) / 1000 * qty;
          const massStatus = weakest(format.areaSqIn.status, matGradeStatus, quantityStatus)!;
          lines.push({ kind: 'medium', name, quantityPerTray: qty, quantityUnit: 'mat', massKgPerTray: massKg, reference: null, selected: null, options: avail, status: null, excludedReason: 'No hemp mat factor on file: the fiber\'s production is not counted. Its mass, its freight and its end of life are.', note: `${(massKg * 1000).toFixed(0)} g a mat at ${matGrade} g/m² (${matGradeStatus}) over ${format.areaSqIn.value.toFixed(0)} sq in.` });
          withFreight(name, massKg, massStatus);
          const eol = matEndOfLife(name, massKg, massStatus, compostShare);
          endOfLife.push(eol);
          break;
        }
        const z = mediaFactorsZhaw.find((r) => r.mediumKeys.includes(line.mediumKey));
        if (z && c.quantityUnit === 'gal') {
          const m3 = qty / GAL_PER_M3;
          const massKg = m3 * z.bulkDensityKgPerM3;
          const wholeVolume = line.mediumKey === 'peat-vermiculite';
          const basis: FootprintBasis = { kind: 'factor', optionId: null, label: `${z.label}, per m³ used (ZHAW 2015)`, kgCo2ePerTray: m3 * z.kgCo2ePerM3, provenance: z.provenance, status: weakest(z.provenance.status, quantityStatus, wholeVolume ? 'PLACEHOLDER' : null)!, note: `${z.kgCo2ePerM3} kg CO2e per m³ including the use-phase decomposition and Europe's transport legs; no US freight leg is added, so the shipping is not double counted.${wholeVolume ? ' The peat share of the blend is not stated: the whole volume is read at peat\'s figure.' : ''}` };
          lines.push({ kind: 'medium', name, quantityPerTray: qty, quantityUnit: 'gal', massKgPerTray: massKg, reference: basis, selected: basis, options: avail, status: basis.status, note: `${qty.toFixed(3)} gal, ${m3.toFixed(5)} m³ at ${z.bulkDensityKgPerM3} kg/m³.` });
          endOfLife.push(matEndOfLife(name, massKg, basis.status, compostShare));
          break;
        }
        lines.push({ kind: 'medium', name, quantityPerTray: qty, quantityUnit: c.quantityUnit, massKgPerTray: null, reference: null, selected: null, options: avail, status: null, excludedReason: `No factor and no mass per ${c.quantityUnit} on file for this medium.`, note: '' });
        break;
      }
      case 'nutrient': {
        if (c.quantityUnit !== 'ml' || c.quantity <= 0) break;
        const name = `Nutrient: ${line.nutrientKey}`;
        const massKg = c.quantity / 1000;
        lines.push({ kind: 'nutrient', name, quantityPerTray: c.quantity, quantityUnit: 'ml', massKgPerTray: massKg, reference: null, selected: null, options: optionsForInput(name, options), status: null, excludedReason: 'No factor on file for this solution: an Agribalyse fertilizer process by its N-P-K share is the source named by the plan.', note: `Mass read at 1 kg per litre of concentrate (DERIVED).` });
        break;
      }
      case 'light': {
        const regime: LightRegimeDef | undefined = ctx.regimes[line.regimeKey];
        if (!regime) break;
        const fixture = ctx.fixture;
        lightDays = costing.lightDays;
        const hours = regime.photoperiodHours.value;
        const kwhPerTrayDay = ((fixture.watts.value * fixture.perShelf.value) / 1000) * hours / TRAYS_PER_SHELF_1020 * density;
        kwhPerTray = kwhPerTrayDay * lightDays;
        const { location, market } = postElectricity({ id: `light:${plan.code}`, module: 3, period: 'per tray', quantity: kwhPerTray, unit: 'kWh' }, { grid, renewableShare: opts.renewableShare ?? 0 });
        const status = weakest(fixture.watts.status, fixture.perShelf.status, regime.photoperiodHours.status, grid.provenance.status)!;
        const reference: FootprintBasis = { kind: 'factor', optionId: null, label: `${grid.label}, location-based`, kgCo2ePerTray: location.co2eKg, provenance: grid.provenance, status, note: `${fixture.name}, ${fixture.perShelf.value} a shelf at ${fixture.watts.value} W, ${hours} h a day over ${lightDays} lit days, ${TRAYS_PER_SHELF_1020} trays a shelf.` };
        const selected: FootprintBasis = { ...reference, label: `${grid.label}, market-based at ${Math.round((opts.renewableShare ?? 0) * 100)}% renewable supply`, kgCo2ePerTray: market.co2eKg };
        lines.push({ kind: 'light', name: `Light: ${regime.name}`, quantityPerTray: kwhPerTray, quantityUnit: 'kWh', massKgPerTray: null, reference, selected, options: [], status, note: reference.note });
        // The fixture's manufacture, amortized over its life hours, for the hours this tray's light-days ran it.
        const proxy = ledEmbodiedFactors.find((l) => l.key === 'ferreira-linear-luminaire');
        if (proxy) {
          const fixtureHours = fixture.perShelf.value * hours * lightDays / TRAYS_PER_SHELF_1020 * density;
          const kg = (proxy.embodiedKgCo2e / proxy.lifeHours) * fixtureHours;
          const cstatus = weakest(proxy.provenance.status, 'UNCONFIRMED', fixture.perShelf.status)!;
          const basis: FootprintBasis = { kind: 'factor', optionId: null, label: `${proxy.label}, embodied, over ${proxy.lifeHours.toLocaleString()} h`, kgCo2ePerTray: kg, provenance: proxy.provenance, status: cstatus, note: `A ${proxy.watts} W luminaire standing in for the ${fixture.name}; ${proxy.embodiedKgCo2e} kg CO2e made, spread over its life hours.` };
          lines.push({ kind: 'capital', name: `Fixture manufacture: ${fixture.name}`, quantityPerTray: fixtureHours, quantityUnit: 'fixture-hours', massKgPerTray: null, reference: basis, selected: basis, options: [], status: cstatus, note: basis.note });
        }
        break;
      }
    }
  }

  // Capital the plan cannot count yet, listed so the gap is visible.
  lines.push({ kind: 'capital', name: 'Rack share', quantityPerTray: 0, quantityUnit: 'kg steel', massKgPerTray: null, reference: null, selected: null, options: [], status: null, excludedReason: 'The rack is lightweight stainless steel wire, 2x4 ft, six shelves (stated); its mass and a stainless steel declaration are not on file.', note: '' });
  lines.push({ kind: 'capital', name: `Tray set wear: ${format.traySet}`, quantityPerTray: 1 / format.traySetUses.value, quantityUnit: 'sets', massKgPerTray: null, reference: null, selected: null, options: [], status: null, excludedReason: 'The set\'s mass is not on file; its dollars amortize over the uses the format states.', note: '' });

  // Water: a volume, no CO2e.
  const waterL = costing.waterOzPerTray * L_PER_FL_OZ;
  lines.push({ kind: 'water', name: 'Water over the cycle', quantityPerTray: waterL, quantityUnit: 'L', massKgPerTray: waterL, reference: null, selected: null, options: [], status: null, excludedReason: 'Water is carried as a volume. The utility\'s supply and treatment energy per gallon is not a factor on file.', note: `${costing.waterOzPerTray.toFixed(1)} fl oz, ${costing.measured ? 'as approved time studies measured' : 'at the stage schedule\'s placeholder volumes'}.` });

  const all = [...lines, ...freightLines, ...endOfLife];

  const totals = (pick: (l: TrayFootprintLine) => FootprintBasis | null): FootprintTotals => {
    const t = zero();
    for (const l of all) {
      const b = pick(l);
      const bucket = bucketOf[l.kind];
      if (!b || !bucket) continue;
      t[bucket] += b.kgCo2ePerTray;
      t.total += b.kgCo2ePerTray;
    }
    return t;
  };
  const reference = totals((l) => l.reference);
  const selected = totals((l) => l.selected);

  const harvestStatus = plan.lines.filter((l): l is Extract<typeof l, { kind: 'seed' }> => l.kind === 'seed').map((l) => seedLineHarvest(l, plan.format, ctx.varieties).status);
  const harvest = { value: costing.harvestGramsPerTray, status: weakest(...harvestStatus) ?? 'PLACEHOLDER' };
  const perKgOf = (t: FootprintTotals): FootprintTotals => {
    const kg = harvest.value / 1000;
    const out = zero();
    for (const k of Object.keys(out) as (keyof FootprintTotals)[]) out[k] = t[k] / kg;
    return out;
  };

  return {
    code: plan.code,
    formatName: format.name,
    lines: all,
    perTray: { reference, selected },
    harvestGramsPerTray: harvest,
    perKg: harvest.value > 0 ? { reference: perKgOf(reference), selected: perKgOf(selected), status: harvest.status } : null,
    kwhPerTray,
    lightDays,
    waterLPerTray: waterL,
    weakestStatus: weakest(...all.map((l) => l.status)),
    excluded: all.filter((l) => l.excludedReason).map((l) => ({ name: l.name, reason: l.excludedReason! })),
  };
}

function matEndOfLife(name: string, massKg: number, massStatus: StatusTag, compostShare: number): TrayFootprintLine {
  const landfill = warmYardTrimmings.landfill;
  const compost = warmYardTrimmings.compost;
  const kg = massKg * WARM_KG_PER_KG * ((1 - compostShare) * landfill.mtco2ePerShortTon + compostShare * compost.mtco2ePerShortTon);
  const prov = compostShare >= 0.5 ? compost.provenance : landfill.provenance;
  const basis: FootprintBasis = { kind: 'factor', optionId: null, label: `Yard trimmings (WARM v15), ${Math.round(compostShare * 100)}% composted`, kgCo2ePerTray: kg, provenance: prov, status: weakest(landfill.provenance.status, massStatus)!, note: 'The spent medium with its roots read as yard trimmings; the roots\' own mass is not on file, so the mass is the medium\'s alone. Negative is carbon the pathway stores.' };
  return { kind: 'end-of-life', name: `End of life: ${name}`, quantityPerTray: massKg, quantityUnit: 'kg', massKgPerTray: massKg, reference: basis, selected: basis, options: [], status: basis.status, note: basis.note };
}

// ── The regimes side by side (decision 8) ───────────────────────────────────

export interface RegimeEnergyRow {
  key: string;
  name: string;
  photoperiodHours: number;
  kwhPerTray: number;
  kgCo2ePerTray: number;
  /** The regime the plan's light line names. */
  onPlan: boolean;
  /** What the regime is for, as the science library states it, with its rows. */
  intent: string;
  rows: number[];
}

/** Each regime's electricity for this plan's lit days on the shelf's fixtures: facts beside the regime's intent, no verdict. */
export function regimeEnergyTable(plan: GrowPlanDef, opts: Pick<TrayFootprintOptions, 'grid' | 'costContext'> = {}): RegimeEnergyRow[] {
  const ctx = costContextFor(plan, opts.costContext ?? {});
  const costing = costGrowPlan(plan, ctx);
  const grid = opts.grid ?? gridFactorERCT;
  const format = TRAY_FORMAT_BY_KEY[plan.format]!;
  const density = densityFactorOf(format);
  const onPlan = plan.lines.find((l) => l.kind === 'light');
  if (!onPlan || costing.lightDays === 0) return [];
  return Object.values(ctx.regimes).map((r) => {
    const kwh = ((ctx.fixture.watts.value * ctx.fixture.perShelf.value) / 1000) * r.photoperiodHours.value / TRAYS_PER_SHELF_1020 * density * costing.lightDays;
    const { location } = postElectricity({ id: `regime:${r.key}`, module: 3, period: 'per tray', quantity: kwh, unit: 'kWh' }, { grid });
    return { key: r.key, name: r.name, photoperiodHours: r.photoperiodHours.value, kwhPerTray: kwh, kgCo2ePerTray: location.co2eKg, onPlan: onPlan.regimeKey === r.key, intent: r.intent, rows: r.rows };
  });
}
