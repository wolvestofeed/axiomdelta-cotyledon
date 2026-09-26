/**
 * Impact OS — the batch execution record.
 *
 * This is the ISA-95 / IEC 62264 Level 3 "production performance" object: what a
 * batch ACTUALLY did, as against the Level 4 production schedule that asked for
 * it. It is the only object in the platform that generates journal entries.
 * Nothing on a planning page ever writes to the ledger — a plan change must not
 * be able to restate the books.
 *
 * The same record carries the FSMA 204 transformation event and the CCP-2
 * cooling measurements, because they are the same physical event as the
 * inventory movement. One capture, three purposes: cost, recall, food safety.
 */

import type { ComponentCosting } from './index';
import { assumptions as defaultAssumptions } from '../_data/plan-data';

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
  | 'COOK_LOSS' // normal — evaporation and pan loss inside the standard yield
  | 'PORTION_OVERAGE' // normal — over-portioning inside the shrink allowance
  | 'CHILL_FAILURE' // abnormal — CCP-2 cooling limit not met
  | 'TEMPERATURE_EXCURSION' // abnormal
  | 'EQUIPMENT_FAILURE' // abnormal
  | 'CONTAMINATION' // abnormal
  | 'DROPPED_OR_DAMAGED' // abnormal
  | 'RECALL_OR_WITHDRAWAL' // abnormal
  | 'EXPIRED_HOLD_LIFE'; // abnormal — hold life exceeded in finished goods

export const ABNORMAL_SCRAP_REASONS: ReadonlySet<ScrapReason> = new Set<ScrapReason>([
  'CHILL_FAILURE',
  'TEMPERATURE_EXCURSION',
  'EQUIPMENT_FAILURE',
  'CONTAMINATION',
  'DROPPED_OR_DAMAGED',
  'RECALL_OR_WITHDRAWAL',
  'EXPIRED_HOLD_LIFE',
]);

export const isAbnormalScrap = (r: ScrapReason) => ABNORMAL_SCRAP_REASONS.has(r);

/**
 * Where the loss occurred. PREP is before the kettle — trim, a dropped case at
 * issue — so it leaves the mass before cooking and the cook delta is measured
 * on what was actually cooked. The other four are relieved from that WIP stage.
 */
export type ScrapStage = 'PREP' | 'COOK' | 'CHILL' | 'PACK' | 'FINISHED';
export const SCRAP_STAGES: readonly ScrapStage[] = ['PREP', 'COOK', 'CHILL', 'PACK', 'FINISHED'];

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
  /** Ingredient line consumed. */
  ingredient: string;
  /** Traceability lot code of the input, as received from the supplier. */
  inputLotCode: string;
  /** Quantity consumed, in the ingredient's own purchase unit. */
  qty: number;
  unit: 'lb' | 'each';
  /** True when the ingredient sits on the FDA Food Traceability List. */
  onFoodTraceabilityList: boolean;
}

// ── The batch record ────────────────────────────────────────────────────────

/** CCP-2 readings for ONE cabinet load: °F at 0, 2 and 6 hours, and the clock times of the chill. */
export interface CoolingRecord {
  t0F: number;
  t2F: number;
  t6F: number;
  startedAt: string;
  endedAt: string;
}

/**
 * The cooling records on a component, one per cabinet load, tolerant of the
 * single object records held before the lot was the cook. A record with no
 * readings is an empty list, never a placeholder that reads as data.
 */
export function coolingLoadsOf(c: Pick<ComponentExecution, 'cooling'>): CoolingRecord[] {
  const k = c.cooling as CoolingRecord[] | CoolingRecord | undefined | null;
  if (!k) return [];
  return Array.isArray(k) ? k : [k];
}

