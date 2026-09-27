/**
 * MicroFarm — the scheduler: one operating day placed on the clock
 * (scheduler build plan §4.1, as amended by §0 decisions 3, 7, 14–23). Pure.
 *
 * A day is the operating day on its date (decision 19): that date's harvest,
 * that date's sowings and closedown. Everything placed comes off a scenario
 * input — the routes (each crop plan's time study and stage map, `routing.ts`),
 * the Phase 1 units as resources, the crews, the Capacity inputs and the
 * schedule policy. Nothing here is a constant.
 *
 * List scheduling (serial schedule generation): orders are taken in the
 * policy's priority order and each step is placed at the earliest (or, placed
 * backward, the latest) minute where its resource has a free slot for its whole
 * duration plus changeover — and, in constrained crew mode, where the crew has
 * the people free for its labor. Deterministic for a given input.
 *
 *   SOWING stream, per whole sowing: the study's sowing lines — receiving, prep and the sow —
 *   placed forward from opening in route order, each after its predecessors. The trays then
 *   go on their grow unit for the plan's cycle, which is the grow calendar's, not the day's.
 *
 *   HARVEST stream, per crop plan shipped that day, from staged components (no
 *   edge to the sowing stream). Placed backward from the distribution time by
 *   default (decision 7) or forward from opening. A fixed harvest line — the
 *   vehicle load — is placed once for the day. An order that cannot be placed
 *   backward inside the day is placed forward and reported against the
 *   distribution time.
 *
 *   CLOSEDOWN is placed once at the close (decisions 5, 22).
 *
 * A step's labor is placed as its study's people from the step's start for
 * labor minutes ÷ people: the whole run for an attended step, the tending
 * allowance for a tended one. Labor hours are the time studies' (decision 16)
 * and reconcile to `staffDemand` for the same day; closedown is reported apart.
 *
 * Report, never repair (§7 rule 2). In requirement crew mode (the default) crews never
 * limit placement and every gap is a violation; in constrained mode a sowing or
 * harvest order that does not fit inside the day is unplaced, whole.
 */

import type { GrowPlanDef } from '@/data/grow-plan';
import type { EquipmentLine } from '@/data/capex';
import { clock, type CrewShift } from '@/data/crews';
import type { SchedulePolicy } from '@/data/schedule-policy';
import type { TimeStudyDoc, TimeStudyStream } from '@/data/time-studies';
import type { CapacityInputs } from '@/engine';
import { deriveRoute, routeOverlayFor, stepDuration, stepLaborMinutes, type CropPlanRoute, type RouteFinding, type RouteResource, type RouteStep, type RouteStepOverlay } from '@/engine/routing';
import { laborStandard, studiesForCropPlan } from '@/engine/time-studies';

const EPS = 1e-9;

// ── Input and output ─────────────────────────────────────────────────────────

/** One whole sowing of a crop plan. */
export interface ScheduleSowing {
  id: string;
  cropPlanCode: string;
  units: number;
  route: CropPlanRoute;
}

/** One crop plan's shipment on the day, in base units. */
export interface ScheduleHarvest {
  id: string;
  cropPlanCode: string;
  units: number;
  route: CropPlanRoute;
}

export interface ScheduleInput {
  date: string;
  sowings: readonly ScheduleSowing[];
  dispatches: readonly ScheduleHarvest[];
  resources: readonly RouteResource[];
  crews: readonly CrewShift[];
  capacityInputs: Pick<CapacityInputs, 'operatingOpenMin' | 'operatingCloseMin'>;
  policy: SchedulePolicy;
}

export type BlockKind = 'step' | 'closedown';

