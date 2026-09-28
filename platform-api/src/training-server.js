import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';
import { EXDB } from './exercises-data.js';

const { Pool } = pg;
const PORT = +(process.env.PORT || 3001);
const DATABASE_URL = process.env.DATABASE_URL;
const APP_ORIGIN = process.env.APP_ORIGIN || '';
const COOKIE_NAME = 'vg_session';
const MAX_BODY = 2 * 1024 * 1024;

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, max: 8, idleTimeoutMillis: 30000 });
const query = (text, params = []) => pool.query(text, params);

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store'
  });
  res.end(text);
}

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const raw = part.slice(i + 1).trim();
    try { out[key] = decodeURIComponent(raw); } catch { out[key] = raw; }
  }
  return out;
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function sessionToken(req) {
  const cookie = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
  if (cookie) return cookie;
  const auth = String(req.headers.authorization || '');
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
}

async function currentUser(req) {
  const token = sessionToken(req);
  if (!token) return null;
  const { rows } = await query(
    `SELECT u.id,u.display_name,u.email,u.locale,u.status,u.is_platform_admin
       FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [hashToken(token)]
  );
  const user = rows[0] || null;
  return user?.status === 'active' ? user : null;
}

async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) { json(res, 401, { error: 'not signed in' }); return null; }
  return user;
}

async function bodyJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('object required');
    return data;
  } catch {
    throw Object.assign(new Error('invalid json'), { status: 400 });
  }
}

function statusOf(err) {
  const n = Number(err?.status || 500);
  return Number.isInteger(n) && n >= 400 && n < 600 ? n : 500;
}

function deterministicUuid(key) {
  const b = crypto.createHash('sha256').update(`varangym:exercise:${key}`).digest().subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

async function seedGlobalExercises() {
  const count = await query("SELECT count(*)::int AS n FROM exercises WHERE owner_scope='platform' AND legacy_key IS NOT NULL");
  if (count.rows[0].n >= EXDB.length) return count.rows[0].n;
  const rows = EXDB.map(ex => ({
    id: deterministicUuid(ex.id),
    legacy_key: String(ex.id),
    tracking_mode: ex.bp === 'cardio' ? 'cardio' : (ex.eq === 'body weight' ? 'bodyweight' : 'reps_weight'),
    equipment_key: ex.eq || null,
    primary_muscle_key: ex.tg || null,
    metadata: {
      bodyPart: ex.bp || null,
      target: ex.tg || null,
      mainGroup: ex.mg || null,
      secondaryMuscles: Array.isArray(ex.sm) ? ex.sm : [],
      image: ex.img || null,
      gif: ex.gif || null,
      source: 'openGym/ExerciseDB'
    },
    name: ex.n || `Exercise ${ex.id}`,
    instructions: Array.isArray(ex.st) ? ex.st : []
  }));
  const payload = JSON.stringify(rows);
  await query(
    `WITH src AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
         id uuid, legacy_key text, tracking_mode text, equipment_key text,
         primary_muscle_key text, metadata jsonb, name text, instructions jsonb
       )
     )
     INSERT INTO exercises(id,legacy_key,owner_scope,tracking_mode,equipment_key,primary_muscle_key,metadata,active)
     SELECT id,legacy_key,'platform',tracking_mode,equipment_key,primary_muscle_key,metadata,true FROM src
     ON CONFLICT (legacy_key) WHERE legacy_key IS NOT NULL DO UPDATE SET
       tracking_mode=EXCLUDED.tracking_mode,
       equipment_key=EXCLUDED.equipment_key,
       primary_muscle_key=EXCLUDED.primary_muscle_key,
       metadata=EXCLUDED.metadata,
       active=true,
       updated_at=now()`,
    [payload]
  );
  await query(
    `WITH src AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,name text,instructions jsonb)
     )
     INSERT INTO exercise_translations(exercise_id,locale,name,instructions)
     SELECT id,'en',name,instructions FROM src
     ON CONFLICT (exercise_id,locale) DO UPDATE SET name=EXCLUDED.name,instructions=EXCLUDED.instructions`,
    [payload]
  );
  return rows.length;
}

async function membership(userId, workspaceId) {
  const { rows } = await query(
    `SELECT w.id,w.type,w.name,m.role
       FROM workspaces w JOIN workspace_memberships m ON m.workspace_id=w.id
      WHERE w.id=$1 AND m.user_id=$2 AND m.status='active' AND m.ended_at IS NULL`,
    [workspaceId, userId]
  );
  return { workspace: rows[0] ? { id: rows[0].id, type: rows[0].type, name: rows[0].name } : null, roles: new Set(rows.map(x => x.role)) };
}

async function canManageClient(user, workspaceId, clientId) {
  if (user.is_platform_admin) return true;
  const ctx = await membership(user.id, workspaceId);
  if (!ctx.roles.size) return false;
  if (ctx.roles.has('owner') || ctx.roles.has('admin')) return true;
  if (!ctx.roles.has('trainer')) return false;
  const link = await query(
    `SELECT 1 FROM trainer_client_links
      WHERE workspace_id=$1 AND trainer_user_id=$2 AND client_user_id=$3 AND status='active'`,
    [workspaceId, user.id, clientId]
  );
  return !!link.rowCount;
}

async function requireCoachAccess(user, workspaceId) {
  if (user.is_platform_admin) return { elevated: true, roles: new Set(['platform_admin']) };
  const ctx = await membership(user.id, workspaceId);
  if (!ctx.roles.size) throw Object.assign(new Error('forbidden'), { status: 403 });
  const elevated = ctx.roles.has('owner') || ctx.roles.has('admin');
  if (!elevated && !ctx.roles.has('trainer')) throw Object.assign(new Error('forbidden'), { status: 403 });
  return { elevated, roles: ctx.roles, workspace: ctx.workspace };
}

async function exerciseList(req, res, url) {
  const user = await requireUser(req, res); if (!user) return;
  const workspaceId = url.searchParams.get('workspaceId');
  const scope = url.searchParams.get('scope') || 'all';
  const q = String(url.searchParams.get('q') || '').trim().slice(0, 80);
  const locale = String(url.searchParams.get('locale') || user.locale || 'en').slice(0, 16);
  const limit = Math.min(200, Math.max(1, +(url.searchParams.get('limit') || 80)));

  if (workspaceId) {
    const ctx = await membership(user.id, workspaceId);
    if (!user.is_platform_admin && !ctx.roles.size) return json(res, 403, { error: 'forbidden' });
  }

  const params = [locale, q ? `%${q}%` : null, limit];
  let where = `e.active=true`;
  if (scope === 'global') where += ` AND e.owner_scope='platform'`;
  else if (scope === 'custom') where += ` AND e.owner_scope<>'platform'`;
  if (workspaceId && scope === 'library') {
    params.push(workspaceId, user.id);
    where += ` AND (e.id IN (SELECT r.exercise_id FROM workspace_exercise_refs r WHERE r.workspace_id=$4 AND (r.trainer_user_id IS NULL OR r.trainer_user_id=$5)) OR e.owner_workspace_id=$4 OR e.owner_user_id=$5)`;
  } else if (scope !== 'global') {
    if (workspaceId) {
      params.push(workspaceId, user.id);
      where += ` AND (e.owner_scope='platform' OR e.owner_workspace_id=$4 OR e.owner_user_id=$5)`;
    } else {
      params.push(null, user.id);
      where += ` AND (e.owner_scope='platform' OR e.owner_user_id=$5)`;
    }
  }
  if (q) where += ` AND (COALESCE(tl.name,en.name,'') ILIKE $2 OR COALESCE(e.equipment_key,'') ILIKE $2 OR COALESCE(e.primary_muscle_key,'') ILIKE $2)`;

  const { rows } = await query(
    `SELECT e.id,e.legacy_key,e.owner_scope,e.owner_workspace_id,e.owner_user_id,e.tracking_mode,e.equipment_key,e.primary_muscle_key,e.metadata,
            COALESCE(tl.name,en.name,e.legacy_key) AS name,
            COALESCE(tl.description,en.description) AS description,
            COALESCE(tl.instructions,en.instructions,'[]'::jsonb) AS instructions
       FROM exercises e
       LEFT JOIN exercise_translations tl ON tl.exercise_id=e.id AND tl.locale=$1
       LEFT JOIN exercise_translations en ON en.exercise_id=e.id AND en.locale='en'
      WHERE ${where}
      ORDER BY CASE WHEN e.owner_scope='platform' THEN 1 ELSE 0 END, COALESCE(tl.name,en.name,e.legacy_key)
      LIMIT $3`,
    params
  );
  return json(res, 200, { exercises: rows });
}

async function createCustomExercise(req, res) {
  const user = await requireUser(req, res); if (!user) return;
  const body = await bodyJson(req);
  const workspaceId = body.workspaceId;
  if (!workspaceId) return json(res, 400, { error: 'workspaceId required' });
  const access = await requireCoachAccess(user, workspaceId);
  const name = String(body.name || '').trim().slice(0, 160);
  if (name.length < 2) return json(res, 400, { error: 'name required' });
  const scope = access.elevated && body.ownerScope === 'organization' ? 'organization' : 'trainer';
  const ownerUserId = scope === 'trainer' ? user.id : null;
  const { rows } = await query(
    `INSERT INTO exercises(owner_scope,owner_workspace_id,owner_user_id,tracking_mode,equipment_key,primary_muscle_key,metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
    [scope, workspaceId, ownerUserId, body.trackingMode || 'reps_weight', body.equipment || null, body.primaryMuscle || null,
      JSON.stringify({ bodyPart: body.bodyPart || null, secondaryMuscles: Array.isArray(body.secondaryMuscles) ? body.secondaryMuscles : [] })]
  );
  const ex = rows[0];
  await query(
    `INSERT INTO exercise_translations(exercise_id,locale,name,description,instructions)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [ex.id, String(body.locale || user.locale || 'en').slice(0,16), name, body.description || null, JSON.stringify(Array.isArray(body.instructions) ? body.instructions : [])]
  );
  await query(
    `INSERT INTO workspace_exercise_refs(workspace_id,trainer_user_id,exercise_id,visibility)
     VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [workspaceId, scope === 'trainer' ? user.id : null, ex.id, scope === 'trainer' ? 'trainer_clients' : 'organization']
  );
  return json(res, 201, { exercise: { ...ex, name } });
}

