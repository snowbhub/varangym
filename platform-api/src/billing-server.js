import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const PORT = +(process.env.PORT || 3007);
const DATABASE_URL = process.env.DATABASE_URL;
const COOKIE_NAME = 'vg_session';
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString:DATABASE_URL, max:4, idleTimeoutMillis:30000 });
const query = (text,params=[]) => pool.query(text,params);

function json(res,status,body){const t=JSON.stringify(body);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(t),'cache-control':'no-store'});res.end(t)}
function cookies(h=''){const o={};for(const p of String(h).split(';')){const i=p.indexOf('=');if(i<0)continue;const k=p.slice(0,i).trim();if(!k)continue;try{o[k]=decodeURIComponent(p.slice(i+1).trim())}catch{o[k]=p.slice(i+1).trim()}}return o}
const hash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex');
function token(req){const c=cookies(req.headers.cookie||'')[COOKIE_NAME];if(c)return c;const a=String(req.headers.authorization||'');return a.startsWith('Bearer ')?a.slice(7).trim():null}
async function user(req){const t=token(req);if(!t)return null;const{rows}=await query(`SELECT u.id,u.display_name,u.email,u.status,u.is_platform_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(t)]);return rows[0]?.status==='active'?rows[0]:null}
async function needUser(req,res){const u=await user(req);if(!u){json(res,401,{error:'not signed in'});return null}return u}
async function body(req){const chunks=[];let n=0;for await(const c of req){n+=c.length;if(n>256*1024)throw Object.assign(new Error('body too large'),{status:413});chunks.push(c)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('invalid json'),{status:400})}}

async function plans(_req,res){
  const{rows}=await query(`SELECT code,audience,billing_kind,interval_unit,price_cents,currency,trainer_limit,client_limit,metadata FROM billing_plans WHERE active=true ORDER BY sort_order`);
  json(res,200,{plans:rows});
}

async function myBilling(req,res){
  const u=await needUser(req,res);if(!u)return;
  const memberships=await query(`SELECT m.workspace_id,m.role,w.name,w.type FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 AND m.status='active' AND m.ended_at IS NULL`,[u.id]);
  const userSubs=await query(`SELECT id,plan_code,status,current_period_end,cancel_at_period_end,quantity,provider,created_at FROM subscriptions WHERE subject_type='user' AND subject_id=$1 ORDER BY created_at DESC`,[u.id]);
  const userSettings=await query(`SELECT plan_code,lifetime_access,extra_trainers,billing_email FROM billing_subject_settings WHERE subject_type='user' AND subject_id=$1`,[u.id]);
  const workspaceIds=memberships.rows.filter(m=>['owner','admin'].includes(m.role)).map(m=>m.workspace_id);
  let workspaceSubs=[];
  if(workspaceIds.length){
    const r=await query(`SELECT subject_id AS workspace_id,id,plan_code,status,current_period_end,cancel_at_period_end,quantity,provider,created_at FROM subscriptions WHERE subject_type='workspace' AND subject_id=ANY($1::uuid[]) ORDER BY created_at DESC`,[workspaceIds]);
    workspaceSubs=r.rows;
  }
  json(res,200,{user:{id:u.id,email:u.email},memberships:memberships.rows,userSubscriptions:userSubs.rows,userBilling:userSettings.rows[0]||null,workspaceSubscriptions:workspaceSubs});
}

async function checkout(req,res){
  const u=await needUser(req,res);if(!u)return;
  const b=await body(req);
  const code=String(b.planCode||'');
  const{rows}=await query(`SELECT * FROM billing_plans WHERE code=$1 AND active=true`,[code]);
  const plan=rows[0]; if(!plan)return json(res,404,{error:'plan not found'});
  // Provider wiring is deliberately explicit. We do not pretend payment succeeded when merchant
  // credentials are absent; the UI can show prices now and will switch to a real checkout as soon
  // as BILLING_PROVIDER is configured.
  const provider=String(process.env.BILLING_PROVIDER||'').trim();
  if(!provider) return json(res,503,{error:'payments are not configured yet',code:'BILLING_NOT_CONFIGURED',plan:{code:plan.code,price_cents:plan.price_cents,currency:plan.currency}});
  return json(res,501,{error:`billing provider ${provider} checkout adapter is not installed`,code:'BILLING_ADAPTER_MISSING'});
}

async function adminSummary(req,res){
  const u=await needUser(req,res);if(!u)return;if(!u.is_platform_admin)return json(res,403,{error:'forbidden'});
  const [p,s,plans]=await Promise.all([
    query(`SELECT currency,COALESCE(sum(amount_cents-refunded_cents) FILTER(WHERE status='paid'),0)::bigint lifetime_cents,COALESCE(sum(amount_cents-refunded_cents) FILTER(WHERE status='paid' AND paid_at>=date_trunc('month',now())),0)::bigint month_cents,count(*) FILTER(WHERE status='paid')::int paid_count FROM payments GROUP BY currency`),
    query(`SELECT plan_code,status,count(*)::int count FROM subscriptions GROUP BY plan_code,status ORDER BY plan_code,status`),
    query(`SELECT code,audience,billing_kind,price_cents,currency,trainer_limit,client_limit,metadata FROM billing_plans WHERE active=true ORDER BY sort_order`)
  ]);
  json(res,200,{revenue:p.rows,subscriptions:s.rows,plans:plans.rows});
}

const server=http.createServer(async(req,res)=>{
  let url;try{url=new URL(req.url,'http://varangym.local')}catch{return json(res,400,{error:'bad request'})}
  try{
    if(req.method==='GET'&&url.pathname==='/billing/plans')return plans(req,res);
    if(req.method==='GET'&&url.pathname==='/billing/me')return myBilling(req,res);
    if(req.method==='POST'&&url.pathname==='/billing/checkout')return checkout(req,res);
    if(req.method==='GET'&&url.pathname==='/billing/admin/summary')return adminSummary(req,res);
    if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'varangym-billing'});
    return json(res,404,{error:'not found'});
  }catch(e){console.error('[billing]',e);json(res,Number(e.status)||500,{error:Number(e.status)<500?e.message:'server error'})}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`[varangym-billing] listening on :${PORT}`));
for(const s of ['SIGTERM','SIGINT'])process.on(s,()=>server.close(()=>process.exit(0)));
