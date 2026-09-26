/**
 * MicroFarm — module navigation.
 *
 * Single source of truth for the sidebar and the Platform Map. `status`
 * describes honestly how built each module is:
 *   - 'live'     — real computed numbers from the plan data
 *   - 'partial'  — real analysis, some surfaces still designed
 *   - 'designed' — layout + honest empty state, data not yet wired
 */

export type ModuleStatus = 'live' | 'partial' | 'designed';

export interface NavItem {
  label: string;
  href: string;
  section: string;
  status: ModuleStatus;
  /** Admins only (Roadmap O5): the entry is removed for operators and the page is gated server-side. */
  adminOnly?: true;
  /** Sits at the foot of the sidebar, below the sections, rather than with the top links. */
  atBottom?: true;
}

/** The OS's home (Roadmap P7): `/farm` itself is the public front door. */
export const DASHBOARD_HREF = '/farm/dashboard';

export const MODULES: NavItem[] = [
  { label: 'Dashboard', href: DASHBOARD_HREF, section: 'Overview', status: 'live' },
  { label: 'Reports', href: '/farm/reports', section: 'Overview', status: 'live' },
  { label: 'Sources', href: '/farm/sources', section: 'Overview', status: 'live', atBottom: true },

  { label: 'Grow plans', href: '/farm/crop-plans', section: 'Production', status: 'live' },
  { label: 'Varieties', href: '/farm/varieties', section: 'Production', status: 'live' },
  { label: 'Time Studies', href: '/farm/time-studies', section: 'Production', status: 'live' },
  { label: 'Production Planning', href: '/farm/production-planning', section: 'Production', status: 'live' },
  { label: 'Day Schedule', href: '/farm/production-planning/schedule', section: 'Production', status: 'live' },
  { label: 'Compare', href: '/farm/production-planning/compare', section: 'Production', status: 'live' },
  { label: 'Calendar', href: '/farm/production-planning/calendar', section: 'Production', status: 'live' },
  { label: 'Grow Calendar', href: '/farm/production-planning/grow-calendar', section: 'Production', status: 'live' },
  { label: 'Process', href: '/farm/production-planning/process', section: 'Production', status: 'live' },
  { label: 'Capacity', href: '/farm/capacity', section: 'Production', status: 'live' },
  { label: 'Grow Units', href: '/farm/grow-units', section: 'Production', status: 'live' },
  { label: 'Packaging', href: '/farm/packaging', section: 'Production', status: 'live' },
  { label: 'Grow Room', href: '/farm/grow-room', section: 'Production', status: 'live' },

  { label: 'Unit Economics', href: '/farm/financials/unit-economics', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Profit & Loss', href: '/farm/financials/pnl', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Balance Sheet', href: '/farm/financials/balance-sheet', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Cash Flow', href: '/farm/financials/cash-flow', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Ledger', href: '/farm/financials/ledger', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Plan v Actual', href: '/farm/financials/plan-v-actual', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Actuals', href: '/farm/actuals', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Receivables', href: '/farm/receivables', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Payables', href: '/farm/payables', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Capital & Financing', href: '/farm/financials/capital', section: 'Financials & Accounting', status: 'live', adminOnly: true },

  { label: 'Inventory', href: '/farm/inventory', section: 'Cold Chain', status: 'live' },
  { label: 'Produce Safety', href: '/farm/produce-safety', section: 'Cold Chain', status: 'live' },

  { label: 'Procurement', href: '/farm/procurement', section: 'Supply Chain', status: 'live' },
  { label: 'Suppliers', href: '/farm/suppliers', section: 'Supply Chain', status: 'partial' },

  { label: 'Inventory & Audit', href: '/farm/sustainability/inventory', section: 'Sustainability', status: 'partial' },
  { label: 'Facility', href: '/farm/sustainability/facility', section: 'Sustainability', status: 'live', adminOnly: true },
  { label: 'Energy (Scope 1 & 2)', href: '/farm/sustainability/energy', section: 'Sustainability', status: 'partial' },
  { label: 'Refrigerants', href: '/farm/sustainability/refrigerants', section: 'Sustainability', status: 'partial' },
  { label: 'Equipment & Rebates', href: '/farm/sustainability/equipment', section: 'Sustainability', status: 'partial' },
  { label: 'Inputs (Scope 3)', href: '/farm/sustainability/inputs', section: 'Sustainability', status: 'live' },
  { label: 'Supplier LCA Data', href: '/farm/sustainability/supplier-lca', section: 'Sustainability', status: 'partial' },
  { label: 'Logistics', href: '/farm/sustainability/logistics', section: 'Sustainability', status: 'partial' },
  { label: 'Waste & End-of-Life', href: '/farm/sustainability/waste', section: 'Sustainability', status: 'live' },
  { label: 'Water & Effluent', href: '/farm/sustainability/water', section: 'Sustainability', status: 'partial' },

  { label: 'Staffing', href: '/farm/staffing', section: 'People', status: 'partial' },
  { label: 'Schedule', href: '/farm/schedule', section: 'People', status: 'live' },
  { label: 'Training', href: '/farm/training', section: 'People', status: 'designed' },


  { label: 'Sales Portal', href: '/farm/sales-portal', section: 'Sales', status: 'partial' },
  { label: 'Prospects', href: '/farm/prospects', section: 'Sales', status: 'partial' },
  { label: 'Subscribers', href: '/farm/subscribers', section: 'Sales', status: 'live' },
  { label: 'Orders', href: '/farm/orders', section: 'Sales', status: 'live' },

  { label: 'Pickup Points & Routes', href: '/farm/pickup-points', section: 'Distribution', status: 'designed' },

  { label: 'Subscriber Portal', href: '/farm/subscriber-portal', section: 'Subscriber', status: 'designed' },
  { label: 'Flat Builder', href: '/farm/subscriber-portal/flat-builder', section: 'Subscriber', status: 'designed' },

  { label: 'Supplier Portal', href: '/farm/supplier-portal', section: 'Supplier', status: 'designed' },
];

/**
 * The modules a role can open: operators do not get the admin-only entries, and an admin's Dashboard is the
 * Admin Dashboard (Roadmap P7).
 */
export function modulesFor(isAdmin: boolean): NavItem[] {
  return isAdmin
    ? MODULES.map((m) => (m.href === DASHBOARD_HREF ? { ...m, label: 'Admin Dashboard' } : m))
    : MODULES.filter((m) => !m.adminOnly);
}

export function sectionsOf(modules: NavItem[]): string[] {
  return modules.reduce<string[]>((acc, m) => {
    if (!acc.includes(m.section)) acc.push(m.section);
    return acc;
  }, []);
}

export const SECTIONS: string[] = sectionsOf(MODULES);

/**
 * The external users' portal sections: last in the menu, below a rule that closes the OS
 * sections.
 */
export const EXTERNAL_SECTIONS: readonly string[] = ['Subscriber', 'Supplier'];
