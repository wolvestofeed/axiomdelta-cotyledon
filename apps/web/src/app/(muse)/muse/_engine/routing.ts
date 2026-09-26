/**
 * Impact OS — the process route per recipe (scheduler build plan §0, W0 step 3). Pure.
 *
 * A route is derived, never authored beside the study. Its steps are the lines
 * of the recipe's labor standard — the adopted study, or the estimate that
 * stands in — in study order, each on its line's stream. A step takes:
 *   - its KIND off the time-study scaffold (or the plan's task names for the
 *     plan's own study), which is what precedence reads;
 *   - its RESOURCE off the thermal map and the Phase 1 equipment list: a cook's
 *     vessel from its thermal process, the blast chiller for the chill, the
 *     cutter mixer for a prep at the VCM, the tray sealer for the seal;
 *   - its MINUTES off the line: a fixed line's elapsed minutes are setup, a
 *     per-portion line's are run minutes per portion at the batch studied, so
 *     duration = setup + portions × run, and labor the same on labor minutes.
 *     Portions are the batch's on the batch stream and the day's shipped on the
 *     dispatch stream.
 *
 * Precedence is finish-to-start, derived from the kinds, and an assumption a
 * scenario overrides step by step (`routing` overlay):
 *   batch    — receiving → scaling → prep → cook (the cooks run alongside each
 *              other; a cook waits for its own component's prep) → chill, which
 *              waits for every cook → line turnaround;
 *   dispatch — the cold assemblies run alongside each other from staged
 *              components → portion and assemble, which waits for every one →
 *              seal → temperature check at pack → load.
 * No edge crosses the streams: dispatch starts from components a batch already
 * chilled and staged.
 *
 * Report, never repair: a line no kind names, a cook with no vessel on the
 * Phase 1 list, an overnight process, an unknown predecessor or a cycle comes
 * back as a finding. Nothing is dropped or re-ordered to make the route fit.
 */

import type { EquipmentLine } from '../_data/capex';
import { RESOURCE_SEED } from '../_data/capex';
import type { RecipeDef } from '../_data/plan-data';
import { timeStudy } from '../_data/plan-data';
import { tagged, type Tagged } from '../_data/tagged';
import { LOAD_TASK, PACK_CHECK_TASK, type LaborScaling, type TimeStudyDoc, type TimeStudyStream } from '../_data/time-studies';
import { batchVesselsFrom, isBlastChiller, phaseOneEquipment, vesselForProcess } from './equipment';
import { recipeThermal, PLAN_RANGE_POINT } from './thermal';
import { timeStudyScaffold, type ScaffoldKind } from './time-study-estimate';

export type RouteStepKind = ScaffoldKind | 'other';

export interface RouteStep {
  /** Stable within the recipe: the kind, with the component or the line position where the kind repeats. */
  id: string;
  /** The line's position in the study, 1-based. */
  seq: number;
  stream: TimeStudyStream;
  kind: RouteStepKind;
  component: string | null;
  task: string;
  station: string | null;
  /** The equipment library key the step runs on; null on a labor-only step. */
  resourceKey: string | null;
  /** People the step needs at once, fixed by the study line. */
  staff: number;
  scalesWith: LaborScaling;
  setupMinutes: number;
  runMinutesPerPortion: number;
  laborMinutesFixed: number;
  laborMinutesPerPortion: number;
  /** The crew works the whole duration (labor = staff × elapsed on the line); otherwise the step is tended. */
  attended: boolean;
  ccp: string | null;
  /** The thermal process runs across the night before the production day. */
  priorDay: boolean;
  /** Finish-to-start predecessors, by step id. */
  after: string[];
  /** Some field on the step is the scenario's edit. */
  edited: boolean;
}

export type RouteFindingKind = 'no-study' | 'unclassified-line' | 'no-resource' | 'unknown-resource' | 'overnight-process' | 'unknown-predecessor' | 'cycle';

export interface RouteFinding {
  kind: RouteFindingKind;
  stepId: string | null;
  detail: string;
}

