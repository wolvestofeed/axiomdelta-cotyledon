/**
 * MicroFarm — subscribers and pickup points: the document shapes, and the seed.
 *
 * Demand is the sum over every pickup point's services of units per service (the dated
 * pick in force) on each date the service runs: its weekdays, inside the pickup point's
 * calendar, the farm open (Roadmap N4a).
 *
 * There are two seeds, and they answer different questions:
 *
 *   `seedSubscribers()`     — the ENGINE default when no subscriber library is
 *                           loaded: three test subscribers reproducing the
 *                           operating model's channel constants (1,000 / 0 / 0
 *                           units a day on 180 / 250 / 333 days).
 *   `planSeedSubscribers()` — the PLAN seed the database starts from (Roadmap
 *                           N1): the one contracted subscriber at its stated 125
 *                           units a day, and a prospect per channel carrying no
 *                           volume until a forecast is entered on its pickup points.
 *
 * Every seeded row is `source: 'seed'` and its note says what it is. Nothing
 * here is sized to the grow units: what the facility could make is a capacity figure,
 * not demand.
 */

import { phases } from '@/data/plan-data';
import { FORECAST_FISCAL_YEAR } from '@/data/working-capital';
import { pickupPoints as seedPickupPoints } from '@/data/seed-invented';

export type SubscriberKind = 'district' | 'company' | 'marketplace' | 'other';
/** 'forecast' is a Forecast Subscriber: on the master list with manual mock figures, used in forecasts, never on Actual (Roadmap N4a). */
export type SubscriberStatus = 'prospect' | 'contracted' | 'forecast' | 'inactive';
export type SubscriberPickupPointStatus = 'active' | 'planned' | 'inactive';
export type SubscriberServiceStatus = 'active' | 'inactive';
export type PickupPointCalendarKind = 'term' | 'break';

export const SUBSCRIBER_KIND_LABELS: Record<SubscriberKind, string> = {
  district: 'Prospect district / prospect',
  company: 'Company',
  marketplace: 'Marketplace',
  other: 'Other',
};
export const SUBSCRIBER_STATUS_LABELS: Record<SubscriberStatus, string> = {
  prospect: 'Prospect',
  contracted: 'Contracted',
  forecast: 'Forecast subscriber',
  inactive: 'Inactive',
};

/** A subscriber whose orders may be recorded on Actual: a Forecast Subscriber never is. */
export const recordsActuals = (status: SubscriberStatus): boolean => status !== 'forecast';

/** Units per service from a date, carrying forward until the next pick (Roadmap N4a, decision 18). */
export interface VolumePickDef {
  id: string;
  effectiveDate: string;
  units: number;
  notes: string | null;
}

/** One service: one loading and harvest/distribution of an order (decision 17). */
export interface SubscriberServiceDef {
  id: string;
  name: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  status: SubscriberServiceStatus;
  notes: string | null;
  /** Oldest first. */
  picks: VolumePickDef[];
}

/** A term the pickup point takes units in, or a break inside one (decision 20). */
export interface PickupPointCalendarRangeDef {
  id: string;
  kind: PickupPointCalendarKind;
  label: string | null;
  startDate: string;
  endDate: string;
}

export interface SubscriberPickupPointDef {
  id: string;
  /** Distribution pickup point id (Pickup Points & Routes) when linked. */
  pickupPointId: string | null;
  name: string;
  trayFormats: string[];
  /** @deprecated Roadmap N4a: service dates come from the pickup point calendar. Read by nothing; dropped in N9. */
  serviceDaysPerYear: number;
  /** Entered when a prospect account is set up. A sales figure: feeds no calculation but participation. */
  enrollment: number | null;
  /** Not written: participation is calculated from confirmed and distributed orders (`_engine/participation.ts`). Kept, not dropped. */
  participationRate: number | null;
  /** @deprecated Roadmap N4a. */
  expectedUnitsPerDay: number | null;
  status: SubscriberPickupPointStatus;
  notes: string | null;
  /** The pickup point's services (Roadmap N4a). */
  services: SubscriberServiceDef[];
  /** The pickup point's service calendar; no term = every open service weekday, calendar not on file. */
  calendar: PickupPointCalendarRangeDef[];
}

