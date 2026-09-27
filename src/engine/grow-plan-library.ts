/**
 * MicroFarm — the grow plan library, engine-side.
 *
 * Ledger-free, database-free. Conversions between a library row pair (`farm.grow_plans` +
 * `farm.grow_plan_lines`) and the grow plan the engine reads, and the next code under a variety.
 * The read layer
 * (`_lib/grow-plans.ts`) and the actions call these so the shape is defined once.
 */

import type { NutrientSolutionDef, GrowingMediumDef } from '@/data/inputs-catalog';
import { nutrientsForPlan } from '@/engine/nutrients';
import { mediaForPlan } from '@/engine/media';
import type { LastPricePaid } from '@/engine/seed-cost';
import type { GrowPlanStatus } from '@/data/plan-data';
import type { Tagged } from '@/data/tagged';
import { GROW_PLAN_CODE_RX, lineLabel, nextGrowPlanCode, type GrowPlanDef, type GrowPlanLine } from '@/data/grow-plan';
import { TRAY_FORMAT_BY_KEY, type TrayFormatKey } from '@/data/tray-formats';
import type { StageDays } from '@/data/stage-schedule';
import { growPlanSeed } from '@/data/grow-plans-seed';

export const GROW_PLAN_STATUSES: GrowPlanStatus[] = ['in_service', 'planned', 'developing'];

/** A library plan: the grow plan and the row identity. */
export interface LibraryGrowPlan extends GrowPlanDef {
  id: string;
  source: 'seed' | 'user_built';
  version: number;
  effectiveFrom: string | null;
  updatedAt: string;
}

export interface GrowPlanHeaderRow {
  id: string;
  code: string;
  name: string;
  status: string;
  channels: unknown;
  format: string;
  stageDays: unknown;
  note: string;
  allergensPresent: string;
  allergenFreeClaims: string;
  source: string;
  version: number;
  effectiveFrom: string | Date | null;
  updatedAt: Date | string;
}

export interface GrowPlanLineRow {
  position: number;
  name: string;
  line: unknown;
}

const iso = (d: string | Date | null): string | null =>
  d === null ? null : typeof d === 'string' ? d : d.toISOString().slice(0, 10);

const LINE_KINDS = new Set(['seed', 'medium', 'nutrient', 'light']);

/** A stored line as the engine reads it; a document of an unknown kind is dropped rather than guessed at. */
export function lineFromStored(raw: unknown): GrowPlanLine | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const kind = (raw as { kind?: unknown }).kind;
  return typeof kind === 'string' && LINE_KINDS.has(kind) ? (raw as GrowPlanLine) : null;
}

/** The last prices paid of the varieties a plan sows, when any has one. */
function lastPaidFor(lines: readonly GrowPlanLine[], lastPaid?: Readonly<Record<string, LastPricePaid>>): { lastPaid?: Record<string, LastPricePaid> } {
  if (!lastPaid) return {};
  const own: Record<string, LastPricePaid> = {};
  for (const l of lines) if (l.kind === 'seed' && lastPaid[l.varietyKey]) own[l.varietyKey] = lastPaid[l.varietyKey]!;
  return Object.keys(own).length > 0 ? { lastPaid: own } : {};
}

/** The stored grow plan. */
export function rowsToGrowPlan(header: GrowPlanHeaderRow, lines: readonly GrowPlanLineRow[], nutrients?: Readonly<Record<string, NutrientSolutionDef>>, lastPaid?: Readonly<Record<string, LastPricePaid>>, media?: Readonly<Record<string, GrowingMediumDef>>): GrowPlanDef {
  const status = GROW_PLAN_STATUSES.includes(header.status as GrowPlanStatus) ? (header.status as GrowPlanStatus) : 'developing';
  const format = (header.format in TRAY_FORMAT_BY_KEY ? header.format : 'flat-1020') as TrayFormatKey;
  const sd = header.stageDays;
  const stageDays = sd && typeof sd === 'object' && 'value' in (sd as object) ? (sd as Tagged<StageDays>) : null;
  const planLines = [...lines]
    .sort((a, b) => a.position - b.position)
    .map((l) => lineFromStored(l.line))
    .filter((l): l is GrowPlanLine => l !== null);
  return {
    code: header.code,
    name: header.name,
    status,
    channels: Array.isArray(header.channels) ? (header.channels as number[]).filter((n) => Number.isInteger(n)) : [],
    format,
    lines: planLines,
    stageDays,
    note: header.note ?? '',
    allergensPresent: header.allergensPresent ?? '',
    allergenFreeClaims: header.allergenFreeClaims ?? '',
    ...(nutrients ? { nutrients: nutrientsForPlan({ lines: planLines }, nutrients) } : {}),
    ...(media ? { media: mediaForPlan({ lines: planLines }, media) } : {}),
    ...lastPaidFor(planLines, lastPaid),
  };
}

export function rowsToLibraryPlan(header: GrowPlanHeaderRow, lines: readonly GrowPlanLineRow[], nutrients?: Readonly<Record<string, NutrientSolutionDef>>, lastPaid?: Readonly<Record<string, LastPricePaid>>, media?: Readonly<Record<string, GrowingMediumDef>>): LibraryGrowPlan {
  const plan = rowsToGrowPlan(header, lines, nutrients, lastPaid, media);
  return {
    ...plan,
    id: header.id,
    source: header.source === 'seed' ? 'seed' : 'user_built',
    version: header.version,
    effectiveFrom: iso(header.effectiveFrom),
    updatedAt: typeof header.updatedAt === 'string' ? header.updatedAt : header.updatedAt.toISOString(),
  };
}

/** The header + lines a grow plan writes. Lines keep their order as positions. */
export function growPlanToRows(plan: GrowPlanDef): {
  header: Omit<GrowPlanHeaderRow, 'id' | 'version' | 'effectiveFrom' | 'updatedAt'>;
  lines: GrowPlanLineRow[];
} {
  return {
    header: {
      code: plan.code,
      name: plan.name,
      status: plan.status,
      channels: plan.channels,
      format: plan.format,
      stageDays: plan.stageDays,
      note: plan.note,
      allergensPresent: plan.allergensPresent,
      allergenFreeClaims: plan.allergenFreeClaims,
      source: 'user_built',
    },
    lines: plan.lines.map((line, position) => ({ position, name: lineLabel(line), line })),
  };
}

/** The seed the library starts from when it is empty: one plan per variety. */
export const SEED_GROW_PLANS: readonly GrowPlanDef[] = growPlanSeed;

/** The next code under a variety code (or `MIX`), one past the highest serial already in the library. */

export const isGrowPlanCode = (code: string): boolean => GROW_PLAN_CODE_RX.test(code);

/** The plan that stands for the facility where one is needed: the first In Service, else the first. */
export function referenceGrowPlan<T extends GrowPlanDef>(library: readonly T[]): T | undefined {
  return library.find((r) => r.status === 'in_service') ?? library[0];
}
