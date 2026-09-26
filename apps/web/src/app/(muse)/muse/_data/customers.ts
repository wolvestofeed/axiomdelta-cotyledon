/**
 * Impact OS — customers and sites: the document shapes, and the seed.
 *
 * Demand is the sum over every site's services of meals per service (the dated
 * pick in force) on each date the service runs: its weekdays, inside the site's
 * calendar, the kitchen open (Roadmap N4a).
 *
 * There are two seeds, and they answer different questions:
 *
 *   `seedCustomers()`     — the ENGINE default when no customer library is
 *                           loaded: three test customers reproducing the
 *                           operating model's channel constants (1,000 / 0 / 0
 *                           meals a day on 180 / 250 / 333 days).
 *   `planSeedCustomers()` — the PLAN seed the database starts from (Roadmap
 *                           N1): the one contracted customer at its stated 125
 *                           meals a day, and a prospect per channel carrying no
 *                           volume until a forecast is entered on its sites.
 *
 * Every seeded row is `source: 'seed'` and its note says what it is. Nothing
 * here is sized to the chiller: what the plant could make is a capacity figure,
 * not demand (Robert, 2026-09-15).
 */

import { phases } from './plan-data';
import { FORECAST_FISCAL_YEAR } from './working-capital';
import { sites as seedSites } from './seed-invented';

export type CustomerKind = 'district' | 'company' | 'marketplace' | 'other';
/** 'forecast' is a Forecast Customer: on the master list with manual mock figures, used in forecasts, never on Actual (Roadmap N4a). */
export type CustomerStatus = 'prospect' | 'contracted' | 'forecast' | 'inactive';
export type CustomerSiteStatus = 'active' | 'planned' | 'inactive';
export type CustomerServiceStatus = 'active' | 'inactive';
export type SiteCalendarKind = 'term' | 'break';

export const CUSTOMER_KIND_LABELS: Record<CustomerKind, string> = {
  district: 'School district / school',
  company: 'Company',
  marketplace: 'Marketplace',
  other: 'Other',
};
export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  prospect: 'Prospect',
  contracted: 'Contracted',
  forecast: 'Forecast customer',
  inactive: 'Inactive',
};

/** A customer whose orders may be recorded on Actual: a Forecast Customer never is. */
export const recordsActuals = (status: CustomerStatus): boolean => status !== 'forecast';

/** Meals per service from a date, carrying forward until the next pick (Roadmap N4a, decision 18). */
export interface VolumePickDef {
  id: string;
  effectiveDate: string;
  meals: number;
  notes: string | null;
}

/** One service: one loading and dispatch/delivery of an order (decision 17). */
export interface CustomerServiceDef {
  id: string;
  name: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  status: CustomerServiceStatus;
  notes: string | null;
  /** Oldest first. */
  picks: VolumePickDef[];
}

/** A term the site takes meals in, or a break inside one (decision 20). */
export interface SiteCalendarRangeDef {
  id: string;
  kind: SiteCalendarKind;
  label: string | null;
  startDate: string;
  endDate: string;
}

export interface CustomerSiteDef {
  id: string;
  /** Delivery site id (Sites & Delivery) when linked. */
  siteId: string | null;
  name: string;
  gradeGroups: string[];
  /** @deprecated Roadmap N4a: service dates come from the site calendar. Read by nothing; dropped in N9. */
  serviceDaysPerYear: number;
  /** Entered when a school account is set up (Robert, 2026-09-16). A sales figure: feeds no calculation but participation. */
  enrollment: number | null;
  /** Not written: participation is calculated from confirmed and delivered orders (`_engine/participation.ts`). Kept, not dropped. */
  participationRate: number | null;
  /** @deprecated Roadmap N4a. */
  expectedMealsPerDay: number | null;
  status: CustomerSiteStatus;
  notes: string | null;
  /** The site's services (Roadmap N4a). */
  services: CustomerServiceDef[];
  /** The site's service calendar; no term = every open service weekday, calendar not on file. */
  calendar: SiteCalendarRangeDef[];
}

export interface CustomerDef {
  id: string;
  name: string;
  kind: CustomerKind;
  channel: number;
  status: CustomerStatus;
  /** Null = the channel's default price. */
  pricePerMealCents: number | null;
  /** Null = not set; there is no default (Roadmap K3). An invoice is not issued without terms. */
  paymentTerms: import('./working-capital').CustomerPaymentTerms | null;
  contractStart: string | null;
  contractEnd: string | null;
  schoolId: string | null;
  notes: string | null;
  source: 'seed' | 'user_built';
  sites: CustomerSiteDef[];
  /** The ERRA rating Muse Kitchen assigns (Roadmap N7, 0073). Absent = not rated. */
  erra?: import('./mark').MarkRating;
}

