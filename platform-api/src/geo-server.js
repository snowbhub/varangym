import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const PORT = +(process.env.PORT || 3010);
const DATABASE_URL = process.env.DATABASE_URL;
const COOKIE_NAME = 'vg_session';
const GEOIP_ENDPOINT = process.env.GEOIP_ENDPOINT || 'https://ipwho.is/{ip}';
const GEOIP_TIMEOUT_MS = Math.max(500, +(process.env.GEOIP_TIMEOUT_MS || 2500) || 2500);
const GEOIP_POLL_MS = Math.max(15000, +(process.env.GEOIP_POLL_MS || 60000) || 60000);

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, max: 4, idleTimeoutMillis: 30000 });
const query = (text, params = []) => pool.query(text, params);

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store'
  });
  res.end(text);
}
function cookies(header='') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch { out[k] = part.slice(i + 1).trim(); }
  }
  return out;
}
const hash = v => crypto.createHash('sha256').update(String(v || '')).digest('hex');
function sessionToken(req) {
  const c = cookies(req.headers.cookie || '')[COOKIE_NAME];
  if (c) return c;
  const auth = String(req.headers.authorization || '');
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
}
async function currentUser(req) {
  const t = sessionToken(req);
  if (!t) return null;
  const { rows } = await query(
    `SELECT u.id,u.display_name,u.email,u.status,u.is_platform_admin
       FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [hash(t)]
  );
  return rows[0]?.status === 'active' ? rows[0] : null;
}
async function needUser(req,res) {
  const u = await currentUser(req);
  if (!u) { json(res,401,{error:'not signed in'}); return null; }
  return u;
}
async function needAdmin(req,res) {
  const u = await needUser(req,res);
  if (!u) return null;
  if (!u.is_platform_admin) { json(res,403,{error:'forbidden'}); return null; }
  return u;
}

function normalizeIp(raw='') {
  let ip = String(raw).trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip.slice(0,80);
}
function publicIp(raw='') {
  const ip = normalizeIp(raw);
  if (!ip || ip === 'unknown' || ip === '::1' || ip === '0.0.0.0') return false;
  if (/^(10\.|127\.|169\.254\.|192\.168\.)/.test(ip)) return false;
  const m172 = ip.match(/^172\.(\d+)\./);
  if (m172 && +m172[1] >= 16 && +m172[1] <= 31) return false;
  const m100 = ip.match(/^100\.(\d+)\./);
  if (m100 && +m100[1] >= 64 && +m100[1] <= 127) return false;
  if (/^(198\.18\.|198\.19\.|198\.51\.100\.|203\.0\.113\.|192\.0\.2\.)/.test(ip)) return false;
  if (/^(fc|fd|fe8|fe9|fea|feb)/i.test(ip.replaceAll(':',''))) return false;
  return true;
}
function endpoint(ip) {
  return GEOIP_ENDPOINT.includes('{ip}')
    ? GEOIP_ENDPOINT.replace('{ip}', encodeURIComponent(ip))
    : `${GEOIP_ENDPOINT.replace(/\/$/,'')}/${encodeURIComponent(ip)}`;
}
async function lookup(ip) {
  if (!publicIp(ip)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOIP_TIMEOUT_MS);
  try {
    const r = await fetch(endpoint(ip), {
      headers: { accept: 'application/json', 'user-agent': 'VARANGYM-Geo/1.0' },
      signal: controller.signal
    });
    if (!r.ok) throw new Error(`geo ${r.status}`);
    const d = await r.json();
    if (d?.success === false) throw new Error(d?.message || 'geo lookup failed');
    const timezone = typeof d?.timezone === 'string' ? d.timezone : d?.timezone?.id;
    return {
      ip: normalizeIp(ip),
      countryCode: String(d?.country_code || d?.countryCode || '').slice(0,8) || null,
      country: String(d?.country || '').slice(0,120) || null,
      region: String(d?.region || d?.regionName || '').slice(0,160) || null,
      city: String(d?.city || '').slice(0,160) || null,
      timezone: String(timezone || '').slice(0,120) || null,
      latitude: Number.isFinite(Number(d?.latitude ?? d?.lat)) ? Number(d?.latitude ?? d?.lat) : null,
      longitude: Number.isFinite(Number(d?.longitude ?? d?.lon)) ? Number(d?.longitude ?? d?.lon) : null,
      source: 'ipwhois'
    };
  } finally {
    clearTimeout(timer);
  }
}
async function saveGeo(userId, data) {
  if (!data) return null;
  const { rows } = await query(
    `INSERT INTO user_geo_profiles(user_id,ip,country_code,country,region,city,timezone,latitude,longitude,source,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
     ON CONFLICT(user_id) DO UPDATE SET
       ip=EXCLUDED.ip,country_code=EXCLUDED.country_code,country=EXCLUDED.country,
       region=EXCLUDED.region,city=EXCLUDED.city,timezone=EXCLUDED.timezone,
       latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,source=EXCLUDED.source,updated_at=now()
     RETURNING *`,
    [userId,data.ip,data.countryCode,data.country,data.region,data.city,data.timezone,data.latitude,data.longitude,data.source]
  );
  return rows[0] || null;
}
async function enrichUser(userId, ip) {
  try {
    const d = await lookup(ip);
    return d ? await saveGeo(userId,d) : null;
  } catch (e) {
    console.warn('[geo] lookup failed', userId, e?.message || e);
    return null;
  }
}
async function latestSession(userId) {
  const { rows } = await query(
    `SELECT ip_hint,last_seen_at,created_at
       FROM sessions WHERE user_id=$1
      ORDER BY last_seen_at DESC NULLS LAST,created_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}
let enriching = false;
async function enrichMissing() {
  if (enriching) return;
  enriching = true;
  try {
    const { rows } = await query(
      `SELECT DISTINCT ON (s.user_id) s.user_id,s.ip_hint,s.last_seen_at,g.ip AS geo_ip,g.updated_at AS geo_updated_at
         FROM sessions s
         LEFT JOIN user_geo_profiles g ON g.user_id=s.user_id
        WHERE s.ip_hint IS NOT NULL
        ORDER BY s.user_id,s.last_seen_at DESC NULLS LAST,s.created_at DESC
        LIMIT 60`
    );
    const pending = rows.filter(r =>
      publicIp(r.ip_hint) &&
      (!r.geo_updated_at || normalizeIp(r.geo_ip) !== normalizeIp(r.ip_hint) ||
       new Date(r.geo_updated_at).getTime() < Date.now() - 30*86400000)
    );
    for (const r of pending.slice(0,12)) await enrichUser(r.user_id,r.ip_hint);
  } catch (e) {
    console.error('[geo] enrichment cycle', e?.stack || e);
  } finally {
    enriching = false;
  }
}

async function canSeeTarget(user,targetId) {
  if (user.is_platform_admin || user.id === targetId) return true;
  const { rowCount } = await query(
    `SELECT 1
       FROM trainer_client_links l
       LEFT JOIN workspace_memberships m
         ON m.workspace_id=l.workspace_id AND m.user_id=$1
        AND m.status='active' AND m.ended_at IS NULL
      WHERE l.client_user_id=$2 AND l.status='active'
        AND (l.trainer_user_id=$1 OR m.role IN('owner','admin'))
      LIMIT 1`,
    [user.id,targetId]
  );
  return !!rowCount;
}
async function adminLocations(req,res) {
  const user = await needAdmin(req,res);
  if (!user) return;
  enrichMissing().catch(()=>{});
  const { rows } = await query(
    `SELECT u.id,u.display_name,u.email,g.ip,g.country_code,g.country,g.region,g.city,g.timezone,
            g.latitude,g.longitude,g.source,g.updated_at
       FROM users u LEFT JOIN user_geo_profiles g ON g.user_id=u.id
      ORDER BY u.created_at DESC`
  );
  const countBy = key => {
    const m = new Map();
    for (const r of rows) {
      const v = r[key] || 'Невідомо';
      m.set(v,(m.get(v)||0)+1);
    }
    return [...m].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
  };
  return json(res,200,{
    users:rows,
    byCity:countBy('city'),
    byRegion:countBy('region'),
    byCountry:countBy('country'),
    known:rows.filter(x=>x.city||x.region||x.country).length,
    total:rows.length
  });
}
async function userLocation(req,res,id) {
  const user = await needUser(req,res);
  if (!user) return;
  if (!(await canSeeTarget(user,id))) return json(res,403,{error:'forbidden'});
  let row = (await query(`SELECT * FROM user_geo_profiles WHERE user_id=$1`,[id])).rows[0] || null;
  const session = await latestSession(id);
  if (session?.ip_hint && publicIp(session.ip_hint) &&
      (!row || normalizeIp(row.ip)!==normalizeIp(session.ip_hint) ||
       new Date(row.updated_at).getTime()<Date.now()-30*86400000)) {
    const fresh = await enrichUser(id,session.ip_hint);
    if (fresh) row = fresh;
  }
  return json(res,200,{location:row});
}
async function refreshLocation(req,res,id) {
  const user = await needAdmin(req,res);
  if (!user) return;
  const s = await latestSession(id);
  if (!s?.ip_hint) return json(res,404,{error:'no recent IP'});
  const row = await enrichUser(id,s.ip_hint);
  return json(res,200,{location:row});
}

await query('SELECT 1');
console.log('[varangym-geo] database ready');
enrichMissing().catch(()=>{});
const timer = setInterval(()=>enrichMissing().catch(()=>{}),GEOIP_POLL_MS);
timer.unref();

const server=http.createServer(async(req,res)=>{
  let url;
  try { url=new URL(req.url,'http://varangym.local'); }
  catch { return json(res,400,{error:'bad request'}); }
  try {
    if(req.method==='GET'&&url.pathname==='/geo/admin') return await adminLocations(req,res);
    let m=req.method==='GET'&&url.pathname.match(/^\/geo\/user\/([0-9a-fA-F-]{36})$/);
    if(m) return await userLocation(req,res,m[1]);
    m=req.method==='POST'&&url.pathname.match(/^\/geo\/refresh\/([0-9a-fA-F-]{36})$/);
    if(m) return await refreshLocation(req,res,m[1]);
    if(req.method==='GET'&&url.pathname==='/health') return json(res,200,{ok:true,service:'varangym-geo'});
    return json(res,404,{error:'not found'});
  } catch(e) {
    console.error('[geo-http]',req.method,url.pathname,e?.stack||e);
    if(!res.headersSent) json(res,500,{error:'server error'});
  }
});
server.listen(PORT,'0.0.0.0',()=>console.log(`[varangym-geo] listening on :${PORT}`));
for(const sig of ['SIGTERM','SIGINT']) process.on(sig,()=>server.close(()=>process.exit(0)));
