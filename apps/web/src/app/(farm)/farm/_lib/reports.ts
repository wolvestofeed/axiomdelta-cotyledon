import 'server-only';
import { money, num, pct } from '../_components/ui';
import type { FarmAccess } from './access';
import { postSelectedLedger, type PostedLedger } from './ledgers';
import { loadActuals } from './actuals';
import { listSubscriptionCycles, listOrders } from './orders';
import { loadCalendar } from './periods';
import { listTimeStudies } from './time-studies';
import { listPurchaseOrders, listAllCatalog } from './supplier-catalog';
import { listScenarios } from './scenarios';
import { listTrainingDocs, listTrainingAssignments, listActiveStaff } from './training';
import { buildPlanVsActual } from './plan-v-actual';
import { loadSustainabilityRecords, postSustainabilityBasis } from './sustainability';
import { listSupplierLcaOptions } from './supplier-lca';
import { leanSuppliersById } from './supplier-links';
import { REPORT_CATALOG, reportsFor, type ReportCell, type ReportData, type ReportDef, type ReportRow, type ReportTable } from '../_engine/reports';
import type { ActualsBundle, DistributionDoc } from '../_engine/actuals';
import { toSowingExecution } from '../_engine/actuals';
import { stageLoadsOf, massBalance } from '../_engine/sowing';
import { evaluateCcp2, CCP2_LIMITS } from '../_engine/produce-safety';
import { orderBook, isoAddDays, pickupPointActualVsForecast, type BookOrder } from '../_engine/orders';
import { distributedConsumption, finishedGoodsOnHand, planHorizon, unitFactorFor, type HorizonPlan } from '../_engine/production-plan';
import { rawStockOnHand, rawLotsByUseBy } from '../_engine/net-requirements';
import { resolveSubscriberPickupPoints, forecastByDistributionPickupPoint } from '../_engine/demand';
import { laborStandard, nextStudyDue, studiesForCropPlan, summarizeStudy } from '../_engine/time-studies';
import { activeCropPlanAverages } from '../_engine/active-averages';
import { staffDemand , traysOnShelf, cycleDaysByCode } from '../_engine/staff-demand';
import { agingReport, AGING_BUCKETS, AGING_LABELS, billBalances, dueOn, invoiceBalances, receiptValueCents, type OpenItem } from '../_engine/working-capital';
import { periodStart, BILL_CATEGORY_LABELS } from '../_engine/actuals';
import { servedCostPerUnitCents, sumMeasures, type PvaMeasures } from '../_engine/plan-v-actual';
import { CLOCK_STATE_LABELS, clockStateOf, hoursRun, payPeriodFor } from '../_engine/payroll';
import { activeVersions, completionFor } from '../_engine/training';
import { pipelineStats } from '../_engine/prospects';
import { prospectRecords } from '../_data/prospects';
import { SUBSCRIBER_STATUS_LABELS } from '../_data/subscribers';
import { pickupPoints as seedPickupPoints } from '../_data/seed-invented';
import { resolvePickupPoints } from '../_engine/pickup-points';
import { PLACEMENT_LABEL } from '../_engine/entity-links';
import { fullInventory } from '../_engine/inventory';
import { KG_PER_SHORT_TON, refrigerantInventory, warmNet } from '../_engine/carbon';
import { expiredMassKg, mixShrinkKg } from '../_engine/sustainability-basis';
import { energyFromReadings, serviceFromRecords } from '../_engine/sustainability-records';
import { countsTowardCapital } from '../_engine/equipment';
import { lcaOptions as curatedOptions } from '../_data/lca-options';
import { CATALOG_STATUS_LABEL } from '../_engine/catalog';

/**
 * MicroFarm — the Reports library, assembled (Roadmap Phase E). Server-only.
 *
 * One read of the shared documents, then every report in the catalog built
 * from them with the same engine functions the module pages call. Nothing is
 * stored, and nothing here computes a dollar the ledger does not: a figure on
 * a report is the figure on its module page. Admin-only reports are never
 * built for an operator, so their rows are never sent.
 */

const cents = (c: number, dp = 0) => money(c / 100, dp);
const signedCents = (c: number) => (c === 0 ? '0' : `${c > 0 ? '+' : '−'}${money(Math.abs(c) / 100, 0)}`);
const table = (columns: ReportTable['columns'], rows: ReportRow[]): ReportTable => ({ columns, rows });
const row = (cells: ReportCell[], tone?: ReportRow['tone']): ReportRow => (tone ? { cells, tone } : { cells });
const monthOf = (iso: string) => iso.slice(0, 7);
const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

interface Ctx {
  today: string;
  access: FarmAccess;
  selected: PostedLedger;
  /** The recorded documents, whatever the selected world. */
  records: ActualsBundle;
  orders: Awaited<ReturnType<typeof listOrders>>;
  cycles: Awaited<ReturnType<typeof listSubscriptionCycles>>;
  closures: Awaited<ReturnType<typeof loadCalendar>>['closures'];
  studies: Awaited<ReturnType<typeof listTimeStudies>>;
  pos: Awaited<ReturnType<typeof listPurchaseOrders>>;
  catalog: Awaited<ReturnType<typeof listAllCatalog>>;
  pf: Record<number, number>;
  /** The next fourteen days on the selected world, rolled through production. */
  horizon: HorizonPlan;
  horizonFrom: string;
  horizonTo: string;
  /** Finished lots on the selected world as of today. */
  finished: ReturnType<typeof finishedGoodsOnHand>;
  worldLabel: string;
}

export interface ReportLibrary {
  reports: { def: ReportDef; data: ReportData }[];
  today: string;
  worldLabel: string;
}

