import 'server-only';
import { money, num, pct } from '../_components/ui';
import type { MuseAccess } from './access';
import { postSelectedLedger, type PostedLedger } from './ledgers';
import { loadActuals } from './actuals';
import { listMenuCycles, listOrders } from './orders';
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
import type { ActualsBundle, DeliveryDoc } from '../_engine/actuals';
import { toBatchExecution } from '../_engine/actuals';
import { coolingLoadsOf, massBalance } from '../_engine/batch';
import { evaluateCcp2, CCP2_LIMITS } from '../_engine/food-safety';
import { orderBook, isoAddDays, siteActualVsForecast, type BookOrder } from '../_engine/orders';
import { deliveredConsumption, finishedGoodsOnHand, planHorizon, portionFactorFor, type HorizonPlan } from '../_engine/production-plan';
import { rawStockOnHand, rawLotsByUseBy } from '../_engine/net-requirements';
import { resolveCustomerSites, forecastByDeliverySite } from '../_engine/demand';
import { laborStandard, nextStudyDue, studiesForRecipe, summarizeStudy } from '../_engine/time-studies';
import { activeRecipeAverages } from '../_engine/active-averages';
import { staffDemand } from '../_engine/staff-demand';
import { agingReport, AGING_BUCKETS, AGING_LABELS, billBalances, dueOn, invoiceBalances, receiptValueCents, type OpenItem } from '../_engine/working-capital';
import { periodStart, BILL_CATEGORY_LABELS } from '../_engine/actuals';
import { servedCostPerMealCents, sumMeasures, type PvaMeasures } from '../_engine/plan-v-actual';
import { CLOCK_STATE_LABELS, clockStateOf, hoursRun, payPeriodFor } from '../_engine/payroll';
import { activeVersions, completionFor } from '../_engine/training';
import { pipelineStats } from '../_engine/schools';
import { schoolRecords } from '../_data/schools';
import { CUSTOMER_STATUS_LABELS } from '../_data/customers';
import { sites as seedSites } from '../_data/seed-invented';
import { resolveSites } from '../_engine/sites';
import { PLACEMENT_LABEL } from '../_engine/entity-links';
import { fullInventory } from '../_engine/inventory';
import { KG_PER_SHORT_TON, refrigerantInventory, warmNet } from '../_engine/carbon';
import { expiredMassKg, mixShrinkKg } from '../_engine/sustainability-basis';
import { energyFromReadings, serviceFromRecords } from '../_engine/sustainability-records';
import { countsTowardCapital } from '../_engine/equipment';
import { lcaOptions as curatedOptions } from '../_data/lca-options';
import { CATALOG_STATUS_LABEL } from '../_engine/catalog';
import { parentAccounts } from '../_data/parent-portal';

/**
 * Impact OS — the Reports library, assembled (Roadmap Phase E). Server-only.
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
  access: MuseAccess;
  selected: PostedLedger;
  /** The recorded documents, whatever the selected world. */
  records: ActualsBundle;
  orders: Awaited<ReturnType<typeof listOrders>>;
  cycles: Awaited<ReturnType<typeof listMenuCycles>>;
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
export async function buildReportLibrary(access: MuseAccess): Promise<ReportLibrary> {
  const today = new Date().toISOString().slice(0, 10);
  const [selected, records, orders, cycles, calendar, studies, pos, catalog] = await Promise.all([
    postSelectedLedger(),
    loadActuals(),
    listOrders(),
    listMenuCycles(),
    loadCalendar(),
    listTimeStudies(),
    listPurchaseOrders(),
    listAllCatalog(),
  ]);
  const R = selected.inputs;
  const isPlan = selected.kind === 'plan';
  const closures = calendar.closures;
  const pf = Object.fromEntries(R.phaseProfiles.map((p) => [p.phase, p.portionFactor.value])) as Record<number, number>;
  const holdLife = R.assumptions.inventory.chilledHoldLife.value;

  // The next two weeks on the selected world (Roadmap N9): Plan reads the forecast's sites and
  // nothing on record; Actual reads the customers' sites, the orders on file and the closed batches.
  const horizonFrom = today;
  const horizonTo = isoAddDays(today, 13);
  const book = orderBook({
    sites: isPlan ? R.demand.sites : resolveCustomerSites(R.customers, {}, { closures }),
    customers: R.customers,
    cycles,
    orders: isPlan ? [] : orders,
    from: horizonFrom,
    to: horizonTo,
    channelPriceCents: Object.fromEntries(R.phases.map((p) => [p.phase, Math.round(p.pricePerMeal * 100)])) as Record<number, number>,
    recipeNames: Object.fromEntries(R.recipes.map((r) => [r.code, r.name])),
    closures,
  });
  const worldBundle = selected.bundle;
  const consumed = isPlan
    ? worldBundle.deliveries.filter((d) => d.recipeCode).map((d) => ({ recipeCode: d.recipeCode!, date: d.deliveredOn, basePortions: d.meals * portionFactorFor(R.recipes.find((r) => r.code === d.recipeCode), d.phase, pf) }))
    : deliveredConsumption(orders, records.deliveries, R.recipes, pf);
  const finished = finishedGoodsOnHand({ batches: worldBundle.batches, consumed, holdLifeDays: holdLife, asOf: today });
  const horizon = planHorizon({
    closures,
    from: horizonFrom,
    to: horizonTo,
    book,
    recipes: R.recipes,
    capacityInputs: R.capacityInputs,
    assumptions: R.assumptions,
    recipeAssumptions: R.recipeAssumptions,
    portionFactorByChannel: pf,
    openingLots: finished.lots.filter((l) => l.remaining > 0),
    holdLifeDays: holdLife,
    channels: R.phases.map((p) => p.phase),
  });
  const worldLabel = isPlan ? `Plan — ${selected.view.label ?? 'plan defaults'}` : 'Actual — the recorded documents';
  const ctx: Ctx = { today, access, selected, records, orders, cycles, closures, studies, pos, catalog, pf, horizon, horizonFrom, horizonTo, finished, worldLabel };

  const defs = reportsFor(access.isSuperAdmin);
  const reports = await Promise.all(defs.map(async (def) => ({ def, data: await buildOne(def, ctx) })));
  return { reports, today, worldLabel };
}

