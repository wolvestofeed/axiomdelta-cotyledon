/**
 * MicroFarm — the process route per crop plan (scheduler build plan §0, W0 step 3). Pure.
 *
 * A route is derived, never authored beside the study. Its steps are the lines
 * of the crop plan's labor standard — the adopted study, or the estimate that
 * stands in — in study order, each on its line's stream. A step takes:
 *   - its KIND off the time-study scaffold (or the plan's task names for the
 *     plan's own study), which is what precedence reads;
 *   - its RESOURCE off the stage map and the Phase 1 equipment list: a sow's
 *     grow unit from its grow stage, the blackout rack for the blackout, the
 *     cutter mixer for a prep at the VCM, the tray sealer for the seal;
 *   - its MINUTES off the line: a fixed line's elapsed minutes are setup, a
 *     per-unit line's are run minutes per unit at the sowing studied, so
 *     duration = setup + units × run, and labor the same on labor minutes.
 *     Units are the sowing's on the sowing stream and the day's shipped on the
 *     harvest stream.
 *
 * Precedence is finish-to-start, derived from the kinds, and an assumption a
 * scenario overrides step by step (`routing` overlay):
 *   sowing    — receiving → scaling → prep → sow (the sows run alongside each
 *              other; a sow waits for its own component's prep) → blackout, which
 *              waits for every sow → line turnaround;
 *   harvest — the cold assemblies run alongside each other from staged
 *              components → unit and assemble, which waits for every one →
 *              seal → temperature check at pack → load.
 * No edge crosses the streams: harvest starts from components a sowing already
 * blackout and staged.
 *
 * Report, never repair: a line no kind names, a sow with no grow unit on the
 * Phase 1 list, an overnight process, an unknown predecessor or a cycle comes
 * back as a finding. Nothing is dropped or re-ordered to make the route fit.
 */

import type { EquipmentLine } from '../_data/capex';
import { RESOURCE_SEED } from '../_data/capex';
import type { CropPlanDef } from '../_data/plan-data';
import { timeStudy } from '../_data/plan-data';
import { tagged, type Tagged } from '../_data/tagged';
import { LOAD_TASK, PACK_CHECK_TASK, type LaborScaling, type TimeStudyDoc, type TimeStudyStream } from '../_data/time-studies';
import { sowingGrowUnitsFrom, isBlackoutRack, phaseOneEquipment, growUnitForProcess } from './equipment';
import { cropPlanStage, PLAN_RANGE_POINT } from './stage';
import { timeStudyScaffold, type ScaffoldKind } from './time-study-estimate';
import { isGrowPlanCarrier } from './grow-plan-bridge';

export type RouteStepKind = ScaffoldKind | 'other';

