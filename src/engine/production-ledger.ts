/**
 * MicroFarm — the production sowing as double-entry, at actual cost.
 *
 * Server-side only: it imports the `@/ledger` barrel. This module replaces the
 * four-entry production-day sketch with the chain a facility actually runs, and
 * it posts from the SOWING EXECUTION RECORD only — the ISA-95 production
 * performance object. Planning pages never post.
 *
 * A sowing's seed, medium and nutrient are the quantities its record issued, at the cost of the
 * lots they drew (`lotRegister`), else the plan's price; the light a tray takes
 * and the wear on its tray and the sanitizer are overhead, applied at their standard per tray on
 * the trays SOWN (the grow plan's cost card, `grow-costing.ts`);
 * labor is the record's crew hours at the recorded rate, else the approved standard, split over the
 * three stages by the plan's study, the sowing stream to Sow, the daily stream to Grow, the
 * harvest stream to Pack. Trays removed at the harvest check leave as
 * abnormal spoilage at the cost of the stages they passed.
 *
 * The chain, and the authority for each step:
 *
 *   receipt        Dr Raw Materials, Cr GR/IR, at the price paid
 *                  ASC 330-10-30-1 — purchase price plus freight-in is inventory.
 *                  The case-rounded quantity is inventory on hand and nets against
 *                  the next requirement.
 *   invoice        Dr GR/IR, Cr Accounts Payable
 *   issue          Dr WIP-Sow, Cr Raw Materials: the seed, medium and nutrient issued,
 *                  at the cost of the lots drawn (ASC 330-10-30-9: specific
 *                  identification where the record names the lot, else first in,
 *                  first out).
 *   apply          Dr WIP-Sow (tray wear, sanitizer) and WIP-Grow (light), Cr Variable
 *                  Overhead Applied, at the standard per tray.
 *   labor          Dr WIP-Sow / WIP-Grow / WIP-Pack by stream, Cr Accrued Wages and the
 *                  payroll liabilities: the recorded hours at the recorded rate, the
 *                  approved standard where no crew is recorded.
 *   overhead       Dr WIP-Sow @ normal-capacity rate, Cr Overhead Applied
 *                  ASC 330-10-30-3 — allocation on normal capacity.
 *                  Dr Overhead Control, Cr AP for the fixed overhead actually incurred
 *                  in the sowing's period; Control against Applied is the
 *                  period's under- or over-absorption, which stays in the
 *                  period and closes to the volume variance at period end.
 *   sow -> grow    Dr WIP-Grow, Cr WIP-Sow
 *   grow -> pack   Dr WIP-Pack, Cr WIP-Grow
 *   pack -> FG     Dr Finished Goods, Cr WIP-Pack + Packaging Inventory
 *   abnormal scrap Dr Abnormal Spoilage, Cr the stage it occurred in
 *                  ASC 330-10-30-7 — a current-period charge, never inventory.
 *   shipment       Dr AR, Cr Revenue; Dr COGS by element (materials, labor,
 *                  overhead), Cr Finished Goods
 *                  Distribution is expensed here, not capitalised: ASC 330-10-30-8
 *                  makes selling and distribution costs period costs.
 */

import {
  journalIsBalanced,
  profitAndLoss,
  type JournalEntry,
  type JournalLine,
  type ProfitAndLoss,
  type Account,
} from '@/ledger';

import {
  FARM_COA,
  ACC_RAW_MATERIALS,
  ACC_PACKAGING,
  ACC_WIP_SOW,
  ACC_WIP_GROW,
  ACC_WIP_PACK,
  ACC_FINISHED_GOODS,
  ACC_GRIR,
  ACC_COGS_MATERIALS,
  ACC_COGS_LABOR,
  ACC_COGS_OVERHEAD,
  ACC_OH_CONTROL,
  ACC_OH_APPLIED,
  ACC_VAR_OH_APPLIED,
  ACC_ABNORMAL_SPOILAGE,
  ACC_RESEARCH_DEVELOPMENT,
  ACC_ACCRUED_WAGES,
  ACC_ACCRUED_PAYROLL_TAXES,
  ACC_ACCRUED_WORKERS_COMP,
  ACC_ACCRUED_BENEFITS,
  ACC_AR,
  ACC_FOOD_SALES,
} from '@/data/coa-farm';
import { costPlan } from '@/engine/grow-costing';
import { laborForDay, type OverheadAbsorption } from '@/engine';
import { GRAMS_PER_LB } from '@/data/tray-formats';
import type { GrowPlanDef } from '@/data/grow-plan';
import { purchaseLines } from '@/engine/grow-purchase';
import type { IssueCost } from '@/engine/net-requirements';
import { estimatedTimeStudy } from '@/engine/time-study-estimate';
import { laborStandard, studiesForGrowPlan, summarizeStudy } from '@/engine/time-studies';
import type { TimeStudyDoc } from '@/data/time-studies';
import { splitLoadedLaborCents } from '@/engine/comp';
import { assumptions as defaultAssumptions } from '@/data/plan-data';
import { FARM_HOME } from '@/data/farm-location';
import {
  massBalance,
  classifyScrap,
  issuesOf,
  type ScrapStage,
  type SowingExecution,
  type MassBalance,
} from '@/engine/sowing';
import {
  transformationEvent,
  traceabilityGaps,
  type TransformationEvent,
  type TraceabilityGap,
} from '@/engine/traceability';

