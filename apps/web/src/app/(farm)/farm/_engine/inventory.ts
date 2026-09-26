/**
 * MicroFarm — the greenhouse-gas inventory (pure).
 *
 * Assembles every scope from the resolved model into emission postings, the
 * same way the financial statements assemble from the ledger, and reports
 * totals by scope on both Scope 2 methods and both food bases. Every posting
 * carries the factor id, version and status it used; the factor fingerprint
 * pins the whole registry so a later recomputation can be compared to the
 * recorded baseline (ISO 14064-1 baseline restatement).
 */

import type { EnergyActivity, ResolvedInputs, ServiceAdd } from './scenario';
import { mixFoodFootprint, mixShippedMassPerUnitKg, mixShrinkKg, receivedMassKg, type SustainabilityBasis } from './sustainability-basis';
import type { FactorProvenance } from '../_data/emission-factors';
import { factorRegistry, freightFactorSmartWay } from '../_data/emission-factors';
import { lcaOptions as curatedOptions, type LcaOption } from '../_data/lca-options';
import { countsTowardCapital } from './equipment';
import { pickupPoints } from '../_data/seed-invented';
import { FARM_HOME } from '../_data/farm-location';
import { pickupPointCoordinates } from '../_data/pickup-point-geo';
import { facility } from '../_data/plan-data';
import {
  type EmissionPosting,
  type ActivityRecord,
  aggregateByScope,
  normalize,
  energyInventory,
  refrigerantInventory,
  postRefrigerantLeak,
  postWaste,
  outboundLogistics,
  KG_PER_SHORT_TON,
  type ScopeTotals,
  type NormalizedTotals,
} from './carbon';
import { inboundLogistics, type LeanSupplier } from './supplier-links';

// ── Factor fingerprint ──────────────────────────────────────────────────────

