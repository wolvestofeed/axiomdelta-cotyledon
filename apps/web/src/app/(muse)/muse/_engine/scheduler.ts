/**
 * Impact OS — the scheduler: one operating day placed on the clock
 * (scheduler build plan §4.1, as amended by §0 decisions 3, 7, 14–23). Pure.
 *
 * A day is the operating day on its date (decision 19): that date's dispatch,
 * that date's batches and closedown. Everything placed comes off a scenario
 * input — the routes (each recipe's time study and thermal map, `routing.ts`),
 * the Phase 1 units as resources, the crews, the Capacity inputs and the
 * schedule policy. Nothing here is a constant.
 *
 * List scheduling (serial schedule generation): orders are taken in the
 * policy's priority order and each step is placed at the earliest (or, placed
 * backward, the latest) minute where its resource has a free slot for its whole
 * duration plus changeover — and, in constrained crew mode, where the crew has
 * the people free for its labor. Deterministic for a given input.
 *
 *   BATCH stream, per whole batch. Steps before the cooks are placed forward
 *   from opening. The cooks are placed to FINISH TOGETHER at the cabinet load
 *   (`thermal.ts`): the load is the earliest minute every cook can have finished
 *   and the chiller is free, and each cook ends at it, or as late before it as
 *   its vessel allows. The route's chill step is the cabinet on the clock
 *   (decisions 15, 23): load, the unattended chill stage and unload, their
 *   minutes and people from Capacity; the labor is the study's chill line
 *   (decision 16), placed at the load and the unload in proportion to their
 *   staff-minutes. Steps after it are placed forward.
 *
 *   DISPATCH stream, per recipe shipped that day, from staged components (no
 *   edge to the batch stream). Placed backward from the delivery time by
 *   default (decision 7) or forward from opening. A fixed dispatch line — the
 *   vehicle load — is placed once for the day. An order that cannot be placed
 *   backward inside the day is placed forward and reported against the
 *   delivery time.
 *
 *   CLOSEDOWN is placed once at the close (decisions 5, 22).
 *
 * A step's labor is placed as its study's people from the step's start for
 * labor minutes ÷ people: the whole run for an attended step, the tending
 * allowance for a tended one. Labor hours are the time studies' (decision 16)
 * and reconcile to `staffDemand` for the same day; closedown is reported apart.
 *
 * Report, never repair (§7 rule 2). The cooling clock (decision 17) runs from
 * the last cook's end to the start of the chill stage, plus the chill stage,
 * against 2 hours and 6 hours. In requirement crew mode (the default) crews never
 * limit placement and every gap is a violation; in constrained mode a batch or
 * dispatch order that does not fit inside the day is unplaced, whole.
 */

import type { EquipmentLine } from '../_data/capex';
import { clock, type CrewShift } from '../_data/crews';
import type { RecipeDef } from '../_data/plan-data';
import type { SchedulePolicy } from '../_data/schedule-policy';
import type { TimeStudyDoc, TimeStudyStream } from '../_data/time-studies';
import { FOOD_CODE_COOLING_STAGE_ONE_MIN, FOOD_CODE_COOLING_TOTAL_MIN, type CapacityInputs } from './index';
import { deriveRoute, routeOverlayFor, stepDuration, stepLaborMinutes, type RecipeRoute, type RouteFinding, type RouteResource, type RouteStep, type RouteStepOverlay } from './routing';
import { laborStandard, studiesForRecipe } from './time-studies';

const EPS = 1e-9;

// ── Input and output ─────────────────────────────────────────────────────────

/** One whole batch of a recipe. */
export interface ScheduleBatch {
  id: string;
  recipeCode: string;
  portions: number;
  route: RecipeRoute;
}

/** One recipe's shipment on the day, in base portions. */
export interface ScheduleDispatch {
  id: string;
  recipeCode: string;
  portions: number;
  route: RecipeRoute;
}

export interface ScheduleInput {
  date: string;
  batches: readonly ScheduleBatch[];
  dispatches: readonly ScheduleDispatch[];
  resources: readonly RouteResource[];
  crews: readonly CrewShift[];
  capacityInputs: Pick<CapacityInputs, 'operatingOpenMin' | 'operatingCloseMin' | 'loadMinutes' | 'chillMinutes' | 'unloadMinutes' | 'loadStaff' | 'unloadStaff'>;
  policy: SchedulePolicy;
}

export type BlockKind = 'step' | 'cabinet-load' | 'chill-stage' | 'cabinet-unload' | 'closedown';

export interface ScheduledBlock {
  id: string;
  /** The batch or dispatch order; null on a day-level block (the shared vehicle load, closedown). */
  orderId: string | null;
  recipeCode: string | null;
  stream: TimeStudyStream | 'day';
  stepId: string | null;
  kind: BlockKind;
  task: string;
  resourceKey: string | null;
  startMin: number;
  endMin: number;
  /** People on the block at once: the study line's, or Capacity's at the cabinet. */
  staff: number;
  /** Labor minutes, placed as `staff` people from `startMin`. */
  laborMinutes: number;
  attended: boolean;
  ccp: string | null;
}

