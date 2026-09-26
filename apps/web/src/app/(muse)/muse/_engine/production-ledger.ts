/**
 * Impact OS — the production batch as double-entry, at standard cost.
 *
 * Server-side only: it imports the `@ct/ledger` barrel. This module replaces the
 * four-entry production-day sketch with the chain a commissary actually runs, and
 * it posts from the BATCH EXECUTION RECORD only — the ISA-95 production
 * performance object. Planning pages never post.
 *
 * The chain, and the authority for each step:
 *
 *   receipt        Dr Raw Materials @ standard, Dr/Cr PPV, Cr GR/IR
 *                  ASC 330-10-30-1 — purchase price plus freight-in is inventory.
 *                  Case-rounding is NOT a variance: the over-ordered quantity is
 *                  inventory on hand and nets against the next requirement.
 *   invoice        Dr GR/IR, Cr Accounts Payable
 *   issue          Dr WIP-Cook (hot) / WIP-Pack (cold), Cr Raw Materials
 *                  Usage beyond standard -> Material Usage Variance.
 *   labor          Dr WIP-Cook @ standard, Cr Accrued Wages @ actual,
 *                  difference split into rate and efficiency variances.
 *   overhead       Dr WIP-Cook @ normal-capacity rate, Cr Overhead Applied
 *                  ASC 330-10-30-3 — allocation on normal capacity.
 *                  Dr Overhead Control, Cr AP for the overhead actually incurred
 *                  in the batch's period; Control against Applied is the
 *                  period's under- or over-absorption, which stays in the
 *                  period (never in the bowl) and closes to the volume
 *                  variance at period end.
 *   cook -> chill  Dr WIP-Chill, Cr WIP-Cook
 *   chill -> pack  Dr WIP-Pack, Cr WIP-Chill
 *   pack -> FG     Dr Finished Goods, Cr WIP-Pack + Packaging Inventory
 *   abnormal scrap Dr Abnormal Spoilage, Cr the stage it occurred in
 *                  ASC 330-10-30-7 — a current-period charge, never inventory.
 *   shipment       Dr AR, Cr Revenue; Dr COGS, Cr Finished Goods
 *                  Delivery is expensed here, not capitalised: ASC 330-10-30-8
 *                  makes selling and distribution costs period costs.
 */

import {
  journalIsBalanced,
  profitAndLoss,
  type JournalEntry,
  type JournalLine,
  type ProfitAndLoss,
  type Account,
} from '@ct/ledger';

import {
  MUSE_COA,
  ACC_RAW_MATERIALS,
  ACC_PACKAGING,
  ACC_WIP_COOK,
  ACC_WIP_CHILL,
  ACC_WIP_PACK,
  ACC_FINISHED_GOODS,
  ACC_GRIR,
  ACC_COGS,
  ACC_PPV,
  ACC_MATERIAL_USAGE_VAR,
  ACC_LABOR_RATE_VAR,
  ACC_LABOR_EFFICIENCY_VAR,
  ACC_OH_CONTROL,
  ACC_OH_APPLIED,
  ACC_ABNORMAL_SPOILAGE,
  ACC_ACCRUED_WAGES,
  ACC_ACCRUED_PAYROLL_TAXES,
  ACC_ACCRUED_WORKERS_COMP,
  ACC_ACCRUED_BENEFITS,
  ACC_AR,
  ACC_FOOD_SALES,
} from '../_data/coa-muse';
import { componentCosting, laborForDay, type ComponentCosting, type OverheadAbsorption } from './index';
import { splitLoadedLaborCents } from './comp';
import {
  assumptions as defaultAssumptions,
  recipe as defaultRecipe,
  componentSpecs,
} from '../_data/plan-data';
import { MUSE_HOME } from '../_data/muse-location';
import {
  massBalance,
  classifyScrap,
  type ScrapStage,
  type BatchExecution,
  type MassBalance,
} from './batch';
import {
  transformationEvent,
  traceabilityLotCode,
  traceabilityGaps,
  type TransformationEvent,
  type TraceabilityGap,
} from './traceability';

