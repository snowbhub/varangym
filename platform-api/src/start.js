import http from 'node:http';
import { spawn } from 'node:child_process';

const publicPort = +(process.env.PORT || 3000);
const platformPort = +(process.env.PLATFORM_INTERNAL_PORT || 3002);
const trainingPort = +(process.env.TRAINING_PORT || 3001);
const clientPort = +(process.env.CLIENT_PORT || 3003);
const accessPort = +(process.env.ACCESS_PORT || 3004);

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
const platform = spawnApi('platform API', 'src/server.js', platformPort);

if (process.env.BOOTSTRAP_ADMIN_CODE) {
  setTimeout(() => {
    import('./env-bootstrap.js').catch(err => {
      console.error('[varangym] env bootstrap failed', err?.message || err);
    });
  }, 1000).unref();
}

function upstreamFor(req) {
  const raw = String(req.url || '/');

  // The original openGym React client remains the athlete UI. These compatibility routes
  // give it the same per-profile sync contract while the data lives in VARANGYM PostgreSQL.
  if (raw === '/api/me') return { port: clientPort, path: '/client/me' };
  if (raw === '/api/config') return { port: clientPort, path: '/client/config' };
  if (raw === '/api/data' || raw.startsWith('/api/data/')) {
    return { port: clientPort, path: '/client' + raw.slice('/api'.length) };
  }

  if (raw === '/api/invites' || raw.startsWith('/api/invites/')) {
    return { port: accessPort, path: raw.slice('/api'.length) || '/invites' };
  }
  if (raw === '/api/client' || raw.startsWith('/api/client/')) {
    return { port: clientPort, path: raw.slice('/api'.length) || '/client' };
  }
  if (raw === '/api/training' || raw.startsWith('/api/training/')) {
    return { port: trainingPort, path: raw.slice('/api'.length) || '/training' };
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
  console.log(`[varangym] gateway listening on :${publicPort} -> platform:${platformPort}, training:${trainingPort}, client:${clientPort}, access:${accessPort}`);
});

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[varangym] shutting down (${signal})`);
  gateway.close(() => {
    for (const child of [platform, training, clientApi, accessApi]) {
      if (!child.killed) child.kill(signal);
    }
    setTimeout(() => process.exit(0), 250).unref();
  });
}

for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => shutdown(signal));