export interface ScheduledBlock {
  id: string;
  /** The sowing or harvest order; null on a day-level block (the shared vehicle load, closedown). */
  orderId: string | null;
  cropPlanCode: string | null;
  stream: TimeStudyStream | 'day';
  stepId: string | null;
  kind: BlockKind;
  task: string;
  resourceKey: string | null;
  startMin: number;
  endMin: number;
  /** People on the block at once: the study line's. */
  staff: number;
  /** Labor minutes, placed as `staff` people from `startMin`. */
  laborMinutes: number;
  attended: boolean;
  controlPoint: string | null;
}

type V<K extends string, T> = { kind: K; detail: string } & T;

export type ScheduleViolation =
  | V<'resource-over-capacity', { resourceKey: string; jobs: number; jobsInsideDay: number }>
  | V<'outside-operating-day', { blockId: string; startMin: number; endMin: number }>
  | V<'crew-shortfall', { startMin: number; endMin: number; required: number; scheduled: number }>
  | V<'unstaffed-attended-step', { blockId: string; atMin: number }>
  | V<'due-date-missed', { orderId: string; dueMin: number; byMin: number }>
  | V<'route', { orderId: string; finding: RouteFinding }>
  | V<'unplaced', { orderId: string; stream: TimeStudyStream }>;

export type ScheduleViolationKind = ScheduleViolation['kind'];

export interface ScheduleMetrics {
  sowingsPlaced: number;
  sowingsUnplaced: number;
  unitsPlaced: number;
  dispatchesPlaced: number;
  dispatchesUnplaced: number;
  unitsShipped: number;
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
  sowingLaborHours: number;
  harvestLaborHours: number;
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

const stepReq = (s: RouteStep, units: number): Req => ({
  duration: stepDuration(s, units),
  resourceKey: s.resourceKey,
  labor: [{ offset: 0, staff: s.staff, minutes: stepLaborMinutes(s, units) }],
});

const sharedKey = (s: Pick<RouteStep, 'task' | 'station'>) => `${s.task}|${s.station ?? ''}`;
const isSharedHarvest = (s: RouteStep) => s.stream === 'harvest' && s.scalesWith === 'fixed';
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
    return r ? Math.max(1, r.units * (r.concurrentSowings.value ?? 1)) : 1;
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
  const placeStep = (s: RouteStep, orderId: string | null, cropPlanCode: string | null, units: number, start: number): number => {
    const req = stepReq(s, units);
    reserve(req, start);
    addBlock({ orderId, cropPlanCode, stream: s.stream, stepId: s.id, kind: 'step', task: s.task, resourceKey: s.resourceKey, startMin: start, endMin: start + req.duration, staff: s.staff, laborMinutes: stepLaborMinutes(s, units), attended: s.attended, controlPoint: s.controlPoint });
    return start + req.duration;
  };

  // Route findings once per crop plan.
  const reported = new Set<string>();
  const reportRoute = (orderId: string, route: CropPlanRoute) => {
    if (reported.has(route.cropPlanCode)) return;
    reported.add(route.cropPlanCode);
    for (const f of route.findings) {
      violations.push({ kind: 'route', orderId, finding: f, detail: f.detail });
    }
  };

  // Priority order (§4.1): a policy input, not a constant.
  const processing = (route: CropPlanRoute, stream: TimeStudyStream, units: number) =>
    route.steps.filter((s) => s.stream === stream).reduce((t, s) => t + stepDuration(s, units), 0);
  const longestPath = (route: CropPlanRoute, stream: TimeStudyStream, units: number) => {
    if (!route.order) return processing(route, stream, units);
    const finish = new Map<string, number>();
    for (const id of route.order) {
      const s = route.steps.find((x) => x.id === id)!;
      if (s.stream !== stream) continue;
      finish.set(id, Math.max(0, ...s.after.map((a) => finish.get(a) ?? 0)) + stepDuration(s, units));
    }
    return Math.max(0, ...finish.values());
  };
  const ranked = <T extends { units: number; route: CropPlanRoute }>(items: readonly T[], stream: TimeStudyStream): T[] => {
    const keyed = items.map((x, i) => ({ x, i, p: processing(x.route, stream, x.units), l: longestPath(x.route, stream, x.units) }));
    const rule = policy.priorityRule.value;
    if (rule === 'shortest-processing') keyed.sort((a, b) => a.p - b.p || a.i - b.i);
    else if (rule === 'longest-path') keyed.sort((a, b) => b.l - a.l || a.i - b.i);
    return keyed.map((k) => k.x);
  };