async function addToLibrary(req, res) {
  const user = await requireUser(req, res); if (!user) return;
  const body = await bodyJson(req);
  const workspaceId = body.workspaceId;
  if (!workspaceId || !body.exerciseId) return json(res, 400, { error: 'workspaceId and exerciseId required' });
  const access = await requireCoachAccess(user, workspaceId);
  let trainerUserId = user.id;
  if (access.elevated && body.organization === true) trainerUserId = null;
  else if (access.elevated && body.trainerUserId) trainerUserId = body.trainerUserId;
  await query(
    `INSERT INTO workspace_exercise_refs(workspace_id,trainer_user_id,exercise_id,visibility)
     VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [workspaceId, trainerUserId, body.exerciseId, trainerUserId ? 'trainer_clients' : 'organization']
  );
  return json(res, 200, { ok: true });
}

async function programList(req, res, url) {
  const user = await requireUser(req, res); if (!user) return;
  const workspaceId = url.searchParams.get('workspaceId');
  const clientId = url.searchParams.get('clientId');
  if (!workspaceId || !clientId) return json(res, 400, { error: 'workspaceId and clientId required' });
  if (!(await canManageClient(user, workspaceId, clientId))) return json(res, 403, { error: 'forbidden' });
  const { rows } = await query(
    `SELECT p.id,p.name,p.status,p.created_at,p.updated_at,p.trainer_user_id,
            COALESCE((SELECT max(version_number) FROM program_versions v WHERE v.program_id=p.id),0)::int AS latest_version,
            (SELECT id FROM program_versions v WHERE v.program_id=p.id AND v.status='published' ORDER BY version_number DESC LIMIT 1) AS published_version_id,
            (SELECT id FROM program_versions v WHERE v.program_id=p.id AND v.status='draft' ORDER BY version_number DESC LIMIT 1) AS draft_version_id
       FROM programs p WHERE p.workspace_id=$1 AND p.client_user_id=$2 AND p.status='active'
      ORDER BY p.updated_at DESC`,
    [workspaceId, clientId]
  );
  return json(res, 200, { programs: rows });
}

async function createProgram(req, res) {
  const user = await requireUser(req, res); if (!user) return;
  const body = await bodyJson(req);
  const { workspaceId, clientId } = body;
  if (!workspaceId || !clientId) return json(res, 400, { error: 'workspaceId and clientId required' });
  if (!(await canManageClient(user, workspaceId, clientId))) return json(res, 403, { error: 'forbidden' });
  const name = String(body.name || 'Training plan').trim().slice(0, 160);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = await client.query(
      `INSERT INTO programs(workspace_id,client_user_id,trainer_user_id,name,status)
       VALUES ($1,$2,$3,$4,'active') RETURNING *`,
      [workspaceId, clientId, user.id, name]
    );
    const v = await client.query(
      `INSERT INTO program_versions(program_id,version_number,status,created_by_user_id,notes)
       VALUES ($1,1,'draft',$2,$3) RETURNING *`,
      [p.rows[0].id, user.id, body.notes || null]
    );
    await client.query('COMMIT');
    return json(res, 201, { program: p.rows[0], version: v.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
}

async function saveProgramVersion(req, res) {
  const user = await requireUser(req, res); if (!user) return;
  const body = await bodyJson(req);
  if (!body.versionId || !Array.isArray(body.days)) return json(res, 400, { error: 'versionId and days required' });
  const found = await query(
    `SELECT v.id,v.status,p.workspace_id,p.client_user_id
       FROM program_versions v JOIN programs p ON p.id=v.program_id WHERE v.id=$1`,
    [body.versionId]
  );
  const row = found.rows[0];
  if (!row) return json(res, 404, { error: 'version not found' });
  if (row.status !== 'draft') return json(res, 409, { error: 'only draft versions can be edited' });
  if (!(await canManageClient(user, row.workspace_id, row.client_user_id))) return json(res, 403, { error: 'forbidden' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM program_days WHERE program_version_id=$1', [body.versionId]);
    for (let di = 0; di < body.days.length; di += 1) {
      const day = body.days[di] || {};
      const d = await client.query(
        `INSERT INTO program_days(program_version_id,weekday,sequence_index,title,position)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [body.versionId, Number.isInteger(day.weekday) ? day.weekday : null, Number.isInteger(day.sequenceIndex) ? day.sequenceIndex : di,
          String(day.title || `Day ${di + 1}`).slice(0,120), di]
      );
      const exercises = Array.isArray(day.exercises) ? day.exercises : [];
      for (let ei = 0; ei < exercises.length; ei += 1) {
        const ex = exercises[ei] || {};
        if (!ex.exerciseId) continue;
        await client.query(
          `INSERT INTO program_day_exercises(program_day_id,exercise_id,position,prescription,coach_notes)
           VALUES ($1,$2,$3,$4::jsonb,$5)`,
          [d.rows[0].id, ex.exerciseId, ei, JSON.stringify(ex.prescription || {}), ex.coachNotes || null]
        );
      }
    }
    await client.query('COMMIT');
    return json(res, 200, { ok: true });
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
}

