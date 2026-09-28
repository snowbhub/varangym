-- Until the full Ukrainian exercise/UI locale ships, VARANGYM starts new workout profiles in Russian.
-- The user can switch to any other locale supported by the original workout client in Settings.
INSERT INTO user_profile_states(user_id,state,rev)
SELECT u.id, '{"lang":"ru"}'::jsonb, 0
  FROM users u
  LEFT JOIN user_profile_states s ON s.user_id=u.id
 WHERE s.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION varangym_init_profile_state()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_profile_states(user_id,state,rev)
  VALUES (NEW.id, '{"lang":"ru"}'::jsonb, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS varangym_user_profile_state_init ON users;
CREATE TRIGGER varangym_user_profile_state_init
AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION varangym_init_profile_state();