/** One report from the catalog, for the export route. Admin-only reports refuse an operator with null. */
export async function buildReport(id: string, access: MuseAccess): Promise<{ def: ReportDef; data: ReportData } | null> {
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

function coolingLog(records: ActualsBundle, recipeName: (code: string) => string) {
  return records.batches.flatMap((b) =>
    b.components.flatMap((c) =>
      coolingLoadsOf(c).map((t, li) => {
        const ev = evaluateCcp2(t.t2F, t.t6F);
        return { batchId: b.batchId, lot: c.outputLotCode, load: li + 1, date: b.productionDate, product: `${c.component} — ${recipeName(b.recipeCode)}`, t2: t.t2F, t6: t.t6F, pass: ev.pass, reason: ev.reason };
      }),
    ),
  );
}

function chilledLotsOwed(records: ActualsBundle, R: PostedLedger['inputs'], recipeName: (code: string) => string) {
  const hotComponents = (code: string) => new Set((R.recipes.find((r) => r.code === code)?.ingredients ?? []).filter((i) => i.isHotComponent).map((i) => i.component ?? i.name));
  return records.batches.flatMap((b) => {
    const hot = hotComponents(b.recipeCode);
    return b.components
      .filter((c) => (c.chilledLb ?? 0) > 0 && (hot.size === 0 || hot.has(c.component)))
      .map((c) => ({ batchId: b.batchId, lot: c.outputLotCode, date: b.productionDate, product: `${c.component} — ${recipeName(b.recipeCode)}`, recorded: coolingLoadsOf(c).length, expected: b.batchesRun }));
  });
}

const alertsRegister: Builder = (ctx) => {
  const { records, selected, today, access, horizon, studies } = ctx;
  const R = selected.inputs;
  const recipeName = (code: string) => R.recipes.find((r) => r.code === code)?.name ?? code;
  const items: { finding: string; item: string; detail: string; module: string }[] = [];

  // Cold chain, always the records: a forecast cools nothing.
  for (const r of coolingLog(records, recipeName).filter((x) => !x.pass)) items.push({ finding: 'Cooling record failed CCP-2', item: `${r.lot} load ${r.load}`, detail: `${r.product}, ${r.date}: ${r.reason}`, module: 'Food Safety' });
  for (const l of chilledLotsOwed(records, R, recipeName).filter((x) => x.recorded < x.expected)) items.push({ finding: 'Chilled lot with a cabinet load unrecorded', item: l.lot, detail: `${l.product}, ${l.date}: ${l.recorded} of ${l.expected} loads on the record`, module: 'Food Safety' });
  const pfc = ctx.pf;
  const recordedFinished = finishedGoodsOnHand({ batches: records.batches, consumed: deliveredConsumption(ctx.orders, records.deliveries, R.recipes, pfc), holdLifeDays: R.assumptions.inventory.chilledHoldLife.value, asOf: today });
  for (const l of recordedFinished.lots.filter((x) => x.remaining > 1e-9)) {
    const days = daysBetween(today, l.expires);
    if (days <= 7) items.push({ finding: 'Finished lot within seven days of hold life', item: l.batchId, detail: `${recipeName(l.recipeCode)}: ${num(Math.round(l.remaining))} portions on hand, hold life ends ${l.expires} (${days} day${days === 1 ? '' : 's'})`, module: 'Inventory' });
  }
  const raw = rawLotsByUseBy(rawStockOnHand({ receipts: records.receipts, batches: records.batches, asOf: today }));
  for (const l of raw.filter((x) => x.daysToUseBy !== null && x.daysToUseBy < 0 && x.remaining > 1e-9)) items.push({ finding: 'Raw lot past the date on the case', item: `${l.ingredient} · ${l.lotCode}`, detail: `use by ${l.useBy}, ${num(l.remaining, 1)} ${l.unit} remaining`, module: 'Inventory' });

  // The plan, on the selected world.
  for (const d of horizon.byDate.filter((x) => !x.fits)) items.push({ finding: 'Production day that does not fit the chiller', item: d.date, detail: `${num(d.batches)} batches against ${num(d.cyclesAvailable)} cycles available`, module: 'Calendar' });
  for (const d of horizon.byDate.filter((x) => x.expiredBase > 1e-9)) items.push({ finding: 'Stock expiring in the next two weeks', item: d.date, detail: `${num(Math.round(d.expiredBase))} base portions past hold life unconsumed`, module: 'Calendar' });

  // Labor standards.
  for (const r of R.recipes) {
    const own = studiesForRecipe(studies.studies, r.code);
    if (own.length === 0) {
      items.push({ finding: 'Recipe with no time study', item: r.name, detail: 'Its batches carry no labor standard and no staff demand', module: 'Time Studies' });
      continue;
    }
    const due = nextStudyDue(own, studies.intervals[r.code], today);
    if (due.daysUntilDue !== null && due.daysUntilDue < 0) items.push({ finding: 'Time study past its re-study date', item: r.name, detail: `due ${due.dueOn}, last studied ${due.lastStudiedOn}`, module: 'Time Studies' });
  }

  // Company financials: admins only (Roadmap O5).
  if (access.isSuperAdmin) {
    const mismatched = billBalances(records.supplierBills ?? [], records.receipts, ctx.pos.map((p) => ({ id: p.id, poNumber: p.poNumber, lines: p.lines })), records.supplierPayments ?? []).filter((b) => b.match.status === 'mismatched');
    for (const b of mismatched) items.push({ finding: 'Supplier bill flagged on the three-way match', item: `${b.bill.billNumber} · ${b.bill.supplierName}`, detail: `${cents(b.amountCents)} billed against ${cents(b.match.receivedCents)} received; ${b.match.issues.length} issue${b.match.issues.length === 1 ? '' : 's'}; held from payment`, module: 'Payables' });
    const pastDue = invoiceBalances(records.invoices ?? [], records.deliveries, records.customerPayments ?? []).filter((b) => b.invoice.status === 'issued' && b.openCents > 0 && b.invoice.dueOn !== null && b.invoice.dueOn < today);
    for (const b of pastDue) items.push({ finding: 'Invoice past due', item: `${b.invoice.invoiceNumber} · ${b.invoice.customerName}`, detail: `${cents(b.openCents)} open, due ${b.invoice.dueOn}, ${daysBetween(b.invoice.dueOn!, today)} days past`, module: 'Receivables' });
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
  const batches = selected.bundle.batches;
  const recipeName = (code: string) => R.recipes.find((r) => r.code === code)?.name ?? code;
  interface MonthAcc { records: number; loads: number; planned: number; good: number; balanced: number; scrapLb: number }
  const months = new Map<string, MonthAcc>();
  const detail: ReportRow[] = [];
  const sorted = [...batches].sort((a, b) => a.productionDate.localeCompare(b.productionDate) || a.batchId.localeCompare(b.batchId));
  for (const b of sorted) {
    const m = monthOf(b.productionDate);
    const acc = months.get(m) ?? { records: 0, loads: 0, planned: 0, good: 0, balanced: 0, scrapLb: 0 };
    let balanced = false;
    let scrapLb = 0;
    try {
      const mb = massBalance(toBatchExecution(b));
      balanced = mb.balanced;
      scrapLb = mb.totalScrapLb;
    } catch {
      balanced = false;
    }
    acc.records += 1;
    acc.loads += b.batchesRun;
    acc.planned += b.plannedPortions;
    acc.good += b.goodPortions;
    acc.balanced += balanced ? 1 : 0;
    acc.scrapLb += scrapLb;
    months.set(m, acc);
    detail.push(row([b.productionDate, b.batchId, recipeName(b.recipeCode), b.batchesRun, num(b.plannedPortions), num(b.goodPortions), b.plannedPortions > 0 ? pct(b.goodPortions / b.plannedPortions, 1) : '—', num(scrapLb, 1), balanced ? 'Balanced' : 'Not balanced'], balanced ? undefined : 'over'));
  }
  const rows = [...months.entries()].map(([m, a]) => row([m, a.records, a.loads, num(a.planned), num(a.good), a.planned > 0 ? pct(a.good / a.planned, 1) : '—', num(a.scrapLb, 1), `${a.balanced} / ${a.records}`]));
  const t = [...months.values()].reduce((s, a) => ({ records: s.records + a.records, loads: s.loads + a.loads, planned: s.planned + a.planned, good: s.good + a.good, balanced: s.balanced + a.balanced, scrapLb: s.scrapLb + a.scrapLb }), { records: 0, loads: 0, planned: 0, good: 0, balanced: 0, scrapLb: 0 });
  rows.push(row(['All months', t.records, t.loads, num(t.planned), num(t.good), t.planned > 0 ? pct(t.good / t.planned, 1) : '—', num(t.scrapLb, 1), `${t.balanced} / ${t.records}`], 'total'));
  return {
    summary: table([{ label: 'Month' }, { label: 'Cooks', num: true }, { label: 'Cabinet loads', num: true }, { label: 'Portions planned', num: true }, { label: 'Portions packed', num: true }, { label: 'Yield', num: true }, { label: 'Scrap lb', num: true }, { label: 'Mass-balanced', num: true }], rows),
    detail: table([{ label: 'Date' }, { label: 'Batch' }, { label: 'Recipe' }, { label: 'Loads', num: true }, { label: 'Planned', num: true }, { label: 'Packed', num: true }, { label: 'Yield', num: true }, { label: 'Scrap lb', num: true }, { label: 'Mass balance' }], detail),
    basis: `Batch records on ${ctx.worldLabel}. A record is one cook and the cook is the lot; a double batch is one record with two cabinet loads.`,
    empty: batches.length === 0 ? (selected.kind === 'plan' ? 'The forecast places no batch.' : 'No batch record has been closed.') : undefined,
  };
};

const capacityUtilisation: Builder = (ctx) => {
  const { horizon, horizonFrom, horizonTo } = ctx;
  const t = horizon.totals;
  const summary = table([{ label: 'Measure' }, { label: 'Value', num: true }], [
    row(['Production days with a run', horizon.productionDays.length]),
    row(['Batches', t.batches]),
    row(['Chiller cycles used', t.cyclesUsed]),
    row(['Chiller cycles available on those days', t.cyclesAvailable]),
    row(['Utilisation, cycles used over available', pct(t.utilisation, 0)]),
    row(['Days that do not fit', t.daysThatDoNotFit], t.daysThatDoNotFit > 0 ? 'over' : undefined),
    row(['Meals ordered', num(t.orderedMeals)]),
    row(['Meals filled', num(t.filledMeals)]),
    row(['Base portions produced', num(Math.round(t.producedBase))]),
    row(['Base portions expired past hold life', num(Math.round(t.expiredBase))], t.expiredBase > 0 ? 'over' : undefined),
    row(['Closing stock, base portions', num(Math.round(t.closingStockBase))]),
  ]);
  const detail = table([{ label: 'Date' }, { label: 'Batches', num: true }, { label: 'Portions made', num: true }, { label: 'Cycles used', num: true }, { label: 'Available', num: true }, { label: 'Utilisation', num: true }, { label: 'Ordered', num: true }, { label: 'Filled', num: true }, { label: 'Expired', num: true }, { label: 'Closing stock', num: true }, { label: 'Fits' }],
    horizon.byDate.map((d) => row([d.date, d.batches, num(Math.round(d.portionsProduced)), d.cyclesUsed, d.cyclesAvailable, d.batches > 0 ? pct(d.utilisation, 0) : '—', num(Math.round(d.orderedBase)), num(Math.round(d.filledBase)), num(Math.round(d.expiredBase)), num(Math.round(d.closingStockBase)), d.fits ? 'Yes' : 'No'], d.fits ? undefined : 'over')));
  return {
    summary,
    detail,
    basis: `The order book from ${horizonFrom} to ${horizonTo} on ${ctx.worldLabel}, rolled through production against the plant's chiller cycles. Whole batches only.`,
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
  const detail: ReportRow[] = R.recipes.map((r) => {
    const own = studiesForRecipe(studies.studies, r.code);
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
      s ? num(s.laborMinutesPerPortion, 2) : '—',
      s ? num(s.fixedMinutesPerBatch, 0) : '—',
      s ? num(s.variableMinutesPerPortion, 2) : '—',
      s ? s.peakStaff : '—',
      due.lastStudiedOn ?? '—',
      due.dueOn ?? '—',
      due.daysUntilDue === null ? '—' : due.daysUntilDue,
    ], late || !std ? 'over' : undefined);
  });
  return {
    summary: table([{ label: 'Measure' }, { label: 'Recipes', num: true }], [
      row(['Recipes in the library', R.recipes.length]),
      row(['On an observed, adopted study', observed]),
      row(['On the estimated study that stands in', estimated]),
      row(['With no study', none], none > 0 ? 'over' : undefined),
      row(['Past the re-study date', pastDue], pastDue > 0 ? 'over' : undefined),
    ]),
    detail: table([{ label: 'Recipe' }, { label: 'Status' }, { label: 'Standard' }, { label: 'Labor min / portion', num: true }, { label: 'Fixed min / batch', num: true }, { label: 'Variable min / portion', num: true }, { label: 'Most people on a task', num: true }, { label: 'Last studied' }, { label: 'Next due' }, { label: 'Days to due', num: true }], detail),
    basis: `Each recipe's labor standard from the time-study library as of ${today}: the adopted observed study, or the estimated study until one is adopted.`,
  };
};

const mealCost: Builder = (ctx) => {
  const { selected, studies } = ctx;
  const R = selected.inputs;
  const avg = activeRecipeAverages(R.recipes, R.capacityInputs, R.assumptions, studies.studies, R.recipeAssumptions);
  return {
    summary: table([{ label: 'Mean over active recipes' }, { label: 'Per meal', num: true }], [
      row(['Ingredients at purchase prices, before shrink', money(avg.asPurchasedPerMeal)]),
      row(['Food cost, with the shrink allowance', money(avg.foodCostPerMeal)]),
      row(['Labor cost, at the placeholder loaded rate', money(avg.laborCostPerMeal)]),
      row(['Cost to serve: food, labor, packaging, distribution', money(avg.costToServePerMeal)], 'total'),
      row(['Labor minutes per meal', num(avg.laborMinutesPerMeal, 2)]),
      row(['Batch clock minutes, receiving to cold hold', num(avg.batchMinutes, 0)]),
      row(['Active recipes averaged', avg.count]),
      row(['Of which on an estimated study', avg.onEstimate]),
      row(['Of which with no study', avg.withoutStudy], avg.withoutStudy > 0 ? 'over' : undefined),
    ]),
    detail: table([{ label: 'Recipe' }, { label: 'Batch', num: true }, { label: 'Purchased / meal', num: true }, { label: 'Food / meal', num: true }, { label: 'Labor min / meal', num: true }, { label: 'Labor / meal', num: true }, { label: 'Cost to serve', num: true }, { label: 'Batch minutes', num: true }],
      avg.recipes.map((r) => row([r.name, num(r.batch), money(r.asPurchasedPerMeal), money(r.foodCostPerMeal), num(r.laborMinutesPerMeal, 2), money(r.laborCostPerMeal), money(r.costToServePerMeal), num(r.batchMinutes, 0)]))),
    basis: 'Each active recipe at its own derived batch, its own labor standard and its packaging picks, at the prices in force. Storage is excluded from the cost to serve.',
    empty: avg.count === 0 ? 'No recipe is In Service.' : undefined,
  };
};

// ── Financials & Accounting (admins) ────────────────────────────────────────

const incomeByPeriod: Builder = (ctx) => {
  const { selected } = ctx;
  const months = selected.ledger.months;
  const rows = months.map((m) => row([m.label, num(Math.round(m.mealsDelivered)), cents(m.incomeStatement.revenueCents), cents(m.incomeStatement.grossMarginCents), cents(m.incomeStatement.operatingIncomeCents), signedCents(m.incomeStatement.netIncomeCents)], m.incomeStatement.revenueCents === 0 ? 'faint' : undefined));
  for (const y of selected.ledger.years) rows.push(row([`Year ${y.label}`, num(Math.round(y.mealsDelivered)), cents(y.incomeStatement.revenueCents), cents(y.incomeStatement.grossMarginCents), cents(y.incomeStatement.operatingIncomeCents), signedCents(y.incomeStatement.netIncomeCents)], 'total'));
  return {
    summary: table([{ label: 'Period' }, { label: 'Meals delivered', num: true }, { label: 'Revenue', num: true }, { label: 'Gross margin', num: true }, { label: 'Operating income', num: true }, { label: 'Net income, pre-tax', num: true }], rows),
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
      num(Math.round(m.mealsProduced)),
      num(Math.round(m.mealsDelivered)),
      p && p.mealsProduced > 0 ? money(p.standardCostPerMealCents / 100) : '—',
      cents(f.manufacturingOverheadCents),
      cents(f.generalAndAdministrativeCents),
      cents(f.interestCents),
      cents(f.totalCents),
      f.perMealCents === null ? '—' : money(f.perMealCents / 100),
      cents(f.principalRepaidCents),
    ], m.mealsDelivered === 0 && m.mealsProduced === 0 ? 'faint' : undefined);
  });
  for (const y of selected.ledger.years) rows.push(row([`Year ${y.label}`, num(Math.round(y.mealsProduced)), num(Math.round(y.mealsDelivered)), '—', cents(y.fixedExpense.manufacturingOverheadCents), cents(y.fixedExpense.generalAndAdministrativeCents), cents(y.fixedExpense.interestCents), cents(y.fixedExpense.totalCents), y.fixedExpense.perMealCents === null ? '—' : money(y.fixedExpense.perMealCents / 100), cents(y.fixedExpense.principalRepaidCents)], 'total'));
  return {
    summary: table([{ label: 'Period' }, { label: 'Meals made', num: true }, { label: 'Meals delivered', num: true }, { label: 'Standard cost / meal', num: true }, { label: 'Manufacturing overhead', num: true }, { label: 'G&A', num: true }, { label: 'Interest', num: true }, { label: 'Fixed expense', num: true }, { label: 'Fixed / meal delivered', num: true }, { label: 'Principal repaid', num: true }], rows),
    detail: table([{ label: 'Period' }, { label: 'Overhead applied', num: true }, { label: 'Overhead incurred', num: true }, { label: 'Volume variance', num: true }, { label: 'Spending variance', num: true }],
      selected.ledger.months.map((m) => row([m.label, cents(m.overhead.appliedCents), cents(m.overhead.incurredCents), signedCents(m.overhead.volumeVarianceCents), signedCents(m.overhead.spendingVarianceCents)]))),
    basis: `${ctx.worldLabel}. Standard cost per meal is finished-goods cost over the meals made in the period. Fixed cost per meal is a period metric on the expense basis and is never in the cost of a meal.`,
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
  const ar = invoiceBalances(bundle.invoices ?? [], bundle.deliveries, bundle.customerPayments ?? []);
  const arAging = agingReport(ar.filter((b) => b.invoice.status === 'issued').map((b) => ({ id: b.invoice.id, party: b.invoice.customerName, document: b.invoice.invoiceNumber, date: b.invoice.issuedOn ?? b.invoice.openedOn, dueOn: b.invoice.dueOn, amountCents: b.amountCents, openCents: b.openCents })), asOf);
  const purchaseOrders = isPlan && selected.timeline
    ? selected.timeline.documents.purchaseOrders.map((p) => ({ id: p.id, poNumber: p.id, lines: p.lines.map((l) => ({ ingredient: l.ingredient, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents })) }))
    : pos.map((p) => ({ id: p.id, poNumber: p.poNumber, lines: p.lines.map((l) => ({ ingredient: l.ingredient, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents })) }));
  const bills = bundle.supplierBills ?? [];
  const balances = billBalances(bills, bundle.receipts, purchaseOrders, bundle.supplierPayments ?? []);
  const periodBillItems: OpenItem[] = bundle.bills.filter((b) => !b.paidOn).map((b) => {
    const date = b.incurredOn ?? periodStart(b.period);
    return { id: b.id, party: b.vendor ?? BILL_CATEGORY_LABELS[b.category], document: b.invoiceNumber ?? b.category, date, dueOn: dueOn(date, b.paymentTerms ?? null), amountCents: b.amountCents, openCents: b.amountCents };
  });
  const apAging = agingReport([...balances.map((b) => ({ id: b.bill.id, party: b.bill.supplierName, document: b.bill.billNumber, date: b.bill.billDate, dueOn: b.dueOn, amountCents: b.amountCents, openCents: b.openCents })), ...periodBillItems], asOf);
  const mismatched = balances.filter((b) => b.match.status === 'mismatched');
  const bucketCols = AGING_BUCKETS.map((b) => ({ label: AGING_LABELS[b], num: true }));
  const summary = table([{ label: 'Book' }, ...bucketCols, { label: 'Open', num: true }], [
    row(['Receivables — issued invoices', ...AGING_BUCKETS.map((b) => cents(arAging.totals[b])), cents(arAging.totalCents)]),
    row(['Payables — bills and period bills', ...AGING_BUCKETS.map((b) => cents(apAging.totals[b])), cents(apAging.totalCents)]),
    row(['Bills flagged on the three-way match, held from payment', ...AGING_BUCKETS.map(() => ''), `${mismatched.length} · ${cents(mismatched.reduce((t, b) => t + b.openCents, 0))}`], mismatched.length > 0 ? 'over' : undefined),
  ]);
  const detail = table([{ label: 'Book' }, { label: 'Party' }, ...bucketCols, { label: 'Open', num: true }], [
    ...arAging.rows.map((r) => row(['Receivables', r.party, ...AGING_BUCKETS.map((b) => cents(r.buckets[b])), cents(r.totalCents)])),
    ...apAging.rows.map((r) => row(['Payables', r.party, ...AGING_BUCKETS.map((b) => cents(r.buckets[b])), cents(r.totalCents)])),
  ]);
  return {
    summary,
    detail,
    basis: `${ctx.worldLabel}, aged as of ${asOf} in calendar days past the due date each document's terms set.`,
    empty: arAging.rows.length === 0 && apAging.rows.length === 0 ? 'Nothing is open on either book.' : undefined,
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
    line('Meals delivered', (m) => m.meals, n),
    line('Orders', (m) => m.orders, n),
    line('Batches', (m) => m.batches, n),
    line('New customers', (m) => m.newCustomers, n),
    line('Labor hours', (m) => m.laborHours, (v) => num(v, 1)),
    line('Revenue', (m) => m.revenueCents, cents),
    line('Food cost', (m) => m.foodCostCents, cents),
    line('Labor cost', (m) => m.laborCostCents, cents),
    line('Served cost per meal', (m) => servedCostPerMealCents(m), (v) => money(v / 100, 2)),
    line('Waste, kg', (m) => m.wasteKg, (v) => num(v, 0)),
    line('Emissions, t CO2e', (m) => m.emissionsKg.total, (v) => (v / 1000).toFixed(2)),
  ]);
  const detail = table([{ label: 'Month' }, { label: 'Plan in force' }, { label: 'Meals, plan', num: true }, { label: 'Meals, actual', num: true }, { label: 'Revenue, plan', num: true }, { label: 'Revenue, actual', num: true }, { label: 'Food cost, plan', num: true }, { label: 'Food cost, actual', num: true }, { label: 'Cash at month end, actual', num: true }],
    pva.months.map((m) => row([m.period, m.outsidePlanWindow ? `${m.planInForce.label ?? 'plan defaults'} (outside its window)` : (m.planInForce.label ?? 'plan defaults'), num(m.plan.measures.meals), num(m.actual.measures.meals), cents(m.plan.measures.revenueCents), cents(m.actual.measures.revenueCents), cents(m.plan.measures.foodCostCents), cents(m.actual.measures.foodCostCents), cents(m.closingCashCents.actual)])));
  return {
    summary,
    detail,
    basis: `${months[0]} to ${months[months.length - 1]}: each month against the plan of record in force at its end${pva.trailEntries > 0 ? ` (${pva.trailEntries} change${pva.trailEntries === 1 ? '' : 's'} of the plan of record on the trail)` : ''}. Reference food basis, Scope 2 location-based.`,
    empty: a.meals === 0 && a.batches === 0 && a.revenueCents === 0 ? 'Nothing is on record in the quarter yet.' : undefined,
  };
};

