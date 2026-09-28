-- The original openGym React client is the athlete experience and stores completed workouts
-- and weigh-ins inside user_profile_states.state.  The VARANGYM coach/business surfaces use the
-- normalized training tables.  Keep those tables as a derived mirror so we do not build a second
-- workout UI just to feed coach analytics.

CREATE OR REPLACE FUNCTION varangym_sync_opengym_progress()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  workout jsonb;
  entry_rec record;
  set_rec record;
  bw jsonb;
  workout_id uuid;
  workout_exercise_id uuid;
  exercise_uuid uuid;
  snapshot_name text;
  started timestamptz;
  finished timestamptz;
  measured timestamptz;
  weight_value numeric;
  reps_value integer;
  seconds_value integer;
  distance_value numeric;
BEGIN
  -- A plan/version revision can bump the profile without changing personal progress.  Avoid
  -- rebuilding the mirror for that common path.
  IF TG_OP = 'UPDATE'
     AND NEW.state->'workouts' IS NOT DISTINCT FROM OLD.state->'workouts'
     AND NEW.state->'bodyweight' IS NOT DISTINCT FROM OLD.state->'bodyweight'
     AND NEW.state->'customEx' IS NOT DISTINCT FROM OLD.state->'customEx' THEN
    RETURN NEW;
  END IF;

  DELETE FROM workouts
   WHERE user_id = NEW.user_id
     AND metadata->>'source' = 'opengym-profile';

  IF jsonb_typeof(COALESCE(NEW.state->'workouts', '[]'::jsonb)) = 'array' THEN
    FOR workout IN
      SELECT value FROM jsonb_array_elements(COALESCE(NEW.state->'workouts', '[]'::jsonb))
    LOOP
      -- openGym ids are short strings, while the normalized table uses UUIDs.  A deterministic
      -- UUID makes the same saved workout stable across every profile sync.
      workout_id := (
        substr(md5(NEW.user_id::text || ':workout:' || COALESCE(workout->>'id', workout::text)), 1, 8) || '-' ||
        substr(md5(NEW.user_id::text || ':workout:' || COALESCE(workout->>'id', workout::text)), 9, 4) || '-' ||
        substr(md5(NEW.user_id::text || ':workout:' || COALESCE(workout->>'id', workout::text)), 13, 4) || '-' ||
        substr(md5(NEW.user_id::text || ':workout:' || COALESCE(workout->>'id', workout::text)), 17, 4) || '-' ||
        substr(md5(NEW.user_id::text || ':workout:' || COALESCE(workout->>'id', workout::text)), 21, 12)
      )::uuid;

      started := CASE
        WHEN COALESCE(workout->>'start','') ~ '^[0-9]+([.][0-9]+)?$'
          THEN to_timestamp((workout->>'start')::double precision / 1000.0)
        WHEN COALESCE(workout->>'d','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          THEN (workout->>'d')::date::timestamptz
        ELSE now()
      END;
      finished := CASE
        WHEN COALESCE(workout->>'end','') ~ '^[0-9]+([.][0-9]+)?$'
          THEN to_timestamp((workout->>'end')::double precision / 1000.0)
        ELSE NULL
      END;

      INSERT INTO workouts(id,user_id,workspace_id,program_version_id,started_at,finished_at,name,source,metadata)
      VALUES (
        workout_id, NEW.user_id, NULL, NULL, started, finished,
        COALESCE(NULLIF(workout->>'name',''), 'Workout'),
        'imported',
        jsonb_build_object(
          'source','opengym-profile',
          'opengymId',workout->>'id',
          'routineId',workout->>'routineId'
        )
      );

      IF jsonb_typeof(COALESCE(workout->'entries','[]'::jsonb)) = 'array' THEN
        FOR entry_rec IN
          SELECT value AS data, ordinality::integer AS pos
            FROM jsonb_array_elements(COALESCE(workout->'entries','[]'::jsonb)) WITH ORDINALITY
        LOOP
          exercise_uuid := NULL;
          snapshot_name := NULL;

          SELECT e.id INTO exercise_uuid
            FROM exercises e
           WHERE e.legacy_key = entry_rec.data->>'id'
           LIMIT 1;

          -- Trainer-created exercises projected into openGym use vgx-<exercise uuid>.
          IF exercise_uuid IS NULL
             AND COALESCE(entry_rec.data->>'id','') ~ '^vgx-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            SELECT e.id INTO exercise_uuid
              FROM exercises e
             WHERE e.id = substring(entry_rec.data->>'id' from 5)::uuid
             LIMIT 1;
          END IF;

          -- A personal openGym custom exercise has no row in VARANGYM's exercise table.  Keep
          -- its name as a snapshot so the coach still sees useful history.
          IF exercise_uuid IS NULL
             AND jsonb_typeof(COALESCE(NEW.state->'customEx','[]'::jsonb)) = 'array' THEN
            SELECT x->>'n' INTO snapshot_name
              FROM jsonb_array_elements(COALESCE(NEW.state->'customEx','[]'::jsonb)) AS x
             WHERE x->>'id' = entry_rec.data->>'id'
             LIMIT 1;
          END IF;

          INSERT INTO workout_exercises(workout_id,exercise_id,position,snapshot_name,prescription_snapshot)
          VALUES (workout_id, exercise_uuid, entry_rec.pos - 1, snapshot_name, '{}'::jsonb)
          RETURNING id INTO workout_exercise_id;

          IF jsonb_typeof(COALESCE(entry_rec.data->'sets','[]'::jsonb)) = 'array' THEN
            FOR set_rec IN
              SELECT value AS data, ordinality::integer AS pos
                FROM jsonb_array_elements(COALESCE(entry_rec.data->'sets','[]'::jsonb)) WITH ORDINALITY
            LOOP
              weight_value := CASE
                WHEN COALESCE(set_rec.data->>'w','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (set_rec.data->>'w')::numeric
                ELSE NULL
              END;
              reps_value := CASE
                WHEN COALESCE(set_rec.data->>'r','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN round((set_rec.data->>'r')::numeric)::integer
                ELSE NULL
              END;
              seconds_value := CASE
                WHEN COALESCE(set_rec.data->>'sec','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN round((set_rec.data->>'sec')::numeric)::integer
                ELSE NULL
              END;
              distance_value := CASE
                WHEN COALESCE(set_rec.data->>'dist','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (set_rec.data->>'dist')::numeric
                ELSE NULL
              END;

              INSERT INTO workout_sets(
                workout_exercise_id,position,set_type,phase,weight,reps,seconds,distance,done,details
              )
              VALUES (
                workout_exercise_id,
                set_rec.pos - 1,
                COALESCE(NULLIF(set_rec.data->>'type',''),'straight'),
                CASE WHEN COALESCE((set_rec.data->>'warmup')::boolean,false) THEN 'warmup' ELSE 'work' END,
                weight_value,
                reps_value,
                seconds_value,
                distance_value,
                COALESCE((set_rec.data->>'done')::boolean,false),
                set_rec.data
              );
            END LOOP;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  DELETE FROM bodyweights
   WHERE user_id = NEW.user_id
     AND source = 'opengym-profile';

  IF jsonb_typeof(COALESCE(NEW.state->'bodyweight', '[]'::jsonb)) = 'array' THEN
    FOR bw IN
      SELECT value FROM jsonb_array_elements(COALESCE(NEW.state->'bodyweight', '[]'::jsonb))
    LOOP
      IF COALESCE(bw->>'w','') !~ '^[0-9]+([.][0-9]+)?$' THEN
        CONTINUE;
      END IF;
      measured := CASE
        WHEN COALESCE(bw->>'t','') ~ '^[0-9]+([.][0-9]+)?$'
          THEN to_timestamp((bw->>'t')::double precision / 1000.0)
        WHEN COALESCE(bw->>'d','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          THEN (bw->>'d')::date::timestamptz
        ELSE now()
      END;
      INSERT INTO bodyweights(user_id,measured_at,weight,source)
      VALUES (NEW.user_id, measured, (bw->>'w')::numeric, 'opengym-profile');
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS varangym_opengym_progress_sync ON user_profile_states;
CREATE TRIGGER varangym_opengym_progress_sync
AFTER INSERT OR UPDATE OF state ON user_profile_states
FOR EACH ROW
EXECUTE FUNCTION varangym_sync_opengym_progress();