/** The library for one reader: every report their role can open, built once. */
export async function buildReportLibrary(access: FarmAccess): Promise<ReportLibrary> {
  const today = new Date().toISOString().slice(0, 10);
  const [selected, records, orders, cycles, calendar, studies, pos, catalog] = await Promise.all([
    postSelectedLedger(),
    loadActuals(),
    listOrders(),
    listSubscriptionCycles(),
    loadCalendar(),
    listTimeStudies(),
    listPurchaseOrders(),
    listAllCatalog(),
  ]);
  const R = selected.inputs;
  const isPlan = selected.kind === 'plan';
  const closures = calendar.closures;
  const pf = Object.fromEntries(R.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>;
  const shelfLife = R.assumptions.inventory.blackoutShelfLife.value;

  // The next two weeks on the selected world (Roadmap N9): Plan reads the forecast's pickup points and
  // nothing on record; Actual reads the subscribers' pickup points, the orders on file and the closed sowings.
  const horizonFrom = today;
  const horizonTo = isoAddDays(today, 13);
  const book = orderBook({
    pickupPoints: isPlan ? R.demand.pickupPoints : resolveSubscriberPickupPoints(R.subscribers, {}, { closures }),
    subscribers: R.subscribers,
    cycles,
    orders: isPlan ? [] : orders,
    from: horizonFrom,
    to: horizonTo,
    channelPriceCents: Object.fromEntries(R.phases.map((p) => [p.phase, Math.round(p.pricePerUnit * 100)])) as Record<number, number>,
    cropPlanNames: Object.fromEntries(R.cropPlans.map((r) => [r.code, r.name])),
    closures,
  });
  const worldBundle = selected.bundle;
  const consumed = isPlan
    ? worldBundle.distributions.filter((d) => d.cropPlanCode).map((d) => ({ cropPlanCode: d.cropPlanCode!, date: d.distributedOn, baseUnits: d.units * unitFactorFor(R.cropPlans.find((r) => r.code === d.cropPlanCode), d.phase, pf) }))
    : distributedConsumption(orders, records.distributions, R.cropPlans, pf);
  const finished = finishedGoodsOnHand({ sowings: worldBundle.sowings, consumed, shelfLifeDays: shelfLife, asOf: today });
  const horizon = planHorizon({
    closures,
    from: horizonFrom,
    to: horizonTo,
    book,
    cropPlans: R.cropPlans,
    capacityInputs: R.capacityInputs,
    assumptions: R.assumptions,
    cropPlanAssumptions: R.cropPlanAssumptions,
    unitFactorByChannel: pf,
    openingLots: finished.lots.filter((l) => l.remaining > 0),
    shelfLifeDays: shelfLife,
    channels: R.phases.map((p) => p.phase),
  });
  const worldLabel = isPlan ? `Plan — ${selected.view.label ?? 'plan defaults'}` : 'Actual — the recorded documents';
  const ctx: Ctx = { today, access, selected, records, orders, cycles, closures, studies, pos, catalog, pf, horizon, horizonFrom, horizonTo, finished, worldLabel };

  const defs = reportsFor(access.isSuperAdmin);
  const reports = await Promise.all(defs.map(async (def) => ({ def, data: await buildOne(def, ctx) })));
  return { reports, today, worldLabel };
}

/** One report from the catalog, for the export route. Admin-only reports refuse an operator with null. */
export async function buildReport(id: string, access: FarmAccess): Promise<{ def: ReportDef; data: ReportData } | null> {
  const def = REPORT_CATALOG.find((r) => r.id === id);
  if (!def || (def.adminOnly && !access.isSuperAdmin)) return null;
  const lib = await buildReportLibrary(access);
  return lib.reports.find((r) => r.def.id === id) ?? null;
}

async function buildOne(def: ReportDef, ctx: Ctx): Promise<ReportData> {
  const builder = BUILDERS[def.id];
  if (!builder) return { id: def.id, summary: table([{ label: 'Item' }, { label: 'Value' }], []), detail: null, detailCount: 0, basis: '', empty: 'This report has no builder yet.' };
  const built = await builder(ctx);
  return { id: def.id, detailCount: built.detail?.rows.length ?? 0, ...built };
}

type Built = Omit<ReportData, 'id' | 'detailCount'>;
type Builder = (ctx: Ctx) => Built | Promise<Built>;

// ── Overview ────────────────────────────────────────────────────────────────

function coolingLog(records: ActualsBundle, cropPlanName: (code: string) => string) {
  return records.sowings.flatMap((b) =>
    b.components.flatMap((c) =>
      stageLoadsOf(c).map((t, li) => {
        const ev = evaluateCcp2(t.t2F, t.t6F);
        return { sowingId: b.sowingId, lot: c.outputLotCode, load: li + 1, date: b.productionDate, product: `${c.component} — ${cropPlanName(b.cropPlanCode)}`, t2: t.t2F, t6: t.t6F, pass: ev.pass, reason: ev.reason };
      }),
    ),
  );
}

function blackoutLotsOwed(records: ActualsBundle, R: PostedLedger['inputs'], cropPlanName: (code: string) => string) {
  const hotComponents = (code: string) => new Set((R.cropPlans.find((r) => r.code === code)?.inputs ?? []).filter((i) => i.isHotComponent).map((i) => i.component ?? i.name));
  return records.sowings.flatMap((b) => {
    const hot = hotComponents(b.cropPlanCode);
    return b.components
      .filter((c) => (c.blackoutLb ?? 0) > 0 && (hot.size === 0 || hot.has(c.component)))
      .map((c) => ({ sowingId: b.sowingId, lot: c.outputLotCode, date: b.productionDate, product: `${c.component} — ${cropPlanName(b.cropPlanCode)}`, recorded: stageLoadsOf(c).length, expected: b.sowingsRun }));
  });
}

const alertsRegister: Builder = (ctx) => {
  const { records, selected, today, access, horizon, studies } = ctx;
  const R = selected.inputs;
  const cropPlanName = (code: string) => R.cropPlans.find((r) => r.code === code)?.name ?? code;
  const items: { finding: string; item: string; detail: string; module: string }[] = [];

  // Cold chain, always the records: a forecast cools nothing.
  for (const r of coolingLog(records, cropPlanName).filter((x) => !x.pass)) items.push({ finding: 'Stage record failed control-point-2', item: `${r.lot} load ${r.load}`, detail: `${r.product}, ${r.date}: ${r.reason}`, module: 'Produce Safety' });
  for (const l of blackoutLotsOwed(records, R, cropPlanName).filter((x) => x.recorded < x.expected)) items.push({ finding: 'Blackout lot with a rack load unrecorded', item: l.lot, detail: `${l.product}, ${l.date}: ${l.recorded} of ${l.expected} loads on the record`, module: 'Produce Safety' });
  const pfc = ctx.pf;
  const recordedFinished = finishedGoodsOnHand({ sowings: records.sowings, consumed: distributedConsumption(ctx.orders, records.distributions, R.cropPlans, pfc), shelfLifeDays: R.assumptions.inventory.blackoutShelfLife.value, asOf: today });
  for (const l of recordedFinished.lots.filter((x) => x.remaining > 1e-9)) {
    const days = daysBetween(today, l.expires);
    if (days <= 7) items.push({ finding: 'Finished lot within seven days of shelf life', item: l.sowingId, detail: `${cropPlanName(l.cropPlanCode)}: ${num(Math.round(l.remaining))} units on hand, shelf life ends ${l.expires} (${days} day${days === 1 ? '' : 's'})`, module: 'Inventory' });
  }
  const raw = rawLotsByUseBy(rawStockOnHand({ receipts: records.receipts, sowings: records.sowings, asOf: today }));
  for (const l of raw.filter((x) => x.daysToUseBy !== null && x.daysToUseBy < 0 && x.remaining > 1e-9)) items.push({ finding: 'Raw lot past the date on the case', item: `${l.input} · ${l.lotCode}`, detail: `use by ${l.useBy}, ${num(l.remaining, 1)} ${l.unit} remaining`, module: 'Inventory' });

  // The plan, on the selected world.
  for (const d of horizon.byDate.filter((x) => !x.fits)) items.push({ finding: 'Production day that does not fit the blackout rack', item: d.date, detail: `${num(d.sowings)} sowings against ${num(d.cyclesAvailable)} cycles available`, module: 'Calendar' });
  for (const d of horizon.byDate.filter((x) => x.expiredBase > 1e-9)) items.push({ finding: 'Stock expiring in the next two weeks', item: d.date, detail: `${num(Math.round(d.expiredBase))} base units past shelf life unconsumed`, module: 'Calendar' });

  // Labor standards.
  for (const r of R.cropPlans) {
    const own = studiesForCropPlan(studies.studies, r.code);
    if (own.length === 0) {
      items.push({ finding: 'Crop plan with no time study', item: r.name, detail: 'Its sowings carry no labor standard and no staff demand', module: 'Time Studies' });
      continue;
    }
    const due = nextStudyDue(own, studies.intervals[r.code], today);
    if (due.daysUntilDue !== null && due.daysUntilDue < 0) items.push({ finding: 'Time study past its re-study date', item: r.name, detail: `due ${due.dueOn}, last studied ${due.lastStudiedOn}`, module: 'Time Studies' });
  }

  // Company financials: admins only (Roadmap O5).
  if (access.isSuperAdmin) {
    const mismatched = billBalances(records.supplierBills ?? [], records.receipts, ctx.pos.map((p) => ({ id: p.id, poNumber: p.poNumber, lines: p.lines })), records.supplierPayments ?? []).filter((b) => b.match.status === 'mismatched');
    for (const b of mismatched) items.push({ finding: 'Supplier bill flagged on the three-way match', item: `${b.bill.billNumber} · ${b.bill.supplierName}`, detail: `${cents(b.amountCents)} billed against ${cents(b.match.receivedCents)} received; ${b.match.issues.length} issue${b.match.issues.length === 1 ? '' : 's'}; held from payment`, module: 'Payables' });
    const pastDue = invoiceBalances(records.invoices ?? [], records.distributions, records.subscriberPayments ?? []).filter((b) => b.invoice.status === 'issued' && b.openCents > 0 && b.invoice.dueOn !== null && b.invoice.dueOn < today);
    for (const b of pastDue) items.push({ finding: 'Invoice past due', item: `${b.invoice.invoiceNumber} · ${b.invoice.subscriberName}`, detail: `${cents(b.openCents)} open, due ${b.invoice.dueOn}, ${daysBetween(b.invoice.dueOn!, today)} days past`, module: 'Receivables' });
  }

  const byFinding = new Map<string, { count: number; module: string }>();
  for (const it of items) {
    const cur = byFinding.get(it.finding) ?? { count: 0, module: it.module };
    cur.count += 1;
    byFinding.set(it.finding, cur);
  }
  const summaryRows = [...byFinding.entries()].map(([finding, v]) => row([finding, v.count, v.module], 'over'));
  summaryRows.push(row(['Open findings', items.length, ''], 'total'));
  return {
    summary: table([{ label: 'Finding' }, { label: 'Count', num: true }, { label: 'Module' }], summaryRows),
    detail: table([{ label: 'Finding' }, { label: 'Item' }, { label: 'Detail' }, { label: 'Module' }], items.map((it) => row([it.finding, it.item, it.detail, it.module]))),
    basis: `Cold chain, receiving and labor standards from the records as of ${today}; the two weeks from ${ctx.horizonFrom} on ${ctx.worldLabel}${access.isSuperAdmin ? '; bills and invoices from the records' : ''}.`,
    empty: items.length === 0 ? 'No open finding.' : undefined,
  };
};

const planAndForecasts: Builder = async (ctx) => {
  const { access, selected } = ctx;
  const saved = await listScenarios({ userId: access.userId ?? '', isSuperAdmin: access.isSuperAdmin });
  const active = saved.find((s) => s.isActive) ?? null;
  const view = selected.view;
  return {
    summary: table([{ label: 'Item' }, { label: 'Value' }], [
      row(['Plan of record', active ? active.label : 'Plan-data defaults; no plan of record set']),
      row(['Open now', view.basis === 'forecast' ? `Forecast — ${view.label}` : 'The plan of record']),
      row(['Ledger selected', selected.kind === 'plan' ? 'Plan' : 'Actual']),
      row(['Forecasts saved', saved.length]),
      row(['Saved by a super admin', saved.filter((s) => s.ownerTier === 'super_admin').length]),
    ]),
    detail: table([{ label: 'Forecast' }, { label: 'Owner tier' }, { label: 'Last saved' }, { label: 'Plan of record' }], saved.map((s) => row([s.label, s.ownerTier, s.updatedAt.toISOString().slice(0, 10), s.isActive ? 'Yes' : ''], s.isActive ? 'total' : undefined))),
    basis: access.isSuperAdmin ? 'Every saved forecast in the workspace.' : 'The forecasts you saved; the plan of record as set by an admin.',
  };
};

// ── Production ──────────────────────────────────────────────────────────────

const productionHistory: Builder = (ctx) => {
  const { selected } = ctx;
  const R = selected.inputs;
  const sowings = selected.bundle.sowings;
  const cropPlanName = (code: string) => R.cropPlans.find((r) => r.code === code)?.name ?? code;
  interface MonthAcc { records: number; loads: number; planned: number; good: number; balanced: number; scrapLb: number }
  const months = new Map<string, MonthAcc>();
  const detail: ReportRow[] = [];
  const sorted = [...sowings].sort((a, b) => a.productionDate.localeCompare(b.productionDate) || a.sowingId.localeCompare(b.sowingId));
  for (const b of sorted) {
    const m = monthOf(b.productionDate);
    const acc = months.get(m) ?? { records: 0, loads: 0, planned: 0, good: 0, balanced: 0, scrapLb: 0 };
    let balanced = false;
    let scrapLb = 0;
    try {
      const mb = massBalance(toSowingExecution(b));
      balanced = mb.balanced;
      scrapLb = mb.totalScrapLb;
    } catch {
      balanced = false;
    }
    acc.records += 1;
    acc.loads += b.sowingsRun;
    acc.planned += b.plannedUnits;
    acc.good += b.goodUnits;
    acc.balanced += balanced ? 1 : 0;
    acc.scrapLb += scrapLb;
    months.set(m, acc);
    detail.push(row([b.productionDate, b.sowingId, cropPlanName(b.cropPlanCode), b.sowingsRun, num(b.plannedUnits), num(b.goodUnits), b.plannedUnits > 0 ? pct(b.goodUnits / b.plannedUnits, 1) : '—', num(scrapLb, 1), balanced ? 'Balanced' : 'Not balanced'], balanced ? undefined : 'over'));
  }
  const rows = [...months.entries()].map(([m, a]) => row([m, a.records, a.loads, num(a.planned), num(a.good), a.planned > 0 ? pct(a.good / a.planned, 1) : '—', num(a.scrapLb, 1), `${a.balanced} / ${a.records}`]));
  const t = [...months.values()].reduce((s, a) => ({ records: s.records + a.records, loads: s.loads + a.loads, planned: s.planned + a.planned, good: s.good + a.good, balanced: s.balanced + a.balanced, scrapLb: s.scrapLb + a.scrapLb }), { records: 0, loads: 0, planned: 0, good: 0, balanced: 0, scrapLb: 0 });
  rows.push(row(['All months', t.records, t.loads, num(t.planned), num(t.good), t.planned > 0 ? pct(t.good / t.planned, 1) : '—', num(t.scrapLb, 1), `${t.balanced} / ${t.records}`], 'total'));
  return {
    summary: table([{ label: 'Month' }, { label: 'Sows', num: true }, { label: 'Rack loads', num: true }, { label: 'Units planned', num: true }, { label: 'Units packed', num: true }, { label: 'Yield', num: true }, { label: 'Scrap lb', num: true }, { label: 'Mass-balanced', num: true }], rows),
    detail: table([{ label: 'Date' }, { label: 'Sowing' }, { label: 'Crop plan' }, { label: 'Loads', num: true }, { label: 'Planned', num: true }, { label: 'Packed', num: true }, { label: 'Yield', num: true }, { label: 'Scrap lb', num: true }, { label: 'Mass balance' }], detail),
    basis: `Sowing records on ${ctx.worldLabel}. A record is one sow and the sow is the lot; a double sowing is one record with two rack loads.`,
    empty: sowings.length === 0 ? (selected.kind === 'plan' ? 'The forecast places no sowing.' : 'No sowing record has been closed.') : undefined,
  };
};

const capacityUtilisation: Builder = (ctx) => {
  const { horizon, horizonFrom, horizonTo } = ctx;
  const t = horizon.totals;
  const summary = table([{ label: 'Measure' }, { label: 'Value', num: true }], [
    row(['Production days with a run', horizon.productionDays.length]),
    row(['Sowings', t.sowings]),
    row(['Blackout rack cycles used', t.cyclesUsed]),
    row(['Blackout rack cycles available on those days', t.cyclesAvailable]),
    row(['Utilisation, cycles used over available', pct(t.utilisation, 0)]),
    row(['Days that do not fit', t.daysThatDoNotFit], t.daysThatDoNotFit > 0 ? 'over' : undefined),
    row(['Units ordered', num(t.orderedUnits)]),
    row(['Units filled', num(t.filledUnits)]),
    row(['Base units produced', num(Math.round(t.producedBase))]),
    row(['Base units expired past shelf life', num(Math.round(t.expiredBase))], t.expiredBase > 0 ? 'over' : undefined),
    row(['Closing stock, base units', num(Math.round(t.closingStockBase))]),
  ]);
  const detail = table([{ label: 'Date' }, { label: 'Sowings', num: true }, { label: 'Units made', num: true }, { label: 'Cycles used', num: true }, { label: 'Available', num: true }, { label: 'Utilisation', num: true }, { label: 'Ordered', num: true }, { label: 'Filled', num: true }, { label: 'Expired', num: true }, { label: 'Closing stock', num: true }, { label: 'Fits' }],
    horizon.byDate.map((d) => row([d.date, d.sowings, num(Math.round(d.unitsProduced)), d.cyclesUsed, d.cyclesAvailable, d.sowings > 0 ? pct(d.utilisation, 0) : '—', num(Math.round(d.orderedBase)), num(Math.round(d.filledBase)), num(Math.round(d.expiredBase)), num(Math.round(d.closingStockBase)), d.fits ? 'Yes' : 'No'], d.fits ? undefined : 'over')));
  return {
    summary,
    detail,
    basis: `The order book from ${horizonFrom} to ${horizonTo} on ${ctx.worldLabel}, rolled through production against the plant's blackout rack cycles. Whole sowings only.`,
    empty: horizon.byDate.length === 0 ? 'No order in the next two weeks on this world.' : undefined,
  };
};

const laborStandards: Builder = (ctx) => {
  const { selected, studies, today } = ctx;
  const R = selected.inputs;
  let observed = 0;
  let estimated = 0;
  let none = 0;
  let pastDue = 0;
  const detail: ReportRow[] = R.cropPlans.map((r) => {
    const own = studiesForCropPlan(studies.studies, r.code);
    const std = laborStandard(own);
    const due = nextStudyDue(own, studies.intervals[r.code], today);
    const late = due.daysUntilDue !== null && due.daysUntilDue < 0;
    if (!std) none += 1;
    else if (std.basis === 'estimated') estimated += 1;
    else observed += 1;
    if (late) pastDue += 1;
    const s = std ? summarizeStudy(std) : null;
    return row([
      r.name,
      r.status === 'in_service' ? 'In service' : r.status,
      std ? (std.basis === 'estimated' ? 'Estimated' : 'Observed') : 'No study',
      s ? num(s.laborMinutesPerUnit, 2) : '—',
      s ? num(s.fixedMinutesPerSowing, 0) : '—',
      s ? num(s.variableMinutesPerUnit, 2) : '—',
      s ? s.peakStaff : '—',
      due.lastStudiedOn ?? '—',
      due.dueOn ?? '—',
      due.daysUntilDue === null ? '—' : due.daysUntilDue,
    ], late || !std ? 'over' : undefined);
  });
  return {
    summary: table([{ label: 'Measure' }, { label: 'Crop plans', num: true }], [
      row(['Crop plans in the library', R.cropPlans.length]),
      row(['On an observed, adopted study', observed]),
      row(['On the estimated study that stands in', estimated]),
      row(['With no study', none], none > 0 ? 'over' : undefined),
      row(['Past the re-study date', pastDue], pastDue > 0 ? 'over' : undefined),
    ]),
    detail: table([{ label: 'Crop plan' }, { label: 'Status' }, { label: 'Standard' }, { label: 'Labor min / unit', num: true }, { label: 'Fixed min / sowing', num: true }, { label: 'Variable min / unit', num: true }, { label: 'Most people on a task', num: true }, { label: 'Last studied' }, { label: 'Next due' }, { label: 'Days to due', num: true }], detail),
    basis: `Each crop plan's labor standard from the time-study library as of ${today}: the adopted observed study, or the estimated study until one is adopted.`,
  };
};

const unitCost: Builder = (ctx) => {
  const { selected, studies } = ctx;
  const R = selected.inputs;
  const avg = activeCropPlanAverages(R.cropPlans, R.capacityInputs, R.assumptions, studies.studies, R.cropPlanAssumptions);
  return {
    summary: table([{ label: 'Mean over active crop plans' }, { label: 'Per unit', num: true }], [
      row(['Inputs at purchase prices, before shrink', money(avg.asPurchasedPerUnit)]),
      row(['Input cost, with the shrink allowance', money(avg.inputCostPerUnit)]),
      row(['Labor cost, at the placeholder loaded rate', money(avg.laborCostPerUnit)]),
      row(['Cost to serve: food, labor, packaging, distribution', money(avg.costToServePerUnit)], 'total'),
      row(['Labor minutes per unit', num(avg.laborMinutesPerUnit, 2)]),
      row(['Sowing clock minutes, receiving to cold hold', num(avg.sowingMinutes, 0)]),
      row(['Active crop plans averaged', avg.count]),
      row(['Of which on an estimated study', avg.onEstimate]),
      row(['Of which with no study', avg.withoutStudy], avg.withoutStudy > 0 ? 'over' : undefined),
    ]),
    detail: table([{ label: 'Crop plan' }, { label: 'Sowing', num: true }, { label: 'Purchased / unit', num: true }, { label: 'Food / unit', num: true }, { label: 'Labor min / unit', num: true }, { label: 'Labor / unit', num: true }, { label: 'Cost to serve', num: true }, { label: 'Sowing minutes', num: true }],
      avg.cropPlans.map((r) => row([r.name, num(r.sowing), money(r.asPurchasedPerUnit), money(r.inputCostPerUnit), num(r.laborMinutesPerUnit, 2), money(r.laborCostPerUnit), money(r.costToServePerUnit), num(r.sowingMinutes, 0)]))),
    basis: 'Each active crop plan at its own derived sowing, its own labor standard and its packaging picks, at the prices in force. Storage is excluded from the cost to serve.',
    empty: avg.count === 0 ? 'No crop plan is In Service.' : undefined,
  };
};

// ── Financials & Accounting (admins) ────────────────────────────────────────

const incomeByPeriod: Builder = (ctx) => {
  const { selected } = ctx;
  const months = selected.ledger.months;
  const rows = months.map((m) => row([m.label, num(Math.round(m.unitsDistributed)), cents(m.incomeStatement.revenueCents), cents(m.incomeStatement.grossMarginCents), cents(m.incomeStatement.operatingIncomeCents), signedCents(m.incomeStatement.netIncomeCents)], m.incomeStatement.revenueCents === 0 ? 'faint' : undefined));
  for (const y of selected.ledger.years) rows.push(row([`Year ${y.label}`, num(Math.round(y.unitsDistributed)), cents(y.incomeStatement.revenueCents), cents(y.incomeStatement.grossMarginCents), cents(y.incomeStatement.operatingIncomeCents), signedCents(y.incomeStatement.netIncomeCents)], 'total'));
  return {
    summary: table([{ label: 'Period' }, { label: 'Units distributed', num: true }, { label: 'Revenue', num: true }, { label: 'Gross margin', num: true }, { label: 'Operating income', num: true }, { label: 'Net income, pre-tax', num: true }], rows),
    detail: table([{ label: 'Period' }, { label: 'Cost of goods sold at standard', num: true }, { label: 'Manufacturing variances', num: true }, { label: 'Gross margin at standard', num: true }, { label: 'Selling & distribution', num: true }, { label: 'General & administrative', num: true }, { label: 'Financing', num: true }],
      months.map((m) => {
        const s = m.incomeStatement;
        const sum = (xs: { cents: number }[]) => xs.reduce((t, x) => t + x.cents, 0);
        return row([m.label, cents(s.costOfGoodsSoldCents), signedCents(s.manufacturingVariancesCents), cents(s.grossMarginAtStandardCents), cents(sum(s.sellingAndDistribution)), cents(sum(s.generalAndAdministrative)), cents(sum(s.financing))], s.revenueCents === 0 ? 'faint' : undefined);
      })),
    basis: `${ctx.worldLabel}, ${selected.ledger.from} to ${selected.ledger.to}. The classified income statement by month; the year rows total the calendar year.`,
    empty: selected.empty ? 'Nothing is on record yet; every figure is zero.' : undefined,
  };
};

const costTrend: Builder = (ctx) => {
  const { selected } = ctx;
  const posted = new Map(selected.ledger.periods.map((p) => [p.period, p]));
  const rows = selected.ledger.months.map((m) => {
    const p = posted.get(m.label);
    const f = m.fixedExpense;
    return row([
      m.label,
      num(Math.round(m.servingsProduced)),
      num(Math.round(m.unitsDistributed)),
      p && p.servingsProduced > 0 ? money(p.standardCostPerUnitCents / 100) : '—',
      cents(f.manufacturingOverheadCents),
      cents(f.generalAndAdministrativeCents),
      cents(f.interestCents),
      cents(f.totalCents),
      f.perUnitCents === null ? '—' : money(f.perUnitCents / 100),
      cents(f.principalRepaidCents),
    ], m.unitsDistributed === 0 && m.servingsProduced === 0 ? 'faint' : undefined);
  });
  for (const y of selected.ledger.years) rows.push(row([`Year ${y.label}`, num(Math.round(y.servingsProduced)), num(Math.round(y.unitsDistributed)), '—', cents(y.fixedExpense.manufacturingOverheadCents), cents(y.fixedExpense.generalAndAdministrativeCents), cents(y.fixedExpense.interestCents), cents(y.fixedExpense.totalCents), y.fixedExpense.perUnitCents === null ? '—' : money(y.fixedExpense.perUnitCents / 100), cents(y.fixedExpense.principalRepaidCents)], 'total'));
  return {
    summary: table([{ label: 'Period' }, { label: 'Units made', num: true }, { label: 'Units distributed', num: true }, { label: 'Standard cost / unit', num: true }, { label: 'Manufacturing overhead', num: true }, { label: 'G&A', num: true }, { label: 'Interest', num: true }, { label: 'Fixed expense', num: true }, { label: 'Fixed / unit distributed', num: true }, { label: 'Principal repaid', num: true }], rows),
    detail: table([{ label: 'Period' }, { label: 'Overhead applied', num: true }, { label: 'Overhead incurred', num: true }, { label: 'Volume variance', num: true }, { label: 'Spending variance', num: true }],
      selected.ledger.months.map((m) => row([m.label, cents(m.overhead.appliedCents), cents(m.overhead.incurredCents), signedCents(m.overhead.volumeVarianceCents), signedCents(m.overhead.spendingVarianceCents)]))),
    basis: `${ctx.worldLabel}. Standard cost per unit is finished-goods cost over the units made in the period. Fixed cost per unit is a period metric on the expense basis and is never in the cost of a unit.`,
    empty: selected.empty ? 'Nothing is on record yet.' : undefined,
  };
};

const variances: Builder = (ctx) => {
  const { selected } = ctx;
  const months = selected.ledger.months;
  const lineLabels = [...new Set(months.flatMap((m) => m.incomeStatement.manufacturingVariances.map((v) => v.label)))];
  const rows = months.map((m) => {
    const s = m.incomeStatement;
    return row([m.label, cents(s.grossMarginAtStandardCents), signedCents(s.manufacturingVariancesCents), s.grossMarginAtStandardCents !== 0 ? pct(s.manufacturingVariancesCents / Math.abs(s.grossMarginAtStandardCents), 1) : '—', cents(s.grossMarginCents)], s.revenueCents === 0 && s.manufacturingVariancesCents === 0 ? 'faint' : undefined);
  });
  for (const y of selected.ledger.years) rows.push(row([`Year ${y.label}`, cents(y.incomeStatement.grossMarginAtStandardCents), signedCents(y.incomeStatement.manufacturingVariancesCents), y.incomeStatement.grossMarginAtStandardCents !== 0 ? pct(y.incomeStatement.manufacturingVariancesCents / Math.abs(y.incomeStatement.grossMarginAtStandardCents), 1) : '—', cents(y.incomeStatement.grossMarginCents)], 'total'));
  const detail = months.flatMap((m) => m.incomeStatement.manufacturingVariances.filter((v) => v.cents !== 0).map((v) => row([m.label, v.code, v.label, signedCents(v.cents)])));
  return {
    summary: table([{ label: 'Period' }, { label: 'Gross margin at standard', num: true }, { label: 'Manufacturing variances', num: true }, { label: 'Share of margin at standard', num: true }, { label: 'Gross margin', num: true }], rows),
    detail: table([{ label: 'Period' }, { label: 'Account' }, { label: 'Variance' }, { label: 'Amount', num: true }], detail),
    basis: `${ctx.worldLabel}. Variance lines on the income statement: ${lineLabels.length ? lineLabels.join(', ') : 'none posted'}. A negative amount is unfavourable to margin as the statement signs it.`,
    empty: detail.length === 0 ? 'No variance has posted.' : undefined,
  };
};

const workingCapitalAging: Builder = (ctx) => {
  const { selected, today, pos } = ctx;
  const bundle = selected.bundle;
  const isPlan = selected.kind === 'plan';
  const asOf = isPlan ? (selected.ledger.months.find((m) => m.from <= today && today <= m.to)?.to ?? selected.ledger.to) : today;
  const ar = invoiceBalances(bundle.invoices ?? [], bundle.distributions, bundle.subscriberPayments ?? []);
  const arAging = agingReport(ar.filter((b) => b.invoice.status === 'issued').map((b) => ({ id: b.invoice.id, party: b.invoice.subscriberName, document: b.invoice.invoiceNumber, date: b.invoice.issuedOn ?? b.invoice.openedOn, dueOn: b.invoice.dueOn, amountCents: b.amountCents, openCents: b.openCents })), asOf);
  const purchaseOrders = isPlan && selected.timeline
    ? selected.timeline.documents.purchaseOrders.map((p) => ({ id: p.id, poNumber: p.id, lines: p.lines.map((l) => ({ input: l.input, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents })) }))
    : pos.map((p) => ({ id: p.id, poNumber: p.poNumber, lines: p.lines.map((l) => ({ input: l.input, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents })) }));
  const bills = bundle.supplierBills ?? [];
  const balances = billBalances(bills, bundle.receipts, purchaseOrders, bundle.supplierPayments ?? []);
  const periodBillItems: OpenItem[] = bundle.bills.filter((b) => !b.paidOn).map((b) => {
    const date = b.incurredOn ?? periodStart(b.period);
    return { id: b.id, party: b.vendor ?? BILL_CATEGORY_LABELS[b.category], document: b.invoiceNumber ?? b.category, date, dueOn: dueOn(date, b.paymentTerms ?? null), amountCents: b.amountCents, openCents: b.amountCents };
  });
  const seedAging = agingReport([...balances.map((b) => ({ id: b.bill.id, party: b.bill.supplierName, document: b.bill.billNumber, date: b.bill.billDate, dueOn: b.dueOn, amountCents: b.amountCents, openCents: b.openCents })), ...periodBillItems], asOf);
  const mismatched = balances.filter((b) => b.match.status === 'mismatched');
  const bucketCols = AGING_BUCKETS.map((b) => ({ label: AGING_LABELS[b], num: true }));
  const summary = table([{ label: 'Book' }, ...bucketCols, { label: 'Open', num: true }], [
    row(['Receivables — issued invoices', ...AGING_BUCKETS.map((b) => cents(arAging.totals[b])), cents(arAging.totalCents)]),
    row(['Payables — bills and period bills', ...AGING_BUCKETS.map((b) => cents(seedAging.totals[b])), cents(seedAging.totalCents)]),
    row(['Bills flagged on the three-way match, held from payment', ...AGING_BUCKETS.map(() => ''), `${mismatched.length} · ${cents(mismatched.reduce((t, b) => t + b.openCents, 0))}`], mismatched.length > 0 ? 'over' : undefined),
  ]);
  const detail = table([{ label: 'Book' }, { label: 'Party' }, ...bucketCols, { label: 'Open', num: true }], [
    ...arAging.rows.map((r) => row(['Receivables', r.party, ...AGING_BUCKETS.map((b) => cents(r.buckets[b])), cents(r.totalCents)])),
    ...seedAging.rows.map((r) => row(['Payables', r.party, ...AGING_BUCKETS.map((b) => cents(r.buckets[b])), cents(r.totalCents)])),
  ]);
  return {
    summary,
    detail,
    basis: `${ctx.worldLabel}, aged as of ${asOf} in calendar days past the due date each document's terms set.`,
    empty: arAging.rows.length === 0 && seedAging.rows.length === 0 ? 'Nothing is open on either book.' : undefined,
  };
};

const planVActual: Builder = async (ctx) => {
  const { today } = ctx;
  const y = Number(today.slice(0, 4));
  const q = Math.floor((Number(today.slice(5, 7)) - 1) / 3);
  const months = [0, 1, 2].map((i) => `${y}-${String(q * 3 + i + 1).padStart(2, '0')}`).filter((m) => m <= today.slice(0, 7));
  const pva = await buildPlanVsActual(months);
  const p = sumMeasures(pva.months.map((m) => m.plan.measures));
  const a = sumMeasures(pva.months.map((m) => m.actual.measures));
  const diff = (plan: number | null, actual: number | null, fmt: (v: number) => string) => (plan === null || actual === null ? '—' : actual - plan === 0 ? '0' : `${actual - plan > 0 ? '+' : '−'}${fmt(Math.abs(actual - plan))}`);
  const line = (label: string, pick: (m: PvaMeasures) => number | null, fmt: (v: number) => string) => {
    const pv = pick(p);
    const av = pick(a);
    return row([label, pv === null ? '—' : fmt(pv), av === null ? '—' : fmt(av), diff(pv, av, fmt)]);
  };
  const n = (v: number) => num(v);
  const summary = table([{ label: 'Figure' }, { label: 'Plan', num: true }, { label: 'Actual', num: true }, { label: 'Actual − plan', num: true }], [
    line('Units distributed', (m) => m.units, n),
    line('Orders', (m) => m.orders, n),
    line('Sowings', (m) => m.sowings, n),
    line('New subscribers', (m) => m.newSubscribers, n),
    line('Labor hours', (m) => m.laborHours, (v) => num(v, 1)),
    line('Revenue', (m) => m.revenueCents, cents),
    line('Input cost', (m) => m.inputCostCents, cents),
    line('Labor cost', (m) => m.laborCostCents, cents),
    line('Served cost per unit', (m) => servedCostPerUnitCents(m), (v) => money(v / 100, 2)),
    line('Waste, kg', (m) => m.wasteKg, (v) => num(v, 0)),
    line('Emissions, t CO2e', (m) => m.emissionsKg.total, (v) => (v / 1000).toFixed(2)),
  ]);
  const detail = table([{ label: 'Month' }, { label: 'Plan in force' }, { label: 'Units, plan', num: true }, { label: 'Units, actual', num: true }, { label: 'Revenue, plan', num: true }, { label: 'Revenue, actual', num: true }, { label: 'Input cost, plan', num: true }, { label: 'Input cost, actual', num: true }, { label: 'Cash at month end, actual', num: true }],
    pva.months.map((m) => row([m.period, m.outsidePlanWindow ? `${m.planInForce.label ?? 'plan defaults'} (outside its window)` : (m.planInForce.label ?? 'plan defaults'), num(m.plan.measures.units), num(m.actual.measures.units), cents(m.plan.measures.revenueCents), cents(m.actual.measures.revenueCents), cents(m.plan.measures.inputCostCents), cents(m.actual.measures.inputCostCents), cents(m.closingCashCents.actual)])));
  return {
    summary,
    detail,
    basis: `${months[0]} to ${months[months.length - 1]}: each month against the plan of record in force at its end${pva.trailEntries > 0 ? ` (${pva.trailEntries} change${pva.trailEntries === 1 ? '' : 's'} of the plan of record on the trail)` : ''}. Reference food basis, Scope 2 location-based.`,
    empty: a.units === 0 && a.sowings === 0 && a.revenueCents === 0 ? 'Nothing is on record in the quarter yet.' : undefined,
  };
};

// ── Cold Chain ──────────────────────────────────────────────────────────────

const inventoryPosition: Builder = (ctx) => {
  const { selected, finished, today } = ctx;
  const R = selected.inputs;
  const cropPlanName = (code: string) => R.cropPlans.find((r) => r.code === code)?.name ?? code;
  const open = finished.lots.filter((l) => l.remaining > 1e-9).map((l) => ({ ...l, days: daysBetween(today, l.expires) })).sort((a, b) => a.expires.localeCompare(b.expires));
  const units = open.reduce((s, l) => s + l.remaining, 0);
  const expiring = open.filter((l) => l.days <= 7);
  const expiredUnconsumed = finished.lots.filter((l) => l.expires < today && l.remaining > 1e-9);
  const raw = rawLotsByUseBy(rawStockOnHand({ receipts: selected.bundle.receipts, sowings: selected.bundle.sowings, asOf: today }));
  const rawPast = raw.filter((l) => l.daysToUseBy !== null && l.daysToUseBy < 0);
  const rawValue = raw.reduce((s, l) => s + l.remaining * l.unitPriceCents, 0);
  const summary = table([{ label: 'Measure' }, { label: 'Value', num: true }], [
    row(['Finished lots on hand, inside shelf life', open.length]),
    row(['Units on hand', num(Math.round(units))]),
    row(['Lots within seven days of shelf life', expiring.length], expiring.length > 0 ? 'over' : undefined),
    row(['Units in those lots', num(Math.round(expiring.reduce((s, l) => s + l.remaining, 0)))]),
    row(['Units past shelf life, unconsumed', num(Math.round(expiredUnconsumed.reduce((s, l) => s + l.remaining, 0)))], expiredUnconsumed.length > 0 ? 'over' : undefined),
    row(['Blackout shelf life, days', R.assumptions.inventory.blackoutShelfLife.value]),
    row(['Raw lots on hand', raw.length]),
    row(['Raw lots past the date on the case', rawPast.length], rawPast.length > 0 ? 'over' : undefined),
    row(['Raw materials on hand, at invoice', cents(rawValue)]),
  ]);
  const detail = table([{ label: 'Lot' }, { label: 'Crop plan' }, { label: 'Produced' }, { label: 'Shelf life ends' }, { label: 'Days left', num: true }, { label: 'Units', num: true }, { label: 'Status' }], [
    ...open.map((l) => row([l.sowingId, cropPlanName(l.cropPlanCode), l.produced, l.expires, l.days, num(Math.round(l.remaining)), l.days <= 7 ? 'Expiring' : 'In hold'], l.days <= 7 ? 'over' : undefined)),
    ...raw.map((l) => row([`${l.input} · ${l.lotCode}`, 'Raw material', l.receivedOn, l.useBy ?? '—', l.daysToUseBy ?? '—', `${num(l.remaining, 1)} ${l.unit}`, l.daysToUseBy !== null && l.daysToUseBy < 0 ? 'Past use-by' : 'On hand'], l.daysToUseBy !== null && l.daysToUseBy < 0 ? 'over' : undefined)),
  ]);
  return {
    summary,
    detail,
    basis: `${ctx.worldLabel}, as of ${today}. Finished goods are closed sowings less distributed orders, drawn oldest first and aged against the shelf life; raw lots are receipts less issues, by the date on the case.`,
    empty: open.length === 0 && raw.length === 0 ? 'Nothing is on hand.' : undefined,
  };
};

const coolingCompliance: Builder = (ctx) => {
  const { records, selected, today } = ctx;
  const R = selected.inputs;
  const cropPlanName = (code: string) => R.cropPlans.find((r) => r.code === code)?.name ?? code;
  const log = coolingLog(records, cropPlanName);
  const owed = blackoutLotsOwed(records, R, cropPlanName);
  interface Acc { records: number; passed: number; failed: number; lots: number; lotsComplete: number }
  const months = new Map<string, Acc>();
  const get = (m: string) => { const a = months.get(m) ?? { records: 0, passed: 0, failed: 0, lots: 0, lotsComplete: 0 }; months.set(m, a); return a; };
  for (const r of log) { const a = get(monthOf(r.date)); a.records += 1; if (r.pass) a.passed += 1; else a.failed += 1; }
  for (const l of owed) { const a = get(monthOf(l.date)); a.lots += 1; if (l.recorded >= l.expected) a.lotsComplete += 1; }
  const rows = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, a]) => row([m, a.records, a.passed, a.failed, `${a.lotsComplete} / ${a.lots}`], a.failed > 0 || a.lotsComplete < a.lots ? 'over' : undefined));
  const t = [...months.values()].reduce((s, a) => ({ records: s.records + a.records, passed: s.passed + a.passed, failed: s.failed + a.failed, lots: s.lots + a.lots, lotsComplete: s.lotsComplete + a.lotsComplete }), { records: 0, passed: 0, failed: 0, lots: 0, lotsComplete: 0 });
  rows.push(row(['All months', t.records, t.passed, t.failed, `${t.lotsComplete} / ${t.lots}`], 'total'));
  const detail = table([{ label: 'Date' }, { label: 'Lot' }, { label: 'Load', num: true }, { label: 'Product' }, { label: '2 h °F', num: true }, { label: '6 h °F', num: true }, { label: 'Result' }],
    [...log].sort((a, b) => b.date.localeCompare(a.date) || a.lot.localeCompare(b.lot) || a.load - b.load).map((r) => row([r.date, r.lot, r.load, r.product, r.t2, r.t6, r.pass ? 'Pass' : `Fail — ${r.reason}`], r.pass ? undefined : 'over')));
  return {
    summary: table([{ label: 'Month' }, { label: 'Stage records', num: true }, { label: 'Passed', num: true }, { label: 'Failed', num: true }, { label: 'Blackout lots with every load recorded', num: true }], rows),
    detail,
    basis: `The closed sowing records as of ${today}. Pass or fail is computed from the readings against ${CCP2_LIMITS.startF}°F to ${CCP2_LIMITS.twoHourMaxF}°F within 2 hours and to ${CCP2_LIMITS.sixHourMaxF}°F within 6; one record per rack load.`,
    empty: log.length === 0 && owed.length === 0 ? 'No sowing record has been closed.' : undefined,
  };
};

