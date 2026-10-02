/**
 * Cotyledon — carbon and resource accounting engine.
 *
 * Pure, deterministic functions. Mirrors the financial ledger: an ACTIVITY
 * record (a quantity of something, from a document) times a PINNED FACTOR
 * produces an immutable EMISSION POSTING that carries the gases, the CO2e,
 * the factor id and version, and the GWP basis used. Nothing derived is
 * stored; aggregation and normalization recompute from postings.
 *
 * Findings (the AIM Act leak-repair rule) cite the rule and the computed quantity.
 * They do not say what the operator should do.
 */

import {
  gwpAR5,
  refrigerantGwpAR4,
  combustionFactors,
  gridFactorERCT,
  freightFactorSmartWay,
  warmFoodWaste,
  aimActRules,
  type FuelId,
  type BillUnit,
  type GwpBasis,
  type GridFactor,
  type WastePathway,
  type FoodFactor,
  type FactorProvenance,
  inputFactors,
  growPlanFoodCategoryMap,
  type GrowPlanFoodMapping,
  KG_PER_LB,
  KG_PER_OZ,
} from '@/data/emission-factors';
import type { GrowPlanDef } from '@/data/grow-plan';
import { purchaseLines } from '@/engine/grow-purchase';
import { lcaOptions as defaultLcaOptions, type LcaOption, type LcaBoundary } from '@/data/lca-options';
import type { EnergyActivity, WaterActivity, EquipmentAttrs, ServiceAdd } from '@/engine/scenario';
import { canopyMassPerUnit } from '@/engine';
import { haversineMiles } from '@/engine/geo';

// ── Unit identities (arithmetic, not research figures) ──────────────────────

export { KG_PER_LB, KG_PER_OZ };
export const KG_PER_SHORT_TON = 2000 * KG_PER_LB;
export const MMBTU_PER_THERM = 0.1;
export const SCF_PER_CCF = 100;
export const KWH_PER_MWH = 1000;

// ── Types ───────────────────────────────────────────────────────────────────

export type Scope = 1 | 2 | 3;
export type Scope2Method = 'location' | 'market';

export interface ActivityRecord {
  id: string;
  /** Module number from the sustainability scope (0–9). */
  module: number;
  /** ISO date or period label, e.g. '2026-03' or '2026-03-14'. */
  period: string;
  quantity: number;
  unit: string;
  /** Reference to the source document (invoice number, service ticket, lab report). */
  sourceDoc?: string;
}

export interface Gases {
  co2Kg: number;
  ch4Kg: number;
  n2oKg: number;
}

export interface EmissionPosting extends Gases {
  activityId: string;
  module: number;
  period: string;
  scope: Scope;
  /** Present only on Scope 2 postings. */
  scope2Method?: Scope2Method;
  category: string;
  co2eKg: number;
  gwpBasis: GwpBasis;
  factorId: string;
  factorVersion: string;
  factorStatus: FactorProvenance['status'];
  /** Status of the activity quantity itself when it is weaker than the factor (e.g. a centroid distance). */
  activityStatus?: FactorProvenance['status'];
}

// ── CO2e ────────────────────────────────────────────────────────────────────

/** Convert the three inventory gases to CO2e on the AR5 basis. */
export function co2e(g: Gases): number {
  return g.co2Kg + g.ch4Kg * gwpAR5.CH4 + g.n2oKg * gwpAR5.N2O;
}

function post(
  activity: ActivityRecord,
  scope: Scope,
  category: string,
  gases: Gases,
  factor: FactorProvenance,
  gwpBasis: GwpBasis = 'AR5',
  scope2Method?: Scope2Method,
  co2eOverride?: number,
): EmissionPosting {
  return {
    activityId: activity.id,
    module: activity.module,
    period: activity.period,
    scope,
    scope2Method,
    category,
    ...gases,
    co2eKg: co2eOverride ?? co2e(gases),
    gwpBasis,
    factorId: factor.id,
    factorVersion: factor.version,
    factorStatus: factor.status,
  };
}

// ── Scope 1: combustion ─────────────────────────────────────────────────────

