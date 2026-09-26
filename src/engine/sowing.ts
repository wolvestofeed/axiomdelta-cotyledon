/**
 * MicroFarm — the sowing execution record.
 *
 * This is the ISA-95 / IEC 62264 Level 3 "production performance" object: what a
 * sowing ACTUALLY did, as against the Level 4 production schedule that asked for
 * it. It is the only object in the platform that generates journal entries.
 * Nothing on a planning page ever writes to the ledger — a plan change must not
 * be able to restate the books.
 *
 * A sowing is one grow plan sown on one day. It carries one lot per variety, in
 * grams — the seed issued in and the harvest out — and the medium and nutrient
 * issued to its trays. The same record is the inventory movement and the FSMA 204
 * transformation event: one capture, cost and recall.
 */

import { GRAMS_PER_LB } from '@/data/tray-formats';

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
  | 'TRIM' // normal — seed sorted out before sowing, trim at harvest, inside the shrink allowance
  | 'TEMPERATURE_EXCURSION' // abnormal
  | 'EQUIPMENT_FAILURE' // abnormal
  | 'CONTAMINATION' // abnormal — a tray removed at the harvest check
  | 'DROPPED_OR_DAMAGED' // abnormal
  | 'RECALL_OR_WITHDRAWAL' // abnormal
  | 'EXPIRED_SHELF_LIFE'; // abnormal — shelf life exceeded in finished goods

export const SCRAP_REASONS: readonly ScrapReason[] = ['TRIM', 'TEMPERATURE_EXCURSION', 'EQUIPMENT_FAILURE', 'CONTAMINATION', 'DROPPED_OR_DAMAGED', 'RECALL_OR_WITHDRAWAL', 'EXPIRED_SHELF_LIFE'];

export const ABNORMAL_SCRAP_REASONS: ReadonlySet<ScrapReason> = new Set<ScrapReason>([
  'TEMPERATURE_EXCURSION',
  'EQUIPMENT_FAILURE',
  'CONTAMINATION',
  'DROPPED_OR_DAMAGED',
  'RECALL_OR_WITHDRAWAL',
  'EXPIRED_SHELF_LIFE',
]);

export const isAbnormalScrap = (r: ScrapReason) => ABNORMAL_SCRAP_REASONS.has(r);

/**
 * Where the loss occurred, one per work-in-process stage and finished goods. SOW is seed lost
 * before or at sowing: raw material at its purchase cost. GROW is a tray lost on the shelves,
 * PACK a tray lost at the harvest check or in packing, FINISHED a packed tray lost after it.
 * Each is relieved from that stage's account.
 */
export type ScrapStage = 'SOW' | 'GROW' | 'PACK' | 'FINISHED';
export const SCRAP_STAGES: readonly ScrapStage[] = ['SOW', 'GROW', 'PACK', 'FINISHED'];

export interface ScrapEvent {
  reason: ScrapReason;
  /** Grams: seed at SOW, harvest weight at every later stage. */
  g: number;
  /** Which stage the loss occurred in — it is relieved from that account. */
  stage: ScrapStage;
  note: string;
}

/**
 * One scrap event split into its normal and abnormal grams. A normal reason is
 * normal only up to the lot's shrink allowance; the grams beyond it are
 * abnormal spoilage (ASC 330-10-30-7) and leave inventory. An abnormal reason
 * is abnormal in full. Events consume the allowance in the order recorded.
 */
export interface ClassifiedScrap {
  event: ScrapEvent;
  normalG: number;
  abnormalG: number;
}

export function classifyScrap(lot: Pick<VarietyLot, 'scrap' | 'shrinkAllowanceG'>): ClassifiedScrap[] {
  let allowanceLeft = lot.shrinkAllowanceG;
  return lot.scrap.map((event) => {
    if (isAbnormalScrap(event.reason)) return { event, normalG: 0, abnormalG: event.g };
    const normalG = Math.min(event.g, Math.max(0, allowanceLeft));
    allowanceLeft -= normalG;
    return { event, normalG, abnormalG: event.g - normalG };
  });
}

// ── The sowing record ────────────────────────────────────────────────────────

/** One variety's lot on a sowing: the seed issued in and the harvest out, in grams. */
export interface VarietyLot {
  varietyKey: string;
  /** The variety's name: the input a seed receipt is recorded under. */
  variety: string;
  /** The seed lot issued, as received from the supplier; 'not recorded' when none was typed. */
  seedLotCode: string;
  /** True when the seed sits on the FDA Food Traceability List (sprouts). */
  onFoodTraceabilityList: boolean;
  /** Seed issued for the sowing, the shrink allowance included. */
  seedIssuedG: number;
  /** The standard shrink allowance inside the issue; normal scrap is normal only up to it. */
  shrinkAllowanceG: number;
  /** Harvest weight of the whole sowing, trays later removed at the check included. */
  harvestedG: number;
  packedG: number;
  /** Traceability lot code assigned to this variety's output. */
  outputLotCode: string;
  scrap: ScrapEvent[];
}

/** A medium or nutrient issued to the sowing's trays, in the line's own unit. Light is not issued: it is overhead. */
export interface SowingIssue {
  kind: 'medium' | 'nutrient';
  /** The line's name (`lineLabel`): the input a purchase order and a receipt are recorded under. */
  input: string;
  lotCode: string;
  qty: number;
  unit: string;
}

