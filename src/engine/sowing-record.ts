/**
 * MicroFarm — the sowing record on the grow model (outline §4 Sowing). Pure.
 *
 * A sowing is one grow plan sown on one day: its trays, the grow unit they sit on, one lot per
 * variety, the stage records the control points ask for (seed treatment, the spent-water test on
 * a jar, the grow-room readings, the harvest check), the medium and nutrient issued, the mass
 * balance in grams (harvested − scrap = packed) and the crew's hours. Only a closed record posts
 * journals (`production-ledger.ts`).
 */

import { costPlan } from '@/engine/grow-costing';
import type { GrowPlanDef } from '@/data/grow-plan';
import { lineLabel, planStages, seedLines } from '@/data/grow-plan';
import { CONTROL_POINT_BY_ID, STAGE_CONTROL_POINTS, type ControlPointDef } from '@/data/produce-safety';
import { TRAY_FORMAT_BY_KEY, type TrayFormatKey } from '@/data/tray-formats';
import { VARIETY_BY_KEY, type VarietyDef } from '@/data/varieties';
import type { SowingRecordDoc } from '@/engine/actuals';
import { type GrowPlanCarrier } from '@/engine/grow-plan-bridge';
import { controlPointsForPlan, evaluateSpentWaterTest, type SpentWaterTest, type SpentWaterVerdict } from '@/engine/produce-safety';
import type { SowingIssue, VarietyLot } from '@/engine/sowing';

export interface SeedTreatmentRecord {
  /** The treatment as the produce safety plan names it. */
  method: string;
  concentration: string;
  contactMinutes: number | null;
  /** The seed lot treated, as received. */
  seedLot: string;
  by: string;
}

export interface SpentWaterRecord extends SpentWaterTest {
  sampledOn: string | null;
  resultOn: string | null;
  lab: string;
}

export interface GrowRoomReading {
  /** ISO date or date-time the reading was taken. */
  at: string;
  tempF: number | null;
  rhPct: number | null;
  by: string;
}

export interface HarvestCheckRecord {
  traysPassed: number;
  traysRemoved: number;
  note: string;
}

export interface StageRecords {
  seedTreatment: SeedTreatmentRecord | null;
  spentWaterTest: SpentWaterRecord | null;
  readings: GrowRoomReading[];
  harvestCheck: HarvestCheckRecord | null;
}

export const EMPTY_STAGE_RECORDS: StageRecords = { seedTreatment: null, spentWaterTest: null, readings: [], harvestCheck: null };

/** The fields a grow-model sowing record carries beside the execution the ledger reads. */
export interface GrowSowingFields {
  format: TrayFormatKey;
  traysSown: number;
  traysPacked: number;
  growUnitKey: string | null;
  /** The day the trays were packed for distribution; null until closed. */
  packedOn: string | null;
  stageRecords: StageRecords;
}

export const isGrowSowing = (doc: Pick<SowingRecordDoc, 'format'>): doc is SowingRecordDoc & GrowSowingFields => typeof doc.format === 'string' && doc.format in TRAY_FORMAT_BY_KEY;

/** `${plan}-${YYMMDD}-${variety}-${NN}`: one lot per variety per sow. */
export function growLotCode(planCode: string, sowDate: string, variety: VarietyDef, sequence: number): string {
  return `${planCode}-${sowDate.replaceAll('-', '').slice(2)}-${variety.code}-${String(sequence).padStart(2, '0')}`;
}

/**
 * A record prefilled at standard for a sow date: one lot per variety with the seed issued (the
 * plan's grams per tray times the trays, plus the shrink allowance as normal scrap before
 * sowing) and the harvest weight from the variety record, packed as harvested; the medium and
 * nutrient issued at the plan's quantity per tray times the trays, with the allowance; every
 * stage record empty. The operator types what differed and signs.
 */
