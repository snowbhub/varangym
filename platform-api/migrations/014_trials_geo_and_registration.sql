-- Self-service onboarding and admin location diagnostics.
-- Geo fields are best-effort hints from trusted reverse-proxy headers; the raw IP hint remains
-- the canonical network datum and may be null depending on the deployment.

ALTER TABLE auth_challenges
  ADD COLUMN IF NOT EXISTS registration_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS city text;

CREATE INDEX IF NOT EXISTS sessions_last_seen_idx ON sessions(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_trial_idx ON subscriptions(status,trial_ends_at)
  WHERE status='trialing';
