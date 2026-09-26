/**
 * MicroFarm — costing a grow plan on its four line kinds (outline §5 rule 2). Pure.
 *
 * Every dollar of one tray comes from the plan's lines against tagged reference data:
 *
 *   seed        grams per tray over 453.59 × the variety's price per pound (the rolling cost from
 *               receipts once there are receipts; the record's opening price until then)
 *   medium      quantity per tray × the medium's cost per unit
 *   nutrient    ml/L × the liters the tray takes from the stage the line starts × cost per ml
 *   light       energy and amortized fixture per tray-day on the facility's fixture × the days
 *               under light from the stage the line starts
 *   consumables the tray set over its uses, plus sanitizer, by format
 *
 * The sowing is the costing basis: a sowing is N trays and every figure here is per tray, so the
 * sowing's cost is N × the tray. The yield chain is seed weight → sown → harvested → packed; a live
 * tray packs what it harvests. Labor is on its own three streams (`time-studies.ts`, part 5) and is
 * added to the unit cost outside this module, never inside it.
 */

import { OZ_PER_LB, GRAMS_PER_OZ } from '../_data/nutrient-profile';
import type { StatusTag } from '../_data/tagged';
import {
  DEFAULT_LIGHT_REGIME,
  ENERGY_RATE_PER_KWH,
  FIXTURE_BY_KEY,
  LIGHT_FIXTURES,
  MEDIUM_BY_KEY,
  NUTRIENT_BY_KEY,
  REGIME_BY_KEY,
  SANITIZER_PER_TRAY,
  fixtureDelivers,
  lightCostPerTrayDay,
  type GrowingMediumDef,
  type LightFixtureDef,
  type LightRegimeDef,
  type NutrientSolutionDef,
} from '../_data/inputs-catalog';
import { cycleDays, daysToHarvest, lightDaysFrom, waterLitersFrom, type StageDays } from '../_data/stage-schedule';
import { TRAY_FORMAT_BY_KEY, densityFactorOf, traySetCostPerUnit, type TrayFormatDef } from '../_data/tray-formats';
import { VARIETY_BY_KEY, type VarietyDef } from '../_data/varieties';
import { leadVariety, planStageDays, planStages, type GrowPlanDef, type GrowPlanLine } from '../_data/grow-plan';

export const GRAMS_PER_LB = GRAMS_PER_OZ * OZ_PER_LB;

/** The reference data a plan is costed against. Defaults are the catalogs and the facility's first fixture. */
export interface GrowCostContext {
  varieties: Readonly<Record<string, VarietyDef>>;
  media: Readonly<Record<string, GrowingMediumDef>>;
  nutrients: Readonly<Record<string, NutrientSolutionDef>>;
  regimes: Readonly<Record<string, LightRegimeDef>>;
  /** The fixture the light line is costed on: the one the grow units carry. */
  fixture: LightFixtureDef;
  energyRatePerKwh: number;
  /** Price per pound by variety key where a receipt or a what-if stands over the record's opening price. */
  seedPricePerLb: Readonly<Record<string, number>>;
  sanitizerPerTray: number;
}

export function defaultGrowCostContext(over: Partial<GrowCostContext> = {}): GrowCostContext {
  return {
    varieties: VARIETY_BY_KEY,
    media: MEDIUM_BY_KEY,
    nutrients: NUTRIENT_BY_KEY,
    regimes: REGIME_BY_KEY,
    fixture: LIGHT_FIXTURES[0]!,
    energyRatePerKwh: ENERGY_RATE_PER_KWH.value,
    seedPricePerLb: {},
    sanitizerPerTray: SANITIZER_PER_TRAY.value,
    ...over,
  };
}

export interface GrowLineCost {
  line: GrowPlanLine;
  label: string;
  /** The quantity one tray takes, in `quantityUnit`. */
  quantity: number;
  quantityUnit: string;
  unitCost: number;
  costPerTray: number;
  /** Provenance of the price. */
  status: StatusTag;
  source: string;
  /** What the line is read against when it defers to the catalog or the variety. */
  basis: string;
}