type V<K extends string, T> = { kind: K; detail: string } & T;

export type ScheduleViolation =
  | V<'resource-over-capacity', { resourceKey: string; jobs: number; jobsInsideDay: number }>
  | V<'outside-operating-day', { blockId: string; startMin: number; endMin: number }>
  | V<'crew-shortfall', { startMin: number; endMin: number; required: number; scheduled: number }>
  | V<'unstaffed-attended-step', { blockId: string; atMin: number }>
  | V<'ccp-cooling-stage', { orderId: string; stage: 1 | 2; minutes: number; limit: number }>
  | V<'unattended-chill', { orderId: string; completesAtMin: number; allowed: boolean }>
  | V<'due-date-missed', { orderId: string; dueMin: number; byMin: number }>
  | V<'prior-day-step', { orderId: string; stepId: string }>
  | V<'route', { orderId: string; finding: RouteFinding }>
  | V<'unplaced', { orderId: string; stream: TimeStudyStream }>;

export type ScheduleViolationKind = ScheduleViolation['kind'];

export interface ScheduleMetrics {
  batchesPlaced: number;
  batchesUnplaced: number;
  portionsPlaced: number;
  dispatchesPlaced: number;
  dispatchesUnplaced: number;
  portionsShipped: number;
  firstStartMin: number | null;
  lastEndMin: number | null;
  /** Last end minus first start, closedown excluded. */
  makespanMin: number;
  /** Busy minutes inside the operating day ÷ (operating day × slots), by resource key. */
  utilizationByResource: Record<string, number>;
  /** The resource nearest its ceiling; null when nothing ran on a resource. */
  bindingResourceKey: string | null;
  /** Time-study labor on every placed step (decision 16). */
  laborHours: number;
  batchLaborHours: number;
  dispatchLaborHours: number;
  closedownHours: number;
  /** Σ headcount × crew hours. */
  crewHours: number;
  /** Crew people-hours with no placed labor to do. */
  idleCrewHours: number;
}

export interface ScheduleResult {
  date: string;
  crewMode: SchedulePolicy['crewMode']['value'];
  openMin: number;
  closeMin: number;
  blocks: ScheduledBlock[];
  violations: ScheduleViolation[];
  metrics: ScheduleMetrics;
}

// ── The scheduler ────────────────────────────────────────────────────────────

interface LaborNeed {
  offset: number;
  staff: number;
  minutes: number;
}

interface Req {
  duration: number;
  resourceKey: string | null;
  labor: LaborNeed[];
}

interface Busy {
  start: number;
  end: number;
}

interface LaborLoad extends Busy {
  staff: number;
}

const stepReq = (s: RouteStep, portions: number): Req => ({
  duration: stepDuration(s, portions),
  resourceKey: s.resourceKey,
  labor: [{ offset: 0, staff: s.staff, minutes: stepLaborMinutes(s, portions) }],
});

const sharedKey = (s: Pick<RouteStep, 'task' | 'station'>) => `${s.task}|${s.station ?? ''}`;
const isSharedDispatch = (s: RouteStep) => s.stream === 'dispatch' && s.scalesWith === 'fixed' && !s.priorDay;
const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
const mins = (n: number) => `${Math.round(n * 10) / 10} min`;

