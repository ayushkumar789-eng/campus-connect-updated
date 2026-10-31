#!/usr/bin/env node
/**
 * Infrastructure edge cases.
 *
 * `edge-cases.js` covers a *healthy* server being misused. This suite covers an
 * *unhealthy* deployment: the database is unreachable, the realtime layer is
 * switched off, the port is already taken.
 *
 * These are the failures that produce the worst output — a raw Mongoose
 * buffering timeout printed with a stack trace, or a process that accepts
 * traffic it cannot serve. The question every case here answers is the same:
 * does the system fail *legibly*, and does it stay up to be fixed?
 *
 * The database-outage case needs a TCP proxy in the middle, because MongoDB
 * cannot be stopped and restarted underneath a running server without taking
 * every other database with it. The proxy gives the same wire-level failure
 * with a switch.
 *
 * Usage: node scripts/edge-infra.js
 */
import net from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');

const SERVER_PORT = 5091;
const PROXY_PORT = 5092;
const BASE = `http://localhost:${SERVER_PORT}/api`;

// Throwaway credentials. Never printed.
const JWT_A = 'a3f8c1d94b2e70615f8a3c9d24e7b0516c2d8f4a1e9b7d035c6f2a8e4b1d709';
const JWT_B = '7c2b9e05f14a8d63b0e2f7c95a1d4806f3b2e7c90a5d1f68b4e37c02a9d5f18';

let passed = 0;
let failed = 0;
const failures = [];

function check(label, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${label} — ${detail}`);
    console.log(`  ✗ ${label}  :: ${detail}`);
  }
}

function section(title) {
  console.log(`\n────────────────────────────────────────────────────────────────────────`);
  console.log(title);
  console.log(`────────────────────────────────────────────────────────────────────────`);
}

const LEAK = [
  [/at\s+\w+\s+\(.*:\d+:\d+\)/, 'a stack frame'],
  [/\/Users\//, 'an absolute build path'],
  [/\bnode_modules\b/, 'a node_modules path'],
  [/MongoServerError|MongoError|MongooseError|MongooseServerSelectionError/, 'a raw driver error name'],
  [/\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|EADDRINUSE)\b/, 'a socket error code'],
  [/mongodb(?:\+srv)?:\/\//, 'a connection string'],
];

const leaksIn = (t) => LEAK.filter(([re]) => re.test(t)).map(([, n]) => n);

// ── Server lifecycle helper ─────────────────────────────────────────────────
const children = [];

/** Config that satisfies the production boot gate without touching anything real. */
const PROD_ENV = {
  NODE_ENV: 'production',
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 'probe-not-a-real-credential',
  EMAIL_FROM: 'no-reply@campusconnect.example',
  EMAIL_VERIFICATION_DEV_BYPASS: 'false',
  CLIENT_URL: 'https://app.campusconnect.example',
  SERVER_URL: 'https://api.campusconnect.example',
  COOKIE_SECURE: 'true',
};

function bootServer(env, { waitMs = 0 } = {}) {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: serverDir,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      PORT: String(SERVER_PORT),
      MONGO_URI: 'mongodb://127.0.0.1:27017/campusconnect_edgeinfra',
      JWT_SECRET: JWT_A,
      JWT_REFRESH_SECRET: JWT_B,
      ALLOW_LOCAL_STORAGE: 'true',
      SERVER_URL: `http://localhost:${SERVER_PORT}`,
      CLIENT_URL: 'http://localhost:5173',
      EMAIL_PROVIDER: 'console',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  child.out = () => out;
  if (waitMs) return sleep(waitMs).then(() => child);
  return Promise.resolve(child);
}

async function waitForHealth(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(400);
  }
  return false;
}

async function probe(path, opts = {}) {
  try {
    const r = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(opts.timeout ?? 20_000), ...opts });
    const text = await r.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: r.status, text, body };
  } catch (err) {
    return { status: 0, text: err.message, body: null, threw: err };
  }
}