export interface RecipeRoute {
  recipeCode: string;
  studyId: string | null;
  basis: TimeStudyDoc['basis'] | null;
  /** The batch the study was timed at: the basis of every per-portion figure. */
  batchSize: number;
  steps: RouteStep[];
  /** Step ids in an order every edge respects, ties by study position; null when the edges hold a cycle. */
  order: string[] | null;
  findings: RouteFinding[];
}

/** A scenario's edit to one step, keyed `<recipe code>::<step id>` in the `routing` section. */
export interface RouteStepOverlay {
  staff?: number;
  setupMinutes?: number;
  runMinutesPerPortion?: number;
  laborMinutesFixed?: number;
  laborMinutesPerPortion?: number;
  after?: string[];
  resourceKey?: string | null;
}

export const routeKey = (recipeCode: string, stepId: string) => `${recipeCode}::${stepId}`;

/** The `routing` section's edits for one recipe, keyed by step id. */
export function routeOverlayFor(routing: Readonly<Record<string, RouteStepOverlay>>, recipeCode: string): Record<string, RouteStepOverlay> {
  const prefix = `${recipeCode}::`;
  return Object.fromEntries(Object.entries(routing).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
}

export const stepDuration = (s: Pick<RouteStep, 'setupMinutes' | 'runMinutesPerPortion'>, portions: number): number => s.setupMinutes + portions * s.runMinutesPerPortion;
export const stepLaborMinutes = (s: Pick<RouteStep, 'laborMinutesFixed' | 'laborMinutesPerPortion'>, portions: number): number => s.laborMinutesFixed + portions * s.laborMinutesPerPortion;

/** The plan's own task names (the AMK-E-001 seed study) by kind. */
const PLAN_KINDS: Partial<Record<string, ScaffoldKind>> = {
  'Receiving, verification, put-away': 'receiving',
  'Dry goods scaling and mise en place': 'scaling',
  'Bean cook (soaked prior day)': 'cook',
  'Rice cook': 'cook',
  'Beef browning and seasoning': 'cook',
  'Vegetable wash, trim, cut': 'prep',
  'Vegetable roasting': 'cook',
  'Salsa roja production': 'cook',
  'Component blast chill and stage': 'chill',
  'Line turnaround and sanitation': 'turnaround',
  'Portion and assemble bowls': 'assemble',
  'Seal, label, date and lot code': 'seal',
  [PACK_CHECK_TASK]: 'pack-check',
  [LOAD_TASK]: 'load',
};

/** Kinds that occur once in a route; the others repeat per component. */
const SINGLE: ReadonlySet<RouteStepKind> = new Set(['receiving', 'scaling', 'chill', 'turnaround', 'assemble', 'seal', 'pack-check', 'load']);

/** Predecessor kinds by kind, the first group present in the stream wins. Cook and other are handled apart. */
const CHAIN: Partial<Record<ScaffoldKind, ScaffoldKind[][]>> = {
  receiving: [],
  scaling: [['receiving']],
  prep: [['scaling'], ['receiving']],
  chill: [['cook'], ['prep'], ['scaling'], ['receiving']],
  turnaround: [['chill'], ['cook'], ['prep'], ['scaling'], ['receiving']],
  cold: [],
  assemble: [['cold']],
  seal: [['assemble'], ['cold']],
  'pack-check': [['seal'], ['assemble'], ['cold']],
  load: [['pack-check'], ['seal'], ['assemble'], ['cold']],
};

function derivedAfter(step: RouteStep, steps: readonly RouteStep[]): string[] {
  const mine = steps.filter((s) => s.stream === step.stream && s.id !== step.id);
  const ofKind = (k: RouteStepKind) => mine.filter((s) => s.kind === k).map((s) => s.id);
  const firstPresent = (groups: ScaffoldKind[][]) => {
    for (const g of groups) {
      const ids = g.flatMap(ofKind);
      if (ids.length) return ids;
    }
    return [];
  };
  if (step.kind === 'other') {
    const prev = mine.filter((s) => s.seq < step.seq).pop();
    return prev ? [prev.id] : [];
  }
  if (step.kind === 'cook') {
    const ownPrep = mine.filter((s) => s.kind === 'prep' && step.component !== null && s.component === step.component).map((s) => s.id);
    if (ownPrep.length) return ownPrep;
    const sharedPrep = mine.filter((s) => s.kind === 'prep' && s.component === null).map((s) => s.id);
    if (sharedPrep.length) return sharedPrep;
    return firstPresent([['scaling'], ['receiving']]);
  }
  return firstPresent(CHAIN[step.kind] ?? []);
}

/** Step ids in an order every edge respects, lowest study position first among the ready; null on a cycle. */
export function routeOrder(steps: readonly Pick<RouteStep, 'id' | 'seq' | 'after'>[]): string[] | null {
  const ids = new Set(steps.map((s) => s.id));
  const pending = new Map(steps.map((s) => [s.id, new Set(s.after.filter((a) => ids.has(a)))]));
  const bySeq = [...steps].sort((a, b) => a.seq - b.seq);
  const order: string[] = [];
  while (order.length < steps.length) {
    const next = bySeq.find((s) => !order.includes(s.id) && pending.get(s.id)!.size === 0);
    if (!next) return null;
    order.push(next.id);
    for (const deps of pending.values()) deps.delete(next.id);
  }
  return order;
}

/**
 * How deep each step sits in its stream's precedence: 0 with no predecessor on
 * the stream, otherwise one past the deepest predecessor. The process map reads
 * it as the column a step is drawn in; steps in one column may run alongside
 * each other. A step in a cycle is left at its own depth and reported by
 * `deriveRoute`, never re-ordered.
 */
export function routeDepths(steps: readonly Pick<RouteStep, 'id' | 'seq' | 'stream' | 'after'>[]): Map<string, number> {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const depth = new Map<string, number>();
  const of = (id: string, seen: ReadonlySet<string>): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    const s = byId.get(id);
    if (!s || seen.has(id)) return 0;
    const preds = s.after.filter((a) => byId.get(a)?.stream === s.stream);
    const d = preds.length === 0 ? 0 : Math.max(...preds.map((a) => of(a, new Set([...seen, id])) + 1));
    depth.set(id, d);
    return d;
  };
  for (const s of [...steps].sort((a, b) => a.seq - b.seq)) of(s.id, new Set());
  return depth;
}

