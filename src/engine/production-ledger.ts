/**
 * MicroFarm — the production sowing as double-entry, at standard cost.
 *
 * Server-side only: it imports the `@/ledger` barrel. This module replaces the
 * four-entry production-day sketch with the chain a facility actually runs, and
 * it posts from the SOWING EXECUTION RECORD only — the ISA-95 production
 * performance object. Planning pages never post.
 *
 * The chain, and the authority for each step:
 *
 *   receipt        Dr Raw Materials @ standard, Dr/Cr PPV, Cr GR/IR
 *                  ASC 330-10-30-1 — purchase price plus freight-in is inventory.
 *                  Case-rounding is NOT a variance: the over-ordered quantity is
 *                  inventory on hand and nets against the next requirement.
 *   invoice        Dr GR/IR, Cr Accounts Payable
 *   issue          Dr WIP-sow (hot) / WIP-Pack (cold), Cr Raw Materials
 *                  Usage beyond standard -> Material Usage Variance.
 *   labor          Dr WIP-sow @ standard, Cr Accrued Wages @ actual,
 *                  difference split into rate and efficiency variances.
 *   overhead       Dr WIP-sow @ normal-capacity rate, Cr Overhead Applied
 *                  ASC 330-10-30-3 — allocation on normal capacity.
 *                  Dr Overhead Control, Cr SEED for the overhead actually incurred
 *                  in the sowing's period; Control against Applied is the
 *                  period's under- or over-absorption, which stays in the
 *                  period (never in the bowl) and closes to the volume
 *                  variance at period end.
 *   sow -> blackout  Dr WIP-blackout, Cr WIP-sow
 *   blackout -> pack  Dr WIP-Pack, Cr WIP-blackout
 *   pack -> FG     Dr Finished Goods, Cr WIP-Pack + Packaging Inventory
 *   abnormal scrap Dr Abnormal Spoilage, Cr the stage it occurred in
 *                  ASC 330-10-30-7 — a current-period charge, never inventory.
 *   shipment       Dr AR, Cr Revenue; Dr COGS, Cr Finished Goods
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
  ACC_WIP_BLACKOUT,
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
} from '@/data/coa-farm';
import { componentCosting, laborForDay, type ComponentCosting, type OverheadAbsorption } from '@/engine';
import { splitLoadedLaborCents } from '@/engine/comp';
import {
  assumptions as defaultAssumptions,
  cropPlan as defaultCropPlan,
  componentSpecs,
} from '@/data/plan-data';
import { FARM_HOME } from '@/data/farm-location';
import {
  massBalance,
  classifyScrap,
  type ScrapStage,
  type SowingExecution,
  type MassBalance,
} from '@/engine/sowing';
import {
  transformationEvent,
  traceabilityLotCode,
  traceabilityGaps,
  type TransformationEvent,
  type TraceabilityGap,
} from '@/engine/traceability';

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
   * Fixed overhead incurred in the sowing's period less overhead applied to the
   * sowing. Positive = under-absorbed. A PERIOD figure, so it is zero unless the
   * caller supplied the period's incurred overhead; the annual volume variance
   * is a period-end computation (`absorbOverhead`) and is never posted here.
   */
  overheadVolume: number;
  /**
   * Sum of the SOWING variances — purchase price, material usage, labor rate and
   * efficiency. Positive is unfavourable. The overhead figure above is a period
   * figure and is dispositioned at period end, so it is reported beside this
   * total, not inside it.
   */
  net: number;
  /** Net sowing variance as a share of standard COGS for the sowing. */
  shareOfStandardCogs: number;
  /**
   * ASC 330-10-30-12/13: a material net variance prorates across ending raw
   * materials, WIP, finished goods and COGS; an immaterial one goes wholly to COGS.
   */
  disposition: 'PRORATE' | 'TO_COGS';
}