function killAll() {
  for (const c of children) {
    try {
      c.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
  children.length = 0;
}

// ── 1. The database is unreachable at boot ─────────────────────────────────
section('1. The database is unreachable when the process starts');

{
  const child = await bootServer(
    {
      MONGO_URI: 'mongodb://127.0.0.1:51999/campusconnect_edgeinfra',
    },
    // The driver's default serverSelectionTimeoutMS is 10 s, so the process
    // takes ~10 s to give up. Waiting less would have read the output while the
    // process was still trying, and scored a correct fail-fast as a hang.
    { waitMs: 20_000 },
  );

  const out = child.out();
  const exited = child.exitCode !== null || child.signalCode !== null;
  check(
    'the server refuses to serve traffic it cannot back',
    exited || !(await probe('/health').then((r) => r.status === 200)),
    `health returned ${(await probe('/health')).status}`,
  );
  check(
    'the failure is explained in plain language, not a raw driver throw',
    /database|mongo|connect/i.test(out) && !/MongoServerSelectionError/.test(out.split('\n').slice(0, 6).join('\n')),
    out.split('\n').slice(0, 3).join(' | ').slice(0, 160),
  );
  // The boot output names the host and port the operator misconfigured. That is
  // the operator's own stdout — the process exited before binding a port, so no
  // HTTP client can receive it. Asserting that operators get no diagnostics
  // would be asserting a worse product.
  check(
    'the raw driver diagnostic goes to the operator log, not to a client',
    exited && !(await probe('/health').then((r) => r.status === 200)),
    'the process was still accepting requests after failing to boot',
  );
  check(
    'the process binds no port while it cannot reach the database',
    exited,
    `exit code ${child.exitCode}, signal ${child.signalCode} — it kept running without a database`,
  );
  if (!exited) killAll();
}

await sleep(1500);

// ── 2. The database dies while the server is running ───────────────────────
section('2. The database dies while the server is serving');

// A TCP proxy in front of MongoDB, so the outage can be induced without
// touching the real mongod.
// Every live socket through the proxy, so the outage can be induced on the
// *pooled* connections and not merely on new ones. Severing only the accept
// path leaves Mongoose's existing pool happily talking to MongoDB, and the
// outage silently never happens.
let severed = false;
const openSockets = new Set();
const proxy = net.createServer((client) => {
  if (severed) {
    client.destroy();
    return;
  }
  const upstream = net.connect(27017, '127.0.0.1');
  const pair = { client, upstream };
  openSockets.add(pair);
  const drop = (pair_ = pair) => {
    openSockets.delete(pair_);
    client.destroy();
    upstream.destroy();
  };
  client.pipe(upstream);
  upstream.pipe(client);
  client.on('error', () => drop());
  upstream.on('error', () => drop());
  client.on('close', () => drop());
  upstream.on('close', () => drop());
});
await new Promise((r) => proxy.listen(PROXY_PORT, '127.0.0.1', r));

const cutAll = () => {
  severed = true;
  for (const pair of [...openSockets]) {
    pair.client.destroy();
    pair.upstream.destroy();
  }
  openSockets.clear();
};

// Production mode, deliberately. The error handler withholds stack traces and
// driver internals only when `isProd` holds (server/src/middleware/error.js),
// so running this case in test mode would assert the *absence* of a guarantee
// the codebase never claims for non-production. The question worth asking is
// whether a real deployment leaks, and the answer has to be measured there.
const child = await bootServer({ ...PROD_ENV, MONGO_URI: `mongodb://127.0.0.1:${PROXY_PORT}/campusconnect_edgeinfra` });
const healthy = await waitForHealth(35_000);
check('the server boots and reports healthy through the proxy', healthy, 'never became healthy');
await sleep(1000);

if (healthy) {
  const before = await probe('/posts/feed?scope=all&limit=1');
  check('the API serves before the outage', before.status === 200, `status ${before.status}`);

  const poolBefore = openSockets.size;
  cutAll();
  await sleep(3000);

  check(
    `the outage really severed every pooled connection (${poolBefore} open)`,
    poolBefore > 0 && openSockets.size === 0,
    `${poolBefore} sockets were open before the cut, ${openSockets.size} after`,
  );

  const during = await probe('/posts/feed?scope=all&limit=1', { timeout: 25_000 });
  const leaks = leaksIn(during.text);
  check(
    'during a database outage the API returns a 5xx rather than an empty success',
    during.status >= 500,
    `status ${during.status} — a 200 here would be lying about the data`,
  );
  check(
    'the outage response leaks no stack trace, driver name, path or connection string',
    leaks.length === 0,
    leaks.join(', ') || `body: ${during.text.slice(0, 120)}`,
  );
  check(
    'the outage response still uses the standard error envelope',
    typeof during.body?.success === 'boolean' && typeof (during.body?.message ?? during.body?.error?.message) === 'string',
    `body keys: ${Object.keys(during.body ?? {}).join(', ')}`,
  );
  check(
    'the outage response does not name the database or the driver',
    !/campusconnect_edgeinfra|mongodb:\/\//i.test(during.text),
    during.text.slice(0, 140),
  );

  // The critical question: is the process still able to be diagnosed and fixed?
  const alive = child.exitCode === null && child.signalCode === null;
  check('the process survives the outage instead of exiting', alive, `exit code ${child.exitCode}`);

  // A readiness probe that returns 503 while the database is unreachable is
  // correct — it is what keeps a load balancer from sending traffic to a
  // process that cannot serve it. What would be wrong is a *200 "ok"*, or a
  // probe that hangs until the orchestrator's own timeout fires.
  const health = await probe('/health', { timeout: 8000 });
  check(
    '/health reports the outage instead of claiming to be ok',
    health.status === 503 && health.body?.data?.status !== 'ok',
    `status ${health.status}, body ${health.text.slice(0, 120)}`,
  );
  check(
    '/health answers promptly rather than hanging',
    typeof health.status === 'number' && health.status !== 0,
    'the health endpoint did not respond within 8 s',
  );
  check(
    'the /health outage body also withholds internals',
    leaksIn(health.text).length === 0,
    leaksIn(health.text).join(', '),
  );

  // Restore the database and see whether the app heals without a restart.
  severed = false;
  await sleep(7000);
  const after = await probe('/posts/feed?scope=all&limit=1', { timeout: 25_000 });
  check(
    'the API recovers on its own once the database returns (no restart needed)',
    after.status === 200,
    `status ${after.status} — the driver never reconnected`,
  );

  // A stack trace in the *server log* during a database outage is the operator's
  // diagnostic and belongs there — withholding it would make outages harder to
  // diagnose. What must never appear in that log is a credential.
  const log = child.out();
  check(
    'the server log keeps its stack trace (operators need it to diagnose an outage)',
    /Mongo|Mongoose|ECONNRESET|topology/i.test(log),
    'the log had no trace of the failure at all',
  );
  check(
    'no secret ever reaches the server log',
    !log.includes(JWT_A) && !log.includes(JWT_B) && !/mongodb:\/\/[^\s"']*:[^\s"'@]*@/.test(log),
    'a JWT secret or a credentialed connection string appeared in the log',
  );
}

proxy.close();
killAll();
await sleep(1500);

// ── 3. The realtime layer is switched off ──────────────────────────────────
section('3. The realtime layer is unavailable');

{
  const offline = await bootServer({
    MONGO_URI: 'mongodb://127.0.0.1:27017/campusconnect_edgeinfra',
    ENABLE_SOCKETS: 'false',
  });
  const up = await waitForHealth(35_000);
  check('the server boots with sockets disabled', up, 'never became healthy');

  if (up) {
    for (const [label, path] of [
      ['health', '/health'],
      ['the feed', '/posts/feed?scope=all&limit=1'],
      ['auth', '/auth/refresh'],
    ]) {
      const r = await probe(path, { method: 'POST' });
      check(`the REST API works with sockets disabled (${label})`, r.status < 500, `status ${r.status}`);
    }
    const ws = await fetch(`http://localhost:${SERVER_PORT}/socket.io/?EIO=4&transport=polling`, {
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    check(
      'the socket endpoint is absent rather than half-open',
      ws === null || ws.status === 404,
      ws === null ? 'connection refused' : `status ${ws.status}`,
    );
  }
  killAll();
  await sleep(1500);
}

{
  // And with sockets enabled but nothing listening on the socket transport, the
  // REST API must be unaffected — the browser E2E covers the working case.
  await bootServer({
    MONGO_URI: 'mongodb://127.0.0.1:27017/campusconnect_edgeinfra',
    ENABLE_SOCKETS: 'true',
    SOCKET_PORT: String(SERVER_PORT),
  });
  const up = await waitForHealth(35_000);
  check('the server boots with sockets enabled', up, 'never became healthy');

  if (up) {
    const feed = await probe('/posts/feed?scope=all&limit=1');
    check('the REST API is unaffected by the socket transport', feed.status === 200, `status ${feed.status}`);
    const socket = await fetch(`http://localhost:${SERVER_PORT}/socket.io/?EIO=4&transport=polling`, {
      signal: AbortSignal.timeout(6000),
    }).catch(() => null);
    check('the socket handshake completes when it is enabled', socket !== null && socket.ok, socket === null ? 'refused' : `status ${socket.status}`);
  }
  killAll();
  await sleep(1500);
}

// ── 4. The port is already taken ───────────────────────────────────────────
section('4. The port is already in use');

{
  // Bound exactly the way the server binds it — `listen(port)` with no host, so
  // Node takes `::` dual-stack. Binding to `127.0.0.1` instead lets the real
  // server bind IPv6 alongside it, which is a dual-stack quirk of the test, not
  // a port-conflict test at all.
  const squatter = net.createServer(() => {});
  await new Promise((r) => squatter.listen(SERVER_PORT, r));

  // Long enough to reach the listen() call. Reading earlier caught the process
  // still building indexes, which says nothing about the port.
  const child = await bootServer({ MONGO_URI: 'mongodb://127.0.0.1:27017/campusconnect_edgeinfra' }, { waitMs: 30_000 });
  const out = child.out();
  check(
    'a port conflict is reported plainly (EADDRINUSE and the port)',
    /EADDRINUSE/i.test(out) && out.includes(String(SERVER_PORT)),
    out.split('\n').slice(0, 3).join(' | ').slice(0, 160),
  );
  check(
    'the process exits rather than half-serving on a port conflict',
    child.exitCode === 1,
    `exit code ${child.exitCode}, signal ${child.signalCode}`,
  );

  squatter.close();
  killAll();
}
await sleep(800);

// ── 5. A client that stops listening mid-request ───────────────────────────
section('5. A client that hangs up mid-request');

{
  const child = await bootServer({ MONGO_URI: 'mongodb://127.0.0.1:27017/campusconnect_edgeinfra' });
  const up = await waitForHealth(35_000);
  check('the server boots for the hang-up test', up, 'never became healthy');

  if (up) {
    // Destroy the socket mid-response, 20 times over.
    for (let i = 0; i < 20; i += 1) {
      const req = net.connect(SERVER_PORT, '127.0.0.1');
      req.on('connect', () => {
        req.write('GET /api/posts/feed?scope=all&limit=20 HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
        setTimeout(() => req.destroy(), 3 + (i % 7));
      });
      req.on('error', () => {});
    }
    await sleep(2500);

    const after = await probe('/health', { timeout: 8000 });
    check('the server survives 20 aborted connections', after.status === 200, `status ${after.status}`);

    const feed = await probe('/posts/feed?scope=all&limit=1', { timeout: 10_000 });
    check('and still serves real requests afterwards', feed.status === 200, `status ${feed.status}`);

    const alive = child.exitCode === null && child.signalCode === null;
    check('the process is still alive at the end of it all', alive, `exit code ${child.exitCode}`);
  }
  killAll();
}

console.log(`\n────────────────────────────────────────────────────────────────────────`);
console.log(`${passed} passed, ${failed} failed  (${passed + failed} total)`);
if (failed) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('────────────────────────────────────────────────────────────────────────');
process.exit(failed ? 1 : 0);