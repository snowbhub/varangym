import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';
import { encryptInviteCode, decryptInviteCode, inviteCode, inviteHash } from './security.js';
import { PLATFORM_DIRECT_WORKSPACE_ID } from './provisioning.js';

const { Pool } = pg;
const PORT = +(process.env.PORT || 3007);
const DATABASE_URL = process.env.DATABASE_URL;
const COOKIE_NAME = 'vg_session';
const MAX_BODY = 512 * 1024;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString:DATABASE_URL, max:4, idleTimeoutMillis:30000 });
const query = (text,params=[]) => pool.query(text,params);

function json(res,status,body){const t=JSON.stringify(body);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(t),'cache-control':'no-store'});res.end(t)}
function cookies(h=''){const o={};for(const p of String(h).split(';')){const i=p.indexOf('=');if(i<0)continue;const k=p.slice(0,i).trim();if(!k)continue;try{o[k]=decodeURIComponent(p.slice(i+1).trim())}catch{o[k]=p.slice(i+1).trim()}}return o}
const hash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex');
function token(req){const c=cookies(req.headers.cookie||'')[COOKIE_NAME];if(c)return c;const a=String(req.headers.authorization||'');return a.startsWith('Bearer ')?a.slice(7).trim():null}
async function user(req){const t=token(req);if(!t)return null;const{rows}=await query(`SELECT u.id,u.display_name,u.email,u.status,u.is_platform_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(t)]);return rows[0]?.status==='active'?rows[0]:null}
async function needUser(req,res){const u=await user(req);if(!u){json(res,401,{error:'not signed in'});return null}return u}
async function rawBody(req){const chunks=[];let n=0;for await(const c of req){n+=c.length;if(n>MAX_BODY)throw Object.assign(new Error('body too large'),{status:413});chunks.push(c)}return Buffer.concat(chunks)}
async function body(req){const b=await rawBody(req);if(!b.length)return{};try{const v=JSON.parse(b.toString('utf8'));if(!v||typeof v!=='object'||Array.isArray(v))throw new Error();return v}catch{throw Object.assign(new Error('invalid json'),{status:400})}}
function publicOrigin(req){return String(process.env.ORIGIN||`https://${req.headers.host||''}`).replace(/\/$/,'')}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim())}

async function plans(_req,res){
  const{rows}=await query(`SELECT code,audience,billing_kind,interval_unit,price_cents,currency,trainer_limit,client_limit,metadata FROM billing_plans WHERE active=true ORDER BY sort_order`);
  json(res,200,{plans:rows,paymentsConfigured:String(process.env.BILLING_PROVIDER||'').toLowerCase()==='stripe'&&!!process.env.STRIPE_SECRET_KEY});
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

async function stripeCreateSession(plan,email,req,{subjectType=null,subjectId=null}={}){
  const secret=process.env.STRIPE_SECRET_KEY;
  if(!secret) throw Object.assign(new Error('Stripe is not configured'),{status:503,code:'BILLING_NOT_CONFIGURED'});
  const origin=publicOrigin(req);
  const form=new URLSearchParams();
  form.set('mode',plan.billing_kind==='recurring'?'subscription':'payment');
  form.set('customer_email',email);
  form.set('line_items[0][quantity]','1');
  form.set('line_items[0][price_data][currency]',String(plan.currency||'USD').toLowerCase());
  form.set('line_items[0][price_data][unit_amount]',String(plan.price_cents));
  form.set('line_items[0][price_data][product_data][name]',String(plan.metadata?.label||`VARANGYM ${plan.code}`));
  if(plan.billing_kind==='recurring') form.set('line_items[0][price_data][recurring][interval]',plan.interval_unit||'month');
  form.set('success_url',`${origin}/?checkout={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url',`${origin}/`);
  form.set('metadata[plan_code]',plan.code);
  form.set('metadata[audience]',plan.audience);
  if(subjectType) form.set('metadata[subject_type]',subjectType);
  if(subjectId) form.set('metadata[subject_id]',subjectId);
  if(plan.billing_kind==='recurring') {
    form.set('subscription_data[metadata][plan_code]',plan.code);
    if(subjectType) form.set('subscription_data[metadata][subject_type]',subjectType);
    if(subjectId) form.set('subscription_data[metadata][subject_id]',subjectId);
  }
  const r=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/x-www-form-urlencoded'},body:form});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw Object.assign(new Error(d.error?.message||`Stripe HTTP ${r.status}`),{status:502});
  return d;
}

async function publicSoloCheckout(req,res){
  const b=await body(req);
  const email=String(b.email||'').trim().toLowerCase();
  if(!validEmail(email)) return json(res,400,{error:'valid email required'});
  const code=String(b.planCode||'');
  const{rows}=await query(`SELECT * FROM billing_plans WHERE code=$1 AND audience='solo' AND active=true`,[code]);
  const plan=rows[0];if(!plan)return json(res,404,{error:'solo plan not found'});
  if(String(process.env.BILLING_PROVIDER||'').toLowerCase()!=='stripe') return json(res,503,{error:'payments are not configured yet',code:'BILLING_NOT_CONFIGURED'});
  const session=await stripeCreateSession(plan,email,req);
  await query(`INSERT INTO checkout_grants(provider,provider_checkout_id,provider_customer_id,email,plan_code,amount_cents,currency,status,metadata)
    VALUES('stripe',$1,$2,$3,$4,$5,$6,'pending',$7::jsonb)
    ON CONFLICT(provider,provider_checkout_id) DO NOTHING`,[session.id,session.customer||null,email,plan.code,plan.price_cents,plan.currency,JSON.stringify({mode:session.mode})]);
  json(res,201,{checkoutId:session.id,url:session.url});
}

async function authenticatedCheckout(req,res){
  const u=await needUser(req,res);if(!u)return;
  const b=await body(req);
  const code=String(b.planCode||'');
  const{rows}=await query(`SELECT * FROM billing_plans WHERE code=$1 AND active=true`,[code]);
  const plan=rows[0];if(!plan)return json(res,404,{error:'plan not found'});
  if(String(process.env.BILLING_PROVIDER||'').toLowerCase()!=='stripe') return json(res,503,{error:'payments are not configured yet',code:'BILLING_NOT_CONFIGURED'});
  let subjectType='user',subjectId=u.id;
  if(plan.audience!=='solo') {
    const workspaceId=String(b.workspaceId||'');
    if(!workspaceId)return json(res,400,{error:'workspaceId required'});
    const {rows:ms}=await query(`SELECT role,w.type FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.status='active' AND m.ended_at IS NULL`,[workspaceId,u.id]);
    const owner=ms.some(x=>x.role==='owner'||x.role==='admin');
    if(!owner&&!u.is_platform_admin)return json(res,403,{error:'forbidden'});
    if(plan.audience==='trainer'&&!ms.some(x=>x.role==='trainer'||x.role==='owner'))return json(res,400,{error:'trainer plan requires trainer workspace'});
    if(plan.audience==='organization'&&!ms.some(x=>x.type==='organization'))return json(res,400,{error:'business plan requires organization workspace'});
    subjectType='workspace';subjectId=workspaceId;
  }
  const email=String(b.email||u.email||'').trim().toLowerCase();
  if(!validEmail(email))return json(res,400,{error:'billing email required'});
  const session=await stripeCreateSession(plan,email,req,{subjectType,subjectId});
  await query(`INSERT INTO checkout_grants(provider,provider_checkout_id,provider_customer_id,email,plan_code,amount_cents,currency,status,metadata)
    VALUES('stripe',$1,$2,$3,$4,$5,$6,'pending',$7::jsonb) ON CONFLICT(provider,provider_checkout_id) DO NOTHING`,
    [session.id,session.customer||null,email,plan.code,plan.price_cents,plan.currency,JSON.stringify({subjectType,subjectId,mode:session.mode})]);
  json(res,201,{checkoutId:session.id,url:session.url});
}

function verifyStripe(raw,header){
  const secret=process.env.STRIPE_WEBHOOK_SECRET;if(!secret)return false;
  const parts=String(header||'').split(',').map(x=>x.trim());
  const t=parts.find(x=>x.startsWith('t='))?.slice(2);
  const sigs=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));
  if(!t||!sigs.length||Math.abs(Date.now()/1000-Number(t))>300)return false;
  const expected=crypto.createHmac('sha256',secret).update(`${t}.${raw.toString('utf8')}`).digest('hex');
  return sigs.some(s=>{try{return crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(s,'hex'))}catch{return false}});
}

async function createPaidInvite(grant,session){
  if(grant.invite_id)return grant.invite_id;
  const code=inviteCode(3,4);
  const meta={
    source:'paid-solo-checkout',billingPlan:grant.plan_code,checkoutId:grant.provider_checkout_id,
    provider:'stripe',providerCustomerId:session.customer||grant.provider_customer_id||null,
    providerSubscriptionId:session.subscription||null,providerPaymentId:session.payment_intent||null,
    amountCents:Number(session.amount_total||grant.amount_cents||0),currency:String(session.currency||grant.currency||'usd').toUpperCase()
  };
  const{rows}=await query(`INSERT INTO invites(token_hash,token_encrypted,workspace_id,created_by_user_id,target_role,trainer_user_id,email,max_uses,use_count,expires_at,metadata)
    VALUES($1,$2,$3,NULL,'solo_client',NULL,$4,1,0,now()+interval '14 days',$5::jsonb) RETURNING id`,
    [inviteHash(code),encryptInviteCode(code),PLATFORM_DIRECT_WORKSPACE_ID,grant.email,JSON.stringify(meta)]);
  await query(`UPDATE checkout_grants SET invite_id=$2,status='paid',provider_customer_id=COALESCE($3,provider_customer_id),provider_subscription_id=$4,provider_payment_id=$5,amount_cents=COALESCE($6,amount_cents),currency=COALESCE($7,currency),completed_at=now(),metadata=metadata||$8::jsonb WHERE id=$1`,
    [grant.id,rows[0].id,session.customer||null,session.subscription||null,session.payment_intent||null,session.amount_total??null,session.currency?String(session.currency).toUpperCase():null,JSON.stringify({paymentStatus:session.payment_status,mode:session.mode})]);
  return rows[0].id;
}

async function stripeWebhook(req,res){
  const raw=await rawBody(req);
  if(!verifyStripe(raw,req.headers['stripe-signature']))return json(res,400,{error:'invalid signature'});
  const event=JSON.parse(raw.toString('utf8'));
  const dupe=await query(`SELECT 1 FROM billing_events WHERE provider='stripe' AND provider_event_id=$1`,[event.id]);
  if(dupe.rowCount)return json(res,200,{received:true,duplicate:true});
  await query(`INSERT INTO billing_events(provider,provider_event_id,event_type,payload,processed_at) VALUES('stripe',$1,$2,$3::jsonb,now())`,[event.id,event.type,JSON.stringify(event)]);
  if(event.type==='checkout.session.completed'){
    const session=event.data?.object||{};
    const{rows}=await query(`SELECT * FROM checkout_grants WHERE provider='stripe' AND provider_checkout_id=$1 FOR UPDATE`,[session.id]);
    const grant=rows[0];
    if(grant){
      if(grant.plan_code.startsWith('solo_')) await createPaidInvite(grant,session);
      else await query(`UPDATE checkout_grants SET status='paid',provider_customer_id=COALESCE($2,provider_customer_id),provider_subscription_id=$3,provider_payment_id=$4,amount_cents=COALESCE($5,amount_cents),currency=COALESCE($6,currency),completed_at=now() WHERE id=$1`,[grant.id,session.customer||null,session.subscription||null,session.payment_intent||null,session.amount_total??null,session.currency?String(session.currency).toUpperCase():null]);
    }
  }
  return json(res,200,{received:true});
}

async function checkoutStatus(req,res,url){
  const id=String(url.searchParams.get('id')||'');if(!id)return json(res,400,{error:'checkout id required'});
  const{rows}=await query(`SELECT g.provider_checkout_id,g.email,g.plan_code,g.status,g.invite_id,i.token_encrypted FROM checkout_grants g LEFT JOIN invites i ON i.id=g.invite_id WHERE g.provider_checkout_id=$1`,[id]);
  const g=rows[0];if(!g)return json(res,404,{error:'checkout not found'});
  const code=g.status==='paid'&&g.token_encrypted?decryptInviteCode(g.token_encrypted):null;
  json(res,200,{status:g.status,planCode:g.plan_code,registration:code?{code,url:`${publicOrigin(req)}/?invite=${encodeURIComponent(code)}`} : null});
}

async function adminSummary(req,res){
  const u=await needUser(req,res);if(!u)return;if(!u.is_platform_admin)return json(res,403,{error:'forbidden'});
  const [p,s,plans,checkouts]=await Promise.all([
    query(`SELECT currency,COALESCE(sum(amount_cents-refunded_cents) FILTER(WHERE status='paid'),0)::bigint lifetime_cents,COALESCE(sum(amount_cents-refunded_cents) FILTER(WHERE status='paid' AND paid_at>=date_trunc('month',now())),0)::bigint month_cents,count(*) FILTER(WHERE status='paid')::int paid_count FROM payments GROUP BY currency`),
    query(`SELECT plan_code,status,count(*)::int count FROM subscriptions GROUP BY plan_code,status ORDER BY plan_code,status`),
    query(`SELECT code,audience,billing_kind,price_cents,currency,trainer_limit,client_limit,metadata FROM billing_plans WHERE active=true ORDER BY sort_order`),
    query(`SELECT plan_code,status,count(*)::int count,COALESCE(sum(amount_cents) FILTER(WHERE status IN('paid','claimed')),0)::bigint gross_cents FROM checkout_grants GROUP BY plan_code,status ORDER BY plan_code,status`)
  ]);
  json(res,200,{revenue:p.rows,subscriptions:s.rows,plans:plans.rows,checkouts:checkouts.rows,provider:String(process.env.BILLING_PROVIDER||'')||null});
}

const server=http.createServer(async(req,res)=>{
  let url;try{url=new URL(req.url,'http://varangym.local')}catch{return json(res,400,{error:'bad request'})}
  try{
    if(req.method==='GET'&&url.pathname==='/billing/plans')return plans(req,res);
    if(req.method==='GET'&&url.pathname==='/billing/me')return myBilling(req,res);
    if(req.method==='POST'&&url.pathname==='/billing/checkout')return authenticatedCheckout(req,res);
    if(req.method==='POST'&&url.pathname==='/billing/checkout/solo')return publicSoloCheckout(req,res);
    if(req.method==='GET'&&url.pathname==='/billing/checkout/status')return checkoutStatus(req,res,url);
    if(req.method==='POST'&&url.pathname==='/billing/webhook/stripe')return stripeWebhook(req,res);
    if(req.method==='GET'&&url.pathname==='/billing/admin/summary')return adminSummary(req,res);
    if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'varangym-billing',provider:String(process.env.BILLING_PROVIDER||'')||null});
    return json(res,404,{error:'not found'});
  }catch(e){console.error('[billing]',e);json(res,Number(e.status)||500,{error:Number(e.status)<500?e.message:'server error',code:e.code||undefined})}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`[varangym-billing] listening on :${PORT}`));
for(const s of ['SIGTERM','SIGINT'])process.on(s,()=>server.close(()=>process.exit(0)));
