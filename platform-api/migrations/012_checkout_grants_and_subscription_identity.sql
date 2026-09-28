-- Checkout sessions must survive deploys and bridge a public solo purchase to invite registration.
CREATE TABLE IF NOT EXISTS checkout_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_checkout_id text NOT NULL,
  provider_customer_id text,
  provider_subscription_id text,
  provider_payment_id text,
  email text NOT NULL,
  plan_code text NOT NULL REFERENCES billing_plans(code),
  amount_cents integer NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','claimed','failed','canceled','expired')),
  invite_id uuid REFERENCES invites(id) ON DELETE SET NULL,
  completed_at timestamptz,
  claimed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS checkout_grants_provider_checkout_unique
  ON checkout_grants(provider,provider_checkout_id);
CREATE INDEX IF NOT EXISTS checkout_grants_email_idx ON checkout_grants(lower(email),created_at DESC);
CREATE INDEX IF NOT EXISTS checkout_grants_status_idx ON checkout_grants(status,created_at DESC);

-- A provider subscription id identifies one live provider subscription. This makes webhook
-- retries idempotent without preventing a customer from buying a different plan later.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_subscription_unique
  ON subscriptions(provider,provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

-- Entitlement keys are unique while active; renewed subscriptions update the existing grant.
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_active_subject_key_unique
  ON entitlements(subject_type,subject_id,key)
  WHERE ends_at IS NULL;