// ── Cold Chain ──────────────────────────────────────────────────────────────

const inventoryPosition: Builder = (ctx) => {
  const { selected, finished, today } = ctx;
  const R = selected.inputs;
  const recipeName = (code: string) => R.recipes.find((r) => r.code === code)?.name ?? code;
  const open = finished.lots.filter((l) => l.remaining > 1e-9).map((l) => ({ ...l, days: daysBetween(today, l.expires) })).sort((a, b) => a.expires.localeCompare(b.expires));
  const portions = open.reduce((s, l) => s + l.remaining, 0);
  const expiring = open.filter((l) => l.days <= 7);
  const expiredUnconsumed = finished.lots.filter((l) => l.expires < today && l.remaining > 1e-9);
  const raw = rawLotsByUseBy(rawStockOnHand({ receipts: selected.bundle.receipts, batches: selected.bundle.batches, asOf: today }));
  const rawPast = raw.filter((l) => l.daysToUseBy !== null && l.daysToUseBy < 0);
  const rawValue = raw.reduce((s, l) => s + l.remaining * l.unitPriceCents, 0);
  const summary = table([{ label: 'Measure' }, { label: 'Value', num: true }], [
    row(['Finished lots on hand, inside hold life', open.length]),
    row(['Portions on hand', num(Math.round(portions))]),
    row(['Lots within seven days of hold life', expiring.length], expiring.length > 0 ? 'over' : undefined),
    row(['Portions in those lots', num(Math.round(expiring.reduce((s, l) => s + l.remaining, 0)))]),
    row(['Portions past hold life, unconsumed', num(Math.round(expiredUnconsumed.reduce((s, l) => s + l.remaining, 0)))], expiredUnconsumed.length > 0 ? 'over' : undefined),
    row(['Chilled hold life, days', R.assumptions.inventory.chilledHoldLife.value]),
    row(['Raw lots on hand', raw.length]),
    row(['Raw lots past the date on the case', rawPast.length], rawPast.length > 0 ? 'over' : undefined),
    row(['Raw materials on hand, at invoice', cents(rawValue)]),
  ]);
  const detail = table([{ label: 'Lot' }, { label: 'Recipe' }, { label: 'Produced' }, { label: 'Hold life ends' }, { label: 'Days left', num: true }, { label: 'Portions', num: true }, { label: 'Status' }], [
    ...open.map((l) => row([l.batchId, recipeName(l.recipeCode), l.produced, l.expires, l.days, num(Math.round(l.remaining)), l.days <= 7 ? 'Expiring' : 'In hold'], l.days <= 7 ? 'over' : undefined)),
    ...raw.map((l) => row([`${l.ingredient} · ${l.lotCode}`, 'Raw material', l.receivedOn, l.useBy ?? '—', l.daysToUseBy ?? '—', `${num(l.remaining, 1)} ${l.unit}`, l.daysToUseBy !== null && l.daysToUseBy < 0 ? 'Past use-by' : 'On hand'], l.daysToUseBy !== null && l.daysToUseBy < 0 ? 'over' : undefined)),
  ]);
  return {
    summary,
    detail,
    basis: `${ctx.worldLabel}, as of ${today}. Finished goods are closed batches less delivered orders, drawn oldest first and aged against the hold life; raw lots are receipts less issues, by the date on the case.`,
    empty: open.length === 0 && raw.length === 0 ? 'Nothing is on hand.' : undefined,
  };
};

