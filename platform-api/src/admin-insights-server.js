import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const PORT = +(process.env.PORT || 3010);
const DATABASE_URL = process.env.DATABASE_URL;
const COOKIE_NAME = 'vg_session';
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, max: 5, idleTimeoutMillis: 30000 });
const query = (text, params = []) => pool.query(text, params);

function json(res,status,body){const text=JSON.stringify(body);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(text),'cache-control':'no-store'});res.end(text)}
function cookies(header=''){const out={};for(const p of String(header).split(';')){const i=p.indexOf('=');if(i<0)continue;const k=p.slice(0,i).trim();if(!k)continue;try{out[k]=decodeURIComponent(p.slice(i+1).trim())}catch{out[k]=p.slice(i+1).trim()}}return out}
const hash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex');
function token(req){const c=cookies(req.headers.cookie||'')[COOKIE_NAME];if(c)return c;const a=String(req.headers.authorization||'');return a.startsWith('Bearer ')?a.slice(7).trim():null}
async function needAdmin(req,res){const t=token(req);if(!t){json(res,401,{error:'not signed in'});return null}const {rows}=await query(`SELECT u.id,u.display_name,u.status,u.is_platform_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(t)]);const u=rows[0];if(!u||u.status!=='active'){json(res,401,{error:'not signed in'});return null}if(!u.is_platform_admin){json(res,403,{error:'forbidden'});return null}return u}

async function summary(req,res){
  const u=await needAdmin(req,res);if(!u)return;
  const [finance,daily,plans,subjects,directory]=await Promise.all([
    query(`SELECT
      COALESCE((SELECT sum(p.price_cents*s.quantity) FROM subscriptions s JOIN billing_plans p ON p.code=s.plan_code WHERE s.status='active' AND p.billing_kind='recurring' AND p.interval_unit='month'),0)::bigint AS mrr_cents,
      COALESCE((SELECT sum(p.price_cents*s.quantity) FROM subscriptions s JOIN billing_plans p ON p.code=s.plan_code WHERE s.status='active' AND p.billing_kind='recurring' AND p.interval_unit='year'),0)::bigint AS annual_recurring_cents,
      (SELECT count(*)::int FROM subscriptions WHERE status='active') AS active_subscriptions,
      (SELECT count(*)::int FROM subscriptions WHERE status='trialing' AND trial_ends_at>now()) AS active_trials,
      (SELECT count(*)::int FROM subscriptions WHERE status='trialing' AND trial_ends_at>now() AND trial_ends_at<=now()+interval '7 days') AS trials_expiring_7d,
      (SELECT count(DISTINCT subject_type||':'||subject_id::text)::int FROM payments WHERE status='paid') AS paying_subjects,
      COALESCE((SELECT sum(amount_cents-refunded_cents) FROM payments WHERE status='paid' AND paid_at>=date_trunc('month',now())),0)::bigint AS revenue_month_cents,
      COALESCE((SELECT sum(amount_cents-refunded_cents) FROM payments WHERE status='paid' AND paid_at>=now()-interval '30 days'),0)::bigint AS revenue_30d_cents,
      COALESCE((SELECT sum(amount_cents-refunded_cents) FROM payments WHERE status='paid'),0)::bigint AS revenue_lifetime_cents,
      COALESCE((SELECT avg(amount_cents-refunded_cents) FROM payments WHERE status='paid'),0)::numeric AS avg_payment_cents`),
    query(`WITH d AS (SELECT generate_series(current_date-89,current_date,'1 day'::interval)::date day), p AS (SELECT paid_at::date day,sum(amount_cents-refunded_cents)::bigint cents,count(*)::int payments FROM payments WHERE status='paid' AND paid_at>=current_date-89 GROUP BY 1) SELECT d.day,COALESCE(p.cents,0)::bigint AS cents,COALESCE(p.payments,0)::int AS payments FROM d LEFT JOIN p USING(day) ORDER BY d.day`),
    query(`SELECT code,audience,billing_kind,interval_unit,price_cents,currency,trainer_limit,client_limit,metadata FROM billing_plans WHERE active=true ORDER BY sort_order`),
    query(`SELECT b.subject_type,b.subject_id,b.plan_code,b.lifetime_access,b.extra_trainers,b.billing_email,b.updated_at,
      CASE WHEN b.subject_type='user' THEN u.display_name ELSE w.name END AS subject_name,
      CASE WHEN b.subject_type='user' THEN u.email ELSE NULL END AS user_email,
      w.type AS workspace_type,
      s.id AS subscription_id,s.status AS subscription_status,s.provider,s.current_period_end,s.trial_ends_at,s.cancel_at_period_end,s.quantity,
      COALESCE((SELECT sum(p.amount_cents-p.refunded_cents) FROM payments p WHERE p.subject_type=b.subject_type AND p.subject_id=b.subject_id AND p.status='paid'),0)::bigint AS paid_cents,
      (SELECT max(p.paid_at) FROM payments p WHERE p.subject_type=b.subject_type AND p.subject_id=b.subject_id AND p.status='paid') AS last_paid_at
      FROM billing_subject_settings b
      LEFT JOIN users u ON b.subject_type='user' AND u.id=b.subject_id
      LEFT JOIN workspaces w ON b.subject_type='workspace' AND w.id=b.subject_id
      LEFT JOIN LATERAL (SELECT * FROM subscriptions sx WHERE sx.subject_type=b.subject_type AND sx.subject_id=b.subject_id ORDER BY sx.created_at DESC LIMIT 1) s ON true
      ORDER BY b.updated_at DESC LIMIT 500`),
    query(`SELECT u.id,u.display_name,u.email,u.locale,u.status,u.is_platform_admin,u.created_at,
      (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id=u.id) AS last_seen_at,
      (SELECT s.ip_hint FROM sessions s WHERE s.user_id=u.id ORDER BY s.last_seen_at DESC LIMIT 1) AS last_ip,
      (SELECT s.country_code FROM sessions s WHERE s.user_id=u.id ORDER BY s.last_seen_at DESC LIMIT 1) AS country_code,
      (SELECT s.region FROM sessions s WHERE s.user_id=u.id ORDER BY s.last_seen_at DESC LIMIT 1) AS region,
      (SELECT s.city FROM sessions s WHERE s.user_id=u.id ORDER BY s.last_seen_at DESC LIMIT 1) AS city,
      (SELECT s.user_agent FROM sessions s WHERE s.user_id=u.id ORDER BY s.last_seen_at DESC LIMIT 1) AS user_agent,
      (SELECT count(*)::int FROM workouts w WHERE w.user_id=u.id AND w.started_at>=now()-interval '30 days') AS workouts_30d,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('workspaceId',m.workspace_id,'workspace',ws.name,'type',ws.type,'role',m.role) ORDER BY ws.name,m.role) FROM workspace_memberships m JOIN workspaces ws ON ws.id=m.workspace_id WHERE m.user_id=u.id AND m.status='active' AND m.ended_at IS NULL),'[]'::jsonb) AS memberships,
      (SELECT b.plan_code FROM billing_subject_settings b WHERE b.subject_type='user' AND b.subject_id=u.id) AS direct_plan,
      (SELECT s.status FROM subscriptions s WHERE s.subject_type='user' AND s.subject_id=u.id ORDER BY s.created_at DESC LIMIT 1) AS direct_subscription_status,
      (SELECT s.trial_ends_at FROM subscriptions s WHERE s.subject_type='user' AND s.subject_id=u.id ORDER BY s.created_at DESC LIMIT 1) AS direct_trial_ends_at,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('workspaceId',w.id,'workspace',w.name,'planCode',b.plan_code,'status',sx.status,'trialEndsAt',sx.trial_ends_at)) FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id LEFT JOIN billing_subject_settings b ON b.subject_type='workspace' AND b.subject_id=w.id LEFT JOIN LATERAL (SELECT status,trial_ends_at FROM subscriptions s WHERE s.subject_type='workspace' AND s.subject_id=w.id ORDER BY s.created_at DESC LIMIT 1) sx ON true WHERE m.user_id=u.id AND m.role IN('owner','admin') AND m.status='active' AND m.ended_at IS NULL),'[]'::jsonb) AS managed_plans
      FROM users u ORDER BY u.created_at DESC LIMIT 500`)
  ]);
  const f=finance.rows[0]||{};const mrr=Number(f.mrr_cents||0)+Math.round(Number(f.annual_recurring_cents||0)/12);const paying=Number(f.paying_subjects||0);
  return json(res,200,{finance:{...f,mrr_cents:mrr,arr_cents:mrr*12,arppu_cents:paying?Math.round(Number(f.revenue_30d_cents||0)/paying):0},dailyRevenue:daily.rows,plans:plans.rows,subjects:subjects.rows,directory:directory.rows});
}

async function userDetail(req,res,url){
  const admin=await needAdmin(req,res);if(!admin)return;const id=String(url.searchParams.get('id')||'');if(!id)return json(res,400,{error:'id required'});
  const base=(await query(`SELECT id,display_name,email,locale,status,is_platform_admin,created_at FROM users WHERE id=$1`,[id])).rows[0];if(!base)return json(res,404,{error:'user not found'});
  const [sessions,memberships,subs,payments,workouts]=await Promise.all([
    query(`SELECT created_at,last_seen_at,expires_at,user_agent,ip_hint,country_code,region,city FROM sessions WHERE user_id=$1 ORDER BY last_seen_at DESC LIMIT 20`,[id]),
    query(`SELECT m.workspace_id,w.name AS workspace,w.type,m.role,m.status,m.created_at FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 ORDER BY m.created_at DESC`,[id]),
    query(`SELECT * FROM subscriptions WHERE (subject_type='user' AND subject_id=$1) OR (subject_type='workspace' AND subject_id IN (SELECT workspace_id FROM workspace_memberships WHERE user_id=$1 AND role IN('owner','admin'))) ORDER BY created_at DESC LIMIT 50`,[id]),
    query(`SELECT * FROM payments WHERE (subject_type='user' AND subject_id=$1) OR (subject_type='workspace' AND subject_id IN (SELECT workspace_id FROM workspace_memberships WHERE user_id=$1 AND role IN('owner','admin'))) ORDER BY created_at DESC LIMIT 50`,[id]),
    query(`SELECT id,name,started_at,finished_at,source FROM workouts WHERE user_id=$1 ORDER BY started_at DESC LIMIT 30`,[id])
  ]);
  return json(res,200,{user:base,sessions:sessions.rows,memberships:memberships.rows,subscriptions:subs.rows,payments:payments.rows,workouts:workouts.rows});
}

const server=http.createServer(async(req,res)=>{let url;try{url=new URL(req.url,'http://varangym.local')}catch{return json(res,400,{error:'bad request'})}try{
  if(req.method==='GET'&&url.pathname==='/admin-insights/summary')return summary(req,res);
  if(req.method==='GET'&&url.pathname==='/admin-insights/user')return userDetail(req,res,url);
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'varangym-admin-insights'});
  return json(res,404,{error:'not found'});
}catch(e){console.error('[admin-insights]',e?.stack||e);return json(res,500,{error:'server error'})}});
server.listen(PORT,'0.0.0.0',()=>console.log(`[varangym-admin-insights] listening on :${PORT}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>process.exit(0)));
