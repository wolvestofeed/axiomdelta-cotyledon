/**
 * MicroFarm — the sowing execution record.
 *
 * This is the ISA-95 / IEC 62264 Level 3 "production performance" object: what a
 * sowing ACTUALLY did, as against the Level 4 production schedule that asked for
 * it. It is the only object in the platform that generates journal entries.
 * Nothing on a planning page ever writes to the ledger — a plan change must not
 * be able to restate the books.
 *
 * The same record carries the FSMA 204 transformation event and the control-point-2
 * cooling measurements, because they are the same physical event as the
 * inventory movement. One capture, three purposes: cost, recall, produce safety.
 */

import type { ComponentCosting } from '@/engine';
import { assumptions as defaultAssumptions } from '@/data/plan-data';

// ── Scrap disposition: the field that decides inventory vs period expense ───

/**
 * Every scrap transaction carries a reason, and the reason decides the
 * accounting. Normal spoilage is inside the standard shrink allowance and is
 * already in standard cost, so it stays in inventory. Abnormal spoilage is a
 * current-period charge under ASC 330-10-30-7 and never touches inventory.
 *
 * ISO 9001:2015 clause 8.7 (control of nonconforming outputs) is the record
 * format; ISO 22400 draws the same line between planned and actual scrap.
 */
export type ScrapReason =
  | 'TRIM' // normal — prep loss inside the standard yield
  | 'SOW_LOSS' // normal — evaporation and pan loss inside the standard yield
  | 'UNIT_OVERAGE' // normal — over-packing inside the shrink allowance
  | 'BLACKOUT_FAILURE' // abnormal — control-point-2 cooling limit not met
  | 'TEMPERATURE_EXCURSION' // abnormal
  | 'EQUIPMENT_FAILURE' // abnormal
  | 'CONTAMINATION' // abnormal
  | 'DROPPED_OR_DAMAGED' // abnormal
  | 'RECALL_OR_WITHDRAWAL' // abnormal
  | 'EXPIRED_SHELF_LIFE'; // abnormal — shelf life exceeded in finished goods

export const ABNORMAL_SCRAP_REASONS: ReadonlySet<ScrapReason> = new Set<ScrapReason>([
  'BLACKOUT_FAILURE',
  'TEMPERATURE_EXCURSION',
  'EQUIPMENT_FAILURE',
  'CONTAMINATION',
  'DROPPED_OR_DAMAGED',
  'RECALL_OR_WITHDRAWAL',
  'EXPIRED_SHELF_LIFE',
]);

export const isAbnormalScrap = (r: ScrapReason) => ABNORMAL_SCRAP_REASONS.has(r);

/**
 * Where the loss occurred. PREP is before the sprouting rack — trim, a dropped case at
 * issue — so it leaves the mass before growing and the sow delta is measured
 * on what was actually harvested. The other four are relieved from that WIP stage.
 */
export type ScrapStage = 'PREP' | 'SOW' | 'BLACKOUT' | 'PACK' | 'FINISHED';
export const SCRAP_STAGES: readonly ScrapStage[] = ['PREP', 'SOW', 'BLACKOUT', 'PACK', 'FINISHED'];

export interface ScrapEvent {
  reason: ScrapReason;
  lb: number;
  /** Which stage the loss occurred in — it is relieved from that account. */
  stage: ScrapStage;
  note: string;
}

/**
 * One scrap event split into its normal and abnormal pounds. A normal reason is
 * normal only up to the component's shrink allowance; the pounds beyond it are
 * abnormal spoilage (ASC 330-10-30-7) and leave inventory. An abnormal reason
 * is abnormal in full. Events consume the allowance in the order recorded.
 */
export interface ClassifiedScrap {
  event: ScrapEvent;
  normalLb: number;
  abnormalLb: number;
}

export function classifyScrap(c: Pick<ComponentExecution, 'scrap' | 'shrinkAllowanceLb'>): ClassifiedScrap[] {
  let allowanceLeft = c.shrinkAllowanceLb ?? Number.POSITIVE_INFINITY;
  return c.scrap.map((event) => {
    if (isAbnormalScrap(event.reason)) return { event, normalLb: 0, abnormalLb: event.lb };
    const normalLb = Math.min(event.lb, Math.max(0, allowanceLeft));
    allowanceLeft -= normalLb;
    return { event, normalLb, abnormalLb: event.lb - normalLb };
  });
}

// ── Lot consumption: the line that relieves inventory AND records the CTE ───

export interface LotConsumption {
  /** Input line consumed. */
  input: string;
  /** Traceability lot code of the input, as received from the supplier. */
  inputLotCode: string;
  /** Quantity consumed, in the input's own purchase unit. */
  qty: number;
  unit: 'lb' | 'each';
  /** True when the input sits on the FDA Food Traceability List. */
  onFoodTraceabilityList: boolean;
}

// ── The sowing record ────────────────────────────────────────────────────────

