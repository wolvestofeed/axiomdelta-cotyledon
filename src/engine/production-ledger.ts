/**
 * MicroFarm — the production sowing as double-entry, at standard cost.
 *
 * Server-side only: it imports the `@/ledger` barrel. This module replaces the
 * four-entry production-day sketch with the chain a facility actually runs, and
 * it posts from the SOWING EXECUTION RECORD only — the ISA-95 production
 * performance object. Planning pages never post.
 *
 * A sowing is costed by its grow plan's cost card per tray (`grow-costing.ts`), on the trays
 * SOWN: seed, medium and nutrient are materials issued from raw stock; the light a tray takes
 * and the wear on its tray and the sanitizer are overhead, applied at their standard per tray;
 * labor splits over the three stages by the plan's study, the sowing stream to Sow, the daily
 * stream to Grow, the harvest stream to Pack. Trays removed at the harvest check leave as
 * abnormal spoilage at the cost of the stages they passed.
 *
 * The chain, and the authority for each step:
 *
 *   receipt        Dr Raw Materials @ standard, Dr/Cr PPV, Cr GR/IR
 *                  ASC 330-10-30-1 — purchase price plus freight-in is inventory.
 *                  Pack-rounding is NOT a variance: the over-ordered quantity is
 *                  inventory on hand and nets against the next requirement.
 *   invoice        Dr GR/IR, Cr Accounts Payable
 *   issue          Dr WIP-Sow, Cr Raw Materials: seed, medium and nutrient at standard
 *                  on the trays sown. Usage beyond standard -> Material Usage Variance.
 *   apply          Dr WIP-Sow (tray wear, sanitizer) and WIP-Grow (light), Cr Variable
 *                  Overhead Applied, at the standard per tray.
 *   labor          Dr WIP-Sow / WIP-Grow / WIP-Pack @ standard by stream, Cr Accrued
 *                  Wages @ actual, difference split into rate and efficiency variances.
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
  ACC_WIP_GROW,
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
  ACC_VAR_OH_APPLIED,
  ACC_ABNORMAL_SPOILAGE,
  ACC_ACCRUED_WAGES,
  ACC_ACCRUED_PAYROLL_TAXES,
  ACC_ACCRUED_WORKERS_COMP,
  ACC_ACCRUED_BENEFITS,
  ACC_AR,
  ACC_FOOD_SALES,
} from '@/data/coa-farm';
import { laborForDay, type OverheadAbsorption } from '@/engine';
import { costCarrier, isGrowPlanCarrier } from '@/engine/grow-plan-bridge';
import { GRAMS_PER_LB } from '@/data/tray-formats';
import { lineLabel } from '@/data/grow-plan';
import { estimatedTimeStudy } from '@/engine/time-study-estimate';
import { laborStandard, studiesForCropPlan, summarizeStudy } from '@/engine/time-studies';
import type { TimeStudyDoc } from '@/data/time-studies';
import { splitLoadedLaborCents } from '@/engine/comp';
import { assumptions as defaultAssumptions, type CropPlanDef } from '@/data/plan-data';
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
  /** The sowing's weights, grams. */
  weights: {
    seedIssuedG: number;
    harvestedG: number;
    packedG: number;
  };
  amounts: {
    /** Trays sown: the basis of the standard. */
    traysSown: number;
    /** Trays packed: what finished goods receives. */
    unitsProduced: number;
    /** Units those units became (conversion-cost basis). */
    servingsProduced: number;
    purchaseOrderCost: number;
    standardMaterialCost: number;
    materialIssuedToWip: number;
    directLaborStandard: number;
    directLaborActual: number;
    /** Fixed overhead absorbed at the normal-capacity rate. */
    overheadAbsorbed: number;
    /** Light applied to the Grow stage at its standard per tray. */
    lightApplied: number;
    /** Tray wear and sanitizer applied to the Sow stage at their standard per tray. */
    consumablesApplied: number;
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
   * Units the packed trays became; defaults to the trays packed.
   */
  servingsProduced?: number;
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
  /** Pack-rounded purchase cost actually committed for this sowing. */
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
  cropPlan: CropPlanDef,
): ProductionSowingLedger {
  const assumptions = opts.assumptions ?? defaultAssumptions;
  const shrink = opts.shrinkAllowance ?? assumptions.yield.shrinkAllowance.value;
  const notes: string[] = [];
  const costing = isGrowPlanCarrier(cropPlan) ? costCarrier(cropPlan) : null;
  if (!costing) notes.push(`${cropPlan.code} is not a grow plan: it has no cost card per tray, so its material, light and consumables post at zero.`);
  const perTray = costing?.perTray ?? { seed: 0, medium: 0, nutrient: 0, light: 0, consumables: 0, total: 0 };

  const trays = sowing.traysSown;
  const units = sowing.goodUnits;
  const servings = opts.servingsProduced ?? units;
  const date = sowing.productionDate;
  const std = (perTrayCost: number) => perTrayCost * trays * (1 + shrink);

  // ── Standard material on the trays sown. Normal shrink is inventoriable: the
  //    cost card carries it on the whole tray, so it rides into WIP with the rest.
  const standardMaterialCost = std(perTray.seed + perTray.medium + perTray.nutrient);
  const lightApplied = std(perTray.light);
  const consumablesApplied = std(perTray.consumables);

  // ── Labor at standard on the trays sown, split over the stages by the plan's study.
  const sowings = opts.sowings ?? 1;
  const labor = laborForDay(sowings, trays, assumptions);
  const directLaborStandard = labor.directLaborCost;
  const study = summarizeStudy(laborStandard(studiesForCropPlan(opts.studies ?? [], cropPlan.code)) ?? estimatedTimeStudy(cropPlan, Math.max(1, trays)));
  const streamMinutes = study.sowingLaborMinutes + study.dailyLaborMinutes + study.harvestLaborMinutes;
  const streamShare = streamMinutes > 0
    ? { sow: study.sowingLaborMinutes / streamMinutes, grow: study.dailyLaborMinutes / streamMinutes }
    : { sow: 1, grow: 0 };
  const stdRate = assumptions.labor.blendedLoadedWage.value;
  const actualHours = sowing.actualLaborHours ?? labor.totalLaborHours;
  const actualRate = sowing.actualLaborRate ?? stdRate;
  const directLaborActual = actualHours * actualRate;
  const laborRateVariance = (actualRate - stdRate) * actualHours;
  const laborStdC = cents(directLaborStandard);
  const laborSowC = Math.round(laborStdC * streamShare.sow);
  const laborGrowC = Math.round(laborStdC * streamShare.grow);
  const laborPackC = laborStdC - laborSowC - laborGrowC;
  if (sowing.actualLaborHours === null) {
    notes.push(
      'No actual labor hours on the sowing record, so labor posts at standard and both labor variances are zero. The time study is an estimate, not an observation.',
    );
  }

  // ── Overhead applied at the normal-capacity rate, and what the period incurred.
  const overheadAbsorbed = opts.overhead.ratePerUnit * trays;
  const overheadIncurred = opts.overheadIncurred ?? 0;
  const overheadVolume = opts.overheadIncurred !== undefined ? overheadIncurred - overheadAbsorbed : 0;

  // ── Packaging is a product cost on the trays packed; distribution is not.
  const packagingCost = assumptions.perUnit.packaging.value * units;
  const distributionPerUnit = assumptions.perUnit.distribution.value;

  // ── Purchase price variance. Pack-rounding is a quantity difference, not this.
  const invoice = opts.actualInvoiceCost ?? opts.purchaseOrderCost;
  const purchasePriceVariance = invoice - opts.purchaseOrderCost;

  // ── Material usage variance from the record's actual issues against standard, at the
  //    standard price. The standard issue carries the shrink allowance, so a record issued
  //    at standard has none.
  const mb = massBalance(sowing);
  const seedLines = (costing?.lines ?? []).filter((l) => l.line.kind === 'seed');
  const seedPricePerG = (varietyKey: string) => {
    const l = seedLines.find((x) => x.line.kind === 'seed' && x.line.varietyKey === varietyKey);
    return l ? l.unitCost / GRAMS_PER_LB : 0;
  };
  let materialUsageVariance = 0;
  for (const lot of sowing.lots) {
    const l = seedLines.find((x) => x.line.kind === 'seed' && x.line.varietyKey === lot.varietyKey);
    if (!l) continue;
    materialUsageVariance += (lot.seedIssuedG - l.quantity * trays * (1 + shrink)) * seedPricePerG(lot.varietyKey);
  }
  for (const l of (costing?.lines ?? []).filter((x) => (x.line.kind === 'medium' || x.line.kind === 'nutrient') && x.quantity > 0)) {
    const issued = sowing.issues.filter((i) => i.input === lineLabel(l.line)).reduce((s, i) => s + i.qty, 0);
    materialUsageVariance += (issued - l.quantity * trays * (1 + shrink)) * l.unitCost;
  }

  // ── Abnormal spoilage, valued at the FULLY ABSORBED cost of the stages it
  //    passed: seed lost at sowing is raw material at its price; a gram lost on the
  //    shelves, at the check or after packing carries the cost of each stage it
  //    passed, spread over the standard harvest grams (and packaging once packed).
  //    An abnormal reason is abnormal in full; a normal reason is abnormal for the
  //    grams beyond the lot's shrink allowance.
  const stdHarvestG = (costing?.harvestGramsPerTray ?? 0) * trays;
  const perG = (dollars: number, g: number) => (g > 0 ? dollars / g : 0);
  const sowStage = standardMaterialCost + consumablesApplied + laborSowC / 100 + overheadAbsorbed;
  const growStage = lightApplied + laborGrowC / 100;
  const packStage = laborPackC / 100;
  const costPerG: Record<Exclude<ScrapStage, 'SOW'>, number> = {
    GROW: perG(sowStage + growStage, stdHarvestG),
    PACK: perG(sowStage + growStage + packStage, stdHarvestG),
    FINISHED: perG(sowStage + growStage + packStage, stdHarvestG) + perG(packagingCost, (costing?.harvestGramsPerTray ?? 0) * units),
  };
  const stageAccount: Record<ScrapStage, string> = { SOW: ACC_WIP_SOW, GROW: ACC_WIP_GROW, PACK: ACC_WIP_PACK, FINISHED: ACC_FINISHED_GOODS };
  let abnormalSpoilage = 0;
  const abnormalByStage = new Map<string, number>();
  const stagesHit = new Set<ScrapStage>();
  for (const lot of sowing.lots) {
    for (const k of classifyScrap(lot)) {
      if (k.abnormalG <= 0) continue;
      const st = k.event.stage;
      stagesHit.add(st);
      const value = k.abnormalG * (st === 'SOW' ? seedPricePerG(lot.varietyKey) : costPerG[st]);
      abnormalSpoilage += value;
      abnormalByStage.set(stageAccount[st], (abnormalByStage.get(stageAccount[st]) ?? 0) + value);
    }
  }
  if (stagesHit.size > 0) {
    notes.push(
      `Abnormal spoilage is valued at the fully absorbed cost of the stages it passed: ${[...stagesHit].map((st) => (st === 'SOW' ? 'SOW at the seed price' : `${st} $${(costPerG[st] * 1000).toFixed(2)}/kg`)).join(', ')} (material, overhead applied and labor over the standard harvest${stagesHit.has('FINISHED') ? ', and packaging once packed' : ''}).`,
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
    entry(`${sowing.sowingId}-ISSUE`, date, 'Issue seed, medium and nutrient to the sow stage', [
      { account: ACC_WIP_SOW, dollars: standardMaterialCost, memo: `Material at standard for ${trays} trays sown, incl. ${(shrink * 100).toFixed(1)}% normal shrink` },
      { account: ACC_MATERIAL_USAGE_VAR, dollars: materialUsageVariance, memo: 'Material usage variance at standard price' },
      { account: ACC_RAW_MATERIALS, dollars: -(standardMaterialCost + materialUsageVariance), memo: 'Raw materials relieved' },
    ]),
  );

  entries.push(
    entry(`${sowing.sowingId}-APPLY`, date, 'Apply light, tray wear and sanitizer at the standard per tray', [
      { account: ACC_WIP_SOW, dollars: consumablesApplied, memo: `Tray wear and sanitizer, ${trays} trays sown` },
      { account: ACC_WIP_GROW, dollars: lightApplied, memo: `Light over the cycle, ${trays} trays sown` },
      { account: ACC_VAR_OH_APPLIED, dollars: -(consumablesApplied + lightApplied), memo: 'Variable manufacturing overhead applied' },
    ]),
  );

  // Loaded labor at actual is owed as wages, payroll taxes, workers' comp and
  // benefits (Roadmap K5). Built in cents: the standard legs sum to the standard,
  // the owed legs to the actual, and the efficiency variance closes the entry.
  const line = (account: string, c: number, memo: string): JournalLine => ({
    accountCode: account,
    debitCents: c > 0 ? c : 0,
    creditCents: c < 0 ? -c : 0,
    memo,
  });
  const owed = splitLoadedLaborCents(cents(directLaborActual), assumptions.labor.payrollBurden.value);
  const owedC = owed.wagesCents + owed.payrollTaxesCents + owed.workersCompCents + owed.benefitsCents;
  const rateVarC = cents(laborRateVariance);
  const effVarC = owedC - laborStdC - rateVarC;
  entries.push({
    id: `${sowing.sowingId}-LABOR`,
    date,
    description: 'Direct labor — standard into work in process by stream, actual accrued',
    lines: [
      line(ACC_WIP_SOW, laborSowC, `Sowing stream: ${labor.totalLaborHours.toFixed(2)} standard hours in all at $${stdRate.toFixed(2)}`),
      line(ACC_WIP_GROW, laborGrowC, 'Daily stream over the cycle'),
      line(ACC_WIP_PACK, laborPackC, 'Harvest stream'),
      line(ACC_LABOR_RATE_VAR, rateVarC, 'Labor rate variance'),
      line(ACC_LABOR_EFFICIENCY_VAR, effVarC, 'Labor efficiency variance'),
      line(ACC_ACCRUED_WAGES, -owed.wagesCents, 'Accrued wages at actual'),
      line(ACC_ACCRUED_PAYROLL_TAXES, -owed.payrollTaxesCents, 'Employer FICA, FUTA and SUTA on the wages'),
      line(ACC_ACCRUED_WORKERS_COMP, -owed.workersCompCents, "Workers' comp premium on the wages"),
      line(ACC_ACCRUED_BENEFITS, -owed.benefitsCents, 'Burden over the statutory rates, as benefits'),
    ].filter((l) => l.debitCents > 0 || l.creditCents > 0),
  });
  const laborEfficiencyVariance = effVarC / 100;

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
  const sowStageC = cents(standardMaterialCost) + cents(consumablesApplied) + laborSowC + cents(overheadAbsorbed) - abnormalC(ACC_WIP_SOW);
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

  if (abnormalSpoilage > 0) {
    entries.push(
      entry(`${sowing.sowingId}-SPOIL`, date, 'Abnormal spoilage charged to the period', [
        ...[...abnormalByStage.entries()].map(([acct, v]) => ({
          account: acct,
          dollars: -v,
          memo: 'Stage relieved of abnormal loss',
        })),
        // Last, so the rounding residual lands on the expense and every stage clears.
        { account: ACC_ABNORMAL_SPOILAGE, dollars: abnormalSpoilage, memo: 'ASC 330-10-30-7 — abnormal waste is a current-period charge' },
      ]),
    );
  }

  // Finished goods receives exactly what the pack stage and the packaging
  // store were charged, leg by leg.
  const packStageC = growStageC + laborPackC - abnormalC(ACC_WIP_PACK);
  const packagingC = cents(packagingCost);
  const fgDebitCents = packStageC + packagingC;
  const finishedGoodsCost = fgDebitCents / 100;
  entries.push({
    id: `${sowing.sowingId}-FG`,
    date,
    description: 'Pack and receive finished trays into finished goods',
    lines: [
      line(ACC_FINISHED_GOODS, fgDebitCents, `${units.toLocaleString()} trays at standard`),
      line(ACC_WIP_PACK, -packStageC, 'Pack stage relieved'),
      line(ACC_PACKAGING, -packagingC, "The plan's packaging"),
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
      seedIssuedG: mb.totalSeedIssuedG,
      harvestedG: mb.totalHarvestedG,
      packedG: mb.totalPackedG,
    },
    amounts: {
      traysSown: trays,
      unitsProduced: units,
      servingsProduced: servings,
      purchaseOrderCost: opts.purchaseOrderCost,
      standardMaterialCost,
      materialIssuedToWip: standardMaterialCost,
      directLaborStandard,
      directLaborActual,
      overheadAbsorbed,
      lightApplied,
      consumablesApplied,
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
