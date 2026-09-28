const asNumber = (v, fallback = null) => {
  if (v === '' || v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function exerciseConfig(row) {
  const p = row.prescription && typeof row.prescription === 'object' ? row.prescription : {};
  const id = row.legacy_key || `vgx-${row.exercise_id}`;
  const out = { id, sets: Math.max(1, Math.round(asNumber(p.sets ?? p.workSets, 3))) };

  if (p.mode) out.mode = String(p.mode);
  const mode = out.mode || row.tracking_mode || 'reps_weight';
  if (mode === 'time') {
    out.mode = 'time';
    out.sec = Math.max(1, Math.round(asNumber(p.sec ?? p.seconds, 30)));
  } else if (mode === 'cardio') {
    out.mode = 'cardio';
    if (asNumber(p.min ?? p.minutes) != null) out.min = asNumber(p.min ?? p.minutes);
    if (asNumber(p.speed) != null) out.speed = asNumber(p.speed);
  } else {
    out.reps = Math.max(1, Math.round(asNumber(p.reps ?? p.repsMin, 10)));
    if (asNumber(p.weight) != null) out.weight = asNumber(p.weight);
  }

  for (const key of ['inc','repsMin','repsMax','restSec','warmupRestSec','warmupSets']) {
    const n = asNumber(p[key]);
    if (n != null) out[key] = n;
  }
  if (p.side === true) out.side = true;
  if (p.bodyweight != null) out.bodyweight = !!p.bodyweight;
  if (p.prog) out.prog = String(p.prog);
  if (row.coach_notes) out.note = String(row.coach_notes);
  return out;
}

function customExercise(row) {
  if (row.legacy_key) return null;
  const id = `vgx-${row.exercise_id}`;
  const primary = row.primary_muscle_key || 'full body';
  return {
    id,
    n: row.exercise_name || 'Coach exercise',
    bp: primary,
    tg: primary,
    ...(row.equipment_key ? { eq: row.equipment_key } : {}),
    custom: true,
    varangymAssigned: true
  };
}

/**
 * Keep the original openGym workout UI/state model, but project the trainer's current
 * published VARANGYM program into its routines + weekly schedule. Workout history,
 * bodyweight, preferences and every other openGym feature stay untouched.
 */
export async function overlayAssignedPlan(query, user, inputState) {
  const state = inputState && typeof inputState === 'object' && !Array.isArray(inputState)
    ? structuredClone(inputState)
    : { lang: 'ru' };

  const assigned = await query(
    `SELECT a.program_version_id,v.version_number,p.id AS program_id,p.name,p.trainer_user_id,
            t.display_name AS trainer_name
       FROM program_assignments a
       JOIN program_versions v ON v.id=a.program_version_id
       JOIN programs p ON p.id=v.program_id
       LEFT JOIN users t ON t.id=p.trainer_user_id
      WHERE a.client_user_id=$1 AND a.active=true AND a.ends_at IS NULL AND v.status='published'
      ORDER BY a.starts_at DESC LIMIT 1`,
    [user.id]
  );
  const program = assigned.rows[0];
  if (!program) return state;

  const { rows } = await query(
    `SELECT d.id AS day_id,d.weekday,d.sequence_index,d.title,d.position AS day_position,
            pe.position AS exercise_position,pe.prescription,pe.coach_notes,
            e.id AS exercise_id,e.legacy_key,e.tracking_mode,e.equipment_key,e.primary_muscle_key,e.owner_scope,
            COALESCE(tl.name,en.name,e.legacy_key) AS exercise_name
       FROM program_days d
       LEFT JOIN program_day_exercises pe ON pe.program_day_id=d.id
       LEFT JOIN exercises e ON e.id=pe.exercise_id
       LEFT JOIN exercise_translations tl ON tl.exercise_id=e.id AND tl.locale=$2
       LEFT JOIN exercise_translations en ON en.exercise_id=e.id AND en.locale='en'
      WHERE d.program_version_id=$1
      ORDER BY d.position,pe.position`,
    [program.program_version_id, user.locale || 'ru']
  );

  const days = new Map();
  const assignedCustom = new Map();
  for (const row of rows) {
    if (!days.has(row.day_id)) {
      days.set(row.day_id, {
        id: `vg-${row.day_id}`,
        name: row.title || `Training ${days.size + 1}`,
        emoji: '🏋️',
        varangymAssigned: true,
        varangymProgramVersion: program.program_version_id,
        weekday: row.weekday,
        ex: []
      });
    }
    if (!row.exercise_id) continue;
    days.get(row.day_id).ex.push(exerciseConfig(row));
    const custom = customExercise(row);
    if (custom) assignedCustom.set(custom.id, custom);
  }

  const existingRoutines = Array.isArray(state.routines) ? state.routines : [];
  state.routines = [
    ...existingRoutines.filter(r => !String(r?.id || '').startsWith('vg-') && r?.varangymAssigned !== true),
    ...[...days.values()].map(({ weekday, ...routine }) => routine)
  ];

  const existingCustom = Array.isArray(state.customEx) ? state.customEx : [];
  state.customEx = [
    ...existingCustom.filter(x => !String(x?.id || '').startsWith('vgx-') && x?.varangymAssigned !== true),
    ...assignedCustom.values()
  ];

  // An assigned coach program owns the weekly schedule. Freestyle routines remain in the
  // user's library but are not silently mixed into the coach's published week.
  state.week = {};
  for (const day of days.values()) {
    if (Number.isInteger(day.weekday) && day.weekday >= 0 && day.weekday <= 6) {
      state.week[day.weekday] = [...(state.week[day.weekday] || []), day.id];
    }
  }

  state.varangymProgram = {
    id: program.program_id,
    versionId: program.program_version_id,
    version: program.version_number,
    name: program.name,
    trainerUserId: program.trainer_user_id,
    trainerName: program.trainer_name || null
  };
  return state;
}
