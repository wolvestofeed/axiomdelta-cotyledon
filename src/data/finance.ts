/**
 * MicroFarm — loans and fixed-cost lines: the document shapes, and the seed.
 *
 * These were two constant blocks in `capex.ts` — `financeParams` (one equipment
 * loan and one leasehold loan, their principals derived from the capex totals)
 * and `monthlyFixedCosts` (lease, utilities, admin as three numbers). They are
 * definitions now (Roadmap N1), each carrying its real-world status, so one
 * list holds what is signed and what is planned.
 *
 * A loan's principal is TYPED. A loan may be for less than
 * the schedule it finances, or carry a deposit, and a principal that silently
 * tracked an equipment edit could express neither. The capex total for the same
 * purpose is reported beside it, so a gap is visible rather than impossible.
 *
 * Money in cents: these are stated commitments, not computed rates.
 */

import type { EquipmentSetting } from '@/data/capex';

export const LOAN_PURPOSES = ['equipment', 'leasehold', 'other'] as const;
export type LoanPurpose = (typeof LOAN_PURPOSES)[number];

export const LOAN_PURPOSE_LABELS: Record<LoanPurpose, string> = {
  equipment: 'Equipment',
  leasehold: 'Leasehold improvements',
  other: 'Other',
};

export const LOAN_STATUSES = ['planned', 'funded'] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  planned: 'Planned',
  funded: 'Funded',
};

export interface LoanDef {
  /** The database row id; absent on the code seed. */
  id?: string;
  /** Stable across a reseed; a saved forecast's overlay keys on it. */
  key: string;
  label: string;
  purpose: LoanPurpose;
  status: LoanStatus;
  principalCents: number;
  /** Annual rate as a fraction: 0.09 is 9%. */
  apr: number;
  termMonths: number;
  startDate: string;
  notes: string | null;
  source: 'seed' | 'user_built';
}

export const FIXED_COST_TREATMENTS = ['manufacturing_overhead', 'general_admin'] as const;
export type FixedCostTreatment = (typeof FIXED_COST_TREATMENTS)[number];

export const FIXED_COST_TREATMENT_LABELS: Record<FixedCostTreatment, string> = {
  manufacturing_overhead: 'Manufacturing overhead',
  general_admin: 'General & administrative',
};

/** What each treatment means for the statements, stated where an operator picks one. */
export const FIXED_COST_TREATMENT_NOTES: Record<FixedCostTreatment, string> = {
  manufacturing_overhead:
    'Absorbs into inventory on normal capacity (ASC 330-10-30-1/-3); unabsorbed overhead goes to the period.',
  general_admin: 'A period cost. ASC 330-10-30-8 keeps it out of inventory.',
};

export const FIXED_COST_STATUSES = ['planned', 'in_force'] as const;
export type FixedCostStatus = (typeof FIXED_COST_STATUSES)[number];

export const FIXED_COST_STATUS_LABELS: Record<FixedCostStatus, string> = {
  planned: 'Planned',
  in_force: 'In force',
};

export interface FixedCostLineDef {
  /** The database row id; absent on the code seed. */
  id?: string;
  key: string;
  label: string;
  /** The operator's own grouping. */
  category: string;
  /** The home grow room's cost, or a rented commercial facility's. */
  setting: EquipmentSetting;
  /** The accounting fact, never inferred from the label. */
  treatment: FixedCostTreatment;
  status: FixedCostStatus;
  monthlyAmountCents: number;
  /** Null = in force for the whole plan. */
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  source: 'seed' | 'user_built';
  /**
   * A home line's household bill, cents a month, as a forecast states it. The grow room's share
   * of it is the monthly amount (`allocatedShare`); null on a line typed directly.
   */
  householdAmountCents?: number | null;
  /** The share a forecast types for this line, 0–1, over the floor-area share; null = the floor-area share. */
  allocationShare?: number | null;
  /** The household quantity the bill is for (water: gallons a month), as a forecast states it. */
  householdQuantity?: number | null;
  /** The share in force on the line after the forecast resolves it; null when no share is known. */
  allocatedShare?: number | null;
}

/** The unit a home line's household quantity is in, by line key. */
export const HOME_LINE_QUANTITY_UNITS: Readonly<Record<string, string>> = { 'home-water': 'gal' };

/** Used equipment costs this share of new — a purchase factor, not a loan term. */
export const equipmentPurchase = {
  usedDiscount: 0.5,
};

/**
 * No loan is seeded: a home grow room is funded without one, and a commercial facility's loans
 * are entered on Equipment's Commercial tab.
 */
export function seedLoans(): LoanDef[] {
  return [];
}

const NOT_STATED = 'Not stated: enter the monthly amount.';
const line = (key: string, label: string, category: string, treatment: FixedCostTreatment, setting: EquipmentSetting, notes: string): FixedCostLineDef => ({
  key, label, category, treatment, setting, status: 'planned', monthlyAmountCents: 0, startDate: null, endDate: null, notes, source: 'seed',
});

/**
 * The monthly fixed costs, at zero until stated. Home: the grow room's share of the household's
 * residential services (rent or mortgage, water, sewer, trash and recycling, compost) and its
 * business costs; the grow lights' electricity is on each plan's cost card, not here. Commercial:
 * a rented facility's rent, utilities and business costs.
 */
export function seedFixedCostLines(): FixedCostLineDef[] {
  const share = 'Enter the household bill; the grow room\'s share of it is the monthly amount.';
  return [
    line('home-rent', 'Rent or mortgage', 'lease', 'manufacturing_overhead', 'home', share),
    line('home-water', 'Water', 'utilities', 'manufacturing_overhead', 'home', `${share} The gallons feed Sustainability · Water.`),
    line('home-sewer', 'Sewer', 'utilities', 'manufacturing_overhead', 'home', share),
    line('home-trash', 'Trash and recycling', 'utilities', 'manufacturing_overhead', 'home', share),
    line('home-compost', 'Compost', 'utilities', 'manufacturing_overhead', 'home', share),
    line('home-admin', 'Admin, insurance, software, licenses', 'admin', 'general_admin', 'home', 'The business\'s own bills: all of each unless a share is stated. G&A — ASC 330-10-30-8 keeps it out of inventory.'),
    line('lease', 'Rent', 'lease', 'manufacturing_overhead', 'commercial', `${NOT_STATED} A signed lease moves the line to In force.`),
    line('utilities', 'Utilities', 'utilities', 'manufacturing_overhead', 'commercial', NOT_STATED),
    line('admin', 'Admin, insurance, software, licenses', 'admin', 'general_admin', 'commercial', `${NOT_STATED} G&A — ASC 330-10-30-8 keeps it out of inventory.`),
  ];
}

/** The engine default when no loan library is loaded. */
export function codeSeedLoans(): LoanDef[] {
  return seedLoans();
}
