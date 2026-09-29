-- Registration consumes an invite before inserting the user, so the generic redemption helper
-- cannot insert invite_redemptions at that moment because of the user FK. For self-service trial
-- invites, link the freshly-created account to its consumed email-bound trial invite immediately.
CREATE OR REPLACE FUNCTION varangym_link_trial_invite_on_user_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_invite uuid;
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT i.id INTO v_invite
    FROM invites i
   WHERE lower(i.email)=lower(NEW.email)
     AND COALESCE((i.metadata->>'trial')::boolean,false)=true
     AND i.use_count > 0
     AND i.revoked_at IS NULL
     AND i.created_at >= now()-interval '2 days'
   ORDER BY i.created_at DESC
   LIMIT 1;

  IF v_invite IS NOT NULL THEN
    INSERT INTO invite_redemptions(invite_id,user_id)
    SELECT v_invite,NEW.id
    WHERE NOT EXISTS (
      SELECT 1 FROM invite_redemptions r
       WHERE r.invite_id=v_invite AND r.user_id=NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS varangym_link_trial_invite_after_user_insert ON users;
CREATE TRIGGER varangym_link_trial_invite_after_user_insert
AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION varangym_link_trial_invite_on_user_insert();