const cents = (dollars: number) => Math.round(dollars * 100);

/**
 * A balanced entry from a list of {account, dollars} where positive is a debit. Each leg is
 * rounded to the cent on its own, so the last leg takes the rounding residual and the entry
 * balances to the cent.
 */
function entry(
  id: string,
  date: string,
  description: string,
  legs: Array<{ account: string; dollars: number; memo: string }>,
): JournalEntry {
  const signed = legs.map((l) => ({ ...l, c: cents(l.dollars) })).filter((l) => l.c !== 0);
  const residual = signed.reduce((s, l) => s + l.c, 0);
  if (residual !== 0 && Math.abs(residual) <= signed.length && signed.length > 0) signed[signed.length - 1]!.c -= residual;
  const lines: JournalLine[] = signed
    .filter((l) => l.c !== 0)
    .map((l) => ({ accountCode: l.account, debitCents: l.c > 0 ? l.c : 0, creditCents: l.c < 0 ? -l.c : 0, memo: l.memo }));
  return { id, date, description, lines };
}

/** Cost by element: materials (seed, medium, nutrient and packaging), labor, overhead (variable and fixed). */
export interface CostElements {
  materials: number;
  labor: number;
  overhead: number;
}

export const COST_ELEMENTS = ['materials', 'labor', 'overhead'] as const;

/** The cost of goods sold account each element posts to. */
export const COGS_ACCOUNT: Record<keyof CostElements, string> = {
  materials: ACC_COGS_MATERIALS,
  labor: ACC_COGS_LABOR,
  overhead: ACC_COGS_OVERHEAD,
};

const COGS_MEMO: Record<keyof CostElements, string> = {
  materials: 'Cost of goods sold — materials',
  labor: 'Cost of goods sold — labor',
  overhead: 'Cost of goods sold — overhead',
};

/** The cost of goods sold legs, one per element, and the finished goods credit for their total. */
export function cogsLegs(c: CostElements, memo: string): Array<{ account: string; cents: number; memo: string }> {
  const total = c.materials + c.labor + c.overhead;
  return [
    ...COST_ELEMENTS.map((e) => ({ account: COGS_ACCOUNT[e], cents: c[e], memo: `${COGS_MEMO[e]}, ${memo}` })),
    { account: ACC_FINISHED_GOODS, cents: -total, memo: 'Finished goods relieved' },
  ];
}

export interface ProductionSowingLedger {
  coa: Account[];
  entries: JournalEntry[];
  balanced: boolean;
  pnl: ProfitAndLoss;
  massBalance: MassBalance;
  traceability: TransformationEvent[];
  traceabilityGaps: TraceabilityGap[];
  /** The sowing's weights, grams. */
  weights: {
    seedIssuedG: number;
    harvestedG: number;
    packedG: number;
  };
  amounts: {
    /** Trays sown: the basis of the standard. */
    traysSown: number;
    /** Trays packed: the sowing's output, one count in its format. */
    unitsProduced: number;
    purchaseOrderCost: number;
    /** Seed, medium and nutrient issued, at the cost of the lots drawn. */
    materialIssuedToWip: number;
    /** Standard hours at the standard rate on the trays sown. */
    directLaborStandard: number;
    /** What the labor entry charged: the recorded hours at the recorded rate, else the standard. */
    directLaborActual: number;
    /** Fixed overhead absorbed at the normal-capacity rate. */
    overheadAbsorbed: number;
    /** Light applied to the Grow stage at its standard per tray. */
    lightApplied: number;
    /** Tray wear and sanitizer applied to the Sow stage at their standard per tray. */
    consumablesApplied: number;
    packagingCost: number;
    /** The packed trays' cost: finished goods for a production sowing, Research and Development for an experiment. */
    finishedGoodsCost: number;
    /** What the packed trays carry, by element, cents: the three sum to the pack entry's debit. */
    finishedGoodsByElementCents: CostElements;
    /** Finished-goods cost ÷ units: the cost of one unit. */
    costPerUnit: number;
    unitsShipped: number;
    /** Abnormal spoilage charged to 5910; zero on an experiment, whose loss is research. */
    abnormalSpoilage: number;
    /** An experiment's charge to Research and Development (7920): the packed trays and any loss; zero on a production sowing. */
    researchAndDevelopment: number;
    distributionExpensed: number;
    revenue: number;
    cogs: number;
    /**
     * Fixed overhead incurred in the sowing's period less overhead applied to the sowing.
     * Positive = under-absorbed. Zero unless the caller supplied the period's incurred
     * overhead; the annual volume variance is a period-end computation and never posted here.
     */
    overheadVolume: number;
  };
  /** Statements of fact about how this sowing was costed, for the audit trail. */
  notes: string[];
}

