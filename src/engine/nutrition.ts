/**
 * MicroFarm — NSLP nutrition engine.
 *
 * This is the module that makes the packed unit an answer rather than a
 * preference. A prospect entree's served weight is whatever weight distributes its
 * stated nutrition contribution for its tray format; the as-purchased quantities
 * are derived from that, not authored against it.
 *
 * Nutrition runs on the HARVESTED / AS-SERVED quantity, never the as-purchased one.
 * USDA Food Buying Guide yields are already harvested-and-drained, so the harvested
 * column here is the nutrition basis with no second shrink applied.
 */

import {
  type TrayFormat,
  type VegSubgroup,
  type NutrientProfile,
  nutrientProfile,
  EXHIBIT_A_GRAMS_PER_OZ_EQ,
  GROUP_H_CUPS_HARVESTED_PER_OZ_EQ,
  MMA_CUPS_PER_OZ_EQ_HARVESTED_LEGUME,
  roundDownToQuarterOzEq,
  roundDownToEighthCup,
  MIN_CREDITABLE_CUP,
  ozToCups,
  ozToGrams,
  type NutritionSpec,
} from '@/data/nutrient-profile';
import type { StatusTag } from '@/data/tagged';

export type { NutritionSpec };

/** The minimum an input line must expose for nutrition to run. */
export interface CreditableLine {
  name: string;
  unit: 'lb' | 'each';
  /** Harvested / as-served quantity for the authored sowing — lb, or count for `each`. */
  harvestedYieldPerSowing: number;
  /** The units the quantity is written for (`CropPlanDef.sowingUnits`). */
  sowingUnits: number;
  nutrition?: NutritionSpec;
  /** The served component this line rolls up into. */
  component: string;
}

/** A served component's nutrition contribution — the unit USDA actually credits. */
export interface ComponentCredit {
  component: string;
  /** Component's as-served weight in one unit, ounces. */
  servedOz: number;
  mmaOzEqRaw: number;
  grainsOzEqRaw: number;
  vegCupsRaw: number;
  fruitCupsRaw: number;
  vegSubgroups: Partial<Record<Exclude<VegSubgroup, 'ADDITIONAL'>, number>>;
  /** Volume credit suppressed because the component total is under 1/8 cup. */
  belowMinimumServing: boolean;
  lines: LineCredit[];
}

export interface LineCredit {
  name: string;
  component: NutritionSpec['component'];
  vegSubgroup?: Exclude<VegSubgroup, 'ADDITIONAL'>;
  /** As-served amount of this line in one unit, ounces. */
  servedOz: number;
  /** Raw, unrounded credit in the component's own unit. */
  rawCredit: number;
  unit: 'oz eq' | 'cup' | 'none';
  /** Why this line credits as it does, for the production record. */
  basis: string;
  status: StatusTag;
  /** Set when the line declares a component but lacks the data to credit it. */
  blocked?: string;
}

export interface CropPlanNutrition {
  trayFormat: TrayFormat;
  pattern: NutrientProfile;
  lines: LineCredit[];
  /** Served-component rollup — the basis the 1/8-cup floor is applied on. */
  components: ComponentCredit[];
  /** Component totals, rounded the way USDA rounds: down, per component. */
  mmaOzEq: number;
  grainsOzEq: number;
  vegCups: number;
  fruitCups: number;
  /** Unrounded totals, kept so the rounding step is visible. */
  rawMmaOzEq: number;
  rawGrainsOzEq: number;
  rawVegCups: number;
  vegBySubgroup: Partial<Record<Exclude<VegSubgroup, 'ADDITIONAL'>, number>>;
  /** Daily-minimum tests. The entree alone need not meet the whole unit. */
  meetsDailyMma: boolean;
  meetsDailyGrains: boolean;
  meetsDailyVeg: boolean;
  /** Lines that named a component but could not be credited. */
  blocked: string[];
}

const LB_TO_OZ = 16;

/** As-served ounces of one line in one unit. */
export function servedOzPerUnit(line: CreditableLine): number {
  if (line.unit === 'each') {
    const g = line.nutrition?.unitWeightG;
    if (g === undefined) return 0;
    return (line.harvestedYieldPerSowing / line.sowingUnits) * (g / 28.349523125);
  }
  return (line.harvestedYieldPerSowing / line.sowingUnits) * LB_TO_OZ;
}

