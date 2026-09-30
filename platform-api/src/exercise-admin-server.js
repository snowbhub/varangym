import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const PORT = +(process.env.PORT || 3011);
const DATABASE_URL = process.env.DATABASE_URL;
const COOKIE_NAME = 'vg_session';
const MAX_BODY = 2 * 1024 * 1024;

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, max: 4, idleTimeoutMillis: 30000 });
const query = (text, params = []) => pool.query(text, params);

function json(res,status,body){
  const text=JSON.stringify(body);
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(text),'cache-control':'no-store'});
  res.end(text);
}
function cookies(header=''){
  const out={};
  for(const part of String(header).split(';')){
    const i=part.indexOf('=');
    if(i<0)continue;
    const k=part.slice(0,i).trim();
    if(!k)continue;
    try{out[k]=decodeURIComponent(part.slice(i+1).trim())}catch{out[k]=part.slice(i+1).trim()}
  }
  return out;
}
const hash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex');
function sessionToken(req){
  const c=cookies(req.headers.cookie||'')[COOKIE_NAME];
  if(c)return c;
  const a=String(req.headers.authorization||'');
  return a.startsWith('Bearer ')?a.slice(7).trim():null;
}
async function currentUser(req){
  const t=sessionToken(req);
  if(!t)return null;
  const {rows}=await query(`SELECT u.id,u.status,u.is_platform_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(t)]);
  return rows[0]?.status==='active'?rows[0]:null;
}
async function needAdmin(req,res){
  const u=await currentUser(req);
  if(!u){json(res,401,{error:'not signed in'});return null}
  if(!u.is_platform_admin){json(res,403,{error:'forbidden'});return null}
  return u;
}
async function bodyJson(req){
  let n=0;const chunks=[];
  for await(const chunk of req){
    n+=chunk.length;
    if(n>MAX_BODY)throw Object.assign(new Error('body too large'),{status:413});
    chunks.push(chunk);
  }
  if(!chunks.length)return{};
  try{
    const v=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!v||typeof v!=='object'||Array.isArray(v))throw new Error();
    return v;
  }catch{throw Object.assign(new Error('invalid json'),{status:400})}
}
function statusOf(e){
  const n=Number(e?.status||500);
  return Number.isInteger(n)&&n>=400&&n<600?n:500;
}
const clean=v=>String(v??'').trim();
const cleanOrNull=v=>{const s=clean(v);return s||null};
function normalizeInstructions(v){
  if(Array.isArray(v))return v.map(x=>clean(x)).filter(Boolean).slice(0,80);
  if(typeof v==='string')return v.split('\n').map(x=>clean(x)).filter(Boolean).slice(0,80);
  return [];
}

async function readExercise(legacy){
  const {rows}=await query(
    `SELECT e.*,
      COALESCE((SELECT jsonb_object_agg(t.locale,jsonb_build_object(
        'name',t.name,'description',t.description,'instructions',COALESCE(t.instructions,'[]'::jsonb)
      )) FROM exercise_translations t WHERE t.exercise_id=e.id),'{}'::jsonb) translations
     FROM exercises e
     WHERE e.owner_scope='platform' AND e.legacy_key=$1
     LIMIT 1`,
    [legacy]
  );
  return rows[0]||null;
}

async function getOne(req,res,legacy){
  const u=await needAdmin(req,res);if(!u)return;
  return json(res,200,{exercise:await readExercise(legacy)});
}

async function putOne(req,res,legacy){
  const actor=await needAdmin(req,res);if(!actor)return;
  const b=await bodyJson(req);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    let row=(await client.query(`SELECT * FROM exercises WHERE owner_scope='platform' AND legacy_key=$1 FOR UPDATE`,[legacy])).rows[0];
    const metadata={
      ...(row?.metadata||{}),
      adminOverride:true,
      sourceName:cleanOrNull(b.sourceName),
      sourceDescription:cleanOrNull(b.sourceDescription),
      sourceInstructions:normalizeInstructions(b.sourceInstructions),
    };
    for(const key of ['bodyPart','image','gif','imageMale','gifMale','imageFemale','gifFemale','gender']){
      if(Object.prototype.hasOwnProperty.call(b,key)) metadata[key]=b[key]===null?null:cleanOrNull(b[key]);
    }
    if(Array.isArray(b.secondaryMuscles))metadata.secondaryMuscles=b.secondaryMuscles.map(x=>clean(x)).filter(Boolean).slice(0,30);

    const tracking=['reps_weight','bodyweight','time','distance','cardio','other'].includes(b.trackingMode)
      ? b.trackingMode
      : (row?.tracking_mode||'reps_weight');
    const active=b.active===undefined?(row?.active??true):!!b.active;
    const equipment=b.equipment===undefined?(row?.equipment_key||null):cleanOrNull(b.equipment);
    const primary=b.primaryMuscle===undefined?(row?.primary_muscle_key||null):cleanOrNull(b.primaryMuscle);

    if(!row){
      row=(await client.query(
        `INSERT INTO exercises(legacy_key,owner_scope,tracking_mode,equipment_key,primary_muscle_key,metadata,active)
         VALUES($1,'platform',$2,$3,$4,$5::jsonb,$6) RETURNING *`,
        [legacy,tracking,equipment,primary,JSON.stringify(metadata),active]
      )).rows[0];
    }else{
      row=(await client.query(
        `UPDATE exercises SET tracking_mode=$2,equipment_key=$3,primary_muscle_key=$4,metadata=$5::jsonb,active=$6,updated_at=now()
         WHERE id=$1 RETURNING *`,
        [row.id,tracking,equipment,primary,JSON.stringify(metadata),active]
      )).rows[0];
    }

    const tr=b.translations&&typeof b.translations==='object'?b.translations:{};
    for(const locale of ['uk','ru','en']){
      const x=tr[locale];
      if(!x||typeof x!=='object')continue;
      const name=clean(x.name).slice(0,160);
      if(!name)continue;
      const description=cleanOrNull(x.description);
      const instructions=normalizeInstructions(x.instructions);
      await client.query(
        `INSERT INTO exercise_translations(exercise_id,locale,name,description,instructions)
         VALUES($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT(exercise_id,locale) DO UPDATE SET
           name=EXCLUDED.name,description=EXCLUDED.description,instructions=EXCLUDED.instructions`,
        [row.id,locale,name,description,JSON.stringify(instructions)]
      );
    }

    await client.query(
      `INSERT INTO audit_events(actor_user_id,action,target_type,target_id,metadata)
       VALUES($1,'admin.exercise.upsert','exercise',$2,$3::jsonb)`,
      [actor.id,row.id,JSON.stringify({legacyKey:legacy,active})]
    );
    await client.query('COMMIT');
    return json(res,200,{ok:true,exercise:await readExercise(legacy)});
  }catch(e){
    try{await client.query('ROLLBACK')}catch{}
    throw e;
  }finally{client.release()}
}

async function listOverrides(req,res){
  const u=await needAdmin(req,res);if(!u)return;
  const {rows}=await query(
    `SELECT e.legacy_key,e.active,e.tracking_mode,e.equipment_key,e.primary_muscle_key,e.metadata,
      COALESCE((SELECT jsonb_object_agg(t.locale,jsonb_build_object(
        'name',t.name,'description',t.description,'instructions',COALESCE(t.instructions,'[]'::jsonb)
      )) FROM exercise_translations t WHERE t.exercise_id=e.id),'{}'::jsonb) translations
     FROM exercises e
     WHERE e.owner_scope='platform' AND e.legacy_key IS NOT NULL
     ORDER BY e.legacy_key`
  );
  return json(res,200,{overrides:rows});
}

await query('SELECT 1');
console.log('[varangym-exercise-admin] database ready');

const server=http.createServer(async(req,res)=>{
  let url;
  try{url=new URL(req.url,'http://varangym.local')}catch{return json(res,400,{error:'bad request'})}
  try{
    if(req.method==='GET'&&url.pathname==='/exercise-admin')return await listOverrides(req,res);
    let m=url.pathname.match(/^\/exercise-admin\/([^/]+)$/);
    if(m){
      const legacy=decodeURIComponent(m[1]).slice(0,120);
      if(req.method==='GET')return await getOne(req,res,legacy);
      if(req.method==='PUT')return await putOne(req,res,legacy);
    }
    if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'varangym-exercise-admin'});
    return json(res,404,{error:'not found'});
  }catch(e){
    console.error('[exercise-admin]',req.method,url.pathname,e?.stack||e);
    const s=statusOf(e);
    if(!res.headersSent)json(res,s,{error:s===500?'server error':e.message});
  }
});
server.listen(PORT,'0.0.0.0',()=>console.log(`[varangym-exercise-admin] listening on :${PORT}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>process.exit(0)));