// ── Supply Chain ────────────────────────────────────────────────────────────

const supplyPosition: Builder = (ctx) => {
  const { records, pos, today } = ctx;
  const stock = rawStockOnHand({ receipts: records.receipts, sowings: records.sowings, asOf: today });
  const rawLots = rawLotsByUseBy(stock);
  const rawValue = rawLots.reduce((s, l) => s + l.remaining * l.unitPriceCents, 0);
  const openPos = pos.filter((p) => p.status === 'draft' || p.status === 'issued');
  const since = isoAddDays(today, -30);
  const recent = records.receipts.filter((r) => r.receivedOn >= since && r.receivedOn <= today);
  const recentLines = recent.flatMap((r) => r.lines);
  const rejected = recentLines.filter((l) => l.condition === 'rejected');
  const summary = table([{ label: 'Measure' }, { label: 'Value', num: true }], [
    row(['Raw materials on hand, at invoice', cents(rawValue)]),
    row(['Raw lots on hand', rawLots.length]),
    row(['Inputs with stock', Object.keys(stock.byInput).length]),
    row(['Purchase orders open', openPos.length]),
    row(['Value on open purchase orders', cents(openPos.reduce((t, p) => t + p.subtotalCents, 0))]),
    row([`Receipts, ${since} to ${today}`, recent.length]),
    row(['Value received', cents(recent.reduce((t, r) => t + receiptValueCents(r), 0))]),
    row(['Lines rejected at the dock', rejected.length], rejected.length > 0 ? 'over' : undefined),
  ]);
  const detail = table([{ label: 'Purchase order' }, { label: 'Supplier' }, { label: 'Status' }, { label: 'Ordered for' }, { label: 'Lines', num: true }, { label: 'Subtotal', num: true }, { label: 'Receipts on file', num: true }],
    [...pos].sort((a, b) => b.orderedFor.localeCompare(a.orderedFor)).map((p) => row([p.poNumber, p.supplierName, p.status, p.orderedFor, p.lines.length, cents(p.subtotalCents), records.receipts.filter((r) => r.poId === p.id).length], p.status === 'draft' || p.status === 'issued' ? undefined : 'faint')));
  return {
    summary,
    detail,
    basis: `The records as of ${today}: receipts less what closed sowings issued, and the purchase orders on file.`,
    empty: rawLots.length === 0 && pos.length === 0 ? 'No receipt or purchase order is on file.' : undefined,
  };
};

