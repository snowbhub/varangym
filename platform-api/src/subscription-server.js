import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const PORT = +(process.env.PORT || 3009);
const DATABASE_URL = process.env.DATABASE_URL;
const COOKIE_NAME = 'vg_session';
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, max: 3, idleTimeoutMillis: 30000 });
const query = (text, params=[]) => pool.query(text, params);

function json(res,status,body){const text=JSON.stringify(body);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(text),'cache-control':'no-store'});res.end(text)}
function cookies(header=''){const out={};for(const part of String(header).split(';')){const i=part.indexOf('=');if(i<0)continue;const k=part.slice(0,i).trim();if(!k)continue;try{out[k]=decodeURIComponent(part.slice(i+1).trim())}catch{out[k]=part.slice(i+1).trim()}}return out}
const hash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex');
function token(req){const c=cookies(req.headers.cookie||'')[COOKIE_NAME];if(c)return c;const a=String(req.headers.authorization||'');return a.startsWith('Bearer ')?a.slice(7).trim():null}
async function user(req){const t=token(req);if(!t)return null;const {rows}=await query(`SELECT u.id,u.email,u.status,u.is_platform_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(t)]);return rows[0]?.status==='active'?rows[0]:null}
async function body(req){const chunks=[];let n=0;for await(const c of req){n+=c.length;if(n>256*1024)throw Object.assign(new Error('body too large'),{status:413});chunks.push(c)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('invalid json'),{status:400})}}
async function canManage(u,sub){if(u.is_platform_admin)return true;if(sub.subject_type==='user')return sub.subject_id===u.id;const {rowCount}=await query(`SELECT 1 FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2 AND role IN('owner','admin') AND status='active' AND ended_at IS NULL LIMIT 1`,[sub.subject_id,u.id]);return !!rowCount}
async function findSub(id){const {rows}=await query(`SELECT * FROM subscriptions WHERE id=$1`,[id]);return rows[0]||null}

async function stripeUpdate(providerId,cancelAtPeriodEnd){
  const secret=process.env.STRIPE_SECRET_KEY;
  if(!secret)throw Object.assign(new Error('Stripe is not configured'),{status:503});
  const form=new URLSearchParams();form.set('cancel_at_period_end',cancelAtPeriodEnd?'true':'false');
  const r=await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(providerId)}`,{method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/x-www-form-urlencoded'},body:form});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error?.message||`Stripe HTTP ${r.status}`),{status:502});return d;
}

async function cancel(req,res){
  const u=await user(req);if(!u)return json(res,401,{error:'not signed in'});const b=await body(req);const sub=await findSub(String(b.subscriptionId||''));if(!sub)return json(res,404,{error:'subscription not found'});if(!await canManage(u,sub))return json(res,403,{error:'forbidden'});
  if(sub.provider==='stripe'&&sub.provider_subscription_id){const remote=await stripeUpdate(sub.provider_subscription_id,true);await query(`UPDATE subscriptions SET cancel_at_period_end=true,current_period_end=COALESCE($1,current_period_end),updated_at=now() WHERE id=$2`,[remote.current_period_end?new Date(remote.current_period_end*1000):null,sub.id]);return json(res,200,{ok:true,cancelAtPeriodEnd:true,currentPeriodEnd:remote.current_period_end?new Date(remote.current_period_end*1000):sub.current_period_end})}
  if(sub.provider==='varangym_trial'){
    await query(`UPDATE subscriptions SET status='canceled',cancel_at_period_end=false,current_period_end=now(),trial_ends_at=LEAST(COALESCE(trial_ends_at,now()),now()),updated_at=now() WHERE id=$1`,[sub.id]);
    await query(`UPDATE entitlements SET ends_at=now() WHERE source_subscription_id=$1 AND ends_at IS NULL`,[sub.id]);
    return json(res,200,{ok:true,canceled:true});
  }
  return json(res,409,{error:'this subscription cannot be changed here'});
}

async function resume(req,res){
  const u=await user(req);if(!u)return json(res,401,{error:'not signed in'});const b=await body(req);const sub=await findSub(String(b.subscriptionId||''));if(!sub)return json(res,404,{error:'subscription not found'});if(!await canManage(u,sub))return json(res,403,{error:'forbidden'});
  if(sub.provider!=='stripe'||!sub.provider_subscription_id)return json(res,409,{error:'only Stripe subscriptions can be resumed'});
  const remote=await stripeUpdate(sub.provider_subscription_id,false);await query(`UPDATE subscriptions SET cancel_at_period_end=false,current_period_end=COALESCE($1,current_period_end),updated_at=now() WHERE id=$2`,[remote.current_period_end?new Date(remote.current_period_end*1000):null,sub.id]);return json(res,200,{ok:true,cancelAtPeriodEnd:false,currentPeriodEnd:remote.current_period_end?new Date(remote.current_period_end*1000):sub.current_period_end});
}

await query('SELECT 1');
console.log('[varangym-subscription] database ready');
const server=http.createServer(async(req,res)=>{let url;try{url=new URL(req.url,'http://varangym.local')}catch{return json(res,400,{error:'bad request'})}try{if(req.method==='POST'&&url.pathname==='/subscription/cancel')return await cancel(req,res);if(req.method==='POST'&&url.pathname==='/subscription/resume')return await resume(req,res);if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'varangym-subscription'});return json(res,404,{error:'not found'})}catch(e){console.error('[subscription]',e?.stack||e);json(res,Number(e.status)||500,{error:Number(e.status)<500?e.message:'server error'})}});
server.listen(PORT,'0.0.0.0',()=>console.log(`[varangym-subscription] listening on :${PORT}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>process.exit(0)));