export interface ComponentExecution {
  component: string;
  /** Traceability lot code assigned to this component's output. */
  outputLotCode: string;
  /** What was actually drawn from the raw store, by lot. */
  consumed: LotConsumption[];
  /** Actual weights at each stage, lb. Cold components skip cook and chill. */
  apIssuedLb: number;
  cookedLb: number | null;
  chilledLb: number | null;
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
   * CCP-1: the minimum internal temperature reached at the end of cooking, °F,
   * for a hot component. Null when not recorded — a gap on the record, never a
   * pass. The limit is read from the HACCP plan, not stored here.
   */
  cookEndTempF?: number | null;
  /**
   * CCP-2 measurements for this component's chill, ONE PER CABINET LOAD the cook
   * filled — as many as the record's `batchesRun`. The cook is the lot (Robert,
   * 2026-09-17): two cabinets loaded from one cook are one lot with two cooling
   * records, and the lot fails CCP-2 if any load fails; a load with no readings
   * is a gap on the lot, never a pass. Read through `coolingLoadsOf`, which also
   * accepts the single object older records hold.
   */
  cooling?: CoolingRecord[];
}

export interface BatchExecution {
  batchId: string;
  recipeCode: string;
  /** ISO 8601. The production record and the standard cost version both key on it. */
  productionDate: string;
  /** Version of the recipe standard in force on the production date. */
  standardVersion: string;
  plannedPortions: number;
  /** Portions that passed and were packed. Drives everything downstream. */
  goodPortions: number;
  components: ComponentExecution[];
  /** Actual direct labor. Null means the batch ran at standard. */
  actualLaborHours: number | null;
  actualLaborRate: number | null;
  /** Person who closed the record — the production-record signature. */
  closedBy: string;
}

// ── The mass balance invariant ──────────────────────────────────────────────

export interface ComponentMassBalance {
  component: string;
  apIssuedLb: number;
  /** Scrap taken before the kettle (stage PREP); the cook delta is measured on what remains. */
  prepScrapLb: number;
  /** Positive where cooking added mass (water uptake), negative where it removed it. */
  cookDeltaLb: number;
  chillLossLb: number;
  /** Every scrap event on the component, all stages. */
  scrapLb: number;
  /** The component's shrink allowance, lb; null when the record carries none. */
  allowanceLb: number | null;
  normalScrapLb: number;
  abnormalScrapLb: number;
  packedLb: number;
  /** apIssued − prepScrap + cookDelta − chillLoss − (scrap after prep) − packed. Must be zero. */
  residualLb: number;
  balanced: boolean;
}

export interface MassBalance {
  batchId: string;
  components: ComponentMassBalance[];
  balanced: boolean;
  /** Components whose weights do not reconcile, with the residual named. */
  failures: string[];
  totalApIssuedLb: number;
  totalPackedLb: number;
  totalScrapLb: number;
  normalScrapLb: number;
  abnormalScrapLb: number;
}

/** Tolerance in pounds. Scale weights are not exact; a drifting residual is. */
export const MASS_BALANCE_TOLERANCE_LB = 0.5;

/**
 * Reconcile every stage weight of a batch.
 *
 * Cooking ADDS mass to this recipe — rice and beans take on water — so the
 * balance carries a signed cook delta rather than a loss. What must hold is that
 * every pound issued is accounted for as packed product, a named loss, or scrap
 * with a reason code. A batch that does not balance does not close.
 */