/** One distribution of units to a channel, at that channel's price and revenue account. */
export interface Shipment {
  id: string;
  description: string;
  units: number;
  pricePerUnit: number;
  /** Revenue account: Food Sales (4010) or Restaurant & Events (4200). */
  revenueAccount: string;
}

export interface ProductionLedgerOptions {
  /** Units shipped on the production date. Defaults to the good units. */
  unitsShipped?: number;
  pricePerUnit?: number;
  /**
   * Shipments by channel. When given, replaces the single `unitsShipped` /
   * `pricePerUnit` distribution; each ships at the standard cost per UNIT.
   */
  shipments?: Shipment[];
  /** The assumptions in force (a resolved scenario's, or the plan-data defaults). */
  assumptions?: typeof defaultAssumptions;
  /** Sowings the record covers: fixed labor is per sowing. */
  sowings?: number;
  /** The studies the plan's labor standard is read from, to split labor over the stages; absent, the estimate. */
  studies?: readonly TimeStudyDoc[];
  /** The predetermined rate and the normal capacity it was set on. */
  overhead: OverheadAbsorption;
  /**
   * Fixed manufacturing overhead actually incurred in the sowing's period (the
   * production day's share of the annual budget). Posted to Overhead Control;
   * against Overhead Applied it is the period's under- or over-absorption.
   */
  overheadIncurred?: number;
  /** Pack-rounded purchase cost paid for this sowing's inputs. */
  purchaseOrderCost: number;
  /**
   * True when goods were received through a receipt record that already posted
   * raw materials. The sowing then skips its own receipt and invoice entries and
   * only draws on raw materials.
   */
  receiptRecorded?: boolean;
  /**
   * What the record's issues drew from the lot register (`lotRegister`), by input. Absent,
   * no lot is on hand and every issue is costed at the plan's price.
   */
  issueCosts?: readonly IssueCost[];
  /** Light, tray wear and sanitizer per tray sown as an approved version froze them; absent, the cost card's. */
  variableOverheadPerTray?: { light: number; consumables: number };
  shrinkAllowance?: number;
  /**
   * True when the sowing is an experiment in R&D (`accounting-policy.md` §14): the chain posts as for
   * any sowing, then the packed trays go from the pack stage to Research and Development (7920),
   * never to finished goods, and a loss at any stage goes there too rather than to Abnormal Spoilage.
   * Nothing is shipped.
   */
  experiment?: boolean;
}

/**
 * Post one sowing. Every figure comes from the sowing record, the lots it drew and the
 * cost card; nothing is stored.
 */
