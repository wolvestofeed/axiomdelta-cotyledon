-- 0063_muse_staff_email.sql
-- Impact OS — the staff register carries each person's sign-in email (Roadmap O5).
--
-- A person on the register whose email matches their sign-in, and who is active,
-- holds the operator role and sees their own record on HR (Robert, 2026-09-15).
-- Stored lowercased; one person per email. Additive.

ALTER TABLE muse.staff ADD COLUMN IF NOT EXISTS email text;

CREATE UNIQUE INDEX IF NOT EXISTS muse_staff_email_uniq ON muse.staff (email) WHERE email IS NOT NULL;