/** A crop plan's lines as the nutrition engine reads them: each stamped with the authored sowing. */
export function creditableLines<T extends Omit<CreditableLine, 'sowingUnits'>>(cropPlan: { sowingUnits: number; inputs: readonly T[] }): (T & { sowingUnits: number })[] {
  return cropPlan.inputs.map((l) => ({ ...l, sowingUnits: cropPlan.sowingUnits }));
}

function creditLine(line: CreditableLine): LineCredit {
  const c = line.nutrition;
  const servedOz = servedOzPerUnit(line);
  if (!c || c.component === 'NONE') {
    return {
      name: line.name,
      component: 'NONE',
      servedOz,
      rawCredit: 0,
      unit: 'none',
      basis: 'Does not credit toward a unit component.',
      status: c?.status ?? 'STATED',
    };
  }

  // Legumes elect one component and forfeit the other in the same dish.
  const effective =
    c.component === 'MMA' && c.legumeElection ? c.legumeElection : c.component;

  if (effective === 'MMA') {
    if (c.legumeElection === 'MMA') {
      if (c.cupWeightG === undefined) {
        return {
          name: line.name,
          component: 'MMA',
          servedOz,
          rawCredit: 0,
          unit: 'oz eq',
          basis: 'Legume credited as a meat alternate requires a harvested cup weight.',
          status: c.status,
          blocked: `${line.name}: no sourced cup weight, so the 1/4-cup-per-oz-eq legume conversion cannot run.`,
        };
      }
      const cups = ozToCups(servedOz, c.cupWeightG);
      return {
        name: line.name,
        component: 'MMA',
        servedOz,
        rawCredit: cups / MMA_CUPS_PER_OZ_EQ_HARVESTED_LEGUME,
        unit: 'oz eq',
        basis: `${cups.toFixed(3)} cup harvested legume at 1/4 cup per oz eq. Elected as meat alternate; forfeits the beans/peas/lentils vegetable credit in this dish.`,
        status: c.status,
      };
    }
    // Harvested lean meat and cheese both credit 1 oz = 1 oz eq.
    return {
      name: line.name,
      component: 'MMA',
      servedOz,
      rawCredit: servedOz,
      unit: 'oz eq',
      basis: `${servedOz.toFixed(3)} oz as served at 1 oz per oz eq.`,
      status: c.status,
    };
  }

  if (effective === 'GRAINS') {
    if (!c.grainGroup) {
      return {
        name: line.name,
        component: 'GRAINS',
        servedOz,
        rawCredit: 0,
        unit: 'oz eq',
        basis: 'No Exhibit A group assigned.',
        status: c.status,
        blocked: `${line.name}: no Exhibit A grain group, so oz eq cannot be computed.`,
      };
    }
    if (c.grainGroup === 'H') {
      if (c.cupWeightG === undefined) {
        return {
          name: line.name,
          component: 'GRAINS',
          servedOz,
          rawCredit: 0,
          unit: 'oz eq',
          basis: 'Group H credits by harvested volume and needs a harvested cup weight.',
          status: c.status,
          blocked: `${line.name}: Group H without a sourced harvested cup weight.`,
        };
      }
      const cups = ozToCups(servedOz, c.cupWeightG);
      return {
        name: line.name,
        component: 'GRAINS',
        servedOz,
        rawCredit: cups / GROUP_H_CUPS_HARVESTED_PER_OZ_EQ,
        unit: 'oz eq',
        basis: `${cups.toFixed(3)} cup harvested, Exhibit A Group H at 1/2 cup harvested per oz eq.`,
        status: c.status,
      };
    }
    if (c.grainGroup === 'I') {
      return {
        name: line.name,
        component: 'GRAINS',
        servedOz,
        rawCredit: 0,
        unit: 'oz eq',
        basis: 'Group I (ready-to-eat cereal) credits by volume per its own chart.',
        status: c.status,
        blocked: `${line.name}: Group I nutrition is not modelled.`,
      };
    }
    const gPerOzEq = EXHIBIT_A_GRAMS_PER_OZ_EQ[c.grainGroup];
    return {
      name: line.name,
      component: 'GRAINS',
      servedOz,
      rawCredit: ozToGrams(servedOz) / gPerOzEq,
      unit: 'oz eq',
      basis: `${ozToGrams(servedOz).toFixed(1)} g as served, Exhibit A Group ${c.grainGroup} at ${gPerOzEq} g per oz eq.`,
      status: c.status,
    };
  }

  // Vegetables and fruit credit by volume served.
  if (c.cupWeightG === undefined) {
    return {
      name: line.name,
      component: effective,
      vegSubgroup: c.vegSubgroup,
      servedOz,
      rawCredit: 0,
      unit: 'cup',
      basis: 'Credits by volume served and needs a harvested cup weight.',
      status: c.status,
      blocked: `${line.name}: no sourced harvested cup weight, so volume credit cannot be computed.`,
    };
  }
  const cups = ozToCups(servedOz, c.cupWeightG);
  return {
    name: line.name,
    component: effective,
    vegSubgroup: c.vegSubgroup,
    servedOz,
    rawCredit: cups,
    unit: 'cup',
    basis: `${servedOz.toFixed(3)} oz as served at ${c.cupWeightG} g per cup = ${cups.toFixed(3)} cup.${
      cups < MIN_CREDITABLE_CUP ? ' Below the 1/8-cup minimum creditable serving.' : ''
    }`,
    status: c.status,
  };
}