export function productionSowingLedger(
  sowing: SowingExecution,
  opts: ProductionLedgerOptions,
  growPlan: GrowPlanDef,
): ProductionSowingLedger {
  const assumptions = opts.assumptions ?? defaultAssumptions;
  const shrink = opts.shrinkAllowance ?? assumptions.yield.shrinkAllowance.value;
  const notes: string[] = [];
  const costing = costPlan(growPlan);
  if (!costing) notes.push(`${growPlan.code} is not a grow plan: it has no cost card per tray, so its material, light and consumables post at zero.`);
  const perTray = costing?.perTray ?? { seed: 0, medium: 0, nutrient: 0, light: 0, consumables: 0, total: 0 };

  const trays = sowing.traysSown;
  const units = sowing.goodUnits;
  const date = sowing.productionDate;
  const std = (perTrayCost: number) => perTrayCost * trays * (1 + shrink);

  // ── Material issued: the quantities the record issued, at the cost of the lots drawn.
  //    Normal shrink is inventoriable: the record issues it with the trays, so it rides into
  //    WIP with the rest. What no lot covered is costed at the plan's price, and named.
  const planLines = new Map((costing ? purchaseLines(growPlan, costing) : []).map((l) => [l.name, l]));
  const drawn = new Map((opts.issueCosts ?? []).map((c) => [c.input, c]));
  const issuedByInput = new Map<string, { qty: number; unit: string }>();
  for (const i of issuesOf(sowing)) {
    const row = issuedByInput.get(i.input) ?? { qty: 0, unit: i.unit };
    row.qty += i.qty;
    issuedByInput.set(i.input, row);
  }
  const materialByInput = new Map<string, number>();
  const atPlanPrice: string[] = [];
  const unpriced: string[] = [];
  for (const [input, { qty, unit }] of issuedByInput) {
    const c = drawn.get(input);
    const uncovered = c ? c.unmatchedQty : qty;
    let dollars = (c?.drawnCents ?? 0) / 100;
    if (uncovered > 1e-9) {
      const price = planLines.get(input)?.unitCost;
      if (price === undefined) unpriced.push(`${input} (${uncovered.toFixed(3)} ${unit})`);
      else {
        dollars += uncovered * price;
        atPlanPrice.push(`${input} (${uncovered.toFixed(3)} ${unit})`);
      }
    }
    materialByInput.set(input, dollars);
  }
  const materialIssued = [...materialByInput.values()].reduce((t, v) => t + v, 0);
  if (atPlanPrice.length > 0) notes.push(`No lot on hand for ${atPlanPrice.join(', ')}: costed at the plan's price.`);
  if (unpriced.length > 0) notes.push(`No lot on hand for ${unpriced.join(', ')}, and no line on ${growPlan.code} prices it: issued at zero.`);
  const lightApplied = std(opts.variableOverheadPerTray?.light ?? perTray.light);
  const consumablesApplied = std(opts.variableOverheadPerTray?.consumables ?? perTray.consumables);

  // ── Labor: the record's crew hours at the recorded rate, else the approved standard on the
  //    trays sown, split over the stages by the plan's study.
  const sowings = opts.sowings ?? 1;
  const labor = laborForDay(sowings, trays, assumptions);
  const directLaborStandard = labor.directLaborCost;
  const study = summarizeStudy(laborStandard(studiesForGrowPlan(opts.studies ?? [], growPlan.code)) ?? estimatedTimeStudy(growPlan, Math.max(1, trays)));
  const streamMinutes = study.sowingLaborMinutes + study.dailyLaborMinutes + study.harvestLaborMinutes;
  const streamShare = streamMinutes > 0
    ? { sow: study.sowingLaborMinutes / streamMinutes, grow: study.dailyLaborMinutes / streamMinutes }
    : { sow: 1, grow: 0 };
  const stdRate = assumptions.labor.blendedLoadedWage.value;
  const laborHours = sowing.actualLaborHours ?? labor.totalLaborHours;
  const laborRate = sowing.actualLaborRate ?? stdRate;
  const directLaborActual = sowing.actualLaborHours === null ? directLaborStandard : laborHours * laborRate;
  if (sowing.actualLaborHours === null) {
    notes.push(`No crew hours on the sowing record: labor posts at the approved standard, ${labor.totalLaborHours.toFixed(2)} hours at $${stdRate.toFixed(2)}.`);
  } else if (sowing.actualLaborRate === null) {
    notes.push(`The crew's hours are recorded without a rate for every person: ${laborHours.toFixed(2)} hours post at the standard rate, $${stdRate.toFixed(2)}.`);
  }
  // Loaded labor is owed as wages, payroll taxes, workers' comp and benefits (Roadmap K5); the
  // stages take exactly what is owed, split by stream.
  const owed = splitLoadedLaborCents(cents(directLaborActual), assumptions.labor.payrollBurden.value);
  const laborC = owed.wagesCents + owed.payrollTaxesCents + owed.workersCompCents + owed.benefitsCents;
  const laborSowC = Math.round(laborC * streamShare.sow);
  const laborGrowC = Math.round(laborC * streamShare.grow);
  const laborPackC = laborC - laborSowC - laborGrowC;

  // ── Overhead applied at the normal-capacity rate, and what the period incurred.
  const overheadAbsorbed = opts.overhead.ratePerUnit * trays;
  const overheadIncurred = opts.overheadIncurred ?? 0;
  const overheadVolume = opts.overheadIncurred !== undefined ? overheadIncurred - overheadAbsorbed : 0;

  // ── Packaging is a product cost on the trays packed; distribution is not.
  const packagingCost = assumptions.perUnit.packaging.value * units;
  const distributionPerUnit = assumptions.perUnit.distribution.value;

  const mb = massBalance(sowing);
  // Seed lost at sowing leaves at what its lot cost a gram; with nothing issued, the plan's price.
  const seedCostPerG = (lot: (typeof sowing.lots)[number]) =>
    lot.seedIssuedG > 0 ? (materialByInput.get(lot.variety) ?? 0) / lot.seedIssuedG : (planLines.get(lot.variety)?.unitCost ?? 0) / GRAMS_PER_LB;

  // ── Abnormal spoilage, valued at the FULLY ABSORBED cost of the stages it
  //    passed: seed lost at sowing is raw material at its lot's price; a gram lost on the
  //    shelves, at the check or after packing carries the cost of each stage it
  //    passed, spread over the standard harvest grams (and packaging once packed).
  //    An abnormal reason is abnormal in full; a normal reason is abnormal for the
  //    grams beyond the lot's shrink allowance.
  const stdHarvestG = (costing?.harvestGramsPerTray ?? 0) * trays;
  const perG = (dollars: number, g: number) => (g > 0 ? dollars / g : 0);
  const sowStage = materialIssued + consumablesApplied + laborSowC / 100 + overheadAbsorbed;
  const growStage = lightApplied + laborGrowC / 100;
  const packStage = laborPackC / 100;
  const costPerG: Record<Exclude<ScrapStage, 'SOW'>, number> = {
    GROW: perG(sowStage + growStage, stdHarvestG),
    PACK: perG(sowStage + growStage + packStage, stdHarvestG),
    FINISHED: perG(sowStage + growStage + packStage, stdHarvestG) + perG(packagingCost, (costing?.harvestGramsPerTray ?? 0) * units),
  };
  const stageAccount: Record<ScrapStage, string> = { SOW: ACC_WIP_SOW, GROW: ACC_WIP_GROW, PACK: ACC_WIP_PACK, FINISHED: ACC_FINISHED_GOODS };
  // Each stage's cost by element, for the element split of what spoilage takes out.
  const sowV: CostElements = { materials: materialIssued, labor: laborSowC / 100, overhead: consumablesApplied + overheadAbsorbed };
  const growV: CostElements = { ...sowV, labor: sowV.labor + laborGrowC / 100, overhead: sowV.overhead + lightApplied };
  const packV: CostElements = { ...growV, labor: growV.labor + laborPackC / 100 };
  const abnormalByElement: CostElements = { materials: 0, labor: 0, overhead: 0 };
  const takeOut = (v: CostElements, g: number) => {
    for (const e of COST_ELEMENTS) abnormalByElement[e] += g * perG(v[e], stdHarvestG);
  };
  let abnormalSpoilage = 0;
  const abnormalByStage = new Map<string, number>();
  const stagesHit = new Set<ScrapStage>();
  for (const lot of sowing.lots) {
    for (const k of classifyScrap(lot)) {
      if (k.abnormalG <= 0) continue;
      const st = k.event.stage;
      stagesHit.add(st);
      const value = k.abnormalG * (st === 'SOW' ? seedCostPerG(lot) : costPerG[st]);
      abnormalSpoilage += value;
      if (st === 'SOW') abnormalByElement.materials += value;
      else {
        takeOut(st === 'GROW' ? growV : packV, k.abnormalG);
        if (st === 'FINISHED') abnormalByElement.materials += k.abnormalG * perG(packagingCost, (costing?.harvestGramsPerTray ?? 0) * units);
      }
      abnormalByStage.set(stageAccount[st], (abnormalByStage.get(stageAccount[st]) ?? 0) + value);
    }
  }
  if (stagesHit.size > 0) {
    notes.push(
      `Abnormal spoilage is valued at the fully absorbed cost of the stages it passed: ${[...stagesHit].map((st) => (st === 'SOW' ? "SOW at the seed lot's price" : `${st} $${(costPerG[st] * 1000).toFixed(2)}/kg`)).join(', ')} (material, overhead applied and labor over the standard harvest${stagesHit.has('FINISHED') ? ', and packaging once packed' : ''}).`,
    );
  }

  // ── The chain.
  const entries: JournalEntry[] = [];

  if (!opts.receiptRecorded) entries.push(
    entry(`${sowing.sowingId}-RECV`, date, 'Receive purchased inputs at the price paid', [
      { account: ACC_RAW_MATERIALS, dollars: opts.purchaseOrderCost, memo: 'Raw materials at the price paid, case-rounded quantity' },
      { account: ACC_GRIR, dollars: -opts.purchaseOrderCost, memo: 'Goods received not invoiced' },
    ]),
  );

  if (!opts.receiptRecorded) entries.push(
    entry(`${sowing.sowingId}-INV`, date, 'Vendor invoice clears goods received', [
      { account: ACC_GRIR, dollars: opts.purchaseOrderCost, memo: 'Clear goods received not invoiced' },
      { account: '2010', dollars: -opts.purchaseOrderCost, memo: 'Accounts payable' },
    ]),
  );

  // Packaging is received into its own inventory before the pack stage draws
  // on it; without this receipt the packaging account would carry a credit
  // balance — an asset that reads as negative stock. A grow plan whose picked
  // packaging has no cost entered posts nothing here: zero legs are dropped.
  entries.push(
    entry(`${sowing.sowingId}-PKG-RECV`, date, 'Receive packaging at standard cost', [
      { account: ACC_PACKAGING, dollars: packagingCost, memo: `The grow plan's picked packaging for ${units.toLocaleString()} units` },
      { account: '2010', dollars: -packagingCost, memo: 'Accounts payable' },
    ]),
  );

  entries.push(
    entry(`${sowing.sowingId}-ISSUE`, date, 'Issue seed, medium and nutrient to the sow stage at the cost of the lots drawn', [
      { account: ACC_WIP_SOW, dollars: materialIssued, memo: `Material issued for ${trays} trays sown, normal shrink included` },
      { account: ACC_RAW_MATERIALS, dollars: -materialIssued, memo: 'Raw materials relieved' },
    ]),
  );

  entries.push(
    entry(`${sowing.sowingId}-APPLY`, date, 'Apply light, tray wear and sanitizer at the standard per tray', [
      { account: ACC_WIP_SOW, dollars: consumablesApplied, memo: `Tray wear and sanitizer, ${trays} trays sown` },
      { account: ACC_WIP_GROW, dollars: lightApplied, memo: `Light over the cycle, ${trays} trays sown` },
      { account: ACC_VAR_OH_APPLIED, dollars: -(consumablesApplied + lightApplied), memo: 'Variable manufacturing overhead applied' },
    ]),
  );

  const line = (account: string, c: number, memo: string): JournalLine => ({
    accountCode: account,
    debitCents: c > 0 ? c : 0,
    creditCents: c < 0 ? -c : 0,
    memo,
  });
  entries.push({
    id: `${sowing.sowingId}-LABOR`,
    date,
    description: 'Direct labor into work in process by stream',
    lines: [
      line(ACC_WIP_SOW, laborSowC, `Sowing stream: ${laborHours.toFixed(2)} hours in all at $${laborRate.toFixed(2)}${sowing.actualLaborHours === null ? ', the approved standard' : ' as recorded'}`),
      line(ACC_WIP_GROW, laborGrowC, 'Daily stream over the cycle'),
      line(ACC_WIP_PACK, laborPackC, 'Harvest stream'),
      line(ACC_ACCRUED_WAGES, -owed.wagesCents, 'Accrued wages'),
      line(ACC_ACCRUED_PAYROLL_TAXES, -owed.payrollTaxesCents, 'Employer FICA, FUTA and SUTA on the wages'),
      line(ACC_ACCRUED_WORKERS_COMP, -owed.workersCompCents, "Workers' comp premium on the wages"),
      line(ACC_ACCRUED_BENEFITS, -owed.benefitsCents, 'Burden over the statutory rates, as benefits'),
    ].filter((l) => l.debitCents > 0 || l.creditCents > 0),
  });

  entries.push(
    entry(`${sowing.sowingId}-OH`, date, 'Absorb fixed manufacturing overhead at the normal-capacity rate', [
      { account: ACC_WIP_SOW, dollars: overheadAbsorbed, memo: `$${opts.overhead.ratePerUnit.toFixed(4)}/tray x ${trays.toLocaleString()} trays sown; rate set on ${Math.round(opts.overhead.normalCapacityUnits).toLocaleString()} trays of normal capacity` },
      { account: ACC_OH_APPLIED, dollars: -overheadAbsorbed, memo: 'Manufacturing overhead applied' },
    ]),
  );

  if (opts.overheadIncurred !== undefined) {
    entries.push(
      entry(`${sowing.sowingId}-OH-INCURRED`, date, 'Fixed manufacturing overhead incurred in the period', [
        { account: ACC_OH_CONTROL, dollars: overheadIncurred, memo: 'Occupancy, utilities and depreciation of the production fit-out for the production day' },
        { account: '2010', dollars: -overheadIncurred, memo: 'Accounts payable / accruals' },
      ]),
    );
    notes.push(
      `Fixed manufacturing overhead incurred for the period is $${Math.round(overheadIncurred).toLocaleString()} against $${Math.round(overheadAbsorbed).toLocaleString()} applied to ${trays.toLocaleString()} trays at $${opts.overhead.ratePerUnit.toFixed(4)}/tray, so $${Math.round(Math.abs(overheadVolume)).toLocaleString()} is ${overheadVolume >= 0 ? 'under-absorbed and stays in the period' : 'over-absorbed and reduces the period’s cost'}. Neither figure is carried in inventory beyond the applied rate.`,
    );
  }

  // ── The stage transfers are built in CENTS from the cents already posted to
  //    each stage, so every stage clears to exactly zero.
  const abnormalC = (acct: string) => cents(abnormalByStage.get(acct) ?? 0);
  const sowStageC = cents(materialIssued) + cents(consumablesApplied) + laborSowC + cents(overheadAbsorbed) - abnormalC(ACC_WIP_SOW);
  entries.push({
    id: `${sowing.sowingId}-XFER-GROW`,
    date,
    description: 'Transfer the sown trays to the grow stage',
    lines: [line(ACC_WIP_GROW, sowStageC, 'Trays on the shelves'), line(ACC_WIP_SOW, -sowStageC, 'Sow stage relieved')].filter((l) => l.debitCents > 0 || l.creditCents > 0),
  });

  const growStageC = sowStageC + cents(lightApplied) + laborGrowC - abnormalC(ACC_WIP_GROW);
  entries.push({
    id: `${sowing.sowingId}-XFER-PACK`,
    date,
    description: 'Transfer the harvested trays to the pack stage',
    lines: [line(ACC_WIP_PACK, growStageC, 'Harvested trays to packing'), line(ACC_WIP_GROW, -growStageC, 'Grow stage relieved')].filter((l) => l.debitCents > 0 || l.creditCents > 0),
  });

  // An experiment's loss goes to Research and Development. Its packed trays go there whole, so a
  // loss after packing is already in that charge and relieves nothing.
  const experiment = opts.experiment === true;
  const lossRelieved = [...abnormalByStage.entries()].filter(([acct]) => !(experiment && acct === ACC_FINISHED_GOODS));
  const lossCharged = lossRelieved.reduce((t, [, v]) => t + v, 0);
  if (lossCharged > 0) {
    entries.push(
      entry(`${sowing.sowingId}-SPOIL`, date, experiment ? 'Experiment loss charged to research and development' : 'Abnormal spoilage charged to the period', [
        ...lossRelieved.map(([acct, v]) => ({
          account: acct,
          dollars: -v,
          memo: experiment ? 'Stage relieved of the loss' : 'Stage relieved of abnormal loss',
        })),
        // Last, so the rounding residual lands on the expense and every stage clears.
        experiment
          ? { account: ACC_RESEARCH_DEVELOPMENT, dollars: lossCharged, memo: 'ASC 730-10-25-1 — research and development is expensed as incurred' }
          : { account: ACC_ABNORMAL_SPOILAGE, dollars: lossCharged, memo: 'ASC 330-10-30-7 — abnormal waste is a current-period charge' },
      ]),
    );
  }

  // Finished goods receives exactly what the pack stage and the packaging
  // store were charged, leg by leg.
  const packStageC = growStageC + laborPackC - abnormalC(ACC_WIP_PACK);
  const packagingC = cents(packagingCost);
  const fgDebitCents = packStageC + packagingC;
  const finishedGoodsCost = fgDebitCents / 100;
  // Finished goods by element: each element's cents charged, less its share of the spoilage; the
  // rounding residual lands on the largest element so the three sum to the finished goods debit.
  const fgByElement: CostElements = {
    materials: cents(materialIssued) + packagingC - cents(abnormalByElement.materials),
    labor: laborC - cents(abnormalByElement.labor),
    overhead: cents(consumablesApplied) + cents(overheadAbsorbed) + cents(lightApplied) - cents(abnormalByElement.overhead),
  };
  const residualC = fgDebitCents - (fgByElement.materials + fgByElement.labor + fgByElement.overhead);
  const largest = COST_ELEMENTS.reduce((a, b) => (fgByElement[b] > fgByElement[a] ? b : a));
  fgByElement[largest] += residualC;
  entries.push({
    id: `${sowing.sowingId}-FG`,
    date,
    description: experiment ? "Charge the experiment's packed trays to research and development" : 'Pack and receive finished trays into finished goods',
    lines: [
      line(experiment ? ACC_RESEARCH_DEVELOPMENT : ACC_FINISHED_GOODS, fgDebitCents, experiment ? `${units.toLocaleString()} trays packed; ASC 730-10-25-1, never inventory` : `${units.toLocaleString()} trays packed`),
      line(ACC_WIP_PACK, -packStageC, 'Pack stage relieved'),
      line(ACC_PACKAGING, -packagingC, "The plan's packaging"),
    ].filter((l) => l.debitCents > 0 || l.creditCents > 0),
  });

  const costPerUnit = units > 0 ? finishedGoodsCost / units : 0;
  // No price, no revenue (Roadmap N9): the shipment posts cost of goods sold and names the gap.
  if (!experiment && opts.shipments === undefined && opts.pricePerUnit === undefined && (opts.unitsShipped ?? units) > 0) {
    notes.push('No price per unit was given for the shipment: revenue is not posted for it.');
  }
  const shipments: Shipment[] = experiment ? [] : opts.shipments !== undefined ? opts.shipments : [
    {
      id: 'SHIP',
      description: 'Distribute units to pickup points — revenue and cost of goods sold',
      units: opts.unitsShipped ?? units,
      pricePerUnit: opts.pricePerUnit ?? 0,
      revenueAccount: ACC_FOOD_SALES,
    },
  ];
  const shipped = shipments.reduce((s, x) => s + x.units, 0);
  const revenue = shipments.reduce((s, x) => s + x.units * x.pricePerUnit, 0);
  const distributionExpensed = shipped * distributionPerUnit;

  // Finished goods are relieved by element at the sowing's cost per unit, in cents, with the
  // last shipment of a fully shipped run taking what is left so the account clears to exactly
  // zero rather than to a stray cent.
  const fullyShipped = shipped === units;
  let cogsCents = 0;
  const relieved: CostElements = { materials: 0, labor: 0, overhead: 0 };
  shipments.forEach((x, idx) => {
    const isLast = idx === shipments.length - 1;
    const take = {} as CostElements;
    for (const e of COST_ELEMENTS) {
      take[e] = fullyShipped && isLast ? fgByElement[e] - relieved[e] : units > 0 ? Math.round((x.units * fgByElement[e]) / units) : 0;
      relieved[e] += take[e];
    }
    cogsCents += take.materials + take.labor + take.overhead;
    const revenueCents = cents(x.units * x.pricePerUnit);
    const legs = [
      { account: ACC_AR, cents: revenueCents, memo: 'Accounts receivable' },
      { account: x.revenueAccount, cents: -revenueCents, memo: `${x.units.toLocaleString()} units at $${x.pricePerUnit.toFixed(2)}` },
      ...cogsLegs(take, `${x.units.toLocaleString()} units at $${costPerUnit.toFixed(4)}`),
    ];
    entries.push({
      id: `${sowing.sowingId}-${x.id}`,
      date,
      description: x.description,
      lines: legs.filter((l) => l.cents !== 0).map((l) => line(l.account, l.cents, l.memo)),
    });
  });
  const cogs = cogsCents / 100;

  entries.push(
    entry(`${sowing.sowingId}-DELIV`, date, 'Distribution to pickup points — a period cost, not inventory', [
      { account: '7900', dollars: distributionExpensed, memo: 'ASC 330-10-30-8 — selling and distribution costs are never inventoriable' },
      { account: '2010', dollars: -distributionExpensed, memo: 'Accounts payable / own fleet accrual' },
    ]),
  );

  // ── Traceability: one transformation event per variety lot, from the same issues the
  //    issue entry posted. The medium and nutrient went into every tray, so each lot's event
  //    carries them in the lot's share of the seed.
  const seedTotalG = sowing.lots.reduce((t, l) => t + l.seedIssuedG, 0);
  const traceability: TransformationEvent[] = sowing.lots.map((l) => {
    const lotShare = seedTotalG > 0 ? l.seedIssuedG / seedTotalG : 1 / Math.max(1, sowing.lots.length);
    return transformationEvent({
      sowingId: sowing.sowingId,
      component: l.variety,
      outputLotCode: l.outputLotCode || `${sowing.sowingId}-${l.varietyKey}`,
      outputQty: l.packedG,
      outputUnit: 'g',
      eventDate: date,
      location: FARM_HOME.name ?? 'Austin facility',
      inputs: [
        { input: l.variety, inputLotCode: l.seedLotCode, qty: l.seedIssuedG, unit: 'g', onFoodTraceabilityList: l.onFoodTraceabilityList },
        ...sowing.issues.map((i) => ({ input: i.input, inputLotCode: i.lotCode, qty: i.qty * lotShare, unit: i.unit, onFoodTraceabilityList: false })),
      ],
    });
  });

  const coa = FARM_COA;
  const posted = entries.filter((e) => e.lines.length > 0);
  return {
    coa,
    entries: posted,
    balanced: journalIsBalanced(posted),
    pnl: profitAndLoss(coa, posted, date, date),
    massBalance: mb,
    traceability,
    traceabilityGaps: traceabilityGaps(traceability),
    weights: {
      seedIssuedG: mb.totalSeedIssuedG,
      harvestedG: mb.totalHarvestedG,
      packedG: mb.totalPackedG,
    },
    amounts: {
      traysSown: trays,
      unitsProduced: units,
      purchaseOrderCost: opts.purchaseOrderCost,
      materialIssuedToWip: materialIssued,
      directLaborStandard,
      directLaborActual,
      overheadAbsorbed,
      lightApplied,
      consumablesApplied,
      packagingCost,
      finishedGoodsCost,
      finishedGoodsByElementCents: fgByElement,
      costPerUnit,
      unitsShipped: shipped,
      abnormalSpoilage: experiment ? 0 : abnormalSpoilage,
      researchAndDevelopment: experiment ? fgDebitCents / 100 + lossCharged : 0,
      distributionExpensed,
      revenue,
      cogs,
      overheadVolume,
    },
    notes,
  };
}