const coolingCompliance: Builder = (ctx) => {
  const { records, selected, today } = ctx;
  const R = selected.inputs;
  const recipeName = (code: string) => R.recipes.find((r) => r.code === code)?.name ?? code;
  const log = coolingLog(records, recipeName);
  const owed = chilledLotsOwed(records, R, recipeName);
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
    summary: table([{ label: 'Month' }, { label: 'Cooling records', num: true }, { label: 'Passed', num: true }, { label: 'Failed', num: true }, { label: 'Chilled lots with every load recorded', num: true }], rows),
    detail,
    basis: `The closed batch records as of ${today}. Pass or fail is computed from the readings against ${CCP2_LIMITS.startF}°F to ${CCP2_LIMITS.twoHourMaxF}°F within 2 hours and to ${CCP2_LIMITS.sixHourMaxF}°F within 6; one record per cabinet load.`,
    empty: log.length === 0 && owed.length === 0 ? 'No batch record has been closed.' : undefined,
  };
};

// ── Supply Chain ────────────────────────────────────────────────────────────

const supplyPosition: Builder = (ctx) => {
  const { records, pos, today } = ctx;
  const stock = rawStockOnHand({ receipts: records.receipts, batches: records.batches, asOf: today });
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
    row(['Ingredients with stock', Object.keys(stock.byIngredient).length]),
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
    basis: `The records as of ${today}: receipts less what closed batches issued, and the purchase orders on file.`,
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
  const detail = table([{ label: 'Received' }, { label: 'Supplier' }, { label: 'Invoice' }, { label: 'Ingredient' }, { label: 'Qty', num: true }, { label: 'On the order', num: true }, { label: '$/unit', num: true }, { label: 'Temp °F', num: true }, { label: 'Condition' }, { label: 'Override reason' }],
    [...records.receipts].sort((a, b) => b.receivedOn.localeCompare(a.receivedOn)).flatMap((r) => r.lines.map((l) => row([r.receivedOn, r.supplierName ?? '—', r.invoiceNumber ?? '—', l.ingredient, `${num(l.qty, 2)} ${l.unit}`, l.poQty === null || l.poQty === undefined ? '—' : num(l.poQty, 2), money(l.unitPriceCents / 100), l.receivedTempF ?? '—', l.condition === 'rejected' ? 'Rejected' : l.condition === 'accepted_with_note' ? 'Accepted with note' : 'Accepted', l.overrideReason ?? ''], l.condition === 'rejected' ? 'over' : undefined))));
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
  const suppliers = leanSuppliersById(Object.values(R.sustainability.ingredientSupplier));
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
  rows.push(row(['Per meal', 'kg CO2e, reference', (inv.normalizers.reference.kgPerMeal ?? 0).toFixed(2), `${num(inv.annualMeals)} meals`, '', '']));
  rows.push(row(['Per sq ft', 'kg CO2e, reference', (inv.normalizers.reference.kgPerSqFt ?? 0).toFixed(1), '', '', '']));
  rows.push(row(['Per operating day', 't CO2e, reference', t(inv.normalizers.reference.kgPerOperatingDay ?? 0), `${num(inv.operatingDays)} delivery days`, '', '']));
  const detail = table([{ label: 'Scope' }, { label: 'Category' }, { label: 'Period' }, { label: 'CO2e kg', num: true }, { label: 'Factor' }, { label: 'Factor status' }],
    inv.postings.map((p) => row([`Scope ${p.scope}${p.scope2Method ? ` (${p.scope2Method})` : ''}`, p.category, p.period, num(p.co2eKg, 1), `${p.factorId} v${p.factorVersion}`, p.factorStatus])));
  return {
    summary: table([{ label: 'Scope' }, { label: 'Line' }, { label: 't CO2e', num: true }, { label: 'Basis' }, { label: 'Activity' }, { label: 'Weakest status' }], rows),
    detail,
    basis: `${ctx.worldLabel}, ${w.periodLabel}, as of ${w.asOf}. Empty lines mean no input has been applied, never an estimate. Factor fingerprint ${inv.fingerprint}.`,
    empty: inv.annualMeals === 0 ? 'No meal is delivered in the period on this world.' : undefined,
  };
};