/** control-point-2 readings for ONE rack load: °F at 0, 2 and 6 hours, and the clock times of the blackout. */
export interface StageRecord {
  t0F: number;
  t2F: number;
  t6F: number;
  startedAt: string;
  endedAt: string;
}

/**
 * The stage records on a component, one per rack load, tolerant of the
 * single object records held before the lot was the sow. A record with no
 * readings is an empty list, never a placeholder that reads as data.
 */
export function stageLoadsOf(c: Pick<ComponentExecution, 'cooling'>): StageRecord[] {
  const k = c.cooling as StageRecord[] | StageRecord | undefined | null;
  if (!k) return [];
  return Array.isArray(k) ? k : [k];
}

export interface ComponentExecution {
  component: string;
  /** Traceability lot code assigned to this component's output. */
  outputLotCode: string;
  /** What was actually drawn from the raw store, by lot. */
  consumed: LotConsumption[];
  /** Actual weights at each stage, lb. Cold components skip sow and blackout. */
  seedIssuedLb: number;
  harvestedLb: number | null;
  blackoutLb: number | null;
  packedLb: number;
  scrap: ScrapEvent[];
  /**
   * The standard shrink allowance for this component, lb — the issued weight
   * carries it, and scrap with a normal reason is normal only up to it. Absent
   * on records written before the allowance was on the record: every normal
   * reason is then normal in full.
   */
  shrinkAllowanceLb?: number;
  /**
   * control-point-1: the minimum internal temperature reached at the end of growing, °F,
   * for a hot component. Null when not recorded — a gap on the record, never a
   * pass. The limit is read from the HACCP plan, not stored here.
   */
  sowEndTempF?: number | null;
  /**
   * control-point-2 measurements for this component's blackout, ONE PER RACK LOAD the sow
   * filled — as many as the record's `sowingsRun`. The sow is the lot: two racks loaded from one sow are one lot with two cooling
   * records, and the lot fails control-point-2 if any load fails; a load with no readings
   * is a gap on the lot, never a pass. Read through `stageLoadsOf`, which also
   * accepts the single object older records hold.
   */
  cooling?: StageRecord[];
}

export interface SowingExecution {
  sowingId: string;
  cropPlanCode: string;
  /** ISO 8601. The production record and the standard cost version both key on it. */
  productionDate: string;
  /** Version of the crop plan standard in force on the production date. */
  standardVersion: string;
  plannedUnits: number;
  /** Units that passed and were packed. Drives everything downstream. */
  goodUnits: number;
  components: ComponentExecution[];
  /** Actual direct labor. Null means the sowing ran at standard. */
  actualLaborHours: number | null;
  actualLaborRate: number | null;
  /** Person who closed the record — the production-record signature. */
  closedBy: string;
}

// ── The mass balance invariant ──────────────────────────────────────────────

export interface ComponentMassBalance {
  component: string;
  seedIssuedLb: number;
  /** Scrap taken before the sprouting rack (stage PREP); the sow delta is measured on what remains. */
  prepScrapLb: number;
  /** Positive where growing added mass (water uptake), negative where it removed it. */
  sowDeltaLb: number;
  blackoutLossLb: number;
  /** Every scrap event on the component, all stages. */
  scrapLb: number;
  /** The component's shrink allowance, lb; null when the record carries none. */
  allowanceLb: number | null;
  normalScrapLb: number;
  abnormalScrapLb: number;
  packedLb: number;
  /** seedIssued − prepScrap + sowDelta − blackoutLoss − (scrap after prep) − packed. Must be zero. */
  residualLb: number;
  balanced: boolean;
}

export interface MassBalance {
  sowingId: string;
  components: ComponentMassBalance[];
  balanced: boolean;
  /** Components whose weights do not reconcile, with the residual named. */
  failures: string[];
  totalSeedIssuedLb: number;
  totalPackedLb: number;
  totalScrapLb: number;
  normalScrapLb: number;
  abnormalScrapLb: number;
}

/** Tolerance in pounds. Scale weights are not exact; a drifting residual is. */
export const MASS_BALANCE_TOLERANCE_LB = 0.5;

/**
 * Reconcile every stage weight of a sowing.
 *
 * Growing ADDS mass to this crop plan — rice and beans take on water — so the
 * balance carries a signed sow delta rather than a loss. What must hold is that
 * every pound issued is accounted for as packed product, a named loss, or scrap
 * with a reason code. A sowing that does not balance does not close.
 */
