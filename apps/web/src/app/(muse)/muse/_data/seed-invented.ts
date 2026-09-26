/**
 * Impact OS — INVENTED seed data.
 *
 * Everything in this file is fictional. No real supplier, school, customer, or
 * person appears. Sites are named "Test Site n" (Robert, 2026-09-13: no name that
 * could be read as a sales lead) and are labelled as test data in the UI. Central Texas counties are real geography; the businesses are not.
 *
 * (The Suppliers page no longer uses invented data — it is driven by the real
 * compiled USDA INTEGRITY + TDA dataset in `suppliers-compiled.json`. Sites and
 * training courses below remain invented placeholders.)
 */

export interface Site {
  id: string;
  name: string;
  type: string;
  county: string;
  serviceWindow: string;
  dailyForecastPortions: number;
}

export const sites: Site[] = [
  { id: 'SITE-01', name: 'Test Site 1', type: 'Private school', county: 'Travis', serviceWindow: '06:30–08:30 delivery', dailyForecastPortions: 320 },
  { id: 'SITE-02', name: 'Test Site 2', type: 'Private school', county: 'Travis', serviceWindow: '06:30–08:30 delivery', dailyForecastPortions: 180 },
  { id: 'SITE-03', name: 'Test Site 3', type: 'Private school', county: 'Hays', serviceWindow: '07:00–08:30 delivery', dailyForecastPortions: 150 },
  { id: 'SITE-04', name: 'Test Site 4', type: 'Corporate catering', county: 'Travis', serviceWindow: '11:00–12:00 delivery', dailyForecastPortions: 210 },
];

/** Training module placeholder catalog (invented) — for the honest shell. */
export const trainingCourses = [
  { id: 'TRN-01', title: 'Cook-Chill Fundamentals', lessons: 6, format: 'Video + assessment', audience: 'Production staff' },
  { id: 'TRN-02', title: 'CCP-2 Two-Stage Cooling', lessons: 4, format: 'Video + assessment', audience: 'Production leads' },
  { id: 'TRN-03', title: 'Allergen Changeover & Segregation', lessons: 3, format: 'Video', audience: 'All staff' },
  { id: 'TRN-04', title: 'Approved Supplier Verification', lessons: 5, format: 'Video + document review', audience: 'Receiving, partners' },
];
