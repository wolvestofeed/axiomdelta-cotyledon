import 'server-only';
import { getActiveScenario, loadDefinitions, resolveWithDefinitions, type Definitions } from '@/server/scenarios';
import type { SubscriptionCycleDef } from '@/data/subscription-cycles';
import { listSubscriptionCycles, listOrders } from '@/server/orders';
import { loadActuals } from '@/server/actuals';
import { listPlanOfRecordHistory } from '@/server/plan-of-record';
import { listReadings, listRefrigerantService } from '@/server/sustainability-records';
import { listSupplierLcaOptions } from '@/server/supplier-lca';
import { leanSuppliersById } from '@/server/supplier-links';
import { horizonEnd, simulateForecast, type ForecastTimeline } from '@/engine/forecast-timeline';
import { planBundle, postPlanLedger, type PlanLedger } from '@/engine/plan-ledger';
import { postActualLedger, type ActualLedger } from '@/engine/actuals-ledger';
import { bundleForPeriod, periodEnd, periodStart, type ActualsBundle, type SowingRecordDoc } from '@/engine/actuals';
import type { ProductionSowingLedger } from '@/engine/production-ledger';
import type { IncomeStatement } from '@/engine/ledger-model';
import type { JournalEntry } from '@/ledger';
import { ACC_CASH } from '@/data/coa-farm';
import { fullInventory } from '@/engine/inventory';
import { mixFoodFootprint, sustainabilityBasis } from '@/engine/sustainability-basis';
import { energyInWindow, flowInWindow, serviceFromRecords } from '@/engine/sustainability-records';
import { planOfRecordAtMonthEnd, type PlanInForce } from '@/engine/plan-of-record';
import { pvaBreakdown, pvaMeasures, type PvaBreakdownRow, type PvaMeasures, type PvaOrder, type PvaSideInput } from '@/engine/plan-v-actual';
import type { FarmScenarioConfig, ResolvedInputs } from '@/engine/scenario';
import { lcaOptions as curatedOptions } from '@/data/lca-options';
import { ratingFor, supplierRatings } from '@/data/mark';

/**
 * MicroFarm — Plan v Actual, assembled (Roadmap N7). Each month posts the plan of
 * record in force at its end through that plan's own timeline and Plan ledger, and
 * the records through the Actual ledger (at the plan of record set now, as every
 * Actual page does). Plans are posted once per distinct config applied.
 */

export interface PvaSideMonth {
  measures: PvaMeasures;
  breakdown: { growPlan: PvaBreakdownRow[]; channel: PvaBreakdownRow[]; subscriber: PvaBreakdownRow[] };
  growPlansDistributedWithNoSowing: string[];
  /** Grow plans served whose inputs have no food-factor mapping: their food emissions and mass read low. */
  growPlansWithUnmappedLines: string[];
}

export interface PvaMonth {
  period: string;
  plan: PvaSideMonth;
  actual: PvaSideMonth;
  /**
   * The rolling forecast: the records through the as-of date and the
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
  subscriberNames: Record<string, string>;
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
  /** Units the plan distributes over its first year: the base the annual energy and water spread over. */
  firstYearUnits: number;
}