async function publishProgram(req, res) {
  const user = await requireUser(req, res); if (!user) return;
  const body = await bodyJson(req);
  const found = await query(
    `SELECT v.id,v.program_id,v.status,p.workspace_id,p.client_user_id
       FROM program_versions v JOIN programs p ON p.id=v.program_id WHERE v.id=$1`,
    [body.versionId]
  );
  const row = found.rows[0];
  if (!row) return json(res, 404, { error: 'version not found' });
  if (row.status !== 'draft') return json(res, 409, { error: 'version is not a draft' });
  if (!(await canManageClient(user, row.workspace_id, row.client_user_id))) return json(res, 403, { error: 'forbidden' });
  const count = await query('SELECT count(*)::int AS n FROM program_days WHERE program_version_id=$1', [row.id]);
  if (!count.rows[0].n) return json(res, 409, { error: 'program has no days' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE program_versions SET status='retired' WHERE program_id=$1 AND status='published'`, [row.program_id]);
    await client.query(`UPDATE program_versions SET status='published',published_at=now() WHERE id=$1`, [row.id]);
    await client.query(`UPDATE program_assignments SET active=false,ends_at=now() WHERE client_user_id=$1 AND active=true AND ends_at IS NULL`, [row.client_user_id]);
    await client.query(`INSERT INTO program_assignments(client_user_id,program_version_id,active) VALUES ($1,$2,true)`, [row.client_user_id, row.id]);
    await client.query('UPDATE programs SET updated_at=now() WHERE id=$1', [row.program_id]);
    await client.query('COMMIT');
    return json(res, 200, { ok: true, publishedVersionId: row.id });
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
}

async function newProgramVersion(req, res) {
  const user = await requireUser(req, res); if (!user) return;
  const body = await bodyJson(req);
  const { rows } = await query(`SELECT * FROM programs WHERE id=$1`, [body.programId]);
  const program = rows[0];
  if (!program) return json(res, 404, { error: 'program not found' });
  if (!(await canManageClient(user, program.workspace_id, program.client_user_id))) return json(res, 403, { error: 'forbidden' });
  const existingDraft = await query(`SELECT * FROM program_versions WHERE program_id=$1 AND status='draft' ORDER BY version_number DESC LIMIT 1`, [program.id]);
  if (existingDraft.rows[0]) return json(res, 200, { version: existingDraft.rows[0], existing: true });

  const source = await query(`SELECT * FROM program_versions WHERE program_id=$1 AND status='published' ORDER BY version_number DESC LIMIT 1`, [program.id]);
  const max = await query(`SELECT COALESCE(max(version_number),0)::int AS n FROM program_versions WHERE program_id=$1`, [program.id]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const v = await client.query(
      `INSERT INTO program_versions(program_id,version_number,status,created_by_user_id,notes)
       VALUES ($1,$2,'draft',$3,$4) RETURNING *`,
      [program.id, max.rows[0].n + 1, user.id, body.notes || null]
    );
    if (source.rows[0]) {
      const days = await client.query(`SELECT * FROM program_days WHERE program_version_id=$1 ORDER BY position`, [source.rows[0].id]);
      for (const day of days.rows) {
        const nd = await client.query(
          `INSERT INTO program_days(program_version_id,weekday,sequence_index,title,position)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [v.rows[0].id, day.weekday, day.sequence_index, day.title, day.position]
        );
        const exs = await client.query(`SELECT * FROM program_day_exercises WHERE program_day_id=$1 ORDER BY position`, [day.id]);
        for (const ex of exs.rows) {
          await client.query(
            `INSERT INTO program_day_exercises(program_day_id,exercise_id,position,prescription,coach_notes)
             VALUES ($1,$2,$3,$4,$5)`,
            [nd.rows[0].id, ex.exercise_id, ex.position, ex.prescription, ex.coach_notes]
          );
        }
      }
    }
    await client.query('COMMIT');
    return json(res, 201, { version: v.rows[0], existing: false });
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
}