export interface SowingExecution {
  sowingId: string;
  cropPlanCode: string;
  /** ISO 8601: the sow date. The standard cost version keys on it. */
  productionDate: string;
  /** Version of the plan standard in force on the sow date. */
  standardVersion: string;
  /** Trays (or jars) sown: the basis of the standard. */
  traysSown: number;
  /** Trays that passed the harvest check and were packed. */
  goodUnits: number;
  lots: VarietyLot[];
  issues: SowingIssue[];
  /** Actual direct labor. Null means the sowing ran at standard. */
  actualLaborHours: number | null;
  actualLaborRate: number | null;
  /** Person who closed the record — the production-record signature. */
  closedBy: string;
}

/** Every raw-material issue on a sowing, seed in lb as it is received, for the raw stock and the recall trace. */
export function issuesOf(s: Pick<SowingExecution, 'lots' | 'issues'>): { input: string; lotCode: string; qty: number; unit: string; onFoodTraceabilityList: boolean }[] {
  return [
    ...s.lots.map((l) => ({ input: l.variety, lotCode: l.seedLotCode, qty: l.seedIssuedG / GRAMS_PER_LB, unit: 'lb', onFoodTraceabilityList: l.onFoodTraceabilityList })),
    ...s.issues.map((i) => ({ input: i.input, lotCode: i.lotCode, qty: i.qty, unit: i.unit, onFoodTraceabilityList: false })),
  ];
}

// ── The mass balance invariant ──────────────────────────────────────────────

export interface LotMassBalance {
  variety: string;
  seedIssuedG: number;
  /** Seed lost before or at sowing (stage SOW). */
  sowScrapG: number;
  harvestedG: number;
  /** Harvest lost at the check or in packing (stage PACK). */
  packScrapG: number;
  /** Every scrap event on the lot, all stages. */
  scrapG: number;
  allowanceG: number;
  normalScrapG: number;
  abnormalScrapG: number;
  packedG: number;
  /** harvested − pack scrap − packed. Must be zero. */
  residualG: number;
  balanced: boolean;
}

export interface MassBalance {
  sowingId: string;
  lots: LotMassBalance[];
  balanced: boolean;
  /** Lots whose weights do not reconcile, with the residual named. */
  failures: string[];
  totalSeedIssuedG: number;
  totalHarvestedG: number;
  totalPackedG: number;
  totalScrapG: number;
  normalScrapG: number;
  abnormalScrapG: number;
}

/** Tolerance in grams. Scale weights are not exact; a drifting residual is. */
export const MASS_BALANCE_TOLERANCE_G = 5;

/**
 * Reconcile every weight of a sowing. Growing turns seed into many times its weight, so
 * seed and harvest are not balanced against each other: the seed side is the issue less
 * what was lost before sowing, which cannot be negative, and the harvest side must close —
 * every gram harvested is packed or is scrap with a reason code. A sowing that does not
 * balance does not close.
 */
export function massBalance(sowing: Pick<SowingExecution, 'sowingId' | 'lots'>): MassBalance {
  const lots: LotMassBalance[] = sowing.lots.map((l) => {
    const at = (stage: ScrapStage) => l.scrap.filter((e) => e.stage === stage).reduce((s, e) => s + e.g, 0);
    const sowScrapG = at('SOW');
    const packScrapG = at('PACK');
    const residualG = l.harvestedG - packScrapG - l.packedG;
    const classified = classifyScrap(l);
    return {
      variety: l.variety,
      seedIssuedG: l.seedIssuedG,
      sowScrapG,
      harvestedG: l.harvestedG,
      packScrapG,
      scrapG: l.scrap.reduce((s, e) => s + e.g, 0),
      allowanceG: l.shrinkAllowanceG,
      normalScrapG: classified.reduce((s, k) => s + k.normalG, 0),
      abnormalScrapG: classified.reduce((s, k) => s + k.abnormalG, 0),
      packedG: l.packedG,
      residualG,
      balanced: Math.abs(residualG) <= MASS_BALANCE_TOLERANCE_G && sowScrapG <= l.seedIssuedG + MASS_BALANCE_TOLERANCE_G,
    };
  });
  const g = (x: number) => x.toFixed(0);
  return {
    sowingId: sowing.sowingId,
    lots,
    balanced: lots.every((l) => l.balanced),
    failures: lots
      .filter((l) => !l.balanced)
      .map((l) =>
        l.sowScrapG > l.seedIssuedG + MASS_BALANCE_TOLERANCE_G
          ? `${l.variety}: ${g(l.sowScrapG)} g of seed scrapped before sowing against ${g(l.seedIssuedG)} g issued.`
          : `${l.variety}: ${g(l.residualG)} g unaccounted for (harvested ${g(l.harvestedG)}, scrap at the check or in packing ${g(l.packScrapG)}, packed ${g(l.packedG)}).`,
      ),
    totalSeedIssuedG: lots.reduce((s, l) => s + l.seedIssuedG, 0),
    totalHarvestedG: lots.reduce((s, l) => s + l.harvestedG, 0),
    totalPackedG: lots.reduce((s, l) => s + l.packedG, 0),
    totalScrapG: lots.reduce((s, l) => s + l.scrapG, 0),
    normalScrapG: lots.reduce((s, l) => s + l.normalScrapG, 0),
    abnormalScrapG: lots.reduce((s, l) => s + l.abnormalScrapG, 0),
  };
}