  const unplace = (orderId: string, stream: TimeStudyStream, detail: string) => violations.push({ kind: 'unplaced', orderId, stream, detail });

  // ── Harvest: first thing on the distribution day, against the distribution time ───
  const due = policy.distributionTimeMin.value;
  const orders = ranked(input.dispatches.filter((d) => d.units > 0), 'harvest');
  const shared = new Map<string, RouteStep>();
  for (const d of orders) {
    for (const s of d.route.steps) {
      if (!isSharedHarvest(s)) continue;
      const cur = shared.get(sharedKey(s));
      if (!cur || stepLaborMinutes(s, 0) > stepLaborMinutes(cur, 0)) shared.set(sharedKey(s), s);
    }
  }
  const sharedStart = new Map<string, number>();
  const sharedEnd = new Map<string, number>();
  const placeShared = (key: string, s: RouteStep, t: number) => {
    const end = placeStep(s, null, null, 0, t);
    const b = blocks[blocks.length - 1]!;
    b.stream = 'harvest';
    sharedStart.set(key, t);
    sharedEnd.set(key, end);
  };
  const backward = policy.harvestDirection.value === 'backward';

  if (backward) {
    for (const [key, s] of [...shared].sort((a, b) => b[1].seq - a[1].seq)) {
      const succ = [...shared.values()].filter((x) => x.after.includes(s.id)).map((x) => sharedStart.get(sharedKey(x))).filter((x): x is number => x !== undefined);
      const req = stepReq(s, 0);
      const t = latest(req, Math.min(due, ...succ), open) ?? earliest(req, open);
      if (t === null) unplace('harvest', 'harvest', `${s.task} does not fit inside the operating day with the crews proposed.`);
      else placeShared(key, s, t);
    }
  }

  const completion = new Map<string, number>();
  for (const d of orders) {
    reportRoute(d.id, d.route);
    const own = d.route.steps.filter((s) => s.stream === 'harvest' && !isSharedHarvest(s));
    const order = d.route.order?.map((id) => own.find((s) => s.id === id)).filter((s): s is RouteStep => Boolean(s)) ?? null;
    if (!order) {
      unplace(d.id, 'harvest', `${d.cropPlanCode}'s route has a precedence cycle; its harvest is not placed.`);
      continue;
    }
    const snap = snapshot();
    const ends = new Map<string, number>();
    let placed = backward;
    if (backward) {
      const starts = new Map<string, number>();
      for (const s of [...order].reverse()) {
        const succ = d.route.steps.filter((x) => x.stream === 'harvest' && x.after.includes(s.id));
        const bounds = succ.map((x) => (isSharedHarvest(x) ? sharedStart.get(sharedKey(x)) : starts.get(x.id))).filter((x): x is number => x !== undefined);
        const t = latest(stepReq(s, d.units), Math.min(due, ...bounds), open);
        if (t === null) {
          placed = false;
          break;
        }
        ends.set(s.id, placeStep(s, d.id, d.cropPlanCode, d.units, t));
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
        const t = earliest(stepReq(s, d.units), predEnd);
        if (t === null) {
          ok = false;
          break;
        }
        ends.set(s.id, placeStep(s, d.id, d.cropPlanCode, d.units, t));
      }
      if (!ok) {
        restore(snap);
        unplace(d.id, 'harvest', `${d.cropPlanCode}: ${d.units} units to ship do not fit inside the operating day with the crews proposed.`);
        continue;
      }
    }
    completion.set(d.id, Math.max(open, ...ends.values()));
  }

