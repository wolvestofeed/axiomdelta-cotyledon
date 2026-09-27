/**
 * MicroFarm — the volume a sustainability figure divides by and multiplies (Roadmap
 * N6 slice 4). One function over either ledger's documents, so Plan and Actual
 * count the same way:
 *
 *   Plan    the open forecast's own timeline, its first year from the start date.
 *   Actual  the recorded sowing records, receipts and distributions in the reporting
 *           year, a calendar year.
 *
 * Units are counted by crop plan and channel from the distributions, production from the
 * sowing records, inbound mass from the receipts and outbound units by distribution
 * pickup point. It replaces channel units a day × operating days on one reference crop plan
 * and the typed planning day (audit A11). Nothing here is stored.
 */

import { lineLabel, type GrowPlanDef } from '@/data/grow-plan';
import type { ActualsBundle } from '@/engine/actuals';
import type { LedgerKind } from '@/engine/ledger-view';
import { finishedGoodsOnHand, unitFactorFor } from '@/engine/production-plan';
import {
  seedMassPerUnitKg,
  cropPlanFoodFootprintDual,
  shippedMassPerUnitKg,
  KG_PER_LB,
} from '@/engine/carbon';
import { inputFactors, cropPlanFoodCategoryMap } from '@/data/emission-factors';
import type { LcaOption } from '@/data/lca-options';

export interface UnitsByCropPlan {
  /** Null when the distribution named no crop plan. */
  cropPlanCode: string | null;
  channel: number;
  units: number;
}

export interface PickupPointUnits {
  pickupPointId: string | null;
  pickupPointName: string | null;
  units: number;
  distributionDays: number;
}

export interface SustainabilityBasis {
  kind: LedgerKind;
  from: string;
  to: string;
  /** Distributed units by crop plan and channel. */
  units: UnitsByCropPlan[];
  totalUnits: number;
  /** Distinct dates with a distribution. */
  distributionDays: number;
  /** Distinct dates with a sowing. */
  productionDays: number;
  /** Good base units produced, by crop plan. */
  producedByCropPlan: Record<string, number>;
  /** Received quantity by input and unit; rejected lines excluded. */
  received: { input: string; unit: 'lb' | 'each'; qty: number }[];
  byPickupPoint: PickupPointUnits[];
  /** Finished base units that passed shelf life unshipped in the window, by crop plan. */
  expiredByCropPlan: Record<string, number>;
  /** Units distributed with no crop plan named: counted in units, not in food or mass. */
  unitsWithNoCropPlan: number;
}

const inWindow = (d: string, from: string, to: string) => d >= from && d <= to;

export function sustainabilityBasis(input: {
  kind: LedgerKind;
  bundle: Pick<ActualsBundle, 'sowings' | 'receipts' | 'distributions'>;
  from: string;
  to: string;
  shelfLifeDays: number;
  cropPlans: readonly GrowPlanDef[];
  unitFactorByChannel: Record<number, number>;
}): SustainabilityBasis {
  const { bundle, from, to } = input;
  const distributions = bundle.distributions.filter((d) => inWindow(d.distributedOn, from, to));
  const sowings = bundle.sowings.filter((b) => inWindow(b.productionDate, from, to));
  const receipts = bundle.receipts.filter((r) => inWindow(r.receivedOn, from, to));

  const unitKey = new Map<string, UnitsByCropPlan>();
  const pickupPointKey = new Map<string, PickupPointUnits & { dates: Set<string> }>();
  let unitsWithNoCropPlan = 0;
  for (const d of distributions) {
    const code = d.cropPlanCode ?? null;
    if (!code) unitsWithNoCropPlan += d.units;
    const k = `${code ?? ''}|${d.phase}`;
    const row = unitKey.get(k) ?? { cropPlanCode: code, channel: d.phase, units: 0 };
    row.units += d.units;
    unitKey.set(k, row);
    const sk = d.pickupPointId ?? `name:${d.pickupPointName ?? ''}`;
    const pickupPoint = pickupPointKey.get(sk) ?? { pickupPointId: d.pickupPointId, pickupPointName: d.pickupPointName, units: 0, distributionDays: 0, dates: new Set<string>() };
    pickupPoint.units += d.units;
    pickupPoint.dates.add(d.distributedOn);
    pickupPointKey.set(sk, pickupPoint);
  }

  const producedByCropPlan: Record<string, number> = {};
  for (const b of sowings) producedByCropPlan[b.cropPlanCode] = (producedByCropPlan[b.cropPlanCode] ?? 0) + b.goodUnits;

  const receivedKey = new Map<string, { input: string; unit: 'lb' | 'each'; qty: number }>();
  for (const r of receipts) {
    for (const l of r.lines) {
      if (l.condition === 'rejected') continue;
      const k = `${l.input}|${l.unit}`;
      const row = receivedKey.get(k) ?? { input: l.input, unit: l.unit, qty: 0 };
      row.qty += l.qty;
      receivedKey.set(k, row);
    }
  }

  // Past shelf life, unshipped: every distribution through the window's end draws its lots.
  const consumed = bundle.distributions
    .filter((d) => d.cropPlanCode && d.distributedOn <= to)
    .map((d) => ({
      cropPlanCode: d.cropPlanCode!,
      date: d.distributedOn,
      baseUnits: d.units * unitFactorFor(input.cropPlans.find((r) => r.code === d.cropPlanCode), d.phase, input.unitFactorByChannel),
    }));
  const onHand = finishedGoodsOnHand({ sowings: bundle.sowings.filter((b) => b.productionDate <= to), consumed, shelfLifeDays: input.shelfLifeDays, asOf: to, cropPlans: input.cropPlans });
  const expiredByCropPlan: Record<string, number> = {};
  for (const lot of onHand.lots) {
    if (lot.remaining <= 1e-9 || lot.expires >= to || lot.expires < from) continue;
    expiredByCropPlan[lot.cropPlanCode] = (expiredByCropPlan[lot.cropPlanCode] ?? 0) + lot.remaining;
  }

  return {
    kind: input.kind,
    from,
    to,
    units: [...unitKey.values()],
    totalUnits: distributions.reduce((s, d) => s + d.units, 0),
    distributionDays: new Set(distributions.map((d) => d.distributedOn)).size,
    productionDays: new Set(sowings.map((b) => b.productionDate)).size,
    producedByCropPlan,
    received: [...receivedKey.values()],
    byPickupPoint: [...pickupPointKey.values()].map(({ dates, ...s }) => ({ ...s, distributionDays: dates.size })),
    expiredByCropPlan,
    unitsWithNoCropPlan,
  };
}

