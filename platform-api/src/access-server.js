import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';
import { audit, createInviteForActor } from './provisioning.js';
import { decryptInviteCode } from './security.js';

const { Pool } = pg;
const PORT = +(process.env.PORT || 3004);
const DATABASE_URL = process.env.DATABASE_URL;
const COOKIE_NAME = 'vg_session';
const MAX_BODY = 1024 * 1024;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, max: 5, idleTimeoutMillis: 30000 });
const query = (text, params = []) => pool.query(text, params);

function json(res,status,body){
  const text=JSON.stringify(body);
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(text),'cache-control':'no-store'});
  res.end(text);
}
function parseCookies(header=''){
  const out={};
  for(const part of String(header).split(';')){const i=part.indexOf('=');if(i<0)continue;const k=part.slice(0,i).trim();const r=part.slice(i+1).trim();try{out[k]=decodeURIComponent(r)}catch{out[k]=r}}
  return out;
}
function hashToken(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex')}
function sessionToken(req){const c=parseCookies(req.headers.cookie||'')[COOKIE_NAME];if(c)return c;const a=String(req.headers.authorization||'');return a.startsWith('Bearer ')?a.slice(7).trim():null}
async function currentUser(req){
  const token=sessionToken(req);if(!token)return null;
  const {rows}=await query(`SELECT u.id,u.display_name,u.email,u.status,u.locale,u.is_platform_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[hashToken(token)]);
  const u=rows[0]||null;return u?.status==='active'?u:null;
}
async function requireUser(req,res){const u=await currentUser(req);if(!u){json(res,401,{error:'not signed in'});return null}return u}
async function bodyJson(req){let n=0;const chunks=[];for await(const chunk of req){n+=chunk.length;if(n>MAX_BODY)throw Object.assign(new Error('body too large'),{status:413});chunks.push(chunk)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('invalid json'),{status:400})}}
async function rolesFor(userId,workspaceId){const {rows}=await query(`SELECT role FROM workspace_memberships WHERE user_id=$1 AND workspace_id=$2 AND status='active' AND ended_at IS NULL`,[userId,workspaceId]);return new Set(rows.map(r=>r.role))}
function statusOf(e){const n=Number(e?.status||500);return Number.isInteger(n)&&n>=400&&n<600?n:500}
function expose(rows){return rows.map(r=>({...r,code:decryptInviteCode(r.token_encrypted)||null,token_encrypted:undefined}))}

async function createInvite(req,res){
  const user=await requireUser(req,res);if(!user)return;
  const body=await bodyJson(req);
  try{
    const result=await createInviteForActor({query},user,body);
    await audit({query},{actorUserId:user.id,workspaceId:result.invite.workspace_id,action:'invite.create',targetType:'invite',targetId:result.invite.id,metadata:{targetRole:result.invite.target_role,maxUses:result.invite.max_uses}});
    return json(res,201,result);
  }catch(e){return json(res,statusOf(e),{error:e.message||'could not create invite'})}
}

async function listInvites(req,res,url){
  const user=await requireUser(req,res);if(!user)return;
  const workspaceId=url.searchParams.get('workspaceId');
  let rows=[];
  if(user.is_platform_admin&&!workspaceId){
    ({rows}=await query(`SELECT i.id,i.workspace_id,i.target_role,i.trainer_user_id,i.email,i.max_uses,i.use_count,i.expires_at,i.revoked_at,i.created_at,i.token_encrypted,u.display_name AS created_by FROM invites i LEFT JOIN users u ON u.id=i.created_by_user_id ORDER BY i.created_at DESC LIMIT 200`));
  }else{
    if(!workspaceId)return json(res,400,{error:'workspaceId required'});
    const roles=await rolesFor(user.id,workspaceId);
    const manager=roles.has('owner')||roles.has('admin');
    const trainer=roles.has('trainer');
    if(!user.is_platform_admin&&!manager&&!trainer)return json(res,403,{error:'forbidden'});
    const trainerOnly=!user.is_platform_admin&&!manager&&trainer;
    ({rows}=await query(`SELECT i.id,i.workspace_id,i.target_role,i.trainer_user_id,i.email,i.max_uses,i.use_count,i.expires_at,i.revoked_at,i.created_at,i.token_encrypted,u.display_name AS created_by FROM invites i LEFT JOIN users u ON u.id=i.created_by_user_id WHERE i.workspace_id=$1 ${trainerOnly?'AND i.created_by_user_id=$2':''} ORDER BY i.created_at DESC LIMIT 200`,trainerOnly?[workspaceId,user.id]:[workspaceId]));
  }
  return json(res,200,{invites:expose(rows)});
}

async function revokeInvite(req,res){
  const user=await requireUser(req,res);if(!user)return;
  const body=await bodyJson(req);
  const {rows}=await query('SELECT * FROM invites WHERE id=$1',[body.id]);
  const invite=rows[0];if(!invite)return json(res,404,{error:'invite not found'});
  let allowed=user.is_platform_admin||invite.created_by_user_id===user.id;
  if(!allowed&&invite.workspace_id){const roles=await rolesFor(user.id,invite.workspace_id);allowed=roles.has('owner')||roles.has('admin')}
  if(!allowed)return json(res,403,{error:'forbidden'});
  await query('UPDATE invites SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1',[invite.id]);
  await audit({query},{actorUserId:user.id,workspaceId:invite.workspace_id,action:'invite.revoke',targetType:'invite',targetId:invite.id});
  return json(res,200,{ok:true});
}

const routes=new Map([
  ['POST /invites',createInvite],
  ['GET /invites',listInvites],
  ['POST /invites/revoke',revokeInvite]
]);
await query('SELECT 1');
console.log('[varangym-access] database ready');
const server=http.createServer(async(req,res)=>{
  let url;try{url=new URL(req.url,'http://varangym.local')}catch{return json(res,400,{error:'bad request'})}
  const handler=routes.get(`${req.method} ${url.pathname}`);if(!handler)return json(res,404,{error:'not found'});
  try{await handler(req,res,url)}catch(e){console.error('[access-http]',req.method,url.pathname,e?.stack||e);const s=statusOf(e);if(!res.headersSent)json(res,s,{error:s===500?'server error':e.message})}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`[varangym-access] listening on :${PORT}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>process.exit(0)));
