-- VARANGYM commercial model. Prices are stored in minor currency units (USD cents).
-- Provider-specific ids remain nullable until a payment provider is configured.

CREATE TABLE IF NOT EXISTS billing_plans (
  code text PRIMARY KEY,
  audience text NOT NULL CHECK (audience IN ('solo','trainer','organization')),
  billing_kind text NOT NULL CHECK (billing_kind IN ('recurring','lifetime')),
  interval_unit text CHECK (interval_unit IN ('month','year') OR interval_unit IS NULL),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  trainer_limit integer CHECK (trainer_limit IS NULL OR trainer_limit >= 0),
  client_limit integer CHECK (client_limit IS NULL OR client_limit >= 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO billing_plans(code,audience,billing_kind,interval_unit,price_cents,currency,trainer_limit,client_limit,sort_order,metadata)
VALUES
  ('solo_monthly','solo','recurring','month',200,'USD',NULL,1,10,'{"label":"Solo Monthly"}'::jsonb),
  ('solo_lifetime','solo','lifetime',NULL,3000,'USD',NULL,1,20,'{"label":"Solo Lifetime"}'::jsonb),
  ('coach_5','trainer','recurring','month',500,'USD',1,5,30,'{"label":"Coach 5"}'::jsonb),
  ('coach_10','trainer','recurring','month',1000,'USD',1,10,40,'{"label":"Coach 10"}'::jsonb),
  ('coach_20','trainer','recurring','month',2000,'USD',1,20,50,'{"label":"Coach 20"}'::jsonb),
  ('business_5_50','organization','recurring','month',5000,'USD',5,50,60,'{"label":"Business 5 / 50","extraTrainerCents":1000,"clientsPerExtraTrainer":10}'::jsonb),
  ('business_10_100','organization','recurring','month',10000,'USD',10,100,70,'{"label":"Business 10 / 100","extraTrainerCents":1000,"clientsPerExtraTrainer":10}'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  audience=EXCLUDED.audience,
  billing_kind=EXCLUDED.billing_kind,
  interval_unit=EXCLUDED.interval_unit,
  price_cents=EXCLUDED.price_cents,
  currency=EXCLUDED.currency,
  trainer_limit=EXCLUDED.trainer_limit,
  client_limit=EXCLUDED.client_limit,
  sort_order=EXCLUDED.sort_order,
  metadata=EXCLUDED.metadata,
  updated_at=now();

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_price_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_payment_id text,
  provider_checkout_id text,
  subject_type text NOT NULL CHECK (subject_type IN ('user','workspace')),
  subject_id uuid NOT NULL,
  plan_code text REFERENCES billing_plans(code),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL CHECK (status IN ('pending','paid','failed','refunded','partially_refunded','canceled')),
  paid_at timestamptz,
  refunded_cents integer NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_id_unique
  ON payments(provider,provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_subject_idx ON payments(subject_type,subject_id,created_at DESC);
CREATE INDEX IF NOT EXISTS payments_paid_idx ON payments(paid_at DESC) WHERE status='paid';

CREATE TABLE IF NOT EXISTS billing_events (
  id bigserial PRIMARY KEY,
  provider text NOT NULL,
  provider_event_id text,
  event_type text NOT NULL,
  subject_type text CHECK (subject_type IN ('user','workspace') OR subject_type IS NULL),
  subject_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_events_provider_unique
  ON billing_events(provider,provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS billing_events_created_idx ON billing_events(created_at DESC);

-- Store the commercial source of a direct/coach/business account separately from workspace role.
CREATE TABLE IF NOT EXISTS billing_subject_settings (
  subject_type text NOT NULL CHECK (subject_type IN ('user','workspace')),
  subject_id uuid NOT NULL,
  plan_code text REFERENCES billing_plans(code),
  lifetime_access boolean NOT NULL DEFAULT false,
  extra_trainers integer NOT NULL DEFAULT 0 CHECK (extra_trainers >= 0),
  billing_email text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(subject_type,subject_id)
);

-- Daily aggregates remain derived from source tables. This view is deliberately simple enough
-- to query live for the first dashboards; rollups can be materialized later when traffic grows.
CREATE OR REPLACE VIEW varangym_daily_activity AS
SELECT day,
       count(DISTINCT user_id)::int AS active_users,
       count(*)::int AS workouts,
       COALESCE(sum(completed_sets),0)::bigint AS completed_sets
FROM (
  SELECT date_trunc('day', w.started_at)::date AS day,
         w.user_id,
         w.id,
         (SELECT count(*) FROM workout_sets ws
            JOIN workout_exercises we ON we.id=ws.workout_exercise_id
           WHERE we.workout_id=w.id AND ws.done=true) AS completed_sets
    FROM workouts w
) x
GROUP BY day;