/** Convert a bill quantity in any supported unit to MMBtu for the given fuel. */
export function mmbtuFromBill(fuel: FuelId, quantity: number, unit: BillUnit): number {
  const f = combustionFactors[fuel];
  switch (unit) {
    case 'mmbtu':
      return quantity;
    case 'therm':
      return quantity * MMBTU_PER_THERM;
    case 'ccf':
      if (f.heatContentUnit !== 'scf') throw new Error(`${fuel} is not billed by volume`);
      return quantity * SCF_PER_CCF * f.heatContentMmbtuPerUnit;
    case 'scf':
      if (f.heatContentUnit !== 'scf') throw new Error(`${fuel} is not billed by volume`);
      return quantity * f.heatContentMmbtuPerUnit;
    case 'gal':
      if (f.heatContentUnit !== 'gal') throw new Error(`${fuel} is not billed by the gallon`);
      return quantity * f.heatContentMmbtuPerUnit;
  }
}

export function postCombustion(
  activity: ActivityRecord,
  fuel: FuelId,
  unit: BillUnit,
  category: 'stationary' | 'mobile' = 'stationary',
): EmissionPosting {
  const f = combustionFactors[fuel];
  const mmbtu = mmbtuFromBill(fuel, activity.quantity, unit);
  const gases: Gases = {
    co2Kg: mmbtu * f.co2KgPerMmbtu,
    ch4Kg: (mmbtu * f.ch4GPerMmbtu) / 1000,
    n2oKg: (mmbtu * f.n2oGPerMmbtu) / 1000,
  };
  return post(activity, 1, `${category}:${fuel}`, gases, f.provenance);
}

// ── Scope 1: fugitive refrigerants ──────────────────────────────────────────

export function postRefrigerantLeak(
  activity: ActivityRecord,
  refrigerant: string,
): EmissionPosting {
  const r = refrigerantGwpAR4[refrigerant];
  if (!r) throw new Error(`No GWP on file for ${refrigerant}`);
  const kg = activity.quantity * KG_PER_LB; // activity quantity is lb added at service
  const gases: Gases = { co2Kg: 0, ch4Kg: 0, n2oKg: 0 };
  return post(activity, 1, `fugitive:${refrigerant}`, gases, r.provenance, 'AR4', undefined, kg * r.gwp);
}

// ── Scope 2: grid electricity, both methods ─────────────────────────────────

export interface ElectricityInput {
  /** Share of the kWh covered by RECs or bundled renewable supply, 0–1. */
  renewableShare?: number;
  grid?: GridFactor;
}

/** Returns the location-based and market-based postings for one kWh activity. */
export function postElectricity(
  activity: ActivityRecord,
  input: ElectricityInput = {},
): { location: EmissionPosting; market: EmissionPosting } {
  const grid = input.grid ?? gridFactorERCT;
  const mwh = activity.quantity / KWH_PER_MWH;
  const perMwh = (lb: number) => lb * KG_PER_LB;
  const gasesFor = (m: number): Gases => ({
    co2Kg: m * perMwh(grid.co2LbPerMwh),
    ch4Kg: m * perMwh(grid.ch4LbPerMwh),
    n2oKg: m * perMwh(grid.n2oLbPerMwh),
  });
  const share = Math.min(1, Math.max(0, input.renewableShare ?? 0));
  return {
    location: post(activity, 2, `grid:${grid.subregion}`, gasesFor(mwh), grid.provenance, 'AR5', 'location'),
    market: post(
      activity,
      2,
      `grid:${grid.subregion}`,
      gasesFor(mwh * (1 - share)),
      grid.provenance,
      'AR5',
      'market',
    ),
  };
}

// ── Scope 3: freight ────────────────────────────────────────────────────────

export function tonMiles(payloadTons: number, miles: number): number {
  return payloadTons * miles;
}

export function postFreight(activity: ActivityRecord): EmissionPosting {
  // activity quantity is ton-miles
  const co2Kg = (activity.quantity * freightFactorSmartWay.gCo2PerTonMile) / 1000;
  return post(activity, 3, 'freight:truck', { co2Kg, ch4Kg: 0, n2oKg: 0 }, freightFactorSmartWay.provenance);
}

// ── Scope 3: waste ──────────────────────────────────────────────────────────

export function postWaste(activity: ActivityRecord, pathway: WastePathway): EmissionPosting {
  // activity quantity is short tons of food waste
  const f = warmFoodWaste[pathway];
  const kg = activity.quantity * f.mtco2ePerShortTon * 1000;
  return post(activity, 3, `waste:${pathway}`, { co2Kg: 0, ch4Kg: 0, n2oKg: 0 }, f.provenance, 'AR5', undefined, kg);
}

export interface WarmNet {
  landfillKg: number;
  compostKg: number;
  netKg: number;
  /** Difference between the split as given and sending everything to landfill. */
  deltaVsAllLandfillKg: number;
}