const wasteEndOfLife: Builder = async (ctx) => {
  const w = await sustainabilityWorld(ctx);
  const R = w.R;
  const produced = mixShrinkKg(w.basis, R.recipes, R.assumptions.yield.shrinkAllowance.value);
  const expired = expiredMassKg(w.basis, R.recipes);
  const tons = produced.kg / KG_PER_SHORT_TON;
  const share = R.sustainability.waste.compostShare;
  const net = warmNet(tons, share);
  const landfill = warmNet(tons, 0);
  const compost = warmNet(tons, 1);
  const recipeName = (code: string) => R.recipes.find((r) => r.code === code)?.name ?? code;
  const summary = table([{ label: 'Measure' }, { label: 'Value', num: true }], [
    row(['Portions produced in the period', num(produced.portions)]),
    row(['As-purchased food mass per portion', produced.portions > 0 ? `${((produced.apKg / produced.portions) * 1000).toFixed(0)} g` : '—']),
    row(['Shrink allowance', pct(R.assumptions.yield.shrinkAllowance.value, 0)]),
    row(['Shrink mass', `${num(produced.kg)} kg · ${tons.toFixed(2)} short tons`]),
    row(['Finished portions past hold life, unshipped', num(Math.round(expired.portions))], expired.portions > 1e-9 ? 'over' : undefined),
    row(['Their mass', `${num(expired.kg)} kg`]),
    row([`Shrink at the ${pct(share, 0)} compost share, t CO2e`, (net.netKg / 1000).toFixed(2)], 'total'),
    row(['All to landfill, t CO2e', (landfill.netKg / 1000).toFixed(2)]),
    row(['All to compost, t CO2e', (compost.netKg / 1000).toFixed(2)]),
    row(['Difference between the two pathways, t CO2e', ((landfill.netKg - compost.netKg) / 1000).toFixed(2)]),
  ]);
  const detail = table([{ label: 'Recipe' }, { label: 'Portions produced', num: true }, { label: 'Portions past hold life, unshipped', num: true }], [
    ...Object.entries(w.basis.producedByRecipe).map(([code, n]) => row([recipeName(code), num(Math.round(n)), num(Math.round(w.basis.expiredByRecipe[code] ?? 0))], (w.basis.expiredByRecipe[code] ?? 0) > 1e-9 ? 'over' : undefined)),
    ...Object.entries(w.basis.expiredByRecipe).filter(([code]) => !(code in w.basis.producedByRecipe)).map(([code, n]) => row([recipeName(code), '—', num(Math.round(n))], 'over')),
  ]);
  return {
    summary,
    detail,
    basis: `${ctx.worldLabel}, ${w.periodLabel}. Shrink is the allowance on every batch as mass; the pathways are on the WARM food-waste factors.`,
    empty: produced.portions === 0 && expired.portions === 0 ? 'Nothing is produced in the period on this world.' : undefined,
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
  const dispatch = horizon.deliveryDays.map((d) => ({ date: d.date, shipments: d.byRecipe.map((r) => ({ recipeCode: r.recipeCode, recipeName: r.recipeName, portions: r.filledBase })) }));
  const demand = staffDemand({ from: horizonFrom, to: horizonTo, days: horizon.productionDays, dispatch, studies: studies.studies });
  const busiest = demand.days.reduce<(typeof demand.days)[number] | null>((m, d) => (!m || d.staffHours > m.staffHours ? d : m), null);
  const recipeName = (code: string) => R.recipes.find((r) => r.code === code)?.name ?? code;
  const summary = table([{ label: 'Measure' }, { label: 'Value', num: true }], [
    row(['Production days with batches', demand.productionDays]),
    row(['Delivery days', demand.deliveryDays]),
    row(['Staff-hours required', num(demand.staffHours, 1)]),
    row(['Busiest day', busiest && busiest.staffHours > 0 ? `${busiest.date} · ${num(busiest.staffHours, 1)} h` : '—']),
    row(['Most people on one task, any day', demand.days.reduce((m, d) => Math.max(m, d.mostPeopleOnATask), 0)]),
    row(['Recipes with no time study', demand.uncoveredRecipes.length], demand.uncoveredRecipes.length > 0 ? 'over' : undefined),
    row(['Recipes staffed from an estimate', demand.estimatedRecipes.length]),
  ]);
  const detail = table([{ label: 'Date' }, { label: 'Batches', num: true }, { label: 'Portions made', num: true }, { label: 'Portions shipped', num: true }, { label: 'Staff-hours', num: true }, { label: 'Batch stream h', num: true }, { label: 'Dispatch stream h', num: true }, { label: 'Most people on a task', num: true }, { label: 'No study' }],
    demand.days.map((d) => row([d.date, d.batches, num(Math.round(d.portions)), num(Math.round(d.portionsShipped)), num(d.staffHours, 1), num(d.batchStaffHours, 1), num(d.dispatchStaffHours, 1), d.mostPeopleOnATask, d.uncovered.map((u) => recipeName(u.recipeCode)).join(', ')], d.uncovered.length > 0 ? 'over' : undefined)));
  return {
    summary,
    detail,
    basis: `${horizonFrom} to ${horizonTo} on ${ctx.worldLabel}: each recipe's scheduled batches and shipments staffed from its labor standard. Headcount and hours by task; no positions and no pay.`,
    empty: demand.days.length === 0 ? 'No batch or shipment in the next two weeks on this world.' : undefined,
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
    basis: `The time clock for the pay period holding ${today}. Hours only; pay, payroll and benefits are held in CompTable.`,
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
    sites: isPlan ? R.demand.sites : resolveCustomerSites(R.customers, {}, { closures }),
    customers: R.customers,
    cycles,
    orders: isPlan ? [] : orders,
    from,
    to,
    channelPriceCents: Object.fromEntries(R.phases.map((p) => [p.phase, Math.round(p.pricePerMeal * 100)])) as Record<number, number>,
    recipeNames: Object.fromEntries(R.recipes.map((r) => [r.code, r.name])),
    closures,
  });
  const rows = siteActualVsForecast(book, new Map(records.deliveries.map((d) => [d.id, d.meals])));
  const channelName = (c: number) => R.phases.find((p) => p.phase === c)?.market ?? `Channel ${c}`;
  const t = rows.reduce((s, r) => ({ serviceDates: s.serviceDates + r.serviceDates, forecast: s.forecast + r.forecastMeals, confirmed: s.confirmed + r.confirmedMeals, deliveredOrders: s.deliveredOrders + r.deliveredOrders, ordered: s.ordered + r.orderedOnDelivered, delivered: s.delivered + r.deliveredMeals }), { serviceDates: 0, forecast: 0, confirmed: 0, deliveredOrders: 0, ordered: 0, delivered: 0 });
  const diff = t.delivered - t.ordered;
  const summary = table([{ label: 'Measure' }, { label: 'Value', num: true }], [
    row(['Sites in the window', rows.length]),
    row(['Orders in the book', book.length]),
    row(['Forecast meals', num(t.forecast)]),
    row(['Confirmed meals', num(t.confirmed)]),
    row(['Delivered orders', t.deliveredOrders]),
    row(['Ordered on the delivered orders', num(t.ordered)]),
    row(['Delivered meals', num(t.delivered)]),
    row(['Delivered less ordered', `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${num(Math.abs(diff))}`], diff !== 0 ? 'over' : undefined),
    row(['Delivered as a share of ordered', t.ordered > 0 ? pct(t.delivered / t.ordered, 1) : '—']),
  ]);
  const detail = table([{ label: 'Customer' }, { label: 'Site' }, { label: 'Channel' }, { label: 'Service dates', num: true }, { label: 'Forecast', num: true }, { label: 'Confirmed', num: true }, { label: 'Delivered orders', num: true }, { label: 'Ordered', num: true }, { label: 'Delivered', num: true }, { label: 'Delivered − ordered', num: true }],
    rows.map((r) => row([r.customerName, r.siteName, channelName(r.channel), r.serviceDates, num(r.forecastMeals), num(r.confirmedMeals), r.deliveredOrders, num(r.orderedOnDelivered), num(r.deliveredMeals), `${r.deliveredLessOrdered > 0 ? '+' : r.deliveredLessOrdered < 0 ? '−' : ''}${num(Math.abs(r.deliveredLessOrdered))}`], r.deliveredLessOrdered !== 0 ? 'over' : undefined)));
  return {
    summary,
    detail,
    basis: `The order book from ${from} to ${to} on ${ctx.worldLabel}: forecast orders from the sites' meal plans with confirmed and delivered rows in their place; delivered meals from the delivery records.`,
    empty: book.length === 0 ? 'No order in the window on this world.' : undefined,
  };
};