/**
 * Roll input lines up into the served components USDA actually credits.
 *
 * The 1/8-cup minimum creditable serving applies to the component as served, not
 * to each input inside it. A salsa of 0.111 cup tomato and 0.032 cup onion
 * credits as 0.143 cup of vegetable; scored line by line it credits as nothing.
 */
export function creditByComponent(lines: readonly CreditableLine[]): ComponentCredit[] {
  const order: string[] = [];
  const groups = new Map<string, CreditableLine[]>();
  for (const l of lines) {
    if (!groups.has(l.component)) {
      groups.set(l.component, []);
      order.push(l.component);
    }
    groups.get(l.component)!.push(l);
  }

  return order.map((component) => {
    const credited = groups.get(component)!.map(creditLine);
    const sum = (c: LineCredit['component']) =>
      credited.filter((l) => l.component === c).reduce((s, l) => s + l.rawCredit, 0);

    const vegCups = sum('VEG');
    const fruitCups = sum('FRUIT');
    const belowMinimumServing =
      (vegCups > 0 && vegCups < MIN_CREDITABLE_CUP) ||
      (fruitCups > 0 && fruitCups < MIN_CREDITABLE_CUP);

    const vegSubgroups: Partial<Record<Exclude<VegSubgroup, 'ADDITIONAL'>, number>> = {};
    if (vegCups >= MIN_CREDITABLE_CUP) {
      for (const l of credited) {
        if (l.component !== 'VEG' || !l.vegSubgroup) continue;
        vegSubgroups[l.vegSubgroup] = (vegSubgroups[l.vegSubgroup] ?? 0) + l.rawCredit;
      }
    }

    return {
      component,
      servedOz: credited.reduce((s, l) => s + l.servedOz, 0),
      mmaOzEqRaw: sum('MMA'),
      grainsOzEqRaw: sum('GRAINS'),
      vegCupsRaw: vegCups >= MIN_CREDITABLE_CUP ? vegCups : 0,
      fruitCupsRaw: fruitCups >= MIN_CREDITABLE_CUP ? fruitCups : 0,
      vegSubgroups,
      belowMinimumServing,
      lines: credited,
    };
  });
}

/**
 * Credit one unit of a crop plan against a tray format's unit pattern.
 *
 * Lines roll up into served components, the 1/8-cup floor applies per component,
 * and the component totals are summed raw and rounded ONCE per unit component —
 * which is how USDA does it. Rounding earlier and then summing understates the unit.
 */