/** Net CO2e for a tonnage split between landfill and compost. */
export function warmNet(shortTons: number, compostShare: number): WarmNet {
  const share = Math.min(1, Math.max(0, compostShare));
  const landfillKg = shortTons * (1 - share) * warmFoodWaste.landfill.mtco2ePerShortTon * 1000;
  const compostKg = shortTons * share * warmFoodWaste.compost.mtco2ePerShortTon * 1000;
  const allLandfill = shortTons * warmFoodWaste.landfill.mtco2ePerShortTon * 1000;
  return {
    landfillKg,
    compostKg,
    netKg: landfillKg + compostKg,
    deltaVsAllLandfillKg: landfillKg + compostKg - allLandfill,
  };
}

// ── Scope 3: purchased food ─────────────────────────────────────────────────

export function postFood(
  activity: ActivityRecord,
  category: string,
  factors: FoodFactor[],
): EmissionPosting {
  // activity quantity is kg of the food category
  const f = factors.find((x) => x.category === category);
  if (!f) throw new Error(`No food factor on file for ${category}`);
  const kg = activity.quantity * f.kgCo2ePerKg;
  return post(activity, 3, `food:${category}`, { co2Kg: 0, ch4Kg: 0, n2oKg: 0 }, f.provenance, 'AR5', undefined, kg);
}

// ── Status ranking (weakest tag wins in any aggregate) ─────────────────────

const STATUS_RANK: Record<FactorProvenance['status'], number> = {
  SOURCED: 0,
  STATED: 1,
  DERIVED: 1,
  DATED: 2,
  UNCONFIRMED: 3,
  PLACEHOLDER: 4,
};

// ── Scope 3: the grow plan's food footprint per unit ────────────────────────

type GrowPlan = GrowPlanDef;

export interface GrowPlanFoodLine {
  name: string;
  category: string | null;
  massKgPerUnit: number;
  kgCo2ePerUnit: number;
  factorKgCo2ePerKg: number | null;
  /** Weakest tag among the factor and any per-piece mass placeholder. */
  status: FactorProvenance['status'] | null;
  excludedReason?: string;
}

export interface GrowPlanFoodFootprint {
  lines: GrowPlanFoodLine[];
  totalKgCo2ePerUnit: number;
  /** Share of the total from the single largest line, and that line's name. */
  largestLine: { name: string; share: number } | null;
  weakestStatus: FactorProvenance['status'] | null;
}

/**
 * Per-unit Scope 3 food emissions from the plan's purchase lines: the quantity one tray takes (lb → kg,
 * or each × mass per piece), scaled by the channel's unit factor. Lines without a study product are
 * listed as excluded, not silently dropped.
 */
export function growPlanFoodFootprint(
  growPlan: GrowPlan,
  factors: FoodFactor[] = inputFactors,
  map: Record<string, GrowPlanFoodMapping> = growPlanFoodCategoryMap,
  unitFactor = 1,
): GrowPlanFoodFootprint {
  const lines: GrowPlanFoodLine[] = purchaseLines(growPlan).map((ing) => {
    const m = map[ing.name];
    if (!m) {
      return { name: ing.name, category: null, massKgPerUnit: 0, kgCo2ePerUnit: 0, factorKgCo2ePerKg: null, status: null, excludedReason: 'No mapping to a study product.' };
    }
    if (m.category === null) {
      return { name: ing.name, category: null, massKgPerUnit: 0, kgCo2ePerUnit: 0, factorKgCo2ePerKg: null, status: null, excludedReason: m.note ?? 'Excluded.' };
    }
    const f = factors.find((x) => x.category === m.category);
    if (!f) throw new Error(`No food factor on file for ${m.category}`);
    let massPerTray: number;
    if (ing.unit === 'lb') massPerTray = ing.qtyPerTray * KG_PER_LB;
    else {
      if (m.massKgPerEach === undefined) throw new Error(`${ing.name} is bought by the piece; mass per piece missing`);
      massPerTray = ing.qtyPerTray * m.massKgPerEach;
    }
    const massKgPerUnit = massPerTray * unitFactor;
    const statuses = [f.provenance.status, ...(m.massStatus ? [m.massStatus] : [])];
    const status = statuses.reduce((w, s) => (STATUS_RANK[s] > STATUS_RANK[w] ? s : w));
    return {
      name: ing.name,
      category: m.category,
      massKgPerUnit,
      kgCo2ePerUnit: massKgPerUnit * f.kgCo2ePerKg,
      factorKgCo2ePerKg: f.kgCo2ePerKg,
      status,
    };
  });
  const total = lines.reduce((s, l) => s + l.kgCo2ePerUnit, 0);
  const largest = lines.reduce<GrowPlanFoodLine | null>((b, l) => (b === null || l.kgCo2ePerUnit > b.kgCo2ePerUnit ? l : b), null);
  const weakest = lines.reduce<FactorProvenance['status'] | null>(
    (w, l) => (l.status && (w === null || STATUS_RANK[l.status] > STATUS_RANK[w]) ? l.status : w),
    null,
  );
  return {
    lines,
    totalKgCo2ePerUnit: total,
    largestLine: largest && total > 0 ? { name: largest.name, share: largest.kgCo2ePerUnit / total } : null,
    weakestStatus: weakest,
  };
}