const supplierActivity: Builder = (ctx) => {
  const { records, today } = ctx;
  interface Acc { receipts: number; valueCents: number; lines: number; rejected: number; variance: number; tempTaken: number; lastOn: string }
  const bySupplier = new Map<string, Acc>();
  for (const r of records.receipts) {
    const key = r.supplierName ?? 'No supplier named';
    const a = bySupplier.get(key) ?? { receipts: 0, valueCents: 0, lines: 0, rejected: 0, variance: 0, tempTaken: 0, lastOn: '' };
    a.receipts += 1;
    a.valueCents += receiptValueCents(r);
    a.lines += r.lines.length;
    a.rejected += r.lines.filter((l) => l.condition === 'rejected').length;
    a.variance += r.lines.filter((l) => (l.poQty !== null && l.poQty !== undefined && l.poQty !== l.qty) || (l.poUnitPriceCents !== null && l.poUnitPriceCents !== undefined && l.poUnitPriceCents !== l.unitPriceCents)).length;
    a.tempTaken += r.lines.filter((l) => l.receivedTempF !== null && l.receivedTempF !== undefined).length;
    if (r.receivedOn > a.lastOn) a.lastOn = r.receivedOn;
    bySupplier.set(key, a);
  }
  const rows = [...bySupplier.entries()].sort(([, a], [, b]) => b.valueCents - a.valueCents).map(([s, a]) => row([s, a.receipts, cents(a.valueCents), a.lines, a.rejected, a.variance, a.lines > 0 ? pct(a.tempTaken / a.lines, 0) : '—', a.lastOn], a.rejected > 0 || a.variance > 0 ? 'over' : undefined));
  const t = [...bySupplier.values()].reduce((s, a) => ({ receipts: s.receipts + a.receipts, valueCents: s.valueCents + a.valueCents, lines: s.lines + a.lines, rejected: s.rejected + a.rejected, variance: s.variance + a.variance, tempTaken: s.tempTaken + a.tempTaken }), { receipts: 0, valueCents: 0, lines: 0, rejected: 0, variance: 0, tempTaken: 0 });
  rows.push(row(['All suppliers', t.receipts, cents(t.valueCents), t.lines, t.rejected, t.variance, t.lines > 0 ? pct(t.tempTaken / t.lines, 0) : '—', ''], 'total'));
  const detail = table([{ label: 'Received' }, { label: 'Supplier' }, { label: 'Invoice' }, { label: 'Input' }, { label: 'Qty', num: true }, { label: 'On the order', num: true }, { label: '$/unit', num: true }, { label: 'Temp °F', num: true }, { label: 'Condition' }, { label: 'Override reason' }],
    [...records.receipts].sort((a, b) => b.receivedOn.localeCompare(a.receivedOn)).flatMap((r) => r.lines.map((l) => row([r.receivedOn, r.supplierName ?? '—', r.invoiceNumber ?? '—', l.input, `${num(l.qty, 2)} ${l.unit}`, l.poQty === null || l.poQty === undefined ? '—' : num(l.poQty, 2), money(l.unitPriceCents / 100), l.receivedTempF ?? '—', l.condition === 'rejected' ? 'Rejected' : l.condition === 'accepted_with_note' ? 'Accepted with note' : 'Accepted', l.overrideReason ?? ''], l.condition === 'rejected' ? 'over' : undefined))));
  return {
    summary: table([{ label: 'Supplier' }, { label: 'Receipts', num: true }, { label: 'Value received', num: true }, { label: 'Lines', num: true }, { label: 'Rejected', num: true }, { label: 'Short, over or repriced', num: true }, { label: 'Temp taken', num: true }, { label: 'Last receipt' }], rows),
    detail,
    basis: `Every receipt on the records as of ${today}. A line received short, over or at a changed price carries its override reason; receiving has no tolerance.`,
    empty: records.receipts.length === 0 ? 'No receipt is on file.' : undefined,
  };
};

