-- 0062_muse_staff_drop_pay.sql
-- Impact OS — drop the pay columns from the staff register
-- (Roadmap Phase O, step O1). Approved by Robert, 2026-09-15.
--
-- No pay is held in Muse: CompTable holds wages, burden and benefits. Since
-- 0060 the code no longer reads or writes these columns, and the table held no
-- rows when this was written.

ALTER TABLE muse.staff DROP COLUMN IF EXISTS pay_type;
ALTER TABLE muse.staff DROP COLUMN IF EXISTS hourly_wage_cents;
ALTER TABLE muse.staff DROP COLUMN IF EXISTS annual_salary_cents;