const customersAndPipeline: Builder = (ctx) => {
  const { selected } = ctx;
  const R = selected.inputs;
  const channelName = (c: number) => R.phases.find((p) => p.phase === c)?.market ?? `Channel ${c}`;
  const pipe = pipelineStats(schoolRecords);
  const statuses = ['contracted', 'forecast', 'prospect', 'inactive'] as const;
  const byChannel = R.phases.map((p) => {
    const cs = R.customers.filter((c) => c.channel === p.phase);
    return row([p.market, ...statuses.map((s) => cs.filter((c) => c.status === s).length), cs.reduce((n, c) => n + c.sites.length, 0)]);
  });
  byChannel.push(row(['All channels', ...statuses.map((s) => R.customers.filter((c) => c.status === s).length), R.customers.reduce((n, c) => n + c.sites.length, 0)], 'total'));
  const pipelineRows = Object.entries(pipe.byStatus).sort(([, a], [, b]) => b - a).map(([s, n]) => row([`School pipeline — ${s}`, n, '', '', '']));
  pipelineRows.push(row(['School prospects in the directory', pipe.total, '', '', `${num(pipe.totalStudents)} students`], 'total'));
  const detail = table([{ label: 'Customer' }, { label: 'Channel' }, { label: 'Status' }, { label: 'Kind' }, { label: 'Sites', num: true }, { label: 'Payment terms' }, { label: 'Contract' }],
    [...R.customers].sort((a, b) => a.name.localeCompare(b.name)).map((c) => row([c.name, channelName(c.channel), CUSTOMER_STATUS_LABELS[c.status], c.kind, c.sites.length, c.paymentTerms ?? 'None on file', c.contractStart ? `${c.contractStart} to ${c.contractEnd ?? 'open'}` : '—'], c.status === 'inactive' ? 'faint' : undefined)));
  return {
    summary: table([{ label: 'Channel or stage' }, { label: 'Contracted', num: true }, { label: 'Forecast customer', num: true }, { label: 'Prospect', num: true }, { label: 'Inactive', num: true }, { label: 'Sites', num: true }], [...byChannel, ...pipelineRows.map((r) => ({ ...r, cells: [r.cells[0], r.cells[1], '', '', '', r.cells[4]] }))]),
    detail,
    basis: 'The customer library as facts of record, and the compiled school prospect directory. A customer with no payment terms is not invoiced.',
  };
};

