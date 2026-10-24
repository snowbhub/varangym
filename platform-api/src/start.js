import http from 'node:http';
import { spawn } from 'node:child_process';
import { migrate, close as closeDb } from './db.js';

const publicPort = +(process.env.PORT || 3000);
const platformPort = +(process.env.PLATFORM_INTERNAL_PORT || 3002);
const trainingPort = +(process.env.TRAINING_PORT || 3001);
const clientPort = +(process.env.CLIENT_PORT || 3003);
const accessPort = +(process.env.ACCESS_PORT || 3004);
const profilePlanPort = +(process.env.PROFILE_PLAN_PORT || 3005);
const analyticsPort = +(process.env.ANALYTICS_PORT || 3006);
const billingPort = +(process.env.BILLING_PORT || 3007);
const insightsPort = +(process.env.INSIGHTS_PORT || 3008);
const subscriptionPort = +(process.env.SUBSCRIPTION_PORT || 3009);
const geoPort = +(process.env.GEO_PORT || 3010);
const exerciseAdminPort = +(process.env.EXERCISE_ADMIN_PORT || 3011);

let shuttingDown = false;
let gateway = null;
const children = [];

async function prepareDatabase() {
  console.log('[varangym] preparing database before service startup');
  await migrate();
  console.log('[varangym] database migrations ready');
}

function stopChildren(signal = 'SIGTERM') {
  for (const child of children) {
    if (child.exitCode == null && !child.killed) {
      try { child.kill(signal); } catch {}
    }
  }
}

function shutdown(reason, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[varangym] shutting down (${reason})`);

  const finish = () => {
    stopChildren(reason === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
    closeDb()
      .catch(() => {})
      .finally(() => setTimeout(() => process.exit(code), 250).unref());
  };

  if (gateway?.listening) gateway.close(finish);
  else finish();
}

function spawnApi(label, script, port) {
  const child = spawn(process.execPath, [script], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) }
  });
  children.push(child);

  child.on('exit', (code, signal) => {
    console.error(`[varangym] ${label} exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    if (!shuttingDown) shutdown(`${label} failed`, code || 1);
  });

  child.on('error', err => {
    console.error(`[varangym] ${label} process error`, err?.message || err);
    if (!shuttingDown) shutdown(`${label} process error`, 1);
  });

  return child;
}

// A fresh database must be fully migrated before any child service starts. Previously all
// services were spawned first and the platform API ran migrations concurrently, so training
// and client services could query users/exercises before those tables existed.
try {
  await prepareDatabase();
} catch (err) {
  console.error('[varangym] database preparation failed', err?.stack || err);
  process.exit(1);
}

const training = spawnApi('training API', 'src/training-server.js', trainingPort);
const clientApi = spawnApi('client API', 'src/client-server.js', clientPort);
const accessApi = spawnApi('access API', 'src/access-server.js', accessPort);
const profilePlanApi = spawnApi('profile-plan API', 'src/profile-plan-server.js', profilePlanPort);
const analyticsApi = spawnApi('analytics API', 'src/analytics-server.js', analyticsPort);
const billingApi = spawnApi('billing API', 'src/billing-server.js', billingPort);
const insightsApi = spawnApi('insights API', 'src/insights-server.js', insightsPort);
const subscriptionApi = spawnApi('subscription API', 'src/subscription-server.js', subscriptionPort);
const geoApi = spawnApi('geo API', 'src/geo-server.js', geoPort);
const exerciseAdminApi = spawnApi('exercise-admin API', 'src/exercise-admin-server.js', exerciseAdminPort);
const platform = spawnApi('platform API', 'src/server.js', platformPort);

if (process.env.BOOTSTRAP_ADMIN_CODE) {
  setTimeout(() => {
    import('./env-bootstrap.js').catch(err => {
      console.error('[varangym] env bootstrap failed', err?.message || err);
    });
  }, 1000).unref();
}

