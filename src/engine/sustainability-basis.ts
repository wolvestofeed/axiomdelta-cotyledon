/**
 * MicroFarm — the volume a sustainability figure divides by and multiplies (Roadmap
 * N6 slice 4). One function over either ledger's documents, so Plan and Actual
 * count the same way:
 *
 *   Plan    the open forecast's own timeline, its first year from the start date.
 *   Actual  the recorded sowing records, receipts and distributions in the reporting
 *           year, a calendar year.
 *
 * Units are counted by grow plan and channel from the distributions, production from the
 * sowing records, inbound mass from the receipts and outbound units by distribution
 * pickup point. It replaces channel units a day × operating days on one reference grow plan
 * and the typed planning day (audit A11). Nothing here is stored.
 */

import { purchaseName, type GrowPlanDef } from '@/data/grow-plan';
import type { ActualsBundle } from '@/engine/actuals';
import type { LedgerKind } from '@/engine/ledger-view';
import { finishedGoodsOnHand, unitFactorFor } from '@/engine/production-plan';
import {
  seedMassPerUnitKg,
  growPlanFoodFootprintDual,
  shippedMassPerUnitKg,
  KG_PER_LB,
} from '@/engine/carbon';
import { inputFactors, growPlanFoodCategoryMap } from '@/data/emission-factors';
import type { LcaOption } from '@/data/lca-options';

export interface UnitsByGrowPlan {
  /** Null when the distribution named no grow plan. */
  growPlanCode: string | null;
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
  /** Distributed units by grow plan and channel. */
  units: UnitsByGrowPlan[];
  totalUnits: number;
  /** Distinct dates with a distribution. */
  distributionDays: number;
  /** Distinct dates with a sowing. */
  productionDays: number;
  /** Good base units produced, by grow plan. */
  producedByGrowPlan: Record<string, number>;
  /** Received quantity by input and unit; rejected lines excluded. */
  received: { input: string; unit: 'lb' | 'each'; qty: number }[];
  byPickupPoint: PickupPointUnits[];
  /** Finished base units that passed shelf life unshipped in the window, by grow plan. */
  expiredByGrowPlan: Record<string, number>;
  /** Units distributed with no grow plan named: counted in units, not in food or mass. */
  unitsWithNoGrowPlan: number;
}

const inWindow = (d: string, from: string, to: string) => d >= from && d <= to;

export function sustainabilityBasis(input: {
  kind: LedgerKind;
  bundle: Pick<ActualsBundle, 'sowings' | 'receipts' | 'distributions'>;
  from: string;
  to: string;
  growPlans: readonly GrowPlanDef[];
  unitFactorByChannel: Record<number, number>;
}): SustainabilityBasis {
  const { bundle, from, to } = input;
  const distributions = bundle.distributions.filter((d) => inWindow(d.distributedOn, from, to));
  const sowings = bundle.sowings.filter((b) => inWindow(b.productionDate, from, to));
  const receipts = bundle.receipts.filter((r) => inWindow(r.receivedOn, from, to));

  const unitKey = new Map<string, UnitsByGrowPlan>();
  const pickupPointKey = new Map<string, PickupPointUnits & { dates: Set<string> }>();
  let unitsWithNoGrowPlan = 0;
  for (const d of distributions) {
    const code = d.growPlanCode ?? null;
    if (!code) unitsWithNoGrowPlan += d.units;
    const k = `${code ?? ''}|${d.phase}`;
    const row = unitKey.get(k) ?? { growPlanCode: code, channel: d.phase, units: 0 };
    row.units += d.units;
    unitKey.set(k, row);
    const sk = d.pickupPointId ?? `name:${d.pickupPointName ?? ''}`;
    const pickupPoint = pickupPointKey.get(sk) ?? { pickupPointId: d.pickupPointId, pickupPointName: d.pickupPointName, units: 0, distributionDays: 0, dates: new Set<string>() };
    pickupPoint.units += d.units;
    pickupPoint.dates.add(d.distributedOn);
    pickupPointKey.set(sk, pickupPoint);
  }

  const producedByGrowPlan: Record<string, number> = {};
  for (const b of sowings) producedByGrowPlan[b.growPlanCode] = (producedByGrowPlan[b.growPlanCode] ?? 0) + b.goodUnits;

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
    .filter((d) => d.growPlanCode && d.distributedOn <= to)
    .map((d) => ({
      growPlanCode: d.growPlanCode!,
      date: d.distributedOn,
      baseUnits: d.units * unitFactorFor(input.growPlans.find((r) => r.code === d.growPlanCode), d.phase, input.unitFactorByChannel),
    }));
  const onHand = finishedGoodsOnHand({ sowings: bundle.sowings.filter((b) => b.productionDate <= to), consumed, asOf: to, growPlans: input.growPlans });
  const expiredByGrowPlan: Record<string, number> = {};
  for (const lot of onHand.lots) {
    if (lot.remaining <= 1e-9 || lot.expires >= to || lot.expires < from) continue;
    expiredByGrowPlan[lot.growPlanCode] = (expiredByGrowPlan[lot.growPlanCode] ?? 0) + lot.remaining;
  }

  return {
    kind: input.kind,
    from,
    to,
    units: [...unitKey.values()],
    totalUnits: distributions.reduce((s, d) => s + d.units, 0),
    distributionDays: new Set(distributions.map((d) => d.distributedOn)).size,
    productionDays: new Set(sowings.map((b) => b.productionDate)).size,
    producedByGrowPlan,
    received: [...receivedKey.values()],
    byPickupPoint: [...pickupPointKey.values()].map(({ dates, ...s }) => ({ ...s, distributionDays: dates.size })),
    expiredByGrowPlan,
    unitsWithNoGrowPlan,
  };
}

