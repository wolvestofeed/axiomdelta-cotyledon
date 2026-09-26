import 'server-only';
import { getActiveScenario, loadDefinitions, resolveWithDefinitions, type Definitions } from './scenarios';
import type { MenuCycleDef } from '../_data/menu-cycles';
import { listMenuCycles, listOrders } from './orders';
import { loadActuals } from './actuals';
import { listPlanOfRecordHistory } from './plan-of-record';
import { listReadings, listRefrigerantService } from './sustainability-records';
import { listSupplierLcaOptions } from './supplier-lca';
import { leanSuppliersById } from './supplier-links';
import { horizonEnd, simulateForecast, type ForecastTimeline } from '../_engine/forecast-timeline';
import { planBundle, postPlanLedger, type PlanLedger } from '../_engine/plan-ledger';
import { postActualLedger, type ActualLedger } from '../_engine/actuals-ledger';
import { bundleForPeriod, periodEnd, periodStart, type ActualsBundle, type BatchRecordDoc } from '../_engine/actuals';
import type { ProductionBatchLedger } from '../_engine/production-ledger';
import type { IncomeStatement } from '../_engine/ledger-model';
import type { JournalEntry } from '@ct/ledger';
import { ACC_CASH } from '../_data/coa-muse';
import { fullInventory } from '../_engine/inventory';
import { mixFoodFootprint, sustainabilityBasis } from '../_engine/sustainability-basis';
import { energyInWindow, flowInWindow, serviceFromRecords } from '../_engine/sustainability-records';
import { planOfRecordAtMonthEnd, type PlanInForce } from '../_engine/plan-of-record';
import { includedCustomers } from '../_engine/demand';
import { pvaBreakdown, pvaMeasures, type PvaBreakdownRow, type PvaMeasures, type PvaOrder, type PvaSideInput } from '../_engine/plan-v-actual';
import type { MuseScenarioConfig, ResolvedInputs } from '../_engine/scenario';
import { lcaOptions as curatedOptions } from '../_data/lca-options';
import { NOT_RATED, ratingFor, supplierRatings } from '../_data/mark';

/**
 * Impact OS — Plan v Actual, assembled (Roadmap N7). Each month posts the plan of
 * record in force at its end through that plan's own timeline and Plan ledger, and
 * the records through the Actual ledger (at the plan of record set now, as every
 * Actual page does). Plans are posted once per distinct config applied.
 */

export interface PvaSideMonth {
  measures: PvaMeasures;
  breakdown: { recipe: PvaBreakdownRow[]; channel: PvaBreakdownRow[]; customer: PvaBreakdownRow[] };
  recipesDeliveredWithNoBatch: string[];
  /** Recipes served whose ingredients have no food-factor mapping: their food emissions and mass read low. */
  recipesWithUnmappedLines: string[];
}

export interface PvaMonth {
  period: string;
  plan: PvaSideMonth;
  actual: PvaSideMonth;
  /**
   * The rolling forecast (Roadmap N8, Robert 2026-09-16): the records through the as-of date and the
   * plan of record set now, as planned, for the days after it. Budget-based; nothing re-estimated.
   */
  rolling: PvaSideMonth;
  /** Cash at the month end on each side; the rolling forecast opens from the actual balance at the as-of date. */
  closingCashCents: { plan: number; actual: number; rolling: number };
  planInForce: Pick<PlanInForce, 'label' | 'basis' | 'appliedAt'> & {
    /** Posted on the master records frozen with the trail entry; false reads the definitions as they stand now. */
    frozen: boolean;
  };
  /** The month falls outside the plan's own timeline: its Plan side reads zero. */
  outsidePlanWindow: boolean;
}

export interface PlanVsActual {
  months: PvaMonth[];
  customerNames: Record<string, string>;
  channelNames: Record<string, string>;
  /** Changes of the plan of record on the trail; zero means every month reads the plan of record set now. */
  trailEntries: number;
  /** The rolling forecast's as-of date: today. */
  asOf: string;
  /** The plan of record the rolling forecast runs after the as-of date. */
  rollingPlanLabel: string | null;
}

