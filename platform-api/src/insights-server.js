import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';
import { createInviteForActor } from './provisioning.js';

const { Pool } = pg;
const PORT = +(process.env.PORT || 3008);
const DATABASE_URL = process.env.DATABASE_URL;
const COOKIE_NAME = 'vg_session';
const MAX_BODY = 2 * 1024 * 1024;
const TRIAL_DAYS = Math.max(1, +(process.env.TRIAL_DAYS || 30) || 30);
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, max: 7, idleTimeoutMillis: 30000 });
const query = (text, params = []) => pool.query(text, params);

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'content-length':Buffer.byteLength(text), 'cache-control':'no-store' });
  res.end(text);
}
function cookies(header='') {
  const out={};
  for (const part of String(header).split(';')) { const i=part.indexOf('='); if(i<0) continue; const k=part.slice(0,i).trim(); if(!k) continue; try{out[k]=decodeURIComponent(part.slice(i+1).trim())}catch{out[k]=part.slice(i+1).trim()} }
  return out;
}
const hash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex');
function token(req){const c=cookies(req.headers.cookie||'')[COOKIE_NAME];if(c)return c;const a=String(req.headers.authorization||'');return a.startsWith('Bearer ')?a.slice(7).trim():null}
async function currentUser(req){const t=token(req);if(!t)return null;const {rows}=await query(`SELECT u.id,u.display_name,u.email,u.locale,u.status,u.is_platform_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(t)]);return rows[0]?.status==='active'?rows[0]:null}
async function needUser(req,res){const u=await currentUser(req);if(!u){json(res,401,{error:'not signed in'});return null}return u}
async function needAdmin(req,res){const u=await needUser(req,res);if(!u)return null;if(!u.is_platform_admin){json(res,403,{error:'forbidden'});return null}return u}
async function bodyJson(req){let n=0;const chunks=[];for await(const chunk of req){n+=chunk.length;if(n>MAX_BODY)throw Object.assign(new Error('body too large'),{status:413});chunks.push(chunk)}if(!chunks.length)return{};try{const v=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!v||typeof v!=='object'||Array.isArray(v))throw new Error();return v}catch{throw Object.assign(new Error('invalid json'),{status:400})}}
function requestIp(req){return String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim().slice(0,80)||'unknown'}
function statusOf(e){const n=Number(e?.status||500);return Number.isInteger(n)&&n>=400&&n<600?n:500}

async function roles(userId,workspaceId){const {rows}=await query(`SELECT m.role,w.type,w.name FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 AND m.workspace_id=$2 AND m.status='active' AND m.ended_at IS NULL`,[userId,workspaceId]);return {roles:new Set(rows.map(x=>x.role)),workspace:rows[0]||null}}
async function canManageWorkspace(user,workspaceId){if(user.is_platform_admin)return true;const r=await roles(user.id,workspaceId);return r.roles.has('owner')||r.roles.has('admin')}
async function canManageClient(user,clientId,workspaceId){
  if(user.is_platform_admin)return true;
  if(!workspaceId)return false;
  const r=await roles(user.id,workspaceId);
  if(r.roles.has('owner')||r.roles.has('admin'))return !!(await query(`SELECT 1 FROM trainer_client_links WHERE workspace_id=$1 AND client_user_id=$2 AND status='active' LIMIT 1`,[workspaceId,clientId])).rowCount;
  if(!r.roles.has('trainer'))return false;
  return !!(await query(`SELECT 1 FROM trainer_client_links WHERE workspace_id=$1 AND trainer_user_id=$2 AND client_user_id=$3 AND status='active' LIMIT 1`,[workspaceId,user.id,clientId])).rowCount;
}

const trialRate=new Map();
function allowTrial(req){const ip=requestIp(req);const now=Date.now();const row=trialRate.get(ip)||{start:now,n:0};if(now-row.start>3600000){row.start=now;row.n=0}row.n++;trialRate.set(ip,row);return row.n<=10}
async function banned(kind,value){if(!value)return false;return !!(await query(`SELECT 1 FROM account_bans WHERE kind=$1 AND value_norm=$2 AND active=true AND (expires_at IS NULL OR expires_at>now()) LIMIT 1`,[kind,String(value).trim().toLowerCase()])).rowCount}

async function publicTrialInvite(req,res){
  if(!allowTrial(req))return json(res,429,{error:'too many trial registrations — try later'});
  const b=await bodyJson(req);const type=String(b.accountType||'solo');const email=String(b.email||'').trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(email))return json(res,400,{error:'valid email required'});
  if(await banned('email',email)||await banned('ip',requestIp(req)))return json(res,403,{error:'registration blocked'});
  const targetRole=type==='trainer'?'independent_trainer':type==='business'?'organization_owner':'solo_client';
  const planCode=type==='trainer'?'coach_5':type==='business'?'business_5_50':'solo_monthly';
  const workspaceName=String(b.workspaceName||b.name||'').trim().slice(0,100)||undefined;
  const metadata={trial:true,trialDays:TRIAL_DAYS,trialPlanCode:planCode,workspaceName,organizationName:workspaceName,source:'self-service-trial'};
  const result=await createInviteForActor({query},{id:null,is_platform_admin:true},{targetRole,email,maxUses:1,expiresInDays:1,metadata});
  return json(res,201,{code:result.code,trialDays:TRIAL_DAYS,planCode,targetRole});
}

async function trialSubject(user){
  const {rows}=await query(`SELECT m.workspace_id,m.role,w.type,w.name FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 AND m.status='active' AND m.ended_at IS NULL ORDER BY CASE w.type WHEN 'organization' THEN 1 WHEN 'independent_trainer' THEN 2 ELSE 3 END,m.started_at DESC`,[user.id]);
  const org=rows.find(x=>x.type==='organization'&&x.role==='owner');if(org)return {subjectType:'workspace',subjectId:org.workspace_id,planCode:'business_5_50',audience:'organization',workspace:org};
  const trainer=rows.find(x=>x.type==='independent_trainer'&&(x.role==='owner'||x.role==='trainer'));if(trainer)return {subjectType:'workspace',subjectId:trainer.workspace_id,planCode:'coach_5',audience:'trainer',workspace:trainer};
  return {subjectType:'user',subjectId:user.id,planCode:'solo_monthly',audience:'solo',workspace:null};
}
async function activateTrial(req,res){
  const user=await needUser(req,res);if(!user)return;const s=await trialSubject(user);
  const eligible=await query(`SELECT 1 FROM invite_redemptions r JOIN invites i ON i.id=r.invite_id WHERE r.user_id=$1 AND COALESCE((i.metadata->>'trial')::boolean,false)=true LIMIT 1`,[user.id]);
  if(!eligible.rowCount)return json(res,403,{error:'trial registration not found'});
  const existing=await query(`SELECT 1 FROM subscriptions WHERE subject_type=$1 AND subject_id=$2 AND provider='varangym_trial' LIMIT 1`,[s.subjectType,s.subjectId]);if(existing.rowCount)return trialStatus(req,res);
  const plan=(await query(`SELECT * FROM billing_plans WHERE code=$1 AND active=true`,[s.planCode])).rows[0];if(!plan)return json(res,500,{error:'trial plan is unavailable'});
  const client=await pool.connect();try{await client.query('BEGIN');
    const sub=(await client.query(`INSERT INTO subscriptions(subject_type,subject_id,provider,provider_subscription_id,plan_code,status,current_period_end,trial_ends_at,metadata) VALUES($1,$2,'varangym_trial',$3,$4,'trialing',now()+($5||' days')::interval,now()+($5||' days')::interval,$6::jsonb) RETURNING id,trial_ends_at`,[s.subjectType,s.subjectId,`trial:${s.subjectType}:${s.subjectId}`,s.planCode,String(TRIAL_DAYS),JSON.stringify({selfService:true})])).rows[0];
    await client.query(`INSERT INTO billing_subject_settings(subject_type,subject_id,plan_code,lifetime_access,billing_email,metadata,updated_at) VALUES($1,$2,$3,false,$4,$5::jsonb,now()) ON CONFLICT(subject_type,subject_id) DO UPDATE SET plan_code=EXCLUDED.plan_code,billing_email=COALESCE(EXCLUDED.billing_email,billing_subject_settings.billing_email),metadata=billing_subject_settings.metadata||EXCLUDED.metadata,updated_at=now()`,[s.subjectType,s.subjectId,s.planCode,user.email,JSON.stringify({trial:true,trialEndsAt:sub.trial_ends_at})]);
    const grants=[['access',{enabled:true,audience:s.audience,trial:true}],['client_limit',{limit:plan.client_limit,trial:true}],['trainer_limit',{limit:plan.trainer_limit,trial:true}]];for(const [key,value] of grants)await client.query(`INSERT INTO entitlements(subject_type,subject_id,key,value,source_subscription_id,starts_at,ends_at) VALUES($1,$2,$3,$4::jsonb,$5,now(),NULL) ON CONFLICT(subject_type,subject_id,key) WHERE ends_at IS NULL DO UPDATE SET value=EXCLUDED.value,source_subscription_id=EXCLUDED.source_subscription_id,starts_at=now()`,[s.subjectType,s.subjectId,key,JSON.stringify(value),sub.id]);
    await client.query('COMMIT');return json(res,200,{ok:true,trialDays:TRIAL_DAYS,trialEndsAt:sub.trial_ends_at,planCode:s.planCode,subjectType:s.subjectType,subjectId:s.subjectId});
  }catch(e){try{await client.query('ROLLBACK')}catch{};throw e}finally{client.release()}
}
async function trialStatus(req,res){
  const user=await needUser(req,res);if(!user)return;const ms=await query(`SELECT m.workspace_id,m.role,w.name,w.type FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 AND m.status='active' AND m.ended_at IS NULL`,[user.id]);const ids=ms.rows.map(x=>x.workspace_id);
  const {rows}=await query(`SELECT s.subject_type,s.subject_id,s.plan_code,s.status,s.trial_ends_at,s.current_period_end,s.cancel_at_period_end,p.metadata AS plan_metadata,p.price_cents,p.currency FROM subscriptions s LEFT JOIN billing_plans p ON p.code=s.plan_code WHERE (s.subject_type='user' AND s.subject_id=$1) OR (s.subject_type='workspace' AND s.subject_id=ANY($2::uuid[])) ORDER BY s.created_at DESC`,[user.id,ids]);return json(res,200,{subscriptions:rows,memberships:ms.rows});
}
async function expireTrials(){try{const expired=await query(`UPDATE subscriptions SET status='expired',updated_at=now() WHERE provider='varangym_trial' AND status='trialing' AND trial_ends_at<=now() RETURNING id`);if(expired.rows.length)await query(`UPDATE entitlements SET ends_at=now() WHERE source_subscription_id=ANY($1::uuid[]) AND ends_at IS NULL`,[expired.rows.map(x=>x.id)])}catch(e){console.error('[insights] trial cleanup',e.message)}}

async function adminInsights(req,res){
  const user=await needAdmin(req,res);if(!user)return;
  const [users,workspaces,userBilling,workspaceBilling,subscriptions,payments,plans,activity,signups,revenueDaily,revenueMonthly,totals]=await Promise.all([
    query(`SELECT u.id,u.display_name,u.email,u.locale,u.status,u.is_platform_admin,u.created_at,(SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id=u.id) last_seen_at,(SELECT s.ip_hint FROM sessions s WHERE s.user_id=u.id ORDER BY s.last_seen_at DESC NULLS LAST,s.created_at DESC LIMIT 1) last_ip,(SELECT s.user_agent FROM sessions s WHERE s.user_id=u.id ORDER BY s.last_seen_at DESC NULLS LAST,s.created_at DESC LIMIT 1) user_agent,(SELECT count(*)::int FROM workouts w WHERE w.user_id=u.id AND w.started_at>=now()-interval '30 days') workouts_30d,(SELECT count(*)::int FROM workouts w WHERE w.user_id=u.id AND w.started_at>=now()-interval '7 days') workouts_7d FROM users u ORDER BY u.created_at DESC LIMIT 1000`),
    query(`SELECT w.id,w.name,w.type,w.status,w.created_at,count(DISTINCT m.user_id)::int members,count(DISTINCT m.user_id) FILTER(WHERE m.role='trainer')::int trainers,count(DISTINCT l.client_user_id)::int clients FROM workspaces w LEFT JOIN workspace_memberships m ON m.workspace_id=w.id AND m.status='active' AND m.ended_at IS NULL LEFT JOIN trainer_client_links l ON l.workspace_id=w.id AND l.status='active' GROUP BY w.id ORDER BY w.created_at DESC`),
    query(`SELECT * FROM billing_subject_settings WHERE subject_type='user'`),query(`SELECT * FROM billing_subject_settings WHERE subject_type='workspace'`),
    query(`SELECT s.*,p.price_cents,p.currency,p.audience,p.billing_kind,p.metadata AS plan_metadata FROM subscriptions s LEFT JOIN billing_plans p ON p.code=s.plan_code ORDER BY s.created_at DESC LIMIT 1000`),
    query(`SELECT p.*,u.display_name AS user_name,w.name AS workspace_name FROM payments p LEFT JOIN users u ON p.subject_type='user' AND u.id=p.subject_id LEFT JOIN workspaces w ON p.subject_type='workspace' AND w.id=p.subject_id ORDER BY p.created_at DESC LIMIT 500`),
    query(`SELECT * FROM billing_plans WHERE active=true ORDER BY sort_order`),
    query(`WITH d AS (SELECT generate_series(current_date-89,current_date,'1 day')::date day) SELECT d.day,COALESCE(a.active_users,0)::int active_users,COALESCE(a.workouts,0)::int workouts,COALESCE(a.completed_sets,0)::bigint completed_sets FROM d LEFT JOIN varangym_daily_activity a USING(day) ORDER BY d.day`),
    query(`WITH d AS (SELECT generate_series(current_date-89,current_date,'1 day')::date day) SELECT d.day,count(u.id)::int users FROM d LEFT JOIN users u ON u.created_at>=d.day AND u.created_at<d.day+1 GROUP BY d.day ORDER BY d.day`),
    query(`WITH d AS (SELECT generate_series(current_date-89,current_date,'1 day')::date day) SELECT d.day,COALESCE(sum(p.amount_cents-p.refunded_cents) FILTER(WHERE p.status='paid'),0)::bigint cents FROM d LEFT JOIN payments p ON p.paid_at>=d.day AND p.paid_at<d.day+1 GROUP BY d.day ORDER BY d.day`),
    query(`WITH m AS (SELECT generate_series(date_trunc('month',now())-interval '11 months',date_trunc('month',now()),interval '1 month') m) SELECT to_char(m.m,'YYYY-MM') month,COALESCE(sum(p.amount_cents-p.refunded_cents) FILTER(WHERE p.status='paid'),0)::bigint cents FROM m LEFT JOIN payments p ON p.paid_at>=m.m AND p.paid_at<m.m+interval '1 month' GROUP BY m.m ORDER BY m.m`),
    query(`SELECT (SELECT count(*) FROM workouts)::bigint total_workouts,(SELECT count(*) FROM workouts WHERE started_at>=now()-interval '30 days')::bigint workouts_30d,(SELECT count(*) FROM workout_sets ws JOIN workout_exercises we ON we.id=ws.workout_exercise_id JOIN workouts w ON w.id=we.workout_id WHERE ws.done=true AND w.started_at>=now()-interval '30 days')::bigint sets_30d,(SELECT count(*) FROM bodyweights)::bigint weigh_ins,(SELECT count(*) FROM users WHERE created_at>=now()-interval '30 days')::bigint new_users_30d`)
  ]);
  const ub=new Map(userBilling.rows.map(x=>[x.subject_id,x])),wb=new Map(workspaceBilling.rows.map(x=>[x.subject_id,x]));
  const ownerMemberships=(await query(`SELECT m.user_id,m.workspace_id,w.name,w.type FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.role='owner' AND m.status='active' AND m.ended_at IS NULL`)).rows;const owners=new Map();for(const x of ownerMemberships){if(!owners.has(x.user_id))owners.set(x.user_id,x)}
  const subBySubject=new Map();for(const s of subscriptions.rows){const k=`${s.subject_type}:${s.subject_id}`;if(!subBySubject.has(k))subBySubject.set(k,s)}
  const userList=users.rows.map(u=>{const own=owners.get(u.id);const setting=ub.get(u.id)||(own?wb.get(own.workspace_id):null);const subjectType=ub.has(u.id)?'user':own?'workspace':null;const subjectId=subjectType==='user'?u.id:own?.workspace_id;const sub=subjectType?subBySubject.get(`${subjectType}:${subjectId}`):null;return {...u,workspace:own||null,plan_code:setting?.plan_code||sub?.plan_code||null,subscription_status:sub?.status||null,trial_ends_at:sub?.trial_ends_at||null,current_period_end:sub?.current_period_end||null,lifetime_access:!!setting?.lifetime_access}});
  const paid=payments.rows.filter(x=>x.status==='paid'),now=Date.now(),monthStart=new Date();monthStart.setUTCDate(1);monthStart.setUTCHours(0,0,0,0);
  const activeSubs=subscriptions.rows.filter(x=>x.status==='active'),trialSubs=subscriptions.rows.filter(x=>x.status==='trialing'&&(!x.trial_ends_at||new Date(x.trial_ends_at).getTime()>now)),canceled=subscriptions.rows.filter(x=>['canceled','expired'].includes(x.status));
  const mrr=activeSubs.filter(x=>x.billing_kind==='recurring'&&x.currency==='USD').reduce((n,x)=>n+Number(x.price_cents||0)*Number(x.quantity||1),0);
  const monthRevenue=paid.filter(x=>x.currency==='USD'&&x.paid_at&&new Date(x.paid_at)>=monthStart).reduce((n,x)=>n+Number(x.amount_cents||0)-Number(x.refunded_cents||0),0),lifetimeRevenue=paid.filter(x=>x.currency==='USD').reduce((n,x)=>n+Number(x.amount_cents||0)-Number(x.refunded_cents||0),0);
  const activeSince=days=>userList.filter(x=>x.last_seen_at&&new Date(x.last_seen_at).getTime()>now-days*86400000).length;
  const planMix=Object.values(subscriptions.rows.reduce((m,x)=>{const k=x.plan_code||'none';m[k]=m[k]||{plan:k,count:0,mrrCents:0};m[k].count++;if(x.status==='active'&&x.billing_kind==='recurring'&&x.currency==='USD')m[k].mrrCents+=Number(x.price_cents||0)*Number(x.quantity||1);return m},{})).sort((a,b)=>b.count-a.count);
  const statusMix=Object.entries(subscriptions.rows.reduce((m,x)=>(m[x.status]=(m[x.status]||0)+1,m),{})).map(([status,count])=>({status,count})).sort((a,b)=>b.count-a.count);
  const t=totals.rows[0]||{};
  return json(res,200,{summary:{users:userList.length,active7:activeSince(7),active30:activeSince(30),active90:activeSince(90),workspaces:workspaces.rows.length,organizations:workspaces.rows.filter(x=>x.type==='organization').length,trainers:workspaces.rows.reduce((n,x)=>n+Number(x.trainers||0),0),clients:workspaces.rows.reduce((n,x)=>n+Number(x.clients||0),0),activeSubscriptions:activeSubs.length,trials:trialSubs.length,canceledSubscriptions:canceled.length,mrrCents:mrr,monthRevenueCents:monthRevenue,lifetimeRevenueCents:lifetimeRevenue,arpuCents:activeSubs.length?Math.round(mrr/activeSubs.length):0,totalWorkouts:Number(t.total_workouts||0),workouts30d:Number(t.workouts_30d||0),sets30d:Number(t.sets_30d||0),weighIns:Number(t.weigh_ins||0),newUsers30d:Number(t.new_users_30d||0),trialConversionPct:(activeSubs.length+trialSubs.length)?Math.round(activeSubs.length/(activeSubs.length+trialSubs.length)*100):0},series:{activity:activity.rows,signups:signups.rows,revenueDaily:revenueDaily.rows,revenueMonthly:revenueMonthly.rows},planMix,statusMix,users:userList,workspaces:workspaces.rows,subscriptions:subscriptions.rows,payments:payments.rows,plans:plans.rows});
}

async function workspaceInsights(req,res,url){
  const user=await needUser(req,res);if(!user)return;const workspaceId=url.searchParams.get('workspaceId');if(!workspaceId)return json(res,400,{error:'workspaceId required'});if(!(await canManageWorkspace(user,workspaceId)))return json(res,403,{error:'forbidden'});
  const [workspace,trainers,clients,billing,subs,revenue]=await Promise.all([
    query(`SELECT * FROM workspaces WHERE id=$1`,[workspaceId]),
    query(`SELECT u.id,u.display_name,u.email,max(s.last_seen_at) last_seen_at,count(DISTINCT l.client_user_id)::int clients FROM workspace_memberships m JOIN users u ON u.id=m.user_id LEFT JOIN sessions s ON s.user_id=u.id LEFT JOIN trainer_client_links l ON l.workspace_id=m.workspace_id AND l.trainer_user_id=u.id AND l.status='active' WHERE m.workspace_id=$1 AND m.role='trainer' AND m.status='active' AND m.ended_at IS NULL GROUP BY u.id ORDER BY u.display_name`,[workspaceId]),
    query(`SELECT DISTINCT u.id,u.display_name,u.email,max(w.started_at) AS last_workout_at,count(w.id) FILTER(WHERE w.started_at>=now()-interval '30 days')::int workouts_30d,count(w.id) FILTER(WHERE w.started_at>=now()-interval '7 days')::int workouts_7d FROM trainer_client_links l JOIN users u ON u.id=l.client_user_id LEFT JOIN workouts w ON w.user_id=u.id WHERE l.workspace_id=$1 AND l.status='active' GROUP BY u.id,u.display_name,u.email ORDER BY u.display_name`,[workspaceId]),
    query(`SELECT b.*,p.price_cents,p.currency,p.metadata AS plan_metadata,p.trainer_limit,p.client_limit FROM billing_subject_settings b LEFT JOIN billing_plans p ON p.code=b.plan_code WHERE b.subject_type='workspace' AND b.subject_id=$1`,[workspaceId]),
    query(`SELECT s.*,p.price_cents,p.currency,p.metadata AS plan_metadata FROM subscriptions s LEFT JOIN billing_plans p ON p.code=s.plan_code WHERE s.subject_type='workspace' AND s.subject_id=$1 ORDER BY s.created_at DESC`,[workspaceId]),
    query(`SELECT COALESCE(sum(amount_cents-refunded_cents) FILTER(WHERE status='paid' AND paid_at>=date_trunc('month',now())),0)::bigint month_cents,COALESCE(sum(amount_cents-refunded_cents) FILTER(WHERE status='paid'),0)::bigint lifetime_cents FROM payments WHERE subject_type='workspace' AND subject_id=$1`,[workspaceId])
  ]);return json(res,200,{workspace:workspace.rows[0]||null,trainers:trainers.rows,clients:clients.rows,billing:billing.rows[0]||null,subscriptions:subs.rows,revenue:revenue.rows[0]});
}

async function clientState(req,res,url,id){
  const user=await needUser(req,res);if(!user)return;const workspaceId=url.searchParams.get('workspaceId')||null;if(!(await canManageClient(user,id,workspaceId)))return json(res,403,{error:'forbidden'});
  const client=(await query(`SELECT id,display_name,email,locale,status,created_at FROM users WHERE id=$1`,[id])).rows[0];if(!client)return json(res,404,{error:'client not found'});
  const row=(await query(`SELECT state,updated_at FROM user_profile_states WHERE user_id=$1`,[id])).rows[0];return json(res,200,{client,state:row?.state||{lang:client.locale||'uk',unit:'kg',body:'male',workouts:[],bodyweight:[],routines:[],customEx:[]},updatedAt:row?.updated_at||null});
}

async function adminUserAction(req,res,id){
  const actor=await needAdmin(req,res);if(!actor)return;const b=await bodyJson(req),action=String(b.action||'');
  const target=(await query(`SELECT u.*,(SELECT s.ip_hint FROM sessions s WHERE s.user_id=u.id ORDER BY s.last_seen_at DESC NULLS LAST LIMIT 1) last_ip FROM users u WHERE u.id=$1`,[id])).rows[0];if(!target)return json(res,404,{error:'user not found'});
  if(actor.id===id&&['disable','revoke_access','delete','ban_email','ban_ip'].includes(action))return json(res,409,{error:'cannot lock your own admin account'});
  const client=await pool.connect();try{await client.query('BEGIN');
    if(action==='disable'||action==='revoke_access'){await client.query(`UPDATE users SET status='disabled',updated_at=now() WHERE id=$1`,[id]);await client.query(`DELETE FROM sessions WHERE user_id=$1`,[id]);if(action==='revoke_access')await client.query(`UPDATE entitlements SET ends_at=now() WHERE ends_at IS NULL AND ((subject_type='user' AND subject_id=$1) OR (subject_type='workspace' AND subject_id IN(SELECT workspace_id FROM workspace_memberships WHERE user_id=$1 AND role='owner' AND status='active')))`,[id])}
    else if(action==='enable'){await client.query(`UPDATE users SET status='active',updated_at=now() WHERE id=$1`,[id])}
    else if(action==='revoke_sessions'){await client.query(`DELETE FROM sessions WHERE user_id=$1`,[id])}
    else if(action==='ban_email'){if(!target.email)throw Object.assign(new Error('user has no email'),{status:409});await client.query(`INSERT INTO account_bans(kind,value_norm,reason,created_by_user_id) VALUES('email',$1,$2,$3) ON CONFLICT(kind,value_norm) WHERE active=true DO UPDATE SET reason=EXCLUDED.reason,created_by_user_id=EXCLUDED.created_by_user_id`,[target.email.trim().toLowerCase(),String(b.reason||'Admin ban').slice(0,300),actor.id]);await client.query(`UPDATE users SET status='disabled',updated_at=now() WHERE id=$1`,[id]);await client.query(`DELETE FROM sessions WHERE user_id=$1`,[id])}
    else if(action==='ban_ip'){if(!target.last_ip)throw Object.assign(new Error('user has no recent IP'),{status:409});await client.query(`INSERT INTO account_bans(kind,value_norm,reason,created_by_user_id) VALUES('ip',$1,$2,$3) ON CONFLICT(kind,value_norm) WHERE active=true DO UPDATE SET reason=EXCLUDED.reason,created_by_user_id=EXCLUDED.created_by_user_id`,[target.last_ip.trim().toLowerCase(),String(b.reason||'Admin IP ban').slice(0,300),actor.id]);await client.query(`DELETE FROM sessions WHERE ip_hint=$1 OR user_id=$2`,[target.last_ip,id])}
    else if(action==='unban'){if(target.email)await client.query(`UPDATE account_bans SET active=false WHERE kind='email' AND value_norm=$1 AND active=true`,[target.email.trim().toLowerCase()]);if(target.last_ip)await client.query(`UPDATE account_bans SET active=false WHERE kind='ip' AND value_norm=$1 AND active=true`,[target.last_ip.trim().toLowerCase()])}
    else if(action==='delete'){await client.query(`DELETE FROM users WHERE id=$1`,[id])}
    else throw Object.assign(new Error('unknown action'),{status:400});
    await client.query(`INSERT INTO audit_events(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,'user',$3,$4::jsonb)`,[actor.id,`admin.user.${action}`,id,JSON.stringify({email:target.email,ip:target.last_ip,reason:b.reason||null})]);
    await client.query('COMMIT');return json(res,200,{ok:true,action});
  }catch(e){try{await client.query('ROLLBACK')}catch{};throw e}finally{client.release()}
}

async function exerciseOverrides(req,res){const user=await needUser(req,res);if(!user)return;const {rows}=await query(`SELECT e.legacy_key,e.active,e.equipment_key,e.primary_muscle_key,e.metadata,COALESCE((SELECT jsonb_object_agg(t.locale,jsonb_build_object('name',t.name,'description',t.description,'instructions',t.instructions)) FROM exercise_translations t WHERE t.exercise_id=e.id AND t.locale IN('uk','ru','en')),'{}'::jsonb) translations FROM exercises e WHERE e.owner_scope='platform' AND e.legacy_key IS NOT NULL AND (e.active=false OR COALESCE((e.metadata->>'adminOverride')::boolean,false)=true OR EXISTS(SELECT 1 FROM exercise_translations tt WHERE tt.exercise_id=e.id AND tt.locale IN('uk','ru'))) ORDER BY e.legacy_key`);return json(res,200,{overrides:rows})}

async function adminExercises(req,res,url){
  const user=await needAdmin(req,res);if(!user)return;
  const locale=String(url.searchParams.get('locale')||'uk').slice(0,16),q=String(url.searchParams.get('q')||'').trim().slice(0,100),bodyPart=String(url.searchParams.get('bodyPart')||'').trim(),equipment=String(url.searchParams.get('equipment')||'').trim(),muscle=String(url.searchParams.get('muscle')||'').trim(),gender=String(url.searchParams.get('gender')||'').trim(),active=url.searchParams.get('active');
  const limit=Math.min(2000,Math.max(1,Number(url.searchParams.get('limit')||1500))),pattern=q?`%${q}%`:null;
  const {rows}=await query(`SELECT e.id,e.legacy_key,e.active,e.tracking_mode,e.equipment_key,e.primary_muscle_key,e.metadata,COALESCE(tl.name,en.name,e.legacy_key) name,COALESCE(tl.description,en.description) description,COALESCE(tl.instructions,en.instructions,'[]'::jsonb) instructions,en.name source_name,en.description source_description,COALESCE(en.instructions,'[]'::jsonb) source_instructions,CASE WHEN lower(COALESCE(en.name,'')) LIKE '%(female)%' THEN 'female' WHEN lower(COALESCE(en.name,'')) LIKE '%(male)%' THEN 'male' ELSE COALESCE(e.metadata->>'gender','unisex') END gender,COALESCE((SELECT jsonb_object_agg(t.locale,jsonb_build_object('name',t.name,'description',t.description,'instructions',COALESCE(t.instructions,'[]'::jsonb))) FROM exercise_translations t WHERE t.exercise_id=e.id AND t.locale IN('uk','ru','en')),'{}'::jsonb) translations FROM exercises e LEFT JOIN exercise_translations tl ON tl.exercise_id=e.id AND tl.locale=$1 LEFT JOIN exercise_translations en ON en.exercise_id=e.id AND en.locale='en' WHERE e.owner_scope='platform' AND ($2::text IS NULL OR COALESCE(tl.name,en.name,e.legacy_key) ILIKE $2 OR e.legacy_key ILIKE $2 OR COALESCE(e.equipment_key,'') ILIKE $2 OR COALESCE(e.primary_muscle_key,'') ILIKE $2) AND ($3::text='' OR COALESCE(e.metadata->>'bodyPart','')=$3) AND ($4::text='' OR COALESCE(e.equipment_key,'')=$4) AND ($5::text='' OR COALESCE(e.primary_muscle_key,'')=$5) AND ($6::text='' OR $6='all' OR CASE WHEN lower(COALESCE(en.name,'')) LIKE '%(female)%' THEN 'female' WHEN lower(COALESCE(en.name,'')) LIKE '%(male)%' THEN 'male' ELSE COALESCE(e.metadata->>'gender','unisex') END IN($6,'unisex')) AND ($7::text IS NULL OR e.active=$7::boolean) ORDER BY COALESCE(tl.name,en.name,e.legacy_key) LIMIT $8`,[locale,pattern,bodyPart,equipment,muscle,gender,active,limit]);
  const facets=await query(`SELECT array_remove(array_agg(DISTINCT metadata->>'bodyPart' ORDER BY metadata->>'bodyPart'),NULL) body_parts,array_remove(array_agg(DISTINCT equipment_key ORDER BY equipment_key),NULL) equipment,array_remove(array_agg(DISTINCT primary_muscle_key ORDER BY primary_muscle_key),NULL) muscles,count(*)::int total FROM exercises WHERE owner_scope='platform'`);
  return json(res,200,{exercises:rows,facets:facets.rows[0]||{},total:Number(facets.rows[0]?.total||rows.length)});
}
async function patchExercise(req,res,id){
  const user=await needAdmin(req,res);if(!user)return;const b=await bodyJson(req),found=(await query(`SELECT * FROM exercises WHERE id=$1 AND owner_scope='platform'`,[id])).rows[0];if(!found)return json(res,404,{error:'exercise not found'});
  const metadata={...(found.metadata||{}),adminOverride:true};for(const key of ['image','gif','imageMale','gifMale','imageFemale','gifFemale','gender'])if(b[key]!==undefined)metadata[key]=b[key]||null;if(b.bodyPart!==undefined)metadata.bodyPart=b.bodyPart||null;if(Array.isArray(b.secondaryMuscles))metadata.secondaryMuscles=b.secondaryMuscles;
  const client=await pool.connect();try{await client.query('BEGIN');await client.query(`UPDATE exercises SET active=$1,equipment_key=$2,primary_muscle_key=$3,metadata=$4::jsonb,updated_at=now() WHERE id=$5`,[b.active===undefined?found.active:!!b.active,b.equipment===undefined?found.equipment_key:(b.equipment||null),b.primaryMuscle===undefined?found.primary_muscle_key:(b.primaryMuscle||null),JSON.stringify(metadata),id]);
    const tr=b.translations&&typeof b.translations==='object'?b.translations:{};for(const locale of ['uk','ru','en']){const x=tr[locale];if(!x||typeof x!=='object')continue;const name=String(x.name||'').trim().slice(0,160);if(!name)continue;let instructions=x.instructions;if(typeof instructions==='string')instructions=instructions.split('\n').map(v=>v.trim()).filter(Boolean);if(!Array.isArray(instructions))instructions=[];await client.query(`INSERT INTO exercise_translations(exercise_id,locale,name,description,instructions) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(exercise_id,locale) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,instructions=EXCLUDED.instructions`,[id,locale,name,x.description||null,JSON.stringify(instructions)])}await client.query('COMMIT');return json(res,200,{ok:true})}catch(e){try{await client.query('ROLLBACK')}catch{};throw e}finally{client.release()}
}

await query('SELECT 1');await expireTrials();setInterval(expireTrials,10*60*1000).unref();console.log('[varangym-insights] database ready');
const server=http.createServer(async(req,res)=>{let url;try{url=new URL(req.url,'http://varangym.local')}catch{return json(res,400,{error:'bad request'})}try{
  if(req.method==='POST'&&url.pathname==='/trial/invite')return await publicTrialInvite(req,res);
  if(req.method==='POST'&&url.pathname==='/trial/activate')return await activateTrial(req,res);
  if(req.method==='GET'&&url.pathname==='/trial/status')return await trialStatus(req,res);
  if(req.method==='GET'&&url.pathname==='/insights/admin')return await adminInsights(req,res);
  if(req.method==='GET'&&url.pathname==='/insights/workspace')return await workspaceInsights(req,res,url);
  if(req.method==='GET'&&url.pathname==='/insights/exercise-overrides')return await exerciseOverrides(req,res);
  if(req.method==='GET'&&url.pathname==='/insights/exercises')return await adminExercises(req,res,url);
  let m=req.method==='GET'&&url.pathname.match(/^\/insights\/clients\/([0-9a-fA-F-]{36})\/state$/);if(m)return await clientState(req,res,url,m[1]);
  m=req.method==='POST'&&url.pathname.match(/^\/insights\/admin\/users\/([0-9a-fA-F-]{36})\/action$/);if(m)return await adminUserAction(req,res,m[1]);
  m=req.method==='PATCH'&&url.pathname.match(/^\/insights\/exercises\/([0-9a-fA-F-]{36})$/);if(m)return await patchExercise(req,res,m[1]);
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'varangym-insights',trialDays:TRIAL_DAYS});
  return json(res,404,{error:'not found'});
}catch(e){console.error('[insights]',req.method,url.pathname,e?.stack||e);const s=statusOf(e);if(!res.headersSent)json(res,s,{error:s===500?'server error':e.message})}});
server.listen(PORT,'0.0.0.0',()=>console.log(`[varangym-insights] listening on :${PORT}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>process.exit(0)));
