import Link from 'next/link';
import { PageHeader, money, num } from '@/components/ui';
import { modulesFor } from '@/components/nav';
import { deriveCapacity } from '@/engine';
import { capexRollup } from '@/engine/financials';
import { postSelectedLedger } from '@/server/ledgers';
import { resolveScenarioInputs } from '@/engine/scenario';
import { getFarmAccess } from '@/server/access';
import { getScenarioView } from '@/server/scenarios';
import { listCropPlans } from '@/server/crop-plans';
import { listTimeStudies } from '@/server/time-studies';
import { activeCropPlanAverages } from '@/engine/active-averages';
import { orderWeek } from '@/engine/order-week';
import { orderBook } from '@/engine/orders';
import { WEEKDAY_LABELS } from '@/data/subscription-cycles';
import { listSubscriptionCycles, listOrders } from '@/server/orders';
import { listSubscribers } from '@/server/subscribers';
import { loadCalendar } from '@/server/periods';
import { loadSupplierTerms, loadTimeClock } from '@/server/working-capital';
import { listEquipment } from '@/server/equipment';
import { listPackagingLibrary } from '@/server/packaging';
import { loadActuals, loadProductionRecords } from '@/server/actuals';
import { listPurchaseOrders, listAllCatalog } from '@/server/supplier-catalog';
import { listLoans, listFixedCostLines, listLeasehold } from '@/server/finance';
import { billBalances } from '@/engine/working-capital';
import { CLOCK_STATE_LABELS, clockStateOf, hoursRun, payPeriodFor, type PayCalendar } from '@/engine/payroll';
import { pipelineStats } from '@/engine/prospects';
import { supplierDataset } from '@/data/suppliers';
import { prospectRecords } from '@/data/prospects';
import { cropPlanFoodFootprint } from '@/engine/carbon';
import { dashboardToday } from '@/engine/dashboard-today';
import { distributedConsumption, finishedGoodsOnHand } from '@/engine/production-plan';
import { resolveSubscriberPickupPoints } from '@/engine/demand';
import { mixFoodFootprint } from '@/engine/sustainability-basis';
import { getLedgerKind } from '@/server/ledgers';
import { postSustainabilityBasis } from '@/server/sustainability';
import { listSupplierLcaOptions } from '@/server/supplier-lca';
import { lcaOptions as curatedOptions } from '@/data/lca-options';
import { factorRegistry } from '@/data/emission-factors';
import { withWorkspace } from '@/server/workspace';
import { STAGE_CONTROL_POINTS } from '@/data/produce-safety';
import { isGrowPlanCarrier } from '@/engine/grow-plan-bridge';
import { planStageDays } from '@/data/grow-plan';
import { cycleDays } from '@/data/stage-schedule';

const DASHBOARD_PURPOSE = 'See today\'s plan, stock, capacity and anything that needs attention.';
const DASHBOARD_HOW = (
  <ul>
    <li>One facility produces grow units for Austin prospects.</li>
    <li>Demand draws finished inventory, inventory triggers whole sowings, and the blackout rack sets the ceiling.</li>
    <li>Every tile traces to a module.</li>
  </ul>
);

/**
 * Two dashboards at `/farm/dashboard` (Roadmap O5, P7). Admins get the Admin Dashboard, company financials
 * and staff included. Operators get the operating dashboard: no company
 * financials, and no HR or staff data other than their own. Each is loaded only for its role, so an
 * operator's page never reads or sends the financial figures.
 */
export default async function FarmDashboard() {
  return withWorkspace(() => FarmDashboardInner());
}

async function FarmDashboardInner() {
  const access = await getFarmAccess();
  // Called directly, not rendered as elements, so both run inside the workspace scope.
  return access.isSuperAdmin ? await AdminDashboard() : await OperatorDashboard({ staffId: access.staffId });
}

// ── Shared: what both dashboards read ───────────────────────────────────────