  if (!backward) {
    for (const [key, s] of [...shared].sort((a, b) => a[1].seq - b[1].seq)) {
      const predEnds = orders.flatMap((d) => s.after.map((a) => blocks.find((b) => b.orderId === d.id && b.stepId === a)?.endMin)).filter((x): x is number => x !== undefined);
      const t = earliest(stepReq(s, 0), Math.max(open, ...predEnds));
      if (t === null) unplace('harvest', 'harvest', `${s.task} does not fit inside the operating day with the crews proposed.`);
      else placeShared(key, s, t);
    }
  }
  const dispatchesPlaced = [...completion.keys()];
  for (const d of orders) {
    const own = completion.get(d.id);
    if (own === undefined) continue;
    const sharedDone = d.route.steps.filter(isSharedHarvest).map((s) => sharedEnd.get(sharedKey(s))).filter((x): x is number => x !== undefined);
    const done = Math.max(own, ...sharedDone);
    if (done > due + EPS) {
      violations.push({ kind: 'due-date-missed', orderId: d.id, dueMin: due, byMin: done - due, detail: `${d.cropPlanCode}: harvest completes at ${clock(done)}; the distribution time is ${clock(due)}, ${mins(done - due)} late.` });
    }
  }

  // ── Sowings: the sow stream ────────────────────────────────────────────────
  const placedSowings: ScheduleSowing[] = [];

  for (const sowing of ranked(input.sowings.filter((b) => b.units > 0), 'sowing')) {
    const { route, units } = sowing;
    reportRoute(sowing.id, route);
    const steps = route.steps.filter((s) => s.stream === 'sowing');
    if (steps.length === 0 || !route.order) {
      unplace(sowing.id, 'sowing', route.order ? `${sowing.cropPlanCode} has no sowing-stream steps on file.` : `${sowing.cropPlanCode}'s route has a precedence cycle; the sowing is not placed.`);
      continue;
    }
    const byId = new Map(steps.map((s) => [s.id, s]));
    const ends = new Map<string, number>();
    const sowingSnap = snapshot();
    let ok = true;

    const deferred: RouteStep[] = [];
    for (const id of route.order) {
      const s = byId.get(id);
      if (!s) continue;
      if (s.after.some((a) => byId.has(a) && !ends.has(a))) {
        deferred.push(s);
        continue;
      }
      const t = earliest(stepReq(s, units), Math.max(open, ...s.after.map((a) => ends.get(a) ?? open)));
      if (t === null) {
        ok = false;
        break;
      }
      ends.set(s.id, placeStep(s, sowing.id, sowing.cropPlanCode, units, t));
    }
    for (const s of ok ? deferred : []) {
      const t = earliest(stepReq(s, units), Math.max(open, ...s.after.map((a) => ends.get(a) ?? open)));
      if (t === null) {
        ok = false;
        break;
      }
      ends.set(s.id, placeStep(s, sowing.id, sowing.cropPlanCode, units, t));
    }
    if (!ok) {
      restore(sowingSnap);
      unplace(sowing.id, 'sowing', `${sowing.cropPlanCode}: a sowing of ${units} units does not fit inside the operating day with the crews proposed.`);
      continue;
    }
    placedSowings.push(sowing);
  }

