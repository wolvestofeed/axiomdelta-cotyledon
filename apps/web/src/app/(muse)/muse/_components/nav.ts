/**
 * Impact OS — module navigation.
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

/** The OS's home (Roadmap P7): `/muse` itself is the public front door. */
export const DASHBOARD_HREF = '/muse/dashboard';

export const MODULES: NavItem[] = [
  { label: 'Dashboard', href: DASHBOARD_HREF, section: 'Overview', status: 'live' },
  { label: 'Reports', href: '/muse/reports', section: 'Overview', status: 'live' },
  { label: 'Sources', href: '/muse/sources', section: 'Overview', status: 'live', atBottom: true },

  { label: 'Recipes', href: '/muse/recipes', section: 'Production', status: 'live' },
  { label: 'Time Studies', href: '/muse/time-studies', section: 'Production', status: 'live' },
  { label: 'Production Planning', href: '/muse/production-planning', section: 'Production', status: 'live' },
  { label: 'Day Schedule', href: '/muse/production-planning/schedule', section: 'Production', status: 'live' },
  { label: 'Compare', href: '/muse/production-planning/compare', section: 'Production', status: 'live' },
  { label: 'Calendar', href: '/muse/production-planning/calendar', section: 'Production', status: 'live' },
  { label: 'Process', href: '/muse/production-planning/process', section: 'Production', status: 'live' },
  { label: 'Capacity', href: '/muse/capacity', section: 'Production', status: 'live' },
  { label: 'Equipment', href: '/muse/equipment', section: 'Production', status: 'live' },
  { label: 'Packaging', href: '/muse/packaging', section: 'Production', status: 'live' },
  { label: 'Floor', href: '/muse/floor', section: 'Production', status: 'live' },

  { label: 'Unit Economics', href: '/muse/financials/unit-economics', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Profit & Loss', href: '/muse/financials/pnl', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Balance Sheet', href: '/muse/financials/balance-sheet', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Cash Flow', href: '/muse/financials/cash-flow', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Ledger', href: '/muse/financials/ledger', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Plan v Actual', href: '/muse/financials/plan-v-actual', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Actuals', href: '/muse/actuals', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Receivables', href: '/muse/receivables', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Payables', href: '/muse/payables', section: 'Financials & Accounting', status: 'live', adminOnly: true },
  { label: 'Capital & Financing', href: '/muse/financials/capital', section: 'Financials & Accounting', status: 'live', adminOnly: true },

  { label: 'Inventory', href: '/muse/inventory', section: 'Cold Chain', status: 'live' },
  { label: 'Food Safety', href: '/muse/food-safety', section: 'Cold Chain', status: 'live' },

  { label: 'Procurement', href: '/muse/procurement', section: 'Supply Chain', status: 'live' },
  { label: 'Suppliers', href: '/muse/suppliers', section: 'Supply Chain', status: 'partial' },

  { label: 'Inventory & Audit', href: '/muse/sustainability/inventory', section: 'Sustainability', status: 'partial' },
  { label: 'Facility', href: '/muse/sustainability/facility', section: 'Sustainability', status: 'live', adminOnly: true },
  { label: 'Energy (Scope 1 & 2)', href: '/muse/sustainability/energy', section: 'Sustainability', status: 'partial' },
  { label: 'Refrigerants', href: '/muse/sustainability/refrigerants', section: 'Sustainability', status: 'partial' },
  { label: 'Equipment & Rebates', href: '/muse/sustainability/equipment', section: 'Sustainability', status: 'partial' },
  { label: 'Ingredients (Scope 3)', href: '/muse/sustainability/ingredients', section: 'Sustainability', status: 'live' },
  { label: 'Supplier LCA Data', href: '/muse/sustainability/supplier-lca', section: 'Sustainability', status: 'partial' },
  { label: 'Logistics', href: '/muse/sustainability/logistics', section: 'Sustainability', status: 'partial' },
  { label: 'Waste & End-of-Life', href: '/muse/sustainability/waste', section: 'Sustainability', status: 'live' },
  { label: 'Water & Effluent', href: '/muse/sustainability/water', section: 'Sustainability', status: 'partial' },

  { label: 'HR', href: '/muse/hr', section: 'People', status: 'partial' },
  { label: 'Schedule', href: '/muse/schedule', section: 'People', status: 'live' },
  { label: 'Training', href: '/muse/training', section: 'People', status: 'designed' },


  { label: 'Sales Portal', href: '/muse/sales-portal', section: 'Sales', status: 'partial' },
  { label: 'CRM', href: '/muse/sales', section: 'Sales', status: 'partial' },
  { label: 'Customers', href: '/muse/customers', section: 'Sales', status: 'live' },
  { label: 'Orders', href: '/muse/orders', section: 'Sales', status: 'live' },

  { label: 'Sites & Delivery', href: '/muse/sites', section: 'Distribution', status: 'designed' },

  { label: 'Customer Portal', href: '/muse/customer-portal', section: 'Customer', status: 'designed' },
  { label: 'Order Builder', href: '/muse/customer-portal/order-builder', section: 'Customer', status: 'designed' },

  { label: 'Supplier Portal', href: '/muse/supplier-portal', section: 'Supplier', status: 'designed' },

  { label: 'Parent Portal', href: '/muse/parent-portal', section: 'Parent', status: 'designed' },
  { label: 'Parent Admin', href: '/muse/parent-admin', section: 'Parent', status: 'designed' },
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
 * The external users' portal sections (Robert, 2026-09-16): last in the menu, below a rule that closes the OS
 * sections.
 */
export const EXTERNAL_SECTIONS: readonly string[] = ['Customer', 'Supplier', 'Parent'];