export function massBalance(sowing: SowingExecution): MassBalance {
  const components: ComponentMassBalance[] = sowing.components.map((c) => {
    const prepScrapLb = c.scrap.filter((e) => e.stage === 'PREP').reduce((s, e) => s + e.lb, 0);
    const laterScrapLb = c.scrap.filter((e) => e.stage !== 'PREP').reduce((s, e) => s + e.lb, 0);
    const intoSproutingRackLb = c.seedIssuedLb - prepScrapLb;
    const harvestedLb = c.harvestedLb ?? intoSproutingRackLb;
    const blackoutLb = c.blackoutLb ?? harvestedLb;
    const sowDeltaLb = harvestedLb - intoSproutingRackLb;
    const blackoutLossLb = harvestedLb - blackoutLb;
    const residualLb = intoSproutingRackLb + sowDeltaLb - blackoutLossLb - laterScrapLb - c.packedLb;
    const classified = classifyScrap(c);
    return {
      component: c.component,
      seedIssuedLb: c.seedIssuedLb,
      prepScrapLb,
      sowDeltaLb,
      blackoutLossLb,
      scrapLb: prepScrapLb + laterScrapLb,
      allowanceLb: c.shrinkAllowanceLb ?? null,
      normalScrapLb: classified.reduce((s, k) => s + k.normalLb, 0),
      abnormalScrapLb: classified.reduce((s, k) => s + k.abnormalLb, 0),
      packedLb: c.packedLb,
      residualLb,
      balanced: Math.abs(residualLb) <= MASS_BALANCE_TOLERANCE_LB,
    };
  });

  return {
    sowingId: sowing.sowingId,
    components,
    balanced: components.every((c) => c.balanced),
    failures: components
      .filter((c) => !c.balanced)
      .map(
        (c) =>
          `${c.component}: ${c.residualLb.toFixed(2)} lb unaccounted for (issued ${c.seedIssuedLb.toFixed(1)}, prep scrap ${c.prepScrapLb.toFixed(1)}, sow delta ${c.sowDeltaLb >= 0 ? '+' : ''}${c.sowDeltaLb.toFixed(1)}, blackout loss ${c.blackoutLossLb.toFixed(1)}, scrap after prep ${(c.scrapLb - c.prepScrapLb).toFixed(1)}, packed ${c.packedLb.toFixed(1)}).`,
      ),
    totalSeedIssuedLb: components.reduce((s, c) => s + c.seedIssuedLb, 0),
    totalPackedLb: components.reduce((s, c) => s + c.packedLb, 0),
    totalScrapLb: components.reduce((s, c) => s + c.scrapLb, 0),
    normalScrapLb: components.reduce((s, c) => s + c.normalScrapLb, 0),
    abnormalScrapLb: components.reduce((s, c) => s + c.abnormalScrapLb, 0),
  };
}

/**
 * Build a sowing record that ran exactly to standard, from the costed components.
 * The model's default state: no actuals recorded, so every variance is zero and
 * the ledger shows the standard chain cleanly.
 *
 * The issue carries the shrink allowance: the run buys `units × (1 + shrink)`
 * (accounting policy §5), so the standard issue is that quantity and the
 * allowance itself is on the record as normal TRIM scrap before the sprouting rack.
 * The same pounds then reconcile through sow, blackout and pack to the standard
 * packed weight, and a record issued exactly at standard has no usage variance.
 */
export function standardSowing(
  sowingId: string,
  productionDate: string,
  units: number,
  components: ComponentCosting[],
  standardVersion: string,
  lotCodeFor: (component: string) => string,
  cropPlanCode = 'AMK-E-001',
  shrinkAllowance: number = defaultAssumptions.yield.shrinkAllowance.value,
): SowingExecution {
  const OZ_PER_LB = 16;
  const issueFactor = 1 + shrinkAllowance;
  return {
    sowingId,
    cropPlanCode,
    productionDate,
    standardVersion,
    plannedUnits: units,
    goodUnits: units,
    actualLaborHours: null,
    actualLaborRate: null,
    closedBy: 'unsigned — standard-cost model, no production record on file',
    components: components.map((k) => ({
      component: k.name,
      outputLotCode: lotCodeFor(k.name),
      consumed: k.lines.map((l) => ({
        input: l.name,
        inputLotCode: 'not recorded',
        qty: l.seedPerUnit * units * issueFactor,
        unit: l.unit,
        onFoodTraceabilityList: Boolean(l.foodTraceabilityList),
      })),
      seedIssuedLb: (k.seedOz * units * issueFactor) / OZ_PER_LB,
      harvestedLb: k.isHot ? (k.harvestedOz * units) / OZ_PER_LB : null,
      blackoutLb: k.isHot ? (k.blackoutOz * units) / OZ_PER_LB : null,
      packedLb: (k.packedOz * units) / OZ_PER_LB,
      shrinkAllowanceLb: (k.seedOz * units * shrinkAllowance) / OZ_PER_LB,
      scrap:
        shrinkAllowance > 0
          ? [{ reason: 'TRIM', lb: (k.seedOz * units * shrinkAllowance) / OZ_PER_LB, stage: 'PREP', note: `Standard shrink allowance, ${(shrinkAllowance * 100).toFixed(1)}% of the issue` }]
          : [],
    })),
  };
}