/** The current school customer: 125 meals a day, five days a week (Robert, 2026-09-15). STATED. */
export const CURRENT_SCHOOL_MEALS_PER_DAY = 125;

/** The date the seeded volume picks take effect: the day the current customer's volume was stated. */
export const SEED_PICK_DATE = '2026-09-15';

/**
 * A test term: `serviceDays` Monday-to-Friday dates from the first Monday of
 * `year`, so the engine default's school sites keep the operating model's
 * channel day count. Test data, labelled so; a real site's calendar is entered.
 */
export function testTerm(siteId: string, year: number, serviceDays: number): SiteCalendarRangeDef[] {
  if (serviceDays <= 0) return [];
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  const start = d.toISOString().slice(0, 10);
  let count = 0;
  let end = start;
  for (;;) {
    const w = d.getUTCDay();
    if (w >= 1 && w <= 5) {
      count++;
      end = d.toISOString().slice(0, 10);
      if (count === serviceDays) break;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return [{ id: `${siteId}-TERM`, kind: 'term', label: `Test term: ${serviceDays} service weekdays`, startDate: start, endDate: end }];
}

/** Test customers' picks take effect from here, so test data carries volume on any date a test reads. */
export const TEST_PICK_DATE = '2026-01-01';

/** One Monday-to-Friday service carrying `meals` per service from `from`. */
export function seedService(siteId: string, channel: number, meals: number, note: string, from: string = SEED_PICK_DATE): CustomerServiceDef {
  return {
    id: `${siteId}-SV1`,
    name: channel === 1 ? 'Lunch' : 'Service 1',
    weekdays: [1, 2, 3, 4, 5],
    status: 'active',
    notes: note,
    picks: [{ id: `${siteId}-SV1-P1`, effectiveDate: from, meals, notes: note }],
  };
}

/** Split `total` into whole numbers pro rata to `weights` (largest remainder). */
export function apportion(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || weights.length === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map((x) => Math.floor(x));
  let remainder = Math.round(total - floors.reduce((a, b) => a + b, 0));
  const order = raw.map((x, i) => ({ i, frac: x - floors[i] })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors;
}

/**
 * The one contracted customer (operating-model-roadmap §3.9): a private school
 * on School lunches, 125 meals a day, five days a week. Its name is not on
 * file, so the row says so rather than carrying one that was never given.
 * Contracted price, contract dates and payment terms are not on file either.
 */
export function currentCustomer(): CustomerDef {
  const p1 = phases[0];
  return {
    id: 'CUST-CURRENT',
    name: 'Private school (name not on file)',
    kind: 'district',
    channel: 1,
    status: 'contracted',
    pricePerMealCents: null,
    paymentTerms: null,
    contractStart: null,
    contractEnd: null,
    schoolId: null,
    notes: `The customer the kitchen serves today (Robert, 2026-09-15): a private school on ${p1.market}, ${CURRENT_SCHOOL_MEALS_PER_DAY} meals a day, five days a week. STATED. Name, contracted price, contract dates and payment terms are not on file. Every other customer in the account is a prospect in the Plan.`,
    source: 'seed',
    sites: [
      {
        id: 'CS-CURRENT-1',
        siteId: null,
        name: 'Private school site (name not on file)',
        gradeGroups: [],
        serviceDaysPerYear: p1.operatingDays,
        enrollment: null,
        participationRate: null,
        expectedMealsPerDay: CURRENT_SCHOOL_MEALS_PER_DAY,
        status: 'active',
        notes: `STATED: ${CURRENT_SCHOOL_MEALS_PER_DAY} meals a day, five days a week. The school's term dates are not on file.`,
        services: [seedService('CS-CURRENT-1', 1, CURRENT_SCHOOL_MEALS_PER_DAY, `STATED (Robert, 2026-09-15): ${CURRENT_SCHOOL_MEALS_PER_DAY} meals a service, five days a week.`)],
        calendar: [],
      },
    ],
  };
}

const TEST_NOTE = (phase: number, meals: number) =>
  meals > 0
    ? `Test customer. ${phases[phase - 1].market} at ${meals.toLocaleString()} meals a day × ${phases[phase - 1].operatingDays} service days — the operating model's channel constant, carried while no customer library is loaded. Replace with the contract and the site's own participation forecast.`
    : `Test customer. A prospect in the Plan: ${phases[phase - 1].market} carries no volume until a forecast is entered on its sites. Replace with the contract and the site's own participation forecast.`;

/**
 * Three test customers, one per channel, carrying `mealsPerChannel` meals a
 * day. A channel's figure is spread over its sites pro rata, whole meals by
 * largest remainder, so the sites sum to the channel figure exactly. Names are
 * "Test Customer #n" — no name that could be read as a sales lead.
 */
function testCustomers(mealsPerChannel: readonly number[]): CustomerDef[] {
  const [p1, p2, p3] = [phases[0], phases[1], phases[2]];
  const [m1, m2, m3] = [mealsPerChannel[0] ?? 0, mealsPerChannel[1] ?? 0, mealsPerChannel[2] ?? 0];
  const schoolSites = seedSites.filter((s) => s.type === 'Private school');
  const corporate = seedSites.find((s) => s.type === 'Corporate catering');
  const schoolShares = apportion(m1, schoolSites.map((s) => s.dailyForecastPortions));

  return [
    {
      id: 'CUST-SEED-1',
      name: 'Test Customer #1',
      kind: 'district',
      channel: 1,
      status: 'prospect',
      pricePerMealCents: null,
      paymentTerms: null,
      contractStart: null,
      contractEnd: null,
      schoolId: null,
      notes: TEST_NOTE(1, m1),
      source: 'seed',
      sites: schoolSites.map((s, i) => ({
        id: `CS-SEED-${s.id}`,
        siteId: s.id,
        name: s.name,
        gradeGroups: [],
        serviceDaysPerYear: p1.operatingDays,
        enrollment: null,
        participationRate: null,
        expectedMealsPerDay: schoolShares[i] ?? 0,
        status: 'active',
        notes: 'Test data: a pro-rata share of the channel figure, not a participation forecast.',
        services: [seedService(`CS-SEED-${s.id}`, 1, schoolShares[i] ?? 0, 'Test data.', TEST_PICK_DATE)],
        calendar: m1 > 0 ? testTerm(`CS-SEED-${s.id}`, FORECAST_FISCAL_YEAR, p1.operatingDays) : [],
      })),
    },
    {
      id: 'CUST-SEED-2',
      name: 'Test Customer #2',
      kind: 'company',
      channel: 2,
      status: 'prospect',
      pricePerMealCents: null,
      paymentTerms: null,
      contractStart: null,
      contractEnd: null,
      schoolId: null,
      notes: TEST_NOTE(2, m2),
      source: 'seed',
      sites: [
        {
          id: 'CS-SEED-SITE-04',
          siteId: corporate?.id ?? null,
          name: corporate?.name ?? 'Test Site 4',
          gradeGroups: [],
          serviceDaysPerYear: p2.operatingDays,
          enrollment: null,
          participationRate: null,
          expectedMealsPerDay: m2,
          status: 'active',
          notes: 'Test data: the corporate channel figure on one site; split across real accounts as they are contracted.',
          services: [seedService('CS-SEED-SITE-04', 2, m2, 'Test data.', TEST_PICK_DATE)],
          calendar: [],
        },
      ],
    },
    {
      id: 'CUST-SEED-3',
      name: 'Test Customer #3',
      kind: 'marketplace',
      channel: 3,
      status: 'prospect',
      pricePerMealCents: null,
      paymentTerms: null,
      contractStart: null,
      contractEnd: null,
      schoolId: null,
      notes: TEST_NOTE(3, m3),
      source: 'seed',
      sites: [
        {
          id: 'CS-SEED-RETAIL',
          siteId: null,
          name: 'Test Site 5',
          gradeGroups: [],
          serviceDaysPerYear: p3.operatingDays,
          enrollment: null,
          participationRate: null,
          expectedMealsPerDay: m3,
          status: 'active',
          notes: 'Test data: the retail channel figure on one site; forecast orders replace it.',
          services: [seedService('CS-SEED-RETAIL', 3, m3, 'Test data.', TEST_PICK_DATE)],
          calendar: [],
        },
      ],
    },
  ];
}

/**
 * The engine default when no customer library is loaded: the operating model's
 * channel constants, carried by three prospect test customers.
 */
export function seedCustomers(): CustomerDef[] {
  return testCustomers(phases.map((p) => p.mealsPerDay));
}

/**
 * The Plan seed the database starts from (Roadmap N1, operating-model-roadmap
 * §3.9): the one contracted customer at its stated 125 meals a day, and a
 * prospect per channel carrying no volume. Plan volume is what is contracted
 * until a forecast is entered against a prospect.
 */
export function planSeedCustomers(): CustomerDef[] {
  return [currentCustomer(), ...testCustomers(phases.map(() => 0))];
}
