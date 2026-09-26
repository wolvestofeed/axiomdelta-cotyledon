/**
 * MicroFarm — the Reports library (Roadmap Phase E). Pure, client-safe.
 *
 * The catalog names every report package the library carries, one or more per
 * section of the main menu, in the menu's own order. A report is a reading
 * surface: its rows are assembled on the server from the same engine functions
 * and records the module pages read (`_lib/reports.ts`), and nothing here
 * computes a figure. Each report opens at summary level; its detail rows are
 * shown only when the reader opens them.
 *
 * The library states facts and computed figures. No copy counsels.
 */

import { MODULES, SECTIONS } from '@/components/nav';

/** The managerial lens a report is read through. The reader filters on these. */
export type ReportTheme = 'performance' | 'loss' | 'compliance' | 'utilisation' | 'sustainability';

export const REPORT_THEMES: readonly ReportTheme[] = ['performance', 'loss', 'compliance', 'utilisation', 'sustainability'];

export const REPORT_THEME_LABELS: Record<ReportTheme, string> = {
  performance: 'Performance',
  loss: 'Loss & leakage',
  compliance: 'Alerts & compliance',
  utilisation: 'Utilisation & staffing',
  sustainability: 'Sustainability',
};

/** Which world a report's figures come from. Named on the report; nothing else signals it. */
export type ReportWorld = 'selected' | 'records' | 'reference';

export const REPORT_WORLD_LABELS: Record<ReportWorld, string> = {
  selected: 'The ledger selected in the scenario bar',
  records: 'The records only',
  reference: 'Reference data',
};

export interface ReportDef {
  id: string;
  /** A section of the main menu, exactly as `nav.ts` names it. */
  section: string;
  title: string;
  blurb: string;
  themes: ReportTheme[];
  world: ReportWorld;
  /** The module page the figures come from. */
  sourceHref: string;
  /** Company financials and staff data: admins only (Roadmap O5). Omitted for operators and never built. */
  adminOnly?: true;
}