/** A recipe's route off its labor standard, its thermal map and the Phase 1 equipment list, with the scenario's step edits. */
export function deriveRoute(input: {
  recipe: RecipeDef;
  standard: TimeStudyDoc | null;
  equipment: readonly EquipmentLine[];
  /** The scenario's edits for this recipe, keyed by step id (`routeOverlayFor`). */
  overlay?: Readonly<Record<string, RouteStepOverlay>>;
}): RecipeRoute {
  const { recipe, standard } = input;
  const findings: RouteFinding[] = [];
  if (!standard) {
    findings.push({ kind: 'no-study', stepId: null, detail: `${recipe.code} has no time study on file, so it has no route.` });
    return { recipeCode: recipe.code, studyId: null, basis: null, batchSize: 0, steps: [], order: [], findings };
  }

  const scaffold = timeStudyScaffold(recipe);
  const thermal = new Map(recipeThermal(recipe, PLAN_RANGE_POINT).components.map((c) => [c.component, c]));
  const vessels = batchVesselsFrom([...input.equipment]);
  const phaseOne = phaseOneEquipment(input.equipment).filter((e) => e.qty > 0);
  const onList = (re: RegExp) => phaseOne.find((e) => re.test(e.item)) ?? null;
  const batch = standard.batchSize;
  const taken = new Set<string>();

  const steps: RouteStep[] = standard.lines.map((line, i) => {
    const seq = i + 1;
    const s = scaffold.find((t) => line.task === t.task || (t.kind === 'cook' && line.task.startsWith(`${t.task} (`)));
    const kind: RouteStepKind = s?.kind ?? PLAN_KINDS[line.task] ?? 'other';
    const component = s?.component ?? null;
    const ccp = s ? s.ccp : (timeStudy.tasks.find((t) => t.task === line.task)?.ccp ?? null);
    const base = component ? `${kind}:${component}` : kind;
    const id = (component || SINGLE.has(kind)) && !taken.has(base) ? base : `${kind}#${seq}`;
    taken.add(id);

    let resourceKey: string | null = null;
    let priorDay = false;
    if (kind === 'cook') {
      const th = component ? thermal.get(component) : undefined;
      if (component && th?.process) {
        priorDay = th.process.overnight;
        resourceKey = vesselForProcess(th.process.equipment, vessels)?.key ?? null;
        if (!resourceKey) findings.push({ kind: 'no-resource', stepId: id, detail: `${line.task}: the thermal standard cooks it in ${th.process.equipment}, which is not on the Phase 1 equipment list with a batch capacity.` });
        if (priorDay) findings.push({ kind: 'overnight-process', stepId: id, detail: `${line.task}: the thermal standard runs ${th.process.name} overnight (${th.process.minMinutes}–${th.process.maxMinutes} min). The operating rules allow no overnight activity other than soaking.` });
      } else if (component) {
        findings.push({ kind: 'no-resource', stepId: id, detail: `${line.task}: no cook process is on file for ${component}, so no vessel is named.` });
      } else {
        resourceKey = line.station ? vesselForProcess(line.station, vessels)?.key ?? null : null;
        if (!resourceKey) findings.push({ kind: 'no-resource', stepId: id, detail: `${line.task}: the station ${line.station ? `"${line.station}"` : 'on the line'} names no vessel on the Phase 1 equipment list.` });
      }
    } else if (kind === 'chill') {
      resourceKey = vessels.find((v) => isBlastChiller(v.item))?.key ?? null;
      if (!resourceKey) findings.push({ kind: 'no-resource', stepId: id, detail: `${line.task}: no blast chiller is on the Phase 1 equipment list.` });
    } else if (kind === 'prep' && /vcm/i.test(line.station ?? '')) {
      resourceKey = onList(/^Vertical cutter mixer/i)?.key ?? null;
    } else if (kind === 'seal') {
      resourceKey = onList(/^Tray sealer/i)?.key ?? null;
      if (!resourceKey) findings.push({ kind: 'no-resource', stepId: id, detail: `${line.task}: no tray sealer is on the Phase 1 equipment list.` });
    } else if (kind === 'other') {
      findings.push({ kind: 'unclassified-line', stepId: id, detail: `"${line.task}" is not a task the scaffold names; it follows the line before it on the ${line.stream} stream.` });
    }

    const fixed = line.scalesWith === 'fixed';
    return {
      id,
      seq,
      stream: line.stream,
      kind,
      component,
      task: line.task,
      station: line.station,
      resourceKey,
      staff: line.staff,
      scalesWith: line.scalesWith,
      setupMinutes: fixed ? line.elapsedMinutes : 0,
      runMinutesPerPortion: fixed || batch <= 0 ? 0 : line.elapsedMinutes / batch,
      laborMinutesFixed: fixed ? line.laborMinutes : 0,
      laborMinutesPerPortion: fixed || batch <= 0 ? 0 : line.laborMinutes / batch,
      attended: line.elapsedMinutes > 0 && line.laborMinutes + 1e-9 >= line.staff * line.elapsedMinutes,
      ccp,
      priorDay,
      after: [],
      edited: false,
    };
  });
  for (const step of steps) step.after = derivedAfter(step, steps);

  // The scenario's edits, then what they leave unresolved.
  const ids = new Set(steps.map((s) => s.id));
  const keys = new Set(input.equipment.map((e) => e.key));
  for (const step of steps) {
    const o = input.overlay?.[step.id];
    if (!o) continue;
    if (o.staff !== undefined) step.staff = o.staff;
    if (o.setupMinutes !== undefined) step.setupMinutes = o.setupMinutes;
    if (o.runMinutesPerPortion !== undefined) step.runMinutesPerPortion = o.runMinutesPerPortion;
    if (o.laborMinutesFixed !== undefined) step.laborMinutesFixed = o.laborMinutesFixed;
    if (o.laborMinutesPerPortion !== undefined) step.laborMinutesPerPortion = o.laborMinutesPerPortion;
    if (o.after !== undefined) step.after = [...o.after];
    if (o.resourceKey !== undefined) step.resourceKey = o.resourceKey;
    step.edited = true;
    for (const a of step.after) {
      if (!ids.has(a)) findings.push({ kind: 'unknown-predecessor', stepId: step.id, detail: `${step.task}: the scenario names "${a}" as a predecessor, and ${recipe.code}'s route has no step with that id.` });
    }
    if (step.resourceKey !== null && !keys.has(step.resourceKey)) findings.push({ kind: 'unknown-resource', stepId: step.id, detail: `${step.task}: the scenario names "${step.resourceKey}", which is not in the equipment library.` });
  }
  for (const id of Object.keys(input.overlay ?? {})) {
    if (!ids.has(id)) findings.push({ kind: 'unknown-predecessor', stepId: id, detail: `The scenario edits step "${id}", and ${recipe.code}'s route has no step with that id.` });
  }

  const order = routeOrder(steps);
  if (!order) findings.push({ kind: 'cycle', stepId: null, detail: `${recipe.code}'s precedence edges form a cycle, so no step order satisfies them.` });

  return { recipeCode: recipe.code, studyId: standard.id, basis: standard.basis, batchSize: batch, steps, order, findings };
}

