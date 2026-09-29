import http from 'node:http';
import { spawn } from 'node:child_process';

const publicPort = +(process.env.PORT || 3000);
const platformPort = +(process.env.PLATFORM_INTERNAL_PORT || 3002);
const trainingPort = +(process.env.TRAINING_PORT || 3001);
const clientPort = +(process.env.CLIENT_PORT || 3003);
const accessPort = +(process.env.ACCESS_PORT || 3004);
const profilePlanPort = +(process.env.PROFILE_PLAN_PORT || 3005);
const analyticsPort = +(process.env.ANALYTICS_PORT || 3006);
const billingPort = +(process.env.BILLING_PORT || 3007);
const signupPort = +(process.env.SIGNUP_PORT || 3008);
const exerciseAdminPort = +(process.env.EXERCISE_ADMIN_PORT || 3009);
const adminInsightsPort = +(process.env.ADMIN_INSIGHTS_PORT || 3010);
const sessionMetaPort = +(process.env.SESSION_META_PORT || 3011);
const accessStatusPort = +(process.env.ACCESS_STATUS_PORT || 3012);

function spawnApi(label, script, port) {
  const child = spawn(process.execPath, [script], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) }
  });
  child.on('exit', (code, signal) => {
    console.error(`[varangym] ${label} exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    if (!shuttingDown) process.exit(code || 1);
  });
  return child;
}

let shuttingDown = false;
const training = spawnApi('training API', 'src/training-server.js', trainingPort);
const clientApi = spawnApi('client API', 'src/client-server.js', clientPort);
const accessApi = spawnApi('access API', 'src/access-server.js', accessPort);
const profilePlanApi = spawnApi('profile-plan API', 'src/profile-plan-server.js', profilePlanPort);
const analyticsApi = spawnApi('analytics API', 'src/analytics-server.js', analyticsPort);
const billingApi = spawnApi('billing API', 'src/billing-server.js', billingPort);
const signupApi = spawnApi('signup API', 'src/signup-server.js', signupPort);
const exerciseAdminApi = spawnApi('exercise-admin API', 'src/exercise-admin-server.js', exerciseAdminPort);
const adminInsightsApi = spawnApi('admin-insights API', 'src/admin-insights-server.js', adminInsightsPort);
const sessionMetaApi = spawnApi('session-meta API', 'src/session-meta-server.js', sessionMetaPort);
const accessStatusApi = spawnApi('access-status API', 'src/access-status-server.js', accessStatusPort);
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
  if (raw === '/api/signup' || raw.startsWith('/api/signup/')) {
    return { port: signupPort, path: raw.slice('/api'.length) || '/signup' };
  }
  if (raw === '/api/exercise-admin' || raw.startsWith('/api/exercise-admin/')) {
    return { port: exerciseAdminPort, path: raw.slice('/api'.length) || '/exercise-admin' };
  }
  if (raw === '/api/admin-insights' || raw.startsWith('/api/admin-insights/')) {
    return { port: adminInsightsPort, path: raw.slice('/api'.length) || '/admin-insights' };
  }
  if (raw === '/api/session-meta' || raw.startsWith('/api/session-meta/')) {
    return { port: sessionMetaPort, path: raw.slice('/api'.length) || '/session-meta' };
  }
  if (raw === '/api/access' || raw.startsWith('/api/access/')) {
    return { port: accessStatusPort, path: raw.slice('/api'.length) || '/access' };
  }
  return { port: platformPort, path: raw };
}

const gateway = http.createServer((req, res) => {
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

gateway.listen(publicPort, '0.0.0.0', () => {
  console.log(`[varangym] gateway listening on :${publicPort} -> platform:${platformPort}, training:${trainingPort}, client:${clientPort}, access:${accessPort}, profile-plan:${profilePlanPort}, analytics:${analyticsPort}, billing:${billingPort}, signup:${signupPort}, exercise-admin:${exerciseAdminPort}, admin-insights:${adminInsightsPort}, session-meta:${sessionMetaPort}, access-status:${accessStatusPort}`);
});

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[varangym] shutting down (${signal})`);
  gateway.close(() => {
    for (const child of [platform, training, clientApi, accessApi, profilePlanApi, analyticsApi, billingApi, signupApi, exerciseAdminApi, adminInsightsApi, sessionMetaApi, accessStatusApi]) {
      if (!child.killed) child.kill(signal);
    }
    setTimeout(() => process.exit(0), 250).unref();
  });
}

for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => shutdown(signal));
