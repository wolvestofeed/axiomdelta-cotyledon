/**
 * MicroFarm — subscribers and pickup points: the document shapes, and the seed.
 *
 * Demand is what each pickup point's subscriptions carry on their distribution dates, with any
 * service still on the record's units per service on its weekdays (Roadmap N4a), inside the
 * pickup point's calendar and the farm open.
 *
 * The seed is the Plan's (`planSeedSubscribers`, also the engine default when no subscriber
 * library is loaded): nineteen Forecast Subscribers taking one 1020 flat weekly at a Saturday
 * pickup, invented test data toward 20 trays a week with Rob's own. The farm has no customer on
 * record, so Actual starts empty. Every seeded row is `source: 'seed'` and its note says what it
 * is. Nothing here is sized to the grow units: what the racks could make is a capacity figure,
 * not demand.
 */


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

/**
 * The Saturday the Plan's subscribers first pick up. Invented test data: the Plan runs toward Rob's
 * first objective, 20 trays a week at one Saturday pickup at the house.
 */
export const PLAN_FIRST_PICKUP = '2026-10-17';

/** The Plan's test subscribers: with Rob's own tray, 20 trays a week. */
export const PLAN_SUBSCRIBERS = 19;

/** The in-service tray plans, taken in turn across the Plan's subscribers; the sprouts grow in jars. */
export const PLAN_ROTATION: readonly string[] = ['BROC-01', 'RAD-01', 'SUN-01', 'PEA-01', 'FEN-01', 'BOR-01', 'AMA-01', 'CAB-01', 'CHIA-01'];

/**
 * The Plan's subscribers: nineteen Forecast Subscribers, in the Plan only and never on Actual, each
 * taking one 1020 flat weekly at the Saturday pickup at the house, the plans taken in turn. Invented
 * test data, labelled so. The farm has no customer and no revenue on record; Actual starts empty.
 */
export function planSeedSubscribers(): SubscriberDef[] {
  return Array.from({ length: PLAN_SUBSCRIBERS }, (_, i): SubscriberDef => {
    const n = String(i + 1).padStart(2, '0');
    const id = `CUST-PLAN-${n}`;
    const pickupPoint = `CS-PLAN-${n}`;
    return {
      id,
      name: `Plan subscriber ${n}`,
      kind: 'other',
      channel: 1,
      status: 'forecast',
      pricePerUnitCents: null,
      paymentTerms: null,
      contractStart: null,
      contractEnd: null,
      prospectId: null,
      notes: `Invented test data: one of ${PLAN_SUBSCRIBERS} Plan subscribers toward 20 trays a week, one 1020 flat weekly at the Saturday pickup. A Forecast Subscriber: in the Plan only, never on Actual.`,
      source: 'seed',
      pickupPoints: [
        {
          id: pickupPoint,
          pickupPointId: null,
          name: 'Saturday pickup at the house',
          trayFormats: [],
          serviceDaysPerYear: 0,
          enrollment: null,
          participationRate: null,
          expectedUnitsPerDay: null,
          status: 'active',
          notes: 'Invented test data.',
          services: [],
          calendar: [],
        },
      ],
      subscriptions: [
        {
          id: `SUB-PLAN-${n}`,
          subscriberId: id,
          subscriberPickupPointId: pickupPoint,
          cadence: 'weekly',
          startDate: PLAN_FIRST_PICKUP,
          endDate: null,
          flatPlan: [{ from: PLAN_FIRST_PICKUP, lines: [{ growPlanCode: PLAN_ROTATION[i % PLAN_ROTATION.length]!, units: 1 }] }],
          skips: [],
          pausedFrom: null,
          notes: 'Invented test data.',
        },
      ],
    };
  });
}

/** The engine default when no subscriber library is loaded: the Plan's subscribers. */
export function seedSubscribers(): SubscriberDef[] {
  return planSeedSubscribers();
}