interface PostedPlan {
  inputs: ResolvedInputs;
  timeline: ForecastTimeline;
  ledger: PlanLedger;
  bundle: ActualsBundle;
  /** Meals the plan delivers over its first year: the base the annual energy and water spread over. */
  firstYearMeals: number;
}

const pfOf = (inputs: ResolvedInputs) => Object.fromEntries(inputs.phaseProfiles.map((p) => [p.phase, p.portionFactor.value])) as Record<number, number>;

export async function buildPlanVsActual(periods: readonly string[]): Promise<PlanVsActual> {
  const [definitions, cycles, bundle, storedOrders, history, active, readings, service, supplierOptions] = await Promise.all([
    loadDefinitions(),
    listMenuCycles(),
    loadActuals(),
    listOrders(),
    listPlanOfRecordHistory(),
    getActiveScenario(),
    listReadings(),
    listRefrigerantService(),
    listSupplierLcaOptions(),
  ]);
  const options = [...curatedOptions, ...supplierOptions];
  const current = { scenarioId: active?.id ?? null, label: active?.label ?? null, config: (active?.config ?? {}) as MuseScenarioConfig };
  const today = new Date().toISOString().slice(0, 10);

  // ── Plans, once per distinct config applied.
  // A trail entry with a snapshot posts on the master records frozen with it; otherwise on the definitions now.
  const posted = new Map<string, PostedPlan>();
  const planFor = (config: MuseScenarioConfig, snapshot: unknown = null, entryKey = ''): PostedPlan => {
    const frozen = snapshot as { definitions?: Definitions; cycles?: MenuCycleDef[] } | null;
    const key = frozen?.definitions ? `trail:${entryKey}` : JSON.stringify(config);
    const hit = posted.get(key);
    if (hit) return hit;
    const inputs = resolveWithDefinitions(config, frozen?.definitions ?? definitions);
    const timeline = simulateForecast({ inputs, cycles: frozen?.cycles ?? cycles });
    const ledger = postPlanLedger({ timeline, inputs });
    const planned = planBundle(timeline);
    const yearEnd = horizonEnd(timeline.from, 1);
    const firstYearMeals = planned.deliveries.filter((d) => d.deliveredOn >= timeline.from && d.deliveredOn <= yearEnd).reduce((t, d) => t + d.meals, 0);
    const p = { inputs, timeline, ledger, bundle: planned, firstYearMeals };
    posted.set(key, p);
    return p;
  };

  // ── Actual, once: the records at the plan of record set now, absorbing at its Plan ledger's rate.
  const actualInputs = resolveWithDefinitions(current.config, definitions);
  const actualLedger: ActualLedger = postActualLedger(bundle, actualInputs, today, undefined, { absorption: planFor(current.config).ledger.absorption });
  const confirmed = storedOrders.filter((o) => o.status === 'confirmed' || o.status === 'delivered');
  const ratingOf = new Map(definitions.customers.map((c) => [c.id, c.erra ?? NOT_RATED]));
  const nameOf = new Map(definitions.customers.map((c) => [c.id, c.name]));

  const firstOrders = (orders: readonly PvaOrder[], through: string) => {
    const m = new Map<string, string>();
    for (const o of orders) {
      if (o.orderDate > through) continue;
      const cur = m.get(o.customerId);
      if (!cur || o.orderDate < cur) m.set(o.customerId, o.orderDate);
    }
    return m;
  };

  const side = (input: {
    kind: 'plan' | 'actual';
    period: string;
    inputs: ResolvedInputs;
    docs: ActualsBundle;
    batchLedgerOf: (doc: BatchRecordDoc) => ProductionBatchLedger | undefined;
    statement: IncomeStatement | null;
    orders: readonly PvaOrder[];
    firstOrderOn: Map<string, string>;
    customerIds: readonly string[];
    energy: PvaSideInput['energy'];
    waterGal: number;
    refrigerantService: Record<string, { date: string; lbAdded: number }[]>;
  }): PvaSideMonth => {
    const { period, inputs } = input;
    const from = periodStart(period);
    const to = periodEnd(period);
    const month = bundleForPeriod(input.docs, period);
    const paired = month.batches.flatMap((b) => {
      const led = input.batchLedgerOf(b);
      return led ? [{ doc: b, led }] : [];
    });
    const statement = input.statement;
    const pf = pfOf(inputs);
    const basis = sustainabilityBasis({ kind: input.kind, bundle: input.docs, from, to, holdLifeDays: inputs.assumptions.inventory.chilledHoldLife.value, recipes: inputs.recipes, portionFactorByChannel: pf });
    const food = mixFoodFootprint({ basis, recipes: inputs.recipes, portionFactorByChannel: pf, selection: inputs.sustainability.ingredientBasis, options });
    const suppliers = leanSuppliersById(Object.values(inputs.sustainability.ingredientSupplier));
    const inventory = fullInventory(inputs, to, { basis, energy: input.energy, refrigerantService: input.refrigerantService }, suppliers, options);
    const supplierIds = [...new Set(month.receipts.map((r) => r.supplierId).filter((x): x is string => Boolean(x)))];
    const sideInput: PvaSideInput = {
      period,
      batches: paired.map((x) => x.doc),
      batchLedgers: paired.map((x) => x.led),
      deliveries: month.deliveries,
      receipts: month.receipts,
      orders: input.orders.filter((o) => o.orderDate.slice(0, 7) === period),
      firstOrderOn: input.firstOrderOn,
      statement,
      basis,
      food,
      inventory,
      energy: input.energy,
      waterGal: input.waterGal,
      shrinkAllowance: inputs.assumptions.yield.shrinkAllowance.value,
      recipes: inputs.recipes,
      customers: input.customerIds.map((id) => ({ id, name: nameOf.get(id) ?? id, erra: ratingOf.get(id) ?? NOT_RATED })),
      suppliers: supplierIds.map((id) => ({ id, erra: ratingFor(supplierRatings, id) })),
    };
    const r = pvaBreakdown(sideInput, 'recipe');
    return {
      measures: pvaMeasures(sideInput),
      breakdown: { recipe: r.rows, channel: pvaBreakdown(sideInput, 'channel').rows, customer: pvaBreakdown(sideInput, 'customer').rows },
      recipesDeliveredWithNoBatch: r.recipesDeliveredWithNoBatch,
      recipesWithUnmappedLines: food.recipesWithUnmappedLines.map((x) => x.code),
    };
  };

  // Each batch document's posting, paired by position within its period on the ledger that posted it.
  const ledgerIndex = (ledger: PlanLedger | ActualLedger, docs: ActualsBundle) => {
    const m = new Map<string, ProductionBatchLedger>();
    for (const p of ledger.periods) bundleForPeriod(docs, p.period).batches.forEach((b, i) => { if (p.batches[i]) m.set(b.id, p.batches[i]); });
    return m;
  };
  const indexes = new Map<object, Map<string, ProductionBatchLedger>>();
  const indexOf = (ledger: PlanLedger | ActualLedger, docs: ActualsBundle) => indexes.get(ledger) ?? indexes.set(ledger, ledgerIndex(ledger, docs)).get(ledger)!;
  const statementOf = (ledger: PlanLedger | ActualLedger, period: string) => ledger.months.find((x) => x.label === period)?.incomeStatement ?? null;
  const cashThrough = (entries: readonly JournalEntry[], after: string, through: string) =>
    entries.filter((e) => e.date > after && e.date <= through).reduce((t, e) => t + e.lines.filter((l) => l.accountCode === ACC_CASH).reduce((u, l) => u + l.debitCents - l.creditCents, 0), 0);

  // ── The rolling forecast: records through today, the plan of record set now after it.
  const asOf = today;
  const rollingPlan = planFor(current.config);
  const after = <T,>(list: readonly T[], date: (x: T) => string) => list.filter((x) => date(x) > asOf);
  const through = <T,>(list: readonly T[], date: (x: T) => string) => list.filter((x) => date(x) <= asOf);
  const rollingDocs: ActualsBundle = {
    ...bundle,
    batches: [...through(bundle.batches, (b) => b.productionDate), ...after(rollingPlan.bundle.batches, (b) => b.productionDate)],
    receipts: [...through(bundle.receipts, (r) => r.receivedOn), ...after(rollingPlan.bundle.receipts, (r) => r.receivedOn)],
    deliveries: [...through(bundle.deliveries, (d) => d.deliveredOn), ...after(rollingPlan.bundle.deliveries, (d) => d.deliveredOn)],
  };
  const rollingOrders: PvaOrder[] = [...through(confirmed, (o) => o.orderDate), ...after(rollingPlan.timeline.documents.orders, (o) => o.orderDate)];
  const actualIndex = indexOf(actualLedger, bundle);
  const rollingPlanIndex = indexOf(rollingPlan.ledger, rollingPlan.bundle);

  const months: PvaMonth[] = periods.map((period) => {
    const from = periodStart(period);
    const to = periodEnd(period);
    const inForce = planOfRecordAtMonthEnd(history, period, current);
    const plan = planFor(inForce.config, inForce.snapshot, inForce.appliedAt ?? '');

    // Plan side: the plan's own documents and orders; a customer is new in the month of its first order,
    // counting orders on record before the plan starts.
    const planOrders: PvaOrder[] = [
      ...confirmed.filter((o) => o.orderDate < plan.timeline.from),
      ...plan.timeline.documents.orders,
    ];
    const planMonthMeals = plan.bundle.deliveries.filter((d) => d.deliveredOn >= from && d.deliveredOn <= to).reduce((t, d) => t + d.meals, 0);
    const share = plan.firstYearMeals > 0 ? planMonthMeals / plan.firstYearMeals : 0;
    const e = plan.inputs.sustainability.energy;
    const planEnergy = { ...e, naturalGasTherms: e.naturalGasTherms * share, propaneGal: e.propaneGal * share, fleetGasolineGal: e.fleetGasolineGal * share, fleetDieselGal: e.fleetDieselGal * share, electricityKwh: e.electricityKwh * share };
    const planCustomerIds = includedCustomers(plan.inputs.customers, plan.inputs.forecast)
      .map((c) => c.id)
      .filter((id) => plan.timeline.documents.orders.some((o) => o.customerId === id && o.orderDate >= from && o.orderDate <= to));

    const planSide = side({
      kind: 'plan',
      period,
      inputs: plan.inputs,
      docs: plan.bundle,
      batchLedgerOf: (b) => indexOf(plan.ledger, plan.bundle).get(b.id),
      statement: statementOf(plan.ledger, period),
      orders: planOrders,
      firstOrderOn: firstOrders(planOrders, to),
      customerIds: planCustomerIds,
      energy: planEnergy,
      waterGal: plan.inputs.sustainability.water.meteredGalPerMonth * 12 * share,
      refrigerantService: {},
    });

    const actualCustomerIds = [...new Set(bundle.deliveries.filter((d) => d.deliveredOn >= from && d.deliveredOn <= to && d.customerId).map((d) => d.customerId!))];
    const actualSide = side({
      kind: 'actual',
      period,
      inputs: actualInputs,
      docs: bundle,
      batchLedgerOf: (b) => actualIndex.get(b.id),
      statement: statementOf(actualLedger, period),
      orders: confirmed,
      firstOrderOn: firstOrders(confirmed, to),
      customerIds: actualCustomerIds,
      energy: energyInWindow(readings, from, to),
      waterGal: flowInWindow(readings, 'water_metered_gal', from, to),
      refrigerantService: serviceFromRecords(service.filter((x) => x.servicedOn >= from && x.servicedOn <= to)),
    });

    // Rolling: a month wholly through today is the records; wholly after it, the plan as planned; the
    // month holding today is the records through today and the plan's days after it.
    const cut = asOf < to ? (asOf < from ? null : asOf) : to;
    const rp = rollingPlan;
    const rpMonthMeals = rp.bundle.deliveries.filter((d) => d.deliveredOn >= from && d.deliveredOn <= to).reduce((t, d) => t + d.meals, 0);
    const rpAfterMeals = rp.bundle.deliveries.filter((d) => d.deliveredOn > asOf && d.deliveredOn >= from && d.deliveredOn <= to).reduce((t, d) => t + d.meals, 0);
    const planPart = rpMonthMeals > 0 ? rpAfterMeals / rpMonthMeals : 0;
    const rowsOf = (st: IncomeStatement | null, k = 1) => (st?.sellingAndDistribution ?? []).map((r) => ({ ...r, cents: Math.round(r.cents * k) }));
    const rollingStatement = { sellingAndDistribution: [...(cut ? rowsOf(statementOf(actualLedger, period)) : []), ...rowsOf(statementOf(rp.ledger, period), planPart)] } as IncomeStatement;
    const rpShare = rp.firstYearMeals > 0 ? rpAfterMeals / rp.firstYearMeals : 0;
    const re = energyInWindow(readings, from, cut ?? '0000-00-00');
    const pe = rp.inputs.sustainability.energy;
    const rollingEnergy = { ...re, naturalGasTherms: re.naturalGasTherms + pe.naturalGasTherms * rpShare, propaneGal: re.propaneGal + pe.propaneGal * rpShare, fleetGasolineGal: re.fleetGasolineGal + pe.fleetGasolineGal * rpShare, fleetDieselGal: re.fleetDieselGal + pe.fleetDieselGal * rpShare, electricityKwh: re.electricityKwh + pe.electricityKwh * rpShare };
    const rollingSide = side({
      kind: 'actual',
      period,
      inputs: rp.inputs,
      docs: rollingDocs,
      batchLedgerOf: (b) => actualIndex.get(b.id) ?? rollingPlanIndex.get(b.id),
      statement: rollingStatement,
      orders: rollingOrders,
      firstOrderOn: firstOrders(rollingOrders, to),
      customerIds: [...new Set(rollingDocs.deliveries.filter((d) => d.deliveredOn >= from && d.deliveredOn <= to && d.customerId).map((d) => d.customerId!))],
      energy: rollingEnergy,
      waterGal: flowInWindow(readings, 'water_metered_gal', from, cut ?? '0000-00-00') + rp.inputs.sustainability.water.meteredGalPerMonth * 12 * rpShare,
      refrigerantService: serviceFromRecords(service.filter((x) => x.servicedOn >= from && x.servicedOn <= (cut ?? '0000-00-00'))),
    });

    return {
      period,
      plan: planSide,
      actual: actualSide,
      rolling: rollingSide,
      closingCashCents: {
        plan: cashThrough(plan.ledger.entries, '0000-00-00', to),
        actual: cashThrough(actualLedger.entries, '0000-00-00', to),
        // Opens from the actual balance at the as-of date, then rolls the plan's cash forward.
        rolling: cashThrough(actualLedger.entries, '0000-00-00', asOf < to ? asOf : to) + (to > asOf ? cashThrough(rp.ledger.entries, asOf, to) : 0),
      },
      planInForce: { label: inForce.label, basis: inForce.basis, appliedAt: inForce.appliedAt, frozen: Boolean((inForce.snapshot as { definitions?: unknown } | null)?.definitions) },
      outsidePlanWindow: to < plan.timeline.from || from > plan.timeline.to,
    };
  });

  return {
    months,
    customerNames: Object.fromEntries(definitions.customers.map((c) => [c.id, c.name])),
    channelNames: Object.fromEntries(actualInputs.phases.map((p) => [String(p.phase), p.market])),
    trailEntries: history.length,
    asOf,
    rollingPlanLabel: current.label,
  };
}
