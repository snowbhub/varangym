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
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','canceled','claimed')),
  invite_id uuid REFERENCES invites(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  claimed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS checkout_grants_provider_checkout_unique ON checkout_grants(provider,provider_checkout_id);
CREATE INDEX IF NOT EXISTS checkout_grants_email_idx ON checkout_grants(lower(email),created_at DESC);
CREATE INDEX IF NOT EXISTS checkout_grants_status_idx ON checkout_grants(status,created_at DESC);
