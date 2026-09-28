import http from 'node:http';
import crypto from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from '@simplewebauthn/server';
import { migrate, ping, query, tx } from './db.js';
import {
  audit,
  consumeInvite,
  createInviteForActor,
  inviteIsUsable,
  loadInviteByCode,
  membershipsFor,
  provisionFromInvite
} from './provisioning.js';
import {
  hashToken,
  inviteCode,
  inviteHash,
  parseCookies,
  randomToken,
  safeEqualText
} from './security.js';

const PORT = +(process.env.PORT || 3000);
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://localhost:8080';
const RP_ID = process.env.RP_ID || 'localhost';
const RP_NAME = process.env.RP_NAME || 'VARANGYM';
const BOOTSTRAP_TOKEN = process.env.PLATFORM_BOOTSTRAP_TOKEN || '';
const SESSION_DAYS = Math.max(1, +(process.env.SESSION_DAYS || 30) || 30);
const SECURE_COOKIE = /^https:/i.test(APP_ORIGIN);
const COOKIE_NAME = 'vg_session';
const MAX_BODY = 1024 * 1024;

function json(res, status, body, headers = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    ...headers
  });
  res.end(text);
}

function errorStatus(err) {
  const status = Number(err?.status || 500);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

async function bodyJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid json');
    return value;
  } catch {
    throw Object.assign(new Error('invalid json'), { status: 400 });
  }
}

function requestIp(req) {
  const raw = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '');
  return raw.split(',')[0].trim().slice(0, 80) || null;
}

function sessionCookie(token) {
  const maxAge = SESSION_DAYS * 86400;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIE ? '; Secure' : ''}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${SECURE_COOKIE ? '; Secure' : ''}`;
}

function sessionTokenFrom(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];
  const auth = String(req.headers.authorization || '');
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
}

async function currentUser(req) {
  const token = sessionTokenFrom(req);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const { rows } = await query(
    `SELECT u.id,u.display_name,u.email,u.status,u.locale,u.is_platform_admin,s.expires_at
       FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [tokenHash]
  );
  const user = rows[0] || null;
  if (!user || user.status !== 'active') return null;
  query('UPDATE sessions SET last_seen_at=now() WHERE token_hash=$1', [tokenHash]).catch(() => {});
  return user;
}

async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) { json(res, 401, { error: 'not signed in' }); return null; }
  return user;
}

async function requirePlatformAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!user.is_platform_admin) { json(res, 403, { error: 'forbidden' }); return null; }
  return user;
}

async function membershipRoles(userId, workspaceId) {
  const { rows } = await query(
    `SELECT role FROM workspace_memberships
      WHERE user_id=$1 AND workspace_id=$2 AND status='active' AND ended_at IS NULL`,
    [userId, workspaceId]
  );
  return new Set(rows.map(r => r.role));
}

async function issueSession(db, userId, req) {
  const token = randomToken(32);
  await db.query(
    `INSERT INTO sessions(token_hash,user_id,expires_at,user_agent,ip_hint)
     VALUES ($1,$2,now()+($3 || ' days')::interval,$4,$5)`,
    [hashToken(token), userId, String(SESSION_DAYS), String(req.headers['user-agent'] || '').slice(0, 500) || null, requestIp(req)]
  );
  return token;
}

async function userPayload(userId) {
  const { rows } = await query(
    `SELECT id,display_name,email,status,locale,is_platform_admin,created_at FROM users WHERE id=$1`,
    [userId]
  );
  const user = rows[0];
  if (!user) return null;
  return { user, memberships: await membershipsFor({ query }, userId) };
}

function inviteEmailMatches(invite, email) {
  if (!invite.email) return true;
  return String(invite.email).trim().toLowerCase() === String(email || '').trim().toLowerCase();
}

