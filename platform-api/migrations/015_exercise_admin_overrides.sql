-- Platform-admin corrections that survive upstream ExerciseDB reseeding.
CREATE TABLE IF NOT EXISTS exercise_admin_overrides (
  exercise_id uuid PRIMARY KEY REFERENCES exercises(id) ON DELETE CASCADE,
  active boolean,
  equipment_key text,
  primary_muscle_key text,
  body_part text,
  image text,
  gif text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exercise_admin_translations (
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  locale text NOT NULL,
  name text,
  description text,
  instructions jsonb,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(exercise_id,locale)
);

CREATE INDEX IF NOT EXISTS exercise_admin_translation_name_idx
  ON exercise_admin_translations(locale,lower(name)) WHERE name IS NOT NULL;

-- Any later ExerciseDB seed/update must respect admin policy rather than silently turning a
-- hidden exercise back on or reverting its media/classification.
CREATE OR REPLACE FUNCTION varangym_apply_exercise_override()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ov exercise_admin_overrides%ROWTYPE;
BEGIN
  IF NEW.owner_scope <> 'platform' THEN RETURN NEW; END IF;
  SELECT * INTO ov FROM exercise_admin_overrides WHERE exercise_id=NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF ov.active IS NOT NULL THEN NEW.active := ov.active; END IF;
  IF ov.equipment_key IS NOT NULL THEN NEW.equipment_key := ov.equipment_key; END IF;
  IF ov.primary_muscle_key IS NOT NULL THEN NEW.primary_muscle_key := ov.primary_muscle_key; END IF;
  IF ov.body_part IS NOT NULL THEN NEW.metadata := jsonb_set(COALESCE(NEW.metadata,'{}'::jsonb),'{bodyPart}',to_jsonb(ov.body_part),true); END IF;
  IF ov.image IS NOT NULL THEN NEW.metadata := jsonb_set(COALESCE(NEW.metadata,'{}'::jsonb),'{image}',to_jsonb(ov.image),true); END IF;
  IF ov.gif IS NOT NULL THEN NEW.metadata := jsonb_set(COALESCE(NEW.metadata,'{}'::jsonb),'{gif}',to_jsonb(ov.gif),true); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_varangym_apply_exercise_override ON exercises;
CREATE TRIGGER trg_varangym_apply_exercise_override
BEFORE INSERT OR UPDATE ON exercises
FOR EACH ROW EXECUTE FUNCTION varangym_apply_exercise_override();

-- Saving an admin override becomes effective immediately for every existing API that reads the
-- canonical exercises table. The BEFORE trigger above then protects it on later reseeds.
CREATE OR REPLACE FUNCTION varangym_sync_exercise_override()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE exercises SET
    active=COALESCE(NEW.active,active),
    equipment_key=COALESCE(NEW.equipment_key,equipment_key),
    primary_muscle_key=COALESCE(NEW.primary_muscle_key,primary_muscle_key),
    metadata=CASE WHEN NEW.body_part IS NULL THEN metadata ELSE jsonb_set(COALESCE(metadata,'{}'::jsonb),'{bodyPart}',to_jsonb(NEW.body_part),true) END
      || CASE WHEN NEW.image IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('image',NEW.image) END
      || CASE WHEN NEW.gif IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('gif',NEW.gif) END
  WHERE id=NEW.exercise_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_varangym_sync_exercise_override ON exercise_admin_overrides;
CREATE TRIGGER trg_varangym_sync_exercise_override
AFTER INSERT OR UPDATE ON exercise_admin_overrides
FOR EACH ROW EXECUTE FUNCTION varangym_sync_exercise_override();

-- Same mechanism for names/descriptions/instructions. Admin translations are the durable source;
-- exercise_translations remains the compatibility surface used by the existing training APIs.
CREATE OR REPLACE FUNCTION varangym_apply_translation_override()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ov exercise_admin_translations%ROWTYPE;
BEGIN
  SELECT * INTO ov FROM exercise_admin_translations WHERE exercise_id=NEW.exercise_id AND locale=NEW.locale;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF ov.name IS NOT NULL THEN NEW.name := ov.name; END IF;
  IF ov.description IS NOT NULL THEN NEW.description := ov.description; END IF;
  IF ov.instructions IS NOT NULL THEN NEW.instructions := ov.instructions; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_varangym_apply_translation_override ON exercise_translations;
CREATE TRIGGER trg_varangym_apply_translation_override
BEFORE INSERT OR UPDATE ON exercise_translations
FOR EACH ROW EXECUTE FUNCTION varangym_apply_translation_override();

CREATE OR REPLACE FUNCTION varangym_sync_translation_override()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO exercise_translations(exercise_id,locale,name,description,instructions)
  VALUES(NEW.exercise_id,NEW.locale,COALESCE(NEW.name,'Exercise'),NEW.description,COALESCE(NEW.instructions,'[]'::jsonb))
  ON CONFLICT(exercise_id,locale) DO UPDATE SET
    name=COALESCE(NEW.name,exercise_translations.name),
    description=COALESCE(NEW.description,exercise_translations.description),
    instructions=COALESCE(NEW.instructions,exercise_translations.instructions);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_varangym_sync_translation_override ON exercise_admin_translations;
CREATE TRIGGER trg_varangym_sync_translation_override
AFTER INSERT OR UPDATE ON exercise_admin_translations
FOR EACH ROW EXECUTE FUNCTION varangym_sync_translation_override();