// ── Distribution ────────────────────────────────────────────────────────────

const deliveriesHandoff: Builder = (ctx) => {
  const { records, today } = ctx;
  const ds: DeliveryDoc[] = records.deliveries;
  interface Acc { deliveries: number; meals: number; tempTaken: number; over41: number; signed: number; routeDone: number; sites: Set<string> }
  const months = new Map<string, Acc>();
  for (const d of ds) {
    const m = monthOf(d.deliveredOn);
    const a = months.get(m) ?? { deliveries: 0, meals: 0, tempTaken: 0, over41: 0, signed: 0, routeDone: 0, sites: new Set<string>() };
    a.deliveries += 1;
    a.meals += d.meals;
    if (d.handoffTempF !== null && d.handoffTempF !== undefined) { a.tempTaken += 1; if (d.handoffTempF > 41) a.over41 += 1; }
    if (d.receivedBy) a.signed += 1;
    if (d.routeCompletedAt) a.routeDone += 1;
    a.sites.add(d.siteName ?? d.siteId ?? '—');
    months.set(m, a);
  }
  const rows = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, a]) => row([m, a.deliveries, num(a.meals), a.sites.size, pct(a.tempTaken / a.deliveries, 0), a.over41, pct(a.signed / a.deliveries, 0), pct(a.routeDone / a.deliveries, 0)], a.over41 > 0 ? 'over' : undefined));
  const t = [...months.values()].reduce((s, a) => ({ deliveries: s.deliveries + a.deliveries, meals: s.meals + a.meals, tempTaken: s.tempTaken + a.tempTaken, over41: s.over41 + a.over41, signed: s.signed + a.signed, routeDone: s.routeDone + a.routeDone }), { deliveries: 0, meals: 0, tempTaken: 0, over41: 0, signed: 0, routeDone: 0 });
  if (t.deliveries > 0) rows.push(row(['All months', t.deliveries, num(t.meals), [...new Set(ds.map((d) => d.siteName ?? d.siteId ?? '—'))].length, pct(t.tempTaken / t.deliveries, 0), t.over41, pct(t.signed / t.deliveries, 0), pct(t.routeDone / t.deliveries, 0)], 'total'));
  const detail = table([{ label: 'Delivered' }, { label: 'Site' }, { label: 'Meals', num: true }, { label: 'Hand-off °F', num: true }, { label: 'Delivered by' }, { label: 'Signed by' }, { label: 'Lots' }, { label: 'Route completed' }],
    [...ds].sort((a, b) => b.deliveredOn.localeCompare(a.deliveredOn)).map((d) => row([d.deliveredOn, d.siteName ?? d.siteId ?? '—', num(d.meals), d.handoffTempF ?? '—', d.deliveredBy ?? '—', d.receivedBy ?? '—', d.lotCodes.join(', '), d.routeCompletedAt ? d.routeCompletedAt.slice(0, 10) : ''], d.handoffTempF !== null && d.handoffTempF !== undefined && d.handoffTempF > 41 ? 'over' : undefined)));
  return {
    summary: table([{ label: 'Month' }, { label: 'Deliveries', num: true }, { label: 'Meals', num: true }, { label: 'Sites', num: true }, { label: 'Temp at hand-off recorded', num: true }, { label: 'Above 41°F', num: true }, { label: 'Signed for', num: true }, { label: 'Route completed', num: true }], rows),
    detail,
    basis: `The delivery records as of ${today}. CCP-4: 41°F or below on arrival. A delivery with no temperature on the record is counted as not recorded, never as passed.`,
    empty: ds.length === 0 ? 'No delivery is on record.' : undefined,
  };
};