// ── Sustainability ──────────────────────────────────────────────────────────

async function sustainabilityWorld(ctx: Ctx) {
  const { selected, today } = ctx;
  const R = selected.inputs;
  const kind = selected.kind;
  const [basis, supplierOptions] = await Promise.all([postSustainabilityBasis(kind, selected.view.config), listSupplierLcaOptions()]);
  const year = R.sustainability.audit.reportingYear;
  const recs = kind === 'actual' ? await loadSustainabilityRecords(year) : null;
  const energy = recs ? energyFromReadings(recs.readings, year) : R.sustainability.energy;
  const refrigerantService = recs ? serviceFromRecords(recs.refrigerantService) : {};
  const asOf = kind === 'actual' && today.startsWith(`${year}-`) ? today : basis.to;
  const suppliers = leanSuppliersById(Object.values(R.sustainability.inputSupplier));
  const periodLabel = kind === 'plan' ? `the forecast's first year, ${basis.from} to ${basis.to}` : `reporting year ${year}`;
  return { R, basis, energy, refrigerantService, asOf, suppliers, options: [...curatedOptions, ...supplierOptions], periodLabel };
}

const emissionsStatement: Builder = async (ctx) => {
  const w = await sustainabilityWorld(ctx);
  const inv = fullInventory(w.R, w.asOf, { basis: w.basis, energy: w.energy, refrigerantService: w.refrigerantService }, w.suppliers, w.options);
  const t = (kg: number) => (kg / 1000).toFixed(2);
  const rows = inv.lines.map((l) => row([`Scope ${l.scope}`, l.label, l.kg === 0 ? '—' : t(l.kg), l.basis, l.activity, l.weakest ?? '—'], l.kg === 0 ? 'faint' : undefined));
  rows.push(row(['Total', 'Reference food basis · Scope 2 location-based', t(inv.reference.location.totalKg), `market-based ${t(inv.reference.market.totalKg)}`, '', ''], 'total'));
  rows.push(row(['Total', 'Selected food basis · Scope 2 location-based', t(inv.selected.location.totalKg), `market-based ${t(inv.selected.market.totalKg)}`, `food gap ${t(inv.foodGapKg)}`, ''], 'total'));
  rows.push(row(['Per unit', 'kg CO2e, reference', (inv.normalizers.reference.kgPerUnit ?? 0).toFixed(2), `${num(inv.annualUnits)} units`, '', '']));
  rows.push(row(['Per sq ft', 'kg CO2e, reference', (inv.normalizers.reference.kgPerSqFt ?? 0).toFixed(1), '', '', '']));
  rows.push(row(['Per operating day', 't CO2e, reference', t(inv.normalizers.reference.kgPerOperatingDay ?? 0), `${num(inv.operatingDays)} distribution days`, '', '']));
  const detail = table([{ label: 'Scope' }, { label: 'Category' }, { label: 'Period' }, { label: 'CO2e kg', num: true }, { label: 'Factor' }, { label: 'Factor status' }],
    inv.postings.map((p) => row([`Scope ${p.scope}${p.scope2Method ? ` (${p.scope2Method})` : ''}`, p.category, p.period, num(p.co2eKg, 1), `${p.factorId} v${p.factorVersion}`, p.factorStatus])));
  return {
    summary: table([{ label: 'Scope' }, { label: 'Line' }, { label: 't CO2e', num: true }, { label: 'Basis' }, { label: 'Activity' }, { label: 'Weakest status' }], rows),
    detail,
    basis: `${ctx.worldLabel}, ${w.periodLabel}, as of ${w.asOf}. Empty lines mean no input has been applied, never an estimate. Factor fingerprint ${inv.fingerprint}.`,
    empty: inv.annualUnits === 0 ? 'No unit is distributed in the period on this world.' : undefined,
  };
};