/** The empty basis: a page shows zeros while the first answer posts. */
export function emptySustainabilityBasis(kind: LedgerKind, from: string, to: string): SustainabilityBasis {
  return { kind, from, to, units: [], totalUnits: 0, distributionDays: 0, productionDays: 0, producedByGrowPlan: {}, received: [], byPickupPoint: [], expiredByGrowPlan: {}, unitsWithNoGrowPlan: 0 };
}

// ── The food footprint over the grow plan mix ─────────────────────────────────

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
  reference: NonNullable<ReturnType<typeof growPlanFoodFootprintDual>['lines'][number]['reference']>['provenance'];
  selected: NonNullable<ReturnType<typeof growPlanFoodFootprintDual>['lines'][number]['selected']>['provenance'];
  selectedStatus: NonNullable<ReturnType<typeof growPlanFoodFootprintDual>['lines'][number]['selected']>['status'];
  /** The selected basis: the study mean, a cited LCA, or the supplier's own figure. */
  selectedKind: NonNullable<ReturnType<typeof growPlanFoodFootprintDual>['lines'][number]['selected']>['kind'];
}

export interface MixFoodFootprint {
  byChannel: ChannelFood[];
  totalUnits: number;
  referenceKg: number;
  selectedKg: number;
  byInput: MixInput[];
  /** Lines on a cited or supplier figure, across the grow plans served. */
  linesOnSelectedBasis: number;
  /** Grow plans served with at least one input that has no food factor mapping: their unmapped lines carry no footprint. */
  growPlansWithUnmappedLines: { code: string; name: string; unmapped: string[]; units: number }[];
  /** Units whose grow plan is not in the library or was not named: in units, not in food. */
  unitsNotCosted: number;
}

/**
 * The food footprint of the units distributed, grow plan by grow plan at each channel's
 * unit, on the reference and the selected basis. An input with no
 * mapping to a study product is named, never given a factor.
 */
export function mixFoodFootprint(input: {
  basis: SustainabilityBasis;
  growPlans: readonly GrowPlanDef[];
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
    const growPlan = m.growPlanCode ? input.growPlans.find((r) => r.code === m.growPlanCode) : undefined;
    if (!growPlan) {
      unitsNotCosted += m.units;
      continue;
    }
    const pf = unitFactorFor(growPlan, m.channel, input.unitFactorByChannel);
    const dual = growPlanFoodFootprintDual(growPlan, input.selection ?? {}, inputFactors, growPlanFoodCategoryMap, input.options, pf);
    const missing = [...new Set(growPlan.lines.map((l) => purchaseName(l)))].filter((name) => !growPlanFoodCategoryMap[name]);
    if (missing.length > 0) {
      const u = unmapped.get(growPlan.code) ?? { code: growPlan.code, name: growPlan.name, unmapped: missing, units: 0 };
      u.units += m.units;
      unmapped.set(growPlan.code, u);
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
    growPlansWithUnmappedLines: [...unmapped.values()],
    unitsNotCosted,
  };
}

// ── Mass: shrink, past shelf life, inbound and outbound ─────────────────────

/** Shrink mass over the window: each grow plan's good units × its as-purchased mass per unit × the shrink allowance. */
export function mixShrinkKg(basis: SustainabilityBasis, growPlans: readonly GrowPlanDef[], shrinkAllowance: number): { kg: number; seedKg: number; units: number } {
  let seedKg = 0;
  let units = 0;
  for (const [code, qty] of Object.entries(basis.producedByGrowPlan)) {
    const r = growPlans.find((x) => x.code === code);
    if (!r) continue;
    seedKg += qty * seedMassPerUnitKg(r);
    units += qty;
  }
  return { kg: seedKg * shrinkAllowance, seedKg, units };
}

/** Finished units past shelf life unshipped, as shipped mass. */
export function expiredMassKg(basis: SustainabilityBasis, growPlans: readonly GrowPlanDef[]): { units: number; kg: number } {
  let units = 0;
  let kg = 0;
  for (const [code, qty] of Object.entries(basis.expiredByGrowPlan)) {
    const r = growPlans.find((x) => x.code === code);
    units += qty;
    if (r) kg += qty * shippedMassPerUnitKg(r);
  }
  return { units, kg };
}

/** Received mass by input, kg: pounds convert; an each line uses the mapping's mass per each. */
export function receivedMassKg(basis: SustainabilityBasis): { input: string; massKg: number }[] {
  const out = new Map<string, number>();
  for (const l of basis.received) {
    const kg = l.unit === 'lb' ? l.qty * KG_PER_LB : l.qty * (growPlanFoodCategoryMap[l.input]?.massKgPerEach ?? 0);
    out.set(l.input, (out.get(l.input) ?? 0) + kg);
  }
  return [...out.entries()].map(([input, massKg]) => ({ input, massKg }));
}

/** Shipped mass per distributed unit over the window, unit-weighted across the grow plans served. */
export function mixShippedMassPerUnitKg(basis: SustainabilityBasis, growPlans: readonly GrowPlanDef[], unitFactorByChannel: Record<number, number>): number {
  let kg = 0;
  let units = 0;
  for (const m of basis.units) {
    const r = m.growPlanCode ? growPlans.find((x) => x.code === m.growPlanCode) : undefined;
    if (!r) continue;
    kg += m.units * shippedMassPerUnitKg(r, unitFactorFor(r, m.channel, unitFactorByChannel));
    units += m.units;
  }
  return units > 0 ? kg / units : 0;
}