export const REPORT_CATALOG: readonly ReportDef[] = [
  // ── Overview ────────────────────────────────────────────────────────────
  {
    id: 'alerts-register',
    section: 'Overview',
    title: 'Alerts and compliance register',
    blurb: 'Every open finding across the modules in one list: stage records that failed, lots with a load unrecorded, finished lots near expiry, raw lots past use-by, days the plan does not fit, studies past due, and — for admins — bills flagged and invoices past due.',
    themes: ['compliance'],
    world: 'records',
    sourceHref: '/farm/dashboard',
  },
  {
    id: 'plan-and-forecasts',
    section: 'Overview',
    title: 'Plan of record and forecasts on file',
    blurb: 'The plan of record in force, and every saved forecast with its owner tier and the date it was last saved.',
    themes: ['performance'],
    world: 'reference',
    sourceHref: '/farm/dashboard',
  },

  // ── Production ──────────────────────────────────────────────────────────
  {
    id: 'production-history',
    section: 'Production',
    title: 'Production history by month',
    blurb: 'Sowing records by month: sows, rack loads, units planned and packed, the yield share, and how many records mass-balanced.',
    themes: ['performance', 'loss'],
    world: 'selected',
    sourceHref: '/farm/production-planning/calendar',
  },
  {
    id: 'capacity-utilisation',
    section: 'Production',
    title: 'Capacity and blackout rack utilisation, next two weeks',
    blurb: 'The order book rolled through production: sowings, blackout rack cycles used against available, days that do not fit, and stock expiring.',
    themes: ['utilisation'],
    world: 'selected',
    sourceHref: '/farm/capacity',
  },
  {
    id: 'labor-standards',
    section: 'Production',
    title: 'Labor standards and time-study status',
    blurb: 'Each crop plan on its labor standard: observed or estimated, labor minutes per unit, fixed minutes per sowing, and when the next study is due.',
    themes: ['utilisation', 'compliance'],
    world: 'reference',
    sourceHref: '/farm/time-studies',
  },
  {
    id: 'unit-cost',
    section: 'Production',
    title: 'Cost of a unit at standard',
    blurb: 'Food, labor and packaging per unit for every crop plan in service, at the derived sowing and the crop plan\'s own labor standard.',
    themes: ['performance'],
    world: 'reference',
    sourceHref: '/farm/crop-plans',
  },

  // ── Financials & Accounting ─────────────────────────────────────────────
  {
    id: 'income-by-period',
    section: 'Financials & Accounting',
    title: 'Income statement by month',
    blurb: 'Units, revenue, gross margin, operating income and net income for every month of the ledger, with the year total.',
    themes: ['performance'],
    world: 'selected',
    sourceHref: '/farm/financials/pnl',
    adminOnly: true,
  },
  {
    id: 'cost-trend',
    section: 'Financials & Accounting',
    title: 'Cost of a unit and fixed cost per unit, by month',
    blurb: 'Standard cost per unit beside the period\'s fixed expense — manufacturing overhead, general and administrative, interest — over the units distributed.',
    themes: ['performance'],
    world: 'selected',
    sourceHref: '/farm/financials/unit-economics',
    adminOnly: true,
  },
  {
    id: 'variances',
    section: 'Financials & Accounting',
    title: 'Manufacturing variances by month',
    blurb: 'Purchase price, usage, labor, overhead volume and spending, abnormal spoilage: each variance line by month against gross margin at standard.',
    themes: ['loss'],
    world: 'selected',
    sourceHref: '/farm/financials/ledger',
    adminOnly: true,
  },
  {
    id: 'working-capital-aging',
    section: 'Financials & Accounting',
    title: 'Receivables and payables aging',
    blurb: 'Open invoices and open bills by days past due, by subscriber and by supplier, and the bills held from payment on a mismatch.',
    themes: ['compliance', 'performance'],
    world: 'selected',
    sourceHref: '/farm/receivables',
    adminOnly: true,
  },
  {
    id: 'plan-v-actual',
    section: 'Financials & Accounting',
    title: 'Plan v Actual, current quarter',
    blurb: 'Units, orders, sowings, revenue, food and labor cost and served cost per unit — the plan of record in force at each month end against the records.',
    themes: ['performance'],
    world: 'records',
    sourceHref: '/farm/financials/plan-v-actual',
    adminOnly: true,
  },

  // ── Cold Chain ──────────────────────────────────────────────────────────
  {
    id: 'inventory-position',
    section: 'Inventory & Quality',
    title: 'Inventory position and shelf-life exposure',
    blurb: 'Finished lots on hand and the units in them, lots within seven days of shelf life, units past shelf life unconsumed, and raw lots past the date on the case.',
    themes: ['loss'],
    world: 'selected',
    sourceHref: '/farm/inventory',
  },
  {
    id: 'cooling-compliance',
    section: 'Inventory & Quality',
    title: 'control-point-2 cooling compliance by month',
    blurb: 'Stage records per rack load: passed, failed, and blackout lots with a load unrecorded, computed from the readings on the closed sowing records.',
    themes: ['compliance'],
    world: 'records',
    sourceHref: '/farm/produce-safety',
  },

  // ── Supply Chain ────────────────────────────────────────────────────────
  {
    id: 'supply-position',
    section: 'Supply Chain',
    title: 'Supply position and open purchase orders',
    blurb: 'Raw stock on hand at invoice, purchase orders open and their value, and receipts in the last thirty days with their rejected lines.',
    themes: ['performance', 'loss'],
    world: 'records',
    sourceHref: '/farm/procurement',
  },
  {
    id: 'supplier-activity',
    section: 'Supply Chain',
    title: 'Supplier activity and receiving quality',
    blurb: 'Receipts by supplier: value received, lines rejected, lines received short or over against the order, and the share with a temperature taken at the dock.',
    themes: ['compliance', 'loss'],
    world: 'records',
    sourceHref: '/farm/suppliers',
  },

  // ── Sustainability ──────────────────────────────────────────────────────
  {
    id: 'emissions-statement',
    section: 'Sustainability',
    title: 'Greenhouse-gas statement by scope',
    blurb: 'Scope 1, 2 and 3 on the reference and selected food bases, the totals, and CO2e per unit, per square foot and per operating day.',
    themes: ['sustainability'],
    world: 'selected',
    sourceHref: '/farm/sustainability/inventory',
  },
  {
    id: 'waste-end-of-life',
    section: 'Sustainability',
    title: 'Waste and end-of-life',
    blurb: 'Shrink on the period\'s production and finished units past shelf life unshipped, as mass, and the landfill and compost pathways on the WARM factors.',
    themes: ['loss', 'sustainability'],
    world: 'selected',
    sourceHref: '/farm/sustainability/waste',
  },
  {
    id: 'refrigerant-leakage',
    section: 'Sustainability',
    title: 'Refrigerant circuits and leak rate',
    blurb: 'Every circuit on file with its full charge, the refrigerant added this year, the annualized leak rate and the rule findings it triggers.',
    themes: ['compliance', 'sustainability'],
    world: 'selected',
    sourceHref: '/farm/sustainability/refrigerants',
  },

  // ── People ──────────────────────────────────────────────────────────────
  {
    id: 'staff-demand',
    section: 'People',
    title: 'Staff demand, next two weeks',
    blurb: 'Staff-hours and headcount the production plan needs by day, from each crop plan\'s labor standard, and the crop plans with no study.',
    themes: ['utilisation'],
    world: 'selected',
    sourceHref: '/farm/schedule',
  },
  {
    id: 'hours-overtime',
    section: 'People',
    title: 'Hours and overtime, this pay period',
    blurb: 'Regular and overtime hours by person from the time clock, and open shifts. No pay appears; pay is held in Staffing.',
    themes: ['utilisation'],
    world: 'records',
    sourceHref: '/farm/staffing',
    adminOnly: true,
  },
  {
    id: 'training-completion',
    section: 'People',
    title: 'Training document completion',
    blurb: 'Each document in force, who it is assigned to across the register, and how many have completed the version in force.',
    themes: ['compliance'],
    world: 'records',
    sourceHref: '/farm/training',
  },

  // ── Sales ───────────────────────────────────────────────────────────────
  {
    id: 'order-book-accuracy',
    section: 'Sales',
    title: 'Order book and distributed against ordered, by pickup point',
    blurb: 'The last thirty days and the next fourteen: forecast, confirmed and distributed units by pickup point, and distributed less ordered on the distributed orders.',
    themes: ['performance'],
    world: 'selected',
    sourceHref: '/farm/orders',
  },
  {
    id: 'subscribers-and-pipeline',
    section: 'Sales',
    title: 'Subscribers on file and the prospect pipeline',
    blurb: 'Subscribers by channel and status, and the prospect directory by pipeline stage and segment.',
    themes: ['performance'],
    world: 'reference',
    sourceHref: '/farm/subscribers',
  },

  // ── Distribution ────────────────────────────────────────────────────────
  {
    id: 'distributions-handoff',
    section: 'Distribution',
    title: 'Distributions and hand-off temperature by month',
    blurb: 'Distributions and units by month, the share with a temperature recorded at hand-off, distributions above 41°F at hand-off, and the share signed for at the pickup point.',
    themes: ['compliance', 'performance'],
    world: 'records',
    sourceHref: '/farm/pickup-points',
  },
  {
    id: 'distribution-pickup-points',
    section: 'Distribution',
    title: 'Distribution pickup points and daily forecast',
    blurb: 'Every distribution pickup point with its type, county, service window and daily forecast units, and whether the forecast comes from a subscriber pickup point.',
    themes: ['performance'],
    world: 'selected',
    sourceHref: '/farm/pickup-points',
  },

  // ── Subscriber ────────────────────────────────────────────────────────────
  {
    id: 'subscriber-accounts',
    section: 'Subscriber',
    title: 'Subscriber accounts: orders, invoices and payments',
    blurb: 'Per subscriber: orders on file by status, distributions recorded, invoices issued, what is open on them and what has been received.',
    themes: ['performance', 'compliance'],
    world: 'records',
    sourceHref: '/farm/subscriber-portal',
    adminOnly: true,
  },

  // ── Supplier ────────────────────────────────────────────────────────────
  {
    id: 'supplier-catalogs',
    section: 'Supplier',
    title: 'Supplier catalogs on file',
    blurb: 'Catalog lines by supplier: approved against candidate, lines with a price in force, lines naming a certification, and lead times on file.',
    themes: ['compliance'],
    world: 'records',
    sourceHref: '/farm/supplier-portal',
  },
];

