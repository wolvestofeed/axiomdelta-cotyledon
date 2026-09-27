/**
 * MicroFarm — the grow plan (outline §4). How a variety, or a mixed tray, is grown.
 *
 * A plan names its tray format and carries lines of four kinds, every one of which feeds the
 * costing formula (`_engine/grow-costing.ts`):
 *
 *   seed      a variety, its grams per tray of the format, and its share of a mixed tray;
 *             the only line that carries provenance and nutrition
 *   medium    the growing medium and its quantity per tray (null = the catalog's, scaled to the format)
 *   nutrient  a solution, its concentration (null = the catalog's), and the stage it starts
 *   light     a regime, an intensity override (null = the regime's target, or the variety's own range),
 *             and the stage it starts
 *
 * Watering is never a line: it is a stage (`stage-schedule.ts`). A single-variety flat is one seed
 * line; a mixed tray is two or more whose shares sum to one. The stage days are the variety's
 * unless the plan overrides them; a mixed tray runs on the slowest variety at every stage.
 *
 * Codes. A plan's code is its lead variety's code and a serial: `BROC-01`, `BROC-02`; a mixed tray
 * is `MIX-01`. The unit a subscriber buys is the plan code and the packaged format
 * (`tray-formats.ts` `unitSku`): `BROC-01-1020`. The supplier's code is on the variety record.
 */

import type { Tagged } from '@/data/tagged';
import { tagged } from '@/data/tagged';
import type { GrowPlanStatus } from '@/data/plan-data';
import type { MediumKey, NutrientKey, LightRegimeKey, NutrientSolutionDef } from '@/data/inputs-catalog';
import type { MeasuredConsumption } from '@/data/time-studies';
import type { StatusTag } from '@/data/tagged';
import type { LastPricePaid } from '@/engine/seed-cost';
import { STAGES, SPROUT_STAGES, type StageDays, type StageKey, type StageDef } from '@/data/stage-schedule';
import { TRAY_FORMAT_BY_KEY, densityFactorOf, type TrayFormatKey } from '@/data/tray-formats';
import { VARIETY_BY_KEY, type VarietyDef } from '@/data/varieties';

export type LineKind = 'seed' | 'medium' | 'nutrient' | 'light';

export const LINE_KIND_LABELS: Record<LineKind, string> = { seed: 'Seed', medium: 'Medium', nutrient: 'Nutrient', light: 'Light' };

export interface SeedLine {
  kind: 'seed';
  varietyKey: string;
  /** Grams sown in one tray of the plan's format. */
  gramsPerTray: Tagged;
  /** This variety's share of the tray's area, 0 to 1. One on a single-variety plan. */
  share: number;
}

export interface MediumLine {
  kind: 'medium';
  mediumKey: MediumKey;
  /** Quantity per tray in the medium's unit; null = the catalog's quantity per 1020 scaled to the format. */
  qtyPerTray: Tagged | null;
}

export interface NutrientLine {
  kind: 'nutrient';
  nutrientKey: NutrientKey;
  /** Milliliters of concentrate per gallon; null = the catalog's default strength. */
  mlPerGal: Tagged | null;
  /** The stage the solution enters the water. */
  startsAt: StageKey;
}

export interface LightLine {
  kind: 'light';
  regimeKey: LightRegimeKey;
  /** Intensity at tray height; null = the regime's target, or the lead variety's own range where it has one. */
  ppfd: Tagged | null;
  /** The stage the lights come on. */
  startsAt: StageKey;
}

export type GrowPlanLine = SeedLine | MediumLine | NutrientLine | LightLine;

export interface GrowPlanDef {
  code: string;
  name: string;
  status: GrowPlanStatus;
  /** Channels the plan is offered on. */
  channels: number[];
  format: TrayFormatKey;
  lines: GrowPlanLine[];
  /** Days per stage when the plan departs from its varieties'; null = the varieties' own. */
  stageDays: Tagged<StageDays> | null;
  note: string;
  /** The allergens the plan's varieties carry, as stated; blank until stated. */
  allergensPresent: string;
  /** The allergen-free claims the plan makes, as stated; blank until stated. */
  allergenFreeClaims: string;
  /**
   * The workspace's Nutrients & Supplements records its nutrient lines name, attached when the
   * library is read so the plan is costed against them; absent, the costing reads the seed list.
   * Never stored with the plan.
   */
  nutrients?: Readonly<Record<string, NutrientSolutionDef>>;
  /**
   * What the plan's approved time studies measured, attached where the scenario is resolved: the
   * costing reads its ounces per watering over the placeholder volumes and its ml per tray over the
   * nutrient line's strength. Absent until a study that recorded consumption is approved. Never stored.
   */
  measured?: MeasuredConsumption;
  /**
   * Prices standing over a line's own price, keyed by the line's label (`lineLabel`): a supplier
   * catalog price or a what-if typed on the scenario, attached by the resolver with its tag and
   * its source. The cost card reads a seed line's. Never stored.
   */
  prices?: Readonly<Record<string, LinePrice>>;
  /**
   * Each variety the plan sows that has been received: its last price paid per pound
   * (`src/engine/seed-cost.ts`), attached when the library is read; the resolver prices the seed
   * line at it on the plan. Never stored.
   */
  lastPaid?: Readonly<Record<string, LastPricePaid>>;
  /**
   * The price a purchase order pays per line, keyed by the line's label, where it differs from the
   * line's own: the supplier's catalog price in force, else the last price paid; a what-if typed on
   * the forecast over both. Attached by the resolver; `prices` is the plan's. Never stored.
   */
  orderPrices?: Readonly<Record<string, LinePrice>>;}