const pfOf = (inputs: ResolvedInputs) => Object.fromEntries(inputs.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>;

export async function buildPlanVsActual(periods: readonly string[]): Promise<PlanVsActual> {
  const [definitions, cycles, bundle, storedOrders, history, active, readings, service, supplierOptions] = await Promise.all([
    loadDefinitions(),
    listSubscriptionCycles(),
    loadActuals(),
    listOrders(),
    listPlanOfRecordHistory(),
    getActiveScenario(),
    listReadings(),
    listRefrigerantService(),
    listSupplierLcaOptions(),
  ]);
  const options = [...curatedOptions, ...supplierOptions];
  const current = { scenarioId: active?.id ?? null, label: active?.label ?? null, config: (active?.config ?? {}) as FarmScenarioConfig };
  const today = new Date().toISOString().slice(0, 10);

  // ── Plans, once per distinct config applied.
  // A trail entry with a snapshot posts on the master records frozen with it; otherwise on the definitions now.
  const posted = new Map<string, PostedPlan>();
  const planFor = (config: FarmScenarioConfig, snapshot: unknown = null, entryKey = ''): PostedPlan => {
    const frozen = snapshot as { definitions?: Definitions; cycles?: SubscriptionCycleDef[] } | null;
    const key = frozen?.definitions ? `trail:${entryKey}` : JSON.stringify(config);
    const hit = posted.get(key);
    if (hit) return hit;
    const inputs = resolveWithDefinitions(config, frozen?.definitions ?? definitions);
    const timeline = simulateForecast({ inputs, cycles: frozen?.cycles ?? cycles });
    const ledger = postPlanLedger({ timeline, inputs });
    const planned = planBundle(timeline);
    const yearEnd = horizonEnd(timeline.from, 1);
    const firstYearUnits = planned.distributions.filter((d) => d.distributedOn >= timeline.from && d.distributedOn <= yearEnd).reduce((t, d) => t + d.units, 0);
    const p = { inputs, timeline, ledger, bundle: planned, firstYearUnits };
    posted.set(key, p);
    return p;
  };

  // ── Actual, once: the records at the plan of record set now, absorbing at its Plan ledger's rate.
  const actualInputs = resolveWithDefinitions(current.config, definitions);
  const actualLedger: ActualLedger = postActualLedger(bundle, actualInputs, today, undefined, { absorption: planFor(current.config).ledger.absorption });
  const confirmed = storedOrders.filter((o) => o.status === 'confirmed' || o.status === 'distributed');

  const firstOrders = (orders: readonly PvaOrder[], through: string) => {
    const m = new Map<string, string>();
    for (const o of orders) {
      if (o.orderDate > through) continue;
      const cur = m.get(o.subscriberId);
      if (!cur || o.orderDate < cur) m.set(o.subscriberId, o.orderDate);
    }
    return m;
  };

  const side = (input: {
    kind: 'plan' | 'actual';
    period: string;
    inputs: ResolvedInputs;
    docs: ActualsBundle;
    sowingLedgerOf: (doc: SowingRecordDoc) => ProductionSowingLedger | undefined;
    statement: IncomeStatement | null;
    orders: readonly PvaOrder[];
    firstOrderOn: Map<string, string>;
    energy: PvaSideInput['energy'];
    waterGal: number;
    refrigerantService: Record<string, { date: string; lbAdded: number }[]>;
  }): PvaSideMonth => {
    const { period, inputs } = input;
    const from = periodStart(period);
    const to = periodEnd(period);
    const month = bundleForPeriod(input.docs, period);
    const paired = month.sowings.flatMap((b) => {
      const led = input.sowingLedgerOf(b);
      return led ? [{ doc: b, led }] : [];
    });
    const statement = input.statement;
    const pf = pfOf(inputs);
    const basis = sustainabilityBasis({ kind: input.kind, bundle: input.docs, from, to, shelfLifeDays: inputs.assumptions.inventory.blackoutShelfLife.value, growPlans: inputs.growPlans, unitFactorByChannel: pf });
    const food = mixFoodFootprint({ basis, growPlans: inputs.growPlans, unitFactorByChannel: pf, selection: inputs.sustainability.inputBasis, options });
    const suppliers = leanSuppliersById(Object.values(inputs.sustainability.inputSupplier));
    const inventory = fullInventory(inputs, to, { basis, energy: input.energy, refrigerantService: input.refrigerantService }, suppliers, options);
    const supplierIds = [...new Set(month.receipts.map((r) => r.supplierId).filter((x): x is string => Boolean(x)))];
    const sideInput: PvaSideInput = {
      period,
      sowings: paired.map((x) => x.doc),
      sowingLedgers: paired.map((x) => x.led),
      distributions: month.distributions,
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
      growPlans: inputs.growPlans,
      suppliers: supplierIds.map((id) => ({ id, rating: ratingFor(supplierRatings, id) })),
    };
    const r = pvaBreakdown(sideInput, 'growPlan');
    return {
      measures: pvaMeasures(sideInput),
      breakdown: { growPlan: r.rows, channel: pvaBreakdown(sideInput, 'channel').rows, subscriber: pvaBreakdown(sideInput, 'subscriber').rows },
      growPlansDistributedWithNoSowing: r.growPlansDistributedWithNoSowing,
      growPlansWithUnmappedLines: food.growPlansWithUnmappedLines.map((x) => x.code),
    };
  };

  // Each sowing document's posting, paired by position within its period on the ledger that posted it.
  const ledgerIndex = (ledger: PlanLedger | ActualLedger, docs: ActualsBundle) => {
    const m = new Map<string, ProductionSowingLedger>();
    for (const p of ledger.periods) bundleForPeriod(docs, p.period).sowings.forEach((b, i) => { if (p.sowings[i]) m.set(b.id, p.sowings[i]); });
    return m;
  };
  const indexes = new Map<object, Map<string, ProductionSowingLedger>>();
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
    sowings: [...through(bundle.sowings, (b) => b.productionDate), ...after(rollingPlan.bundle.sowings, (b) => b.productionDate)],
    receipts: [...through(bundle.receipts, (r) => r.receivedOn), ...after(rollingPlan.bundle.receipts, (r) => r.receivedOn)],
    distributions: [...through(bundle.distributions, (d) => d.distributedOn), ...after(rollingPlan.bundle.distributions, (d) => d.distributedOn)],
  };
  const rollingOrders: PvaOrder[] = [...through(confirmed, (o) => o.orderDate), ...after(rollingPlan.timeline.documents.orders, (o) => o.orderDate)];
  const actualIndex = indexOf(actualLedger, bundle);
  const rollingPlanIndex = indexOf(rollingPlan.ledger, rollingPlan.bundle);

  const months: PvaMonth[] = periods.map((period) => {
    const from = periodStart(period);
    const to = periodEnd(period);
    const inForce = planOfRecordAtMonthEnd(history, period, current);
    const plan = planFor(inForce.config, inForce.snapshot, inForce.appliedAt ?? '');

    // Plan side: the plan's own documents and orders; a subscriber is new in the month of its first order,
    // counting orders on record before the plan starts.
    const planOrders: PvaOrder[] = [
      ...confirmed.filter((o) => o.orderDate < plan.timeline.from),
      ...plan.timeline.documents.orders,
    ];
    const planMonthUnits = plan.bundle.distributions.filter((d) => d.distributedOn >= from && d.distributedOn <= to).reduce((t, d) => t + d.units, 0);
    const share = plan.firstYearUnits > 0 ? planMonthUnits / plan.firstYearUnits : 0;
    const e = plan.inputs.sustainability.energy;
    const planEnergy = { ...e, naturalGasTherms: e.naturalGasTherms * share, propaneGal: e.propaneGal * share, fleetGasolineGal: e.fleetGasolineGal * share, fleetDieselGal: e.fleetDieselGal * share, electricityKwh: e.electricityKwh * share };

    const planSide = side({
      kind: 'plan',
      period,
      inputs: plan.inputs,
      docs: plan.bundle,
      sowingLedgerOf: (b) => indexOf(plan.ledger, plan.bundle).get(b.id),
      statement: statementOf(plan.ledger, period),
      orders: planOrders,
      firstOrderOn: firstOrders(planOrders, to),
      energy: planEnergy,
      waterGal: plan.inputs.sustainability.water.meteredGalPerMonth * 12 * share,
      refrigerantService: {},
    });

    const actualSide = side({
      kind: 'actual',
      period,
      inputs: actualInputs,
      docs: bundle,
      sowingLedgerOf: (b) => actualIndex.get(b.id),
      statement: statementOf(actualLedger, period),
      orders: confirmed,
      firstOrderOn: firstOrders(confirmed, to),
      energy: energyInWindow(readings, from, to),
      waterGal: flowInWindow(readings, 'water_metered_gal', from, to),
      refrigerantService: serviceFromRecords(service.filter((x) => x.servicedOn >= from && x.servicedOn <= to)),
    });

    // Rolling: a month wholly through today is the records; wholly after it, the plan as planned; the
    // month holding today is the records through today and the plan's days after it.
    const cut = asOf < to ? (asOf < from ? null : asOf) : to;
    const rp = rollingPlan;
    const rpMonthUnits = rp.bundle.distributions.filter((d) => d.distributedOn >= from && d.distributedOn <= to).reduce((t, d) => t + d.units, 0);
    const rpAfterUnits = rp.bundle.distributions.filter((d) => d.distributedOn > asOf && d.distributedOn >= from && d.distributedOn <= to).reduce((t, d) => t + d.units, 0);
    const planPart = rpMonthUnits > 0 ? rpAfterUnits / rpMonthUnits : 0;
    const rowsOf = (st: IncomeStatement | null, k = 1) => (st?.sellingAndDistribution ?? []).map((r) => ({ ...r, cents: Math.round(r.cents * k) }));
    // Cost of goods sold the same way, element by element: the records' rows plus the plan's share.
    const cogsOf = (st: IncomeStatement | null, k = 1) => (st?.costOfGoodsSold ?? []).map((r) => ({ ...r, cents: Math.round(r.cents * k) }));
    const cogsRows = [...(cut ? cogsOf(statementOf(actualLedger, period)) : []), ...cogsOf(statementOf(rp.ledger, period), planPart)];
    const costOfGoodsSold = [...new Set(cogsRows.map((r) => r.code))].map((code) => ({ ...cogsRows.find((r) => r.code === code)!, cents: cogsRows.filter((r) => r.code === code).reduce((t, r) => t + r.cents, 0) }));
    const rollingStatement = { sellingAndDistribution: [...(cut ? rowsOf(statementOf(actualLedger, period)) : []), ...rowsOf(statementOf(rp.ledger, period), planPart)], costOfGoodsSold } as unknown as IncomeStatement;
    const rpShare = rp.firstYearUnits > 0 ? rpAfterUnits / rp.firstYearUnits : 0;
    const re = energyInWindow(readings, from, cut ?? '0000-00-00');
    const pe = rp.inputs.sustainability.energy;
    const rollingEnergy = { ...re, naturalGasTherms: re.naturalGasTherms + pe.naturalGasTherms * rpShare, propaneGal: re.propaneGal + pe.propaneGal * rpShare, fleetGasolineGal: re.fleetGasolineGal + pe.fleetGasolineGal * rpShare, fleetDieselGal: re.fleetDieselGal + pe.fleetDieselGal * rpShare, electricityKwh: re.electricityKwh + pe.electricityKwh * rpShare };
    const rollingSide = side({
      kind: 'actual',
      period,
      inputs: rp.inputs,
      docs: rollingDocs,
      sowingLedgerOf: (b) => actualIndex.get(b.id) ?? rollingPlanIndex.get(b.id),
      statement: rollingStatement,
      orders: rollingOrders,
      firstOrderOn: firstOrders(rollingOrders, to),
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
    subscriberNames: Object.fromEntries(definitions.subscribers.map((c) => [c.id, c.name])),
    channelNames: Object.fromEntries(actualInputs.phases.map((p) => [String(p.phase), p.market])),
    trailEntries: history.length,
    asOf,
    rollingPlanLabel: current.label,
  };
}