/** The sections in the order the main menu shows them, each with at least one report. */
export const REPORT_SECTIONS: readonly string[] = SECTIONS.filter((s) => REPORT_CATALOG.some((r) => r.section === s));

/** The reports a role can read: operators do not get the admin-only entries. */
export function reportsFor(isAdmin: boolean): ReportDef[] {
  return REPORT_CATALOG.filter((r) => isAdmin || !r.adminOnly);
}

export function reportDef(id: string): ReportDef | undefined {
  return REPORT_CATALOG.find((r) => r.id === id);
}

/** Sections of the menu with no report package: the catalog test asserts this is empty. */
export function sectionsWithoutReports(): string[] {
  const menuSections = [...new Set(MODULES.map((m) => m.section))];
  return menuSections.filter((s) => !REPORT_CATALOG.some((r) => r.section === s));
}

// ── The report's rows ───────────────────────────────────────────────────────

export type ReportCell = string | number | null;

export interface ReportColumn {
  label: string;
  /** Right-aligned figure. */
  num?: boolean;
}

export interface ReportRow {
  cells: ReportCell[];
  /** A total row, a faint row (nothing in it), or a row that breached a limit. */
  tone?: 'total' | 'faint' | 'over';
}

export interface ReportTable {
  columns: ReportColumn[];
  rows: ReportRow[];
}