async function activeProgram(req, res) {
  const user = await requireUser(req, res); if (!user) return;
  const { rows } = await query(
    `SELECT a.id AS assignment_id,a.starts_at,v.id AS version_id,v.version_number,v.published_at,p.id AS program_id,p.name,p.workspace_id,
            p.trainer_user_id,t.display_name AS trainer_name
       FROM program_assignments a
       JOIN program_versions v ON v.id=a.program_version_id
       JOIN programs p ON p.id=v.program_id
       LEFT JOIN users t ON t.id=p.trainer_user_id
      WHERE a.client_user_id=$1 AND a.active=true AND a.ends_at IS NULL
      ORDER BY a.starts_at DESC LIMIT 1`,
    [user.id]
  );
  const program = rows[0];
  if (!program) return json(res, 200, { program: null, days: [] });
  const days = await query(
    `SELECT d.id,d.weekday,d.sequence_index,d.title,d.position,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id',pe.id,'exerciseId',e.id,'legacyKey',e.legacy_key,
              'name',COALESCE(tl.name,en.name,e.legacy_key),'equipment',e.equipment_key,'primaryMuscle',e.primary_muscle_key,
              'metadata',e.metadata,'prescription',pe.prescription,'coachNotes',pe.coach_notes,'position',pe.position
            ) ORDER BY pe.position) FILTER (WHERE pe.id IS NOT NULL),'[]'::jsonb) AS exercises
       FROM program_days d
       LEFT JOIN program_day_exercises pe ON pe.program_day_id=d.id
       LEFT JOIN exercises e ON e.id=pe.exercise_id
       LEFT JOIN exercise_translations tl ON tl.exercise_id=e.id AND tl.locale=$2
       LEFT JOIN exercise_translations en ON en.exercise_id=e.id AND en.locale='en'
      WHERE d.program_version_id=$1
      GROUP BY d.id ORDER BY d.position`,
    [program.version_id, user.locale || 'en']
  );
  return json(res, 200, { program, days: days.rows });
}

