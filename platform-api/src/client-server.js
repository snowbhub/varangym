import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';
import { EXDB } from './exercises-data.js';

const { Pool } = pg;
const PORT = +(process.env.PORT || 3003);
const DATABASE_URL = process.env.DATABASE_URL;
const COOKIE_NAME = 'vg_session';
const MAX_BODY = 2 * 1024 * 1024;

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, max: 6, idleTimeoutMillis: 30000 });
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

async function exerciseList(req, res, url) {
  const user = await requireUser(req, res); if (!user) return;
  const locale = String(url.searchParams.get('locale') || user.locale || 'en').slice(0, 16);
  const q = String(url.searchParams.get('q') || '').trim().slice(0, 100);
  const pattern = q ? `%${q}%` : null;
  const limit = Math.min(80, Math.max(1, +(url.searchParams.get('limit') || 30)));

  const { rows } = await query(
    `SELECT e.id,e.legacy_key,e.tracking_mode,e.equipment_key,e.primary_muscle_key,e.metadata,
            COALESCE(tl.name,en.name,e.legacy_key) AS name,
            COALESCE(tl.description,en.description) AS description,
            COALESCE(tl.instructions,en.instructions,'[]'::jsonb) AS instructions
       FROM exercises e
       LEFT JOIN exercise_translations tl ON tl.exercise_id=e.id AND tl.locale=$1
       LEFT JOIN exercise_translations en ON en.exercise_id=e.id AND en.locale='en'
      WHERE e.active=true
        AND (e.owner_scope='platform' OR e.owner_user_id=$2)
        AND ($3::text IS NULL OR COALESCE(tl.name,en.name,e.legacy_key,'') ILIKE $3
             OR COALESCE(e.equipment_key,'') ILIKE $3 OR COALESCE(e.primary_muscle_key,'') ILIKE $3)
      ORDER BY CASE WHEN e.owner_user_id=$2 THEN 0 ELSE 1 END, COALESCE(tl.name,en.name,e.legacy_key)
      LIMIT $4`,
    [locale, user.id, pattern, limit]
  );
  return json(res, 200, { exercises: rows });
}

async function activeProgram(req, res) {
  const user = await requireUser(req, res); if (!user) return;
  const { rows } = await query(
    `SELECT a.id AS assignment_id,a.starts_at,v.id AS version_id,v.version_number,v.published_at,
            p.id AS program_id,p.name,p.workspace_id,p.trainer_user_id,t.display_name AS trainer_name
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
              'name',COALESCE(tl.name,en.name,e.legacy_key),'equipment',e.equipment_key,
              'primaryMuscle',e.primary_muscle_key,'metadata',e.metadata,
              'prescription',pe.prescription,'coachNotes',pe.coach_notes,'position',pe.position
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

async function history(req, res) {
  const user = await requireUser(req, res); if (!user) return;
  const { rows } = await query(
    `SELECT w.id,w.name,w.started_at,w.finished_at,w.source,
            count(DISTINCT we.id)::int AS exercises,
            count(ws.id) FILTER (WHERE ws.done=true)::int AS completed_sets
       FROM workouts w
       LEFT JOIN workout_exercises we ON we.workout_id=w.id
       LEFT JOIN workout_sets ws ON ws.workout_exercise_id=we.id
      WHERE w.user_id=$1
      GROUP BY w.id ORDER BY w.started_at DESC LIMIT 20`,
    [user.id]
  );
  return json(res, 200, { workouts: rows });
}

async function logWorkout(req, res) {
  const user = await requireUser(req, res); if (!user) return;
  const body = await bodyJson(req);
  const exercises = Array.isArray(body.exercises) ? body.exercises : [];
  const name = String(body.name || '').trim();
  if (!name) return json(res, 400, { error: 'name required' });
  if (!exercises.length) return json(res, 400, { error: 'add at least one exercise' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const w = await client.query(
      `INSERT INTO workouts(user_id,workspace_id,program_version_id,started_at,finished_at,name,source,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id`,
      [user.id, body.workspaceId || null, body.programVersionId || null,
       body.startedAt || new Date().toISOString(), body.finishedAt || new Date().toISOString(),
       name.slice(0,160), body.programVersionId ? 'assigned' : 'freestyle', JSON.stringify(body.metadata || {})]
    );

    for (let ei = 0; ei < exercises.length; ei += 1) {
      const ex = exercises[ei] || {};
      if (!ex.exerciseId) continue;
      const we = await client.query(
        `INSERT INTO workout_exercises(workout_id,exercise_id,position,snapshot_name,prescription_snapshot)
         VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id`,
        [w.rows[0].id, ex.exerciseId, ei, ex.name || null, JSON.stringify(ex.prescription || {})]
      );
      const sets = Array.isArray(ex.sets) ? ex.sets : [];
      for (let si = 0; si < sets.length; si += 1) {
        const s = sets[si] || {};
        await client.query(
          `INSERT INTO workout_sets(workout_exercise_id,position,set_type,phase,weight,reps,seconds,distance,done,details)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
          [we.rows[0].id, si, s.type || 'straight', s.phase || 'work',
           s.weight === '' || s.weight == null ? null : Number(s.weight),
           s.reps === '' || s.reps == null ? null : Number(s.reps),
           s.seconds == null ? null : Number(s.seconds), s.distance == null ? null : Number(s.distance),
           s.done !== false, JSON.stringify(s.details || {})]
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

const routes = new Map([
  ['GET /client/health', async (_req,res) => json(res,200,{ ok:true, service:'varangym-client-api', exercises: EXDB.length })],
  ['GET /client/exercises', exerciseList],
  ['GET /client/program', activeProgram],
  ['GET /client/history', history],
  ['POST /client/workouts', logWorkout],
  ['POST /client/bodyweight', bodyweight]
]);

await query('SELECT 1');
console.log('[varangym-client] database ready');

const server = http.createServer(async (req,res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let url;
  try { url = new URL(req.url,'http://varangym.local'); } catch { return json(res,400,{ error:'bad request' }); }
  const handler = routes.get(`${req.method} ${url.pathname}`);
  if (!handler) return json(res,404,{ error:'not found' });
  try { await handler(req,res,url); }
  catch (err) {
    const status = statusOf(err);
    console.error('[client-http]',req.method,url.pathname,err?.stack || err);
    if (!res.headersSent) json(res,status,{ error: status===500 ? 'server error' : err.message });
  }
});

server.listen(PORT,'0.0.0.0',() => console.log(`[varangym-client] listening on :${PORT}`));
for (const sig of ['SIGTERM','SIGINT']) process.on(sig,()=>server.close(()=>process.exit(0)));