const wasteEndOfLife: Builder = async (ctx) => {
  const w = await sustainabilityWorld(ctx);
  const R = w.R;
  const produced = mixShrinkKg(w.basis, R.cropPlans, R.assumptions.yield.shrinkAllowance.value);
  const expired = expiredMassKg(w.basis, R.cropPlans);
  const tons = produced.kg / KG_PER_SHORT_TON;
  const share = R.sustainability.waste.compostShare;
  const net = warmNet(tons, share);
  const landfill = warmNet(tons, 0);
  const compost = warmNet(tons, 1);
  const cropPlanName = (code: string) => R.cropPlans.find((r) => r.code === code)?.name ?? code;
  const summary = table([{ label: 'Measure' }, { label: 'Value', num: true }], [
    row(['Units produced in the period', num(produced.units)]),
    row(['As-purchased food mass per unit', produced.units > 0 ? `${((produced.seedKg / produced.units) * 1000).toFixed(0)} g` : '—']),
    row(['Shrink allowance', pct(R.assumptions.yield.shrinkAllowance.value, 0)]),
    row(['Shrink mass', `${num(produced.kg)} kg · ${tons.toFixed(2)} short tons`]),
    row(['Finished units past shelf life, unshipped', num(Math.round(expired.units))], expired.units > 1e-9 ? 'over' : undefined),
    row(['Their mass', `${num(expired.kg)} kg`]),
    row([`Shrink at the ${pct(share, 0)} compost share, t CO2e`, (net.netKg / 1000).toFixed(2)], 'total'),
    row(['All to landfill, t CO2e', (landfill.netKg / 1000).toFixed(2)]),
    row(['All to compost, t CO2e', (compost.netKg / 1000).toFixed(2)]),
    row(['Difference between the two pathways, t CO2e', ((landfill.netKg - compost.netKg) / 1000).toFixed(2)]),
  ]);
  const detail = table([{ label: 'Crop plan' }, { label: 'Units produced', num: true }, { label: 'Units past shelf life, unshipped', num: true }], [
    ...Object.entries(w.basis.producedByCropPlan).map(([code, n]) => row([cropPlanName(code), num(Math.round(n)), num(Math.round(w.basis.expiredByCropPlan[code] ?? 0))], (w.basis.expiredByCropPlan[code] ?? 0) > 1e-9 ? 'over' : undefined)),
    ...Object.entries(w.basis.expiredByCropPlan).filter(([code]) => !(code in w.basis.producedByCropPlan)).map(([code, n]) => row([cropPlanName(code), '—', num(Math.round(n))], 'over')),
  ]);
  return {
    summary,
    detail,
    basis: `${ctx.worldLabel}, ${w.periodLabel}. Shrink is the allowance on every sowing as mass; the pathways are on the WARM food-waste factors.`,
    empty: produced.units === 0 && expired.units === 0 ? 'Nothing is produced in the period on this world.' : undefined,
  };
};

const refrigerantLeakage: Builder = async (ctx) => {
  const w = await sustainabilityWorld(ctx);
  const R = w.R;
  const carried = R.equipment.filter((e) => countsTowardCapital(e.status)).map((e) => ({ item: e.key, qty: e.qty }));
  const inv = refrigerantInventory(carried, R.sustainability.equipment, w.refrigerantService, w.asOf);
  const rows = inv.rows;
  const fullCharge = rows.reduce((s, r) => s + r.circuit.fullChargeLb * r.quantity, 0);
  const added = rows.reduce((s, r) => s + r.lbAddedInYear, 0);
  const triggered = rows.filter((r) => r.findings.some((f) => f.status === 'triggered'));
  const summary = table([{ label: 'Measure' }, { label: 'Value', num: true }], [
    row(['Circuits on file', inv.circuitsOnFile]),
    row(['Full charge across circuits, lb', num(fullCharge, 1)]),
    row(['Refrigerant added this year, lb', num(added, 1)]),
    row(['Aggregate annualized leak rate', fullCharge > 0 ? pct(added / fullCharge, 1) : '—']),
    row(['CO2e from leaks this year, kg', num(inv.totalCo2eKgInYear, 0)]),
    row(['Circuits with a triggered finding', triggered.length], triggered.length > 0 ? 'over' : undefined),
    row(['Circuits without a GWP on file', rows.filter((r) => !r.gwpOnFile).length]),
  ]);
  const detail = table([{ label: 'Equipment' }, { label: 'Refrigerant' }, { label: 'Units', num: true }, { label: 'Full charge lb', num: true }, { label: 'Added this year lb', num: true }, { label: 'Latest annualized rate', num: true }, { label: 'CO2e kg this year', num: true }, { label: 'Findings' }],
    rows.map((r) => row([r.circuit.equipment, r.circuit.refrigerant, r.quantity, num(r.circuit.fullChargeLb * r.quantity, 1), num(r.lbAddedInYear, 1), r.latestRate === null ? '—' : pct(r.latestRate, 1), num(r.co2eKgInYear, 0), r.findings.filter((f) => f.status === 'triggered').map((f) => f.rule).join('; ') || '—'], r.findings.some((f) => f.status === 'triggered') ? 'over' : undefined)));
  return {
    summary,
    detail,
    basis: `${ctx.worldLabel}, as of ${w.asOf}. A forecast carries no leaks; service additions are recorded on Actual. Rates follow the EPA method: refrigerant added over the full charge, annualized.`,
    empty: inv.circuitsOnFile === 0 ? 'No equipment line carries a refrigerant and a charge.' : undefined,
  };
};

// ── People ──────────────────────────────────────────────────────────────────

const staffDemandReport: Builder = (ctx) => {
  const { horizon, horizonFrom, horizonTo, studies, selected } = ctx;
  const R = selected.inputs;
  const harvest = horizon.distributionDays.map((d) => ({ date: d.date, shipments: d.byCropPlan.map((r) => ({ cropPlanCode: r.cropPlanCode, cropPlanName: r.cropPlanName, units: r.filledBase })) }));
  const shelf = traysOnShelf(horizon.productionDays, cycleDaysByCode(R.cropPlans), horizonFrom, horizonTo);
  const demand = staffDemand({ from: horizonFrom, to: horizonTo, days: horizon.productionDays, harvest, shelf, studies: studies.studies });
  const busiest = demand.days.reduce<(typeof demand.days)[number] | null>((m, d) => (!m || d.staffHours > m.staffHours ? d : m), null);
  const cropPlanName = (code: string) => R.cropPlans.find((r) => r.code === code)?.name ?? code;
  const summary = table([{ label: 'Measure' }, { label: 'Value', num: true }], [
    row(['Production days with sowings', demand.productionDays]),
    row(['Distribution days', demand.distributionDays]),
    row(['Staff-hours required', num(demand.staffHours, 1)]),
    row(['Busiest day', busiest && busiest.staffHours > 0 ? `${busiest.date} · ${num(busiest.staffHours, 1)} h` : '—']),
    row(['Most people on one task, any day', demand.days.reduce((m, d) => Math.max(m, d.mostPeopleOnATask), 0)]),
    row(['Crop plans with no time study', demand.uncoveredCropPlans.length], demand.uncoveredCropPlans.length > 0 ? 'over' : undefined),
    row(['Crop plans staffed from an estimate', demand.estimatedCropPlans.length]),
  ]);
  const detail = table([{ label: 'Date' }, { label: 'Sowings', num: true }, { label: 'Units made', num: true }, { label: 'Units shipped', num: true }, { label: 'Staff-hours', num: true }, { label: 'Sowing stream h', num: true }, { label: 'Harvest stream h', num: true }, { label: 'Most people on a task', num: true }, { label: 'No study' }],
    demand.days.map((d) => row([d.date, d.sowings, num(Math.round(d.units)), num(Math.round(d.unitsShipped)), num(d.staffHours, 1), num(d.sowingStaffHours, 1), num(d.harvestStaffHours, 1), d.mostPeopleOnATask, d.uncovered.map((u) => cropPlanName(u.cropPlanCode)).join(', ')], d.uncovered.length > 0 ? 'over' : undefined)));
  return {
    summary,
    detail,
    basis: `${horizonFrom} to ${horizonTo} on ${ctx.worldLabel}: each crop plan's scheduled sowings and shipments staffed from its labor standard. Headcount and hours by task; no positions and no pay.`,
    empty: demand.days.length === 0 ? 'No sowing or shipment in the next two weeks on this world.' : undefined,
  };
};