async function logWorkout(req, res) {
  const user = await requireUser(req, res); if (!user) return;
  const body = await bodyJson(req);
  const exercises = Array.isArray(body.exercises) ? body.exercises : [];
  if (!String(body.name || '').trim()) return json(res, 400, { error: 'name required' });
  if (body.workspaceId) {
    const ctx = await membership(user.id, body.workspaceId);
    if (!user.is_platform_admin && !ctx.roles.has('client') && !ctx.roles.has('trainer') && !ctx.roles.has('owner') && !ctx.roles.has('admin')) return json(res, 403, { error: 'forbidden' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const w = await client.query(
      `INSERT INTO workouts(user_id,workspace_id,program_version_id,started_at,finished_at,name,source,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id`,
      [user.id, body.workspaceId || null, body.programVersionId || null, body.startedAt || new Date().toISOString(), body.finishedAt || new Date().toISOString(),
        String(body.name).slice(0,160), body.programVersionId ? 'assigned' : 'freestyle', JSON.stringify(body.metadata || {})]
    );
    for (let ei = 0; ei < exercises.length; ei += 1) {
      const ex = exercises[ei] || {};
      const we = await client.query(
        `INSERT INTO workout_exercises(workout_id,exercise_id,position,snapshot_name,prescription_snapshot)
         VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id`,
        [w.rows[0].id, ex.exerciseId || null, ei, ex.name || null, JSON.stringify(ex.prescription || {})]
      );
      const sets = Array.isArray(ex.sets) ? ex.sets : [];
      for (let si = 0; si < sets.length; si += 1) {
        const s = sets[si] || {};
        await client.query(
          `INSERT INTO workout_sets(workout_exercise_id,position,set_type,phase,weight,reps,seconds,distance,done,details)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
          [we.rows[0].id, si, s.type || 'straight', s.phase || 'work', s.weight ?? null, s.reps ?? null, s.seconds ?? null, s.distance ?? null, s.done !== false, JSON.stringify(s.details || {})]
        );
      }
    }
    await client.query('COMMIT');
    return json(res, 201, { id: w.rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
}

async function bodyweight(req, res) {
  const user = await requireUser(req, res); if (!user) return;
  const body = await bodyJson(req);
  const weight = Number(body.weight);
  if (!Number.isFinite(weight) || weight <= 0 || weight > 500) return json(res, 400, { error: 'invalid weight' });
  const { rows } = await query(
    `INSERT INTO bodyweights(user_id,measured_at,weight,source) VALUES ($1,$2,$3,'manual') RETURNING *`,
    [user.id, body.measuredAt || new Date().toISOString(), weight]
  );
  return json(res, 201, { bodyweight: rows[0] });
}

async function coachProgress(req, res, url) {
  const user = await requireUser(req, res); if (!user) return;
  const workspaceId = url.searchParams.get('workspaceId');
  const clientId = url.searchParams.get('clientId');
  if (!workspaceId || !clientId) return json(res, 400, { error: 'workspaceId and clientId required' });
  if (!(await canManageClient(user, workspaceId, clientId))) return json(res, 403, { error: 'forbidden' });
  const clientUser = await query(`SELECT id,display_name,email,locale FROM users WHERE id=$1`, [clientId]);
  if (!clientUser.rows[0]) return json(res, 404, { error: 'client not found' });
  const workouts = await query(
    `SELECT w.id,w.name,w.started_at,w.finished_at,w.program_version_id,
            count(DISTINCT we.id)::int AS exercises,
            count(ws.id) FILTER (WHERE ws.done=true)::int AS completed_sets,
            COALESCE(sum(CASE WHEN ws.done=true THEN COALESCE(ws.weight,0)*COALESCE(ws.reps,0) ELSE 0 END),0)::numeric AS volume
       FROM workouts w
       LEFT JOIN workout_exercises we ON we.workout_id=w.id
       LEFT JOIN workout_sets ws ON ws.workout_exercise_id=we.id
      WHERE w.user_id=$1
      GROUP BY w.id ORDER BY w.started_at DESC LIMIT 30`,
    [clientId]
  );
  const bw = await query(`SELECT measured_at,weight FROM bodyweights WHERE user_id=$1 ORDER BY measured_at DESC LIMIT 30`, [clientId]);
  const performances = await query(
    `SELECT e.id,COALESCE(en.name,we.snapshot_name,e.legacy_key) AS name,
            max(ws.weight) FILTER (WHERE ws.done=true) AS max_weight,
            max(ws.reps) FILTER (WHERE ws.done=true) AS max_reps,
            max(w.started_at) AS last_at
       FROM workouts w
       JOIN workout_exercises we ON we.workout_id=w.id
       LEFT JOIN exercises e ON e.id=we.exercise_id
       LEFT JOIN exercise_translations en ON en.exercise_id=e.id AND en.locale='en'
       JOIN workout_sets ws ON ws.workout_exercise_id=we.id
      WHERE w.user_id=$1
      GROUP BY e.id,COALESCE(en.name,we.snapshot_name,e.legacy_key)
      ORDER BY last_at DESC NULLS LAST LIMIT 50`,
    [clientId]
  );
  return json(res, 200, { client: clientUser.rows[0], workouts: workouts.rows, bodyweights: bw.rows, performances: performances.rows });
}

const routes = new Map([
  ['GET /training/health', async (_req,res) => json(res,200,{ ok:true, service:'varangym-training-api', exercises: EXDB.length })],
  ['GET /training/exercises', exerciseList],
  ['POST /training/exercises/custom', createCustomExercise],
  ['POST /training/library/add', addToLibrary],
  ['GET /training/programs', programList],
  ['POST /training/programs', createProgram],
  ['POST /training/programs/save', saveProgramVersion],
  ['POST /training/programs/publish', publishProgram],
  ['POST /training/programs/new-version', newProgramVersion],
  ['GET /training/client/program', activeProgram],
  ['POST /training/workouts', logWorkout],
  ['POST /training/bodyweight', bodyweight],
  ['GET /training/coach/progress', coachProgress]
]);

function originAllowed(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return true;
  const origin = String(req.headers.origin || '');
  return !origin || !APP_ORIGIN || origin === APP_ORIGIN;
}

await query('SELECT 1');
const seeded = await seedGlobalExercises();
console.log(`[varangym-training] global exercises ready: ${seeded}`);

const server = http.createServer(async (req,res) => {
  if (!originAllowed(req)) return json(res,403,{ error:'cross-origin request refused' });
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let url;
  try { url = new URL(req.url,'http://varangym.local'); } catch { return json(res,400,{ error:'bad request' }); }
  const handler = routes.get(`${req.method} ${url.pathname}`);
  if (!handler) return json(res,404,{ error:'not found' });
  try { await handler(req,res,url); }
  catch (err) {
    const status = statusOf(err);
    console.error('[training-http]',req.method,url.pathname,err?.stack || err);
    if (!res.headersSent) json(res,status,{ error: status===500 ? 'server error' : err.message });
  }
});

server.listen(PORT,'0.0.0.0',() => console.log(`[varangym-training] listening on :${PORT}`));
for (const sig of ['SIGTERM','SIGINT']) process.on(sig,()=>server.close(()=>process.exit(0)));