/** Stable, dependency-free hash (FNV-1a, 32-bit, hex) of every factor id + version + status. */
export function factorFingerprint(registry: FactorProvenance[] = factorRegistry): string {
  const text = [...registry]
    .map((f) => `${f.id}|${f.version}|${f.status}`)
    .sort()
    .join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ── Restatement check ───────────────────────────────────────────────────────

export interface RestatementCheck {
  hasBaseline: boolean;
  baselineTotalKg: number | null;
  currentTotalKg: number;
  deltaKg: number | null;
  deltaShare: number | null;
  threshold: number;
  fingerprintChanged: boolean;
  /** Restatement is indicated when the delta exceeds the threshold or the factor set changed. */
  restatementIndicated: boolean;
  reasons: string[];
}

export function restatementCheck(
  currentTotalKg: number,
  currentFingerprint: string,
  audit: ResolvedInputs['sustainability']['audit'],
): RestatementCheck {
  const has = audit.baselineTotalKg !== null;
  const delta = has ? currentTotalKg - (audit.baselineTotalKg as number) : null;
  const share = has && (audit.baselineTotalKg as number) > 0 ? Math.abs(delta as number) / (audit.baselineTotalKg as number) : null;
  const fpChanged = has && audit.baselineFingerprint !== null && audit.baselineFingerprint !== currentFingerprint;
  const reasons: string[] = [];
  if (share !== null && share > audit.materialityThreshold) reasons.push(`Recomputed total differs from the recorded baseline by ${(share * 100).toFixed(1)}%, above the ${(audit.materialityThreshold * 100).toFixed(0)}% threshold`);
  if (fpChanged) reasons.push('The factor set (ids, versions or statuses) differs from the one the baseline was recorded with');
  return {
    hasBaseline: has,
    baselineTotalKg: audit.baselineTotalKg,
    currentTotalKg,
    deltaKg: delta,
    deltaShare: share,
    threshold: audit.materialityThreshold,
    fingerprintChanged: fpChanged,
    restatementIndicated: reasons.length > 0,
    reasons,
  };
}

// ── Full inventory ──────────────────────────────────────────────────────────

export interface InventoryLine {
  scope: 1 | 2 | 3;
  category: string;
  label: string;
  kg: number;
  basis: string;
  activity: string;
  weakest: FactorProvenance['status'] | null;
}

export interface FullInventory {
  asOf: string;
  fingerprint: string;
  postings: EmissionPosting[];
  /** Reference food basis, location-based Scope 2. */
  reference: { location: ScopeTotals; market: ScopeTotals };
  /** Selected food basis, location-based Scope 2. */
  selected: { location: ScopeTotals; market: ScopeTotals };
  foodReferenceKg: number;
  foodSelectedKg: number;
  foodGapKg: number;
  linesOnSelectedBasis: number;
  annualUnits: number;
  operatingDays: number;
  normalizers: { reference: NormalizedTotals; selected: NormalizedTotals };
  lines: InventoryLine[];
  weakest: FactorProvenance['status'] | null;
}

function status(p: EmissionPosting[]): FactorProvenance['status'] | null {
  return aggregateByScope(p, 'location').weakestFactorStatus;
}

/**
 * Assemble the annual inventory from the resolved model. `suppliers` are the
 * lean records for linked supplier ids (inbound freight); `options` are the
 * supplier-specific LCA options on file.
 */
export interface InventoryWorld {
  /** The period's volume on the selected ledger. */
  basis: SustainabilityBasis;
  /** Plan: the scenario's typed quantities. Actual: the year's bills. */
  energy: EnergyActivity;
  /** Plan: none — a forecast carries no leaks. Actual: the service records. */
  refrigerantService: Record<string, ServiceAdd[]>;
}

export function fullInventory(
  R: ResolvedInputs,
  asOf: string,
  world: InventoryWorld,
  suppliers: Record<string, LeanSupplier> = {},
  options: LcaOption[] = curatedOptions,
): FullInventory {
  const S = R.sustainability;
  const { basis } = world;
  const pfByChannel = Object.fromEntries(R.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>;
  const operatingDays = basis.distributionDays;
  const annualUnits = basis.totalUnits;
  const period = basis.kind === 'plan' ? `${basis.from}..${basis.to}` : String(S.audit.reportingYear);
  const act = (id: string, module: number, quantity: number, unit: string): ActivityRecord => ({ id, module, period, quantity, unit });
  const postings: EmissionPosting[] = [];
  const lines: InventoryLine[] = [];

  // Scope 1 + 2: energy.
  const energy = energyInventory(world.energy, period);
  postings.push(...energy.postings);
  const s1energy = energy.postings.filter((p) => p.scope === 1);
  lines.push({ scope: 1, category: 'combustion', label: 'Stationary and mobile combustion', kg: energy.location.scope1Kg, basis: 'AR5', activity: s1energy.length ? 'annual fuel inputs' : 'none on file', weakest: status(s1energy) });

  // Scope 1: fugitive refrigerants, one posting per service add this year.
  const carriedEquipment = R.equipment.filter((e) => countsTowardCapital(e.status)).map((e) => ({ item: e.key, qty: e.qty }));
  const refr = refrigerantInventory(carriedEquipment, S.equipment, world.refrigerantService, asOf);
  const refrPostings: EmissionPosting[] = [];
  for (const r of refr.rows) {
    if (!r.gwpOnFile) continue;
    for (const a of r.circuit.serviceAdds.filter((x) => x.date.startsWith(asOf.slice(0, 4)))) {
      refrPostings.push(postRefrigerantLeak(act(`ref:${r.circuit.id}:${a.date}`, 2, a.lbAdded, 'lb'), r.circuit.refrigerant));
    }
  }
  postings.push(...refrPostings);
  lines.push({ scope: 1, category: 'fugitive', label: 'Fugitive refrigerants', kg: refrPostings.reduce((s, p) => s + p.co2eKg, 0), basis: 'AR4, as the rule uses', activity: refr.circuitsOnFile ? `${refr.circuitsOnFile} circuit(s)` : 'no circuits on file', weakest: status(refrPostings) });
  lines.push({ scope: 2, category: 'electricity-location', label: 'Electricity, location-based', kg: energy.location.scope2Kg, basis: 'AR5', activity: energy.location.scope2Kg > 0 ? 'annual kWh' : 'none on file', weakest: status(energy.postings.filter((p) => p.scope2Method === 'location')) });
  lines.push({ scope: 2, category: 'electricity-market', label: 'Electricity, market-based', kg: energy.market.scope2Kg, basis: 'AR5', activity: energy.location.scope2Kg > 0 ? `${Math.round(world.energy.renewableShare * 100)}% renewable supply` : 'none on file', weakest: status(energy.postings.filter((p) => p.scope2Method === 'market')) });

  // Scope 3: purchased food, both bases, crop plan by crop plan over the units distributed.
  const foodRef: EmissionPosting[] = [];
  const foodSel: EmissionPosting[] = [];
  const mix = mixFoodFootprint({ basis, cropPlans: R.cropPlans, unitFactorByChannel: pfByChannel, selection: S.inputBasis, options });
  const linesOnSelected = mix.linesOnSelectedBasis;
  const perInput = new Map(mix.byInput.map((i) => [i.name, { ref: i.referenceKg, sel: i.selectedKg, refP: i.reference, selP: i.selected, selStatus: i.selectedStatus, massKg: i.massKg }]));
  for (const [name, v] of perInput) {
    const base = act(`food:${name}`, 4, v.massKg, 'kg');
    foodRef.push({ activityId: base.id, module: 4, period, scope: 3, category: `food:${name}`, co2Kg: 0, ch4Kg: 0, n2oKg: 0, co2eKg: v.ref, gwpBasis: 'AR5', factorId: v.refP.id, factorVersion: v.refP.version, factorStatus: v.refP.status });
    foodSel.push({ activityId: base.id, module: 4, period, scope: 3, category: `food-selected:${name}`, co2Kg: 0, ch4Kg: 0, n2oKg: 0, co2eKg: v.sel, gwpBasis: 'AR5', factorId: v.selP.id, factorVersion: v.selP.version, factorStatus: v.selStatus });
  }
  postings.push(...foodRef, ...foodSel);
  const foodReferenceKg = foodRef.reduce((s, p) => s + p.co2eKg, 0);
  const foodSelectedKg = foodSel.reduce((s, p) => s + p.co2eKg, 0);
  lines.push({ scope: 3, category: 'food-reference', label: 'Purchased food, reference basis', kg: foodReferenceKg, basis: 'study means', activity: 'crop plans × units distributed', weakest: status(foodRef) });
  lines.push({ scope: 3, category: 'food-selected', label: 'Purchased food, selected basis', kg: foodSelectedKg, basis: linesOnSelected ? `${linesOnSelected} line(s) on a cited or supplier figure` : 'no selections; equals the reference', activity: 'crop plans × units distributed', weakest: status(foodSel) });

  // Scope 3: waste, the period's shrink on production split by the compost share.
  const shrinkKg = mixShrinkKg(basis, R.cropPlans, R.assumptions.yield.shrinkAllowance.value).kg;
  const shrink = { annualShortTons: shrinkKg / KG_PER_SHORT_TON };
  const wastePostings: EmissionPosting[] = [];
  const landfillTons = shrink.annualShortTons * (1 - S.waste.compostShare);
  const compostTons = shrink.annualShortTons * S.waste.compostShare;
  if (landfillTons > 0) wastePostings.push(postWaste(act('waste:landfill', 8, landfillTons, 'short ton'), 'landfill'));
  if (compostTons > 0) wastePostings.push(postWaste(act('waste:compost', 8, compostTons, 'short ton'), 'compost'));
  postings.push(...wastePostings);
  lines.push({ scope: 3, category: 'waste', label: 'Food waste, shrink allowance', kg: wastePostings.reduce((s, p) => s + p.co2eKg, 0), basis: 'WARM v15', activity: `${shrink.annualShortTons.toFixed(1)} tons, ${Math.round(S.waste.compostShare * 100)}% composted`, weakest: status(wastePostings) });

  // Scope 3: freight over the period — inbound from the receipts, outbound from the distributions; placement is placeholder precision.
  const inbound = inboundLogistics(receivedMassKg(basis), S.inputSupplier, suppliers, FARM_HOME);
  const pickupPointById = new Map(pickupPoints.map((x) => [x.id, x]));
  const outbound = outboundLogistics(
    basis.byPickupPoint.map((b) => {
      const seed = b.pickupPointId ? pickupPointById.get(b.pickupPointId) : undefined;
      return { id: b.pickupPointId ?? b.pickupPointName ?? 'pickupPoint', name: b.pickupPointName ?? seed?.name ?? 'Pickup point', county: seed?.county ?? '', dailyForecastUnits: b.units, coords: seed ? pickupPointCoordinates(seed.county) : null };
    }),
    FARM_HOME,
    mixShippedMassPerUnitKg(basis, R.cropPlans, pfByChannel),
  );
  const freightPostings: EmissionPosting[] = [];
  const freightProv = freightFactorSmartWay.provenance;
  const mk = (id: string, kg: number): EmissionPosting => ({ activityId: id, module: 6, period, scope: 3, category: id, co2Kg: kg, ch4Kg: 0, n2oKg: 0, co2eKg: kg, gwpBasis: 'AR5', factorId: freightProv.id, factorVersion: freightProv.version, factorStatus: freightProv.status, activityStatus: 'PLACEHOLDER' });
  if (inbound.totalKgCo2e > 0) freightPostings.push(mk('freight:inbound', inbound.totalKgCo2e));
  if (outbound.totalKgCo2ePerDay > 0) freightPostings.push(mk('freight:outbound', outbound.totalKgCo2ePerDay));
  postings.push(...freightPostings);
  lines.push({ scope: 3, category: 'freight', label: 'Freight, inbound and outbound', kg: freightPostings.reduce((s, p) => s + p.co2eKg, 0), basis: 'SmartWay average', activity: 'receipts and distributions in the period; centroid distances', weakest: freightPostings.length ? 'PLACEHOLDER' : null });

  const isSel = (p: EmissionPosting) => p.category.startsWith('food-selected:');
  const isRef = (p: EmissionPosting) => p.category.startsWith('food:');
  const refSet = postings.filter((p) => !isSel(p));
  const selSet = postings.filter((p) => !isRef(p));
  const reference = { location: aggregateByScope(refSet, 'location'), market: aggregateByScope(refSet, 'market') };
  const selected = { location: aggregateByScope(selSet, 'location'), market: aggregateByScope(selSet, 'market') };
  const norm = { units: annualUnits, sqFt: facility.sizeSqFt.value, operatingDays };

  return {
    asOf,
    fingerprint: factorFingerprint(),
    postings,
    reference,
    selected,
    foodReferenceKg,
    foodSelectedKg,
    foodGapKg: foodSelectedKg - foodReferenceKg,
    linesOnSelectedBasis: linesOnSelected,
    annualUnits,
    operatingDays,
    normalizers: { reference: normalize(reference.location.totalKg, norm), selected: normalize(selected.location.totalKg, norm) },
    lines,
    weakest: reference.location.weakestFactorStatus,
  };
}