const hoursOvertime: Builder = (ctx) => {
  const { records, selected, today } = ctx;
  const staff = (records.staff ?? []).filter((s) => s.status === 'active');
  const punches = records.punches ?? [];
  const period = payPeriodFor(today, selected.inputs.payCalendar);
  const run = hoursRun(period, staff, punches);
  const byId = new Map(staff.map((s) => [s.id, s]));
  const withHours = run.lines.filter((l) => l.regularHours + l.overtimeHours > 0).length;
  const onClock = staff.filter((s) => clockStateOf(punches.filter((p) => p.staffId === s.id)) !== 'out').length;
  const summary = table([{ label: 'Measure' }, { label: 'Value', num: true }], [
    row(['Pay period', `${period.start} to ${period.end}`]),
    row(['On the staff register', staff.length]),
    row(['People with hours this period', withHours]),
    row(['Regular hours', num(run.regularHours, 1)]),
    row(['Overtime hours', num(run.overtimeHours, 1)], run.overtimeHours > 0 ? 'over' : undefined),
    row(['Overtime share of hours', run.regularHours + run.overtimeHours > 0 ? pct(run.overtimeHours / (run.regularHours + run.overtimeHours), 1) : '—']),
    row(['Open shifts', run.openShifts]),
    row(['On the clock now', onClock]),
  ]);
  const detail = table([{ label: 'Person' }, { label: 'Job title' }, { label: 'Work roles' }, { label: 'Regular h', num: true }, { label: 'Overtime h', num: true }, { label: 'Open shifts', num: true }, { label: 'Clock' }],
    run.lines.map((l) => { const s = byId.get(l.staffId); return row([s?.name ?? l.staffId, s?.role ?? '—', (s?.roles ?? []).join(', ') || '—', num(l.regularHours, 1), num(l.overtimeHours, 1), l.openShifts, CLOCK_STATE_LABELS[clockStateOf(punches.filter((p) => p.staffId === l.staffId))]], l.overtimeHours > 0 ? 'over' : undefined); }));
  return {
    summary,
    detail,
    basis: `The time clock for the pay period holding ${today}. Hours only; pay, payroll and benefits are held in Staffing.`,
    empty: staff.length === 0 ? 'Nobody is on the staff register.' : undefined,
  };
};

const trainingCompletion: Builder = async () => {
  const [docs, assignments, staff] = await Promise.all([listTrainingDocs(), listTrainingAssignments(), listActiveStaff()]);
  const active = activeVersions(docs);
  const staffIds = staff.map((s) => s.id);
  const completions = active.map((d) => ({ doc: d, c: completionFor(d.id, assignments, staffIds) }));
  const totalOutstanding = completions.reduce((s, x) => s + x.c.outstanding, 0);
  const currentPeople = staffIds.filter((id) => completions.every((x) => x.c.rows.find((r) => r.staffId === id)?.completedAt)).length;
  const summary = table([{ label: 'Measure' }, { label: 'Value', num: true }], [
    row(['Documents in force', active.length]),
    row(['Versions on file, all documents', docs.length]),
    row(['People on the staff register', staff.length]),
    row(['People current on every document in force', active.length > 0 ? currentPeople : '—']),
    row(['Completions outstanding', totalOutstanding], totalOutstanding > 0 ? 'over' : undefined),
    row(['Documents required at orientation', active.filter((d) => d.requiredAtOrientation).length]),
  ]);
  const detail = table([{ label: 'Document' }, { label: 'Version', num: true }, { label: 'Published' }, { label: 'Assigned', num: true }, { label: 'Completed', num: true }, { label: 'Outstanding', num: true }, { label: 'Share complete', num: true }, { label: 'Orientation' }],
    completions.map(({ doc, c }) => row([doc.title, doc.version, doc.publishedAt?.slice(0, 10) ?? '—', c.assigned, c.completed, c.outstanding, c.share === null ? '—' : pct(c.share, 0), doc.requiredAtOrientation ? 'Required' : ''], c.outstanding > 0 ? 'over' : undefined)));
  return {
    summary,
    detail,
    basis: 'Assignment follows the staff register: everyone on it is assigned every document in force. Completion is recorded against the version, so a completed earlier version is not a completion of the version in force.',
    empty: active.length === 0 ? 'No training document is in force.' : undefined,
  };
};

// ── Sales ───────────────────────────────────────────────────────────────────

const orderBookAccuracy: Builder = (ctx) => {
  const { selected, orders, cycles, closures, records, today } = ctx;
  const R = selected.inputs;
  const isPlan = selected.kind === 'plan';
  const from = isoAddDays(today, -30);
  const to = isoAddDays(today, 14);
  const book: BookOrder[] = orderBook({
    pickupPoints: isPlan ? R.demand.pickupPoints : resolveSubscriberPickupPoints(R.subscribers, {}, { closures }),
    subscribers: R.subscribers,
    cycles,
    orders: isPlan ? [] : orders,
    from,
    to,
    channelPriceCents: Object.fromEntries(R.phases.map((p) => [p.phase, Math.round(p.pricePerUnit * 100)])) as Record<number, number>,
    cropPlanNames: Object.fromEntries(R.cropPlans.map((r) => [r.code, r.name])),
    closures,
  });
  const rows = pickupPointActualVsForecast(book, new Map(records.distributions.map((d) => [d.id, d.units])));
  const channelName = (c: number) => R.phases.find((p) => p.phase === c)?.market ?? `Channel ${c}`;
  const t = rows.reduce((s, r) => ({ serviceDates: s.serviceDates + r.serviceDates, forecast: s.forecast + r.forecastUnits, confirmed: s.confirmed + r.confirmedUnits, distributedOrders: s.distributedOrders + r.distributedOrders, ordered: s.ordered + r.orderedOnDistributed, distributed: s.distributed + r.distributedUnits }), { serviceDates: 0, forecast: 0, confirmed: 0, distributedOrders: 0, ordered: 0, distributed: 0 });
  const diff = t.distributed - t.ordered;
  const summary = table([{ label: 'Measure' }, { label: 'Value', num: true }], [
    row(['Pickup points in the window', rows.length]),
    row(['Orders in the book', book.length]),
    row(['Forecast units', num(t.forecast)]),
    row(['Confirmed units', num(t.confirmed)]),
    row(['Distributed orders', t.distributedOrders]),
    row(['Ordered on the distributed orders', num(t.ordered)]),
    row(['Distributed units', num(t.distributed)]),
    row(['Distributed less ordered', `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${num(Math.abs(diff))}`], diff !== 0 ? 'over' : undefined),
    row(['Distributed as a share of ordered', t.ordered > 0 ? pct(t.distributed / t.ordered, 1) : '—']),
  ]);
  const detail = table([{ label: 'Subscriber' }, { label: 'Pickup point' }, { label: 'Channel' }, { label: 'Service dates', num: true }, { label: 'Forecast', num: true }, { label: 'Confirmed', num: true }, { label: 'Distributed orders', num: true }, { label: 'Ordered', num: true }, { label: 'Distributed', num: true }, { label: 'Distributed − ordered', num: true }],
    rows.map((r) => row([r.subscriberName, r.pickupPointName, channelName(r.channel), r.serviceDates, num(r.forecastUnits), num(r.confirmedUnits), r.distributedOrders, num(r.orderedOnDistributed), num(r.distributedUnits), `${r.distributedLessOrdered > 0 ? '+' : r.distributedLessOrdered < 0 ? '−' : ''}${num(Math.abs(r.distributedLessOrdered))}`], r.distributedLessOrdered !== 0 ? 'over' : undefined)));
  return {
    summary,
    detail,
    basis: `The order book from ${from} to ${to} on ${ctx.worldLabel}: forecast orders from the pickup points' flat plans with confirmed and distributed rows in their place; distributed units from the distribution records.`,
    empty: book.length === 0 ? 'No order in the window on this world.' : undefined,
  };
};

const subscribersAndPipeline: Builder = (ctx) => {
  const { selected } = ctx;
  const R = selected.inputs;
  const channelName = (c: number) => R.phases.find((p) => p.phase === c)?.market ?? `Channel ${c}`;
  const pipe = pipelineStats(prospectRecords);
  const statuses = ['contracted', 'forecast', 'prospect', 'inactive'] as const;
  const byChannel = R.phases.map((p) => {
    const cs = R.subscribers.filter((c) => c.channel === p.phase);
    return row([p.market, ...statuses.map((s) => cs.filter((c) => c.status === s).length), cs.reduce((n, c) => n + c.pickupPoints.length, 0)]);
  });
  byChannel.push(row(['All channels', ...statuses.map((s) => R.subscribers.filter((c) => c.status === s).length), R.subscribers.reduce((n, c) => n + c.pickupPoints.length, 0)], 'total'));
  const pipelineRows = Object.entries(pipe.byStatus).sort(([, a], [, b]) => b - a).map(([s, n]) => row([`Prospect pipeline — ${s}`, n, '', '', '']));
  pipelineRows.push(row(['Prospect prospects in the directory', pipe.total, '', '', `${num(pipe.totalStudents)} headcount`], 'total'));
  const detail = table([{ label: 'Subscriber' }, { label: 'Channel' }, { label: 'Status' }, { label: 'Kind' }, { label: 'Pickup points', num: true }, { label: 'Payment terms' }, { label: 'Contract' }],
    [...R.subscribers].sort((a, b) => a.name.localeCompare(b.name)).map((c) => row([c.name, channelName(c.channel), SUBSCRIBER_STATUS_LABELS[c.status], c.kind, c.pickupPoints.length, c.paymentTerms ?? 'None on file', c.contractStart ? `${c.contractStart} to ${c.contractEnd ?? 'open'}` : '—'], c.status === 'inactive' ? 'faint' : undefined)));
  return {
    summary: table([{ label: 'Channel or stage' }, { label: 'Contracted', num: true }, { label: 'Forecast subscriber', num: true }, { label: 'Prospect', num: true }, { label: 'Inactive', num: true }, { label: 'Pickup points', num: true }], [...byChannel, ...pipelineRows.map((r) => ({ ...r, cells: [r.cells[0], r.cells[1], '', '', '', r.cells[4]] }))]),
    detail,
    basis: 'The subscriber library as facts of record, and the compiled prospect prospect directory. A subscriber with no payment terms is not invoiced.',
  };
};

// ── Distribution ────────────────────────────────────────────────────────────

