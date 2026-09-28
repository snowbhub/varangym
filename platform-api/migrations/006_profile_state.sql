CREATE TABLE IF NOT EXISTS user_profile_states (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state jsonb,
  rev bigint NOT NULL DEFAULT 0 CHECK (rev >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_profile_states_updated_idx
  ON user_profile_states(updated_at DESC);