export interface ReportData {
  id: string;
  /** Summary-level rows: shown by default. */
  summary: ReportTable;
  /** Detail rows: shown when the reader opens them. Null when the report has no finer level. */
  detail: ReportTable | null;
  /** How many detail rows there are, for the toggle. */
  detailCount: number;
  /** The basis the figures were read on: which ledger, which window, which records. */
  basis: string;
  /** Set when there is nothing on record to report; the summary still renders. */
  empty?: string;
}

// ── Sorting and filtering ──────────────────────────────────────────────────

export type ReportSort = 'menu' | 'title' | 'recent';

export const REPORT_SORT_LABELS: Record<ReportSort, string> = {
  menu: 'Main menu order',
  title: 'Title, A to Z',
  recent: 'Most recently viewed first',
};

export interface ReportFilter {
  q: string;
  theme: ReportTheme | 'all';
  /** Only reports with something on record. */
  withDataOnly: boolean;
}

export const EMPTY_FILTER: ReportFilter = { q: '', theme: 'all', withDataOnly: false };

export function filterReports<T extends { def: ReportDef; data: ReportData }>(reports: readonly T[], f: ReportFilter): T[] {
  const q = f.q.trim().toLowerCase();
  return reports.filter(({ def, data }) => {
    if (f.theme !== 'all' && !def.themes.includes(f.theme)) return false;
    if (f.withDataOnly && data.empty) return false;
    if (q && !`${def.title} ${def.blurb} ${def.section} ${def.themes.map((t) => REPORT_THEME_LABELS[t]).join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/**
 * Sort the reports. Menu order is the catalog's own; recent puts the reports
 * in `recent` first, in that order, and the rest in menu order after them.
 */
export function sortReports<T extends { def: ReportDef }>(reports: readonly T[], sort: ReportSort, recent: readonly string[]): T[] {
  const menuIndex = (id: string) => REPORT_CATALOG.findIndex((r) => r.id === id);
  const out = [...reports];
  if (sort === 'title') return out.sort((a, b) => a.def.title.localeCompare(b.def.title));
  if (sort === 'recent') {
    const rank = (id: string) => {
      const i = recent.indexOf(id);
      return i === -1 ? Number.POSITIVE_INFINITY : i;
    };
    return out.sort((a, b) => rank(a.def.id) - rank(b.def.id) || menuIndex(a.def.id) - menuIndex(b.def.id));
  }
  return out.sort((a, b) => menuIndex(a.def.id) - menuIndex(b.def.id));
}

// ── Most recently viewed ───────────────────────────────────────────────────

export const RECENT_REPORTS_MAX = 5;

/** The cookie holding the reader's most recently viewed report ids (`_lib/report-actions.ts`). */
export const RECENT_REPORTS_COOKIE = 'farm_recent_reports';

/** The list after a report is viewed: that report first, no duplicates, at most five. */
export function noteViewed(recent: readonly string[], id: string, max = RECENT_REPORTS_MAX): string[] {
  return [id, ...recent.filter((r) => r !== id)].slice(0, max);
}

/** Read a stored list back: only ids the catalog knows, in order, at most five. */
export function parseRecent(raw: string | undefined | null, max = RECENT_REPORTS_MAX): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of parsed) {
    if (typeof v !== 'string' || seen.has(v) || !reportDef(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}
