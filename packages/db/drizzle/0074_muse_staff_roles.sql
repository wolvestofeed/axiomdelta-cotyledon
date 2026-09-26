-- 0074_muse_staff_roles.sql
-- Impact OS — work roles on the staff register, and the role each punch was worked in
-- (Roadmap P2).
--
-- Decisions (Robert, 2026-09-16):
--   * Staff may hold more than one role at any time. The work roles are operator
--     (production and dispatch — the Floor) and sales (the Sales portal). Admin is a
--     sign-in list, not a work role.
--   * Muse reports the hours worked by role; payroll does the rest. No class code is
--     held here.
--
-- `staff.roles` is the set a person may clock in under; every existing person keeps
-- operator. `time_punches.role` is the role of the shift the punch belongs to, taken
-- at clock-in; a punch written before this reads as operator.
--
-- Additive only.

ALTER TABLE muse.staff ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{operator}';
ALTER TABLE muse.time_punches ADD COLUMN IF NOT EXISTS role text;