/** A price standing over a line's own: what it is, and where it came from. */
export interface LinePrice {
  unitCost: number;
  status: StatusTag;
  source: string;
}

export const GROW_PLAN_CODE_RX = /^[A-Z]{2,5}-\d{2,3}$/;
export const MIX_CODE_PREFIX = 'MIX';

export const isSeedLine = (l: GrowPlanLine): l is SeedLine => l.kind === 'seed';
export const isMediumLine = (l: GrowPlanLine): l is MediumLine => l.kind === 'medium';
export const isNutrientLine = (l: GrowPlanLine): l is NutrientLine => l.kind === 'nutrient';
export const isLightLine = (l: GrowPlanLine): l is LightLine => l.kind === 'light';

export const seedLines = (plan: Pick<GrowPlanDef, 'lines'>): SeedLine[] => plan.lines.filter(isSeedLine);
export const mediumLine = (plan: Pick<GrowPlanDef, 'lines'>): MediumLine | undefined => plan.lines.find(isMediumLine);
export const nutrientLines = (plan: Pick<GrowPlanDef, 'lines'>): NutrientLine[] => plan.lines.filter(isNutrientLine);
export const lightLine = (plan: Pick<GrowPlanDef, 'lines'>): LightLine | undefined => plan.lines.find(isLightLine);

/** The varieties on the plan's seed lines, in line order. Unknown keys are skipped. */
/** The name of the format a plan is grown and sold in: what the old header called its category. */
export const formatNameOf = (plan: Pick<GrowPlanDef, 'format'>): string => TRAY_FORMAT_BY_KEY[plan.format].name;

/** The varieties a plan sows, by name, in line order. */
export const varietyNamesOf = (plan: Pick<GrowPlanDef, 'lines'>): string => planVarieties(plan).map((v) => v.name).join(', ');

export function planVarieties(plan: Pick<GrowPlanDef, 'lines'>, byKey: Readonly<Record<string, VarietyDef>> = VARIETY_BY_KEY): VarietyDef[] {
  return seedLines(plan).map((l) => byKey[l.varietyKey]).filter((v): v is VarietyDef => v !== undefined);
}

/** The first seed line's variety: the one the code and the light and media notes are read from. */
export const leadVariety = (plan: Pick<GrowPlanDef, 'lines'>, byKey: Readonly<Record<string, VarietyDef>> = VARIETY_BY_KEY): VarietyDef | undefined => planVarieties(plan, byKey)[0];

/** A plan in a jar runs the sprout schedule; a tray runs the full one. */
export function planStages(plan: Pick<GrowPlanDef, 'format'>): readonly StageDef[] {
  return TRAY_FORMAT_BY_KEY[plan.format].kind === 'sprout' ? SPROUT_STAGES : STAGES;
}

/**
 * The days per stage the plan runs on: its override, else the slowest of its varieties at each
 * stage. A plan with no varieties runs zero days everywhere.
 */
export function planStageDays(plan: Pick<GrowPlanDef, 'lines' | 'stageDays'>, byKey: Readonly<Record<string, VarietyDef>> = VARIETY_BY_KEY): StageDays {
  if (plan.stageDays) return plan.stageDays.value;
  const out: Record<Exclude<StageKey, 'packed'>, number> = { soak: 0, sow: 0, germination: 0, blackout: 0, light: 0, 'harvest-window': 0 };
  for (const v of planVarieties(plan, byKey)) {
    for (const k of Object.keys(out) as (keyof typeof out)[]) out[k] = Math.max(out[k], v.stageDays.value[k]);
  }
  return out;
}

/** The variety's seeding density in the format: its grams per 1020 by the format's area factor; per jar for a sprout. */
export function defaultGramsPerTray(variety: VarietyDef, format: TrayFormatKey, share = 1): number {
  return variety.seedGramsPer1020.value * densityFactorOf(TRAY_FORMAT_BY_KEY[format]) * share;
}

/** The default seed line for a variety in a format, at the variety's stated density. */
export function seedLineFor(variety: VarietyDef, format: TrayFormatKey, share = 1): SeedLine {
  return {
    kind: 'seed',
    varietyKey: variety.key,
    gramsPerTray: tagged(defaultGramsPerTray(variety, format, share), variety.seedGramsPer1020.status, 'g', `${variety.seedGramsPer1020.note ?? ''}${share < 1 ? ` × ${share} share of the tray` : ''}`.trim()),
    share,
  };
}

