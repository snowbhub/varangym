import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const PORT = +(process.env.PORT || 3005);
const DATABASE_URL = process.env.DATABASE_URL;
const APP_ORIGIN = process.env.APP_ORIGIN || '';
const COOKIE_NAME = 'vg_session';
const MAX_BODY = 2 * 1024 * 1024;

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, max: 5, idleTimeoutMillis: 30000 });
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
    if (!key) continue;
    try { out[key] = decodeURIComponent(raw); } catch { out[key] = raw; }
  }
  return out;
}

const hashToken = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
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
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid json');
    return value;
  } catch {
    throw Object.assign(new Error('invalid json'), { status: 400 });
  }
}

function statusOf(err) {
  const n = Number(err?.status || 500);
  return Number.isInteger(n) && n >= 400 && n < 600 ? n : 500;
}

async function membership(userId, workspaceId) {
  const { rows } = await query(
    `SELECT role FROM workspace_memberships
      WHERE user_id=$1 AND workspace_id=$2 AND status='active' AND ended_at IS NULL`,
    [userId, workspaceId]
  );
  return new Set(rows.map(r => r.role));
}

async function canManageClient(user, workspaceId, clientId) {
  if (user.is_platform_admin) return true;
  const roles = await membership(user.id, workspaceId);
  if (roles.has('owner') || roles.has('admin')) return true;
  if (!roles.has('trainer')) return false;
  const link = await query(
    `SELECT 1 FROM trainer_client_links
      WHERE workspace_id=$1 AND trainer_user_id=$2 AND client_user_id=$3 AND status='active'`,
    [workspaceId, user.id, clientId]
  );
  return !!link.rowCount;
}

function scheduledRoutines(state) {
  const routines = new Map((Array.isArray(state?.routines) ? state.routines : []).map(r => [String(r.id), r]));
  const out = [];
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const ids = [].concat(state?.week?.[weekday] ?? state?.week?.[String(weekday)] ?? []).filter(Boolean);
    ids.forEach((id, sequence) => {
      const routine = routines.get(String(id));
      if (routine) out.push({ weekday, sequence, routine });
    });
  }
  return out;
}

function prescription(ex = {}) {
  const keep = [
    'sets','mode','reps','weight','sec','min','speed','bodyweight','side','prog','inc','deloadFactor',
    'repsMin','repsMax','restSec','warmupRestSec','warmupSets','intensifier','sg'
  ];
  const out = {};
  for (const key of keep) if (ex[key] != null) out[key] = ex[key];
  return out;
}

function customMap(state) {
  return new Map((Array.isArray(state?.customEx) ? state.customEx : []).map(x => [String(x.id), x]));
}

function trackingMode(custom = {}, ex = {}) {
  if (ex.mode === 'time') return 'time';
  if (ex.mode === 'cardio' || custom.bp === 'cardio') return 'cardio';
  if (ex.bodyweight === true || custom.eq === 'body weight') return 'bodyweight';
  return 'reps_weight';
}