export interface SubscriberDef {
  id: string;
  name: string;
  kind: SubscriberKind;
  channel: number;
  status: SubscriberStatus;
  /** Null = the channel's default price. */
  pricePerUnitCents: number | null;
  /** Null = not set; there is no default (Roadmap K3). An invoice is not issued without terms. */
  paymentTerms: import('@/data/working-capital').SubscriberPaymentTerms | null;
  contractStart: string | null;
  contractEnd: string | null;
  prospectId: string | null;
  notes: string | null;
  source: 'seed' | 'user_built';
  /** Named nutrition targets (outline §4): keys from `nutrition-targets.ts`. Absent = none named. */
  nutritionTargets?: string[];
  /** The subscriber's subscriptions (0019): standing orders on a cadence at their pickup points. */
  subscriptions?: import('@/data/subscriptions').SubscriptionDef[];
  pickupPoints: SubscriberPickupPointDef[];
}

/** The current prospect subscriber: 125 units a day, five days a week. STATED. */
export const CURRENT_PROSPECT_UNITS_PER_DAY = 125;

/** The date the seeded volume picks take effect: the day the current subscriber's volume was stated. */
export const SEED_PICK_DATE = '2026-09-15';

/**
 * A test term: `serviceDays` Monday-to-Friday dates from the first Monday of
 * `year`, so the engine default's prospect pickup points keep the operating model's
 * channel day count. Test data, labelled so; a real pickup point's calendar is entered.
 */
export function testTerm(pickupPointId: string, year: number, serviceDays: number): PickupPointCalendarRangeDef[] {
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
  return [{ id: `${pickupPointId}-TERM`, kind: 'term', label: `Test term: ${serviceDays} service weekdays`, startDate: start, endDate: end }];
}

/** Test subscribers' picks take effect from here, so test data carries volume on any date a test reads. */
export const TEST_PICK_DATE = '2026-01-01';

