-- The original openGym client polls /api/data/rev. Publishing a coach program inserts a new
-- active assignment, so bump the client's profile revision and let the existing sync mechanism
-- pull the newly projected VARANGYM routines/week without replacing the workout UI.
CREATE OR REPLACE FUNCTION varangym_program_assignment_bump_profile_rev()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_profile_states(user_id,state,rev,updated_at)
  VALUES (NEW.client_user_id, '{"lang":"ru"}'::jsonb, 1, now())
  ON CONFLICT (user_id) DO UPDATE
    SET rev = user_profile_states.rev + 1,
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS varangym_program_assignment_sync_rev ON program_assignments;
CREATE TRIGGER varangym_program_assignment_sync_rev
AFTER INSERT ON program_assignments
FOR EACH ROW
WHEN (NEW.active = true)
EXECUTE FUNCTION varangym_program_assignment_bump_profile_rev();