export interface GrowPlanCosting {
  code: string;
  format: TrayFormatDef;
  lines: GrowLineCost[];
  seedGramsPerTray: number;
  /** Harvest grams per tray from the varieties' records; the observed yield replaces them. */
  harvestGramsPerTray: number;
  /** Harvest grams over seed grams. */
  yieldToHarvest: number;
  stageDays: StageDays;
  cycleDays: number;
  daysToHarvest: number;
  lightDays: number;
  /** Liters the tray takes over its whole cycle. */
  waterLitersPerTray: number;
  perTray: { seed: number; medium: number; nutrient: number; light: number; consumables: number; total: number };
  /** Cost per harvested ounce at the record's yield; zero with no harvest weight. */
  costPerHarvestOz: number;
  fixture: LightFixtureDef;
}

const tagOf = (v: { status: StatusTag; note?: string }): { status: StatusTag; source: string } => ({ status: v.status, source: v.note ?? '' });

/** Cost one tray of a plan. */
export function costGrowPlan(plan: GrowPlanDef, ctx: GrowCostContext = defaultGrowCostContext()): GrowPlanCosting {
  const format = TRAY_FORMAT_BY_KEY[plan.format];
  const density = densityFactorOf(format);
  const stages = planStages(plan);
  const days = planStageDays(plan, ctx.varieties);
  const lead = leadVariety(plan, ctx.varieties);
  const lines: GrowLineCost[] = [];
  let seedGrams = 0;
  let harvestGrams = 0;
  let lightDays = 0;

  for (const line of plan.lines) {
    switch (line.kind) {
      case 'seed': {
        const v = ctx.varieties[line.varietyKey];
        if (!v) {
          lines.push({ line, label: line.varietyKey, quantity: 0, quantityUnit: 'g', unitCost: 0, costPerTray: 0, status: 'PLACEHOLDER', source: 'No variety record', basis: 'Unknown variety' });
          break;
        }
        const grams = line.gramsPerTray.value;
        const override = ctx.seedPricePerLb[v.key];
        const pricePerLb = override ?? v.seedPricePerLb.value;
        seedGrams += grams;
        harvestGrams += v.harvestGramsPer1020.value * density * line.share;
        lines.push({
          line,
          label: v.name,
          quantity: grams,
          quantityUnit: 'g',
          unitCost: pricePerLb,
          costPerTray: (grams / GRAMS_PER_LB) * pricePerLb,
          status: override !== undefined ? 'STATED' : v.seedPricePerLb.status,
          source: override !== undefined ? 'A price standing over the variety record' : (v.seedPricePerLb.note ?? ''),
          basis: `${v.supplier.name} (${v.supplier.code})${v.supplier.sku ? ` ${v.supplier.sku}` : ''}, $/lb`,
        });
        break;
      }
      case 'medium': {
        const m = ctx.media[line.mediumKey];
        if (!m || m.unit === 'none') {
          lines.push({ line, label: m?.name ?? line.mediumKey, quantity: 0, quantityUnit: 'none', unitCost: 0, costPerTray: 0, status: 'STATED', source: 'No medium', basis: 'None' });
          break;
        }
        const qty = line.qtyPerTray?.value ?? m.qtyPer1020.value * density;
        const tag = line.qtyPerTray ? tagOf(line.qtyPerTray) : tagOf(m.qtyPer1020);
        lines.push({
          line,
          label: m.name,
          quantity: qty,
          quantityUnit: m.unit,
          unitCost: m.costPerUnit.value,
          costPerTray: qty * m.costPerUnit.value,
          status: m.costPerUnit.status,
          source: m.costPerUnit.note ?? '',
          basis: line.qtyPerTray ? `Typed quantity (${tag.status})` : `Catalog ${m.qtyPer1020.value} ${m.unit} per 1020 × ${density.toFixed(3)} area factor`,
        });
        break;
      }
      case 'nutrient': {
        const n = ctx.nutrients[line.nutrientKey];
        if (!n || n.key === 'none') {
          lines.push({ line, label: n?.name ?? line.nutrientKey, quantity: 0, quantityUnit: 'ml', unitCost: 0, costPerTray: 0, status: 'STATED', source: 'Water only', basis: 'None' });
          break;
        }
        const liters = waterLitersFrom(line.startsAt, days, stages) * density;
        const mlPerL = line.mlPerL?.value ?? n.mlPerL.value;
        const ml = mlPerL * liters;
        lines.push({
          line,
          label: n.name,
          quantity: ml,
          quantityUnit: 'ml',
          unitCost: n.costPerMl.value,
          costPerTray: ml * n.costPerMl.value,
          status: n.costPerMl.status,
          source: n.costPerMl.note ?? '',
          basis: `${mlPerL} ml/L × ${liters.toFixed(2)} L from ${line.startsAt}`,
        });
        break;
      }
      case 'light': {
        const regime = ctx.regimes[line.regimeKey] ?? ctx.regimes[DEFAULT_LIGHT_REGIME]!;
        const ppfd = line.ppfd?.value ?? lead?.light.ppfdRange?.max ?? regime.ppfdTarget.value;
        const daysLit = lightDaysFrom(line.startsAt, days, stages);
        lightDays = daysLit;
        const perTrayDay = lightCostPerTrayDay(ctx.fixture, regime, ppfd, ctx.energyRatePerKwh) * density;
        lines.push({
          line,
          label: regime.name,
          quantity: daysLit,
          quantityUnit: 'tray-days',
          unitCost: perTrayDay,
          costPerTray: perTrayDay * daysLit,
          status: ctx.fixture.watts.status,
          source: `${ctx.fixture.name} at ${ppfd} µmol, ${regime.photoperiodHours.value} h/day, $${ctx.energyRatePerKwh}/kWh`,
          basis: line.ppfd ? 'Typed intensity' : lead?.light.ppfdRange ? `${lead.name}'s own range` : `${regime.name} target`,
        });
        break;
      }
    }
  }

  const sum = (kind: GrowPlanLine['kind']) => lines.filter((l) => l.line.kind === kind).reduce((t, l) => t + l.costPerTray, 0);
  const consumables = traySetCostPerUnit(format) + ctx.sanitizerPerTray;
  const perTray = { seed: sum('seed'), medium: sum('medium'), nutrient: sum('nutrient'), light: sum('light'), consumables, total: 0 };
  perTray.total = perTray.seed + perTray.medium + perTray.nutrient + perTray.light + perTray.consumables;
  const waterLiters = waterLitersFrom(stages[0]!.key, days, stages) * density;
  return {
    code: plan.code,
    format,
    lines,
    seedGramsPerTray: seedGrams,
    harvestGramsPerTray: harvestGrams,
    yieldToHarvest: seedGrams > 0 ? harvestGrams / seedGrams : 0,
    stageDays: days,
    cycleDays: cycleDays(days),
    daysToHarvest: daysToHarvest(days),
    lightDays,
    waterLitersPerTray: waterLiters,
    perTray,
    costPerHarvestOz: harvestGrams > 0 ? perTray.total / (harvestGrams / GRAMS_PER_OZ) : 0,
    fixture: ctx.fixture,
  };
}

/** The fixture a plan is costed on: the first in the library that can deliver the plan's regime, else the first fixture. */
export function fixtureFor(plan: GrowPlanDef, fixtures: readonly LightFixtureDef[] = LIGHT_FIXTURES, regimes: Readonly<Record<string, LightRegimeDef>> = REGIME_BY_KEY): LightFixtureDef {
  const light = plan.lines.find((l) => l.kind === 'light');
  if (!light) return fixtures[0] ?? FIXTURE_BY_KEY['mars-hydro-vg80']!;
  const regime = regimes[light.regimeKey];
  const lead = leadVariety(plan);
  const ppfd = light.ppfd?.value ?? lead?.light.ppfdRange?.max ?? regime?.ppfdTarget.value ?? 0;
  const able = regime ? fixtures.find((f) => fixtureDelivers(f, regime, ppfd)) : undefined;
  return able ?? fixtures[0]!;
}
