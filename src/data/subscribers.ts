/**
 * Cotyledon — subscribers and pickup points: the document shapes, and the seed.
 *
 * Demand is what each pickup point's subscriptions carry on their distribution dates, the farm
 * open. The seed is the Plan's (`planSeedSubscribers`, also the engine default when no subscriber
 * library is loaded): nineteen Forecast Subscribers taking one 1020 flat weekly at a Saturday
 * pickup, invented test data toward 20 trays a week with Rob's own. On Actual only Rob's own tray is
 * ordered. Every seeded row is `source: 'seed'` and its note says what it is. Nothing here is sized
 * to the grow units: what the racks could make is a capacity figure, not demand.
 */

/** 'forecast' is a Forecast Subscriber: on the master list for planning, used in forecasts, never on Actual. */
export type SubscriberStatus = 'prospect' | 'contracted' | 'forecast' | 'inactive';
export type SubscriberPickupPointStatus = 'active' | 'planned' | 'inactive';

export const SUBSCRIBER_STATUS_LABELS: Record<SubscriberStatus, string> = {
  prospect: 'Prospect',
  contracted: 'Contracted',
  forecast: 'Forecast subscriber',
  inactive: 'Inactive',
};

/** A subscriber whose orders may be recorded on Actual: a Forecast Subscriber never is. */
export const recordsActuals = (status: SubscriberStatus): boolean => status !== 'forecast';

export interface SubscriberPickupPointDef {
  id: string;
  /** Distribution pickup point id (Pickup Points & Routes) when linked. */
  pickupPointId: string | null;
  name: string;
  status: SubscriberPickupPointStatus;
  notes: string | null;
}

export interface SubscriberDef {
  id: string;
  name: string;
  channel: number;
  status: SubscriberStatus;
  /** Null = the channel's default price. */
  pricePerUnitCents: number | null;
  /** Null = not set; there is no default. An invoice is not issued without terms. */
  paymentTerms: import('@/data/working-capital').SubscriberPaymentTerms | null;
  contractStart: string | null;
  contractEnd: string | null;
  prospectId: string | null;
  notes: string | null;
  source: 'seed' | 'user_built';
  /** Named nutrition targets (outline §4): keys from `nutrition-targets.ts`. Absent = none named. */
  nutritionTargets?: string[];
  /**
   * Own use: the owner taking trays for his own consumption. Its orders flow through production
   * like any other; a distribution to it leaves finished goods at cost to Owner Draws, with no
   * revenue, no receivable and no invoice. Absent = false.
   */
  ownUse?: boolean;
  /** The subscriber's subscriptions: standing orders on a cadence at their pickup points. */
  subscriptions?: import('@/data/subscriptions').SubscriptionDef[];
  pickupPoints: SubscriberPickupPointDef[];
}

/**
 * The Saturday the Plan's subscribers first pick up. Invented test data: the Plan runs toward Rob's
 * first objective, 20 trays a week at one Saturday pickup at the house.
 */
export const PLAN_FIRST_PICKUP = '2026-10-17';

/** The Plan's test subscribers; with Rob's own tray, 20 trays a week. */
export const PLAN_SUBSCRIBERS = 19;

/** The in-service tray plans, taken in turn across the Plan's subscribers; the sprouts grow in jars. */
export const PLAN_ROTATION: readonly string[] = ['BROC-01', 'RAD-01', 'SUN-01', 'PEA-01', 'FEN-01', 'BOR-01', 'AMA-01', 'CAB-01', 'CHIA-01'];

/**
 * Rob's own trays: a real subscriber, on Actual and in the Plan, taking one 1020 flat weekly at the
 * Saturday pickup. Own use: its trays flow through production like any other and leave finished
 * goods at cost to Owner Draws, never sold. The variety is the rotation's next; Rob changes it,
 * skips or pauses on Subscribers.
 */
export function ownUseSubscriber(): SubscriberDef {
  const id = 'CUST-OWN-USE';
  const pickupPoint = 'CS-OWN-USE';
  return {
    id,
    name: 'Own use (Rob)',
    channel: 1,
    status: 'contracted',
    ownUse: true,
    pricePerUnitCents: null,
    paymentTerms: null,
    contractStart: null,
    contractEnd: null,
    prospectId: null,
    notes: "Rob's own trays for his own consumption: to Owner Draws at cost, with no revenue and no invoice.",
    source: 'seed',
    pickupPoints: [{ id: pickupPoint, pickupPointId: null, name: 'Saturday pickup at the house', status: 'active', notes: null }],
    subscriptions: [
      {
        id: 'SUB-OWN-USE',
        subscriberId: id,
        subscriberPickupPointId: pickupPoint,
        cadence: 'weekly',
        startDate: PLAN_FIRST_PICKUP,
        endDate: null,
        flatPlan: [{ from: PLAN_FIRST_PICKUP, lines: [{ growPlanCode: PLAN_ROTATION[PLAN_SUBSCRIBERS % PLAN_ROTATION.length]!, units: 1 }] }],
        skips: [],
        pausedFrom: null,
        notes: null,
      },
    ],
  };
}

/**
 * The Plan's subscribers: nineteen Forecast Subscribers, in the Plan only and never on Actual, each
 * taking one 1020 flat weekly at the Saturday pickup at the house, the plans taken in turn (invented
 * test data, labelled so), and Rob's own tray (`ownUseSubscriber`): twenty trays a week. The farm has
 * no customer and no revenue on record; on Actual only Rob's own tray is ordered.
 */
export function planSeedSubscribers(): SubscriberDef[] {
  return [...testPlanSubscribers(), ownUseSubscriber()];
}

function testPlanSubscribers(): SubscriberDef[] {
  return Array.from({ length: PLAN_SUBSCRIBERS }, (_, i): SubscriberDef => {
    const n = String(i + 1).padStart(2, '0');
    const id = `CUST-PLAN-${n}`;
    const pickupPoint = `CS-PLAN-${n}`;
    return {
      id,
      name: `Plan subscriber ${n}`,
      channel: 1,
      status: 'forecast',
      pricePerUnitCents: null,
      paymentTerms: null,
      contractStart: null,
      contractEnd: null,
      prospectId: null,
      notes: `Invented test data: one of ${PLAN_SUBSCRIBERS} Plan subscribers toward 20 trays a week, one 1020 flat weekly at the Saturday pickup. A Forecast Subscriber: in the Plan only, never on Actual.`,
      source: 'seed',
      pickupPoints: [{ id: pickupPoint, pickupPointId: null, name: 'Saturday pickup at the house', status: 'active', notes: 'Invented test data.' }],
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
