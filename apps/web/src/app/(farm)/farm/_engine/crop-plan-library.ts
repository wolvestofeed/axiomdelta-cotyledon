/**
 * MicroFarm — the crop plan library, engine-side.
 *
 * Ledger-free, database-free. Conversions between a library row pair
 * (`farm.crop plans` + `farm.crop_plan_lines`) and the `CropPlanDef` the engine reads,
 * the next crop plan code, and the spec block a new crop plan gets from its grade
 * group. The read layer (`_lib/crop-plans.ts`) and the actions call these so the
 * shape is defined once.
 */

import {
  cropPlan as seedCropPlan,
  type CropPlanDef,
  type CropPlanSpec,
  type CropPlanStatus,
  type InputLine,
} from '../_data/plan-data';
import { tagged } from '../_data/tagged';
import { nutrientProfile, type TrayFormat } from '../_data/nutrient-profile';

export const CROP_PLAN_STATUSES: CropPlanStatus[] = ['in_service', 'planned', 'developing'];

/** A library crop plan: the engine shape plus the row identity. */
export interface LibraryCropPlan extends CropPlanDef {
  id: string;
  source: 'seed' | 'user_built';
  version: number;
  effectiveFrom: string | null;
  updatedAt: string;
}

export interface CropPlanHeaderRow {
  id: string;
  code: string;
  name: string;
  category: string;
  status: string;
  channels: unknown;
  components: string;
  productionMethod: string;
  allergensPresent: string;
  allergenFreeClaims: string;
  /** The units the input quantities are written for. */
  sowingUnits: number;
  spec: unknown;
  source: string;
  version: number;
  effectiveFrom: string | Date | null;
  updatedAt: Date | string;
}

export interface CropPlanLineRow {
  position: number;
  name: string;
  line: unknown;
}

const iso = (d: string | Date | null): string | null =>
  d === null ? null : typeof d === 'string' ? d : d.toISOString().slice(0, 10);

/** A stored line as the engine reads it (migration 0065 carries every row on the per-sowing keys). */
export function lineFromStored(raw: unknown): InputLine {
  return raw as InputLine;
}

export function rowsToCropPlan(header: CropPlanHeaderRow, lines: readonly CropPlanLineRow[]): LibraryCropPlan {
  const status = CROP_PLAN_STATUSES.includes(header.status as CropPlanStatus)
    ? (header.status as CropPlanStatus)
    : 'developing';
  return {
    id: header.id,
    code: header.code,
    name: header.name,
    category: header.category,
    status,
    channels: Array.isArray(header.channels) ? (header.channels as number[]).filter((n) => Number.isInteger(n)) : [],
    components: header.components,
    productionMethod: header.productionMethod,
    allergensPresent: header.allergensPresent,
    allergenFreeClaims: header.allergenFreeClaims,
    sowingUnits: header.sowingUnits > 0 ? header.sowingUnits : 100,
    spec: (header.spec && typeof header.spec === 'object' && Object.keys(header.spec as object).length > 0
      ? header.spec
      : specForTrayFormat('9-12')) as CropPlanSpec,
    inputs: [...lines]
      .sort((a, b) => a.position - b.position)
      .map((l) => lineFromStored(l.line)),
    source: header.source === 'seed' ? 'seed' : 'user_built',
    version: header.version,
    effectiveFrom: iso(header.effectiveFrom),
    updatedAt: typeof header.updatedAt === 'string' ? header.updatedAt : header.updatedAt.toISOString(),
  };
}

/** The header + lines a crop plan writes. Lines keep their order as positions. */
export function cropPlanToRows(r: CropPlanDef): {
  header: Omit<CropPlanHeaderRow, 'id' | 'version' | 'effectiveFrom' | 'updatedAt'>;
  lines: CropPlanLineRow[];
} {
  return {
    header: {
      code: r.code,
      name: r.name,
      category: r.category,
      status: r.status,
      channels: r.channels,
      components: r.components,
      productionMethod: r.productionMethod,
      allergensPresent: r.allergensPresent,
      allergenFreeClaims: r.allergenFreeClaims,
      sowingUnits: r.sowingUnits,
      spec: r.spec,
      source: 'user_built',
    },
    lines: r.inputs.map((line, position) => ({ position, name: line.name, line })),
  };
}

/** The seed the library starts from when it is empty. */
export const SEED_CROP_PLAN: CropPlanDef = seedCropPlan;

/** `AMK-E-NNN`, one past the highest code already in the library. */
export function nextCropPlanCode(existing: readonly string[], prefix = 'AMK-E-'): string {
  let max = 0;
  for (const c of existing) {
    const m = c.match(/^AMK-E-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/**
 * The spec block a new crop plan gets: the nutrition target is the tray format's
 * daily minimum from the nutrient profile, the grow unit is a placeholder until a
 * packaging quote, and the utensil is unspecified until the standardized
 * crop plan names it. Nothing here is a judgement about the crop plan.
 */
export function specForTrayFormat(trayFormat: TrayFormat, growUnitOz = 16): CropPlanSpec {
  const p = nutrientProfile(trayFormat);
  return {
    trayFormat: tagged<TrayFormat>(trayFormat, 'STATED', 'tray format', 'Tray format the crop plan is authored for.'),
    nutritionTarget: {
      mmaOzEq: tagged(p.mma.dailyMin, 'SOURCED', 'oz eq', `7 CFR 210.10(c) grades ${trayFormat} unit daily minimum, meats/meat alternates`),
      grainsOzEq: tagged(p.grains.dailyMin, 'SOURCED', 'oz eq', `7 CFR 210.10(c) grades ${trayFormat} unit daily minimum, grains`),
    },
    carriesVegetableRequirement: tagged<boolean>(false, 'STATED', 'boolean', 'Whether the entree carries the whole vegetable requirement. Sides complete the reimbursable unit unless this is set.'),
    servingGrowUnitCapacityOz: tagged(growUnitOz, 'PLACEHOLDER', 'oz', 'Bowl capacity — the hard physical bound on packed weight. A packaging quote replaces it.'),
    packingUtensil: tagged<string>('not specified', 'PLACEHOLDER', 'utensil', 'A standardized crop plan states the serving utensil by size. Required for the production record.'),
  };
}

/** A blank input line with every provenance tag set to placeholder. */
export function blankInputLine(name = ''): InputLine {
  return {
    name,
    spec: '',
    seedQtyPerSowing: 0,
    unit: 'lb',
    yieldToHarvest: 1,
    harvestedYieldPerSowing: 0,
    seedUnitCost: 0,
    packSize: 1,
    isHotComponent: true,
    status: 'PLACEHOLDER',
    source: 'Placeholder, quote required',
    yieldStatus: 'PLACEHOLDER',
    yieldSource: 'Unsourced working figure',
    nutrition: { component: 'NONE', status: 'STATED', source: 'Not credited until a component is assigned.' },
    component: name || 'Component',
  };
}

/** Recompute the derived harvested yield on every line before a crop plan is stored. */
export function normalizeLines(lines: readonly InputLine[]): InputLine[] {
  return lines.map((l) => ({ ...l, harvestedYieldPerSowing: l.seedQtyPerSowing * l.yieldToHarvest }));
}

/** The crop plan that stands for the platform where one is needed: the first In Service, else the first. */
export function referenceCropPlan<T extends CropPlanDef>(library: readonly T[]): T | undefined {
  return library.find((r) => r.status === 'in_service') ?? library[0];
}
