import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const PORT = +(process.env.PORT || 3011);
const DATABASE_URL = process.env.DATABASE_URL;
const COOKIE_NAME = 'vg_session';
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, max: 3, idleTimeoutMillis: 30000 });
const query = (text, params=[]) => pool.query(text,params);
const hash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex');
function json(res,status,body){const text=JSON.stringify(body);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(text),'cache-control':'no-store'});res.end(text)}
function cookies(header=''){const out={};for(const p of String(header).split(';')){const i=p.indexOf('=');if(i<0)continue;const k=p.slice(0,i).trim();if(!k)continue;try{out[k]=decodeURIComponent(p.slice(i+1).trim())}catch{out[k]=p.slice(i+1).trim()}}return out}
function token(req){const c=cookies(req.headers.cookie||'')[COOKIE_NAME];if(c)return c;const a=String(req.headers.authorization||'');return a.startsWith('Bearer ')?a.slice(7).trim():null}
function requestIp(req){return String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim().slice(0,80)||null}
function geo(req){const h=req.headers;const pick=(...xs)=>xs.map(x=>String(x||'').trim()).find(Boolean)||null;return{country:pick(h['cf-ipcountry'],h['x-vercel-ip-country'],h['x-geo-country'],h['x-appengine-country']),region:pick(h['x-vercel-ip-country-region'],h['x-geo-region'],h['x-appengine-region']),city:pick(h['x-vercel-ip-city'],h['x-geo-city'],h['x-appengine-city'])}}

async function touch(req,res){const t=token(req);if(!t)return json(res,401,{error:'not signed in'});const g=geo(req);const r=await query(`UPDATE sessions SET last_seen_at=now(),ip_hint=COALESCE($2,ip_hint),country_code=COALESCE($3,country_code),region=COALESCE($4,region),city=COALESCE($5,city),user_agent=COALESCE($6,user_agent) WHERE token_hash=$1 AND expires_at>now() RETURNING user_id`,[hash(t),requestIp(req),g.country,g.region,g.city,String(req.headers['user-agent']||'').slice(0,500)||null]);if(!r.rowCount)return json(res,401,{error:'not signed in'});return json(res,200,{ok:true,geo:{country:g.country,region:g.region,city:g.city}})}

const server=http.createServer(async(req,res)=>{let url;try{url=new URL(req.url,'http://varangym.local')}catch{return json(res,400,{error:'bad request'})}try{if(req.method==='POST'&&url.pathname==='/session-meta/touch')return touch(req,res);if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'varangym-session-meta'});return json(res,404,{error:'not found'})}catch(e){console.error('[session-meta]',e?.stack||e);return json(res,500,{error:'server error'})}});
server.listen(PORT,'0.0.0.0',()=>console.log(`[varangym-session-meta] listening on :${PORT}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>process.exit(0)));