function toClientPath(raw) {
  if (raw === '/api/me') return '/client/me';
  if (raw === '/api/config') return '/client/config';
  if (raw === '/api/data' || raw.startsWith('/api/data/')) return '/client' + raw.slice('/api'.length);
  if (raw === '/api/activity') return '/client/activity';
  if (raw === '/api/logout/all') return '/client/logout/all';
  if (raw === '/api/pair/create') return '/client/pair/create';
  if (raw === '/api/pair/redeem') return '/client/pair/redeem';
  if (raw === '/api/push/rest-timer') return '/client/push/rest-timer';
  if (raw === '/api/push/rest-timer/cancel') return '/client/push/rest-timer/cancel';
  return null;
}

function upstreamFor(req) {
  const raw = String(req.url || '/');

  const clientPath = toClientPath(raw);
  if (clientPath) return { port: clientPort, path: clientPath };

  if (raw === '/api/invites' || raw.startsWith('/api/invites/')) {
    return { port: accessPort, path: raw.slice('/api'.length) || '/invites' };
  }
  if (raw === '/api/client' || raw.startsWith('/api/client/')) {
    return { port: clientPort, path: raw.slice('/api'.length) || '/client' };
  }
  if (raw === '/api/training' || raw.startsWith('/api/training/')) {
    return { port: trainingPort, path: raw.slice('/api'.length) || '/training' };
  }
  if (raw === '/api/profile-plan' || raw.startsWith('/api/profile-plan/')) {
    return { port: profilePlanPort, path: raw.slice('/api'.length) || '/profile-plan' };
  }
  if (raw === '/api/analytics' || raw.startsWith('/api/analytics/')) {
    return { port: analyticsPort, path: raw.slice('/api'.length) || '/analytics' };
  }
  if (raw === '/api/billing' || raw.startsWith('/api/billing/')) {
    return { port: billingPort, path: raw.slice('/api'.length) || '/billing' };
  }
  if (raw === '/api/insights' || raw.startsWith('/api/insights/') || raw === '/api/trial' || raw.startsWith('/api/trial/')) {
    return { port: insightsPort, path: raw.slice('/api'.length) || '/' };
  }
  if (raw === '/api/subscription' || raw.startsWith('/api/subscription/')) {
    return { port: subscriptionPort, path: raw.slice('/api'.length) || '/subscription' };
  }
  if (raw === '/api/geo' || raw.startsWith('/api/geo/')) {
    return { port: geoPort, path: raw.slice('/api'.length) || '/geo' };
  }
  if (raw === '/api/exercise-admin' || raw.startsWith('/api/exercise-admin/')) {
    return { port: exerciseAdminPort, path: raw.slice('/api'.length) || '/exercise-admin' };
  }
  return { port: platformPort, path: raw };
}

gateway = http.createServer((req, res) => {
  const upstream = upstreamFor(req);
  const headers = { ...req.headers, host: `127.0.0.1:${upstream.port}` };

  const proxy = http.request({
    hostname: '127.0.0.1',
    port: upstream.port,
    method: req.method,
    path: upstream.path,
    headers
  }, upstreamRes => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  proxy.setTimeout(30_000, () => proxy.destroy(new Error('upstream timeout')));
  proxy.on('error', err => {
    console.error('[varangym] gateway proxy error', req.method, req.url, err.message);
    if (!res.headersSent) {
      const body = JSON.stringify({ error: 'upstream unavailable' });
      res.writeHead(502, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store'
      });
      res.end(body);
    } else {
      res.end();
    }
  });

  req.pipe(proxy);
});

gateway.on('error', err => {
  console.error('[varangym] gateway failed', err?.message || err);
  if (!shuttingDown) shutdown('gateway failed', 1);
});

gateway.listen(publicPort, '0.0.0.0', () => {
  console.log(`[varangym] gateway listening on :${publicPort} -> platform:${platformPort}, training:${trainingPort}, client:${clientPort}, access:${accessPort}, profile-plan:${profilePlanPort}, analytics:${analyticsPort}, billing:${billingPort}, insights:${insightsPort}, subscription:${subscriptionPort}, geo:${geoPort}, exercise-admin:${exerciseAdminPort}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => shutdown(signal, 0));
}
