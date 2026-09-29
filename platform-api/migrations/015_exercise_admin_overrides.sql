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
