import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const PORT = +(process.env.PORT || 3006);
const DATABASE_URL = process.env.DATABASE_URL;
const COOKIE_NAME = 'vg_session';
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, max: 6, idleTimeoutMillis: 30000 });
const query = (text, params = []) => pool.query(text, params);

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'content-length':Buffer.byteLength(text), 'cache-control':'no-store' });
  res.end(text);
}
function parseCookies(header='') {
  const out={};
  for (const p of String(header).split(';')) {
    const i=p.indexOf('='); if (i<0) continue;
    const k=p.slice(0,i).trim(); if (!k) continue;
    try { out[k]=decodeURIComponent(p.slice(i+1).trim()); } catch { out[k]=p.slice(i+1).trim(); }
  }
  return out;
}
const hash = v => crypto.createHash('sha256').update(String(v||'')).digest('hex');
function tokenFrom(req) {
  const cookie=parseCookies(req.headers.cookie||'')[COOKIE_NAME]; if (cookie) return cookie;
  const a=String(req.headers.authorization||''); return a.startsWith('Bearer ')?a.slice(7).trim():null;
}
async function currentUser(req) {
  const token=tokenFrom(req); if (!token) return null;
  const {rows}=await query(`SELECT u.id,u.display_name,u.email,u.status,u.locale,u.is_platform_admin
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(token)]);
  return rows[0]?.status==='active'?rows[0]:null;
}
async function requireUser(req,res) { const u=await currentUser(req); if(!u){json(res,401,{error:'not signed in'});return null;} return u; }
async function roles(userId,workspaceId) {
  const {rows}=await query(`SELECT role FROM workspace_memberships WHERE user_id=$1 AND workspace_id=$2 AND status='active' AND ended_at IS NULL`,[userId,workspaceId]);
  return new Set(rows.map(r=>r.role));
}
function daysParam(url) { return Math.min(365,Math.max(7,Number(url.searchParams.get('days')||30)||30)); }

async function dailyActivity(filterSql='',params=[],days=30) {
  const {rows}=await query(`
    WITH calendar_days AS (
      SELECT generate_series(current_date-($${params.length+1}::int-1),current_date,'1 day'::interval)::date AS activity_date
    ), activity AS (
      SELECT date_trunc('day',w.started_at)::date AS activity_date,
             count(*)::int AS workouts,
             count(DISTINCT w.user_id)::int AS active_users,
             COALESCE(sum((SELECT count(*) FROM workout_sets s JOIN workout_exercises e ON e.id=s.workout_exercise_id WHERE e.workout_id=w.id AND s.done=true)),0)::bigint AS sets
      FROM workouts w
      ${filterSql}
      AND w.started_at>=current_date-($${params.length+1}::int-1)
      GROUP BY 1
    )
    SELECT d.activity_date AS day,
           COALESCE(x.workouts,0)::int AS workouts,
           COALESCE(x.active_users,0)::int AS active_users,
           COALESCE(x.sets,0)::bigint AS sets
      FROM calendar_days d
      LEFT JOIN activity x USING(activity_date)
      ORDER BY d.activity_date`, [...params,days]);
  return rows;
}

async function topExercises(filterSql='',params=[],days=30) {
  const {rows}=await query(`
    SELECT COALESCE(t.name,e.legacy_key,we.snapshot_name,'Exercise') name,
           count(DISTINCT w.id)::int workouts,
           count(ws.id) FILTER (WHERE ws.done=true)::int completed_sets,
           COALESCE(sum(CASE WHEN ws.done THEN COALESCE(ws.weight,0)*COALESCE(ws.reps,0) ELSE 0 END),0)::numeric AS volume
      FROM workouts w
      JOIN workout_exercises we ON we.workout_id=w.id
      LEFT JOIN exercises e ON e.id=we.exercise_id
      LEFT JOIN exercise_translations t ON t.exercise_id=e.id AND t.locale='en'
      LEFT JOIN workout_sets ws ON ws.workout_exercise_id=we.id
      ${filterSql}
      AND w.started_at>=now()-($${params.length+1}::int || ' days')::interval
     GROUP BY 1 ORDER BY completed_sets DESC,workouts DESC LIMIT 10`,[...params,days]);
  return rows;
}

async function revenueSummary(subjectFilter='',params=[],days=30) {
  const {rows}=await query(`SELECT
      COALESCE(sum(amount_cents-refunded_cents) FILTER (WHERE status='paid' AND paid_at>=now()-($${params.length+1}::int || ' days')::interval),0)::bigint period_cents,
      COALESCE(sum(amount_cents-refunded_cents) FILTER (WHERE status='paid'),0)::bigint lifetime_cents,
      count(*) FILTER (WHERE status='paid' AND paid_at>=now()-($${params.length+1}::int || ' days')::interval)::int paid_count
    FROM payments WHERE 1=1 ${subjectFilter}`,[...params,days]);
  return rows[0];
}

async function persistenceDiagnostics() {
  const [version, counts] = await Promise.all([
    query(`SELECT current_database() AS database,current_setting('server_version') AS server_version,now() AS checked_at`),
    query(`SELECT
      (SELECT count(*) FROM users)::int AS users,
      (SELECT count(*) FROM user_profile_states)::int AS profile_states,
      (SELECT count(*) FROM workouts)::int AS workouts,
      (SELECT count(*) FROM workout_exercises)::int AS workout_exercises,
      (SELECT count(*) FROM workout_sets)::int AS workout_sets,
      (SELECT count(*) FROM bodyweights)::int AS bodyweights,
      (SELECT count(*) FROM programs)::int AS programs,
      (SELECT count(*) FROM program_assignments WHERE active=true)::int AS active_assignments,
      (SELECT count(*) FROM exercises)::int AS exercises,
      (SELECT count(*) FROM subscriptions)::int AS subscriptions,
      (SELECT count(*) FROM payments)::int AS payments,
      (SELECT count(*) FROM sessions WHERE expires_at>now())::int AS active_sessions`)
  ]);
  return {
    engine: 'postgresql',
    sourceOfTruth: 'PostgreSQL for signed-in accounts; browser localStorage is an offline cache that syncs back to PostgreSQL',
    database: version.rows[0],
    counts: counts.rows[0]
  };
}

async function canViewClient(viewer, clientId, workspaceId=null) {
  if (viewer.is_platform_admin || viewer.id === clientId) return true;
  const params=[viewer.id,clientId];
  let workspaceClause='';
  if (workspaceId) { params.push(workspaceId); workspaceClause=' AND l.workspace_id=$3'; }
  const trainer=await query(`SELECT 1 FROM trainer_client_links l
    WHERE l.trainer_user_id=$1 AND l.client_user_id=$2 AND l.status='active'${workspaceClause} LIMIT 1`,params);
  if (trainer.rowCount) return true;
  if (!workspaceId) return false;
  const r=await roles(viewer.id,workspaceId);
  if(!r.has('owner')&&!r.has('admin')) return false;
  const member=await query(`SELECT 1 FROM trainer_client_links WHERE workspace_id=$1 AND client_user_id=$2 AND status='active' LIMIT 1`,[workspaceId,clientId]);
  return !!member.rowCount;
}

async function clientAnalytics(req,res,url,clientId) {
  const viewer=await requireUser(req,res); if(!viewer) return;
  const workspaceId=url.searchParams.get('workspaceId')||null;
  if(!await canViewClient(viewer,clientId,workspaceId)) return json(res,403,{error:'forbidden'});
  const days=daysParam(url);
  const profile=await query(`SELECT id,display_name,email,locale,created_at,status,is_platform_admin FROM users WHERE id=$1`,[clientId]);
  if(!profile.rowCount) return json(res,404,{error:'client not found'});

  const locale=String(profile.rows[0].locale||'uk').slice(0,16);
  const [daily,weights,recent,exerciseSeries,summary,memberships,profileState,currentPlan]=await Promise.all([
    dailyActivity('WHERE w.user_id=$1',[clientId],days),
    query(`SELECT measured_at,weight FROM bodyweights WHERE user_id=$1 AND measured_at>=now()-interval '365 days' ORDER BY measured_at`,[clientId]),
    query(`SELECT w.id,w.name,w.started_at,w.finished_at,w.source,
      count(DISTINCT we.id)::int exercises,
      count(ws.id) FILTER(WHERE ws.done=true)::int completed_sets,
      COALESCE(sum(CASE WHEN ws.done THEN COALESCE(ws.weight,0)*COALESCE(ws.reps,0) ELSE 0 END),0)::numeric volume
      FROM workouts w LEFT JOIN workout_exercises we ON we.workout_id=w.id LEFT JOIN workout_sets ws ON ws.workout_exercise_id=we.id
      WHERE w.user_id=$1 GROUP BY w.id,w.name,w.started_at,w.finished_at,w.source ORDER BY w.started_at DESC LIMIT 20`,[clientId]),
    query(`SELECT COALESCE(t.name,e.legacy_key,we.snapshot_name,'Exercise') name,
      date_trunc('day',w.started_at)::date day,
      max(ws.weight) FILTER(WHERE ws.done=true) max_weight,
      max(ws.reps) FILTER(WHERE ws.done=true) max_reps,
      max(CASE WHEN ws.done=true AND ws.weight IS NOT NULL AND ws.reps IS NOT NULL AND ws.reps>0 THEN ws.weight*(1+ws.reps/30.0) END) estimated_1rm,
      count(*) FILTER(WHERE ws.done=true)::int completed_sets
      FROM workouts w JOIN workout_exercises we ON we.workout_id=w.id
      LEFT JOIN exercises e ON e.id=we.exercise_id LEFT JOIN exercise_translations t ON t.exercise_id=e.id AND t.locale=$3
      LEFT JOIN workout_sets ws ON ws.workout_exercise_id=we.id
      WHERE w.user_id=$1 AND w.started_at>=now()-($2::int || ' days')::interval
      GROUP BY 1,2 HAVING count(*) FILTER(WHERE ws.done=true)>0 ORDER BY day,name`,[clientId,days,locale]),
    query(`SELECT count(DISTINCT w.id) FILTER(WHERE w.started_at>=now()-($2::int || ' days')::interval)::int workouts,
      count(ws.id) FILTER(WHERE ws.done=true AND w.started_at>=now()-($2::int || ' days')::interval)::int completed_sets,
      COALESCE(sum(CASE WHEN ws.done=true AND w.started_at>=now()-($2::int || ' days')::interval THEN COALESCE(ws.weight,0)*COALESCE(ws.reps,0) ELSE 0 END),0)::numeric volume,
      max(w.started_at) last_workout_at
      FROM workouts w LEFT JOIN workout_exercises we ON we.workout_id=w.id LEFT JOIN workout_sets ws ON ws.workout_exercise_id=we.id WHERE w.user_id=$1`,[clientId,days]),
    query(`SELECT m.workspace_id,w.name AS workspace_name,w.type AS workspace_type,m.role,m.status,m.started_at
      FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id
      WHERE m.user_id=$1 AND m.status='active' AND m.ended_at IS NULL ORDER BY w.name,m.role`,[clientId]),
    query(`SELECT rev,updated_at,state->'routines' AS routines,state->'week' AS week,state->'customEx' AS custom_exercises
      FROM user_profile_states WHERE user_id=$1`,[clientId]),
    query(`SELECT p.id AS program_id,p.name,p.workspace_id,w.name AS workspace_name,p.trainer_user_id,tr.display_name AS trainer_name,
        pv.id AS version_id,pv.version_number,pv.published_at,pa.starts_at,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id',pd.id,'weekday',pd.weekday,'sequenceIndex',pd.sequence_index,'title',pd.title,'position',pd.position,
          'exercises',COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id',pde.id,'exerciseId',pde.exercise_id,
            'name',COALESCE(tl.name,te.name,e.legacy_key,'Exercise'),
            'position',pde.position,'prescription',pde.prescription,'coachNotes',pde.coach_notes
          ) ORDER BY pde.position)
          FROM program_day_exercises pde
          JOIN exercises e ON e.id=pde.exercise_id
          LEFT JOIN exercise_translations tl ON tl.exercise_id=e.id AND tl.locale=$2
          LEFT JOIN exercise_translations te ON te.exercise_id=e.id AND te.locale='en'
          WHERE pde.program_day_id=pd.id),'[]'::jsonb)
        ) ORDER BY pd.position) FROM program_days pd WHERE pd.program_version_id=pv.id),'[]'::jsonb) AS days
      FROM program_assignments pa
      JOIN program_versions pv ON pv.id=pa.program_version_id
      JOIN programs p ON p.id=pv.program_id
      JOIN workspaces w ON w.id=p.workspace_id
      LEFT JOIN users tr ON tr.id=p.trainer_user_id
      WHERE pa.client_user_id=$1 AND pa.active=true AND pa.ends_at IS NULL
      ORDER BY pa.starts_at DESC LIMIT 1`,[clientId,locale])
  ]);
  const state=profileState.rows[0]||null;
  return json(res,200,{
    scope:'client',days,client:profile.rows[0],summary:summary.rows[0],daily,
    weights:weights.rows,recentWorkouts:recent.rows,exerciseSeries:exerciseSeries.rows,
    memberships:memberships.rows,
    currentProgram:currentPlan.rows[0]||null,
    profileState: state ? {
      rev:Number(state.rev||0),updatedAt:state.updated_at,
      routines:Array.isArray(state.routines)?state.routines:[],
      week:state.week||{},
      customExercises:Array.isArray(state.custom_exercises)?state.custom_exercises:[]
    } : null
  });
}

async function adminAnalytics(req,res,url) {
  const user=await requireUser(req,res); if(!user) return;
  if(!user.is_platform_admin) return json(res,403,{error:'forbidden'});
  const days=daysParam(url);
  const [daily,top,revenue,users,subs,plans,persistence,userList]=await Promise.all([
    dailyActivity('WHERE 1=1',[],days), topExercises('WHERE 1=1',[],days), revenueSummary('',[],days),
    query(`SELECT count(*)::int total,
      count(*) FILTER (WHERE created_at>=now()-($1::int || ' days')::interval)::int new_users,
      count(*) FILTER (WHERE id IN (SELECT DISTINCT user_id FROM workouts WHERE started_at>=now()-interval '7 days'))::int active_7d,
      count(*) FILTER (WHERE id IN (SELECT DISTINCT user_id FROM workouts WHERE started_at>=now()-interval '30 days'))::int active_30d FROM users`,[days]),
    query(`SELECT plan_code,status,count(*)::int count FROM subscriptions GROUP BY plan_code,status ORDER BY plan_code,status`),
    query(`SELECT code,audience,billing_kind,interval_unit,price_cents,currency,trainer_limit,client_limit,metadata FROM billing_plans WHERE active=true ORDER BY sort_order`),
    persistenceDiagnostics(),
    query(`SELECT u.id,u.display_name,u.email,u.locale,u.status,u.is_platform_admin,u.created_at,
      (SELECT max(w.started_at) FROM workouts w WHERE w.user_id=u.id) AS last_workout_at,
      (SELECT count(*)::int FROM workouts w WHERE w.user_id=u.id AND w.started_at>=now()-interval '30 days') AS workouts_30d,
      (SELECT count(*)::int FROM user_profile_states ps WHERE ps.user_id=u.id) AS has_profile,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('workspaceId',m.workspace_id,'workspace',ws.name,'type',ws.type,'role',m.role) ORDER BY ws.name,m.role)
        FROM workspace_memberships m JOIN workspaces ws ON ws.id=m.workspace_id
        WHERE m.user_id=u.id AND m.status='active' AND m.ended_at IS NULL),'[]'::jsonb) AS memberships,
      (SELECT p.name FROM program_assignments pa JOIN program_versions pv ON pv.id=pa.program_version_id JOIN programs p ON p.id=pv.program_id
        WHERE pa.client_user_id=u.id AND pa.active=true AND pa.ends_at IS NULL ORDER BY pa.starts_at DESC LIMIT 1) AS current_program
      FROM users u ORDER BY u.created_at DESC LIMIT 200`)
  ]);
  return json(res,200,{scope:'platform',days,users:users.rows[0],revenue,daily,topExercises:top,subscriptions:subs.rows,plans:plans.rows,persistence,userList:userList.rows});
}

async function coachAnalytics(req,res,url) {
  const user=await requireUser(req,res); if(!user) return;
  const workspaceId=url.searchParams.get('workspaceId'); if(!workspaceId) return json(res,400,{error:'workspaceId required'});
  const r=await roles(user.id,workspaceId);
  const elevated=user.is_platform_admin||r.has('owner')||r.has('admin');
  if(!elevated&&!r.has('trainer')) return json(res,403,{error:'forbidden'});
  const days=daysParam(url);
  const trainerId=elevated&&url.searchParams.get('trainerId')?url.searchParams.get('trainerId'):user.id;
  if(elevated&&trainerId!==user.id) {
    const {rowCount}=await query(`SELECT 1 FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2 AND role='trainer' AND status='active' AND ended_at IS NULL`,[workspaceId,trainerId]);
    if(!rowCount) return json(res,404,{error:'trainer not found'});
  }
  const clientSub=`SELECT client_user_id FROM trainer_client_links WHERE workspace_id=$1 AND trainer_user_id=$2 AND status='active'`;
  const [daily,top,clients]=await Promise.all([
    dailyActivity(`WHERE w.user_id IN (${clientSub})`,[workspaceId,trainerId],days), topExercises(`WHERE w.user_id IN (${clientSub})`,[workspaceId,trainerId],days),
    query(`SELECT u.id,u.display_name,u.email,max(w.started_at) AS last_workout_at,
      count(w.id) FILTER (WHERE w.started_at>=now()-($3::int || ' days')::interval)::int workouts_period,
      count(w.id) FILTER (WHERE w.started_at>=now()-interval '7 days')::int workouts_7d,
      (SELECT weight FROM bodyweights b WHERE b.user_id=u.id ORDER BY measured_at DESC LIMIT 1) AS latest_weight,
      (SELECT weight FROM bodyweights b WHERE b.user_id=u.id AND measured_at<=now()-interval '30 days' ORDER BY measured_at DESC LIMIT 1) AS weight_30d_ago
      FROM trainer_client_links l JOIN users u ON u.id=l.client_user_id LEFT JOIN workouts w ON w.user_id=u.id
      WHERE l.workspace_id=$1 AND l.trainer_user_id=$2 AND l.status='active'
      GROUP BY u.id,u.display_name,u.email ORDER BY max(w.started_at) DESC NULLS LAST,u.display_name`,[workspaceId,trainerId,days])
  ]);
  return json(res,200,{scope:'coach',days,workspaceId,trainerId,daily,topExercises:top,clients:clients.rows});
}

async function businessAnalytics(req,res,url) {
  const user=await requireUser(req,res); if(!user) return;
  const workspaceId=url.searchParams.get('workspaceId'); if(!workspaceId) return json(res,400,{error:'workspaceId required'});
  const r=await roles(user.id,workspaceId);
  if(!user.is_platform_admin&&!r.has('owner')&&!r.has('admin')) return json(res,403,{error:'forbidden'});
  const days=daysParam(url);
  const memberSub=`SELECT client_user_id FROM trainer_client_links WHERE workspace_id=$1 AND status='active'`;
  const [daily,top,trainers,revenue]=await Promise.all([
    dailyActivity(`WHERE w.user_id IN (${memberSub})`,[workspaceId],days), topExercises(`WHERE w.user_id IN (${memberSub})`,[workspaceId],days),
    query(`SELECT t.id,t.display_name,t.email,count(DISTINCT l.client_user_id)::int clients,
      count(DISTINCT w.id) FILTER (WHERE w.started_at>=now()-($2::int || ' days')::interval)::int workouts_period,
      count(DISTINCT w.user_id) FILTER (WHERE w.started_at>=now()-interval '7 days')::int active_clients_7d
      FROM workspace_memberships m JOIN users t ON t.id=m.user_id
      LEFT JOIN trainer_client_links l ON l.workspace_id=m.workspace_id AND l.trainer_user_id=t.id AND l.status='active'
      LEFT JOIN workouts w ON w.user_id=l.client_user_id
      WHERE m.workspace_id=$1 AND m.role='trainer' AND m.status='active' AND m.ended_at IS NULL
      GROUP BY t.id,t.display_name,t.email ORDER BY clients DESC,t.display_name`,[workspaceId,days]),
    revenueSummary(`AND subject_type='workspace' AND subject_id=$1`,[workspaceId],days)
  ]);
  return json(res,200,{scope:'business',days,workspaceId,daily,topExercises:top,trainers:trainers.rows,revenue});
}

const server=http.createServer(async(req,res)=>{
  let url; try{url=new URL(req.url,'http://varangym.local')}catch{return json(res,400,{error:'bad request'})}
  if(req.method==='GET'&&url.pathname==='/analytics/admin') return adminAnalytics(req,res,url).catch(e=>{console.error(e);json(res,500,{error:'server error'})});
  if(req.method==='GET'&&url.pathname==='/analytics/coach') return coachAnalytics(req,res,url).catch(e=>{console.error(e);json(res,500,{error:'server error'})});
  if(req.method==='GET'&&url.pathname==='/analytics/business') return businessAnalytics(req,res,url).catch(e=>{console.error(e);json(res,500,{error:'server error'})});
  const clientMatch=req.method==='GET'&&url.pathname.match(/^\/analytics\/client\/([0-9a-fA-F-]{36})$/);
  if(clientMatch) return clientAnalytics(req,res,url,clientMatch[1]).catch(e=>{console.error(e);json(res,500,{error:'server error'})});
  if(req.method==='GET'&&url.pathname==='/health') return json(res,200,{ok:true,service:'varangym-analytics'});
  return json(res,404,{error:'not found'});
});
server.listen(PORT,'0.0.0.0',()=>console.log(`[varangym-analytics] listening on :${PORT}`));
for(const s of ['SIGTERM','SIGINT']) process.on(s,()=>server.close(()=>process.exit(0)));