export function schedule(input: ScheduleInput): ScheduleResult {
  const cap = input.capacityInputs;
  const policy = input.policy;
  const open = cap.operatingOpenMin.value;
  const close = cap.operatingCloseMin.value;
  const constrained = policy.crewMode.value === 'constrained';
  const crews = input.crews.filter((c) => c.headcount.value > 0 && c.endMin.value > c.startMin.value);
  const resourceOf = new Map(input.resources.map((r) => [r.key, r]));
  const slotsOf = (key: string) => {
    const r = resourceOf.get(key);
    return r ? Math.max(1, r.units * (r.concurrentBatches.value ?? 1)) : 1;
  };
  const changeoverOf = (key: string) => resourceOf.get(key)?.changeoverMinutes.value ?? 0;

  let busy = new Map<string, Busy[]>();
  let labor: LaborLoad[] = [];
  const blocks: ScheduledBlock[] = [];
  const violations: ScheduleViolation[] = [];
  const snapshot = () => ({ busy: new Map([...busy].map(([k, v]) => [k, [...v]])), labor: [...labor], blocks: blocks.length });
  // Copies again on every restore: a snapshot can be restored more than once.
  const restore = (s: ReturnType<typeof snapshot>) => {
    busy = new Map([...s.busy].map(([k, v]) => [k, [...v]]));
    labor = [...s.labor];
    blocks.length = s.blocks;
  };

  const scheduledAt = (t: number) => crews.reduce((n, c) => (c.startMin.value <= t + EPS && t < c.endMin.value - EPS ? n + c.headcount.value : n), 0);
  const laborAt = (t: number, list: readonly LaborLoad[] = labor) => list.reduce((n, l) => (l.start <= t + EPS && t < l.end - EPS ? n + l.staff : n), 0);
  const spare = (a: number, b: number) => {
    const pts = new Set([a]);
    for (const l of labor) for (const p of [l.start, l.end]) if (p > a + EPS && p < b - EPS) pts.add(p);
    for (const c of crews) for (const p of [c.startMin.value, c.endMin.value]) if (p > a + EPS && p < b - EPS) pts.add(p);
    let least = Infinity;
    for (const p of pts) least = Math.min(least, scheduledAt(p) - laborAt(p));
    return least;
  };
  const concurrent = (list: readonly Busy[], a: number, b: number) => {
    if (b <= a + EPS) return 0;
    const pts = [a, ...list.map((i) => i.start).filter((s) => s > a + EPS && s < b - EPS)];
    return pts.reduce((m, p) => Math.max(m, list.filter((i) => i.start <= p + EPS && p < i.end - EPS).length), 0);
  };

  const fits = (req: Req, start: number): boolean => {
    if (start < open - EPS) return false;
    const end = start + req.duration;
    if (constrained && end > close + EPS) return false;
    if (req.resourceKey && req.duration > EPS) {
      if (concurrent(busy.get(req.resourceKey) ?? [], start, end + changeoverOf(req.resourceKey)) >= slotsOf(req.resourceKey)) return false;
    }
    if (constrained) {
      for (const l of req.labor) {
        if (l.staff <= 0 || l.minutes <= EPS) continue;
        const a = start + l.offset;
        const b = a + l.minutes / l.staff;
        if (b > close + EPS || spare(a, b) < l.staff) return false;
      }
    }
    return true;
  };

  const breakpoints = () => {
    const b = [open, close];
    for (const list of busy.values()) for (const i of list) b.push(i.start, i.end);
    for (const l of labor) b.push(l.start, l.end);
    for (const c of crews) b.push(c.startMin.value, c.endMin.value);
    return b;
  };
  /** The earliest start at or after `t0` where the step fits; null when none does (constrained). */
  const earliest = (req: Req, t0: number): number | null => {
    const from = Math.max(t0, open);
    const offsets = [0, ...req.labor.map((l) => l.offset)];
    const cands = new Set([from]);
    for (const b of breakpoints()) for (const o of offsets) if (b - o > from + EPS) cands.add(b - o);
    for (const c of [...cands].sort((x, y) => x - y)) if (fits(req, c)) return c;
    return null;
  };
  /** The latest start that ends by `tEnd`, not before `t0`; null when none fits. */
  const latest = (req: Req, tEnd: number, t0: number): number | null => {
    const from = Math.max(t0, open);
    const top = tEnd - req.duration;
    if (top < from - EPS) return null;
    const reserve = req.duration + (req.resourceKey ? changeoverOf(req.resourceKey) : 0);
    const cands = new Set([top]);
    for (const b of breakpoints()) {
      cands.add(b - reserve);
      cands.add(b - req.duration);
      for (const l of req.labor) {
        if (l.staff <= 0) continue;
        cands.add(b - l.offset);
        cands.add(b - l.offset - l.minutes / l.staff);
      }
    }
    for (const c of [...cands].filter((x) => x >= from - EPS && x <= top + EPS).sort((x, y) => y - x)) if (fits(req, c)) return c;
    return null;
  };
  const reserve = (req: Req, start: number) => {
    if (req.resourceKey && req.duration > EPS) {
      const list = busy.get(req.resourceKey) ?? [];
      list.push({ start, end: start + req.duration + changeoverOf(req.resourceKey) });
      busy.set(req.resourceKey, list);
    }
    for (const l of req.labor) {
      if (l.staff > 0 && l.minutes > EPS) labor.push({ start: start + l.offset, end: start + l.offset + l.minutes / l.staff, staff: l.staff });
    }
  };
  let seq = 0;
  const addBlock = (b: Omit<ScheduledBlock, 'id'>): ScheduledBlock => {
    const block = { id: `blk-${++seq}`, ...b };
    blocks.push(block);
    return block;
  };
  const placeStep = (s: RouteStep, orderId: string | null, recipeCode: string | null, portions: number, start: number): number => {
    const req = stepReq(s, portions);
    reserve(req, start);
    addBlock({ orderId, recipeCode, stream: s.stream, stepId: s.id, kind: 'step', task: s.task, resourceKey: s.resourceKey, startMin: start, endMin: start + req.duration, staff: s.staff, laborMinutes: stepLaborMinutes(s, portions), attended: s.attended, ccp: s.ccp });
    return start + req.duration;
  };

  // Route findings once per recipe; overnight processes are reported as prior-day steps.
  const reported = new Set<string>();
  const reportRoute = (orderId: string, route: RecipeRoute) => {
    if (reported.has(route.recipeCode)) return;
    reported.add(route.recipeCode);
    for (const f of route.findings) {
      if (f.kind === 'overnight-process') continue;
      violations.push({ kind: 'route', orderId, finding: f, detail: f.detail });
    }
  };

  // Priority order (§4.1): a policy input, not a constant.
  const processing = (route: RecipeRoute, stream: TimeStudyStream, portions: number) =>
    route.steps.filter((s) => s.stream === stream && !s.priorDay).reduce((t, s) => t + stepDuration(s, portions), 0);
  const longestPath = (route: RecipeRoute, stream: TimeStudyStream, portions: number) => {
    if (!route.order) return processing(route, stream, portions);
    const finish = new Map<string, number>();
    for (const id of route.order) {
      const s = route.steps.find((x) => x.id === id)!;
      if (s.stream !== stream || s.priorDay) continue;
      finish.set(id, Math.max(0, ...s.after.map((a) => finish.get(a) ?? 0)) + stepDuration(s, portions));
    }
    return Math.max(0, ...finish.values());
  };
  const ranked = <T extends { portions: number; route: RecipeRoute }>(items: readonly T[], stream: TimeStudyStream): T[] => {
    const keyed = items.map((x, i) => ({ x, i, p: processing(x.route, stream, x.portions), l: longestPath(x.route, stream, x.portions) }));
    const rule = policy.priorityRule.value;
    if (rule === 'shortest-processing') keyed.sort((a, b) => a.p - b.p || a.i - b.i);
    else if (rule === 'longest-path') keyed.sort((a, b) => b.l - a.l || a.i - b.i);
    return keyed.map((k) => k.x);
  };

  const unplace = (orderId: string, stream: TimeStudyStream, detail: string) => violations.push({ kind: 'unplaced', orderId, stream, detail });

  // ── Dispatch: first thing on the delivery day, against the delivery time ───
  const due = policy.deliveryTimeMin.value;
  const orders = ranked(input.dispatches.filter((d) => d.portions > 0), 'dispatch');
  const shared = new Map<string, RouteStep>();
  for (const d of orders) {
    for (const s of d.route.steps) {
      if (!isSharedDispatch(s)) continue;
      const cur = shared.get(sharedKey(s));
      if (!cur || stepLaborMinutes(s, 0) > stepLaborMinutes(cur, 0)) shared.set(sharedKey(s), s);
    }
  }
  const sharedStart = new Map<string, number>();
  const sharedEnd = new Map<string, number>();
  const placeShared = (key: string, s: RouteStep, t: number) => {
    const end = placeStep(s, null, null, 0, t);
    const b = blocks[blocks.length - 1]!;
    b.stream = 'dispatch';
    sharedStart.set(key, t);
    sharedEnd.set(key, end);
  };
  const backward = policy.dispatchDirection.value === 'backward';

  if (backward) {
    for (const [key, s] of [...shared].sort((a, b) => b[1].seq - a[1].seq)) {
      const succ = [...shared.values()].filter((x) => x.after.includes(s.id)).map((x) => sharedStart.get(sharedKey(x))).filter((x): x is number => x !== undefined);
      const req = stepReq(s, 0);
      const t = latest(req, Math.min(due, ...succ), open) ?? earliest(req, open);
      if (t === null) unplace('dispatch', 'dispatch', `${s.task} does not fit inside the operating day with the crews proposed.`);
      else placeShared(key, s, t);
    }
  }

  const completion = new Map<string, number>();
  for (const d of orders) {
    reportRoute(d.id, d.route);
    const own = d.route.steps.filter((s) => s.stream === 'dispatch' && !s.priorDay && !isSharedDispatch(s));
    const order = d.route.order?.map((id) => own.find((s) => s.id === id)).filter((s): s is RouteStep => Boolean(s)) ?? null;
    if (!order) {
      unplace(d.id, 'dispatch', `${d.recipeCode}'s route has a precedence cycle; its dispatch is not placed.`);
      continue;
    }
    const snap = snapshot();
    const ends = new Map<string, number>();
    let placed = backward;
    if (backward) {
      const starts = new Map<string, number>();
      for (const s of [...order].reverse()) {
        const succ = d.route.steps.filter((x) => x.stream === 'dispatch' && x.after.includes(s.id));
        const bounds = succ.map((x) => (isSharedDispatch(x) ? sharedStart.get(sharedKey(x)) : starts.get(x.id))).filter((x): x is number => x !== undefined);
        const t = latest(stepReq(s, d.portions), Math.min(due, ...bounds), open);
        if (t === null) {
          placed = false;
          break;
        }
        ends.set(s.id, placeStep(s, d.id, d.recipeCode, d.portions, t));
        starts.set(s.id, t);
      }
      if (!placed) {
        restore(snap);
        ends.clear();
      }
    }
    if (!placed) {
      let ok = true;
      for (const s of order) {
        const predEnd = Math.max(open, ...s.after.map((a) => ends.get(a) ?? open));
        const t = earliest(stepReq(s, d.portions), predEnd);
        if (t === null) {
          ok = false;
          break;
        }
        ends.set(s.id, placeStep(s, d.id, d.recipeCode, d.portions, t));
      }
      if (!ok) {
        restore(snap);
        unplace(d.id, 'dispatch', `${d.recipeCode}: ${d.portions} portions to ship do not fit inside the operating day with the crews proposed.`);
        continue;
      }
    }
    completion.set(d.id, Math.max(open, ...ends.values()));
  }

  if (!backward) {
    for (const [key, s] of [...shared].sort((a, b) => a[1].seq - b[1].seq)) {
      const predEnds = orders.flatMap((d) => s.after.map((a) => blocks.find((b) => b.orderId === d.id && b.stepId === a)?.endMin)).filter((x): x is number => x !== undefined);
      const t = earliest(stepReq(s, 0), Math.max(open, ...predEnds));
      if (t === null) unplace('dispatch', 'dispatch', `${s.task} does not fit inside the operating day with the crews proposed.`);
      else placeShared(key, s, t);
    }
  }
  const dispatchesPlaced = [...completion.keys()];
  for (const d of orders) {
    const own = completion.get(d.id);
    if (own === undefined) continue;
    const sharedDone = d.route.steps.filter(isSharedDispatch).map((s) => sharedEnd.get(sharedKey(s))).filter((x): x is number => x !== undefined);
    const done = Math.max(own, ...sharedDone);
    if (done > due + EPS) {
      violations.push({ kind: 'due-date-missed', orderId: d.id, dueMin: due, byMin: done - due, detail: `${d.recipeCode}: dispatch completes at ${clock(done)}; the delivery time is ${clock(due)}, ${mins(done - due)} late.` });
    }
  }

  // ── Batches: the cook stream ────────────────────────────────────────────────
  const loadMin = cap.loadMinutes.value;
  const chillMin = cap.chillMinutes.value;
  const unloadMin = cap.unloadMinutes.value;
  const loadStaff = cap.loadStaff.value;
  const unloadStaff = cap.unloadStaff.value;
  const cabinetMinutes = loadMin + chillMin + unloadMin;
  const placedBatches: ScheduleBatch[] = [];
  const priorReported = new Set<string>();

  for (const batch of ranked(input.batches.filter((b) => b.portions > 0), 'batch')) {
    const { route, portions } = batch;
    reportRoute(batch.id, route);
    const steps = route.steps.filter((s) => s.stream === 'batch');
    if (steps.length === 0 || !route.order) {
      unplace(batch.id, 'batch', route.order ? `${batch.recipeCode} has no batch-stream steps on file.` : `${batch.recipeCode}'s route has a precedence cycle; the batch is not placed.`);
      continue;
    }
    const byId = new Map(steps.map((s) => [s.id, s]));
    const ends = new Map<string, number>();
    for (const s of steps.filter((x) => x.priorDay)) {
      ends.set(s.id, open);
      if (!priorReported.has(`${route.recipeCode}|${s.id}`)) {
        priorReported.add(`${route.recipeCode}|${s.id}`);
        violations.push({ kind: 'prior-day-step', orderId: batch.id, stepId: s.id, detail: `${s.task} runs the day before; no activity other than soaking runs overnight. It is not placed on this day.` });
      }
    }
    const chills = steps.filter((s) => s.kind === 'chill');
    const withChill = new Set(chills.flatMap((c) => c.after.filter((a) => byId.get(a)?.kind === 'cook' && !byId.get(a)?.priorDay)));
    const batchSnap = snapshot();
    let ok = true;

    const placeChill = (c: RouteStep): boolean => {
      const cooks = c.after.map((a) => byId.get(a)).filter((s): s is RouteStep => Boolean(s) && s!.kind === 'cook' && !s!.priorDay);
      const predEnd = (s: RouteStep) => Math.max(open, ...s.after.map((a) => ends.get(a) ?? open));
      const otherPreds = c.after.filter((a) => !cooks.some((k) => k.id === a)).map((a) => ends.get(a) ?? open);
      const studyLabor = stepLaborMinutes(c, portions);
      const loadShare = loadStaff * loadMin + unloadStaff * unloadMin;
      const loadLabor = loadShare > 0 ? (studyLabor * loadStaff * loadMin) / loadShare : studyLabor;
      const unloadLabor = studyLabor - loadLabor;
      const cabinet: Req = {
        duration: cabinetMinutes,
        resourceKey: c.resourceKey,
        labor: [
          { offset: 0, staff: loadStaff, minutes: loadLabor },
          { offset: loadMin + chillMin, staff: unloadStaff, minutes: unloadLabor },
        ],
      };
      let l0 = Math.max(open, ...otherPreds);
      for (const k of cooks) {
        const t = earliest(stepReq(k, portions), predEnd(k));
        if (t === null) return false;
        l0 = Math.max(l0, t + stepDuration(k, portions));
      }
      for (let attempt = 0; attempt < 200; attempt++) {
        const snap = snapshot();
        const L = earliest(cabinet, l0);
        if (L === null) return false;
        let moved = false;
        const cookEnds: number[] = [];
        for (const k of [...cooks].sort((a, b) => stepDuration(b, portions) - stepDuration(a, portions) || a.seq - b.seq)) {
          const req = stepReq(k, portions);
          const t = latest(req, L, predEnd(k));
          if (t === null) {
            const e = earliest(req, predEnd(k));
            if (e === null) {
              restore(snap);
              return false;
            }
            restore(snap);
            l0 = Math.max(l0, e + req.duration, L + EPS);
            moved = true;
            break;
          }
          const end = placeStep(k, batch.id, batch.recipeCode, portions, t);
          ends.set(k.id, end);
          cookEnds.push(end);
        }
        if (moved) continue;
        reserve(cabinet, L);
        const chillStart = L + loadMin;
        const chillEnd = chillStart + chillMin;
        const unloadEnd = chillEnd + unloadMin;
        const base = { orderId: batch.id, recipeCode: batch.recipeCode, stream: 'batch' as const, stepId: c.id, resourceKey: c.resourceKey };
        addBlock({ ...base, kind: 'cabinet-load', task: 'Cabinet load', startMin: L, endMin: chillStart, staff: loadStaff, laborMinutes: loadLabor, attended: true, ccp: 'CCP-2' });
        addBlock({ ...base, kind: 'chill-stage', task: 'Chill stage', startMin: chillStart, endMin: chillEnd, staff: 0, laborMinutes: 0, attended: false, ccp: 'CCP-2' });
        addBlock({ ...base, kind: 'cabinet-unload', task: 'Cabinet unload to storage', startMin: chillEnd, endMin: unloadEnd, staff: unloadStaff, laborMinutes: unloadLabor, attended: true, ccp: 'CCP-2' });
        ends.set(c.id, unloadEnd);

        // The cooling clock (decision 17): last cook's end to the chill stage start, plus the chill stage.
        if (cookEnds.length) {
          const minutes = chillStart - Math.max(...cookEnds) + chillMin;
          for (const [stage, limit] of [[1, FOOD_CODE_COOLING_STAGE_ONE_MIN], [2, FOOD_CODE_COOLING_TOTAL_MIN]] as const) {
            if (minutes > limit + EPS) {
              violations.push({ kind: 'ccp-cooling-stage', orderId: batch.id, stage, minutes, limit, detail: `${batch.recipeCode}, ${batch.id}: ${mins(minutes)} from the last cook's end at ${clock(Math.max(...cookEnds))} to the end of the chill stage at ${clock(chillEnd)}; the ${stage === 1 ? '2-hour' : '6-hour'} limit is ${limit} min (FDA Food Code 3-501.14, CCP-2).` });
            }
          }
        }
        const staffed = crews.length > 0 && scheduledAt(chillEnd) > 0;
        if (chillEnd > close + EPS || (crews.length > 0 && !staffed)) {
          violations.push({ kind: 'unattended-chill', orderId: batch.id, completesAtMin: chillEnd, allowed: policy.allowUnattendedChill.value, detail: `${batch.recipeCode}, ${batch.id}: the chill stage completes at ${clock(chillEnd)} with ${chillEnd > close + EPS ? 'the operating day closed' : 'no crew scheduled'}. CCP-2 covers that only on the continuous datalogger with alarm to a named on-call responder${policy.allowUnattendedChill.value ? '' : '; the schedule policy does not allow an unattended chill'}.` });
        }
        return true;
      }
      return false;
    };

    const deferred: RouteStep[] = [];
    for (const id of route.order) {
      const s = byId.get(id);
      if (!s || s.priorDay || withChill.has(s.id)) continue;
      if (s.kind === 'chill') {
        if (!placeChill(s)) {
          ok = false;
          break;
        }
        continue;
      }
      if (s.after.some((a) => byId.has(a) && !ends.has(a))) {
        deferred.push(s);
        continue;
      }
      const t = earliest(stepReq(s, portions), Math.max(open, ...s.after.map((a) => ends.get(a) ?? open)));
      if (t === null) {
        ok = false;
        break;
      }
      ends.set(s.id, placeStep(s, batch.id, batch.recipeCode, portions, t));
    }
    for (const s of ok ? deferred : []) {
      const t = earliest(stepReq(s, portions), Math.max(open, ...s.after.map((a) => ends.get(a) ?? open)));
      if (t === null) {
        ok = false;
        break;
      }
      ends.set(s.id, placeStep(s, batch.id, batch.recipeCode, portions, t));
    }
    if (!ok) {
      restore(batchSnap);
      violations.splice(0, violations.length, ...violations.filter((v) => !(('orderId' in v) && v.orderId === batch.id && (v.kind === 'ccp-cooling-stage' || v.kind === 'unattended-chill'))));
      unplace(batch.id, 'batch', `${batch.recipeCode}: a batch of ${portions} portions does not fit inside the operating day with the crews proposed.`);
      continue;
    }
    placedBatches.push(batch);
  }

  // ── Closedown, once at the close ────────────────────────────────────────────
  const closedownMinutes = policy.closedownMinutes.value;
  const closedownStaff = policy.closedownStaff.value;
  if (closedownMinutes > 0) {
    const start = close - closedownMinutes;
    const minutes = closedownStaff * closedownMinutes;
    if (closedownStaff > 0) labor.push({ start, end: close, staff: closedownStaff });
    addBlock({ orderId: null, recipeCode: null, stream: 'day', stepId: null, kind: 'closedown', task: 'End-of-day closedown', resourceKey: null, startMin: start, endMin: close, staff: closedownStaff, laborMinutes: minutes, attended: true, ccp: null });
  }

  // ── Violations on the placed day ────────────────────────────────────────────
  for (const b of blocks) {
    if (b.kind === 'closedown') continue;
    if (b.startMin < open - EPS || b.endMin > close + EPS) {
      violations.push({ kind: 'outside-operating-day', blockId: b.id, startMin: b.startMin, endMin: b.endMin, detail: `${b.task}${b.orderId ? ` (${b.orderId})` : ''} runs ${clock(b.startMin)}–${clock(b.endMin)}; the operating day is ${clock(open)}–${clock(close)}.` });
    }
  }
  const jobsOn = new Map<string, ScheduledBlock[]>();
  for (const b of blocks) {
    if (!b.resourceKey || b.kind === 'chill-stage' || b.kind === 'cabinet-unload') continue;
    jobsOn.set(b.resourceKey, [...(jobsOn.get(b.resourceKey) ?? []), b]);
  }
  for (const [key, jobs] of jobsOn) {
    const endOf = (j: ScheduledBlock) => (j.kind === 'cabinet-load' ? j.startMin + cabinetMinutes : j.endMin);
    const inside = jobs.filter((j) => endOf(j) <= close + EPS).length;
    if (inside < jobs.length) {
      violations.push({ kind: 'resource-over-capacity', resourceKey: key, jobs: jobs.length, jobsInsideDay: inside, detail: `${resourceOf.get(key)?.item ?? key}: ${jobs.length} jobs on the day; ${inside} finish inside the operating day at ${slotsOf(key)} ${slotsOf(key) === 1 ? 'slot' : 'slots'}.` });
    }
  }
  if (crews.length > 0) {
    const pts = [...new Set([...labor.flatMap((l) => [l.start, l.end]), ...crews.flatMap((c) => [c.startMin.value, c.endMin.value])])].sort((a, b) => a - b);
    let run: { startMin: number; endMin: number; required: number; scheduled: number } | null = null;
    const flush = () => {
      if (run) violations.push({ kind: 'crew-shortfall', ...run, detail: `${clock(run.startMin)}–${clock(run.endMin)}: placed work needs up to ${people(run.required)} at once; as few as ${run.scheduled} scheduled.` });
      run = null;
    };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (b - a <= EPS) continue;
      const required = laborAt(a);
      const scheduled = scheduledAt(a);
      if (required > scheduled) {
        if (run && Math.abs(run.endMin - a) <= EPS) {
          run.endMin = b;
          run.required = Math.max(run.required, required);
          run.scheduled = Math.min(run.scheduled, scheduled);
        } else {
          flush();
          run = { startMin: a, endMin: b, required, scheduled };
        }
      } else flush();
    }
    flush();
    for (const b of blocks) {
      if (!b.attended || b.staff <= 0 || b.laborMinutes <= EPS) continue;
      const end = b.startMin + b.laborMinutes / b.staff;
      const pts2 = [b.startMin, ...crews.flatMap((c) => [c.startMin.value, c.endMin.value]).filter((p) => p > b.startMin + EPS && p < end - EPS)];
      const empty = pts2.find((p) => scheduledAt(p) === 0);
      if (empty !== undefined) violations.push({ kind: 'unstaffed-attended-step', blockId: b.id, atMin: empty, detail: `${b.task}${b.orderId ? ` (${b.orderId})` : ''} needs ${people(b.staff)} at ${clock(empty)}; no crew is scheduled then.` });
    }
  }

  // ── Metrics ─────────────────────────────────────────────────────────────────
  const work = blocks.filter((b) => b.kind !== 'closedown');
  const firstStartMin = work.length ? Math.min(...work.map((b) => b.startMin)) : null;
  const lastEndMin = work.length ? Math.max(...work.map((b) => b.endMin)) : null;
  const dayMinutes = Math.max(0, close - open);
  const utilizationByResource: Record<string, number> = {};
  for (const key of new Set([...input.resources.map((r) => r.key), ...busy.keys()])) {
    const used = (busy.get(key) ?? []).reduce((t, i) => t + Math.max(0, Math.min(i.end, close) - Math.max(i.start, open)), 0);
    utilizationByResource[key] = dayMinutes > 0 ? used / (dayMinutes * slotsOf(key)) : 0;
  }
  const bindingResourceKey = Object.entries(utilizationByResource).reduce<[string, number] | null>((m, e) => (e[1] > EPS && (!m || e[1] > m[1]) ? e : m), null)?.[0] ?? null;
  const hoursOf = (list: readonly ScheduledBlock[]) => list.reduce((t, b) => t + b.laborMinutes, 0) / 60;
  const crewHours = crews.reduce((t, c) => t + (c.headcount.value * (c.endMin.value - c.startMin.value)) / 60, 0);
  let idle = 0;
  if (crews.length) {
    const pts = [...new Set([...labor.flatMap((l) => [l.start, l.end]), ...crews.flatMap((c) => [c.startMin.value, c.endMin.value])])].sort((a, b) => a - b);
    for (let i = 0; i < pts.length - 1; i++) idle += Math.max(0, scheduledAt(pts[i]!) - laborAt(pts[i]!)) * (pts[i + 1]! - pts[i]!);
  }

  return {
    date: input.date,
    crewMode: policy.crewMode.value,
    openMin: open,
    closeMin: close,
    blocks,
    violations,
    metrics: {
      batchesPlaced: placedBatches.length,
      batchesUnplaced: input.batches.filter((b) => b.portions > 0).length - placedBatches.length,
      portionsPlaced: placedBatches.reduce((t, b) => t + b.portions, 0),
      dispatchesPlaced: dispatchesPlaced.length,
      dispatchesUnplaced: orders.length - dispatchesPlaced.length,
      portionsShipped: orders.filter((d) => completion.has(d.id)).reduce((t, d) => t + d.portions, 0),
      firstStartMin,
      lastEndMin,
      makespanMin: firstStartMin === null || lastEndMin === null ? 0 : lastEndMin - firstStartMin,
      utilizationByResource,
      bindingResourceKey,
      laborHours: hoursOf(work),
      batchLaborHours: hoursOf(work.filter((b) => b.stream === 'batch')),
      dispatchLaborHours: hoursOf(work.filter((b) => b.stream === 'dispatch')),
      closedownHours: hoursOf(blocks.filter((b) => b.kind === 'closedown')),
      crewHours,
      idleCrewHours: idle / 60,
    },
  };
}

