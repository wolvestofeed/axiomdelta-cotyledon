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

import { openingPosition } from '@/data/working-capital';
import { equipmentSeed, leaseholdSeed } from '@/data/capex';

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
  /** The accounting fact, never inferred from the label. */
  treatment: FixedCostTreatment;
  status: FixedCostStatus;
  monthlyAmountCents: number;
  /** Null = in force for the whole plan. */
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  source: 'seed' | 'user_built';
}

/** Used equipment costs this share of new — a purchase factor, not a loan term. */
export const equipmentPurchase = {
  usedDiscount: 0.5,
};

/**
 * The two loans the plan carries, seeded at the capex totals in force when the
 * seed runs (Roadmap N1). APR and term were the `financeParams` placeholders;
 * the start date is the stated loan start.
 *
 * Principals are passed in rather than read here so the seed is written from
 * the live equipment library, not from the code schedule — the two differ as
 * soon as a quantity is edited, and the seed should match what the page shows
 * on the day it runs.
 */
export function seedLoans(principals: { equipmentCents: number; leaseholdCents: number }): LoanDef[] {
  const startDate = openingPosition.loanStartDate.value;
  return [
    {
      key: 'equipment-loan',
      label: 'Equipment loan',
      purpose: 'equipment',
      status: 'planned',
      principalCents: principals.equipmentCents,
      apr: 0.09,
      termMonths: 60,
      startDate,
      notes:
        'PLACEHOLDER terms: 9% over 60 months, a typical commercial equipment lease. Seeded at the equipment schedule total on the day the seed ran; it does not track the schedule afterwards, and the current total is shown beside it.',
      source: 'seed',
    },
    {
      key: 'leasehold-loan',
      label: 'Leasehold improvements loan',
      purpose: 'leasehold',
      status: 'planned',
      principalCents: principals.leaseholdCents,
      apr: 0.08,
      termMonths: 84,
      startDate,
      notes:
        'PLACEHOLDER terms: 8% amortised over the 7-year lease term. Seeded at the leasehold schedule total on the day the seed ran.',
      source: 'seed',
    },
  ];
}

/** The three monthly fixed costs the constants carried, as definitions. */
export function seedFixedCostLines(): FixedCostLineDef[] {
  return [
    {
      key: 'lease',
      label: 'Lease',
      category: 'lease',
      treatment: 'manufacturing_overhead',
      status: 'planned',
      monthlyAmountCents: 12_000_00,
      startDate: null,
      endDate: null,
      notes: 'PLACEHOLDER: $12,000 a month on the 5,000 sq ft shell. A signed lease replaces it and moves the line to In force.',
      source: 'seed',
    },
    {
      key: 'utilities',
      label: 'Utilities',
      category: 'utilities',
      treatment: 'manufacturing_overhead',
      status: 'planned',
      monthlyAmountCents: 4_500_00,
      startDate: null,
      endDate: null,
      notes: 'PLACEHOLDER: $4,500 a month. The Sustainability energy and water inputs carry the same accounts on their own basis.',
      source: 'seed',
    },
    {
      key: 'admin',
      label: 'Admin, insurance, software, licenses',
      category: 'admin',
      treatment: 'general_admin',
      status: 'planned',
      monthlyAmountCents: 6_000_00,
      startDate: null,
      endDate: null,
      notes: 'PLACEHOLDER: $6,000 a month. G&A — ASC 330-10-30-8 keeps it out of inventory.',
      source: 'seed',
    },
  ];
}

/**
 * The engine default when no loan library is loaded: the same two loans, with
 * their principals off the CODE capex schedule. The database seed uses the live
 * equipment library instead, so the seeded principal matches what the Capital
 * page showed on the day it ran.
 */
export function codeSeedLoans(): LoanDef[] {
  const equipment = equipmentSeed
    .filter((l) => l.status === 'in_service' || l.status === 'planned')
    .reduce((s, l) => s + l.qty * l.unitCostNew * (l.newUsed === 'Used' ? equipmentPurchase.usedDiscount : 1), 0);
  const leasehold = leaseholdSeed.filter((l) => l.counted).reduce((s, l) => s + l.extended, 0);
  return seedLoans({ equipmentCents: Math.round(equipment * 100), leaseholdCents: Math.round(leasehold * 100) });
}