const distributionsHandoff: Builder = (ctx) => {
  const { records, today } = ctx;
  const ds: DistributionDoc[] = records.distributions;
  interface Acc { distributions: number; units: number; tempTaken: number; over41: number; signed: number; routeDone: number; pickupPoints: Set<string> }
  const months = new Map<string, Acc>();
  for (const d of ds) {
    const m = monthOf(d.distributedOn);
    const a = months.get(m) ?? { distributions: 0, units: 0, tempTaken: 0, over41: 0, signed: 0, routeDone: 0, pickupPoints: new Set<string>() };
    a.distributions += 1;
    a.units += d.units;
    if (d.handoffTempF !== null && d.handoffTempF !== undefined) { a.tempTaken += 1; if (d.handoffTempF > 41) a.over41 += 1; }
    if (d.receivedBy) a.signed += 1;
    if (d.routeCompletedAt) a.routeDone += 1;
    a.pickupPoints.add(d.pickupPointName ?? d.pickupPointId ?? '—');
    months.set(m, a);
  }
  const rows = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, a]) => row([m, a.distributions, num(a.units), a.pickupPoints.size, pct(a.tempTaken / a.distributions, 0), a.over41, pct(a.signed / a.distributions, 0), pct(a.routeDone / a.distributions, 0)], a.over41 > 0 ? 'over' : undefined));
  const t = [...months.values()].reduce((s, a) => ({ distributions: s.distributions + a.distributions, units: s.units + a.units, tempTaken: s.tempTaken + a.tempTaken, over41: s.over41 + a.over41, signed: s.signed + a.signed, routeDone: s.routeDone + a.routeDone }), { distributions: 0, units: 0, tempTaken: 0, over41: 0, signed: 0, routeDone: 0 });
  if (t.distributions > 0) rows.push(row(['All months', t.distributions, num(t.units), [...new Set(ds.map((d) => d.pickupPointName ?? d.pickupPointId ?? '—'))].length, pct(t.tempTaken / t.distributions, 0), t.over41, pct(t.signed / t.distributions, 0), pct(t.routeDone / t.distributions, 0)], 'total'));
  const detail = table([{ label: 'Distributed' }, { label: 'Pickup point' }, { label: 'Units', num: true }, { label: 'Hand-off °F', num: true }, { label: 'Distributed by' }, { label: 'Signed by' }, { label: 'Lots' }, { label: 'Route completed' }],
    [...ds].sort((a, b) => b.distributedOn.localeCompare(a.distributedOn)).map((d) => row([d.distributedOn, d.pickupPointName ?? d.pickupPointId ?? '—', num(d.units), d.handoffTempF ?? '—', d.distributedBy ?? '—', d.receivedBy ?? '—', d.lotCodes.join(', '), d.routeCompletedAt ? d.routeCompletedAt.slice(0, 10) : ''], d.handoffTempF !== null && d.handoffTempF !== undefined && d.handoffTempF > 41 ? 'over' : undefined)));
  return {
    summary: table([{ label: 'Month' }, { label: 'Distributions', num: true }, { label: 'Units', num: true }, { label: 'Pickup points', num: true }, { label: 'Temp at hand-off recorded', num: true }, { label: 'Above 41°F', num: true }, { label: 'Signed for', num: true }, { label: 'Route completed', num: true }], rows),
    detail,
    basis: `The distribution records as of ${today}. control-point-4: 41°F or below on arrival. A distribution with no temperature on the record is counted as not recorded, never as passed.`,
    empty: ds.length === 0 ? 'No distribution is on record.' : undefined,
  };
};

const distributionPickupPoints: Builder = (ctx) => {
  const { selected } = ctx;
  const R = selected.inputs;
  const pickupPoints = resolvePickupPoints(seedPickupPoints, R.pickupPoints, {}, forecastByDistributionPickupPoint(R.demand));
  const total = pickupPoints.reduce((s, x) => s + x.dailyForecastUnits, 0);
  const summary = table([{ label: 'Measure' }, { label: 'Value', num: true }], [
    row(['Distribution pickup points', pickupPoints.length]),
    row(['Linked to a prospect record', pickupPoints.filter((s) => s.prospectId).length]),
    row(['Forecast read from a subscriber pickup point', pickupPoints.filter((s) => s.forecastFromSubscriber).length]),
    row(['Total daily forecast, units', num(total)]),
    row(['Placed on the linked prospect\'s own geocode', pickupPoints.filter((s) => s.placement.fromLinkedProspect).length]),
  ]);
  const detail = table([{ label: 'Pickup point' }, { label: 'Type' }, { label: 'County' }, { label: 'Service window' }, { label: 'Daily forecast', num: true }, { label: 'Forecast source' }, { label: 'Placement' }],
    pickupPoints.map((s) => row([s.name, s.type, s.county, s.serviceWindow, num(s.dailyForecastUnits), s.forecastFromSubscriber ? 'Subscriber pickup point' : 'Pickup point record', s.placement.source ? PLACEMENT_LABEL[s.placement.source] : 'Unplaced'])));
  return {
    summary,
    detail,
    basis: `${ctx.worldLabel}. Unlinked pickup points are invented seed placed at their county centroid; a linked pickup point carries the prospect's own geocode.`,
  };
};

// ── Subscriber / Supplier ────────────────────────────────────────────

const subscriberAccounts: Builder = (ctx) => {
  const { records, orders, selected, today } = ctx;
  const R = selected.inputs;
  const balances = invoiceBalances(records.invoices ?? [], records.distributions, records.subscriberPayments ?? []);
  const rows = [...R.subscribers].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
    const mine = orders.filter((o) => o.subscriberId === c.id);
    const del = records.distributions.filter((d) => d.subscriberId === c.id);
    const inv = balances.filter((b) => b.invoice.subscriberId === c.id);
    const paid = (records.subscriberPayments ?? []).filter((p) => p.subscriberId === c.id).reduce((t, p) => t + p.amountCents, 0);
    const open = inv.reduce((t, b) => t + b.openCents, 0);
    return row([c.name, SUBSCRIBER_STATUS_LABELS[c.status], mine.filter((o) => o.status === 'confirmed').length, mine.filter((o) => o.status === 'distributed').length, del.length, num(del.reduce((t, d) => t + d.units, 0)), inv.length, cents(inv.reduce((t, b) => t + b.amountCents, 0)), cents(open), cents(paid)], open > 0 ? undefined : c.status === 'inactive' ? 'faint' : undefined);
  });
  const detail = table([{ label: 'Invoice' }, { label: 'Subscriber' }, { label: 'Period' }, { label: 'Status' }, { label: 'Distributions', num: true }, { label: 'Units', num: true }, { label: 'Amount', num: true }, { label: 'Paid', num: true }, { label: 'Open', num: true }, { label: 'Due' }],
    balances.map((b) => row([b.invoice.invoiceNumber, b.invoice.subscriberName, b.invoice.period, b.invoice.status, b.distributions.length, num(b.units), cents(b.amountCents), cents(b.paidCents), cents(b.openCents), b.invoice.dueOn ?? '—'], b.openCents > 0 && b.invoice.dueOn && b.invoice.dueOn < today ? 'over' : undefined)));
  return {
    summary: table([{ label: 'Subscriber' }, { label: 'Status' }, { label: 'Confirmed orders', num: true }, { label: 'Distributed orders', num: true }, { label: 'Distributions', num: true }, { label: 'Units distributed', num: true }, { label: 'Invoices', num: true }, { label: 'Invoiced', num: true }, { label: 'Open', num: true }, { label: 'Received', num: true }], rows),
    detail,
    basis: `The records as of ${today}: orders on file, distribution records, the monthly invoices built from them and the payments applied. What a subscriber sees in its portal.`,
    empty: R.subscribers.length === 0 ? 'No subscriber is on file.' : undefined,
  };
};

const supplierCatalogs: Builder = (ctx) => {
  const { catalog, today } = ctx;
  const ids = Object.keys(catalog);
  const names = leanSuppliersById(ids);
  const rows = ids.map((id) => {
    const lines = catalog[id] ?? [];
    const approved = lines.filter((l) => l.status === 'approved').length;
    const priced = lines.filter((l) => l.prices.some((p) => p.effectiveFrom <= today && p.unitPrice !== null)).length;
    const certified = lines.filter((l) => l.certification).length;
    const lead = lines.filter((l) => l.leadTimeDays !== null).length;
    return row([names[id]?.name ?? id, lines.length, approved, lines.length - approved, priced, certified, lead], lines.length > 0 && approved === 0 ? 'faint' : undefined);
  }).sort((a, b) => Number(b.cells[1]) - Number(a.cells[1]));
  const all = ids.flatMap((id) => catalog[id] ?? []);
  rows.push(row(['All suppliers', all.length, all.filter((l) => l.status === 'approved').length, all.filter((l) => l.status !== 'approved').length, all.filter((l) => l.prices.some((p) => p.effectiveFrom <= today && p.unitPrice !== null)).length, all.filter((l) => l.certification).length, all.filter((l) => l.leadTimeDays !== null).length], 'total'));
  const detail = table([{ label: 'Supplier' }, { label: 'Item' }, { label: 'Status' }, { label: 'Unit' }, { label: 'Price in force', num: true }, { label: 'Effective from' }, { label: 'Certification' }, { label: 'Lead time, days', num: true }, { label: 'Origin' }],
    ids.flatMap((id) => (catalog[id] ?? []).map((l) => {
      const inForce = [...l.prices].filter((p) => p.effectiveFrom <= today).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
      return row([names[id]?.name ?? id, [l.item, l.variety, l.packSize].filter(Boolean).join(' · '), CATALOG_STATUS_LABEL[l.status], l.unit, inForce?.unitPrice === null || inForce?.unitPrice === undefined ? '—' : money(inForce.unitPrice), inForce?.effectiveFrom ?? '—', l.certification ?? '—', l.leadTimeDays ?? '—', l.origin ?? '—'], l.status === 'approved' ? undefined : 'faint');
    })));
  return {
    summary: table([{ label: 'Supplier' }, { label: 'Lines', num: true }, { label: 'Approved', num: true }, { label: 'Candidate', num: true }, { label: 'With a price in force', num: true }, { label: 'Naming a certification', num: true }, { label: 'With a lead time', num: true }], rows),
    detail,
    basis: `Every catalog line on file as of ${today}. Only an approved line prices the plan or a purchase order; the price in force is the latest row on or before today.`,
    empty: all.length === 0 ? 'No supplier has a catalog on file.' : undefined,
  };
};

const BUILDERS: Record<string, Builder> = {
  'alerts-register': alertsRegister,
  'plan-and-forecasts': planAndForecasts,
  'production-history': productionHistory,
  'capacity-utilisation': capacityUtilisation,
  'labor-standards': laborStandards,
  'unit-cost': unitCost,
  'income-by-period': incomeByPeriod,
  'cost-trend': costTrend,
  variances,
  'working-capital-aging': workingCapitalAging,
  'plan-v-actual': planVActual,
  'inventory-position': inventoryPosition,
  'cooling-compliance': coolingCompliance,
  'supply-position': supplyPosition,
  'supplier-activity': supplierActivity,
  'emissions-statement': emissionsStatement,
  'waste-end-of-life': wasteEndOfLife,
  'refrigerant-leakage': refrigerantLeakage,
  'staff-demand': staffDemandReport,
  'hours-overtime': hoursOvertime,
  'training-completion': trainingCompletion,
  'order-book-accuracy': orderBookAccuracy,
  'subscribers-and-pipeline': subscribersAndPipeline,
  'distributions-handoff': distributionsHandoff,
  'distribution-pickup-points': distributionPickupPoints,
  'subscriber-accounts': subscriberAccounts,
  'supplier-catalogs': supplierCatalogs,
};

/** Every catalog entry has a builder: the test asserts it. */
export const REPORT_BUILDER_IDS: readonly string[] = Object.keys(BUILDERS);