/** One Monday-to-Friday service carrying `units` per service from `from`. */
export function seedService(pickupPointId: string, channel: number, units: number, note: string, from: string = SEED_PICK_DATE): SubscriberServiceDef {
  return {
    id: `${pickupPointId}-SV1`,
    name: channel === 1 ? 'Unit' : 'Service 1',
    weekdays: [1, 2, 3, 4, 5],
    status: 'active',
    notes: note,
    picks: [{ id: `${pickupPointId}-SV1-P1`, effectiveDate: from, units, notes: note }],
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
 * The one contracted subscriber (operating-model-roadmap §3.9): a private prospect
 * on Subscriptions, 125 units a day, five days a week. Its name is not on
 * file, so the row says so rather than carrying one that was never given.
 * Contracted price, contract dates and payment terms are not on file either.
 */
export function currentSubscriber(): SubscriberDef {
  const p1 = phases[0];
  return {
    id: 'CUST-CURRENT',
    name: 'Private prospect (name not on file)',
    kind: 'district',
    channel: 1,
    status: 'contracted',
    pricePerUnitCents: null,
    paymentTerms: null,
    contractStart: null,
    contractEnd: null,
    prospectId: null,
    notes: `The subscriber the farm serves today: a private prospect on ${p1.market}, ${CURRENT_PROSPECT_UNITS_PER_DAY} units a day, five days a week. STATED. Name, contracted price, contract dates and payment terms are not on file. Every other subscriber in the account is a prospect in the Plan.`,
    source: 'seed',
    pickupPoints: [
      {
        id: 'CS-CURRENT-1',
        pickupPointId: null,
        name: 'Private prospect pickup point (name not on file)',
        trayFormats: [],
        serviceDaysPerYear: p1.operatingDays,
        enrollment: null,
        participationRate: null,
        expectedUnitsPerDay: CURRENT_PROSPECT_UNITS_PER_DAY,
        status: 'active',
        notes: `STATED: ${CURRENT_PROSPECT_UNITS_PER_DAY} units a day, five days a week. The prospect's term dates are not on file.`,
        services: [seedService('CS-CURRENT-1', 1, CURRENT_PROSPECT_UNITS_PER_DAY, `STATED: ${CURRENT_PROSPECT_UNITS_PER_DAY} units a service, five days a week.`)],
        calendar: [],
      },
    ],
  };
}

const TEST_NOTE = (phase: number, units: number) =>
  units > 0
    ? `Test subscriber. ${phases[phase - 1].market} at ${units.toLocaleString()} units a day × ${phases[phase - 1].operatingDays} service days — the operating model's channel constant, carried while no subscriber library is loaded. Replace with the contract and the pickup point's own participation forecast.`
    : `Test subscriber. A prospect in the Plan: ${phases[phase - 1].market} carries no volume until a forecast is entered on its pickup points. Replace with the contract and the pickup point's own participation forecast.`;

/**
 * Three test subscribers, one per channel, carrying `unitsPerChannel` units a
 * day. A channel's figure is spread over its pickup points pro rata, whole units by
 * largest remainder, so the pickup points sum to the channel figure exactly. Names are
 * "Test Subscriber #n" — no name that could be read as a sales lead.
 */
function testSubscribers(unitsPerChannel: readonly number[]): SubscriberDef[] {
  const [p1, p2, p3] = [phases[0], phases[1], phases[2]];
  const [m1, m2, m3] = [unitsPerChannel[0] ?? 0, unitsPerChannel[1] ?? 0, unitsPerChannel[2] ?? 0];
  const prospectPickupPoints = seedPickupPoints.filter((s) => s.type === 'Private prospect');
  const corporate = seedPickupPoints.find((s) => s.type === 'Restaurants');
  const prospectShares = apportion(m1, prospectPickupPoints.map((s) => s.dailyForecastUnits));

  return [
    {
      id: 'CUST-SEED-1',
      name: 'Test Subscriber #1',
      kind: 'district',
      channel: 1,
      status: 'prospect',
      pricePerUnitCents: null,
      paymentTerms: null,
      contractStart: null,
      contractEnd: null,
      prospectId: null,
      notes: TEST_NOTE(1, m1),
      source: 'seed',
      pickupPoints: prospectPickupPoints.map((s, i) => ({
        id: `CS-SEED-${s.id}`,
        pickupPointId: s.id,
        name: s.name,
        trayFormats: [],
        serviceDaysPerYear: p1.operatingDays,
        enrollment: null,
        participationRate: null,
        expectedUnitsPerDay: prospectShares[i] ?? 0,
        status: 'active',
        notes: 'Test data: a pro-rata share of the channel figure, not a participation forecast.',
        services: [seedService(`CS-SEED-${s.id}`, 1, prospectShares[i] ?? 0, 'Test data.', TEST_PICK_DATE)],
        calendar: m1 > 0 ? testTerm(`CS-SEED-${s.id}`, FORECAST_FISCAL_YEAR, p1.operatingDays) : [],
      })),
    },
    {
      id: 'CUST-SEED-2',
      name: 'Test Subscriber #2',
      kind: 'company',
      channel: 2,
      status: 'prospect',
      pricePerUnitCents: null,
      paymentTerms: null,
      contractStart: null,
      contractEnd: null,
      prospectId: null,
      notes: TEST_NOTE(2, m2),
      source: 'seed',
      pickupPoints: [
        {
          id: 'CS-SEED-pickup-point-04',
          pickupPointId: corporate?.id ?? null,
          name: corporate?.name ?? 'Test Pickup point 4',
          trayFormats: [],
          serviceDaysPerYear: p2.operatingDays,
          enrollment: null,
          participationRate: null,
          expectedUnitsPerDay: m2,
          status: 'active',
          notes: 'Test data: the corporate channel figure on one pickup point; split across real accounts as they are contracted.',
          services: [seedService('CS-SEED-pickup-point-04', 2, m2, 'Test data.', TEST_PICK_DATE)],
          calendar: [],
        },
      ],
    },
    {
      id: 'CUST-SEED-3',
      name: 'Test Subscriber #3',
      kind: 'marketplace',
      channel: 3,
      status: 'prospect',
      pricePerUnitCents: null,
      paymentTerms: null,
      contractStart: null,
      contractEnd: null,
      prospectId: null,
      notes: TEST_NOTE(3, m3),
      source: 'seed',
      pickupPoints: [
        {
          id: 'CS-SEED-RETAIL',
          pickupPointId: null,
          name: 'Test Pickup point 5',
          trayFormats: [],
          serviceDaysPerYear: p3.operatingDays,
          enrollment: null,
          participationRate: null,
          expectedUnitsPerDay: m3,
          status: 'active',
          notes: 'Test data: the retail channel figure on one pickup point; forecast orders replace it.',
          services: [seedService('CS-SEED-RETAIL', 3, m3, 'Test data.', TEST_PICK_DATE)],
          calendar: [],
        },
      ],
    },
  ];
}

/**
 * The engine default when no subscriber library is loaded: the operating model's
 * channel constants, carried by three prospect test subscribers.
 */
export function seedSubscribers(): SubscriberDef[] {
  return testSubscribers(phases.map((p) => p.unitsPerDay));
}

/**
 * The Plan seed the database starts from (Roadmap N1, operating-model-roadmap
 * §3.9): the one contracted subscriber at its stated 125 units a day, and a
 * prospect per channel carrying no volume. Plan volume is what is contracted
 * until a forecast is entered against a prospect.
 */
export function planSeedSubscribers(): SubscriberDef[] {
  return [currentSubscriber(), ...testSubscribers(phases.map(() => 0))];
}