async function ensureExercise(db, trainer, workspaceId, sourceId, custom, ex) {
  const built = await db.query('SELECT id FROM exercises WHERE legacy_key=$1 LIMIT 1', [sourceId]);
  if (built.rows[0]) return built.rows[0].id;
  if (!custom) throw Object.assign(new Error(`exercise ${sourceId} is not available in the VARANGYM library`), { status: 409 });

  const existing = await db.query(
    `SELECT id FROM exercises
      WHERE owner_user_id=$1 AND owner_workspace_id=$2 AND metadata->>'opengymCustomId'=$3 AND active=true
      LIMIT 1`,
    [trainer.id, workspaceId, sourceId]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const primary = custom.tg || (Array.isArray(custom.primaries) ? custom.primaries[0] : null) || custom.bp || 'full body';
  const secondary = Array.isArray(custom.secondaries) ? custom.secondaries : Array.isArray(custom.sm) ? custom.sm : [];
  const inserted = await db.query(
    `INSERT INTO exercises(owner_scope,owner_workspace_id,owner_user_id,tracking_mode,equipment_key,primary_muscle_key,metadata,active)
     VALUES ('trainer',$1,$2,$3,$4,$5,$6::jsonb,true) RETURNING id`,
    [workspaceId, trainer.id, trackingMode(custom, ex), custom.eq || null, primary,
      JSON.stringify({
        opengymCustomId: sourceId,
        bodyPart: custom.bp || null,
        target: custom.tg || null,
        secondaryMuscles: secondary,
        source: 'trainer-opengym-profile'
      })]
  );
  const id = inserted.rows[0].id;
  await db.query(
    `INSERT INTO exercise_translations(exercise_id,locale,name,description,instructions)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT (exercise_id,locale) DO UPDATE
       SET name=EXCLUDED.name,description=EXCLUDED.description,instructions=EXCLUDED.instructions`,
    [id, String(trainer.locale || 'ru').slice(0,16), String(custom.n || 'Custom exercise').slice(0,160), custom.desc || null, '[]']
  );
  await db.query(
    `INSERT INTO workspace_exercise_refs(workspace_id,trainer_user_id,exercise_id,visibility)
     VALUES ($1,$2,$3,'trainer_clients') ON CONFLICT DO NOTHING`,
    [workspaceId, trainer.id, id]
  );
  return id;
}

async function preview(req, res, url) {
  const user = await requireUser(req, res); if (!user) return;
  const workspaceId = url.searchParams.get('workspaceId');
  if (!workspaceId) return json(res, 400, { error: 'workspaceId required' });
  if (!user.is_platform_admin) {
    const roles = await membership(user.id, workspaceId);
    if (!roles.has('owner') && !roles.has('admin') && !roles.has('trainer')) return json(res, 403, { error: 'forbidden' });
  }
  const { rows } = await query('SELECT state,rev,updated_at FROM user_profile_states WHERE user_id=$1', [user.id]);
  const state = rows[0]?.state || {};
  const days = scheduledRoutines(state);
  return json(res, 200, {
    rev: Number(rows[0]?.rev || 0),
    updatedAt: rows[0]?.updated_at || null,
    days: days.map(x => ({ weekday: x.weekday, routineId: x.routine.id, name: x.routine.name || 'Training', exercises: Array.isArray(x.routine.ex) ? x.routine.ex.length : 0 })),
    customExercises: Array.isArray(state.customEx) ? state.customEx.length : 0
  });
}

async function publish(req, res) {
  const user = await requireUser(req, res); if (!user) return;
  const body = await bodyJson(req);
  const workspaceId = body.workspaceId;
  const clientId = body.clientId;
  if (!workspaceId || !clientId) return json(res, 400, { error: 'workspaceId and clientId required' });
  if (!(await canManageClient(user, workspaceId, clientId))) return json(res, 403, { error: 'forbidden' });

  const profile = await query('SELECT state FROM user_profile_states WHERE user_id=$1', [user.id]);
  const state = profile.rows[0]?.state || {};
  const days = scheduledRoutines(state);
  if (!days.length) return json(res, 409, { error: 'your Training App weekly plan is empty' });
  const customs = customMap(state);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let program = (await client.query(
      `SELECT * FROM programs
        WHERE workspace_id=$1 AND client_user_id=$2 AND status='active'
        ORDER BY updated_at DESC LIMIT 1`,
      [workspaceId, clientId]
    )).rows[0];

    if (!program) {
      const created = await client.query(
        `INSERT INTO programs(workspace_id,client_user_id,trainer_user_id,name,status)
         VALUES ($1,$2,$3,$4,'active') RETURNING *`,
        [workspaceId, clientId, user.id, String(body.name || 'VARANGYM Training').slice(0,160)]
      );
      program = created.rows[0];
    } else {
      await client.query('UPDATE programs SET trainer_user_id=$1,updated_at=now() WHERE id=$2', [user.id, program.id]);
    }

    const max = await client.query('SELECT COALESCE(max(version_number),0)::int AS n FROM program_versions WHERE program_id=$1', [program.id]);
    const versionNumber = Number(max.rows[0]?.n || 0) + 1;
    const v = await client.query(
      `INSERT INTO program_versions(program_id,version_number,status,published_at,created_by_user_id,notes)
       VALUES ($1,$2,'published',now(),$3,$4) RETURNING id`,
      [program.id, versionNumber, user.id, 'Published from trainer Training App']
    );
    const versionId = v.rows[0].id;

    for (let di = 0; di < days.length; di += 1) {
      const { weekday, sequence, routine } = days[di];
      const d = await client.query(
        `INSERT INTO program_days(program_version_id,weekday,sequence_index,title,position)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [versionId, weekday, sequence, String(routine.name || `Training ${di + 1}`).slice(0,120), di]
      );
      const exercises = Array.isArray(routine.ex) ? routine.ex : [];
      for (let ei = 0; ei < exercises.length; ei += 1) {
        const source = exercises[ei] || {};
        if (!source.id) continue;
        const exerciseId = await ensureExercise(client, user, workspaceId, String(source.id), customs.get(String(source.id)), source);
        await client.query(
          `INSERT INTO program_day_exercises(program_day_id,exercise_id,position,prescription,coach_notes)
           VALUES ($1,$2,$3,$4::jsonb,$5)`,
          [d.rows[0].id, exerciseId, ei, JSON.stringify(prescription(source)), source.note || null]
        );
      }
    }

    await client.query(
      `UPDATE program_versions SET status='retired'
        WHERE program_id=$1 AND status='published' AND id<>$2`,
      [program.id, versionId]
    );
    await client.query(
      `UPDATE program_assignments SET active=false,ends_at=now()
        WHERE client_user_id=$1 AND active=true AND ends_at IS NULL`,
      [clientId]
    );
    // Migration 008 listens to this insert and bumps the client's openGym profile revision.
    await client.query(
      `INSERT INTO program_assignments(client_user_id,program_version_id,active)
       VALUES ($1,$2,true)`,
      [clientId, versionId]
    );
    await client.query('UPDATE programs SET updated_at=now() WHERE id=$1', [program.id]);
    await client.query('COMMIT');

    return json(res, 200, {
      ok: true,
      programId: program.id,
      versionId,
      versionNumber,
      days: days.length,
      exercises: days.reduce((n, x) => n + (Array.isArray(x.routine.ex) ? x.routine.ex.length : 0), 0)
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

const routes = new Map([
  ['GET /profile-plan/health', async (_req,res) => json(res,200,{ ok:true, service:'varangym-profile-plan' })],
  ['GET /profile-plan/preview', preview],
  ['POST /profile-plan/publish', publish]
]);

function originAllowed(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return true;
  const origin = String(req.headers.origin || '');
  return !origin || !APP_ORIGIN || origin === APP_ORIGIN;
}

await query('SELECT 1');
console.log('[varangym-profile-plan] database ready');
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
    console.error('[profile-plan-http]', req.method, url.pathname, err?.stack || err);
    if (!res.headersSent) json(res,status,{ error: status===500 ? 'server error' : err.message });
  }
});
server.listen(PORT,'0.0.0.0',() => console.log(`[varangym-profile-plan] listening on :${PORT}`));
for (const sig of ['SIGTERM','SIGINT']) process.on(sig,()=>server.close(()=>process.exit(0)));