async function authRegisterOptions(req, res) {
  const body = await bodyJson(req);
  const name = String(body.name || '').trim().slice(0, 80);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 320) || null;
  if (name.length < 2) return json(res, 400, { error: 'name required' });
  if (!body.code) return json(res, 400, { error: 'invite code required' });

  const invite = await loadInviteByCode({ query }, body.code);
  if (!inviteIsUsable(invite)) return json(res, 403, { error: 'invite is invalid, expired or already used' });
  if (!inviteEmailMatches(invite, email)) return json(res, 403, { error: 'invite is bound to another email' });
  if (email) {
    const exists = await query('SELECT 1 FROM users WHERE lower(email)=lower($1)', [email]);
    if (exists.rowCount) return json(res, 409, { error: 'email already registered' });
  }

  const provisionalUserId = crypto.randomUUID();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Buffer.from(provisionalUserId, 'utf8'),
    userName: email || `${name}-${provisionalUserId.slice(0, 8)}`,
    userDisplayName: name,
    timeout: 60000,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred'
    }
  });

  const cid = crypto.randomUUID();
  await query(
    `INSERT INTO auth_challenges(id,purpose,challenge,provisional_user_id,invite_id,display_name,email,expires_at)
     VALUES ($1,'register',$2,$3,$4,$5,$6,now()+interval '5 minutes')`,
    [cid, options.challenge, provisionalUserId, invite.id, name, email]
  );
  return json(res, 200, { cid, options, targetRole: invite.target_role });
}

