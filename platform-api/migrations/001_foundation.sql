CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  email text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','pending_delete')),
  locale text NOT NULL DEFAULT 'en',
  is_platform_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_ci
  ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_credentials (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_credentials_user_idx ON auth_credentials(user_id);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('register','login')),
  challenge text NOT NULL,
  provisional_user_id uuid,
  invite_id uuid,
  display_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_challenges_expires_idx ON auth_challenges(expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_hint text
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('platform_direct','independent_trainer','organization')),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO workspaces(id,type,name,slug,status)
VALUES ('00000000-0000-0000-0000-000000000001','platform_direct','VARANGYM Direct','platform-direct','active')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS workspace_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','trainer','client')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended','left')),
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_membership_active_unique
  ON workspace_memberships(workspace_id,user_id,role)
  WHERE status='active' AND ended_at IS NULL;
CREATE INDEX IF NOT EXISTS workspace_memberships_user_idx ON workspace_memberships(user_id);

CREATE TABLE IF NOT EXISTS organization_profiles (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  legal_name text,
  default_locale text NOT NULL DEFAULT 'en',
  timezone text NOT NULL DEFAULT 'Europe/Berlin',
  billing_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  timezone text NOT NULL DEFAULT 'Europe/Berlin',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS locations_workspace_idx ON locations(workspace_id);

CREATE TABLE IF NOT EXISTS trainer_client_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  trainer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship_type text NOT NULL DEFAULT 'primary' CHECK (relationship_type IN ('primary','secondary','rehab','other')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CHECK (trainer_user_id <> client_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS trainer_client_primary_unique
  ON trainer_client_links(workspace_id,client_user_id)
  WHERE relationship_type='primary' AND status='active';
CREATE INDEX IF NOT EXISTS trainer_client_trainer_idx ON trainer_client_links(trainer_user_id,status);
CREATE INDEX IF NOT EXISTS trainer_client_client_idx ON trainer_client_links(client_user_id,status);

CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  target_role text NOT NULL CHECK (target_role IN ('platform_admin','organization_owner','organization_admin','independent_trainer','trainer','client','solo_client')),
  trainer_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  email text,
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invites_workspace_idx ON invites(workspace_id);
CREATE INDEX IF NOT EXISTS invites_creator_idx ON invites(created_by_user_id);
CREATE INDEX IF NOT EXISTS invites_expires_idx ON invites(expires_at);

ALTER TABLE auth_challenges
  ADD CONSTRAINT auth_challenges_invite_fk
  FOREIGN KEY (invite_id) REFERENCES invites(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS invite_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES invites(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invite_redemptions_invite_idx ON invite_redemptions(invite_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('user','workspace')),
  subject_id uuid NOT NULL,
  provider text NOT NULL,
  provider_customer_id text,
  provider_subscription_id text,
  plan_code text NOT NULL,
  status text NOT NULL,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_subject_idx ON subscriptions(subject_type,subject_id);

CREATE TABLE IF NOT EXISTS entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('user','workspace')),
  subject_id uuid NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  source_subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz
);
CREATE INDEX IF NOT EXISTS entitlements_subject_idx ON entitlements(subject_type,subject_id,key);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events(actor_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_workspace_idx ON audit_events(workspace_id,created_at DESC);