const cents = (dollars: number) => Math.round(dollars * 100);
const OZ_PER_LB = 16;

/** A balanced entry from a list of {account, dollars} where positive is a debit. */
function entry(
  id: string,
  date: string,
  description: string,
  legs: Array<{ account: string; dollars: number; memo: string }>,
): JournalEntry {
  const lines: JournalLine[] = legs
    .filter((l) => Math.abs(cents(l.dollars)) > 0)
    .map((l) => ({
      accountCode: l.account,
      debitCents: l.dollars > 0 ? cents(l.dollars) : 0,
      creditCents: l.dollars < 0 ? cents(-l.dollars) : 0,
      memo: l.memo,
    }));
  return { id, date, description, lines };
}

export interface VarianceSummary {
  purchasePrice: number;
  materialUsage: number;
  laborRate: number;
  laborEfficiency: number;
  /**
   * Fixed overhead incurred in the batch's period less overhead applied to the
   * batch. Positive = under-absorbed. A PERIOD figure, so it is zero unless the
   * caller supplied the period's incurred overhead; the annual volume variance
   * is a period-end computation (`absorbOverhead`) and is never posted here.
   */
  overheadVolume: number;
  /**
   * Sum of the BATCH variances — purchase price, material usage, labor rate and
   * efficiency. Positive is unfavourable. The overhead figure above is a period
   * figure and is dispositioned at period end, so it is reported beside this
   * total, not inside it.
   */
  net: number;
  /** Net batch variance as a share of standard COGS for the batch. */
  shareOfStandardCogs: number;
  /**
   * ASC 330-10-30-12/13: a material net variance prorates across ending raw
   * materials, WIP, finished goods and COGS; an immaterial one goes wholly to COGS.
   */
  disposition: 'PRORATE' | 'TO_COGS';
}

export interface ProductionBatchLedger {
  coa: Account[];
  entries: JournalEntry[];
  balanced: boolean;
  pnl: ProfitAndLoss;
  massBalance: MassBalance;
  traceability: TransformationEvent[];
  traceabilityGaps: TraceabilityGap[];
  /** Stage weights for the batch, lb — what Production Planning was missing. */
  weights: {
    purchasedLb: number;
    issuedLb: number;
    cookedLb: number;
    chilledLb: number;
    packedLb: number;
  };
  amounts: {
    /** Base-portion equivalents the record produced. */
    portionsProduced: number;
    /** Meals those portions became (conversion-cost basis). */
    mealsProduced: number;
    purchaseOrderCost: number;
    standardMaterialCost: number;
    materialIssuedToWip: number;
    directLaborStandard: number;
    directLaborActual: number;
    overheadAbsorbed: number;
    packagingCost: number;
    finishedGoodsCost: number;
    /** Finished-goods cost ÷ meals: the standard cost of one MEAL. */
    standardCostPerPortion: number;
    mealsShipped: number;
    abnormalSpoilage: number;
    deliveryExpensed: number;
    revenue: number;
    cogs: number;
  };
  variances: VarianceSummary;
  /** Statements of fact about how this batch was costed, for the audit trail. */
  notes: string[];
}

/** One delivery of meals to a channel, at that channel's price and revenue account. */
export interface Shipment {
  id: string;
  description: string;
  meals: number;
  pricePerMeal: number;
  /** Revenue account: Food Sales (4010) or Catering & Events (4200). */
  revenueAccount: string;
}