/** The empty basis: a page shows zeros while the first answer posts. */
export function emptySustainabilityBasis(kind: LedgerKind, from: string, to: string): SustainabilityBasis {
  return { kind, from, to, units: [], totalUnits: 0, distributionDays: 0, productionDays: 0, producedByCropPlan: {}, received: [], byPickupPoint: [], expiredByCropPlan: {}, unitsWithNoCropPlan: 0 };
}

// ── The food footprint over the crop plan mix ─────────────────────────────────

export interface ChannelFood {
  channel: number;
  units: number;
  referenceKg: number;
  selectedKg: number;
}

export interface MixInput {
  name: string;
  referenceKg: number;
  selectedKg: number;
  massKg: number;
  reference: NonNullable<ReturnType<typeof cropPlanFoodFootprintDual>['lines'][number]['reference']>['provenance'];
  selected: NonNullable<ReturnType<typeof cropPlanFoodFootprintDual>['lines'][number]['selected']>['provenance'];
  selectedStatus: NonNullable<ReturnType<typeof cropPlanFoodFootprintDual>['lines'][number]['selected']>['status'];
  /** The selected basis: the study mean, a cited LCA, or the supplier's own figure. */
  selectedKind: NonNullable<ReturnType<typeof cropPlanFoodFootprintDual>['lines'][number]['selected']>['kind'];
}

export interface MixFoodFootprint {
  byChannel: ChannelFood[];
  totalUnits: number;
  referenceKg: number;
  selectedKg: number;
  byInput: MixInput[];
  /** Lines on a cited or supplier figure, across the crop plans served. */
  linesOnSelectedBasis: number;
  /** Crop plans served with at least one input that has no food factor mapping: their unmapped lines carry no footprint. */
  cropPlansWithUnmappedLines: { code: string; name: string; unmapped: string[]; units: number }[];
  /** Units whose crop plan is not in the library or was not named: in units, not in food. */
  unitsNotCosted: number;
}

/**
 * The food footprint of the units distributed, crop plan by crop plan at each channel's
 * unit, on the reference and the selected basis. An input with no
 * mapping to a study product is named, never given a factor.
 */
