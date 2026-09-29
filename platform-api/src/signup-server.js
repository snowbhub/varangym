import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

const { Pool } = pg;
const PORT = +(process.env.PORT || 3008);
const DATABASE_URL = process.env.DATABASE_URL;
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://localhost:8080';
const RP_ID = process.env.RP_ID || 'localhost';
const RP_NAME = process.env.RP_NAME || 'VARANGYM';
const COOKIE_NAME = 'vg_session';
const SESSION_DAYS = Math.max(1, +(process.env.SESSION_DAYS || 30) || 30);
const SECURE_COOKIE = /^https:/i.test(APP_ORIGIN);
const MAX_BODY = 1024 * 1024;
const PLATFORM_DIRECT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
const pool = new Pool({ connectionString: DATABASE_URL, max: 4, idleTimeoutMillis: 30000 });
const query = (text, params = []) => pool.query(text, params);

function json(res, status, body, headers = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'content-length':Buffer.byteLength(text), 'cache-control':'no-store', ...headers });
  res.end(text);
}
async function bodyJson(req) {
  let size=0; const chunks=[];
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw Object.assign(new Error('body too large'),{status:413}); chunks.push(chunk); }
  if (!chunks.length) return {};
  try { const v=JSON.parse(Buffer.concat(chunks).toString('utf8')); if(!v||typeof v!=='object'||Array.isArray(v)) throw new Error(); return v; }
  catch { throw Object.assign(new Error('invalid json'),{status:400}); }
}
const hashToken = v => crypto.createHash('sha256').update(String(v||'')).digest('hex');
const randomToken = bytes => crypto.randomBytes(bytes).toString('base64url');
function requestIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().slice(0,80) || null; }
function geo(req) {
  const h=req.headers;
  const pick=(...xs)=>xs.map(x=>String(x||'').trim()).find(Boolean)||null;
  return {
    country: pick(h['cf-ipcountry'],h['x-vercel-ip-country'],h['x-geo-country'],h['x-appengine-country']),
    region: pick(h['x-vercel-ip-country-region'],h['x-geo-region'],h['x-appengine-region']),
    city: pick(h['x-vercel-ip-city'],h['x-geo-city'],h['x-appengine-city']),
  };
}
function cookie(token) { return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS*86400}${SECURE_COOKIE?'; Secure':''}`; }
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());}
function slugify(v){return String(v||'varangym').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'varangym';}
async function uniqueSlug(db,name){const base=slugify(name);for(let i=0;i<30;i++){const s=(base+(i?`-${Math.random().toString(36).slice(2,6)}`:'')).slice(0,60);const x=await db.query('SELECT 1 FROM workspaces WHERE slug=$1',[s]);if(!x.rowCount)return s;}return `${base}-${Date.now().toString(36)}`.slice(0,60);}
async function membership(db,workspaceId,userId,role){await db.query(`INSERT INTO workspace_memberships(workspace_id,user_id,role,status) VALUES($1,$2,$3,'active') ON CONFLICT DO NOTHING`,[workspaceId,userId,role]);}
async function membershipsFor(db,userId){const {rows}=await db.query(`SELECT m.id,m.workspace_id,m.role,m.status,w.type AS workspace_type,w.name AS workspace_name,w.slug AS workspace_slug FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 AND m.status='active' AND m.ended_at IS NULL ORDER BY w.name,m.role`,[userId]);return rows;}
async function issueSession(db,userId,req){const token=randomToken(32);const g=geo(req);await db.query(`INSERT INTO sessions(token_hash,user_id,expires_at,user_agent,ip_hint,country_code,region,city) VALUES($1,$2,now()+($3||' days')::interval,$4,$5,$6,$7,$8)`,[hashToken(token),userId,String(SESSION_DAYS),String(req.headers['user-agent']||'').slice(0,500)||null,requestIp(req),g.country,g.region,g.city]);return token;}

async function provisionTrial(db,user,signupRole,workspaceName){
  const role = ['solo','trainer','business'].includes(signupRole) ? signupRole : 'solo';
  let subjectType='user', subjectId=user.id, workspaceId=PLATFORM_DIRECT_WORKSPACE_ID, planCode='solo_monthly';
  if(role==='solo') {
    await membership(db,PLATFORM_DIRECT_WORKSPACE_ID,user.id,'client');
  } else if(role==='trainer') {
    const name=String(workspaceName||`${user.display_name} Coaching`).trim().slice(0,100)||`${user.display_name} Coaching`;
    const slug=await uniqueSlug(db,name);
    const r=await db.query(`INSERT INTO workspaces(type,name,slug,status) VALUES('independent_trainer',$1,$2,'active') RETURNING id`,[name,slug]);
    workspaceId=r.rows[0].id; subjectType='workspace'; subjectId=workspaceId; planCode='coach_5';
    await membership(db,workspaceId,user.id,'owner'); await membership(db,workspaceId,user.id,'trainer');
  } else {
    const name=String(workspaceName||`${user.display_name} Business`).trim().slice(0,100)||`${user.display_name} Business`;
    const slug=await uniqueSlug(db,name);
    const r=await db.query(`INSERT INTO workspaces(type,name,slug,status) VALUES('organization',$1,$2,'active') RETURNING id`,[name,slug]);
    workspaceId=r.rows[0].id; subjectType='workspace'; subjectId=workspaceId; planCode='business_5_50';
    await membership(db,workspaceId,user.id,'owner');
    await db.query(`INSERT INTO organization_profiles(workspace_id,default_locale,timezone) VALUES($1,$2,'Europe/Berlin') ON CONFLICT(workspace_id) DO NOTHING`,[workspaceId,user.locale||'uk']);
  }
  const p=(await db.query(`SELECT * FROM billing_plans WHERE code=$1 AND active=true`,[planCode])).rows[0];
  if(!p) throw new Error(`trial plan ${planCode} is not configured`);
  const trialEnd=new Date(Date.now()+30*86400000);
  await db.query(`INSERT INTO billing_subject_settings(subject_type,subject_id,plan_code,lifetime_access,billing_email,metadata,updated_at) VALUES($1,$2,$3,false,$4,$5::jsonb,now()) ON CONFLICT(subject_type,subject_id) DO UPDATE SET plan_code=EXCLUDED.plan_code,billing_email=EXCLUDED.billing_email,metadata=billing_subject_settings.metadata||EXCLUDED.metadata,updated_at=now()`,[subjectType,subjectId,planCode,user.email,JSON.stringify({trial:true,source:'self_signup',signupRole:role})]);
  const sub=(await db.query(`INSERT INTO subscriptions(subject_type,subject_id,provider,plan_code,status,current_period_end,trial_ends_at,metadata) VALUES($1,$2,'trial',$3,'trialing',$4,$4,$5::jsonb) RETURNING id`,[subjectType,subjectId,planCode,trialEnd,JSON.stringify({source:'self_signup'})])).rows[0];
  const entitlements=[['access',{enabled:true,audience:p.audience}],['client_limit',{limit:p.client_limit}],['trainer_limit',{limit:p.trainer_limit}]];
  for(const [key,value] of entitlements){await db.query(`INSERT INTO entitlements(subject_type,subject_id,key,value,source_subscription_id,starts_at,ends_at) VALUES($1,$2,$3,$4::jsonb,$5,now(),$6) ON CONFLICT(subject_type,subject_id,key) WHERE ends_at IS NULL DO UPDATE SET value=EXCLUDED.value,source_subscription_id=EXCLUDED.source_subscription_id,starts_at=now(),ends_at=EXCLUDED.ends_at`,[subjectType,subjectId,key,JSON.stringify(value),sub.id,trialEnd]);}
  return {workspaceId,signupRole:role,planCode,trialEndsAt:trialEnd.toISOString(),subjectType,subjectId};
}

async function options(req,res){
  const b=await bodyJson(req); const name=String(b.name||'').trim().slice(0,80); const email=String(b.email||'').trim().toLowerCase().slice(0,320); const signupRole=String(b.signupRole||'solo'); const workspaceName=String(b.workspaceName||'').trim().slice(0,100);
  if(name.length<2)return json(res,400,{error:'name required'}); if(!validEmail(email))return json(res,400,{error:'valid email required'}); if(!['solo','trainer','business'].includes(signupRole))return json(res,400,{error:'invalid signup role'});
  if((await query('SELECT 1 FROM users WHERE lower(email)=lower($1)',[email])).rowCount)return json(res,409,{error:'email already registered'});
  const provisionalUserId=crypto.randomUUID();
  const opts=await generateRegistrationOptions({rpName:RP_NAME,rpID:RP_ID,userID:Buffer.from(provisionalUserId,'utf8'),userName:email,userDisplayName:name,timeout:60000,attestationType:'none',authenticatorSelection:{residentKey:'required',userVerification:'preferred'}});
  const cid=crypto.randomUUID();
  await query(`INSERT INTO auth_challenges(id,purpose,challenge,provisional_user_id,display_name,email,registration_metadata,expires_at) VALUES($1,'register',$2,$3,$4,$5,$6::jsonb,now()+interval '5 minutes')`,[cid,opts.challenge,provisionalUserId,name,email,JSON.stringify({signupRole,workspaceName})]);
  return json(res,200,{cid,options:opts,signupRole,trialDays:30});
}

async function verify(req,res){
  const b=await bodyJson(req); if(!b.cid||!b.credential)return json(res,400,{error:'cid and credential required'});
  const c=(await query(`SELECT * FROM auth_challenges WHERE id=$1 AND purpose='register' AND invite_id IS NULL AND expires_at>now()`,[b.cid])).rows[0];
  if(!c)return json(res,400,{error:'challenge expired — try again'});
  let verification; try{verification=await verifyRegistrationResponse({response:b.credential,expectedChallenge:c.challenge,expectedOrigin:APP_ORIGIN,expectedRPID:RP_ID,requireUserVerification:false});}catch(e){console.error('[signup] verification',e?.message||e);return json(res,400,{error:'passkey verification failed'});}
  if(!verification.verified||!verification.registrationInfo)return json(res,400,{error:'not verified'});
  const credential=verification.registrationInfo.credential; const client=await pool.connect(); let token,trial;
  try{
    await client.query('BEGIN');
    const locked=(await client.query(`SELECT * FROM auth_challenges WHERE id=$1 AND purpose='register' AND invite_id IS NULL AND expires_at>now() FOR UPDATE`,[b.cid])).rows[0];
    if(!locked)throw Object.assign(new Error('challenge expired — try again'),{status:400});
    await client.query(`INSERT INTO users(id,display_name,email,locale,status) VALUES($1,$2,$3,$4,'active')`,[locked.provisional_user_id,locked.display_name,locked.email,String(b.locale||'uk').slice(0,16)]);
    await client.query(`INSERT INTO auth_credentials(id,user_id,public_key,counter,transports) VALUES($1,$2,$3,$4,$5::jsonb)`,[credential.id,locked.provisional_user_id,Buffer.from(credential.publicKey),credential.counter||0,JSON.stringify(b.credential?.response?.transports||[])]);
    const u={id:locked.provisional_user_id,display_name:locked.display_name,email:locked.email,locale:String(b.locale||'uk').slice(0,16)};
    trial=await provisionTrial(client,u,locked.registration_metadata?.signupRole||'solo',locked.registration_metadata?.workspaceName||'');
    await client.query('DELETE FROM auth_challenges WHERE id=$1',[b.cid]);
    token=await issueSession(client,u.id,req);
    await client.query(`INSERT INTO audit_events(actor_user_id,workspace_id,action,target_type,target_id,metadata) VALUES($1,$2,'auth.register.trial','user',$1,$3::jsonb)`,[u.id,trial.workspaceId,JSON.stringify({signupRole:trial.signupRole,planCode:trial.planCode,trialEndsAt:trial.trialEndsAt})]);
    await client.query('COMMIT');
    const user=(await query(`SELECT id,display_name,email,status,locale,is_platform_admin,created_at FROM users WHERE id=$1`,[u.id])).rows[0];
    return json(res,200,{user,memberships:await membershipsFor({query},u.id),trial},{'set-cookie':cookie(token)});
  }catch(e){try{await client.query('ROLLBACK')}catch{};console.error('[signup]',e?.stack||e);return json(res,Number(e?.status)||500,{error:Number(e?.status)<500?e.message:'registration failed'});}finally{client.release();}
}

const server=http.createServer(async(req,res)=>{let url;try{url=new URL(req.url,'http://varangym.local')}catch{return json(res,400,{error:'bad request'})}if(req.method==='POST'&&url.pathname==='/signup/register/options')return options(req,res);if(req.method==='POST'&&url.pathname==='/signup/register/verify')return verify(req,res);if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'varangym-signup'});return json(res,404,{error:'not found'});});
server.listen(PORT,'0.0.0.0',()=>console.log(`[varangym-signup] listening on :${PORT}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>process.exit(0)));