// ── The units as scheduling resources ─────────────────────────────────────────

/** A scenario's edit to one unit's resource attributes, keyed by equipment key in the `resources` section. */
export interface ResourceOverlay {
  concurrentBatches?: number | null;
  changeoverMinutes?: number | null;
  attendedRun?: boolean | null;
  mayRunUnattended?: boolean | null;
}

export interface RouteResource {
  key: string;
  item: string;
  units: number;
  concurrentBatches: Tagged<number | null>;
  changeoverMinutes: Tagged<number | null>;
  attendedRun: Tagged<boolean | null>;
  mayRunUnattended: Tagged<boolean | null>;
}

/**
 * The Phase 1 units that carry a resource attribute (or a scenario edit to one),
 * each attribute tagged: the scenario's edit is STATED; the library's value is a
 * PLACEHOLDER while estimated and STATED once stated or observed.
 */
export function routeResources(
  equipment: readonly EquipmentLine[],
  overlay: Readonly<Record<string, ResourceOverlay>> = {},
): RouteResource[] {
  const has = (e: EquipmentLine) => [e.concurrentBatches, e.changeoverMinutes, e.attendedRun, e.mayRunUnattended].some((v) => v !== undefined && v !== null);
  return phaseOneEquipment(equipment)
    .filter((e) => e.qty > 0 && (has(e) || overlay[e.key]))
    .map((e) => {
      const o = overlay[e.key] ?? {};
      const known = e.resourceBasis === 'stated' || e.resourceBasis === 'observed';
      const libraryNote = known ? `${e.resourceBasis === 'stated' ? 'Stated' : 'Observed'} on Equipment` : `Estimated — an open field on Equipment. ${RESOURCE_SEED[e.item]?.note ?? ''}`.trim();
      function attr<T>(edit: T | null | undefined, library: T | null | undefined, unit?: string): Tagged<T | null> {
        if (edit !== undefined) return tagged<T | null>(edit, 'STATED', unit, 'Edited in this scenario');
        return tagged<T | null>(library ?? null, known ? 'STATED' : 'PLACEHOLDER', unit, libraryNote);
      }
      return {
        key: e.key,
        item: e.item,
        units: e.qty,
        concurrentBatches: attr(o.concurrentBatches, e.concurrentBatches, 'batches'),
        changeoverMinutes: attr(o.changeoverMinutes, e.changeoverMinutes, 'min'),
        attendedRun: attr(o.attendedRun, e.attendedRun),
        mayRunUnattended: attr(o.mayRunUnattended, e.mayRunUnattended),
      };
    });
}
