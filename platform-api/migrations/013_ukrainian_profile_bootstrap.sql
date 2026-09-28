-- Every newly created VARANGYM account gets a PostgreSQL profile row immediately.
-- This removes the old server fallback path for brand-new users and makes Ukrainian the
-- platform default while preserving any language already chosen by existing profiles.

CREATE OR REPLACE FUNCTION varangym_create_profile_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO user_profile_states(user_id,state,rev,updated_at)
  VALUES (NEW.id, jsonb_build_object('lang','uk'), 0, now())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_varangym_create_profile_state ON users;
CREATE TRIGGER trg_varangym_create_profile_state
AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION varangym_create_profile_state();

-- Existing accounts that have never written any profile data also receive the Ukrainian
-- bootstrap state. Profiles with actual state are left exactly as they are.
INSERT INTO user_profile_states(user_id,state,rev,updated_at)
SELECT u.id, jsonb_build_object('lang','uk'), 0, now()
FROM users u
LEFT JOIN user_profile_states s ON s.user_id=u.id
WHERE s.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;