  // ── Closedown, once at the close ────────────────────────────────────────────
  const closedownMinutes = policy.closedownMinutes.value;
  const closedownStaff = policy.closedownStaff.value;
  if (closedownMinutes > 0) {
    const start = close - closedownMinutes;
    const minutes = closedownStaff * closedownMinutes;
    if (closedownStaff > 0) labor.push({ start, end: close, staff: closedownStaff });
    addBlock({ orderId: null, cropPlanCode: null, stream: 'day', stepId: null, kind: 'closedown', task: 'End-of-day closedown', resourceKey: null, startMin: start, endMin: close, staff: closedownStaff, laborMinutes: minutes, attended: true, controlPoint: null });
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
    if (!b.resourceKey) continue;
    jobsOn.set(b.resourceKey, [...(jobsOn.get(b.resourceKey) ?? []), b]);
  }
  for (const [key, jobs] of jobsOn) {
    const inside = jobs.filter((j) => j.endMin <= close + EPS).length;
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
      sowingsPlaced: placedSowings.length,
      sowingsUnplaced: input.sowings.filter((b) => b.units > 0).length - placedSowings.length,
      unitsPlaced: placedSowings.reduce((t, b) => t + b.units, 0),
      dispatchesPlaced: dispatchesPlaced.length,
      dispatchesUnplaced: orders.length - dispatchesPlaced.length,
      unitsShipped: orders.filter((d) => completion.has(d.id)).reduce((t, d) => t + d.units, 0),
      firstStartMin,
      lastEndMin,
      makespanMin: firstStartMin === null || lastEndMin === null ? 0 : lastEndMin - firstStartMin,
      utilizationByResource,
      bindingResourceKey,
      laborHours: hoursOf(work),
      sowingLaborHours: hoursOf(work.filter((b) => b.stream === 'sowing')),
      harvestLaborHours: hoursOf(work.filter((b) => b.stream === 'harvest')),
      closedownHours: hoursOf(blocks.filter((b) => b.kind === 'closedown')),
      crewHours,
      idleCrewHours: idle / 60,
    },
  };
}

// ── A day's inputs from the plan ─────────────────────────────────────────────

/**
 * The sowings and harvest orders for a date: that production day's whole
 * sowings per crop plan and that distribution day's shipments, each on its crop plan's
 * route (its labor standard, stage map, the Phase 1 list and the scenario's
 * step edits). A crop plan the library does not hold is listed, not placed.
 */
export function scheduleInputsForDay(input: {
  productionRuns?: readonly { cropPlanCode: string; sowingsScheduled: number; produced: number }[];
  shipments?: readonly { cropPlanCode: string; filledBase: number }[];
  cropPlans: readonly GrowPlanDef[];
  studies: readonly TimeStudyDoc[];
  equipment: readonly EquipmentLine[];
  routing: Readonly<Record<string, RouteStepOverlay>>;
}): { sowings: ScheduleSowing[]; dispatches: ScheduleHarvest[]; routes: CropPlanRoute[]; unknownCropPlans: string[] } {
  const routes = new Map<string, CropPlanRoute>();
  const unknown = new Set<string>();
  const routeFor = (code: string): CropPlanRoute | null => {
    if (routes.has(code)) return routes.get(code)!;
    const cropPlan = input.cropPlans.find((r) => r.code === code);
    if (!cropPlan) {
      unknown.add(code);
      return null;
    }
    const route = deriveRoute({ cropPlan, standard: laborStandard(studiesForCropPlan(input.studies, code)), equipment: input.equipment, overlay: routeOverlayFor(input.routing, code) });
    routes.set(code, route);
    return route;
  };
  const sowings: ScheduleSowing[] = [];
  for (const run of input.productionRuns ?? []) {
    if (run.sowingsScheduled <= 0) continue;
    const route = routeFor(run.cropPlanCode);
    if (!route) continue;
    for (let i = 0; i < run.sowingsScheduled; i++) {
      sowings.push({ id: `${run.cropPlanCode}#${i + 1}`, cropPlanCode: run.cropPlanCode, units: run.produced / run.sowingsScheduled, route });
    }
  }
  const dispatches: ScheduleHarvest[] = [];
  for (const s of input.shipments ?? []) {
    if (s.filledBase <= 0) continue;
    const route = routeFor(s.cropPlanCode);
    if (route) dispatches.push({ id: `${s.cropPlanCode}:harvest`, cropPlanCode: s.cropPlanCode, units: s.filledBase, route });
  }
  return { sowings, dispatches, routes: [...routes.values()], unknownCropPlans: [...unknown].sort() };
}
