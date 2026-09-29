import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const PORT = +(process.env.PORT || 3012);
const DATABASE_URL = process.env.DATABASE_URL;
const COOKIE_NAME = 'vg_session';
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, max: 3, idleTimeoutMillis: 30000 });
const query = (text, params=[]) => pool.query(text,params);

function json(res,status,body){const text=JSON.stringify(body);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(text),'cache-control':'no-store'});res.end(text)}
function cookies(header=''){const out={};for(const p of String(header).split(';')){const i=p.indexOf('=');if(i<0)continue;const k=p.slice(0,i).trim();if(!k)continue;try{out[k]=decodeURIComponent(p.slice(i+1).trim())}catch{out[k]=p.slice(i+1).trim()}}return out}
const hash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex');
function token(req){const c=cookies(req.headers.cookie||'')[COOKIE_NAME];if(c)return c;const a=String(req.headers.authorization||'');return a.startsWith('Bearer ')?a.slice(7).trim():null}
async function currentUser(req){const t=token(req);if(!t)return null;const {rows}=await query(`SELECT u.id,u.display_name,u.email,u.status,u.is_platform_admin,u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(t)]);return rows[0]?.status==='active'?rows[0]:null}

async function subjectAccess(subjectType,subjectId){
  const {rows}=await query(`SELECT b.plan_code,b.lifetime_access,b.extra_trainers,b.updated_at,
    s.status,s.current_period_end,s.trial_ends_at,s.cancel_at_period_end,s.provider,s.created_at
    FROM billing_subject_settings b
    LEFT JOIN LATERAL (SELECT * FROM subscriptions x WHERE x.subject_type=b.subject_type AND x.subject_id=b.subject_id ORDER BY x.created_at DESC LIMIT 1) s ON true
    WHERE b.subject_type=$1 AND b.subject_id=$2`,[subjectType,subjectId]);
  const x=rows[0];if(!x)return null;
  const lifetime=!!x.lifetime_access;
  const trial=x.status==='trialing' && x.trial_ends_at && new Date(x.trial_ends_at)>new Date();
  const paid=x.status==='active' && (!x.current_period_end || new Date(x.current_period_end)>new Date() || x.cancel_at_period_end);
  return {...x,active:lifetime||trial||paid,reason:lifetime?'lifetime':trial?'trial':paid?'paid':'expired'};
}

async function accessMe(req,res){
  const u=await currentUser(req);if(!u)return json(res,401,{error:'not signed in'});
  if(u.is_platform_admin)return json(res,200,{active:true,source:'platform_admin',reason:'admin',user:{id:u.id,email:u.email}});
  const direct=await subjectAccess('user',u.id);
  if(direct?.active)return json(res,200,{active:true,source:'user',subjectId:u.id,...direct,user:{id:u.id,email:u.email}});
  const {rows:memberships}=await query(`SELECT DISTINCT w.id,w.name,w.type,m.role FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 AND m.status='active' AND m.ended_at IS NULL ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'trainer' THEN 2 ELSE 3 END,w.name`,[u.id]);
  const covered=[];
  for(const m of memberships){const a=await subjectAccess('workspace',m.id);if(a)covered.push({workspaceId:m.id,workspaceName:m.name,workspaceType:m.type,role:m.role,...a});if(a?.active)return json(res,200,{active:true,source:'workspace',subjectId:m.id,workspace:{id:m.id,name:m.name,type:m.type,role:m.role},...a,user:{id:u.id,email:u.email}})}

  // Accounts created before self-service trials existed had no billing rows at all. Keep those
  // profiles working rather than retroactively locking them. Every new no-code registration now
  // writes a trial/subscription row, so once its 30 days expire it reaches the paywall below.
  if(!direct && !covered.length)return json(res,200,{active:true,source:'legacy',reason:'grandfathered',user:{id:u.id,email:u.email}});

  return json(res,200,{active:false,source:'billing',reason:'subscription_required',direct:direct||null,workspaces:covered,user:{id:u.id,email:u.email}});
}

const server=http.createServer(async(req,res)=>{let url;try{url=new URL(req.url,'http://varangym.local')}catch{return json(res,400,{error:'bad request'})}try{if(req.method==='GET'&&url.pathname==='/access/me')return accessMe(req,res);if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'varangym-access-status'});return json(res,404,{error:'not found'})}catch(e){console.error('[access-status]',e?.stack||e);return json(res,500,{error:'server error'})}});
server.listen(PORT,'0.0.0.0',()=>console.log(`[varangym-access-status] listening on :${PORT}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>process.exit(0)));