// ── Mass per unit (as purchased, and as shipped) ─────────────────────────

/** As-purchased food mass per unit, kg, from every mapped input (excluded lines carry no mass). */
export function seedMassPerUnitKg(
  growPlan: GrowPlan,
  map: Record<string, GrowPlanFoodMapping> = growPlanFoodCategoryMap,
  unitFactor = 1,
): number {
  let perTray = 0;
  for (const ing of purchaseLines(growPlan)) {
    const m = map[ing.name];
    if (!m || m.category === null) continue;
    if (ing.unit === 'lb') perTray += ing.qtyPerTray * KG_PER_LB;
    else if (m.massKgPerEach !== undefined) perTray += ing.qtyPerTray * m.massKgPerEach;
  }
  return perTray * unitFactor;
}

/** Shipped mass per unit, kg: the harvest weight a live tray packs. */
export function shippedMassPerUnitKg(growPlan: GrowPlan, unitFactor = 1): number {
  return canopyMassPerUnit(growPlan, unitFactor) * KG_PER_LB;
}

// ── Scope 3: waste flows from the operating model ───────────────────────────

export interface ShrinkWaste {
  annualUnits: number;
  seedMassPerUnitKg: number;
  shrinkAllowance: number;
  annualKg: number;
  annualShortTons: number;
}

/** Trim, over-packing and spoilage at the shrink allowance, as annual mass. */
export function annualShrinkWaste(
  annualUnits: number,
  seedMassKg: number,
  shrinkAllowance: number,
): ShrinkWaste {
  const annualKg = annualUnits * seedMassKg * shrinkAllowance;
  return { annualUnits, seedMassPerUnitKg: seedMassKg, shrinkAllowance, annualKg, annualShortTons: annualKg / KG_PER_SHORT_TON };
}

// ── Scope 3: outbound logistics ─────────────────────────────────────────────

export interface PickupPointLeg {
  pickupPointId: string;
  pickupPointName: string;
  county: string;
  dailyUnits: number;
  placed: boolean;
  milesOneWay: number | null;
  milesRoundTrip: number | null;
  payloadShortTons: number;
  tonMiles: number | null;
  kgCo2ePerDay: number | null;
}

export interface OutboundLogistics {
  legs: PickupPointLeg[];
  placedPickupPoints: number;
  unplacedPickupPoints: number;
  totalTonMilesPerDay: number;
  totalKgCo2ePerDay: number;
  totalUnitsPlaced: number;
  kgCo2ePerUnitDistributed: number;
  factor: FactorProvenance;
}

/** Out-and-back per pickup point from the farm at the SmartWay average, payload = units × shipped mass. */
export function outboundLogistics(
  pickupPoints: { id: string; name: string; county: string; dailyForecastUnits: number; coords: { lat: number; lng: number } | null }[],
  home: { lat: number; lng: number },
  shippedMassKg: number,
): OutboundLogistics {
  const legs: PickupPointLeg[] = pickupPoints.map((s) => {
    const payloadShortTons = (s.dailyForecastUnits * shippedMassKg) / KG_PER_SHORT_TON;
    if (!s.coords) {
      return { pickupPointId: s.id, pickupPointName: s.name, county: s.county, dailyUnits: s.dailyForecastUnits, placed: false, milesOneWay: null, milesRoundTrip: null, payloadShortTons, tonMiles: null, kgCo2ePerDay: null };
    }
    const oneWay = haversineMiles(home, s.coords);
    const rt = oneWay * 2;
    // Payload rides the outbound leg; the return leg runs empty, so ton-miles use one-way distance.
    const tm = payloadShortTons * oneWay;
    return { pickupPointId: s.id, pickupPointName: s.name, county: s.county, dailyUnits: s.dailyForecastUnits, placed: true, milesOneWay: oneWay, milesRoundTrip: rt, payloadShortTons, tonMiles: tm, kgCo2ePerDay: (tm * freightFactorSmartWay.gCo2PerTonMile) / 1000 };
  });
  const placed = legs.filter((l) => l.placed);
  const totalTonMiles = placed.reduce((s, l) => s + (l.tonMiles ?? 0), 0);
  const totalKg = placed.reduce((s, l) => s + (l.kgCo2ePerDay ?? 0), 0);
  const unitsPlaced = placed.reduce((s, l) => s + l.dailyUnits, 0);
  return {
    legs,
    placedPickupPoints: placed.length,
    unplacedPickupPoints: legs.length - placed.length,
    totalTonMilesPerDay: totalTonMiles,
    totalKgCo2ePerDay: totalKg,
    totalUnitsPlaced: unitsPlaced,
    kgCo2ePerUnitDistributed: unitsPlaced > 0 ? totalKg / unitsPlaced : 0,
    factor: freightFactorSmartWay.provenance,
  };
}

