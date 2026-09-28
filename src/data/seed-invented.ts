/**
 * Cotyledon — INVENTED seed data.
 *
 * Everything in this file is fictional. No real supplier, prospect, subscriber, or
 * person appears. Pickup points are named "Test Pickup point n" and are labelled as test data in the UI. Central Texas counties are real geography; the businesses are not.
 *
 * (The Suppliers page no longer uses invented data — it is driven by the real
 * compiled USDA INTEGRITY + TDA dataset in `suppliers-compiled.json`. Pickup points and
 * training courses below remain invented placeholders.)
 */

export interface PickupPoint {
  id: string;
  name: string;
  type: string;
  county: string;
  serviceWindow: string;
  dailyForecastUnits: number;
}

export const pickupPoints: PickupPoint[] = [
  { id: 'pickup-point-01', name: 'Test Pickup point 1', type: 'Private prospect', county: 'Travis', serviceWindow: '06:30–08:30 distribution', dailyForecastUnits: 320 },
  { id: 'pickup-point-02', name: 'Test Pickup point 2', type: 'Private prospect', county: 'Travis', serviceWindow: '06:30–08:30 distribution', dailyForecastUnits: 180 },
  { id: 'pickup-point-03', name: 'Test Pickup point 3', type: 'Private prospect', county: 'Hays', serviceWindow: '07:00–08:30 distribution', dailyForecastUnits: 150 },
  { id: 'pickup-point-04', name: 'Test Pickup point 4', type: 'Restaurants', county: 'Travis', serviceWindow: '11:00–12:00 distribution', dailyForecastUnits: 210 },
];

/** Training module placeholder catalog (invented) — for the honest shell. */
export const trainingCourses = [
  { id: 'TRN-04', title: 'Approved Supplier Verification', lessons: 5, format: 'Video + document review', audience: 'Receiving, partners' },
];