const deliverySites: Builder = (ctx) => {
  const { selected } = ctx;
  const R = selected.inputs;
  const sites = resolveSites(seedSites, R.sites, {}, forecastByDeliverySite(R.demand));
  const total = sites.reduce((s, x) => s + x.dailyForecastPortions, 0);
  const summary = table([{ label: 'Measure' }, { label: 'Value', num: true }], [
    row(['Delivery sites', sites.length]),
    row(['Linked to a school record', sites.filter((s) => s.schoolId).length]),
    row(['Forecast read from a customer site', sites.filter((s) => s.forecastFromCustomer).length]),
    row(['Total daily forecast, portions', num(total)]),
    row(['Placed on the linked school\'s own geocode', sites.filter((s) => s.placement.fromLinkedSchool).length]),
  ]);
  const detail = table([{ label: 'Site' }, { label: 'Type' }, { label: 'County' }, { label: 'Service window' }, { label: 'Daily forecast', num: true }, { label: 'Forecast source' }, { label: 'Placement' }],
    sites.map((s) => row([s.name, s.type, s.county, s.serviceWindow, num(s.dailyForecastPortions), s.forecastFromCustomer ? 'Customer site' : 'Site record', s.placement.source ? PLACEMENT_LABEL[s.placement.source] : 'Unplaced'])));
  return {
    summary,
    detail,
    basis: `${ctx.worldLabel}. Unlinked sites are invented seed placed at their county centroid; a linked site carries the school's own geocode.`,
  };
};

// ── Customer / Supplier / Parent ────────────────────────────────────────────

const customerAccounts: Builder = (ctx) => {
  const { records, orders, selected, today } = ctx;
  const R = selected.inputs;
  const balances = invoiceBalances(records.invoices ?? [], records.deliveries, records.customerPayments ?? []);
  const rows = [...R.customers].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
    const mine = orders.filter((o) => o.customerId === c.id);
    const del = records.deliveries.filter((d) => d.customerId === c.id);
    const inv = balances.filter((b) => b.invoice.customerId === c.id);
    const paid = (records.customerPayments ?? []).filter((p) => p.customerId === c.id).reduce((t, p) => t + p.amountCents, 0);
    const open = inv.reduce((t, b) => t + b.openCents, 0);
    return row([c.name, CUSTOMER_STATUS_LABELS[c.status], mine.filter((o) => o.status === 'confirmed').length, mine.filter((o) => o.status === 'delivered').length, del.length, num(del.reduce((t, d) => t + d.meals, 0)), inv.length, cents(inv.reduce((t, b) => t + b.amountCents, 0)), cents(open), cents(paid)], open > 0 ? undefined : c.status === 'inactive' ? 'faint' : undefined);
  });
  const detail = table([{ label: 'Invoice' }, { label: 'Customer' }, { label: 'Period' }, { label: 'Status' }, { label: 'Deliveries', num: true }, { label: 'Meals', num: true }, { label: 'Amount', num: true }, { label: 'Paid', num: true }, { label: 'Open', num: true }, { label: 'Due' }],
    balances.map((b) => row([b.invoice.invoiceNumber, b.invoice.customerName, b.invoice.period, b.invoice.status, b.deliveries.length, num(b.meals), cents(b.amountCents), cents(b.paidCents), cents(b.openCents), b.invoice.dueOn ?? '—'], b.openCents > 0 && b.invoice.dueOn && b.invoice.dueOn < today ? 'over' : undefined)));
  return {
    summary: table([{ label: 'Customer' }, { label: 'Status' }, { label: 'Confirmed orders', num: true }, { label: 'Delivered orders', num: true }, { label: 'Deliveries', num: true }, { label: 'Meals delivered', num: true }, { label: 'Invoices', num: true }, { label: 'Invoiced', num: true }, { label: 'Open', num: true }, { label: 'Received', num: true }], rows),
    detail,
    basis: `The records as of ${today}: orders on file, delivery records, the monthly invoices built from them and the payments applied. What a customer sees in its portal.`,
    empty: R.customers.length === 0 ? 'No customer is on file.' : undefined,
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

const parentEnrolment: Builder = () => {
  const schoolName = (id: string) => schoolRecords.find((s) => s.id === id)?.name ?? id;
  const bySchool = new Map<string, { accounts: number; active: number; pending: number; paused: number; kids: number }>();
  for (const a of parentAccounts) {
    const s = bySchool.get(a.schoolId) ?? { accounts: 0, active: 0, pending: 0, paused: 0, kids: 0 };
    s.accounts += 1;
    s[a.status] += 1;
    s.kids += a.kids;
    bySchool.set(a.schoolId, s);
  }
  const rows = [...bySchool.entries()].map(([id, s]) => row([schoolName(id), s.accounts, s.active, s.pending, s.paused, s.kids]));
  rows.push(row(['All schools', parentAccounts.length, parentAccounts.filter((a) => a.status === 'active').length, parentAccounts.filter((a) => a.status === 'pending').length, parentAccounts.filter((a) => a.status === 'paused').length, parentAccounts.reduce((t, a) => t + a.kids, 0)], 'total'));
  const detail = table([{ label: 'School' }, { label: 'Account' }, { label: 'Children', num: true }, { label: 'Plan' }, { label: 'Days / week', num: true }, { label: 'Cadence' }, { label: 'Status' }, { label: 'Since' }],
    parentAccounts.map((a) => row([schoolName(a.schoolId), a.guardian, a.kids, a.plan, a.daysPerWeek, a.cadence, a.status, a.since])));
  return {
    summary: table([{ label: 'School' }, { label: 'Accounts', num: true }, { label: 'Active', num: true }, { label: 'Pending', num: true }, { label: 'Paused', num: true }, { label: 'Children', num: true }], rows),
    detail,
    basis: 'Invented preview data for the parent module. No family has enrolled, no payment is connected, and no figure here is a record.',
  };
};

const BUILDERS: Record<string, Builder> = {
  'alerts-register': alertsRegister,
  'plan-and-forecasts': planAndForecasts,
  'production-history': productionHistory,
  'capacity-utilisation': capacityUtilisation,
  'labor-standards': laborStandards,
  'meal-cost': mealCost,
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
  'customers-and-pipeline': customersAndPipeline,
  'deliveries-handoff': deliveriesHandoff,
  'delivery-sites': deliverySites,
  'customer-accounts': customerAccounts,
  'supplier-catalogs': supplierCatalogs,
  'parent-enrolment': parentEnrolment,
};

/** Every catalog entry has a builder: the test asserts it. */
export const REPORT_BUILDER_IDS: readonly string[] = Object.keys(BUILDERS);

