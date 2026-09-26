/**
 * MicroFarm — the grow plan library, engine-side.
 *
 * Ledger-free, database-free. Conversions between a library row pair (`farm.crop_plans` +
 * `farm.crop_plan_lines`) and the grow plan the engine reads, the next code under a variety, and
 * the library plan's legacy projection (`grow-plan-bridge.ts`). The read layer
 * (`_lib/crop-plans.ts`) and the actions call these so the shape is defined once.
 */

import type { CropPlanDef, CropPlanStatus } from '@/data/plan-data';
import type { Tagged } from '@/data/tagged';
import { GROW_PLAN_CODE_RX, lineLabel, nextGrowPlanCode, type GrowPlanDef, type GrowPlanLine } from '@/data/grow-plan';
import { TRAY_FORMAT_BY_KEY, type TrayFormatKey } from '@/data/tray-formats';
import type { StageDays } from '@/data/stage-schedule';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { projectCropPlan, type GrowPlanCarrier } from '@/engine/grow-plan-bridge';

export const CROP_PLAN_STATUSES: CropPlanStatus[] = ['in_service', 'planned', 'developing'];

/** A library plan: the grow plan, its legacy projection for the engine, and the row identity. */
export interface LibraryCropPlan extends GrowPlanCarrier {
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
  status: string;
  channels: unknown;
  format: string;
  stageDays: unknown;
  note: string;
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

const LINE_KINDS = new Set(['seed', 'medium', 'nutrient', 'light']);

/** A stored line as the engine reads it; a document of an unknown kind is dropped rather than guessed at. */
export function lineFromStored(raw: unknown): GrowPlanLine | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const kind = (raw as { kind?: unknown }).kind;
  return typeof kind === 'string' && LINE_KINDS.has(kind) ? (raw as GrowPlanLine) : null;
}

/** The stored grow plan, before projection. */
export function rowsToGrowPlan(header: CropPlanHeaderRow, lines: readonly CropPlanLineRow[]): GrowPlanDef {
  const status = CROP_PLAN_STATUSES.includes(header.status as CropPlanStatus) ? (header.status as CropPlanStatus) : 'developing';
  const format = (header.format in TRAY_FORMAT_BY_KEY ? header.format : 'flat-1020') as TrayFormatKey;
  const sd = header.stageDays;
  const stageDays = sd && typeof sd === 'object' && 'value' in (sd as object) ? (sd as Tagged<StageDays>) : null;
  return {
    code: header.code,
    name: header.name,
    status,
    channels: Array.isArray(header.channels) ? (header.channels as number[]).filter((n) => Number.isInteger(n)) : [],
    format,
    lines: [...lines]
      .sort((a, b) => a.position - b.position)
      .map((l) => lineFromStored(l.line))
      .filter((l): l is GrowPlanLine => l !== null),
    stageDays,
    note: header.note ?? '',
  };
}

export function rowsToCropPlan(header: CropPlanHeaderRow, lines: readonly CropPlanLineRow[]): LibraryCropPlan {
  const plan = rowsToGrowPlan(header, lines);
  return {
    ...projectCropPlan(plan),
    id: header.id,
    source: header.source === 'seed' ? 'seed' : 'user_built',
    version: header.version,
    effectiveFrom: iso(header.effectiveFrom),
    updatedAt: typeof header.updatedAt === 'string' ? header.updatedAt : header.updatedAt.toISOString(),
  };
}

/** The header + lines a grow plan writes. Lines keep their order as positions. */
export function cropPlanToRows(plan: GrowPlanDef): {
  header: Omit<CropPlanHeaderRow, 'id' | 'version' | 'effectiveFrom' | 'updatedAt'> & { category: string; components: string; productionMethod: string; allergensPresent: string; allergenFreeClaims: string; sowingUnits: number; spec: Record<string, never> };
  lines: CropPlanLineRow[];
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
      // Phase 1-era columns, kept empty until part 10 drops them.
      category: '',
      components: '',
      productionMethod: '',
      allergensPresent: '',
      allergenFreeClaims: '',
      sowingUnits: 1,
      spec: {},
      source: 'user_built',
    },
    lines: plan.lines.map((line, position) => ({ position, name: lineLabel(line), line })),
  };
}

/** The seed the library starts from when it is empty: one plan per variety. */
export const SEED_GROW_PLANS: readonly GrowPlanDef[] = growPlanSeed;

/** The next code under a variety code (or `MIX`), one past the highest serial already in the library. */
export function nextCropPlanCode(existing: readonly string[], prefix: string): string {
  return nextGrowPlanCode(existing, prefix);
}

export const isGrowPlanCode = (code: string): boolean => GROW_PLAN_CODE_RX.test(code);

/** The plan that stands for the facility where one is needed: the first In Service, else the first. */
export function referenceCropPlan<T extends CropPlanDef>(library: readonly T[]): T | undefined {
  return library.find((r) => r.status === 'in_service') ?? library[0];
}