export function massBalance(batch: BatchExecution): MassBalance {
  const components: ComponentMassBalance[] = batch.components.map((c) => {
    const prepScrapLb = c.scrap.filter((e) => e.stage === 'PREP').reduce((s, e) => s + e.lb, 0);
    const laterScrapLb = c.scrap.filter((e) => e.stage !== 'PREP').reduce((s, e) => s + e.lb, 0);
    const intoKettleLb = c.apIssuedLb - prepScrapLb;
    const cookedLb = c.cookedLb ?? intoKettleLb;
    const chilledLb = c.chilledLb ?? cookedLb;
    const cookDeltaLb = cookedLb - intoKettleLb;
    const chillLossLb = cookedLb - chilledLb;
    const residualLb = intoKettleLb + cookDeltaLb - chillLossLb - laterScrapLb - c.packedLb;
    const classified = classifyScrap(c);
    return {
      component: c.component,
      apIssuedLb: c.apIssuedLb,
      prepScrapLb,
      cookDeltaLb,
      chillLossLb,
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
    batchId: batch.batchId,
    components,
    balanced: components.every((c) => c.balanced),
    failures: components
      .filter((c) => !c.balanced)
      .map(
        (c) =>
          `${c.component}: ${c.residualLb.toFixed(2)} lb unaccounted for (issued ${c.apIssuedLb.toFixed(1)}, prep scrap ${c.prepScrapLb.toFixed(1)}, cook delta ${c.cookDeltaLb >= 0 ? '+' : ''}${c.cookDeltaLb.toFixed(1)}, chill loss ${c.chillLossLb.toFixed(1)}, scrap after prep ${(c.scrapLb - c.prepScrapLb).toFixed(1)}, packed ${c.packedLb.toFixed(1)}).`,
      ),
    totalApIssuedLb: components.reduce((s, c) => s + c.apIssuedLb, 0),
    totalPackedLb: components.reduce((s, c) => s + c.packedLb, 0),
    totalScrapLb: components.reduce((s, c) => s + c.scrapLb, 0),
    normalScrapLb: components.reduce((s, c) => s + c.normalScrapLb, 0),
    abnormalScrapLb: components.reduce((s, c) => s + c.abnormalScrapLb, 0),
  };
}

/**
 * Build a batch record that ran exactly to standard, from the costed components.
 * The model's default state: no actuals recorded, so every variance is zero and
 * the ledger shows the standard chain cleanly.
 *
 * The issue carries the shrink allowance: the run buys `portions × (1 + shrink)`
 * (accounting policy §5), so the standard issue is that quantity and the
 * allowance itself is on the record as normal TRIM scrap before the kettle.
 * The same pounds then reconcile through cook, chill and pack to the standard
 * packed weight, and a record issued exactly at standard has no usage variance.
 */
export function standardBatch(
  batchId: string,
  productionDate: string,
  portions: number,
  components: ComponentCosting[],
  standardVersion: string,
  lotCodeFor: (component: string) => string,
  recipeCode = 'AMK-E-001',
  shrinkAllowance: number = defaultAssumptions.yield.shrinkAllowance.value,
): BatchExecution {
  const OZ_PER_LB = 16;
  const issueFactor = 1 + shrinkAllowance;
  return {
    batchId,
    recipeCode,
    productionDate,
    standardVersion,
    plannedPortions: portions,
    goodPortions: portions,
    actualLaborHours: null,
    actualLaborRate: null,
    closedBy: 'unsigned — standard-cost model, no production record on file',
    components: components.map((k) => ({
      component: k.name,
      outputLotCode: lotCodeFor(k.name),
      consumed: k.lines.map((l) => ({
        ingredient: l.name,
        inputLotCode: 'not recorded',
        qty: l.apPerPortion * portions * issueFactor,
        unit: l.unit,
        onFoodTraceabilityList: Boolean(l.foodTraceabilityList),
      })),
      apIssuedLb: (k.apOz * portions * issueFactor) / OZ_PER_LB,
      cookedLb: k.isHot ? (k.cookedOz * portions) / OZ_PER_LB : null,
      chilledLb: k.isHot ? (k.chilledOz * portions) / OZ_PER_LB : null,
      packedLb: (k.platedOz * portions) / OZ_PER_LB,
      shrinkAllowanceLb: (k.apOz * portions * shrinkAllowance) / OZ_PER_LB,
      scrap:
        shrinkAllowance > 0
          ? [{ reason: 'TRIM', lb: (k.apOz * portions * shrinkAllowance) / OZ_PER_LB, stage: 'PREP', note: `Standard shrink allowance, ${(shrinkAllowance * 100).toFixed(1)}% of the issue` }]
          : [],
    })),
  };
}