async function authRegisterVerify(req, res) {
  const body = await bodyJson(req);
  if (!body.cid || !body.credential) return json(res, 400, { error: 'cid and credential required' });

  const challengeResult = await query(
    `SELECT c.*,i.target_role,i.email AS invite_email
       FROM auth_challenges c JOIN invites i ON i.id=c.invite_id
      WHERE c.id=$1 AND c.purpose='register' AND c.expires_at>now()`,
    [body.cid]
  );
  const challenge = challengeResult.rows[0];
  if (!challenge) return json(res, 400, { error: 'challenge expired — try again' });

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.credential,
      expectedChallenge: challenge.challenge,
      expectedOrigin: APP_ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false
    });
  } catch (err) {
    console.error('[auth] registration verification failed', err?.message || err);
    return json(res, 400, { error: 'passkey verification failed' });
  }
  if (!verification.verified || !verification.registrationInfo) return json(res, 400, { error: 'not verified' });

  const { credential } = verification.registrationInfo;
  let sessionToken;
  let userId;
  try {
    const result = await tx(async db => {
      const lockedChallenge = await db.query(
        `SELECT * FROM auth_challenges WHERE id=$1 AND purpose='register' AND expires_at>now() FOR UPDATE`,
        [body.cid]
      );
      const c = lockedChallenge.rows[0];
      if (!c) throw Object.assign(new Error('challenge expired — try again'), { status: 400 });

      const invite = await consumeInvite(db, c.invite_id, c.provisional_user_id);
      if (!inviteEmailMatches(invite, c.email)) throw Object.assign(new Error('invite email mismatch'), { status: 403 });

      await db.query(
        `INSERT INTO users(id,display_name,email,locale,status)
         VALUES ($1,$2,$3,$4,'active')`,
        [c.provisional_user_id, c.display_name, c.email, String(body.locale || 'en').slice(0, 16)]
      );
      await db.query(
        `INSERT INTO auth_credentials(id,user_id,public_key,counter,transports)
         VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [credential.id, c.provisional_user_id, Buffer.from(credential.publicKey), credential.counter || 0, JSON.stringify(body.credential?.response?.transports || [])]
      );

      const user = { id: c.provisional_user_id, display_name: c.display_name, email: c.email, locale: String(body.locale || 'en').slice(0, 16) };
      const provisioning = await provisionFromInvite(db, invite, user);
      await db.query('DELETE FROM auth_challenges WHERE id=$1', [body.cid]);
      const token = await issueSession(db, user.id, req);
      await audit(db, {
        actorUserId: user.id,
        workspaceId: provisioning.workspaceId,
        action: 'auth.register',
        targetType: 'user',
        targetId: user.id,
        metadata: { targetRole: invite.target_role }
      });
      return { token, userId: user.id };
    });
    sessionToken = result.token;
    userId = result.userId;
  } catch (err) {
    if (err?.code === '23505') return json(res, 409, { error: 'account or passkey already registered' });
    const status = errorStatus(err);
    console.error('[auth] registration commit failed', err?.message || err);
    return json(res, status, { error: status === 500 ? 'registration failed' : err.message });
  }

  const payload = await userPayload(userId);
  return json(res, 200, payload, { 'set-cookie': sessionCookie(sessionToken) });
}

async function authLoginOptions(_req, res) {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    timeout: 60000,
    userVerification: 'preferred',
    allowCredentials: []
  });
  const cid = crypto.randomUUID();
  await query(
    `INSERT INTO auth_challenges(id,purpose,challenge,expires_at)
     VALUES ($1,'login',$2,now()+interval '5 minutes')`,
    [cid, options.challenge]
  );
  return json(res, 200, { cid, options });
}

async function authLoginVerify(req, res) {
  const body = await bodyJson(req);
  if (!body.cid || !body.credential?.id) return json(res, 400, { error: 'cid and credential required' });

  const { rows: challenges } = await query(
    `SELECT * FROM auth_challenges WHERE id=$1 AND purpose='login' AND expires_at>now()`,
    [body.cid]
  );
  const challenge = challenges[0];
  if (!challenge) return json(res, 400, { error: 'challenge expired — try again' });

  const { rows: creds } = await query(
    `SELECT c.*,u.status FROM auth_credentials c JOIN users u ON u.id=c.user_id WHERE c.id=$1`,
    [body.credential.id]
  );
  const cred = creds[0];
  if (!cred) return json(res, 404, { error: 'unknown passkey' });
  if (cred.status !== 'active') return json(res, 403, { error: 'account disabled' });

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.credential,
      expectedChallenge: challenge.challenge,
      expectedOrigin: APP_ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
      credential: {
        id: cred.id,
        publicKey: cred.public_key,
        counter: Number(cred.counter || 0),
        transports: Array.isArray(cred.transports) ? cred.transports : []
      }
    });
  } catch (err) {
    console.error('[auth] login verification failed', err?.message || err);
    return json(res, 400, { error: 'passkey verification failed' });
  }
  if (!verification.verified) return json(res, 400, { error: 'not verified' });

  const sessionToken = await tx(async db => {
    await db.query('UPDATE auth_credentials SET counter=$1 WHERE id=$2', [verification.authenticationInfo.newCounter, cred.id]);
    await db.query('DELETE FROM auth_challenges WHERE id=$1', [body.cid]);
    const token = await issueSession(db, cred.user_id, req);
    await audit(db, { actorUserId: cred.user_id, action: 'auth.login', targetType: 'user', targetId: cred.user_id });
    return token;
  });
  const payload = await userPayload(cred.user_id);
  return json(res, 200, payload, { 'set-cookie': sessionCookie(sessionToken) });
}

async function bootstrapInvite(req, res) {
  if (!BOOTSTRAP_TOKEN) return json(res, 404, { error: 'bootstrap disabled' });
  const auth = String(req.headers.authorization || '');
  const supplied = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!safeEqualText(supplied, BOOTSTRAP_TOKEN)) return json(res, 403, { error: 'forbidden' });
  const admins = await query('SELECT count(*)::int AS n FROM users WHERE is_platform_admin=true AND status=\'active\'');
  if (admins.rows[0].n > 0) return json(res, 409, { error: 'platform admin already exists' });

  const code = inviteCode(3, 4);
  const { rows } = await query(
    `INSERT INTO invites(token_hash,target_role,max_uses,expires_at,metadata)
     VALUES ($1,'platform_admin',1,now()+interval '1 day','{}'::jsonb)
     RETURNING id,expires_at`,
    [inviteHash(code)]
  );
  return json(res, 201, { code, invite: rows[0] });
}

async function logout(req, res) {
  const token = sessionTokenFrom(req);
  if (token) await query('DELETE FROM sessions WHERE token_hash=$1', [hashToken(token)]);
  return json(res, 200, { ok: true }, { 'set-cookie': clearSessionCookie() });
}

async function me(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  return json(res, 200, await userPayload(user.id));
}

async function createInviteRoute(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const body = await bodyJson(req);
  try {
    const result = await createInviteForActor({ query }, user, body);
    await audit({ query }, {
      actorUserId: user.id,
      workspaceId: result.invite.workspace_id,
      action: 'invite.create',
      targetType: 'invite',
      targetId: result.invite.id,
      metadata: { targetRole: result.invite.target_role, maxUses: result.invite.max_uses }
    });
    return json(res, 201, result);
  } catch (err) {
    return json(res, errorStatus(err), { error: err.message || 'could not create invite' });
  }
}

async function listInvitesRoute(req, res, url) {
  const user = await requireUser(req, res);
  if (!user) return;
  const workspaceId = url.searchParams.get('workspaceId');
  let rows;
  if (user.is_platform_admin && !workspaceId) {
    ({ rows } = await query(
      `SELECT i.id,i.workspace_id,i.target_role,i.trainer_user_id,i.email,i.max_uses,i.use_count,i.expires_at,i.revoked_at,i.created_at,u.display_name AS created_by
         FROM invites i LEFT JOIN users u ON u.id=i.created_by_user_id
        ORDER BY i.created_at DESC LIMIT 200`
    ));
  } else {
    if (!workspaceId) return json(res, 400, { error: 'workspaceId required' });
    const roles = await membershipRoles(user.id, workspaceId);
    if (!user.is_platform_admin && !roles.size) return json(res, 403, { error: 'forbidden' });
    const trainerOnly = !user.is_platform_admin && !roles.has('owner') && !roles.has('admin') && roles.has('trainer');
    ({ rows } = await query(
      `SELECT i.id,i.workspace_id,i.target_role,i.trainer_user_id,i.email,i.max_uses,i.use_count,i.expires_at,i.revoked_at,i.created_at,u.display_name AS created_by
         FROM invites i LEFT JOIN users u ON u.id=i.created_by_user_id
        WHERE i.workspace_id=$1 ${trainerOnly ? 'AND i.created_by_user_id=$2' : ''}
        ORDER BY i.created_at DESC LIMIT 200`,
      trainerOnly ? [workspaceId, user.id] : [workspaceId]
    ));
  }
  return json(res, 200, { invites: rows });
}

async function revokeInviteRoute(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const body = await bodyJson(req);
  const { rows } = await query('SELECT * FROM invites WHERE id=$1', [body.id]);
  const invite = rows[0];
  if (!invite) return json(res, 404, { error: 'invite not found' });
  let allowed = user.is_platform_admin || invite.created_by_user_id === user.id;
  if (!allowed && invite.workspace_id) {
    const roles = await membershipRoles(user.id, invite.workspace_id);
    allowed = roles.has('owner') || roles.has('admin');
  }
  if (!allowed) return json(res, 403, { error: 'forbidden' });
  await query('UPDATE invites SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1', [invite.id]);
  await audit({ query }, { actorUserId: user.id, workspaceId: invite.workspace_id, action: 'invite.revoke', targetType: 'invite', targetId: invite.id });
  return json(res, 200, { ok: true });
}

async function coachClients(req, res, url) {
  const user = await requireUser(req, res);
  if (!user) return;
  const workspaceId = url.searchParams.get('workspaceId');
  if (!workspaceId) return json(res, 400, { error: 'workspaceId required' });
  const roles = await membershipRoles(user.id, workspaceId);
  const elevated = user.is_platform_admin || roles.has('owner') || roles.has('admin');
  if (!elevated && !roles.has('trainer')) return json(res, 403, { error: 'forbidden' });

  const params = elevated ? [workspaceId] : [workspaceId, user.id];
  const trainerFilter = elevated ? '' : 'AND l.trainer_user_id=$2';
  const { rows } = await query(
    `SELECT l.id AS link_id,l.relationship_type,l.started_at,
            c.id,c.display_name,c.email,c.locale,
            t.id AS trainer_id,t.display_name AS trainer_name,
            (SELECT max(w.started_at) FROM workouts w WHERE w.user_id=c.id) AS last_workout_at,
            (SELECT count(*)::int FROM workouts w WHERE w.user_id=c.id AND w.started_at>=now()-interval '30 days') AS workouts_30d
       FROM trainer_client_links l
       JOIN users c ON c.id=l.client_user_id
       JOIN users t ON t.id=l.trainer_user_id
      WHERE l.workspace_id=$1 AND l.status='active' ${trainerFilter}
      ORDER BY c.display_name`,
    params
  );
  return json(res, 200, { clients: rows });
}

async function businessOverview(req, res, url) {
  const user = await requireUser(req, res);
  if (!user) return;
  const workspaceId = url.searchParams.get('workspaceId');
  if (!workspaceId) return json(res, 400, { error: 'workspaceId required' });
  const roles = await membershipRoles(user.id, workspaceId);
  if (!user.is_platform_admin && !roles.has('owner') && !roles.has('admin')) return json(res, 403, { error: 'forbidden' });
  const { rows: wsRows } = await query('SELECT id,type,name,slug,status,created_at FROM workspaces WHERE id=$1', [workspaceId]);
  if (!wsRows[0]) return json(res, 404, { error: 'workspace not found' });
  const { rows: stats } = await query(
    `SELECT
       count(*) FILTER (WHERE role='trainer' AND status='active')::int AS trainers,
       count(*) FILTER (WHERE role='client' AND status='active')::int AS clients,
       count(*) FILTER (WHERE role IN ('owner','admin') AND status='active')::int AS managers
     FROM workspace_memberships WHERE workspace_id=$1`,
    [workspaceId]
  );
  const { rows: trainers } = await query(
    `SELECT u.id,u.display_name,u.email,
            (SELECT count(*)::int FROM trainer_client_links l WHERE l.workspace_id=$1 AND l.trainer_user_id=u.id AND l.status='active') AS clients
       FROM workspace_memberships m JOIN users u ON u.id=m.user_id
      WHERE m.workspace_id=$1 AND m.role='trainer' AND m.status='active' AND m.ended_at IS NULL
      ORDER BY u.display_name`,
    [workspaceId]
  );
  return json(res, 200, { workspace: wsRows[0], stats: stats[0], trainers });
}

async function adminOverview(req, res) {
  const user = await requirePlatformAdmin(req, res);
  if (!user) return;
  const [users, workspaces, memberships, links, invites] = await Promise.all([
    query(`SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE status='active')::int AS active
             FROM users`),
    query(`SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE type='organization' AND status='active')::int AS organizations,
                  count(*) FILTER (WHERE type='independent_trainer' AND status='active')::int AS independent_trainers
             FROM workspaces`),
    query(`SELECT role,count(*)::int AS count FROM workspace_memberships WHERE status='active' AND ended_at IS NULL GROUP BY role`),
    query(`SELECT count(*)::int AS active FROM trainer_client_links WHERE status='active'`),
    query(`SELECT count(*) FILTER (WHERE revoked_at IS NULL AND expires_at>now() AND use_count<max_uses)::int AS usable FROM invites`)
  ]);
  return json(res, 200, {
    users: users.rows[0],
    workspaces: workspaces.rows[0],
    memberships: Object.fromEntries(memberships.rows.map(r => [r.role, r.count])),
    trainerClientLinks: links.rows[0].active,
    invites: invites.rows[0]
  });
}

async function adminWorkspaces(req, res) {
  const user = await requirePlatformAdmin(req, res);
  if (!user) return;
  const { rows } = await query(
    `SELECT w.id,w.type,w.name,w.slug,w.status,w.created_at,
            count(m.id) FILTER (WHERE m.status='active' AND m.ended_at IS NULL)::int AS members,
            count(m.id) FILTER (WHERE m.role='trainer' AND m.status='active' AND m.ended_at IS NULL)::int AS trainers,
            count(m.id) FILTER (WHERE m.role='client' AND m.status='active' AND m.ended_at IS NULL)::int AS clients
       FROM workspaces w LEFT JOIN workspace_memberships m ON m.workspace_id=w.id
      GROUP BY w.id ORDER BY w.created_at DESC LIMIT 200`
  );
  return json(res, 200, { workspaces: rows });
}

async function listWorkspaces(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  return json(res, 200, { memberships: await membershipsFor({ query }, user.id) });
}

const routes = new Map([
  ['GET /health', async (_req, res) => json(res, 200, { ok: true, service: 'varangym-platform-api', db: await ping() })],
  ['GET /api/config', async (_req, res) => json(res, 200, { brand: 'varangym', rpId: RP_ID, rpName: RP_NAME, origin: APP_ORIGIN })],
  ['POST /api/bootstrap/invite', bootstrapInvite],
  ['POST /api/auth/register/options', authRegisterOptions],
  ['POST /api/auth/register/verify', authRegisterVerify],
  ['POST /api/auth/login/options', authLoginOptions],
  ['POST /api/auth/login/verify', authLoginVerify],
  ['POST /api/logout', logout],
  ['GET /api/me', me],
  ['GET /api/workspaces', listWorkspaces],
  ['POST /api/invites', createInviteRoute],
  ['GET /api/invites', listInvitesRoute],
  ['POST /api/invites/revoke', revokeInviteRoute],
  ['GET /api/coach/clients', coachClients],
  ['GET /api/business/overview', businessOverview],
  ['GET /api/admin/overview', adminOverview],
  ['GET /api/admin/workspaces', adminWorkspaces]
]);

function cors(req, res) {
  const origin = String(req.headers.origin || '');
  if (origin && origin === APP_ORIGIN) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-credentials', 'true');
    res.setHeader('vary', 'Origin');
  }
  res.setHeader('access-control-allow-headers', 'content-type, authorization');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
}

function originAllowed(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return true;
  const origin = req.headers.origin;
  if (!origin) return true; // native app / server-to-server requests authenticate separately
  return origin === APP_ORIGIN;
}

await migrate();
await query('DELETE FROM auth_challenges WHERE expires_at<=now()');
await query('DELETE FROM sessions WHERE expires_at<=now()');
setInterval(() => {
  query('DELETE FROM auth_challenges WHERE expires_at<=now()').catch(() => {});
  query('DELETE FROM sessions WHERE expires_at<=now()').catch(() => {});
}, 15 * 60 * 1000).unref();

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (!originAllowed(req)) return json(res, 403, { error: 'cross-origin request refused' });

  let url;
  try { url = new URL(req.url, 'http://varangym.local'); }
  catch { return json(res, 400, { error: 'bad request' }); }

  const handler = routes.get(`${req.method} ${url.pathname}`);
  if (!handler) return json(res, 404, { error: 'not found' });
  try {
    await handler(req, res, url);
  } catch (err) {
    const status = errorStatus(err);
    console.error('[http]', req.method, url.pathname, err?.stack || err);
    if (!res.headersSent) json(res, status, { error: status === 500 ? 'server error' : err.message });
    else res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[varangym] platform api listening on :${PORT}`);
  console.log(`[varangym] rp=${RP_ID} origin=${APP_ORIGIN}`);
});

for (const signal of ['SIGTERM','SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