export interface RouteStep {
  /** Stable within the crop plan: the kind, with the component or the line position where the kind repeats. */
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
  runMinutesPerUnit: number;
  laborMinutesFixed: number;
  laborMinutesPerUnit: number;
  /** The crew works the whole duration (labor = staff × elapsed on the line); otherwise the step is tended. */
  attended: boolean;
  controlPoint: string | null;
  /** The grow stage runs across the night before the production day. */
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

export interface CropPlanRoute {
  cropPlanCode: string;
  studyId: string | null;
  basis: TimeStudyDoc['basis'] | null;
  /** The sowing the study was timed at: the basis of every per-unit figure. */
  sowingSize: number;
  steps: RouteStep[];
  /** Step ids in an order every edge respects, ties by study position; null when the edges hold a cycle. */
  order: string[] | null;
  findings: RouteFinding[];
}

/** A scenario's edit to one step, keyed `<crop plan code>::<step id>` in the `routing` section. */
export interface RouteStepOverlay {
  staff?: number;
  setupMinutes?: number;
  runMinutesPerUnit?: number;
  laborMinutesFixed?: number;
  laborMinutesPerUnit?: number;
  after?: string[];
  resourceKey?: string | null;
}

export const routeKey = (cropPlanCode: string, stepId: string) => `${cropPlanCode}::${stepId}`;

/** The `routing` section's edits for one crop plan, keyed by step id. */
export function routeOverlayFor(routing: Readonly<Record<string, RouteStepOverlay>>, cropPlanCode: string): Record<string, RouteStepOverlay> {
  const prefix = `${cropPlanCode}::`;
  return Object.fromEntries(Object.entries(routing).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
}

export const stepDuration = (s: Pick<RouteStep, 'setupMinutes' | 'runMinutesPerUnit'>, units: number): number => s.setupMinutes + units * s.runMinutesPerUnit;
export const stepLaborMinutes = (s: Pick<RouteStep, 'laborMinutesFixed' | 'laborMinutesPerUnit'>, units: number): number => s.laborMinutesFixed + units * s.laborMinutesPerUnit;

/** The plan's own task names (the AMK-E-001 seed study) by kind. */
const PLAN_KINDS: Partial<Record<string, ScaffoldKind>> = {
  'Receiving, verification, put-away': 'receiving',
  'Dry goods scaling and mise en place': 'scaling',
  'Bean sow (soaked prior day)': 'sow',
  'Rice sow': 'sow',
  'Beef browning and seasoning': 'sow',
  'Vegetable wash, trim, cut': 'prep',
  'Vegetable roasting': 'sow',
  'Salsa roja production': 'sow',
  'Component blackout and stage': 'blackout',
  'Line turnaround and sanitation': 'turnaround',
  'Unit and assemble bowls': 'assemble',
  'Seal, label, date and lot code': 'seal',
  [PACK_CHECK_TASK]: 'pack-check',
  [LOAD_TASK]: 'load',
};

/** Kinds that occur once in a route; the others repeat per component. */
const SINGLE: ReadonlySet<RouteStepKind> = new Set(['receiving', 'scaling', 'blackout', 'turnaround', 'assemble', 'seal', 'pack-check', 'load']);

/** Predecessor kinds by kind, the first group present in the stream wins. Sow and other are handled apart. */
const CHAIN: Partial<Record<ScaffoldKind, ScaffoldKind[][]>> = {
  receiving: [],
  scaling: [['receiving']],
  prep: [['scaling'], ['receiving']],
  blackout: [['sow'], ['prep'], ['scaling'], ['receiving']],
  turnaround: [['blackout'], ['sow'], ['prep'], ['scaling'], ['receiving']],
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
  if (step.kind === 'other' || step.kind === 'harvest' || step.kind === 'daily') {
    const prev = mine.filter((s) => s.seq < step.seq).pop();
    return prev ? [prev.id] : [];
  }
  if (step.kind === 'sow') {
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

/** A crop plan's route off its labor standard, its stage map and the Phase 1 equipment list, with the scenario's step edits. */
export function deriveRoute(input: {
  cropPlan: CropPlanDef;
  standard: TimeStudyDoc | null;
  equipment: readonly EquipmentLine[];
  /** The scenario's edits for this crop plan, keyed by step id (`routeOverlayFor`). */
  overlay?: Readonly<Record<string, RouteStepOverlay>>;
}): CropPlanRoute {
  const { cropPlan, standard } = input;
  const findings: RouteFinding[] = [];
  if (!standard) {
    findings.push({ kind: 'no-study', stepId: null, detail: `${cropPlan.code} has no time study on file, so it has no route.` });
    return { cropPlanCode: cropPlan.code, studyId: null, basis: null, sowingSize: 0, steps: [], order: [], findings };
  }

  const scaffold = timeStudyScaffold(cropPlan);
  // A grow plan's daily lines are the calendar's, not the day's clock; its sow and harvest run at the stations, on no equipment.
  const grow = isGrowPlanCarrier(cropPlan);
  const routeLines = grow ? standard.lines.filter((l) => l.stream !== 'daily') : standard.lines;
  const stage = new Map(cropPlanStage(cropPlan, PLAN_RANGE_POINT).components.map((c) => [c.component, c]));
  const growUnits = sowingGrowUnitsFrom([...input.equipment]);
  const phaseOne = phaseOneEquipment(input.equipment).filter((e) => e.qty > 0);
  const onList = (re: RegExp) => phaseOne.find((e) => re.test(e.item)) ?? null;
  const sowing = standard.sowingSize;
  const taken = new Set<string>();

  const steps: RouteStep[] = routeLines.map((line, i) => {
    const seq = i + 1;
    const s = scaffold.find((t) => line.task === t.task || (t.kind === 'sow' && line.task.startsWith(`${t.task} (`)));
    const kind: RouteStepKind = s?.kind ?? PLAN_KINDS[line.task] ?? 'other';
    const component = s?.component ?? null;
    const controlPoint = s ? s.controlPoint : (timeStudy.tasks.find((t) => t.task === line.task)?.controlPoint ?? null);
    const base = component ? `${kind}:${component}` : kind;
    const id = (component || SINGLE.has(kind)) && !taken.has(base) ? base : `${kind}#${seq}`;
    taken.add(id);

    let resourceKey: string | null = null;
    let priorDay = false;
    if (grow) {
      // Labor at a station; the grow unit is the calendar's resource for the cycle, not the day's.
    } else if (kind === 'sow') {
      const th = component ? stage.get(component) : undefined;
      if (component && th?.process) {
        priorDay = th.process.overnight;
        resourceKey = growUnitForProcess(th.process.equipment, growUnits)?.key ?? null;
        if (!resourceKey) findings.push({ kind: 'no-resource', stepId: id, detail: `${line.task}: the stage standard sows it in ${th.process.equipment}, which is not on the Phase 1 equipment list with a sowing capacity.` });
        if (priorDay) findings.push({ kind: 'overnight-process', stepId: id, detail: `${line.task}: the stage standard runs ${th.process.name} overnight (${th.process.minMinutes}–${th.process.maxMinutes} min). The operating rules allow no overnight activity other than soaking.` });
      } else if (component) {
        findings.push({ kind: 'no-resource', stepId: id, detail: `${line.task}: no sow process is on file for ${component}, so no grow unit is named.` });
      } else {
        resourceKey = line.station ? growUnitForProcess(line.station, growUnits)?.key ?? null : null;
        if (!resourceKey) findings.push({ kind: 'no-resource', stepId: id, detail: `${line.task}: the station ${line.station ? `"${line.station}"` : 'on the line'} names no grow unit on the Phase 1 equipment list.` });
      }
    } else if (kind === 'blackout') {
      resourceKey = growUnits.find((v) => isBlackoutRack(v.item))?.key ?? null;
      if (!resourceKey) findings.push({ kind: 'no-resource', stepId: id, detail: `${line.task}: no blackout rack is on the Phase 1 equipment list.` });
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
      runMinutesPerUnit: fixed || sowing <= 0 ? 0 : line.elapsedMinutes / sowing,
      laborMinutesFixed: fixed ? line.laborMinutes : 0,
      laborMinutesPerUnit: fixed || sowing <= 0 ? 0 : line.laborMinutes / sowing,
      attended: line.elapsedMinutes > 0 && line.laborMinutes + 1e-9 >= line.staff * line.elapsedMinutes,
      controlPoint,
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
    if (o.runMinutesPerUnit !== undefined) step.runMinutesPerUnit = o.runMinutesPerUnit;
    if (o.laborMinutesFixed !== undefined) step.laborMinutesFixed = o.laborMinutesFixed;
    if (o.laborMinutesPerUnit !== undefined) step.laborMinutesPerUnit = o.laborMinutesPerUnit;
    if (o.after !== undefined) step.after = [...o.after];
    if (o.resourceKey !== undefined) step.resourceKey = o.resourceKey;
    step.edited = true;
    for (const a of step.after) {
      if (!ids.has(a)) findings.push({ kind: 'unknown-predecessor', stepId: step.id, detail: `${step.task}: the scenario names "${a}" as a predecessor, and ${cropPlan.code}'s route has no step with that id.` });
    }
    if (step.resourceKey !== null && !keys.has(step.resourceKey)) findings.push({ kind: 'unknown-resource', stepId: step.id, detail: `${step.task}: the scenario names "${step.resourceKey}", which is not in the equipment library.` });
  }
  for (const id of Object.keys(input.overlay ?? {})) {
    if (!ids.has(id)) findings.push({ kind: 'unknown-predecessor', stepId: id, detail: `The scenario edits step "${id}", and ${cropPlan.code}'s route has no step with that id.` });
  }

  const order = routeOrder(steps);
  if (!order) findings.push({ kind: 'cycle', stepId: null, detail: `${cropPlan.code}'s precedence edges form a cycle, so no step order satisfies them.` });

  return { cropPlanCode: cropPlan.code, studyId: standard.id, basis: standard.basis, sowingSize: sowing, steps, order, findings };
}

// ── The units as scheduling resources ─────────────────────────────────────────

/** A scenario's edit to one unit's resource attributes, keyed by equipment key in the `resources` section. */
export interface ResourceOverlay {
  concurrentSowings?: number | null;
  changeoverMinutes?: number | null;
  attendedRun?: boolean | null;
  mayRunUnattended?: boolean | null;
}

export interface RouteResource {
  key: string;
  item: string;
  units: number;
  concurrentSowings: Tagged<number | null>;
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
  const has = (e: EquipmentLine) => [e.concurrentSowings, e.changeoverMinutes, e.attendedRun, e.mayRunUnattended].some((v) => v !== undefined && v !== null);
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
        concurrentSowings: attr(o.concurrentSowings, e.concurrentSowings, 'sowings'),
        changeoverMinutes: attr(o.changeoverMinutes, e.changeoverMinutes, 'min'),
        attendedRun: attr(o.attendedRun, e.attendedRun),
        mayRunUnattended: attr(o.mayRunUnattended, e.mayRunUnattended),
      };
    });
}
