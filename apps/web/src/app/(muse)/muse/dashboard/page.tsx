import Link from 'next/link';
import { PageHeader, money, num } from '../_components/ui';
import { modulesFor } from '../_components/nav';
import { deriveCapacity } from '../_engine';
import { capexRollup } from '../_engine/financials';
import { postSelectedLedger } from '../_lib/ledgers';
import { resolveScenarioInputs } from '../_engine/scenario';
import { getMuseAccess } from '../_lib/access';
import { getScenarioView } from '../_lib/scenarios';
import { listRecipes } from '../_lib/recipes';
import { listTimeStudies } from '../_lib/time-studies';
import { activeRecipeAverages } from '../_engine/active-averages';
import { orderWeek } from '../_engine/order-week';
import { orderBook } from '../_engine/orders';
import { WEEKDAY_LABELS } from '../_data/menu-cycles';
import { listMenuCycles, listOrders } from '../_lib/orders';
import { listCustomers } from '../_lib/customers';
import { loadCalendar } from '../_lib/periods';
import { loadSupplierTerms, loadTimeClock } from '../_lib/working-capital';
import { listEquipment } from '../_lib/equipment';
import { listPackagingLibrary } from '../_lib/packaging';
import { loadActuals, loadProductionRecords } from '../_lib/actuals';
import { listPurchaseOrders, listAllCatalog } from '../_lib/supplier-catalog';
import { listLoans, listFixedCostLines, listLeasehold } from '../_lib/finance';
import { billBalances } from '../_engine/working-capital';
import { CLOCK_STATE_LABELS, clockStateOf, hoursRun, payPeriodFor, type PayCalendar } from '../_engine/payroll';
import { pipelineStats } from '../_engine/schools';
import { ccps } from '../_data/plan-data';
import { supplierDataset } from '../_data/suppliers';
import { schoolRecords } from '../_data/schools';
import { recipeFoodFootprint } from '../_engine/carbon';
import { dashboardToday } from '../_engine/dashboard-today';
import { deliveredConsumption, finishedGoodsOnHand } from '../_engine/production-plan';
import { resolveCustomerSites } from '../_engine/demand';
import { mixFoodFootprint } from '../_engine/sustainability-basis';
import { getLedgerKind } from '../_lib/ledgers';
import { postSustainabilityBasis } from '../_lib/sustainability';
import { listSupplierLcaOptions } from '../_lib/supplier-lca';
import { lcaOptions as curatedOptions } from '../_data/lca-options';
import { factorRegistry } from '../_data/emission-factors';

const DASHBOARD_PURPOSE = 'See today\'s plan, stock, capacity and anything that needs attention.';
const DASHBOARD_HOW = (
  <ul>
    <li>One commissary produces cook-chill meals for Austin schools.</li>
    <li>Demand draws finished inventory, inventory triggers whole batches, and the blast chiller sets the ceiling.</li>
    <li>Every tile traces to a module.</li>
  </ul>
);

/**
 * Two dashboards at `/muse/dashboard` (Roadmap O5, P7). Admins get the Admin Dashboard, company financials
 * and staff included. Operators get the operating dashboard: no company
 * financials, and no HR or staff data other than their own. Each is loaded only for its role, so an
 * operator's page never reads or sends the financial figures.
 */
export default async function MuseDashboard() {
  const access = await getMuseAccess();
  return access.isSuperAdmin ? <AdminDashboard /> : <OperatorDashboard staffId={access.staffId} />;
}

// ── Shared: what both dashboards read ───────────────────────────────────────