export function growSowingPrefill(
  carrier: GrowPlanCarrier,
  sowDate: string,
  sequence: number,
  trays: number,
  growUnitKey: string | null,
  sowingId: string,
  standardVersion: string,
  shrinkAllowance: number,
  varieties: Readonly<Record<string, VarietyDef>> = VARIETY_BY_KEY,
): Omit<SowingRecordDoc, 'id' | 'closedAt'> & GrowSowingFields {
  const plan: GrowPlanDef = carrier;
  const costing = costPlan(carrier);
  const sprout = TRAY_FORMAT_BY_KEY[plan.format].kind === 'sprout';
  const issues: SowingIssue[] = costing.lines
    .filter((l): l is typeof l & { line: { kind: 'medium' | 'nutrient' } } => (l.line.kind === 'medium' || l.line.kind === 'nutrient') && l.quantity > 0)
    .map((l) => ({ kind: l.line.kind, input: lineLabel(l.line, varieties), lotCode: 'not recorded', qty: l.quantity * trays * (1 + shrinkAllowance), unit: l.quantityUnit }));
  const lots: VarietyLot[] = seedLines(plan).map((line, i) => {
    const v = varieties[line.varietyKey];
    const seedG = line.gramsPerTray.value * trays;
    const harvestG = v ? v.harvestGramsPer1020.value * (sprout ? 1 : costing.format.densityFactor.value) * line.share * trays : 0;
    const allowanceG = seedG * shrinkAllowance;
    return {
      varietyKey: line.varietyKey,
      variety: v?.name ?? line.varietyKey,
      seedLotCode: 'not recorded',
      onFoodTraceabilityList: sprout,
      seedIssuedG: seedG + allowanceG,
      shrinkAllowanceG: allowanceG,
      harvestedG: harvestG,
      packedG: harvestG,
      outputLotCode: v ? growLotCode(plan.code, sowDate, v, sequence) : `${plan.code}-${sowDate}-${i + 1}`,
      scrap: allowanceG > 0 ? [{ reason: 'TRIM' as const, g: allowanceG, stage: 'SOW' as const, note: `Standard shrink allowance, ${(shrinkAllowance * 100).toFixed(1)}% of the seed issued: seed sorted out before sowing` }] : [],
    };
  });
  return {
    sowingId,
    cropPlanCode: plan.code,
    productionDate: sowDate,
    standardVersion,
    plannedUnits: trays,
    goodUnits: trays,
    sowingsRun: 1,
    servingsProduced: null,
    lots,
    issues,
    crew: [],
    actualLaborHours: null,
    actualLaborRate: null,
    closedBy: null,
    notes: null,
    format: plan.format,
    traysSown: trays,
    traysPacked: trays,
    growUnitKey,
    packedOn: null,
    stageRecords: { ...EMPTY_STAGE_RECORDS, readings: [] },
  };
}

export interface ControlPointCheck {
  point: ControlPointDef;
  status: 'recorded' | 'gap' | 'failed';
  detail: string;
}

export interface SowingRecordChecks {
  points: ControlPointCheck[];
  /** The verdict on the spent-water test where the plan has one; null on a tray plan. */
  spentWater: SpentWaterVerdict | null;
  gaps: string[];
  /** Every applicable control point is recorded and none failed. */
  complete: boolean;
}

/** The record against the control points on the plan's stages: recorded, a gap, or failed. A gap is never a pass. */
export function sowingRecordChecks(records: StageRecords, plan: GrowPlanDef): SowingRecordChecks {
  const points = controlPointsForPlan(plan);
  const hasStage = (k: string) => planStages(plan).some((s) => s.key === k);
  const spentWater = records.spentWaterTest && points.some((p) => p.id === 'spent-water-test') ? evaluateSpentWaterTest(records.spentWaterTest) : null;
  const checks: ControlPointCheck[] = points.map((point) => {
    switch (point.id) {
      case 'seed-sanitation': {
        const t = records.seedTreatment;
        return t && t.method.trim() && t.seedLot.trim()
          ? { point, status: 'recorded', detail: `${t.method}${t.concentration ? `, ${t.concentration}` : ''}${t.contactMinutes !== null ? `, ${t.contactMinutes} min` : ''}, seed lot ${t.seedLot}` }
          : { point, status: 'gap', detail: 'No seed treatment recorded for this sowing.' };
      }
      case 'spent-water-test': {
        if (!records.spentWaterTest) return { point, status: 'gap', detail: 'No spent sprout irrigation water result recorded.' };
        const v = spentWater!;
        return v.pass ? { point, status: 'recorded', detail: v.reason } : v.incomplete ? { point, status: 'gap', detail: v.reason } : { point, status: 'failed', detail: v.reason };
      }
      case 'temperature-humidity': {
        const n = records.readings.filter((r) => r.tempF !== null || r.rhPct !== null).length;
        const onShelf = hasStage('germination') || hasStage('light');
        return n > 0 || !onShelf ? { point, status: 'recorded', detail: `${n} reading${n === 1 ? '' : 's'} on the sowing${CONTROL_POINT_BY_ID['temperature-humidity'].criticalLimit.status === 'PLACEHOLDER' ? '; no band on file, none judged' : ''}` } : { point, status: 'gap', detail: 'No grow-room reading recorded while the trays were on the shelf.' };
      }
      case 'harvest-check': {
        const h = records.harvestCheck;
        return h ? { point, status: 'recorded', detail: `${h.traysPassed} passed, ${h.traysRemoved} removed${h.note ? `: ${h.note}` : ''}` } : { point, status: 'gap', detail: 'No harvest inspection counts on the record.' };
      }
    }
  });
  const gaps = checks.filter((c) => c.status !== 'recorded').map((c) => `${c.point.name}: ${c.detail}`);
  return { points: checks, spentWater, gaps, complete: checks.every((c) => c.status === 'recorded') };
}

export { STAGE_CONTROL_POINTS };
