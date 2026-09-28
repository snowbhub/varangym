-- Ukrainian now ships as a first-class VARANGYM UI locale. Keep existing users' selected
-- language untouched; only new accounts get Ukrainian by default unless registration supplies
-- another supported locale.
CREATE OR REPLACE FUNCTION varangym_init_profile_state()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  initial_lang text;
BEGIN
  initial_lang := CASE
    WHEN NEW.locale IN ('uk','ru','de','de-CH','en','es','fr','it','pt','pt-BR','pl','tr','zh','ko','hi','th','hu')
      THEN NEW.locale
    ELSE 'uk'
  END;
  INSERT INTO user_profile_states(user_id,state,rev)
  VALUES (NEW.id, jsonb_build_object('lang',initial_lang), 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS varangym_user_profile_state_init ON users;
CREATE TRIGGER varangym_user_profile_state_init
AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION varangym_init_profile_state();