// ── Dual-basis food reporting: reference (study mean) beside selected ───────

/**
 * Bring a farm-gate or slaughter-gate figure onto the study's retail-weight
 * boundary using the study's own stage split for that product:
 *   aligned = (figure + downstream stages) × (1 + loss ratio)
 * where downstream = transport & storage + packaging + retail, plus processing
 * for a farm-gate figure (a slaughter-gate figure already includes it), and
 * loss ratio = the study's loss stage ÷ (total − loss). Losses scale with the
 * upstream intensity of the product actually lost, so they are applied as a
 * ratio, not added as a constant. Applying this to the study's own farm-
 * through-processing sum reproduces the study mean.
 */
export function alignToRetail(kgPerKg: number, boundary: LcaBoundary, factor: FoodFactor): number {
  if (boundary === 'retail') return kgPerKg;
  const st = factor.stages;
  const downstream =
    st.transportStorage + st.packaging + st.retail + (boundary === 'farm_gate' ? st.processing : 0);
  const base = factor.kgCo2ePerKg - st.loss;
  const lossRatio = base > 0 ? st.loss / base : 0;
  return (kgPerKg + downstream) * (1 + lossRatio);
}

export interface BasisValue {
  kind: 'study_mean' | 'cited_lca' | 'supplier';
  optionId: string | null;
  label: string;
  /** kg CO2e per kg at the option's own boundary. */
  rawKgPerKg: number;
  boundary: LcaBoundary;
  /** kg CO2e per kg aligned to retail weight (equals raw when boundary is retail). */
  alignedKgPerKg: number;
  kgCo2ePerUnit: number;
  provenance: FactorProvenance;
  status: FactorProvenance['status'];
}

export interface DualFoodLine {
  name: string;
  category: string | null;
  massKgPerUnit: number;
  reference: BasisValue | null;
  selected: BasisValue | null;
  /** Options available for this input beyond the study mean. */
  options: LcaOption[];
  excludedReason?: string;
}

export interface DualFoodFootprint {
  lines: DualFoodLine[];
  referenceTotalKgPerUnit: number;
  selectedTotalKgPerUnit: number;
  /** selected − reference: negative is a credit against the study mean. */
  gapKgPerUnit: number;
  linesOnSelectedBasis: number;
  weakestSelectedStatus: FactorProvenance['status'] | null;
}

/**
 * Both bases per line. `selection` maps input name → option id; an
 * absent or unknown id falls back to the study mean. Per-unit figures on
 * the selected basis use the retail-aligned value so both columns share one
 * boundary; the raw figure is carried alongside for display.
 */