// ── A day's inputs from the plan ─────────────────────────────────────────────

/**
 * The batches and dispatch orders for a date: that production day's whole
 * batches per recipe and that delivery day's shipments, each on its recipe's
 * route (its labor standard, thermal map, the Phase 1 list and the scenario's
 * step edits). A recipe the library does not hold is listed, not placed.
 */
export function scheduleInputsForDay(input: {
  productionRuns?: readonly { recipeCode: string; batchesScheduled: number; produced: number }[];
  shipments?: readonly { recipeCode: string; filledBase: number }[];
  recipes: readonly RecipeDef[];
  studies: readonly TimeStudyDoc[];
  equipment: readonly EquipmentLine[];
  routing: Readonly<Record<string, RouteStepOverlay>>;
}): { batches: ScheduleBatch[]; dispatches: ScheduleDispatch[]; routes: RecipeRoute[]; unknownRecipes: string[] } {
  const routes = new Map<string, RecipeRoute>();
  const unknown = new Set<string>();
  const routeFor = (code: string): RecipeRoute | null => {
    if (routes.has(code)) return routes.get(code)!;
    const recipe = input.recipes.find((r) => r.code === code);
    if (!recipe) {
      unknown.add(code);
      return null;
    }
    const route = deriveRoute({ recipe, standard: laborStandard(studiesForRecipe(input.studies, code)), equipment: input.equipment, overlay: routeOverlayFor(input.routing, code) });
    routes.set(code, route);
    return route;
  };
  const batches: ScheduleBatch[] = [];
  for (const run of input.productionRuns ?? []) {
    if (run.batchesScheduled <= 0) continue;
    const route = routeFor(run.recipeCode);
    if (!route) continue;
    for (let i = 0; i < run.batchesScheduled; i++) {
      batches.push({ id: `${run.recipeCode}#${i + 1}`, recipeCode: run.recipeCode, portions: run.produced / run.batchesScheduled, route });
    }
  }
  const dispatches: ScheduleDispatch[] = [];
  for (const s of input.shipments ?? []) {
    if (s.filledBase <= 0) continue;
    const route = routeFor(s.recipeCode);
    if (route) dispatches.push({ id: `${s.recipeCode}:dispatch`, recipeCode: s.recipeCode, portions: s.filledBase, route });
  }
  return { batches, dispatches, routes: [...routes.values()], unknownRecipes: [...unknown].sort() };
}
