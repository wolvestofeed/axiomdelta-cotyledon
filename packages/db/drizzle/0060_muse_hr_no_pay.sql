-- 0060_muse_hr_no_pay.sql
-- Impact OS — pay out of Muse (Roadmap Phase O, step O1).
--
-- Decisions (Robert, 2026-09-14): no pay or confidential employee information is
-- held in Muse. CompTable holds wages, burden and benefits, closes each pay period
-- and sends its totals by account; the clock times taken on the Floor go to
-- CompTable. Admins view individual pay in Muse read from CompTable, never stored.
--
--   * staff.comptable_employee_ref — the person's employee reference in CompTable.
--   * payroll_periods              — closed pay periods received from CompTable:
--                                    totals by account and hours, never an
--                                    individual's pay. The ledger accrues and
--                                    pays payroll from these.
--
-- Additive only. The staff wage and salary columns (hourly_wage_cents,
-- annual_salary_cents, pay_type) are no longer read or written by the code;
-- dropping them is a separate migration held for approval.

CREATE SCHEMA IF NOT EXISTS muse;

ALTER TABLE muse.staff ADD COLUMN IF NOT EXISTS comptable_employee_ref text;

CREATE TABLE IF NOT EXISTS muse.payroll_periods (
  id                   uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CompTable's reference for the closed period; one row per closed period.
  comptable_ref        text              NOT NULL UNIQUE,
  period_start         date              NOT NULL,
  period_end           date              NOT NULL,
  pay_date             date              NOT NULL,
  wages_cents          integer           NOT NULL,
  payroll_taxes_cents  integer           NOT NULL,
  workers_comp_cents   integer           NOT NULL,
  benefits_cents       integer           NOT NULL,
  regular_hours        double precision  NOT NULL DEFAULT 0,
  overtime_hours       double precision  NOT NULL DEFAULT 0,
  received_at          timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT muse_payroll_periods_dates CHECK (period_end >= period_start AND pay_date >= period_end),
  CONSTRAINT muse_payroll_periods_cents CHECK (wages_cents >= 0 AND payroll_taxes_cents >= 0 AND workers_comp_cents >= 0 AND benefits_cents >= 0)
);
CREATE INDEX IF NOT EXISTS muse_payroll_periods_pay_date_idx ON muse.payroll_periods (pay_date);