/**
 * The plan a variety is grown on by default: its seed line at the stated density, its default
 * medium, FloraGrow in the bottom water from the light stage on a microgreen, and its default
 * light regime from the light stage. A sprout in a jar carries the seed line alone: no medium,
 * no nutrient, no light.
 */
export function singleVarietyPlan(variety: VarietyDef, format: TrayFormatKey = variety.kind === 'sprout' ? 'pint-jar' : 'flat-1020', serial = 1): GrowPlanDef {
  const sprout = TRAY_FORMAT_BY_KEY[format].kind === 'sprout';
  const lines: GrowPlanLine[] = [seedLineFor(variety, format)];
  if (!sprout) {
    lines.push({ kind: 'medium', mediumKey: variety.media.defaultMedium, qtyPerTray: null });
    lines.push({ kind: 'nutrient', nutrientKey: 'floragrow-npk', mlPerGal: null, startsAt: 'light' });
    lines.push({ kind: 'light', regimeKey: variety.light.defaultRegime, ppfd: null, startsAt: 'light' });
  }
  return {
    code: growPlanCode(variety.code, serial),
    name: variety.name,
    status: 'in_service',
    channels: [1],
    format,
    lines,
    stageDays: null,
    note: sprout ? 'Sprouted in a jar on the sprout schedule.' : '',
    allergensPresent: '',
    allergenFreeClaims: '',
  };
}

export const growPlanCode = (varietyCode: string, serial: number): string => `${varietyCode}-${String(serial).padStart(2, '0')}`;

/** The code prefix of a plan: its lead variety's code, or `MIX` for a mixed tray. */
export function codePrefixFor(plan: Pick<GrowPlanDef, 'lines'>, byKey: Readonly<Record<string, VarietyDef>> = VARIETY_BY_KEY): string {
  const vs = planVarieties(plan, byKey);
  return vs.length === 1 ? vs[0]!.code : MIX_CODE_PREFIX;
}

/** The next code under a prefix: one past the highest serial already in the library. */
export function nextGrowPlanCode(existing: readonly string[], prefix: string): string {
  let max = 0;
  const rx = new RegExp(`^${prefix}-(\\d+)$`);
  for (const c of existing) {
    const m = c.match(rx);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return growPlanCode(prefix, max + 1);
}

/** The label a line shows and is stored under; unique within a plan. */
export function lineLabel(line: GrowPlanLine, byKey: Readonly<Record<string, VarietyDef>> = VARIETY_BY_KEY): string {
  switch (line.kind) {
    case 'seed':
      return byKey[line.varietyKey]?.name ?? line.varietyKey;
    case 'medium':
      return `Medium: ${line.mediumKey}`;
    case 'nutrient':
      return `Nutrient: ${line.nutrientKey} from ${line.startsAt}`;
    case 'light':
      return `Light: ${line.regimeKey} from ${line.startsAt}`;
  }
}

/** What a plan must satisfy before it is stored or costed. Empty when it is whole. */
export function growPlanProblems(plan: Pick<GrowPlanDef, 'code' | 'format' | 'lines'>, byKey: Readonly<Record<string, VarietyDef>> = VARIETY_BY_KEY): string[] {
  const out: string[] = [];
  if (!GROW_PLAN_CODE_RX.test(plan.code)) out.push('The code is a variety code, a dash and a serial: BROC-01.');
  const seeds = seedLines(plan);
  if (seeds.length === 0) out.push('A grow plan needs at least one seed line.');
  for (const s of seeds) {
    if (!byKey[s.varietyKey]) out.push(`No variety with key "${s.varietyKey}".`);
    if (!(s.gramsPerTray.value > 0)) out.push(`${byKey[s.varietyKey]?.name ?? s.varietyKey}: grams per tray must be above zero.`);
    if (!(s.share > 0 && s.share <= 1)) out.push(`${byKey[s.varietyKey]?.name ?? s.varietyKey}: the share is between 0 and 1.`);
  }
  const shares = seeds.reduce((t, s) => t + s.share, 0);
  if (seeds.length > 0 && Math.abs(shares - 1) > 1e-6) out.push(`The seed lines' shares sum to ${shares.toFixed(2)}, not 1.`);
  const keys = new Set(seeds.map((s) => s.varietyKey));
  if (keys.size !== seeds.length) out.push('A variety appears on two seed lines.');
  if (plan.lines.filter(isMediumLine).length > 1) out.push('A plan carries one medium line.');
  if (plan.lines.filter(isLightLine).length > 1) out.push('A plan carries one light line.');
  const sprout = TRAY_FORMAT_BY_KEY[plan.format]?.kind === 'sprout';
  if (sprout && plan.lines.some((l) => l.kind !== 'seed')) out.push('A jar plan carries seed lines only: no medium, nutrient or light.');
  const stageKeys = new Set(planStages(plan).map((s) => s.key));
  for (const l of plan.lines) {
    if ((l.kind === 'nutrient' || l.kind === 'light') && !stageKeys.has(l.startsAt)) out.push(`${lineLabel(l, byKey)}: the plan has no "${l.startsAt}" stage.`);
  }
  return out;
}