export interface ProductionSowingLedger {
  coa: Account[];
  entries: JournalEntry[];
  balanced: boolean;
  pnl: ProfitAndLoss;
  massBalance: MassBalance;
  traceability: TransformationEvent[];
  traceabilityGaps: TraceabilityGap[];
  /** Stage weights for the sowing, lb — what Production Planning was missing. */
  weights: {
    purchasedLb: number;
    issuedLb: number;
    harvestedLb: number;
    blackoutLb: number;
    packedLb: number;
  };
  amounts: {
    /** Base-unit equivalents the record produced. */
    unitsProduced: number;
    /** Units those units became (conversion-cost basis). */
    servingsProduced: number;
    purchaseOrderCost: number;
    standardMaterialCost: number;
    materialIssuedToWip: number;
    directLaborStandard: number;
    directLaborActual: number;
    overheadAbsorbed: number;
    packagingCost: number;
    finishedGoodsCost: number;
    /** Finished-goods cost ÷ units: the standard cost of one UNIT. */
    standardCostPerUnit: number;
    unitsShipped: number;
    abnormalSpoilage: number;
    distributionExpensed: number;
    revenue: number;
    cogs: number;
  };
  variances: VarianceSummary;
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
  /**
   * Units the sowing's units became. The sowing record counts BASE-unit
   * equivalents (material and canopy mass scale with them); conversion costs
   * — variable labor, packaging, overhead — scale with units, because a 1.5×
   * bowl is assembled, packed and overheaded once. Defaults to the units.
   */
  servingsProduced?: number;
  /** The assumptions in force (a resolved scenario's, or the plan-data defaults). */
  assumptions?: typeof defaultAssumptions;
  /**
   * Blackout rack sowings the record covers. Fixed labor is per sowing, so a record
   * that spans a whole production day must say how many sowings it ran.
   */
  sowings?: number;
  /** The predetermined rate and the normal capacity it was set on. */
  overhead: OverheadAbsorption;
  /**
   * Fixed manufacturing overhead actually incurred in the sowing's period (the
   * production day's share of the annual budget). Posted to Overhead Control;
   * against Overhead Applied it is the period's under- or over-absorption.
   */
  overheadIncurred?: number;
  /** Case-rounded purchase cost actually committed for this sowing. */
  purchaseOrderCost: number;
  /**
   * True when goods were received through a receipt record that already posted
   * raw materials and the purchase price variance. The sowing then skips its own
   * receipt and invoice entries and only draws on raw materials.
   */
  receiptRecorded?: boolean;
  /** Actual invoice value, when it differs from the purchase order at standard. */
  actualInvoiceCost?: number;
  shrinkAllowance?: number;
}

/**
 * Post one sowing. Every figure comes from the sowing record and the standard cost
 * card; nothing is stored.
 */
