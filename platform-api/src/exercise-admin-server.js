import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const PORT = +(process.env.PORT || 3009);
const DATABASE_URL = process.env.DATABASE_URL;
const COOKIE_NAME = 'vg_session';
const MAX_BODY = 2 * 1024 * 1024;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, max: 5, idleTimeoutMillis: 30000 });
const query = (text, params = []) => pool.query(text, params);

function json(res,status,body){const text=JSON.stringify(body);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(text),'cache-control':'no-store'});res.end(text)}
function cookies(header=''){const out={};for(const p of String(header).split(';')){const i=p.indexOf('=');if(i<0)continue;const k=p.slice(0,i).trim();if(!k)continue;try{out[k]=decodeURIComponent(p.slice(i+1).trim())}catch{out[k]=p.slice(i+1).trim()}}return out}
const hash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex');
function token(req){const c=cookies(req.headers.cookie||'')[COOKIE_NAME];if(c)return c;const a=String(req.headers.authorization||'');return a.startsWith('Bearer ')?a.slice(7).trim():null}
async function user(req){const t=token(req);if(!t)return null;const {rows}=await query(`SELECT u.id,u.display_name,u.email,u.status,u.locale,u.is_platform_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(t)]);return rows[0]?.status==='active'?rows[0]:null}
async function needUser(req,res){const u=await user(req);if(!u){json(res,401,{error:'not signed in'});return null}return u}
async function needAdmin(req,res){const u=await needUser(req,res);if(!u)return null;if(!u.is_platform_admin){json(res,403,{error:'forbidden'});return null}return u}
async function body(req){let n=0;const chunks=[];for await(const c of req){n+=c.length;if(n>MAX_BODY)throw Object.assign(new Error('body too large'),{status:413});chunks.push(c)}if(!chunks.length)return{};try{const v=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!v||typeof v!=='object'||Array.isArray(v))throw new Error();return v}catch{throw Object.assign(new Error('invalid json'),{status:400})}}
function safeLocale(v){const x=String(v||'uk').trim().slice(0,16);return x||'uk'}
function page(url){const limit=Math.min(2000,Math.max(1,Number(url.searchParams.get('limit')||100)||100));const offset=Math.max(0,Number(url.searchParams.get('offset')||0)||0);return{limit,offset}}

async function catalog(req,res,url,adminOnly=false){
  const u=adminOnly?await needAdmin(req,res):await needUser(req,res);if(!u)return;
  const locale=safeLocale(url.searchParams.get('locale')||u.locale||'uk'); const q=String(url.searchParams.get('q')||'').trim().slice(0,100); const {limit,offset}=page(url);
  const params=[locale,q?`%${q}%`:null,limit,offset];
  const where=adminOnly?'TRUE':`COALESCE(o.active,e.active)=true`;
  const {rows}=await query(`SELECT e.id,e.legacy_key,e.owner_scope,
      COALESCE(o.active,e.active) AS active,
      COALESCE(o.equipment_key,e.equipment_key) AS equipment_key,
      COALESCE(o.primary_muscle_key,e.primary_muscle_key) AS primary_muscle_key,
      COALESCE(o.body_part,e.metadata->>'bodyPart') AS body_part,
      COALESCE(o.image,e.metadata->>'image') AS image,
      COALESCE(o.gif,e.metadata->>'gif') AS gif,
      COALESCE(at.name,tl.name,en.name,e.legacy_key) AS name,
      COALESCE(at.description,tl.description,en.description) AS description,
      COALESCE(at.instructions,tl.instructions,en.instructions,'[]'::jsonb) AS instructions,
      o.updated_at AS override_updated_at,
      COALESCE((SELECT jsonb_object_agg(x.locale,jsonb_build_object('name',x.name,'description',x.description,'instructions',x.instructions)) FROM exercise_admin_translations x WHERE x.exercise_id=e.id),'{}'::jsonb) AS admin_translations
    FROM exercises e
    LEFT JOIN exercise_admin_overrides o ON o.exercise_id=e.id
    LEFT JOIN exercise_admin_translations at ON at.exercise_id=e.id AND at.locale=$1
    LEFT JOIN exercise_translations tl ON tl.exercise_id=e.id AND tl.locale=$1
    LEFT JOIN exercise_translations en ON en.exercise_id=e.id AND en.locale='en'
    WHERE e.owner_scope='platform' AND ${where}
      AND ($2::text IS NULL OR COALESCE(at.name,tl.name,en.name,e.legacy_key) ILIKE $2 OR COALESCE(e.legacy_key,'') ILIKE $2 OR COALESCE(o.equipment_key,e.equipment_key,'') ILIKE $2 OR COALESCE(o.primary_muscle_key,e.primary_muscle_key,'') ILIKE $2)
    ORDER BY COALESCE(at.name,tl.name,en.name,e.legacy_key)
    LIMIT $3 OFFSET $4`,params);
  const total=(await query(`SELECT count(*)::int AS n FROM exercises e LEFT JOIN exercise_admin_overrides o ON o.exercise_id=e.id LEFT JOIN exercise_admin_translations at ON at.exercise_id=e.id AND at.locale=$1 LEFT JOIN exercise_translations tl ON tl.exercise_id=e.id AND tl.locale=$1 LEFT JOIN exercise_translations en ON en.exercise_id=e.id AND en.locale='en' WHERE e.owner_scope='platform' AND ${where} AND ($2::text IS NULL OR COALESCE(at.name,tl.name,en.name,e.legacy_key) ILIKE $2 OR COALESCE(e.legacy_key,'') ILIKE $2 OR COALESCE(o.equipment_key,e.equipment_key,'') ILIKE $2 OR COALESCE(o.primary_muscle_key,e.primary_muscle_key,'') ILIKE $2)`,[locale,q?`%${q}%`:null])).rows[0]?.n||0;
  return json(res,200,{locale,total,limit,offset,exercises:rows});
}

async function update(req,res){
  const u=await needAdmin(req,res);if(!u)return;const b=await body(req);const id=String(b.exerciseId||'');if(!id)return json(res,400,{error:'exerciseId required'});
  const exists=await query(`SELECT 1 FROM exercises WHERE id=$1 AND owner_scope='platform'`,[id]);if(!exists.rowCount)return json(res,404,{error:'exercise not found'});
  const clean=v=>v==null?null:String(v).trim().slice(0,500)||null;
  await query(`INSERT INTO exercise_admin_overrides(exercise_id,active,equipment_key,primary_muscle_key,body_part,image,gif,updated_by_user_id,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
    ON CONFLICT(exercise_id) DO UPDATE SET active=EXCLUDED.active,equipment_key=EXCLUDED.equipment_key,primary_muscle_key=EXCLUDED.primary_muscle_key,body_part=EXCLUDED.body_part,image=EXCLUDED.image,gif=EXCLUDED.gif,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()`,
    [id,typeof b.active==='boolean'?b.active:null,clean(b.equipment),clean(b.primaryMuscle),clean(b.bodyPart),clean(b.image),clean(b.gif),u.id]);
  const tr=b.translations&&typeof b.translations==='object'?b.translations:{};
  for(const locale of ['uk','ru','en']){
    const x=tr[locale]; if(!x||typeof x!=='object')continue;
    const name=clean(x.name),description=x.description==null?null:String(x.description).trim().slice(0,4000)||null;const instructions=Array.isArray(x.instructions)?x.instructions.map(v=>String(v).slice(0,1000)).slice(0,30):null;
    await query(`INSERT INTO exercise_admin_translations(exercise_id,locale,name,description,instructions,updated_by_user_id,updated_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,now()) ON CONFLICT(exercise_id,locale) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,instructions=EXCLUDED.instructions,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()`,[id,locale,name,description,instructions==null?null:JSON.stringify(instructions),u.id]);
  }
  await query(`INSERT INTO audit_events(actor_user_id,action,target_type,target_id,metadata) VALUES($1,'exercise.admin.update','exercise',$2,$3::jsonb)`,[u.id,id,JSON.stringify({active:b.active,equipment:b.equipment,primaryMuscle:b.primaryMuscle})]).catch(()=>{});
  return json(res,200,{ok:true});
}

const server=http.createServer(async(req,res)=>{let url;try{url=new URL(req.url,'http://varangym.local')}catch{return json(res,400,{error:'bad request'})}try{
  if(req.method==='GET'&&url.pathname==='/exercise-admin/catalog')return catalog(req,res,url,false);
  if(req.method==='GET'&&url.pathname==='/exercise-admin/admin')return catalog(req,res,url,true);
  if(req.method==='POST'&&url.pathname==='/exercise-admin/update')return update(req,res);
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'varangym-exercise-admin'});
  return json(res,404,{error:'not found'});
}catch(e){console.error('[exercise-admin]',e?.stack||e);return json(res,Number(e?.status)||500,{error:Number(e?.status)<500?e.message:'server error'})}});
server.listen(PORT,'0.0.0.0',()=>console.log(`[varangym-exercise-admin] listening on :${PORT}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>process.exit(0)));