export interface ProductionLedgerOptions {
  /** Portions shipped on the production date. Defaults to the good portions. */
  portionsShipped?: number;
  pricePerMeal?: number;
  /**
   * Shipments by channel. When given, replaces the single `portionsShipped` /
   * `pricePerMeal` delivery; each ships at the standard cost per MEAL.
   */
  shipments?: Shipment[];
  /**
   * Meals the batch's portions became. The batch record counts BASE-PORTION
   * equivalents (material and chilled mass scale with them); conversion costs
   * — variable labor, packaging, overhead — scale with meals, because a 1.5×
   * bowl is assembled, packed and overheaded once. Defaults to the portions.
   */
  mealsProduced?: number;
  /** The assumptions in force (a resolved scenario's, or the plan-data defaults). */
  assumptions?: typeof defaultAssumptions;
  /**
   * Chiller batches the record covers. Fixed labor is per batch, so a record
   * that spans a whole production day must say how many batches it ran.
   */
  batches?: number;
  /** The predetermined rate and the normal capacity it was set on. */
  overhead: OverheadAbsorption;
  /**
   * Fixed manufacturing overhead actually incurred in the batch's period (the
   * production day's share of the annual budget). Posted to Overhead Control;
   * against Overhead Applied it is the period's under- or over-absorption.
   */
  overheadIncurred?: number;
  /** Case-rounded purchase cost actually committed for this batch. */
  purchaseOrderCost: number;
  /**
   * True when goods were received through a receipt record that already posted
   * raw materials and the purchase price variance. The batch then skips its own
   * receipt and invoice entries and only draws on raw materials.
   */
  receiptRecorded?: boolean;
  /** Actual invoice value, when it differs from the purchase order at standard. */
  actualInvoiceCost?: number;
  shrinkAllowance?: number;
}

/**
 * Post one batch. Every figure comes from the batch record and the standard cost
 * card; nothing is stored.
 */