export function mixFoodFootprint(input: {
  basis: SustainabilityBasis;
  cropPlans: readonly GrowPlanDef[];
  unitFactorByChannel: Record<number, number>;
  selection?: Record<string, string>;
  options?: LcaOption[];
}): MixFoodFootprint {
  const byChannel = new Map<number, ChannelFood>();
  const byInput = new Map<string, MixInput>();
  const unmapped = new Map<string, { code: string; name: string; unmapped: string[]; units: number }>();
  const onSelected = new Set<string>();
  let unitsNotCosted = 0;
  for (const m of input.basis.units) {
    const ch = byChannel.get(m.channel) ?? { channel: m.channel, units: 0, referenceKg: 0, selectedKg: 0 };
    ch.units += m.units;
    byChannel.set(m.channel, ch);
    const cropPlan = m.cropPlanCode ? input.cropPlans.find((r) => r.code === m.cropPlanCode) : undefined;
    if (!cropPlan) {
      unitsNotCosted += m.units;
      continue;
    }
    const pf = unitFactorFor(cropPlan, m.channel, input.unitFactorByChannel);
    const dual = cropPlanFoodFootprintDual(cropPlan, input.selection ?? {}, inputFactors, cropPlanFoodCategoryMap, input.options, pf);
    const missing = cropPlan.lines.map((l) => lineLabel(l)).filter((name) => !cropPlanFoodCategoryMap[name]);
    if (missing.length > 0) {
      const u = unmapped.get(cropPlan.code) ?? { code: cropPlan.code, name: cropPlan.name, unmapped: missing, units: 0 };
      u.units += m.units;
      unmapped.set(cropPlan.code, u);
    }
    for (const l of dual.lines) {
      if (!l.reference || !l.selected) continue;
      if (l.selected.optionId !== null) onSelected.add(l.name);
      const cur = byInput.get(l.name) ?? { name: l.name, referenceKg: 0, selectedKg: 0, massKg: 0, reference: l.reference.provenance, selected: l.selected.provenance, selectedStatus: l.selected.status, selectedKind: l.selected.kind };
      cur.referenceKg += l.reference.kgCo2ePerUnit * m.units;
      cur.selectedKg += l.selected.kgCo2ePerUnit * m.units;
      cur.massKg += l.massKgPerUnit * m.units;
      byInput.set(l.name, cur);
      ch.referenceKg += l.reference.kgCo2ePerUnit * m.units;
      ch.selectedKg += l.selected.kgCo2ePerUnit * m.units;
    }
  }
  const channels = [...byChannel.values()].sort((a, b) => a.channel - b.channel);
  return {
    byChannel: channels,
    totalUnits: input.basis.totalUnits,
    referenceKg: channels.reduce((s, c) => s + c.referenceKg, 0),
    selectedKg: channels.reduce((s, c) => s + c.selectedKg, 0),
    byInput: [...byInput.values()],
    linesOnSelectedBasis: onSelected.size,
    cropPlansWithUnmappedLines: [...unmapped.values()],
    unitsNotCosted,
  };
}

// ── Mass: shrink, past shelf life, inbound and outbound ─────────────────────

/** Shrink mass over the window: each crop plan's good units × its as-purchased mass per unit × the shrink allowance. */
export function mixShrinkKg(basis: SustainabilityBasis, cropPlans: readonly GrowPlanDef[], shrinkAllowance: number): { kg: number; seedKg: number; units: number } {
  let seedKg = 0;
  let units = 0;
  for (const [code, qty] of Object.entries(basis.producedByCropPlan)) {
    const r = cropPlans.find((x) => x.code === code);
    if (!r) continue;
    seedKg += qty * seedMassPerUnitKg(r);
    units += qty;
  }
  return { kg: seedKg * shrinkAllowance, seedKg, units };
}

/** Finished units past shelf life unshipped, as shipped mass. */
export function expiredMassKg(basis: SustainabilityBasis, cropPlans: readonly GrowPlanDef[]): { units: number; kg: number } {
  let units = 0;
  let kg = 0;
  for (const [code, qty] of Object.entries(basis.expiredByCropPlan)) {
    const r = cropPlans.find((x) => x.code === code);
    units += qty;
    if (r) kg += qty * shippedMassPerUnitKg(r);
  }
  return { units, kg };
}

/** Received mass by input, kg: pounds convert; an each line uses the mapping's mass per each. */
export function receivedMassKg(basis: SustainabilityBasis): { input: string; massKg: number }[] {
  const out = new Map<string, number>();
  for (const l of basis.received) {
    const kg = l.unit === 'lb' ? l.qty * KG_PER_LB : l.qty * (cropPlanFoodCategoryMap[l.input]?.massKgPerEach ?? 0);
    out.set(l.input, (out.get(l.input) ?? 0) + kg);
  }
  return [...out.entries()].map(([input, massKg]) => ({ input, massKg }));
}

/** Shipped mass per distributed unit over the window, unit-weighted across the crop plans served. */
export function mixShippedMassPerUnitKg(basis: SustainabilityBasis, cropPlans: readonly GrowPlanDef[], unitFactorByChannel: Record<number, number>): number {
  let kg = 0;
  let units = 0;
  for (const m of basis.units) {
    const r = m.cropPlanCode ? cropPlans.find((x) => x.code === m.cropPlanCode) : undefined;
    if (!r) continue;
    kg += m.units * shippedMassPerUnitKg(r, unitFactorFor(r, m.channel, unitFactorByChannel));
    units += m.units;
  }
  return units > 0 ? kg / units : 0;
}
