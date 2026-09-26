/**
 * MicroFarm — working capital reference data (Roadmap Phase K).
 *
 * Payment terms, the opening position and the payroll calendar. Every figure is
 * tagged; the decisions are Robert's (2026-09-14) unless tagged PLACEHOLDER.
 * The terms reference in words is `docs/farm/accounting-policy.md` §16.
 */

import { tagged } from './tagged';

// ── Payment terms ───────────────────────────────────────────────────────────

export type PaymentTerms = 'due_on_receipt' | 'net_15' | 'net_30' | 'net_60' | 'net_90';
export type SubscriberPaymentTerms = Extract<PaymentTerms, 'due_on_receipt' | 'net_15' | 'net_30'>;

/** The terms a supplier can carry. No default. */
export const SUPPLIER_PAYMENT_TERMS: readonly PaymentTerms[] = ['due_on_receipt', 'net_15', 'net_30', 'net_60', 'net_90'];

/** The terms a subscriber can carry. No default. */
export const SUBSCRIBER_PAYMENT_TERMS: readonly SubscriberPaymentTerms[] = ['due_on_receipt', 'net_15', 'net_30'];

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
export const isSubscriberPaymentTerms = (v: unknown): v is SubscriberPaymentTerms => typeof v === 'string' && (SUBSCRIBER_PAYMENT_TERMS as readonly string[]).includes(v);

// ── Channels and how they pay ───────────────────────────────────────────────

/**
 * Subscriptions and Restaurants are invoiced once a month, each
 * completed distribution route added to the subscriber's invoice as it finishes.
 */
export const INVOICED_CHANNELS: readonly number[] = [1, 2];

/** Retail and wholesale: paid by the subscriber at the time of ordering; never invoiced. */
export const PAID_AT_ORDER_CHANNELS: readonly number[] = [3];

// ── Opening position ────────────────────────────────────────────────────────

export const openingPosition = {
  ownerEquity: tagged(200_000, 'STATED', '$', "Opening owners' equity"),
  loanStartDate: tagged('2027-01-01', 'STATED', 'date', 'The equipment and leasehold loans start'),
};

/** The fiscal year the forecast statements are drawn on: the year the loans start. */
export const FORECAST_FISCAL_YEAR = 2027;

// ── Payroll calendar ────────────────────────────────────────────────────────

export const payrollCalendar = {
  periodDays: tagged(14, 'STATED', 'days', 'Biweekly, 26 pay periods: Monday through the second Sunday'),
  payLagDays: tagged(5, 'STATED', 'days', 'Paid the Friday five days after the period ends'),
  firstPeriodStart: tagged(
    '2027-01-04',
    'PLACEHOLDER',
    'date',
    'The Monday the pay-period sequence counts from. Not stated; the first Monday of the forecast year is carried.',
  ),
};

/** Where the farm is: a punch's work date is its local date here. */
export const FARM_TIME_ZONE = 'America/Chicago';