export function productionBatchLedger(
  batch: BatchExecution,
  opts: ProductionLedgerOptions,
  recipe = defaultRecipe,
): ProductionBatchLedger {
  const assumptions = opts.assumptions ?? defaultAssumptions;
  const shrink = opts.shrinkAllowance ?? assumptions.yield.shrinkAllowance.value;
  const components: ComponentCosting[] = componentCosting(recipe, shrink);
  const byName = new Map(components.map((c) => [c.name, c]));
  const hotNames = new Set(componentSpecs.filter((s) => s.isHot).map((s) => s.name));

  const portions = batch.goodPortions;
  const meals = opts.mealsProduced ?? portions;
  const date = batch.productionDate;
  const notes: string[] = [];

  // ── Standard material cost, split hot / cold. Normal shrink is inventoriable:
  //    it is inside the standard, so it rides into WIP with the rest.
  const stdCost = (c: ComponentCosting) => c.costPerPortion * portions * (1 + shrink);
  const hotComponents = components.filter((c) => hotNames.has(c.name));
  const coldComponents = components.filter((c) => !hotNames.has(c.name));
  const hotMaterial = hotComponents.reduce((s, c) => s + stdCost(c), 0);
  const coldMaterial = coldComponents.reduce((s, c) => s + stdCost(c), 0);
  const standardMaterialCost = hotMaterial + coldMaterial;

  // ── Labor at standard, and the actual if the batch recorded one. Fixed
  //    labor is per chiller batch, variable per portion.
  const batches = opts.batches ?? 1;
  const std = laborForDay(batches, meals, assumptions);
  const directLaborStandard = std.directLaborCost;
  const stdRate = assumptions.labor.blendedLoadedWage.value;
  const actualHours = batch.actualLaborHours ?? std.totalLaborHours;
  const actualRate = batch.actualLaborRate ?? stdRate;
  const directLaborActual = actualHours * actualRate;
  const laborRateVariance = (actualRate - stdRate) * actualHours;
  const laborEfficiencyVariance = (actualHours - std.totalLaborHours) * stdRate;
  if (batch.actualLaborHours === null) {
    notes.push(
      'No actual labor hours on the batch record, so labor posts at standard and both labor variances are zero. The time study is an estimate, not an observation.',
    );
  }

  // ── Overhead applied at the normal-capacity rate, and what the period incurred.
  const overheadAbsorbed = opts.overhead.ratePerMeal * meals;
  const overheadIncurred = opts.overheadIncurred ?? 0;
  const overheadVolume = opts.overheadIncurred !== undefined ? overheadIncurred - overheadAbsorbed : 0;

  // ── Packaging is a product cost; delivery is not.
  const packagingCost = assumptions.perMeal.packaging.value * meals;
  const deliveryPerMeal = assumptions.perMeal.delivery.value;

  // ── Purchase price variance. Case-rounding is a quantity difference, not this.
  const invoice = opts.actualInvoiceCost ?? opts.purchaseOrderCost;
  const purchasePriceVariance = invoice - opts.purchaseOrderCost;

  // ── Material usage variance from the batch's actual issue against standard,
  //    kept per stream so each is relieved from the stage it was issued to.
  const mb = massBalance(batch);
  let hotUsageVariance = 0;
  let coldUsageVariance = 0;
  for (const c of batch.components) {
    const card = byName.get(c.component);
    if (!card) continue;
    // The standard issue carries the shrink allowance — the quantity the run
    // bought for — so a record issued at standard has no usage variance.
    const standardIssuedLb = (card.apOz * portions * (1 + shrink)) / OZ_PER_LB;
    const stdPricePerLb = card.apCostPerLb ?? 0;
    const v = (c.apIssuedLb - standardIssuedLb) * stdPricePerLb;
    if (hotNames.has(c.component)) hotUsageVariance += v;
    else coldUsageVariance += v;
  }
  const materialUsageVariance = hotUsageVariance + coldUsageVariance;

  // ── Abnormal spoilage, valued at the FULLY ABSORBED cost of the stage it
  //    left (Roadmap J7): the component's material per lb at that stage plus
  //    the conversion cost per lb the stage carries — direct labor and
  //    absorbed overhead, spread over the standard mass in the stage (and
  //    packaging once packed). An abnormal reason is abnormal in full; a
  //    normal reason is abnormal for the pounds beyond the component's shrink
  //    allowance. Scrap before the kettle (PREP) is raw material at purchase
  //    cost and carries no conversion; it is relieved from the stage it was
  //    issued to.
  const lbOf = (oz: number) => (oz * portions) / OZ_PER_LB;
  const hotCookedLb = hotComponents.reduce((s, c) => s + lbOf(c.cookedOz), 0);
  const hotChilledLb = hotComponents.reduce((s, c) => s + lbOf(c.chilledOz), 0);
  const coldLb = coldComponents.reduce((s, c) => s + lbOf(c.platedOz), 0);
  const conversion = directLaborStandard + overheadAbsorbed;
  const perLb = (dollars: number, lb: number) => (lb > 0 ? dollars / lb : 0);
  const conversionPerLb: Record<ScrapStage, number> = {
    PREP: 0,
    COOK: perLb(conversion, hotCookedLb),
    CHILL: perLb(conversion, hotChilledLb),
    PACK: perLb(conversion, hotChilledLb + coldLb),
    FINISHED: perLb(conversion + packagingCost, hotChilledLb + coldLb),
  };
  let abnormalSpoilage = 0;
  const abnormalByStage = new Map<string, number>();
  const stagesHit = new Set<ScrapStage>();
  for (const c of batch.components) {
    const card = byName.get(c.component);
    if (!card) continue;
    const issueAccount = hotNames.has(c.component) ? ACC_WIP_COOK : ACC_WIP_PACK;
    const materialPerLb = (stage: ScrapStage) => (stage === 'PREP' ? (card.apCostPerLb ?? 0) : (card.cookedCostPerLb ?? card.apCostPerLb ?? 0));
    for (const k of classifyScrap(c)) {
      if (k.abnormalLb <= 0) continue;
      const s = k.event;
      stagesHit.add(s.stage);
      const value = k.abnormalLb * (materialPerLb(s.stage) + conversionPerLb[s.stage]);
      abnormalSpoilage += value;
      const acct =
        s.stage === 'PREP'
          ? issueAccount
          : s.stage === 'COOK'
            ? ACC_WIP_COOK
            : s.stage === 'CHILL'
              ? ACC_WIP_CHILL
              : s.stage === 'PACK'
                ? ACC_WIP_PACK
                : ACC_FINISHED_GOODS;
      abnormalByStage.set(acct, (abnormalByStage.get(acct) ?? 0) + value);
    }
  }

  if (stagesHit.size > 0) {
    notes.push(
      `Abnormal spoilage is valued at the fully absorbed cost of the stage it left: material per lb plus conversion of ${[...stagesHit].map((st) => `${st} $${conversionPerLb[st].toFixed(2)}/lb`).join(', ')} (labor and absorbed overhead${stagesHit.has('FINISHED') ? ', and packaging once packed' : ''} over the standard mass in the stage).`,
    );
  }

  // ── The chain.
  const entries: JournalEntry[] = [];

  if (!opts.receiptRecorded) entries.push(
    entry(`${batch.batchId}-RECV`, date, 'Receive purchased ingredients at standard cost', [
      { account: ACC_RAW_MATERIALS, dollars: opts.purchaseOrderCost, memo: 'Raw materials at standard, case-rounded quantity' },
      { account: ACC_PPV, dollars: purchasePriceVariance, memo: 'Purchase price variance' },
      { account: ACC_GRIR, dollars: -invoice, memo: 'Goods received not invoiced' },
    ]),
  );

  if (!opts.receiptRecorded) entries.push(
    entry(`${batch.batchId}-INV`, date, 'Vendor invoice clears goods received', [
      { account: ACC_GRIR, dollars: invoice, memo: 'Clear goods received not invoiced' },
      { account: '2010', dollars: -invoice, memo: 'Accounts payable' },
    ]),
  );

  // Packaging is received into its own inventory before the pack stage draws
  // on it; without this receipt the packaging account would carry a credit
  // balance — an asset that reads as negative stock. A recipe whose picked
  // packaging has no cost entered posts nothing here: zero legs are dropped.
  entries.push(
    entry(`${batch.batchId}-PKG-RECV`, date, 'Receive packaging at standard cost', [
      { account: ACC_PACKAGING, dollars: packagingCost, memo: `The recipe's picked packaging for ${meals.toLocaleString()} meals` },
      { account: '2010', dollars: -packagingCost, memo: 'Accounts payable' },
    ]),
  );

  entries.push(
    entry(
      `${batch.batchId}-ISSUE-HOT`,
      date,
      'Issue hot components to the cook stage',
      [
        { account: ACC_WIP_COOK, dollars: hotMaterial, memo: `Material at standard for ${portions} portions, incl. ${(shrink * 100).toFixed(1)}% normal shrink` },
        { account: ACC_MATERIAL_USAGE_VAR, dollars: hotUsageVariance, memo: 'Material usage variance at standard price' },
        { account: ACC_RAW_MATERIALS, dollars: -(hotMaterial + hotUsageVariance), memo: 'Raw materials relieved' },
      ],
    ),
  );

  entries.push(
    entry(`${batch.batchId}-ISSUE-COLD`, date, 'Issue cold-packed components to the pack stage', [
      { account: ACC_WIP_PACK, dollars: coldMaterial, memo: 'Cheese and tortilla — never enter cook or chill' },
      { account: ACC_MATERIAL_USAGE_VAR, dollars: coldUsageVariance, memo: 'Material usage variance at standard price' },
      { account: ACC_RAW_MATERIALS, dollars: -(coldMaterial + coldUsageVariance), memo: 'Raw materials relieved' },
    ]),
  );

  // Loaded labor at actual is owed as wages, payroll taxes, workers' comp and
  // benefits (Roadmap K5); the split is built in cents so it sums to the total.
  const owed = splitLoadedLaborCents(cents(directLaborActual), assumptions.labor.payrollBurden.value);
  entries.push(
    entry(`${batch.batchId}-LABOR`, date, 'Direct labor — standard into work in process, actual accrued', [
      { account: ACC_WIP_COOK, dollars: directLaborStandard, memo: `${std.totalLaborHours.toFixed(2)} standard hours at $${stdRate.toFixed(2)}` },
      { account: ACC_LABOR_RATE_VAR, dollars: laborRateVariance, memo: 'Labor rate variance' },
      { account: ACC_LABOR_EFFICIENCY_VAR, dollars: laborEfficiencyVariance, memo: 'Labor efficiency variance' },
      { account: ACC_ACCRUED_WAGES, dollars: -owed.wagesCents / 100, memo: 'Accrued wages at actual' },
      { account: ACC_ACCRUED_PAYROLL_TAXES, dollars: -owed.payrollTaxesCents / 100, memo: 'Employer FICA, FUTA and SUTA on the wages' },
      { account: ACC_ACCRUED_WORKERS_COMP, dollars: -owed.workersCompCents / 100, memo: "Workers' comp premium on the wages" },
      { account: ACC_ACCRUED_BENEFITS, dollars: -owed.benefitsCents / 100, memo: 'Burden over the statutory rates, as benefits' },
    ]),
  );

  entries.push(
    entry(`${batch.batchId}-OH`, date, 'Absorb fixed manufacturing overhead at the normal-capacity rate', [
      { account: ACC_WIP_COOK, dollars: overheadAbsorbed, memo: `$${opts.overhead.ratePerMeal.toFixed(4)}/meal x ${meals.toLocaleString()} meals; rate set on ${Math.round(opts.overhead.normalCapacityMeals).toLocaleString()} meals of normal capacity` },
      { account: ACC_OH_APPLIED, dollars: -overheadAbsorbed, memo: 'Manufacturing overhead applied' },
    ]),
  );

  if (opts.overheadIncurred !== undefined) {
    entries.push(
      entry(`${batch.batchId}-OH-INCURRED`, date, 'Fixed manufacturing overhead incurred in the period', [
        { account: ACC_OH_CONTROL, dollars: overheadIncurred, memo: 'Occupancy, utilities and depreciation of the production fit-out for the production day' },
        { account: '2010', dollars: -overheadIncurred, memo: 'Accounts payable / accruals' },
      ]),
    );
    notes.push(
      `Fixed manufacturing overhead incurred for the period is $${Math.round(overheadIncurred).toLocaleString()} against $${Math.round(overheadAbsorbed).toLocaleString()} applied to ${meals.toLocaleString()} meals at $${opts.overhead.ratePerMeal.toFixed(4)}/meal, so $${Math.round(Math.abs(overheadVolume)).toLocaleString()} is ${overheadVolume >= 0 ? 'under-absorbed and stays in the period' : 'over-absorbed and reduces the period’s cost'}. Neither figure is carried in inventory beyond the applied rate.`,
    );
  }

  // ── The stage transfers are built in CENTS from the cents already posted to
  //    each stage, so every stage clears to exactly zero. Rounding a float total
  //    once can differ from the sum of its separately rounded legs by a cent,
  //    which would sit in a stage account as inventory that does not exist.
  const line = (account: string, c: number, memo: string): JournalLine => ({
    accountCode: account,
    debitCents: c > 0 ? c : 0,
    creditCents: c < 0 ? -c : 0,
    memo,
  });
  const abnormalCookC = cents(abnormalByStage.get(ACC_WIP_COOK) ?? 0);
  const abnormalChillC = cents(abnormalByStage.get(ACC_WIP_CHILL) ?? 0);
  const abnormalPackC = cents(abnormalByStage.get(ACC_WIP_PACK) ?? 0);
  const cookStageC =
    cents(hotMaterial) + cents(directLaborStandard) + cents(overheadAbsorbed) - abnormalCookC;
  entries.push({
    id: `${batch.batchId}-XFER-CHILL`,
    date,
    description: 'Transfer cooked components to the chill stage',
    lines: [
      line(ACC_WIP_CHILL, cookStageC, 'Cooked components, blast chill'),
      line(ACC_WIP_COOK, -cookStageC, 'Cook stage relieved'),
    ].filter((l) => l.debitCents > 0 || l.creditCents > 0),
  });

  const chillStageC = cookStageC - abnormalChillC;
  entries.push({
    id: `${batch.batchId}-XFER-PACK`,
    date,
    description: 'Transfer blast-chilled components to the pack stage',
    lines: [
      line(ACC_WIP_PACK, chillStageC, 'Chilled components released to assembly'),
      line(ACC_WIP_CHILL, -chillStageC, 'Chill stage relieved'),
    ].filter((l) => l.debitCents > 0 || l.creditCents > 0),
  });

  if (abnormalSpoilage > 0) {
    entries.push(
      entry(`${batch.batchId}-SPOIL`, date, 'Abnormal spoilage charged to the period', [
        { account: ACC_ABNORMAL_SPOILAGE, dollars: abnormalSpoilage, memo: 'ASC 330-10-30-7 — abnormal wasted material is a current-period charge' },
        ...[...abnormalByStage.entries()].map(([acct, v]) => ({
          account: acct,
          dollars: -v,
          memo: 'Stage relieved of abnormal loss',
        })),
      ]),
    );
  }

  // Finished goods receives exactly what the pack stage and the packaging
  // store were charged, leg by leg.
  const packChillC = chillStageC - abnormalPackC;
  const coldMaterialC = cents(coldMaterial);
  const packagingC = cents(packagingCost);
  const fgDebitCents = packChillC + coldMaterialC + packagingC;
  const finishedGoodsCost = fgDebitCents / 100;
  entries.push({
    id: `${batch.batchId}-FG`,
    date,
    description: 'Pack and receive finished meals into finished goods',
    lines: [
      line(ACC_FINISHED_GOODS, fgDebitCents, `${meals.toLocaleString()} meals at standard`),
      line(ACC_WIP_PACK, -packChillC, 'Pack stage relieved — chilled components'),
      line(ACC_WIP_PACK, -coldMaterialC, 'Pack stage relieved — cold-packed components'),
      line(ACC_PACKAGING, -packagingC, 'Bowl, lid, label'),
    ].filter((l) => l.debitCents > 0 || l.creditCents > 0),
  });

  const standardCostPerPortion = meals > 0 ? finishedGoodsCost / meals : 0;
  // No price, no revenue (Roadmap N9): the shipment posts cost of goods sold and names the gap.
  if (opts.shipments === undefined && opts.pricePerMeal === undefined && (opts.portionsShipped ?? meals) > 0) {
    notes.push('No price per meal was given for the shipment: revenue is not posted for it.');
  }
  const shipments: Shipment[] = opts.shipments !== undefined ? opts.shipments : [
    {
      id: 'SHIP',
      description: 'Deliver meals to sites — revenue and cost of goods sold',
      meals: opts.portionsShipped ?? meals,
      pricePerMeal: opts.pricePerMeal ?? 0,
      revenueAccount: ACC_FOOD_SALES,
    },
  ];
  const shipped = shipments.reduce((s, x) => s + x.meals, 0);
  const revenue = shipments.reduce((s, x) => s + x.meals * x.pricePerMeal, 0);
  const deliveryExpensed = shipped * deliveryPerMeal;

  // Finished goods are relieved at standard per meal, in cents, with the last
  // shipment of a fully shipped run taking the rounding residual so the account
  // clears to exactly zero rather than to a stray cent.
  const fullyShipped = shipped === meals;
  let cogsCents = 0;
  let relievedCents = 0;
  shipments.forEach((x, idx) => {
    const isLast = idx === shipments.length - 1;
    const lineCogsCents =
      fullyShipped && isLast
        ? fgDebitCents - relievedCents
        : cents(x.meals * standardCostPerPortion);
    relievedCents += lineCogsCents;
    cogsCents += lineCogsCents;
    const revenueCents = cents(x.meals * x.pricePerMeal);
    entries.push({
      id: `${batch.batchId}-${x.id}`,
      date,
      description: x.description,
      lines: [
        { accountCode: ACC_AR, debitCents: revenueCents, creditCents: 0, memo: 'Accounts receivable' },
        { accountCode: x.revenueAccount, debitCents: 0, creditCents: revenueCents, memo: `${x.meals.toLocaleString()} meals at $${x.pricePerMeal.toFixed(2)}` },
        { accountCode: ACC_COGS, debitCents: lineCogsCents, creditCents: 0, memo: `${x.meals.toLocaleString()} meals at $${standardCostPerPortion.toFixed(4)} standard` },
        { accountCode: ACC_FINISHED_GOODS, debitCents: 0, creditCents: lineCogsCents, memo: 'Finished goods relieved' },
      ].filter((l) => l.debitCents > 0 || l.creditCents > 0),
    });
  });
  const cogs = cogsCents / 100;

  entries.push(
    entry(`${batch.batchId}-DELIV`, date, 'Delivery to sites — a period cost, not inventory', [
      { account: '7900', dollars: deliveryExpensed, memo: 'ASC 330-10-30-8 — selling and distribution costs are never inventoriable' },
      { account: '2010', dollars: -deliveryExpensed, memo: 'Accounts payable / own fleet accrual' },
    ]),
  );

  // ── Traceability: emitted from the same consumption the issue entries posted.
  const traceability: TransformationEvent[] = batch.components.map((c, idx) =>
    transformationEvent({
      batchId: batch.batchId,
      component: c.component,
      outputLotCode:
        c.outputLotCode ||
        traceabilityLotCode('AMK', batch.recipeCode, date, c.component, idx + 1),
      outputQty: c.packedLb,
      outputUnit: 'lb',
      eventDate: date,
      location: MUSE_HOME.name ?? 'Austin commissary',
      inputs: c.consumed.map((l) => ({
        ingredient: l.ingredient,
        inputLotCode: l.inputLotCode,
        qty: l.qty,
        unit: l.unit,
        onFoodTraceabilityList: l.onFoodTraceabilityList,
      })),
    }),
  );

  const netVariance =
    purchasePriceVariance +
    materialUsageVariance +
    laborRateVariance +
    laborEfficiencyVariance;
  const standardCogs = cogs || finishedGoodsCost;
  const share = standardCogs > 0 ? Math.abs(netVariance) / standardCogs : 0;

  const coa = MUSE_COA;
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
      purchasedLb: mb.totalApIssuedLb,
      issuedLb: mb.totalApIssuedLb,
      // Mass at the cook stage: what entered the kettle plus the cook delta. A
      // cold-packed component is never cooked, so its weight here is its issue
      // less scrap taken before the kettle. Chilled mass counts only what enters
      // the cabinet — the gap between the two is the cheese and the tortilla,
      // not a loss.
      cookedLb: mb.components.reduce((s, c) => s + (c.apIssuedLb - c.prepScrapLb + c.cookDeltaLb), 0),
      chilledLb: batch.components.reduce((s, c) => s + (c.chilledLb ?? 0), 0),
      packedLb: mb.totalPackedLb,
    },
    amounts: {
      portionsProduced: portions,
      mealsProduced: meals,
      purchaseOrderCost: opts.purchaseOrderCost,
      standardMaterialCost,
      materialIssuedToWip: hotMaterial + coldMaterial,
      directLaborStandard,
      directLaborActual,
      overheadAbsorbed,
      packagingCost,
      finishedGoodsCost,
      standardCostPerPortion,
      mealsShipped: shipped,
      abnormalSpoilage,
      deliveryExpensed,
      revenue,
      cogs,
    },
    variances: {
      purchasePrice: purchasePriceVariance,
      materialUsage: materialUsageVariance,
      laborRate: laborRateVariance,
      laborEfficiency: laborEfficiencyVariance,
      overheadVolume,
      net: netVariance,
      shareOfStandardCogs: share,
      disposition:
        share > assumptions.standardCost.varianceProrationThreshold.value ? 'PRORATE' : 'TO_COGS',
    },
    notes,
  };
}
