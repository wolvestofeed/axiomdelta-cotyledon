/**
 * MicroFarm — FSMA 204 traceability, emitted by the consumption journal.
 *
 * 21 CFR Part 1 subpart S treats a grow facility as a TRANSFORMATION
 * critical tracking event: the traceability lot codes and quantities of every
 * input, and the new lot code, quantity and unit of the output. That is the same
 * data as the material consumption entry which relieves raw materials and charges
 * work in process. Captured once, posted twice — to the ledger and to the
 * traceability record.
 *
 * Compliance date: originally 2026-01-20. FDA published a proposed extension to
 * 2028-07-20 on 2025-08-07 (90 FR, docket FDA-2022-N-0083). Treated here as the
 * planning date; the status is carried as a field so it can be corrected without
 * touching logic.
 */

export const FSMA_204_PLANNING_COMPLIANCE_DATE = '2028-07-20';
export const FSMA_204_STATUS =
  'Original compliance date 2026-01-20; FDA proposed a 30-month extension to 2028-07-20 (published 2025-08-07). Confirm final status before relying on the later date.';

/** The critical tracking events a facility performs. */
export type CriticalTrackingEvent =
  | 'RECEIVING'
  | 'TRANSFORMATION'
  | 'SHIPPING';

/**
 * FDA Food Traceability List categories relevant to this menu. A line is in
 * scope when its food falls on the list; cheeses (other than hard cheeses) and
 * fresh leafy greens are the ones this crop plan touches.
 */
export const FOOD_TRACEABILITY_LIST_CATEGORIES = [
  'Cheeses, other than hard cheeses',
  'Shell eggs',
  'Nut butters',
  'Cucumbers (fresh)',
  'Herbs (fresh)',
  'Leafy greens (fresh)',
  'Melons (fresh)',
  'Peppers (fresh)',
  'Sprouts (fresh)',
  'Tomatoes (fresh)',
  'Tropical tree fruits (fresh)',
  'Fruits and vegetables (fresh-cut)',
  'Finfish',
  'Crustaceans',
  'Molluscan shellfish, bivalves',
  'Ready-to-eat deli salads',
] as const;

export interface KeyDataElements {
  /** Traceability lot code. GS1-128 AI (10) is the carrier. */
  traceabilityLotCode: string;
  /** ISO 8601 date of the event. */
  eventDate: string;
  quantity: number;
  unitOfMeasure: string;
  /** Where the lot code was assigned — the facility, for a transformation. */
  lotCodeGeneratorLocation: string;
  productDescription: string;
}

export interface TransformationEvent {
  cte: 'TRANSFORMATION';
  /** Lot codes and quantities of every input consumed. */
  inputs: KeyDataElements[];
  /** The new lot the transformation created. */
  output: KeyDataElements;
  /** The sowing that performed it — the link back to cost and to the stage record. */
  sowingId: string;
  referenceDocument: string;
  /** Inputs on the Food Traceability List, which is what puts the event in scope. */
  ftlInputs: string[];
  inScope: boolean;
}

/**
 * GS1-128-compatible traceability lot code.
 * Format: `<plant>-<crop plan>-<YYMMDD>-<component>-<seq>`. Deterministic, so the
 * ledger, the cooling log and the traceability record all name the same lot.
 */
export function traceabilityLotCode(
  plantCode: string,
  cropPlanCode: string,
  productionDate: string,
  component: string,
  sequence: number,
): string {
  const ymd = productionDate.replaceAll('-', '').slice(2);
  const slug = component
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 6);
  return `${plantCode}-${cropPlanCode}-${ymd}-${slug}-${String(sequence).padStart(2, '0')}`;
}

export interface TransformationInput {
  input: string;
  inputLotCode: string;
  qty: number;
  unit: string;
  onFoodTraceabilityList: boolean;
}

/**
 * Build the transformation CTE for one component of one sowing. Called from the
 * consumption journal so the two cannot drift: if a pound was relieved from
 * inventory it appears here, and if it appears here it was relieved.
 */
export function transformationEvent(args: {
  sowingId: string;
  component: string;
  outputLotCode: string;
  outputQty: number;
  outputUnit: string;
  eventDate: string;
  location: string;
  inputs: readonly TransformationInput[];
}): TransformationEvent {
  const ftl = args.inputs.filter((i) => i.onFoodTraceabilityList).map((i) => i.input);
  return {
    cte: 'TRANSFORMATION',
    sowingId: args.sowingId,
    referenceDocument: `Sowing record ${args.sowingId}`,
    inputs: args.inputs.map((i) => ({
      traceabilityLotCode: i.inputLotCode,
      eventDate: args.eventDate,
      quantity: i.qty,
      unitOfMeasure: i.unit,
      lotCodeGeneratorLocation: 'supplier — as received',
      productDescription: i.input,
    })),
    output: {
      traceabilityLotCode: args.outputLotCode,
      eventDate: args.eventDate,
      quantity: args.outputQty,
      unitOfMeasure: args.outputUnit,
      lotCodeGeneratorLocation: args.location,
      productDescription: args.component,
    },
    ftlInputs: ftl,
    inScope: ftl.length > 0,
  };
}

export interface TraceabilityGap {
  sowingId: string;
  component: string;
  input: string;
  reason: string;
}

/**
 * Inputs with no recorded lot code. A transformation event that cannot name its
 * input lots cannot support a recall, so the gap is reported rather than filled
 * with a placeholder that would read as a record.
 */
export function traceabilityGaps(events: readonly TransformationEvent[]): TraceabilityGap[] {
  const gaps: TraceabilityGap[] = [];
  for (const e of events) {
    for (const i of e.inputs) {
      if (!i.traceabilityLotCode || i.traceabilityLotCode === 'not recorded') {
        gaps.push({
          sowingId: e.sowingId,
          component: e.output.productDescription,
          input: i.productDescription,
          reason: 'No input traceability lot code recorded; this input cannot be traced back one step.',
        });
      }
    }
  }
  return gaps;
}