async function loadOperatingPicture() {
  // The dashboard reflects what this person is looking at: the open forecast, or the plan of
  // record (plan-data defaults when none has been set), in the world selected in the scenario bar.
  const [view, library, customers, calendar, supplierTerms, pos, equipment, packaging, catalog, loans, fixedCostLines, leasehold, timeStudies, kind, cycles, orders, production, supplierOptions] = await Promise.all([getScenarioView(), listRecipes(), listCustomers(), loadCalendar(), loadSupplierTerms(), listPurchaseOrders(), listEquipment(), listPackagingLibrary(), listAllCatalog(), listLoans(), listFixedCostLines(), listLeasehold(), listTimeStudies(), getLedgerKind(), listMenuCycles(), listOrders(), loadProductionRecords(), listSupplierLcaOptions()]);
  const R = resolveScenarioInputs(view.config, library, customers, calendar.closures, supplierTerms, equipment, packaging, catalog, undefined, loans, fixedCostLines, leasehold, timeStudies.studies);
  const closures = calendar.closures;
  const isPlan = kind === 'plan';
  const today = new Date().toISOString().slice(0, 10);
  const pf = Object.fromEntries(R.phaseProfiles.map((p) => [p.phase, p.portionFactor.value])) as Record<number, number>;
  const active = R.recipes.filter((r) => r.status === 'in_service');
  const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  // Plant figures across the active recipes: each on its own batch (Roadmap N9).
  const caps = active.map((r) => deriveCapacity(r, R.capacityInputs));
  const cap = caps[0] ?? deriveCapacity(R.recipes[0], R.capacityInputs);
  const plant = { batchSize: mean(caps.map((c) => c.batchSize)), cyclesPerDay: mean(caps.map((c) => c.cyclesPerDay)), maxPortionsPerDay: mean(caps.map((c) => c.maxPortionsPerDay)) };

  // Today: the next production day from the order book on the selected world.
  const worldOrders = isPlan ? [] : orders;
  const book = orderBook({
    sites: isPlan ? R.demand.sites : resolveCustomerSites(R.customers, {}, { closures }),
    customers: R.customers,
    cycles,
    orders: worldOrders,
    from: today,
    to: isoAddDaysLocal(today, 14),
    channelPriceCents: Object.fromEntries(R.phases.map((p) => [p.phase, Math.round(p.pricePerMeal * 100)])) as Record<number, number>,
    recipeNames: Object.fromEntries(R.recipes.map((r) => [r.code, r.name])),
    closures,
  });
  const holdLife = R.assumptions.inventory.chilledHoldLife.value;
  const openingLots = isPlan
    ? []
    : finishedGoodsOnHand({ batches: production.batches, consumed: deliveredConsumption(orders, production.deliveries, R.recipes, pf), holdLifeDays: holdLife, asOf: today }).lots.filter((l) => l.remaining > 0);
  const day = dashboardToday({ today, book, recipes: R.recipes, capacityInputs: R.capacityInputs, assumptions: R.assumptions, recipeAssumptions: R.recipeAssumptions, portionFactorByChannel: pf, openingLots, closures, channels: R.phases.map((p) => p.phase) });

  // Food: active-recipe averages per portion, and the period's footprint on the selected ledger.
  const foots = active.map((r) => recipeFoodFootprint(r as never));
  const basis = await postSustainabilityBasis(kind, view.config);
  const mix = mixFoodFootprint({ basis, recipes: R.recipes, portionFactorByChannel: pf, selection: R.sustainability.ingredientBasis, options: [...curatedOptions, ...supplierOptions] });
  const foodCo2 = { perPortion: mean(foots.map((f) => f.totalKgCo2ePerPortion)), periodKg: mix.referenceKg, periodLabel: isPlan ? `forecast year from ${basis.from}` : `reporting year ${basis.from.slice(0, 4)}`, unmappedRecipes: mix.recipesWithUnmappedLines.length, activeCount: active.length };
  return { R, pos, cap, plant, day, foodCo2, closures, isPlan, cycles, orders };
}

type Picture = Awaited<ReturnType<typeof loadOperatingPicture>>;

function coverText(day: Picture['day']): string {
  return day.daysOfCover === null ? '—' : day.daysOfCover.toFixed(1);
}