export function growPlanFoodFootprintDual(
  growPlan: GrowPlan,
  selection: Record<string, string> = {},
  factors: FoodFactor[] = inputFactors,
  map: Record<string, GrowPlanFoodMapping> = growPlanFoodCategoryMap,
  options: LcaOption[] = defaultLcaOptions,
  unitFactor = 1,
): DualFoodFootprint {
  const ref = growPlanFoodFootprint(growPlan, factors, map, unitFactor);
  const lines: DualFoodLine[] = ref.lines.map((l) => {
    const avail = options.filter((o) => o.input === l.name);
    if (!l.category || l.factorKgCo2ePerKg === null) {
      return { name: l.name, category: null, massKgPerUnit: 0, reference: null, selected: null, options: avail, excludedReason: l.excludedReason };
    }
    const f = factors.find((x) => x.category === l.category)!;
    const reference: BasisValue = {
      kind: 'study_mean',
      optionId: null,
      label: `Study mean, ${f.label}`,
      rawKgPerKg: f.kgCo2ePerKg,
      boundary: 'retail',
      alignedKgPerKg: f.kgCo2ePerKg,
      kgCo2ePerUnit: l.kgCo2ePerUnit,
      provenance: f.provenance,
      status: l.status ?? f.provenance.status,
    };
    const chosen = avail.find((o) => o.id === selection[l.name]);
    let selected: BasisValue = reference;
    if (chosen) {
      const aligned = alignToRetail(chosen.kgCo2ePerKg, chosen.boundary, f);
      const massStatus = map[l.name]?.massStatus;
      const statuses: FactorProvenance['status'][] = [chosen.provenance.status, ...(massStatus ? [massStatus] : []), 'DERIVED'];
      const status = statuses.reduce((w, x) => (STATUS_RANK[x] > STATUS_RANK[w] ? x : w));
      selected = {
        kind: chosen.kind,
        optionId: chosen.id,
        label: chosen.label,
        rawKgPerKg: chosen.kgCo2ePerKg,
        boundary: chosen.boundary,
        alignedKgPerKg: aligned,
        kgCo2ePerUnit: l.massKgPerUnit * aligned,
        provenance: chosen.provenance,
        status: chosen.boundary === 'retail' ? chosen.provenance.status : status,
      };
    }
    return { name: l.name, category: l.category, massKgPerUnit: l.massKgPerUnit, reference, selected, options: avail };
  });
  const refTotal = lines.reduce((s, l) => s + (l.reference?.kgCo2ePerUnit ?? 0), 0);
  const selTotal = lines.reduce((s, l) => s + (l.selected?.kgCo2ePerUnit ?? 0), 0);
  const onSelected = lines.filter((l) => l.selected && l.selected.optionId !== null);
  const weakest = onSelected.reduce<FactorProvenance['status'] | null>(
    (w, l) => (l.selected && (w === null || STATUS_RANK[l.selected.status] > STATUS_RANK[w]) ? l.selected.status : w),
    null,
  );
  return {
    lines,
    referenceTotalKgPerUnit: refTotal,
    selectedTotalKgPerUnit: selTotal,
    gapKgPerUnit: selTotal - refTotal,
    linesOnSelectedBasis: onSelected.length,
    weakestSelectedStatus: weakest,
  };
}

// ── Aggregation and normalizers ─────────────────────────────────────────────

export interface ScopeTotals {
  scope1Kg: number;
  scope2Kg: number;
  scope3Kg: number;
  totalKg: number;
  scope2Method: Scope2Method;
  /** Lowest-confidence factor status present in the aggregate. */
  weakestFactorStatus: FactorProvenance['status'] | null;
}


export function aggregateByScope(
  postings: EmissionPosting[],
  scope2Method: Scope2Method = 'location',
): ScopeTotals {
  let scope1Kg = 0;
  let scope2Kg = 0;
  let scope3Kg = 0;
  let weakest: FactorProvenance['status'] | null = null;
  for (const p of postings) {
    if (p.scope === 2 && p.scope2Method !== scope2Method) continue;
    if (p.scope === 1) scope1Kg += p.co2eKg;
    else if (p.scope === 2) scope2Kg += p.co2eKg;
    else scope3Kg += p.co2eKg;
    for (const st of [p.factorStatus, p.activityStatus]) {
      if (st && (weakest === null || STATUS_RANK[st] > STATUS_RANK[weakest])) weakest = st;
    }
  }
  return {
    scope1Kg,
    scope2Kg,
    scope3Kg,
    totalKg: scope1Kg + scope2Kg + scope3Kg,
    scope2Method,
    weakestFactorStatus: weakest,
  };
}

export interface Normalizers {
  units?: number;
  sqFt?: number;
  operatingDays?: number;
}

export interface NormalizedTotals {
  kgPerUnit?: number;
  kgPerSqFt?: number;
  kgPerOperatingDay?: number;
}

export function normalize(totalKg: number, n: Normalizers): NormalizedTotals {
  return {
    kgPerUnit: n.units ? totalKg / n.units : undefined,
    kgPerSqFt: n.sqFt ? totalKg / n.sqFt : undefined,
    kgPerOperatingDay: n.operatingDays ? totalKg / n.operatingDays : undefined,
  };
}

// ── Refrigerant circuits: leak rate and AIM Act findings ──────────────────────

export interface RefrigerantCircuit {
  id: string;
  equipment: string;
  refrigerant: string;
  fullChargeLb: number;
  /** Installation date, where the equipment attributes carry one. */
  installedOn?: string;
  /** Service events: refrigerant added, in lb, on a date. */
  serviceAdds: { date: string; lbAdded: number }[];
}