async function loadOperatingPicture() {
  // The dashboard reflects what this person is looking at: the open forecast, or the plan of
  // record (plan-data defaults when none has been set), in the world selected in the scenario bar.
  const [view, library, subscribers, calendar, supplierTerms, pos, equipment, packaging, catalog, loans, fixedCostLines, leasehold, timeStudies, kind, cycles, orders, production, supplierOptions] = await Promise.all([getScenarioView(), listCropPlans(), listSubscribers(), loadCalendar(), loadSupplierTerms(), listPurchaseOrders(), listEquipment(), listPackagingLibrary(), listAllCatalog(), listLoans(), listFixedCostLines(), listLeasehold(), listTimeStudies(), getLedgerKind(), listSubscriptionCycles(), listOrders(), loadProductionRecords(), listSupplierLcaOptions()]);
  const R = resolveScenarioInputs(view.config, library, subscribers, calendar.closures, supplierTerms, equipment, packaging, catalog, undefined, loans, fixedCostLines, leasehold, timeStudies.studies);
  const closures = calendar.closures;
  const isPlan = kind === 'plan';
  const today = new Date().toISOString().slice(0, 10);
  const pf = Object.fromEntries(R.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>;
  const active = R.cropPlans.filter((r) => r.status === 'in_service');
  const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  // Plant figures across the active crop plans: each on its own sowing (Roadmap N9).
  const caps = active.map((r) => deriveCapacity(r, R.capacityInputs));
  const cap = caps[0] ?? deriveCapacity(R.cropPlans[0], R.capacityInputs);
  const plant = { sowingSize: mean(caps.map((c) => c.sowingSize)), cyclesPerDay: mean(caps.map((c) => c.cyclesPerDay)), maxUnitsPerDay: mean(caps.map((c) => c.maxUnitsPerDay)) };

  // Today: the next production day from the order book on the selected world.
  const worldOrders = isPlan ? [] : orders;
  const book = orderBook({
    pickupPoints: isPlan ? R.demand.pickupPoints : resolveSubscriberPickupPoints(R.subscribers, {}, { closures }),
    subscribers: R.subscribers,
    cycles,
    orders: worldOrders,
    from: today,
    to: isoAddDaysLocal(today, 14),
    channelPriceCents: Object.fromEntries(R.phases.map((p) => [p.phase, Math.round(p.pricePerUnit * 100)])) as Record<number, number>,
    cropPlanNames: Object.fromEntries(R.cropPlans.map((r) => [r.code, r.name])),
    closures,
  });
  const shelfLife = R.assumptions.inventory.blackoutShelfLife.value;
  const openingLots = isPlan
    ? []
    : finishedGoodsOnHand({ sowings: production.sowings, consumed: distributedConsumption(orders, production.distributions, R.cropPlans, pf), shelfLifeDays: shelfLife, asOf: today }).lots.filter((l) => l.remaining > 0);
  const day = dashboardToday({ today, book, cropPlans: R.cropPlans, capacityInputs: R.capacityInputs, assumptions: R.assumptions, cropPlanAssumptions: R.cropPlanAssumptions, unitFactorByChannel: pf, openingLots, closures, channels: R.phases.map((p) => p.phase) });

  // Food: active-crop-plan averages per unit, and the period's footprint on the selected ledger.
  const foots = active.map((r) => cropPlanFoodFootprint(r as never));
  const basis = await postSustainabilityBasis(kind, view.config);
  const mix = mixFoodFootprint({ basis, cropPlans: R.cropPlans, unitFactorByChannel: pf, selection: R.sustainability.inputBasis, options: [...curatedOptions, ...supplierOptions] });
  const foodCo2 = { perUnit: mean(foots.map((f) => f.totalKgCo2ePerUnit)), periodKg: mix.referenceKg, periodLabel: isPlan ? `forecast year from ${basis.from}` : `reporting year ${basis.from.slice(0, 4)}`, unmappedCropPlans: mix.cropPlansWithUnmappedLines.length, activeCount: active.length };
  return { R, pos, cap, plant, day, foodCo2, closures, isPlan, cycles, orders };
}

type Picture = Awaited<ReturnType<typeof loadOperatingPicture>>;

function coverText(day: Picture['day']): string {
  return day.daysOfCover === null ? '—' : day.daysOfCover.toFixed(1);
}

function coldChainCard({ day }: Picture): SectionCardProps {
  return {
    section: 'Inventory & Quality',
    stats: [
      { label: 'Stage control points', value: num(STAGE_CONTROL_POINTS.length) },
      { label: 'Trays on the shelves today', value: num(day.shelf?.traysOnShelf ?? 0) },
      { label: 'In their harvest window today', value: num(day.shelf?.traysHarvestable ?? 0) },
      { label: 'Days of cover', value: coverText(day) },
    ],
    note: `Seed sanitation, the spent-water test on jars, temperature and humidity, and the harvest check, recorded on the sowing. ${day.shelf ? `${num(day.shelf.sowingsInWindow)} sowing${day.shelf.sowingsInWindow === 1 ? '' : 's'} start in the next two weeks, ${num(day.shelf.traysSownInWindow)} trays${day.shelf.noRoom > 0 ? `; ${num(day.shelf.noRoom)} with no room on any grow unit` : ''}.` : 'No grow plan in the library.'}`,
  };
}

function sustainabilityCard({ foodCo2 }: Picture): SectionCardProps {
  return {
    section: 'Sustainability',
    stats: [
      { label: 'Food CO2e / unit, active-crop-plan average', value: `${foodCo2.perUnit.toFixed(2)} kg` },
      { label: 'Food footprint', value: `${(foodCo2.periodKg / 1000).toFixed(1)} t` },
      { label: 'Plans with unmapped lines', value: `${num(foodCo2.unmappedCropPlans)} served` },
      { label: 'Factors on file', value: num(factorRegistry.length) },
    ],
    note: `Scope 3 purchased inputs on the reference basis (study means), ${foodCo2.periodLabel}, plan by plan. A line with no mapping to a study product carries no footprint.`,
  };
}

// ── Admin ───────────────────────────────────────────────────────────────────

async function AdminDashboard() {
  // Actuals carry the staff register and the clock: loaded for admins only.
  const [picture, actuals, studies, selected] = await Promise.all([loadOperatingPicture(), loadActuals(), listTimeStudies(), postSelectedLedger()]);
  const { cycles, orders } = picture;
  const { R, pos } = picture;
  const today = new Date().toISOString().slice(0, 10);

  // The Production card: the week of orders from today, by channel, with the
  // food and labor cost of those units (`_engine/order-week.ts`).
  const weekTo = isoAddDaysLocal(today, 6);
  const book = orderBook({
    pickupPoints: R.demand.pickupPoints,
    subscribers: R.subscribers,
    cycles,
    orders,
    from: today,
    to: weekTo,
    channelPriceCents: Object.fromEntries(R.phases.map((p) => [p.phase, Math.round(p.pricePerUnit * 100)])) as Record<number, number>,
    cropPlanNames: Object.fromEntries(R.cropPlans.map((r) => [r.code, r.name])),
    closures: picture.closures,
  });
  const week = orderWeek({
    book,
    from: today,
    channels: R.phases.map((p) => p.phase),
    cropPlans: R.cropPlans,
    cap: R.capacityInputs,
    assumptions: R.assumptions,
    studies: studies.studies,
    unitFactorByChannel: Object.fromEntries(R.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>,
    cropPlanAssumptions: R.cropPlanAssumptions,
  });
  const channelName = (c: number) => R.phases.find((p) => p.phase === c)?.market ?? `Channel ${c}`;

  // The top row: averages over every active crop plan, each on its own sowing and
  // its own labor standard — the seeded estimates until actuals replace them.
  const avg = activeCropPlanAverages(R.cropPlans, R.capacityInputs, R.assumptions, studies.studies, R.cropPlanAssumptions);
  const basisNote = avg.count === 0
    ? 'No grow plan is In Service.'
    : `Averaged over ${num(avg.count)} active grow plan${avg.count === 1 ? '' : 's'}, each on its own sowing${avg.onEstimate > 0 ? `; ${num(avg.onEstimate)} on an estimated time study` : ''}${avg.withoutStudy > 0 ? `; ${num(avg.withoutStudy)} with no study` : ''}. Seeded estimates stand until observed studies are adopted.`;
  const growPlans = R.cropPlans.filter((r) => r.status === 'in_service').filter(isGrowPlanCarrier);
  const meanCycle = growPlans.length ? growPlans.reduce((t, r) => t + cycleDays(planStageDays(r.plan)), 0) / growPlans.length : 0;

  // ── Alerts (Roadmap K2): supplier bills that do not match their purchase
  //    order and receipts are flagged here and held from payment.
  const mismatchedBills = billBalances(
    actuals.supplierBills ?? [],
    actuals.receipts,
    pos.map((p) => ({ id: p.id, poNumber: p.poNumber, lines: p.lines })),
    actuals.supplierPayments ?? [],
  ).filter((b) => b.match.status === 'mismatched');

  // ── Financials: the ledger selected in the scenario bar (Roadmap N6), on the saved
  //    open forecast. The fiscal year holding today, else the first year of the ledger.
  const years = selected.ledger.years;
  const year = years.find((y) => y.from <= today && today <= y.to) ?? years[0]!;
  const yis = year.incomeStatement;
  const capex = capexRollup(R);
  const openPoCents = pos.filter((p) => p.status === 'draft' || p.status === 'issued').reduce((t, p) => t + p.subtotalCents, 0);

  // ── People ──────────────────────────────────────────────────────────────
  // The clock and hours only. Pay, payroll and benefits are held in Staffing (Roadmap O1).
  const activeStaff = (actuals.staff ?? []).filter((s) => s.status === 'active');
  const clockPunches = actuals.punches ?? [];
  const payPeriodNow = payPeriodFor(new Date().toISOString().slice(0, 10), R.payCalendar);
  const hoursNow = hoursRun(payPeriodNow, activeStaff, clockPunches);
  const onClockNow = activeStaff.filter((s) => clockStateOf(clockPunches.filter((p) => p.staffId === s.id)) !== 'out').length;

  // ── Supply / Distribution ───────────────────────────────────────────────
  const sup = supplierDataset.counts;
  const pipe = pipelineStats(prospectRecords);

  const sections: SectionCardProps[] = [
    {
      section: 'Financials & Accounting',
      stats: [
        { label: `Revenue ${year.label}`, value: money(yis.revenueCents / 100, 0) },
        { label: `Operating income ${year.label}`, value: money(yis.operatingIncomeCents / 100, 0) },
        { label: `Closing cash ${year.label}`, value: money(year.cashFlow.closingCashCents / 100, 0) },
        { label: 'Total capital', value: money(capex.totalCapex, 0) },
      ],
      note: `${selected.kind === 'plan' ? `Plan — ${selected.view.label ?? 'plan defaults'}, as saved` : `Actual — recorded documents${selected.empty ? '; nothing on record yet' : ''}`}, ${year.from} to ${year.to}. Fixed cost per unit ${year.fixedExpense.perUnitCents === null ? '—' : money(year.fixedExpense.perUnitCents / 100)} over ${num(Math.round(year.unitsDistributed))} units distributed — a period metric, not in the cost of a unit; by month on Unit Economics.`,
    },
    coldChainCard(picture),
    {
      section: 'Supply Chain',
      stats: [
        { label: 'Producers in directory', value: num(sup.total) },
        { label: 'Certified organic', value: num(sup.certified) },
        { label: 'Central Texas', value: num(sup.centralTx) },
        { label: 'Open purchase orders', value: money(openPoCents / 100, 0) },
      ],
      note: 'Purchase orders drawn from units produced; suppliers from USDA INTEGRITY + TDA Farm Fresh.',
    },
    sustainabilityCard(picture),
    {
      section: 'People',
      stats: [
        { label: 'On the staff register', value: num(activeStaff.length) },
        { label: 'On the clock now', value: num(onClockNow) },
        { label: 'Hours this pay period', value: num(hoursNow.regularHours + hoursNow.overtimeHours, 1) },
        { label: 'Open shifts', value: num(hoursNow.openShifts) },
      ],
      note: `Pay period ${payPeriodNow.start} to ${payPeriodNow.end}. Pay, payroll and benefits are held in Staffing.`,
    },
    {
      section: 'Sales',
      stats: [
        { label: 'Prospect prospects', value: num(pipe.total) },
        { label: 'Signed subscribers', value: num(pipe.byStatus['Signed - Active'] ?? 0) },
        { label: 'Subscribers on file', value: num(R.subscribers.filter((c) => c.status !== 'inactive').length) },
        { label: 'In talks', value: num(pipe.byStatus['In Talks'] ?? 0) },
      ],
      note: `Pipeline: ${num(pipe.byStatus['In Talks'] ?? 0)} in talks · ${num(pipe.byStatus['Negotiating'] ?? 0)} negotiating · ${num(pipe.byStatus['Lead'] ?? 0)} leads`,
    },
  ];

  return (
    <>
      <PageHeader
        title="Admin Dashboard"
        purpose={DASHBOARD_PURPOSE}
        functions={['Production', 'Financials & Accounting', 'Inventory & Quality', 'Supply Chain', 'Sustainability']}
        howItWorks={DASHBOARD_HOW}
        status="live"
      />

      {/* Headline hero band. On a dark ground the hero is the brightest object
          on the page, not a coloured block — see _components/farm.css. */}
      <div className="farm-hero farm-hero-green">
        <div className="farm-card-title col-span-full! farm-c-accent m-0!">Mean averages for active grow plans, per tray</div>
        <HeroStat value={<>{money(avg.inputCostPerUnit)} <span className="farm-hero-arrow">→</span> {money(avg.costToServePerUnit)}</>} label="Inputs → cost to serve" sub="Seed, medium, nutrient, light and consumables → plus labor, packaging, distribution" />
        <HeroStat value={money(avg.inputCostPerUnit)} label="Input cost per tray" sub="The four line kinds and consumables, with the shrink allowance" />
        <HeroStat value={`${num(meanCycle, 1)} days`} label="Cycle on the shelf" sub="Sow through the harvest window" />
        <HeroStat value={num(avg.laborMinutesPerUnit, 2)} label="Labor minutes per tray" sub="Sow day, every day on the shelf, harvest day" />
        <HeroStat value={money(avg.laborCostPerUnit)} label="Labor cost per tray" sub="At the placeholder loaded rate until Staffing" />
      </div>
      <p className="farm-kpi-sub mt-2">{basisNote}</p>

      {mismatchedBills.length > 0 && (
        <div className="farm-card mt-4">
          <div className="farm-card-title">Alerts — supplier bills flagged</div>
          <ul className="m-0! pl-[1.1rem] grid gap-[0.3rem] farm-fs-sm">
            {mismatchedBills.map((b) => (
              <li key={b.bill.id}>
                Bill {b.bill.billNumber} from {b.bill.supplierName}, dated {b.bill.billDate}: {money(b.amountCents / 100)} billed against {money(b.match.receivedCents / 100)} received; {b.match.issues.length} issue{b.match.issues.length === 1 ? '' : 's'} against its purchase order and receipts. Held from payment until rectified.
              </li>
            ))}
          </ul>
          <Link href="/farm/payables" className="farm-link farm-fs-xs inline-block! mt-[0.6rem]!">Payables</Link>
        </div>
      )}

      <div className="farm-card farm-lift mt-4">
        <div className="farm-card-title">Production — units on order, {today} to {week.to}</div>
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead>
              <tr>
                <th>Day</th>
                {week.channels.map((c) => <th key={c} className="num">{channelName(c)}</th>)}
                <th className="num">Units</th>
                <th className="num">Input cost</th>
                <th className="num">Labor cost</th>
              </tr>
            </thead>
            <tbody>
              {week.days.map((d) => (
                <tr key={d.date} className={`${d.units === 0 ? 'farm-c-faint' : ''}`}>
                  <td className="whitespace-nowrap!">{WEEKDAY_LABELS[d.weekday]} {d.date}</td>
                  {week.channels.map((c) => <td key={c} className="num">{num(d.unitsByChannel[c] ?? 0)}</td>)}
                  <td className="num">{num(d.units)}</td>
                  <td className="num">{money(d.inputCost, 0)}</td>
                  <td className="num">{money(d.laborCost, 0)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Week</td>
                {week.channels.map((c) => <td key={c} className="num">{num(week.unitsByChannel[c] ?? 0)}</td>)}
                <td className="num">{num(week.units)}</td>
                <td className="num">{money(week.inputCost, 0)}</td>
                <td className="num">{money(week.laborCost, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="farm-fs-xs farm-c-faint mt-[0.9rem]! mr-0! mb-0! ml-0! leading-[1.4]">
          The order book from today: forecast orders from the subscriber pickupPoints with confirmed and distributed rows in their place. Each unit is costed at its cropPlan&rsquo;s unit input cost on the channel&rsquo;s unit and its cropPlan&rsquo;s labor standard at the cropPlan&rsquo;s own one-line sowing &mdash; the seeded estimates until observed studies are adopted; labor at the placeholder loaded rate.{week.uncostedUnits > 0 ? ` ${num(week.uncostedUnits)} units name a crop plan not in the library and carry no cost.` : ''} {dayNote(picture.day)}
        </p>
        <div className="flex flex-wrap gap-y-[0.1rem] gap-x-3 mt-[0.8rem]! pt-[0.7rem] border-t border-t-[color:var(--farm-line)]">
          {modulesFor(true).filter((m) => m.section === 'Production').map((m) => (
            <Link key={m.href} href={m.href} className="farm-link farm-fs-xs">{m.label}</Link>
          ))}
        </div>
      </div>

      <SectionGrid sections={sections} isAdmin />
    </>
  );
}

function dayNote(day: Picture['day']): string {
  if (!day.productionDate) return 'No order in the next two weeks on this world.';
  return `Next production day ${day.productionDate}: ${num(day.sowings)} sowings · ${num(day.units)} units${day.shortfall > 0 ? ` · ${num(day.shortfall)} short of cycles` : ''} · ${coverText(day)}-day cover`;
}

const isoAddDaysLocal = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ── Operator ────────────────────────────────────────────────────────────────

/** The operator's own clock and hours this pay period — their record only. */
async function ownClock(staffId: string, calendar: PayCalendar) {
  const clock = await loadTimeClock();
  const me = clock.staff.filter((s) => s.id === staffId);
  const mine = clock.punches.filter((p) => p.staffId === staffId);
  const period = payPeriodFor(new Date().toISOString().slice(0, 10), calendar);
  return { state: clockStateOf(mine), period, hours: hoursRun(period, me, mine) };
}

async function OperatorDashboard({ staffId }: { staffId: string | null }) {
  const picture = await loadOperatingPicture();
  const own = staffId ? await ownClock(staffId, picture.R.payCalendar) : null;
  const { pos, cap, plant, day } = picture;
  const avgFood = activeCropPlanAverages(picture.R.cropPlans, picture.R.capacityInputs, picture.R.assumptions, [], picture.R.cropPlanAssumptions);
  const sup = supplierDataset.counts;
  const pipe = pipelineStats(prospectRecords);

  const sections: SectionCardProps[] = [
    {
      section: 'Production',
      stats: [
        { label: 'Input cost / unit, active average', value: money(avgFood.inputCostPerUnit) },
        { label: 'Sowing, active average', value: num(plant.sowingSize) },
        { label: 'Max units / day, average', value: num(plant.maxUnitsPerDay) },
        { label: 'Blackout rack cycles / day', value: num(plant.cyclesPerDay, 1) },
      ],
      note: dayNote(day),
    },
    coldChainCard(picture),
    {
      section: 'Supply Chain',
      stats: [
        { label: 'Producers in directory', value: num(sup.total) },
        { label: 'Certified organic', value: num(sup.certified) },
        { label: 'Central Texas', value: num(sup.centralTx) },
        { label: 'Purchase orders on file', value: num(pos.length) },
      ],
      note: 'Purchase orders drawn from units produced; suppliers from USDA INTEGRITY + TDA Farm Fresh.',
    },
    sustainabilityCard(picture),
    {
      section: 'People',
      stats: own
        ? [
            { label: 'Your clock', value: CLOCK_STATE_LABELS[own.state] },
            { label: 'Your hours this pay period', value: num(own.hours.regularHours + own.hours.overtimeHours, 1) },
            { label: 'Your overtime hours', value: num(own.hours.overtimeHours, 1) },
            { label: 'Your open shifts', value: num(own.hours.openShifts) },
          ]
        : [],
      note: own
        ? `Pay period ${own.period.start} to ${own.period.end}. Your own record; pay is held in Staffing.`
        : 'Your sign-in is not the email of a person on the staff register. Time studies, the two-week staff demand and the Grow Room are open to everyone; pay and personal details are held in Staffing.',
    },
    {
      section: 'Sales',
      stats: [
        { label: 'Prospect prospects', value: num(pipe.total) },
        { label: 'Signed subscribers', value: num(pipe.byStatus['Signed - Active'] ?? 0) },
        { label: 'In talks', value: num(pipe.byStatus['In Talks'] ?? 0) },
        { label: 'Subscribers on file', value: num(picture.R.subscribers.filter((c) => c.status !== 'inactive').length) },
      ],
      note: `Pipeline: ${num(pipe.byStatus['Negotiating'] ?? 0)} negotiating · ${num(pipe.byStatus['Lead'] ?? 0)} leads`,
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        purpose={DASHBOARD_PURPOSE}
        functions={['Production', 'Inventory & Quality', 'Supply Chain', 'Sustainability', 'People']}
        howItWorks={DASHBOARD_HOW}
        status="live"
      />

      <div className="farm-hero">
        <HeroStat value={num(plant.sowingSize)} label="Sowing — active-crop-plan average" sub={`One rack's load each; ${num(cap.cyclesPerDay)} cycles a day on one rack`} />
        <HeroStat value={num(day.sowings)} label={day.productionDate ? `Sowings ${day.productionDate === new Date().toISOString().slice(0, 10) ? 'today' : `on ${day.productionDate}`}` : 'Sowings — next production day'} sub={day.productionDate ? `${num(day.units)} units${picture.isPlan ? ', the open forecast' : ', the orders on file'}` : 'No order in the next two weeks'} />
        <HeroStat value={coverText(day)} label="Days of cover" sub={`Finished stock over a distribution day's orders; ${picture.R.assumptions.inventory.blackoutShelfLife.value}-day shelf life`} />
        <HeroStat value={money(avgFood.inputCostPerUnit)} label="Input cost / unit" sub="Active-crop-plan average, at standard" />
      </div>

      <SectionGrid sections={sections} isAdmin={false} />
    </>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** The title stacked over the value, the title in copper. */
function HeroStat({ value, label, sub }: { value: React.ReactNode; label: string; sub?: string }) {
  return (
    <div>
      <div className="farm-hero-label farm-c-accent mt-0! mb-2!">{label}</div>
      <div className="farm-hero-value">{value}</div>
      {sub && <div className="farm-hero-sub">{sub}</div>}
    </div>
  );
}

interface Stat {
  label: string;
  value: string;
}
interface SectionCardProps {
  section: string;
  stats: Stat[];
  note?: string;
}

function SectionGrid({ sections, isAdmin }: { sections: SectionCardProps[]; isAdmin: boolean }) {
  return (
    <div className="grid gap-4 mt-4 farm-autofit-21">
      {sections.map((s) => (
        <SectionCard key={s.section} {...s} isAdmin={isAdmin} />
      ))}
    </div>
  );
}

function SectionCard({ section, stats, note, isAdmin }: SectionCardProps & { isAdmin: boolean }) {
  const links = modulesFor(isAdmin).filter((m) => m.section === section);
  return (
    <div className="farm-card farm-lift">
      <div className="farm-card-title">{section}</div>
      {stats.length > 0 && (
        <div className="grid grid-cols-[repeat(2,1fr)]! gap-y-[0.9rem]! gap-x-4! mt-[0.3rem]!">
          {stats.map((st) => (
            <div key={st.label}>
              <div className="farm-mono farm-fs-lg font-semibold leading-[1.1] tracking-[-0.015em] farm-c-ink [font-variant-numeric:lining-nums_tabular-nums]">{st.value}</div>
              <div className="farm-fs-xs farm-c-soft mt-[0.2rem]!">{st.label}</div>
            </div>
          ))}
        </div>
      )}
      {note && (
        <p className={`farm-fs-xs farm-c-faint leading-[1.4] ${(stats.length > 0 ? 'mt-[0.9rem]! mr-0! mb-0! ml-0!' : 'mt-[0.3rem]! mr-0! mb-0! ml-0!')}`}>{note}</p>
      )}
      <div className="flex flex-wrap gap-y-[0.1rem] gap-x-3 mt-[0.8rem]! pt-[0.7rem] border-t border-t-[color:var(--farm-line)]">
        {links.map((m) => (
          <Link key={m.href} href={m.href} className="farm-link farm-fs-xs">{m.label}</Link>
        ))}
      </div>
    </div>
  );
}