function coldChainCard({ R, cap, day }: Picture): SectionCardProps {
  return {
    section: 'Cold Chain',
    stats: [
      { label: 'CCPs monitored', value: num(ccps.length) },
      { label: 'Chilled hold life', value: `${R.assumptions.inventory.chilledHoldLife.value} days` },
      { label: 'Days of cover', value: coverText(day) },
      { label: 'Chill stage', value: `${cap.chillMinutes} min` },
    ],
    note: `Chill stage ${cap.chillMinutes} min against the Food Code limits of ${cap.cooling.stageOneLimitMin} min (135°F to 70°F) and ${cap.cooling.totalLimitMin} min (135°F to 41°F); ${cap.occupancyMinutes} min cabinet occupancy per batch; CCPs logged per batch.`,
  };
}

function sustainabilityCard({ foodCo2 }: Picture): SectionCardProps {
  return {
    section: 'Sustainability',
    stats: [
      { label: 'Food CO2e / portion, active-recipe average', value: `${foodCo2.perPortion.toFixed(2)} kg` },
      { label: 'Food footprint', value: `${(foodCo2.periodKg / 1000).toFixed(1)} t` },
      { label: 'Recipes with unmapped ingredients', value: `${num(foodCo2.unmappedRecipes)} served` },
      { label: 'Factors on file', value: num(factorRegistry.length) },
    ],
    note: `Scope 3 purchased food on the reference basis (study means), ${foodCo2.periodLabel}, recipe by recipe. An ingredient with no mapping to a study product carries no footprint.`,
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
  // food and labor cost of those meals (`_engine/order-week.ts`).
  const weekTo = isoAddDaysLocal(today, 6);
  const book = orderBook({
    sites: R.demand.sites,
    customers: R.customers,
    cycles,
    orders,
    from: today,
    to: weekTo,
    channelPriceCents: Object.fromEntries(R.phases.map((p) => [p.phase, Math.round(p.pricePerMeal * 100)])) as Record<number, number>,
    recipeNames: Object.fromEntries(R.recipes.map((r) => [r.code, r.name])),
    closures: picture.closures,
  });
  const week = orderWeek({
    book,
    from: today,
    channels: R.phases.map((p) => p.phase),
    recipes: R.recipes,
    cap: R.capacityInputs,
    assumptions: R.assumptions,
    studies: studies.studies,
    portionFactorByChannel: Object.fromEntries(R.phaseProfiles.map((p) => [p.phase, p.portionFactor.value])) as Record<number, number>,
    recipeAssumptions: R.recipeAssumptions,
  });
  const channelName = (c: number) => R.phases.find((p) => p.phase === c)?.market ?? `Channel ${c}`;

  // The top row: averages over every active recipe, each on its own batch and
  // its own labor standard — the seeded estimates until actuals replace them.
  const avg = activeRecipeAverages(R.recipes, R.capacityInputs, R.assumptions, studies.studies, R.recipeAssumptions);
  const basisNote = avg.count === 0
    ? 'No recipe is In Service.'
    : `Averaged over ${num(avg.count)} active recipe${avg.count === 1 ? '' : 's'}, each on its own one-line batch${avg.onEstimate > 0 ? `; ${num(avg.onEstimate)} on an estimated time study` : ''}${avg.withoutStudy > 0 ? `; ${num(avg.withoutStudy)} with no study` : ''}. Seeded estimates stand until actuals replace them.`;

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
  // The clock and hours only. Pay, payroll and benefits are held in CompTable (Roadmap O1).
  const activeStaff = (actuals.staff ?? []).filter((s) => s.status === 'active');
  const clockPunches = actuals.punches ?? [];
  const payPeriodNow = payPeriodFor(new Date().toISOString().slice(0, 10), R.payCalendar);
  const hoursNow = hoursRun(payPeriodNow, activeStaff, clockPunches);
  const onClockNow = activeStaff.filter((s) => clockStateOf(clockPunches.filter((p) => p.staffId === s.id)) !== 'out').length;

  // ── Supply / Distribution ───────────────────────────────────────────────
  const sup = supplierDataset.counts;
  const pipe = pipelineStats(schoolRecords);

  const sections: SectionCardProps[] = [
    {
      section: 'Financials & Accounting',
      stats: [
        { label: `Revenue ${year.label}`, value: money(yis.revenueCents / 100, 0) },
        { label: `Operating income ${year.label}`, value: money(yis.operatingIncomeCents / 100, 0) },
        { label: `Closing cash ${year.label}`, value: money(year.cashFlow.closingCashCents / 100, 0) },
        { label: 'Total capital', value: money(capex.totalCapex, 0) },
      ],
      note: `${selected.kind === 'plan' ? `Plan — ${selected.view.label ?? 'plan defaults'}, as saved` : `Actual — recorded documents${selected.empty ? '; nothing on record yet' : ''}`}, ${year.from} to ${year.to}. Fixed cost per meal ${year.fixedExpense.perMealCents === null ? '—' : money(year.fixedExpense.perMealCents / 100)} over ${num(Math.round(year.mealsDelivered))} meals delivered — a period metric, not in the cost of a meal; by month on Unit Economics.`,
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
      note: 'Purchase orders drawn from portions produced; suppliers from USDA INTEGRITY + TDA Farm Fresh.',
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
      note: `Pay period ${payPeriodNow.start} to ${payPeriodNow.end}. Pay, payroll and benefits are held in CompTable.`,
    },
    {
      section: 'Sales',
      stats: [
        { label: 'School prospects', value: num(pipe.total) },
        { label: 'Signed customers', value: num(pipe.byStatus['Signed - Active'] ?? 0) },
        { label: 'Customers on file', value: num(R.customers.filter((c) => c.status !== 'inactive').length) },
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
        functions={['Production', 'Financials & Accounting', 'Cold Chain', 'Supply Chain', 'Sustainability']}
        howItWorks={DASHBOARD_HOW}
        status="live"
      />

      {/* Headline hero band. On a dark ground the hero is the brightest object
          on the page, not a coloured block — see _components/muse.css. */}
      <div className="muse-hero muse-hero-green">
        <div className="muse-card-title col-span-full! muse-c-accent m-0!">Mean Averages for Active Recipes</div>
        <HeroStat value={<>{money(avg.asPurchasedPerMeal)} <span className="muse-hero-arrow">→</span> {money(avg.costToServePerMeal)}</>} label="Purchased Service Cost" sub="Ingredients at purchase prices → food, labor, packaging, distribution" />
        <HeroStat value={money(avg.foodCostPerMeal)} label="Food cost per meal" sub="Batch cost ÷ portions, with the shrink allowance" />
        <HeroStat value={`${num(avg.batchMinutes / 60, 1)} h`} label="Batch time" sub={`${num(avg.batchMinutes)} clock minutes, receiving to cold hold`} />
        <HeroStat value={num(avg.laborMinutesPerMeal, 2)} label="Labor minutes per meal" sub="Fixed minutes over the batch plus the per-portion minutes" />
        <HeroStat value={money(avg.laborCostPerMeal)} label="Labor cost per meal" sub="At the placeholder loaded rate until CompTable" />
      </div>
      <p className="muse-kpi-sub mt-2">{basisNote}</p>

      {mismatchedBills.length > 0 && (
        <div className="muse-card mt-4">
          <div className="muse-card-title">Alerts — supplier bills flagged</div>
          <ul className="m-0! pl-[1.1rem] grid gap-[0.3rem] muse-fs-sm">
            {mismatchedBills.map((b) => (
              <li key={b.bill.id}>
                Bill {b.bill.billNumber} from {b.bill.supplierName}, dated {b.bill.billDate}: {money(b.amountCents / 100)} billed against {money(b.match.receivedCents / 100)} received; {b.match.issues.length} issue{b.match.issues.length === 1 ? '' : 's'} against its purchase order and receipts. Held from payment until rectified.
              </li>
            ))}
          </ul>
          <Link href="/muse/payables" className="muse-link muse-fs-xs inline-block! mt-[0.6rem]!">Payables</Link>
        </div>
      )}

      <div className="muse-card muse-lift mt-4">
        <div className="muse-card-title">Production — meals on order, {today} to {week.to}</div>
        <div className="muse-scroll-x">
          <table className="muse-table compact">
            <thead>
              <tr>
                <th>Day</th>
                {week.channels.map((c) => <th key={c} className="num">{channelName(c)}</th>)}
                <th className="num">Meals</th>
                <th className="num">Food cost</th>
                <th className="num">Labor cost</th>
              </tr>
            </thead>
            <tbody>
              {week.days.map((d) => (
                <tr key={d.date} className={`${d.meals === 0 ? 'muse-c-faint' : ''}`}>
                  <td className="whitespace-nowrap!">{WEEKDAY_LABELS[d.weekday]} {d.date}</td>
                  {week.channels.map((c) => <td key={c} className="num">{num(d.mealsByChannel[c] ?? 0)}</td>)}
                  <td className="num">{num(d.meals)}</td>
                  <td className="num">{money(d.foodCost, 0)}</td>
                  <td className="num">{money(d.laborCost, 0)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Week</td>
                {week.channels.map((c) => <td key={c} className="num">{num(week.mealsByChannel[c] ?? 0)}</td>)}
                <td className="num">{num(week.meals)}</td>
                <td className="num">{money(week.foodCost, 0)}</td>
                <td className="num">{money(week.laborCost, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muse-fs-xs muse-c-faint mt-[0.9rem]! mr-0! mb-0! ml-0! leading-[1.4]">
          The order book from today: forecast orders from the customer sites with confirmed and delivered rows in their place. Each meal is costed at its recipe&rsquo;s unit food cost on the channel&rsquo;s portion and its recipe&rsquo;s labor standard at the recipe&rsquo;s own one-line batch &mdash; the seeded estimates until observed studies are adopted; labor at the placeholder loaded rate.{week.uncostedMeals > 0 ? ` ${num(week.uncostedMeals)} meals name a recipe not in the library and carry no cost.` : ''} {dayNote(picture.day)}
        </p>
        <div className="flex flex-wrap gap-y-[0.1rem] gap-x-3 mt-[0.8rem]! pt-[0.7rem] border-t border-t-[color:var(--muse-line)]">
          {modulesFor(true).filter((m) => m.section === 'Production').map((m) => (
            <Link key={m.href} href={m.href} className="muse-link muse-fs-xs">{m.label}</Link>
          ))}
        </div>
      </div>

      <SectionGrid sections={sections} isAdmin />
    </>
  );
}

function dayNote(day: Picture['day']): string {
  if (!day.productionDate) return 'No order in the next two weeks on this world.';
  return `Next production day ${day.productionDate}: ${num(day.batches)} batches · ${num(day.portions)} portions${day.shortfall > 0 ? ` · ${num(day.shortfall)} short of cycles` : ''} · ${coverText(day)}-day cover`;
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
  const avgFood = activeRecipeAverages(picture.R.recipes, picture.R.capacityInputs, picture.R.assumptions, [], picture.R.recipeAssumptions);
  const sup = supplierDataset.counts;
  const pipe = pipelineStats(schoolRecords);

  const sections: SectionCardProps[] = [
    {
      section: 'Production',
      stats: [
        { label: 'Food cost / portion, active average', value: money(avgFood.foodCostPerMeal) },
        { label: 'Batch, active average', value: num(plant.batchSize) },
        { label: 'Max portions / day, average', value: num(plant.maxPortionsPerDay) },
        { label: 'Chiller cycles / day', value: num(plant.cyclesPerDay, 1) },
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
      note: 'Purchase orders drawn from portions produced; suppliers from USDA INTEGRITY + TDA Farm Fresh.',
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
        ? `Pay period ${own.period.start} to ${own.period.end}. Your own record; pay is held in CompTable.`
        : 'Your sign-in is not the email of a person on the staff register. Time studies, the two-week staff demand and the Floor are open to everyone; pay and personal details are held in CompTable.',
    },
    {
      section: 'Sales',
      stats: [
        { label: 'School prospects', value: num(pipe.total) },
        { label: 'Signed customers', value: num(pipe.byStatus['Signed - Active'] ?? 0) },
        { label: 'In talks', value: num(pipe.byStatus['In Talks'] ?? 0) },
        { label: 'Customers on file', value: num(picture.R.customers.filter((c) => c.status !== 'inactive').length) },
      ],
      note: `Pipeline: ${num(pipe.byStatus['Negotiating'] ?? 0)} negotiating · ${num(pipe.byStatus['Lead'] ?? 0)} leads`,
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        purpose={DASHBOARD_PURPOSE}
        functions={['Production', 'Cold Chain', 'Supply Chain', 'Sustainability', 'People']}
        howItWorks={DASHBOARD_HOW}
        status="live"
      />

      <div className="muse-hero">
        <HeroStat value={num(plant.batchSize)} label="Batch — active-recipe average" sub={`One cabinet's load each; ${num(cap.cyclesPerDay)} cycles a day on one cabinet`} />
        <HeroStat value={num(day.batches)} label={day.productionDate ? `Batches ${day.productionDate === new Date().toISOString().slice(0, 10) ? 'today' : `on ${day.productionDate}`}` : 'Batches — next production day'} sub={day.productionDate ? `${num(day.portions)} portions${picture.isPlan ? ', the open forecast' : ', the orders on file'}` : 'No order in the next two weeks'} />
        <HeroStat value={coverText(day)} label="Days of cover" sub={`Finished stock over a delivery day's orders; ${picture.R.assumptions.inventory.chilledHoldLife.value}-day hold life`} />
        <HeroStat value={money(avgFood.foodCostPerMeal)} label="Food cost / portion" sub="Active-recipe average, at standard" />
      </div>

      <SectionGrid sections={sections} isAdmin={false} />
    </>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** The title stacked over the value, the title in copper (Robert, 2026-09-15). */
function HeroStat({ value, label, sub }: { value: React.ReactNode; label: string; sub?: string }) {
  return (
    <div>
      <div className="muse-hero-label muse-c-accent mt-0! mb-2!">{label}</div>
      <div className="muse-hero-value">{value}</div>
      {sub && <div className="muse-hero-sub">{sub}</div>}
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
    <div className="grid gap-4 mt-4 muse-autofit-21">
      {sections.map((s) => (
        <SectionCard key={s.section} {...s} isAdmin={isAdmin} />
      ))}
    </div>
  );
}

function SectionCard({ section, stats, note, isAdmin }: SectionCardProps & { isAdmin: boolean }) {
  const links = modulesFor(isAdmin).filter((m) => m.section === section);
  return (
    <div className="muse-card muse-lift">
      <div className="muse-card-title">{section}</div>
      {stats.length > 0 && (
        <div className="grid grid-cols-[repeat(2,1fr)]! gap-y-[0.9rem]! gap-x-4! mt-[0.3rem]!">
          {stats.map((st) => (
            <div key={st.label}>
              <div className="muse-mono muse-fs-lg font-semibold leading-[1.1] tracking-[-0.015em] muse-c-ink [font-variant-numeric:lining-nums_tabular-nums]">{st.value}</div>
              <div className="muse-fs-xs muse-c-soft mt-[0.2rem]!">{st.label}</div>
            </div>
          ))}
        </div>
      )}
      {note && (
        <p className={`muse-fs-xs muse-c-faint leading-[1.4] ${(stats.length > 0 ? 'mt-[0.9rem]! mr-0! mb-0! ml-0!' : 'mt-[0.3rem]! mr-0! mb-0! ml-0!')}`}>{note}</p>
      )}
      <div className="flex flex-wrap gap-y-[0.1rem] gap-x-3 mt-[0.8rem]! pt-[0.7rem] border-t border-t-[color:var(--muse-line)]">
        {links.map((m) => (
          <Link key={m.href} href={m.href} className="muse-link muse-fs-xs">{m.label}</Link>
        ))}
      </div>
    </div>
  );
}