export function creditCropPlan(
  lines: readonly CreditableLine[],
  trayFormat: TrayFormat,
  onDate = '2026-09-01',
): CropPlanNutrition {
  const pattern = nutrientProfile(trayFormat, onDate);
  const components = creditByComponent(lines);
  const credited = components.flatMap((c) => c.lines);

  const rawMma = components.reduce((s, c) => s + c.mmaOzEqRaw, 0);
  const rawGrains = components.reduce((s, c) => s + c.grainsOzEqRaw, 0);
  const rawVeg = components.reduce((s, c) => s + c.vegCupsRaw, 0);
  const rawFruit = components.reduce((s, c) => s + c.fruitCupsRaw, 0);

  const vegBySubgroup: Partial<Record<Exclude<VegSubgroup, 'ADDITIONAL'>, number>> = {};
  for (const c of components) {
    for (const [k, v] of Object.entries(c.vegSubgroups)) {
      const key = k as Exclude<VegSubgroup, 'ADDITIONAL'>;
      vegBySubgroup[key] = (vegBySubgroup[key] ?? 0) + (v as number);
    }
  }

  const mmaOzEq = roundDownToQuarterOzEq(rawMma);
  const grainsOzEq = roundDownToQuarterOzEq(rawGrains);
  const vegCups = roundDownToEighthCup(rawVeg);
  const fruitCups = roundDownToEighthCup(rawFruit);

  return {
    trayFormat,
    pattern,
    lines: credited,
    components,
    mmaOzEq,
    grainsOzEq,
    vegCups,
    fruitCups,
    rawMmaOzEq: rawMma,
    rawGrainsOzEq: rawGrains,
    rawVegCups: rawVeg,
    vegBySubgroup,
    meetsDailyMma: mmaOzEq >= pattern.mma.dailyMin,
    meetsDailyGrains: grainsOzEq >= pattern.grains.dailyMin,
    meetsDailyVeg: vegCups >= pattern.vegetables.dailyMin,
    blocked: credited.flatMap((l) => (l.blocked ? [l.blocked] : [])),
  };
}

/**
 * The tray format this crop plan is authored for, inferred from which patterns its
 * nutrition satisfies. Reported, never assumed: an entree that meets 9-12 also
 * meets K-5, so the highest satisfied group is the informative one.
 */
export function highestTrayFormatMet(
  lines: readonly CreditableLine[],
  onDate = '2026-09-01',
): { trayFormat: TrayFormat | null; byGroup: Record<TrayFormat, CropPlanNutrition> } {
  const groups: TrayFormat[] = ['K-5', '6-8', '9-12'];
  const byGroup = Object.fromEntries(
    groups.map((g) => [g, creditCropPlan(lines, g, onDate)]),
  ) as Record<TrayFormat, CropPlanNutrition>;
  // Entree-level test: M/MA and grains are the components an entree carries.
  const met = groups.filter(
    (g) => byGroup[g].meetsDailyMma && byGroup[g].meetsDailyGrains,
  );
  return { trayFormat: met.length > 0 ? met[met.length - 1] : null, byGroup };
}

/**
 * Scale factor needed on every harvested quantity for this crop plan to meet a grade
 * group's daily M/MA and grain minimums. Above 1 the unit is short; at or
 * below 1 it already meets them. This is what anchors the packed spec: a unit
 * cannot be cut below the factor that holds this at 1.
 */
export function minimumUnitFactor(
  lines: readonly CreditableLine[],
  trayFormat: TrayFormat,
  onDate = '2026-09-01',
): { factor: number; bindingComponent: 'MMA' | 'GRAINS' } {
  const c = creditCropPlan(lines, trayFormat, onDate);
  // Solve on the rounded-down credit, since that is what is enforced. Rounding
  // makes this a step function, so search upward on a fine grid rather than
  // dividing the raw totals, which would land just under a quarter-oz step.
  const need = (f: number) => {
    const scaled = lines.map((l) => ({ ...l, harvestedYieldPerSowing: l.harvestedYieldPerSowing * f }));
    const r = creditCropPlan(scaled, trayFormat, onDate);
    return r.meetsDailyMma && r.meetsDailyGrains;
  };
  if (need(1)) {
    // Find how far it could be cut before it fails.
    let lo = 0.01;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (need(mid)) hi = mid;
      else lo = mid;
    }
    const mmaSlack = c.rawMmaOzEq / c.pattern.mma.dailyMin;
    const grainSlack = c.rawGrainsOzEq / c.pattern.grains.dailyMin;
    return {
      factor: hi,
      bindingComponent: mmaSlack <= grainSlack ? 'MMA' : 'GRAINS',
    };
  }
  let lo = 1;
  let hi = 10;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (need(mid)) hi = mid;
    else lo = mid;
  }
  return {
    factor: hi,
    bindingComponent: c.meetsDailyMma ? 'GRAINS' : 'MMA',
  };
}
