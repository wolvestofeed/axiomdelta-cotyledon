/**
 * Impact OS — working capital reference data (Roadmap Phase K).
 *
 * Payment terms, the opening position and the payroll calendar. Every figure is
 * tagged; the decisions are Robert's (2026-09-14) unless tagged PLACEHOLDER.
 * The terms reference in words is `docs/muse/accounting-policy.md` §16.
 */

import { tagged } from './tagged';

// ── Payment terms ───────────────────────────────────────────────────────────

export type PaymentTerms = 'due_on_receipt' | 'net_15' | 'net_30' | 'net_60' | 'net_90';
export type CustomerPaymentTerms = Extract<PaymentTerms, 'due_on_receipt' | 'net_15' | 'net_30'>;

/** The terms a supplier can carry (Robert, 2026-09-14). No default. */
export const SUPPLIER_PAYMENT_TERMS: readonly PaymentTerms[] = ['due_on_receipt', 'net_15', 'net_30', 'net_60', 'net_90'];

/** The terms a customer can carry (Robert, 2026-09-14). No default. */
export const CUSTOMER_PAYMENT_TERMS: readonly CustomerPaymentTerms[] = ['due_on_receipt', 'net_15', 'net_30'];

export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  due_on_receipt: 'Due on Receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_60: 'Net 60',
  net_90: 'Net 90',
};

/** Calendar days from the document date to the due date. */
export const PAYMENT_TERMS_DAYS: Record<PaymentTerms, number> = {
  due_on_receipt: 0,
  net_15: 15,
  net_30: 30,
  net_60: 60,
  net_90: 90,
};

export const isPaymentTerms = (v: unknown): v is PaymentTerms => typeof v === 'string' && (SUPPLIER_PAYMENT_TERMS as readonly string[]).includes(v);
export const isCustomerPaymentTerms = (v: unknown): v is CustomerPaymentTerms => typeof v === 'string' && (CUSTOMER_PAYMENT_TERMS as readonly string[]).includes(v);

// ── Channels and how they pay ───────────────────────────────────────────────

/**
 * School lunches and Corporate catering are invoiced once a month, each
 * completed delivery route added to the customer's invoice as it finishes.
 */
export const INVOICED_CHANNELS: readonly number[] = [1, 2];

/** Ghost kitchen: paid by the customer at the time of ordering; never invoiced. */
export const PAID_AT_ORDER_CHANNELS: readonly number[] = [3];

// ── Opening position ────────────────────────────────────────────────────────

export const openingPosition = {
  ownerEquity: tagged(200_000, 'STATED', '$', "Opening owners' equity (Robert, 2026-09-14)"),
  loanStartDate: tagged('2027-01-01', 'STATED', 'date', 'The equipment and leasehold loans start (Robert, 2026-09-14)'),
};

/** The fiscal year the forecast statements are drawn on: the year the loans start (Robert, 2026-09-14). */
export const FORECAST_FISCAL_YEAR = 2027;

// ── Payroll calendar ────────────────────────────────────────────────────────

export const payrollCalendar = {
  periodDays: tagged(14, 'STATED', 'days', 'Biweekly, 26 pay periods: Monday through the second Sunday (Robert, 2026-09-14)'),
  payLagDays: tagged(5, 'STATED', 'days', 'Paid the Friday five days after the period ends (Robert, 2026-09-14)'),
  firstPeriodStart: tagged(
    '2027-01-04',
    'PLACEHOLDER',
    'date',
    'The Monday the pay-period sequence counts from. Not stated; the first Monday of the forecast year is carried.',
  ),
};

/** Where the kitchen is: a punch's work date is its local date here. */
export const KITCHEN_TIME_ZONE = 'America/Chicago';