/**
 * Annualized leak rate per the EPA method: refrigerant added in a service
 * interval as a share of full charge, scaled to 365 days.
 */
export function annualizedLeakRate(
  fullChargeLb: number,
  lbAdded: number,
  intervalDays: number,
): number {
  if (fullChargeLb <= 0 || intervalDays <= 0) return 0;
  return (lbAdded / fullChargeLb) * (365 / intervalDays);
}

export type FindingStatus = 'not-applicable' | 'within-limit' | 'triggered';

export interface Finding {
  id: string;
  circuitId: string;
  rule: string;
  citation: string;
  citationStatus: FactorProvenance['status'];
  computed: Record<string, number | string>;
  status: FindingStatus;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** Findings for one circuit as of `asOf`. Cites the rule; states the computed quantity; stops. */
export function aimActFindings(circuit: RefrigerantCircuit, asOf: string): Finding[] {
  const gwp = refrigerantGwpAR4[circuit.refrigerant]?.gwp ?? 0;
  const rules = aimActRules;
  const cite = rules.provenance;
  const findings: Finding[] = [];

  const applies =
    circuit.fullChargeLb >= rules.applicabilityMinChargeLb && gwp > rules.applicabilityMinGwp;
  findings.push({
    id: 'aim-applicability',
    circuitId: circuit.id,
    rule: `Leak repair provisions apply to appliances with ≥ ${rules.applicabilityMinChargeLb} lb of a refrigerant with GWP > ${rules.applicabilityMinGwp}`,
    citation: cite.source,
    citationStatus: cite.status,
    computed: { fullChargeLb: circuit.fullChargeLb, gwpAR4: gwp },
    status: applies ? 'triggered' : 'not-applicable',
  });
  if (!applies) return findings;

  // Leak-rate trigger on the most recent service add.
  const adds = [...circuit.serviceAdds].sort((a, b) => a.date.localeCompare(b.date));
  const last = adds[adds.length - 1];
  if (last) {
    const prev = adds.length > 1 ? adds[adds.length - 2].date : circuit.installedOn;
    const interval = prev ? daysBetween(prev, last.date) : 365;
    const rate = annualizedLeakRate(circuit.fullChargeLb, last.lbAdded, interval);
    const triggered = rate >= rules.commercialRefrigerationTriggerRate;
    const repairBy = new Date(Date.parse(last.date) + rules.repairWindowDays * 86_400_000)
      .toISOString()
      .slice(0, 10);
    findings.push({
      id: 'aim-leak-rate',
      circuitId: circuit.id,
      rule: `Commercial refrigeration: annualized leak rate ≥ ${rules.commercialRefrigerationTriggerRate * 100}% requires repair within ${rules.repairWindowDays} days and verification tests`,
      citation: cite.source,
      citationStatus: cite.status,
      computed: {
        lbAdded: last.lbAdded,
        intervalDays: interval,
        annualizedLeakRate: rate,
        ...(triggered ? { repairWindowEnds: repairBy } : {}),
      },
      status: triggered ? 'triggered' : 'within-limit',
    });
  }

  // Chronic leak: total added in the calendar year of `asOf`.
  const year = asOf.slice(0, 4);
  const addedThisYear = adds
    .filter((a) => a.date.startsWith(year))
    .reduce((s, a) => s + a.lbAdded, 0);
  const share = addedThisYear / circuit.fullChargeLb;
  const chronic = share >= rules.chronicLeakShareOfCharge;
  const due = `${Number(year) + 1}-${String(rules.chronicReportDue.month).padStart(2, '0')}-${String(
    rules.chronicReportDue.day,
  ).padStart(2, '0')}`;
  findings.push({
    id: 'aim-chronic-leak',
    circuitId: circuit.id,
    rule: `Refrigerant added ≥ ${rules.chronicLeakShareOfCharge * 100}% of full charge in a calendar year requires a chronic leak report by March 1 of the following year`,
    citation: cite.source,
    citationStatus: cite.status,
    computed: {
      year,
      lbAddedInYear: addedThisYear,
      shareOfCharge: share,
      ...(chronic ? { reportDue: due } : {}),
    },
    status: chronic ? 'triggered' : 'within-limit',
  });

  return findings;
}

// ── S3: energy inventory from annual activity inputs ────────────────────────

export interface EnergyInventory {
  postings: EmissionPosting[];
  location: ScopeTotals;
  market: ScopeTotals;
  /** Any input entered at all. */
  hasActivity: boolean;
}

/** Post the annual fuel and electricity activity; zero quantities post nothing. */
export function energyInventory(e: EnergyActivity, period = 'annual'): EnergyInventory {
  const postings: EmissionPosting[] = [];
  const act = (id: string, module: number, quantity: number, unit: string): ActivityRecord => ({ id, module, period, quantity, unit });
  if (e.naturalGasTherms > 0) postings.push(postCombustion(act('ng', 1, e.naturalGasTherms, 'therm'), 'naturalGas', 'therm'));
  if (e.propaneGal > 0) postings.push(postCombustion(act('lpg', 1, e.propaneGal, 'gal'), 'propaneLiquid', 'gal'));
  if (e.fleetGasolineGal > 0) postings.push(postCombustion(act('gas', 1, e.fleetGasolineGal, 'gal'), 'gasoline', 'gal', 'mobile'));
  if (e.fleetDieselGal > 0) postings.push(postCombustion(act('dsl', 1, e.fleetDieselGal, 'gal'), 'diesel', 'gal', 'mobile'));
  if (e.electricityKwh > 0) {
    const { location, market } = postElectricity(act('kwh', 3, e.electricityKwh, 'kWh'), { renewableShare: e.renewableShare });
    postings.push(location, market);
  }
  return {
    postings,
    location: aggregateByScope(postings, 'location'),
    market: aggregateByScope(postings, 'market'),
    hasActivity: postings.length > 0,
  };
}

// ── S3: refrigerant circuits from equipment attributes ──────────────────────

export interface CircuitRow {
  circuit: RefrigerantCircuit;
  quantity: number;
  gwpOnFile: boolean;
  lbAddedInYear: number;
  co2eKgInYear: number;
  findings: Finding[];
  latestRate: number | null;
}

export interface RefrigerantInventory {
  rows: CircuitRow[];
  totalCo2eKgInYear: number;
  circuitsOnFile: number;
}

/**
 * Every equipment line with a refrigerant and a charge on file is a circuit.
 * Full charge = charge per unit × quantity; service adds are recorded per line.
 */
export function refrigerantInventory(
  equipment: { item: string; qty: number }[],
  attrs: Record<string, EquipmentAttrs>,
  service: Record<string, ServiceAdd[]>,
  asOf: string,
): RefrigerantInventory {
  const year = asOf.slice(0, 4);
  const rows: CircuitRow[] = [];
  for (const e of equipment) {
    const a = attrs[e.item];
    if (!a?.refrigerant || !a.chargeLbPerUnit || a.chargeLbPerUnit <= 0) continue;
    const circuit: RefrigerantCircuit = {
      id: e.item,
      equipment: e.item,
      refrigerant: a.refrigerant,
      fullChargeLb: a.chargeLbPerUnit * e.qty,
      installedOn: a.installedOn || undefined,
      serviceAdds: [...(service[e.item] ?? [])].sort((x, y) => x.date.localeCompare(y.date)),
    };
    const gwp = refrigerantGwpAR4[a.refrigerant];
    const lbAdded = circuit.serviceAdds.filter((x) => x.date.startsWith(year)).reduce((s, x) => s + x.lbAdded, 0);
    const findings = aimActFindings(circuit, asOf);
    const leak = findings.find((f) => f.id === 'aim-leak-rate');
    rows.push({
      circuit,
      quantity: e.qty,
      gwpOnFile: !!gwp,
      lbAddedInYear: lbAdded,
      co2eKgInYear: gwp ? lbAdded * KG_PER_LB * gwp.gwp : 0,
      findings,
      latestRate: leak ? Number(leak.computed.annualizedLeakRate) : null,
    });
  }
  return {
    rows,
    totalCo2eKgInYear: rows.reduce((s, r) => s + r.co2eKgInYear, 0),
    circuitsOnFile: rows.length,
  };
}

// ── Water: the year's volumes from the monthly inputs ────────────────────────

export interface WaterProjection {
  annualMeteredGal: number;
  annualWastewaterMGal: number;
  galPerUnit: number | null;
}

/** Twelve months of the monthly volumes, and the metered water each unit distributed took. */
export function waterProjection(w: WaterActivity, annualUnits: number): WaterProjection {
  const annualMetered = w.meteredGalPerMonth * 12;
  return {
    annualMeteredGal: annualMetered,
    annualWastewaterMGal: w.billedWastewaterMGalPerMonth * 12,
    galPerUnit: annualMetered > 0 && annualUnits > 0 ? annualMetered / annualUnits : null,
  };
}
