CREATE TABLE IF NOT EXISTS exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_key text,
  owner_scope text NOT NULL DEFAULT 'platform' CHECK (owner_scope IN ('platform','organization','trainer','user')),
  owner_workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  source_exercise_id uuid REFERENCES exercises(id) ON DELETE SET NULL,
  tracking_mode text NOT NULL DEFAULT 'reps_weight' CHECK (tracking_mode IN ('reps_weight','bodyweight','time','distance','cardio','other')),
  equipment_key text,
  primary_muscle_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (owner_scope='platform' AND owner_workspace_id IS NULL AND owner_user_id IS NULL)
    OR owner_scope <> 'platform'
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS exercises_legacy_key_unique ON exercises(legacy_key) WHERE legacy_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS exercises_owner_idx ON exercises(owner_scope,owner_workspace_id,owner_user_id);

CREATE TABLE IF NOT EXISTS exercise_translations (
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  locale text NOT NULL,
  name text NOT NULL,
  description text,
  instructions jsonb,
  PRIMARY KEY (exercise_id,locale)
);
CREATE INDEX IF NOT EXISTS exercise_translations_name_idx ON exercise_translations(locale,lower(name));

CREATE TABLE IF NOT EXISTS exercise_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('image','gif','video','thumbnail')),
  storage_key text NOT NULL,
  mime_type text,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exercise_media_exercise_idx ON exercise_media(exercise_id);

CREATE TABLE IF NOT EXISTS workspace_exercise_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  trainer_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'trainer_clients' CHECK (visibility IN ('private','trainer_clients','organization','public')),
  display_overrides jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_exercise_ref_unique
  ON workspace_exercise_refs(workspace_id,COALESCE(trainer_user_id,'00000000-0000-0000-0000-000000000000'::uuid),exercise_id);
CREATE INDEX IF NOT EXISTS workspace_exercise_refs_workspace_idx ON workspace_exercise_refs(workspace_id,trainer_user_id);

CREATE TABLE IF NOT EXISTS program_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('platform','organization','trainer')),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS program_templates_scope_idx ON program_templates(scope,workspace_id,owner_user_id);

CREATE TABLE IF NOT EXISTS programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trainer_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  source_template_id uuid REFERENCES program_templates(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS programs_client_idx ON programs(client_user_id,status);
CREATE INDEX IF NOT EXISTS programs_trainer_idx ON programs(trainer_user_id,status);

CREATE TABLE IF NOT EXISTS program_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')),
  published_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(program_id,version_number)
);
CREATE INDEX IF NOT EXISTS program_versions_program_idx ON program_versions(program_id,status,version_number DESC);

CREATE TABLE IF NOT EXISTS program_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_version_id uuid NOT NULL REFERENCES program_versions(id) ON DELETE CASCADE,
  weekday smallint CHECK (weekday BETWEEN 0 AND 6),
  sequence_index integer,
  title text,
  position integer NOT NULL DEFAULT 0,
  CHECK (weekday IS NOT NULL OR sequence_index IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS program_days_version_idx ON program_days(program_version_id,position);

CREATE TABLE IF NOT EXISTS program_day_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_day_id uuid NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  position integer NOT NULL DEFAULT 0,
  prescription jsonb NOT NULL DEFAULT '{}'::jsonb,
  coach_notes text
);
CREATE INDEX IF NOT EXISTS program_day_exercises_day_idx ON program_day_exercises(program_day_id,position);

CREATE TABLE IF NOT EXISTS program_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_version_id uuid NOT NULL REFERENCES program_versions(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS program_assignment_one_active
  ON program_assignments(client_user_id) WHERE active=true AND ends_at IS NULL;
CREATE INDEX IF NOT EXISTS program_assignments_client_idx ON program_assignments(client_user_id,starts_at DESC);

CREATE TABLE IF NOT EXISTS workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  program_version_id uuid REFERENCES program_versions(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  name text NOT NULL,
  source text NOT NULL DEFAULT 'freestyle' CHECK (source IN ('assigned','freestyle','imported')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workouts_user_idx ON workouts(user_id,started_at DESC);
CREATE INDEX IF NOT EXISTS workouts_workspace_idx ON workouts(workspace_id,started_at DESC);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id uuid REFERENCES exercises(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  snapshot_name text,
  prescription_snapshot jsonb
);
CREATE INDEX IF NOT EXISTS workout_exercises_workout_idx ON workout_exercises(workout_id,position);

CREATE TABLE IF NOT EXISTS workout_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id uuid NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  set_type text,
  phase text,
  weight numeric,
  reps integer,
  seconds integer,
  distance numeric,
  done boolean NOT NULL DEFAULT false,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS workout_sets_exercise_idx ON workout_sets(workout_exercise_id,position);

CREATE TABLE IF NOT EXISTS bodyweights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL,
  weight numeric NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bodyweights_user_idx ON bodyweights(user_id,measured_at DESC);

CREATE TABLE IF NOT EXISTS coach_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  trainer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  visibility text NOT NULL DEFAULT 'trainer_only' CHECK (visibility IN ('trainer_only','client_visible')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_notes_pair_idx ON coach_notes(trainer_user_id,client_user_id,created_at DESC);
