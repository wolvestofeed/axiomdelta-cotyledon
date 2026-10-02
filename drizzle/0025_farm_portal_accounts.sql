-- Cotyledon: the Client Portal's account linking (Roadmap P5) and flat plan requests.
--
-- A subscriber record carries the sign-in email of its client. farm.portal_emails is the index of
-- those emails across every farm, kept by a trigger: one email, one record. At sign-in with no
-- organization active, the app reads the index and links the Clerk account to the one record whose
-- email it is (farm.portal_accounts): one sign-in per account, one account per record. Both tables
-- are read before any workspace is in scope, like farm.workspaces, so they carry no policy and hold
-- ids and the email only. A flat plan change a client asks for is a request, reviewed by staff.

ALTER TABLE farm.subscribers ADD COLUMN IF NOT EXISTS email text;
CREATE UNIQUE INDEX IF NOT EXISTS farm_subscribers_email_idx ON farm.subscribers (workspace_id, email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS farm.portal_emails (
  email          text  PRIMARY KEY,
  workspace_id   uuid  NOT NULL REFERENCES farm.workspaces (id) ON DELETE CASCADE,
  subscriber_id  uuid  NOT NULL UNIQUE REFERENCES farm.subscribers (id) ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION farm.sync_portal_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM farm.portal_emails WHERE subscriber_id = OLD.id;
    RETURN OLD;
  END IF;
  DELETE FROM farm.portal_emails WHERE subscriber_id = NEW.id;
  IF NEW.email IS NOT NULL AND NEW.status NOT IN ('inactive', 'forecast') THEN
    INSERT INTO farm.portal_emails (email, workspace_id, subscriber_id)
    VALUES (lower(NEW.email), NEW.workspace_id, NEW.id)
    ON CONFLICT (email) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS farm_subscribers_portal_email ON farm.subscribers;
CREATE TRIGGER farm_subscribers_portal_email
  AFTER INSERT OR UPDATE OF email, status OR DELETE ON farm.subscribers
  FOR EACH ROW EXECUTE FUNCTION farm.sync_portal_email();

CREATE TABLE IF NOT EXISTS farm.portal_accounts (
  clerk_user_id  text         PRIMARY KEY,
  workspace_id   uuid         NOT NULL REFERENCES farm.workspaces (id) ON DELETE CASCADE,
  subscriber_id  uuid         NOT NULL UNIQUE REFERENCES farm.subscribers (id) ON DELETE CASCADE,
  email          text         NOT NULL,
  linked_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS farm.flat_plan_requests (
  workspace_id     uuid         NOT NULL DEFAULT farm.current_workspace_id() REFERENCES farm.workspaces (id) ON DELETE CASCADE,
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid         NOT NULL REFERENCES farm.subscriptions (id) ON DELETE CASCADE,
  subscriber_id    uuid         NOT NULL REFERENCES farm.subscribers (id) ON DELETE CASCADE,
  -- FlatPlanLine[]: the lines the client asks each distribution to carry.
  lines            jsonb        NOT NULL DEFAULT '[]',
  note             text,
  -- 'pending' | 'approved' | 'declined' | 'withdrawn'
  status           text         NOT NULL DEFAULT 'pending',
  requested_by     text,
  requested_at     timestamptz  NOT NULL DEFAULT now(),
  decided_by       text,
  decided_at       timestamptz,
  decision_note    text,
  -- Set on approval: the first distribution the new lines are sown for.
  effective_from   date
);
CREATE INDEX IF NOT EXISTS farm_flat_plan_requests_workspace_idx ON farm.flat_plan_requests (workspace_id);
CREATE INDEX IF NOT EXISTS farm_flat_plan_requests_status_idx ON farm.flat_plan_requests (status, requested_at);
ALTER TABLE farm.flat_plan_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm.flat_plan_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS farm_flat_plan_requests_workspace ON farm.flat_plan_requests;
CREATE POLICY farm_flat_plan_requests_workspace ON farm.flat_plan_requests
  USING (workspace_id = farm.current_workspace_id()) WITH CHECK (workspace_id = farm.current_workspace_id());