export function productionSowingLedger(
  sowing: SowingExecution,
  opts: ProductionLedgerOptions,
  cropPlan = defaultCropPlan,
): ProductionSowingLedger {
  const assumptions = opts.assumptions ?? defaultAssumptions;
  const shrink = opts.shrinkAllowance ?? assumptions.yield.shrinkAllowance.value;
  const components: ComponentCosting[] = componentCosting(cropPlan, shrink);
  const byName = new Map(components.map((c) => [c.name, c]));
  const hotNames = new Set(componentSpecs.filter((s) => s.isHot).map((s) => s.name));

  const units = sowing.goodUnits;
  const servings = opts.servingsProduced ?? units;
  const date = sowing.productionDate;
  const notes: string[] = [];

  // ── Standard material cost, split hot / cold. Normal shrink is inventoriable:
  //    it is inside the standard, so it rides into WIP with the rest.
  const stdCost = (c: ComponentCosting) => c.costPerUnit * units * (1 + shrink);
  const hotComponents = components.filter((c) => hotNames.has(c.name));
  const coldComponents = components.filter((c) => !hotNames.has(c.name));
  const hotMaterial = hotComponents.reduce((s, c) => s + stdCost(c), 0);
  const coldMaterial = coldComponents.reduce((s, c) => s + stdCost(c), 0);
  const standardMaterialCost = hotMaterial + coldMaterial;

  // ── Labor at standard, and the actual if the sowing recorded one. Fixed
  //    labor is per blackout rack sowing, variable per unit.
  const sowings = opts.sowings ?? 1;
  const std = laborForDay(sowings, units, assumptions);
  const directLaborStandard = std.directLaborCost;
  const stdRate = assumptions.labor.blendedLoadedWage.value;
  const actualHours = sowing.actualLaborHours ?? std.totalLaborHours;
  const actualRate = sowing.actualLaborRate ?? stdRate;
  const directLaborActual = actualHours * actualRate;
  const laborRateVariance = (actualRate - stdRate) * actualHours;
  const laborEfficiencyVariance = (actualHours - std.totalLaborHours) * stdRate;
  if (sowing.actualLaborHours === null) {
    notes.push(
      'No actual labor hours on the sowing record, so labor posts at standard and both labor variances are zero. The time study is an estimate, not an observation.',
    );
  }

  // ── Overhead applied at the normal-capacity rate, and what the period incurred.
  const overheadAbsorbed = opts.overhead.ratePerUnit * units;
  const overheadIncurred = opts.overheadIncurred ?? 0;
  const overheadVolume = opts.overheadIncurred !== undefined ? overheadIncurred - overheadAbsorbed : 0;

  // ── Packaging is a product cost; distribution is not.
  const packagingCost = assumptions.perUnit.packaging.value * units;
  const distributionPerUnit = assumptions.perUnit.distribution.value;

  // ── Purchase price variance. Case-rounding is a quantity difference, not this.
  const invoice = opts.actualInvoiceCost ?? opts.purchaseOrderCost;
  const purchasePriceVariance = invoice - opts.purchaseOrderCost;

  // ── Material usage variance from the sowing's actual issue against standard,
  //    kept per stream so each is relieved from the stage it was issued to.
  const mb = massBalance(sowing);
  let hotUsageVariance = 0;
  let coldUsageVariance = 0;
  for (const c of sowing.components) {
    const card = byName.get(c.component);
    if (!card) continue;
    // The standard issue carries the shrink allowance — the quantity the run
    // bought for — so a record issued at standard has no usage variance.
    const standardIssuedLb = (card.seedOz * units * (1 + shrink)) / OZ_PER_LB;
    const stdPricePerLb = card.seedCostPerLb ?? 0;
    const v = (c.seedIssuedLb - standardIssuedLb) * stdPricePerLb;
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
  //    allowance. Scrap before the sprouting rack (PREP) is raw material at purchase
  //    cost and carries no conversion; it is relieved from the stage it was
  //    issued to.
  const lbOf = (oz: number) => (oz * units) / OZ_PER_LB;
  const hotHarvestedLb = hotComponents.reduce((s, c) => s + lbOf(c.harvestedOz), 0);
  const hotBlackoutLb = hotComponents.reduce((s, c) => s + lbOf(c.blackoutOz), 0);
  const coldLb = coldComponents.reduce((s, c) => s + lbOf(c.packedOz), 0);
  const conversion = directLaborStandard + overheadAbsorbed;
  const perLb = (dollars: number, lb: number) => (lb > 0 ? dollars / lb : 0);
  const conversionPerLb: Record<ScrapStage, number> = {
    PREP: 0,
    SOW: perLb(conversion, hotHarvestedLb),
    BLACKOUT: perLb(conversion, hotBlackoutLb),
    PACK: perLb(conversion, hotBlackoutLb + coldLb),
    FINISHED: perLb(conversion + packagingCost, hotBlackoutLb + coldLb),
  };
  let abnormalSpoilage = 0;
  const abnormalByStage = new Map<string, number>();
  const stagesHit = new Set<ScrapStage>();
  for (const c of sowing.components) {
    const card = byName.get(c.component);
    if (!card) continue;
    const issueAccount = hotNames.has(c.component) ? ACC_WIP_SOW : ACC_WIP_PACK;
    const materialPerLb = (stage: ScrapStage) => (stage === 'PREP' ? (card.seedCostPerLb ?? 0) : (card.harvestedCostPerLb ?? card.seedCostPerLb ?? 0));
    for (const k of classifyScrap(c)) {
      if (k.abnormalLb <= 0) continue;
      const s = k.event;
      stagesHit.add(s.stage);
      const value = k.abnormalLb * (materialPerLb(s.stage) + conversionPerLb[s.stage]);
      abnormalSpoilage += value;
      const acct =
        s.stage === 'PREP'
          ? issueAccount
          : s.stage === 'SOW'
            ? ACC_WIP_SOW
            : s.stage === 'BLACKOUT'
              ? ACC_WIP_BLACKOUT
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
    entry(`${sowing.sowingId}-RECV`, date, 'Receive purchased inputs at standard cost', [
      { account: ACC_RAW_MATERIALS, dollars: opts.purchaseOrderCost, memo: 'Raw materials at standard, case-rounded quantity' },
      { account: ACC_PPV, dollars: purchasePriceVariance, memo: 'Purchase price variance' },
      { account: ACC_GRIR, dollars: -invoice, memo: 'Goods received not invoiced' },
    ]),
  );

  if (!opts.receiptRecorded) entries.push(
    entry(`${sowing.sowingId}-INV`, date, 'Vendor invoice clears goods received', [
      { account: ACC_GRIR, dollars: invoice, memo: 'Clear goods received not invoiced' },
      { account: '2010', dollars: -invoice, memo: 'Accounts payable' },
    ]),
  );

  // Packaging is received into its own inventory before the pack stage draws
  // on it; without this receipt the packaging account would carry a credit
  // balance — an asset that reads as negative stock. A crop plan whose picked
  // packaging has no cost entered posts nothing here: zero legs are dropped.
  entries.push(
    entry(`${sowing.sowingId}-PKG-RECV`, date, 'Receive packaging at standard cost', [
      { account: ACC_PACKAGING, dollars: packagingCost, memo: `The crop plan's picked packaging for ${units.toLocaleString()} units` },
      { account: '2010', dollars: -packagingCost, memo: 'Accounts payable' },
    ]),
  );

  entries.push(
    entry(
      `${sowing.sowingId}-ISSUE-HOT`,
      date,
      'Issue hot components to the sow stage',
      [
        { account: ACC_WIP_SOW, dollars: hotMaterial, memo: `Material at standard for ${units} units, incl. ${(shrink * 100).toFixed(1)}% normal shrink` },
        { account: ACC_MATERIAL_USAGE_VAR, dollars: hotUsageVariance, memo: 'Material usage variance at standard price' },
        { account: ACC_RAW_MATERIALS, dollars: -(hotMaterial + hotUsageVariance), memo: 'Raw materials relieved' },
      ],
    ),
  );

  entries.push(
    entry(`${sowing.sowingId}-ISSUE-COLD`, date, 'Issue cold-packed components to the pack stage', [
      { account: ACC_WIP_PACK, dollars: coldMaterial, memo: 'Cheese and tortilla — never enter sow or blackout' },
      { account: ACC_MATERIAL_USAGE_VAR, dollars: coldUsageVariance, memo: 'Material usage variance at standard price' },
      { account: ACC_RAW_MATERIALS, dollars: -(coldMaterial + coldUsageVariance), memo: 'Raw materials relieved' },
    ]),
  );

  // Loaded labor at actual is owed as wages, payroll taxes, workers' comp and
  // benefits (Roadmap K5); the split is built in cents so it sums to the total.
  const owed = splitLoadedLaborCents(cents(directLaborActual), assumptions.labor.payrollBurden.value);
  entries.push(
    entry(`${sowing.sowingId}-LABOR`, date, 'Direct labor — standard into work in process, actual accrued', [
      { account: ACC_WIP_SOW, dollars: directLaborStandard, memo: `${std.totalLaborHours.toFixed(2)} standard hours at $${stdRate.toFixed(2)}` },
      { account: ACC_LABOR_RATE_VAR, dollars: laborRateVariance, memo: 'Labor rate variance' },
      { account: ACC_LABOR_EFFICIENCY_VAR, dollars: laborEfficiencyVariance, memo: 'Labor efficiency variance' },
      { account: ACC_ACCRUED_WAGES, dollars: -owed.wagesCents / 100, memo: 'Accrued wages at actual' },
      { account: ACC_ACCRUED_PAYROLL_TAXES, dollars: -owed.payrollTaxesCents / 100, memo: 'Employer FICA, FUTA and SUTA on the wages' },
      { account: ACC_ACCRUED_WORKERS_COMP, dollars: -owed.workersCompCents / 100, memo: "Workers' comp premium on the wages" },
      { account: ACC_ACCRUED_BENEFITS, dollars: -owed.benefitsCents / 100, memo: 'Burden over the statutory rates, as benefits' },
    ]),
  );

  entries.push(
    entry(`${sowing.sowingId}-OH`, date, 'Absorb fixed manufacturing overhead at the normal-capacity rate', [
      { account: ACC_WIP_SOW, dollars: overheadAbsorbed, memo: `$${opts.overhead.ratePerUnit.toFixed(4)}/unit x ${units.toLocaleString()} units; rate set on ${Math.round(opts.overhead.normalCapacityUnits).toLocaleString()} units of normal capacity` },
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
      `Fixed manufacturing overhead incurred for the period is $${Math.round(overheadIncurred).toLocaleString()} against $${Math.round(overheadAbsorbed).toLocaleString()} applied to ${units.toLocaleString()} units at $${opts.overhead.ratePerUnit.toFixed(4)}/unit, so $${Math.round(Math.abs(overheadVolume)).toLocaleString()} is ${overheadVolume >= 0 ? 'under-absorbed and stays in the period' : 'over-absorbed and reduces the period’s cost'}. Neither figure is carried in inventory beyond the applied rate.`,
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
  const abnormalSowC = cents(abnormalByStage.get(ACC_WIP_SOW) ?? 0);
  const abnormalBlackoutC = cents(abnormalByStage.get(ACC_WIP_BLACKOUT) ?? 0);
  const abnormalPackC = cents(abnormalByStage.get(ACC_WIP_PACK) ?? 0);
  const sowStageC =
    cents(hotMaterial) + cents(directLaborStandard) + cents(overheadAbsorbed) - abnormalSowC;
  entries.push({
    id: `${sowing.sowingId}-XFER-blackout`,
    date,
    description: 'Transfer harvested components to the blackout stage',
    lines: [
      line(ACC_WIP_BLACKOUT, sowStageC, 'Harvested components, blackout'),
      line(ACC_WIP_SOW, -sowStageC, 'Sow stage relieved'),
    ].filter((l) => l.debitCents > 0 || l.creditCents > 0),
  });

  const blackoutStageC = sowStageC - abnormalBlackoutC;
  entries.push({
    id: `${sowing.sowingId}-XFER-PACK`,
    date,
    description: 'Transfer blackouted components to the pack stage',
    lines: [
      line(ACC_WIP_PACK, blackoutStageC, 'Blackout components released to assembly'),
      line(ACC_WIP_BLACKOUT, -blackoutStageC, 'Blackout stage relieved'),
    ].filter((l) => l.debitCents > 0 || l.creditCents > 0),
  });

  if (abnormalSpoilage > 0) {
    entries.push(
      entry(`${sowing.sowingId}-SPOIL`, date, 'Abnormal spoilage charged to the period', [
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
  const packBlackoutC = blackoutStageC - abnormalPackC;
  const coldMaterialC = cents(coldMaterial);
  const packagingC = cents(packagingCost);
  const fgDebitCents = packBlackoutC + coldMaterialC + packagingC;
  const finishedGoodsCost = fgDebitCents / 100;
  entries.push({
    id: `${sowing.sowingId}-FG`,
    date,
    description: 'Pack and receive finished units into finished goods',
    lines: [
      line(ACC_FINISHED_GOODS, fgDebitCents, `${units.toLocaleString()} units at standard`),
      line(ACC_WIP_PACK, -packBlackoutC, 'Pack stage relieved — blackout components'),
      line(ACC_WIP_PACK, -coldMaterialC, 'Pack stage relieved — cold-packed components'),
      line(ACC_PACKAGING, -packagingC, 'Bowl, lid, label'),
    ].filter((l) => l.debitCents > 0 || l.creditCents > 0),
  });

  const standardCostPerUnit = units > 0 ? finishedGoodsCost / units : 0;
  // No price, no revenue (Roadmap N9): the shipment posts cost of goods sold and names the gap.
  if (opts.shipments === undefined && opts.pricePerUnit === undefined && (opts.unitsShipped ?? units) > 0) {
    notes.push('No price per unit was given for the shipment: revenue is not posted for it.');
  }
  const shipments: Shipment[] = opts.shipments !== undefined ? opts.shipments : [
    {
      id: 'SHIP',
      description: 'Distribute units to pickup points — revenue and cost of goods sold',
      units: opts.unitsShipped ?? servings,
      pricePerUnit: opts.pricePerUnit ?? 0,
      revenueAccount: ACC_FOOD_SALES,
    },
  ];
  const shipped = shipments.reduce((s, x) => s + x.units, 0);
  const revenue = shipments.reduce((s, x) => s + x.units * x.pricePerUnit, 0);
  const distributionExpensed = shipped * distributionPerUnit;

  // Finished goods are relieved at standard per unit, in cents, with the last
  // shipment of a fully shipped run taking the rounding residual so the account
  // clears to exactly zero rather than to a stray cent.
  const fullyShipped = shipped === units;
  let cogsCents = 0;
  let relievedCents = 0;
  shipments.forEach((x, idx) => {
    const isLast = idx === shipments.length - 1;
    const lineCogsCents =
      fullyShipped && isLast
        ? fgDebitCents - relievedCents
        : cents(x.units * standardCostPerUnit);
    relievedCents += lineCogsCents;
    cogsCents += lineCogsCents;
    const revenueCents = cents(x.units * x.pricePerUnit);
    entries.push({
      id: `${sowing.sowingId}-${x.id}`,
      date,
      description: x.description,
      lines: [
        { accountCode: ACC_AR, debitCents: revenueCents, creditCents: 0, memo: 'Accounts receivable' },
        { accountCode: x.revenueAccount, debitCents: 0, creditCents: revenueCents, memo: `${x.units.toLocaleString()} units at $${x.pricePerUnit.toFixed(2)}` },
        { accountCode: ACC_COGS, debitCents: lineCogsCents, creditCents: 0, memo: `${x.units.toLocaleString()} units at $${standardCostPerUnit.toFixed(4)} standard` },
        { accountCode: ACC_FINISHED_GOODS, debitCents: 0, creditCents: lineCogsCents, memo: 'Finished goods relieved' },
      ].filter((l) => l.debitCents > 0 || l.creditCents > 0),
    });
  });
  const cogs = cogsCents / 100;

  entries.push(
    entry(`${sowing.sowingId}-DELIV`, date, 'Distribution to pickup points — a period cost, not inventory', [
      { account: '7900', dollars: distributionExpensed, memo: 'ASC 330-10-30-8 — selling and distribution costs are never inventoriable' },
      { account: '2010', dollars: -distributionExpensed, memo: 'Accounts payable / own fleet accrual' },
    ]),
  );

  // ── Traceability: emitted from the same consumption the issue entries posted.
  const traceability: TransformationEvent[] = sowing.components.map((c, idx) =>
    transformationEvent({
      sowingId: sowing.sowingId,
      component: c.component,
      outputLotCode:
        c.outputLotCode ||
        traceabilityLotCode('AMK', sowing.cropPlanCode, date, c.component, idx + 1),
      outputQty: c.packedLb,
      outputUnit: 'lb',
      eventDate: date,
      location: FARM_HOME.name ?? 'Austin facility',
      inputs: c.consumed.map((l) => ({
        input: l.input,
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
      purchasedLb: mb.totalSeedIssuedLb,
      issuedLb: mb.totalSeedIssuedLb,
      // Mass at the sow stage: what entered the sprouting rack plus the sow delta. A
      // cold-packed component is never harvested, so its weight here is its issue
      // less scrap taken before the sprouting rack. Canopy mass counts only what enters
      // the rack — the gap between the two is the cheese and the tortilla,
      // not a loss.
      harvestedLb: mb.components.reduce((s, c) => s + (c.seedIssuedLb - c.prepScrapLb + c.sowDeltaLb), 0),
      blackoutLb: sowing.components.reduce((s, c) => s + (c.blackoutLb ?? 0), 0),
      packedLb: mb.totalPackedLb,
    },
    amounts: {
      unitsProduced: units,
      servingsProduced: servings,
      purchaseOrderCost: opts.purchaseOrderCost,
      standardMaterialCost,
      materialIssuedToWip: hotMaterial + coldMaterial,
      directLaborStandard,
      directLaborActual,
      overheadAbsorbed,
      packagingCost,
      finishedGoodsCost,
      standardCostPerUnit,
      unitsShipped: shipped,
      abnormalSpoilage,
      distributionExpensed,
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
