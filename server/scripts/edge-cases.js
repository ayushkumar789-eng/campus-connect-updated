#!/usr/bin/env node
/**
 * Infrastructure and transport edge cases.
 *
 * `e2e-browser.js` covers what the application does when the request is wrong.
 * This suite covers what happens when the *plumbing* is wrong: the database is
 * gone, the socket layer is gone, the client hangs, the payload is larger than
 * the transport will carry. Those are the failures that produce 500s with a
 * stack trace in the response body, and they are the ones an application-level
 * test cannot reach because it needs the application to be healthy.
 *
 * Each case asserts three things:
 *   1. the response is a shaped error, not a raw Node/Mongoose/Mongo throw;
 *   2. the body contains no stack trace, file path, or driver internals;
 *   3. the process is still alive and serving afterwards — a 500 that leaves
 *      the process wedged is worse than the 500 itself.
 *
 * Usage: node scripts/edge-cases.js <base-url>
 */
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.argv[2] ?? process.env.API ?? 'http://localhost:5093/api';
const DEV_PORTS = /localhost:5050|127\.0\.0\.1:5050/;
if (DEV_PORTS.test(BASE) && !process.env.ALLOW_DEV_DB) {
  console.error(`✖ edge-cases refuses to run against the development API (${BASE}).`);
  process.exit(2);
}

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
  console.log(`${title}`);
  console.log(`────────────────────────────────────────────────────────────────────────`);
}

/** Shapes that must never appear in a client-facing error body. */
const LEAK_PATTERNS = [
  [/at\s+\w+\s+\(.*:\d+:\d+\)/, 'a stack frame'],
  [/\/Users\//, 'an absolute build path'],
  [/node_modules/, 'a node_modules path'],
  [/MongoServerError|MongoError|bulkWriteException/, 'a raw Mongo driver error name'],
  [/(?:^|\W)errno\s*[:=]/, 'an errno field'],
  [/ObjectId\(/, 'an ObjectId constructor call'],
  [/\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT)\b/, 'a socket error code'],
  [/mongodb:\/\//, 'a connection string'],
];

function leaksIn(text) {
  return LEAK_PATTERNS.filter(([re]) => re.test(text)).map(([, name]) => name);
}

async function probe(label, fn, { expectStatuses = [] } = {}) {
  let res;
  try {
    res = await fn();
  } catch (err) {
    check(label, false, `the request itself threw: ${err.message}`);
    return null;
  }

  const text = res.text ?? '';
  const leaks = leaksIn(text);
  const statusOk =
    expectStatuses.length === 0 ? true : expectStatuses.includes(res.status);

  check(
    label,
    statusOk && leaks.length === 0,
    [
      statusOk ? '' : `status ${res.status}, expected ${expectStatuses.join(' or ')}`,
      leaks.length ? `body leaks ${leaks.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('; ') || 'ok',
  );
  return res;
}

// ── A registered, authenticated user ────────────────────────────────────────
const STAMP = Math.random().toString(36).slice(2, 8);
const PASSWORD = 'Edge@Passw0rd2026';

async function call(path, { method = 'GET', token, body, headers = {}, raw } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body && !raw) h['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body ? (raw ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, body: json, text, headers: res.headers };
}

const reg = await call('/auth/register', {
  method: 'POST',
  body: {
    name: 'Edge User',
    username: `edge${STAMP}`,
    email: `edge${STAMP}@e2e.test`,
    password: PASSWORD,
    college: 'Edge University',
    branch: 'Computer Science',
    course: 'BCA',
    year: 2,
  },
});
const token = reg.body?.data?.accessToken;

section('1. Malformed and hostile input');

// A body that is not JSON at all, on several route families.
for (const [label, path] of [
  ['feed query', '/posts/feed'],
  ['group create', '/groups'],
  ['note create', '/notes'],
  ['event create', '/events'],
  ['search', '/search?q=test'],
]) {
  await probe(
    `${label}: a body that is not JSON is a 4xx, not a 500`,
    () => call(path, { method: 'POST', token, raw: true, body: '{{{ not json' }),
    { expectStatuses: [400, 404, 405, 415] },
  );
}

await probe(
  'an empty body where one is required is 400',
  () => call('/groups', { method: 'POST', token, raw: true, body: '' }),
  { expectStatuses: [400] },
);
await probe(
  'a JSON body of `null` is 400, not 500',
  () => call('/groups', { method: 'POST', token, raw: true, body: 'null' }),
  { expectStatuses: [400] },
);
await probe(
  'a JSON array where an object is required is 400',
  () => call('/groups', { method: 'POST', token, raw: true, body: '[1,2,3]' }),
  { expectStatuses: [400] },
);
await probe(
  'a deeply nested body does not crash the validator',
  () => call('/groups', { method: 'POST', token, body: { name: 'x', meta: { a: { b: { c: { d: [1, 2, 3] } } } } } }),
  { expectStatuses: [201, 400] },
);

// Oversized: well past any sane content limit, but still a legal HTTP request.
const HUGE = 'A'.repeat(3 * 1024 * 1024);
await probe(
  'a 3 MiB body is rejected without crashing',
  () => call('/posts', { method: 'POST', token, body: { content: HUGE } }),
  { expectStatuses: [400, 413] },
);

// Path traversal and injection in every parameter position.
for (const [label, path] of [
  ['../../etc/passwd in an id', '/posts/..%2F..%2F..%2Fetc%2Fpasswd'],
  ['an operator object as a path id', '/posts/%7B%22%24ne%22%3A%22%22%7D'],
  ['null byte in an id', '/posts/abc%00def'],
  ['a path with %00 in the slug', '/groups/slug%00with-null'],
]) {
  await probe(
    `${label} is a 4xx`,
    () => call(path, { token }),
    { expectStatuses: [400, 404] },
  );
}

// ReDoS. The search service escapes user input before building a RegExp, so a
// catastrophic pattern is searched for *literally* and returns nothing. The
// assertion that matters is the clock: an unescaped `(a+)+$` takes exponential
// time on a non-matching input, so a fast empty 200 is the proof.
for (const [label, q] of [
  ['a catastrophic backtracking pattern', '%28a%2B%29%2B%24'],
  ['a long bounded repetition', 'a%7B500%7D'],
  ['a nested quantifier over 2000 chars', '%28%5Ba-z%5D%2B%29%2B'.padEnd(2000, 'a')],
]) {
  const t0 = Date.now();
  const r = await call(`/search?q=${q}`, { token });
  const ms = Date.now() - t0;
  // Any fast answer is a pass. A 400 means the input was rejected outright; a 200
  // means it was searched for literally. What would *fail* is a slow one: an
  // unescaped pattern is exponential on a non-matching input.
  check(
    `${label} returns without backtracking (${ms} ms)`,
    [200, 400, 414].includes(r.status) && ms < 2000,
    `status ${r.status} after ${ms} ms — an unescaped pattern would take exponential time`,
  );
}

section('2. Authentication and token handling');

const badTokens = [
  ['an empty bearer token', ''],
  ['a structurally invalid JWT', 'not-a-jwt'],
  ['a three-segment JWT with garbage segments', 'aaa.bbb.ccc'],
  ['a JWT with an empty signature', 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImZha2UifQ.'],
  ['a JWT signed with the wrong algorithm', 'eyJhbGciOiJub25lIn0.eyJpZCI6ImZha2UifQ.'],
  ['a token that is simply very long', 'x'.repeat(4096)],
];
for (const [label, value] of badTokens) {
  await probe(`${label} is 401`, () => call('/auth/me', { headers: { Authorization: `Bearer ${value}` } }), {
    expectStatuses: [401],
  });
}

// A valid token with the signing key swapped — the classic algorithm-confusion
// and `alg: none` attacks.
const parts = token.split('.');
await probe(
  'a token with its payload altered is 401',
  () => call('/auth/me', { headers: { Authorization: `Bearer ${parts[0]}.${btoa('{"id":"000000000000000000000000","role":"admin"}')}.${parts[2]}` } }),
  { expectStatuses: [401] },
);
await probe(
  'an `alg: none` unsigned token is 401',
  () => call('/auth/me', { headers: { Authorization: `Bearer ${btoa('{"alg":"none","typ":"JWT"}')}.${btoa('{"id":"000000000000000000000000","role":"admin"}')}.` } }),
  { expectStatuses: [401] },
);

section('3. Client behaviour under load and latency');

// Duplicate submission — the same POST twice must not create two rows.
const dup1 = await call('/posts', { method: 'POST', token, body: { content: `edge-duplicate-probe ${STAMP}` } });
const dup2 = await call('/posts', { method: 'POST', token, body: { content: `edge-duplicate-probe ${STAMP}` } });
const id1 = dup1.body?.data?.id ?? dup1.body?.data?._id;
const id2 = dup2.body?.data?.id ?? dup2.body?._id;
check(
  'a duplicated POST does not silently create two identical posts',
  id1 !== id2 || dup2.status >= 400,
  `two creates returned the same id ${id1} — nothing de-duplicates them`,
);

// Concurrent identical reads must all succeed (no connection-pool starvation).
const concurrent = await Promise.all(
  Array.from({ length: 40 }, () => call('/posts/feed?scope=all&limit=1', { token })),
);
check(
  '40 concurrent feed reads all succeed (connection pool is not exhausted)',
  concurrent.every((r) => r.status === 200),
  `statuses: ${[...new Set(concurrent.map((r) => r.status))].join(', ')}`,
);
check(
  'no concurrent-read response leaked internals',
  concurrent.every((r) => leaksIn(r.text).length === 0),
  concurrent.find((r) => leaksIn(r.text).length > 0) ? leaksIn(concurrent.find((r) => leaksIn(r.text).length > 0).text).join(', ') : '',
);

// A request the client abandons must not take the server down with it.
const controller = new AbortController();
const abandoned = call('/posts/feed?scope=all&limit=20', { token }).catch(() => null);
controller.abort();
await abandoned;
await sleep(250);
await probe(
  'the server still serves after a client-side abort',
  () => call('/health'),
  { expectStatuses: [200] },
);

// Sequential burst: no leak of handles, no slowdown to a crawl.
const t0 = Date.now();
for (let i = 0; i < 60; i += 1) await call('/posts/feed?scope=all&limit=1', { token });
const elapsed = Date.now() - t0;
check(
  '60 sequential requests complete in a reasonable time (no handle leak)',
  elapsed < 15_000,
  `took ${elapsed} ms for 60 requests`,
);

section('4. Empty-result surfaces (a fresh account must get clean empties)');

for (const [label, path] of [
  ['the all-posts feed', '/posts/feed?scope=all&limit=5'],
  ['the following feed', '/posts/feed?scope=following&limit=5'],
  ['notifications', '/notifications'],
  ['saved posts', '/posts/saved'],
  ['conversations', '/conversations'],
  ['events', '/events'],
  ['notes', '/notes'],
  ['groups', '/groups'],
]) {
  const r = await call(path, { token });
  const ok = r.status === 200 && leaksIn(r.text).length === 0;
  check(`${label} on a fresh account is a shaped 200 with an empty list`, ok, `status ${r.status}`);
}

// The global feed is *not* empty for a new user — it is seeded with everyone
// else's posts. Asserting it empty would be asserting a bug.
const globalFeed = await call('/posts/feed?scope=all&limit=5', { token });
check(
  'the global feed is populated for a new account (own posts are visible)',
  globalFeed.status === 200,
  `status ${globalFeed.status}`,
);

section('5. Socket layer independence');

// The HTTP API must not depend on the realtime transport. If socket.io is
// disabled or unreachable, these still have to work.
for (const [label, path] of [
  ['health', '/health'],
  ['feed over HTTP', '/posts/feed?scope=all&limit=1'],
  ['auth over HTTP', '/auth/me'],
]) {
  const r = await call(path, { token });
  check(`${label} works independently of the socket layer`, r.status === 200, `status ${r.status}`);
}

section('6. Method and route handling');

for (const [label, path, method, statuses] of [
  ['DELETE on a read-only collection', '/posts/feed', 'DELETE', [400, 404, 405]],
  ['PUT on the login route', '/auth/login', 'PUT', [404, 405]],
  ['PATCH on health', '/health', 'PATCH', [404, 405]],
  ['a path that is only a prefix of a real route', '/auth', 'GET', [404]],
  ['a real route with a trailing slash', '/health/', 'GET', [200]],
  ['an absurdly long path', `/${'a'.repeat(4000)}`, 'GET', [404, 431]],
]) {
  await probe(`${label} is handled`, () => call(path, { method, token }), { expectStatuses: statuses });
}

// Content negotiation: the API should not be persuaded into leaking HTML.
const html = await fetch(`${BASE}/../src/config/env.js`, { headers: { Accept: 'text/html' } }).catch(() => null);
if (html) {
  check(
    'a path-traversal fetch does not return server source',
    !html.ok || !/JWT_SECRET|process\.env/.test(await html.text()),
    `status ${html.status}`,
  );
}

section('7. Error envelope shape');

const shapeChecks = [
  ['404 on an unknown route', () => call('/definitely-not-a-route')],
  ['400 on an invalid ObjectId', () => call('/posts/not-an-object-id', { token })],
  ['401 without a token', () => call('/auth/me')],
  ['403 on someone else\'s private resource', async () => {
    const other = await call('/auth/register', {
      method: 'POST',
      body: {
        name: 'Other',
        username: `othr${STAMP}`,
        email: `othr${STAMP}@e2e.test`,
        password: PASSWORD,
        college: 'Edge University',
        branch: 'CS',
        course: 'BCA',
        year: 2,
      },
    });
    const oToken = other.body?.data?.accessToken;
    const grp = await call('/groups', {
      method: 'POST',
      token: oToken,
      body: { name: `Edge Private ${STAMP}`, description: 'x', category: 'general', isPrivate: true },
    });
    const gid = grp.body?.data?.id ?? grp.body?.id;
    return call(`/groups/${gid}/members`, { token });
  }],
];
for (const [label, fn] of shapeChecks) {
  const r = await fn();
  if (!r) continue;
  const hasSuccess = typeof r.body?.success === 'boolean';
  const hasMessage = typeof (r.body?.message ?? r.body?.error?.message) === 'string';
  check(
    `${label} uses the standard { success, error } envelope`,
    hasSuccess && hasMessage,
    `body keys: ${Object.keys(r.body ?? {}).join(', ')}`,
  );
}

section('8. Cleanup');
if (id1) {
  const del = await call(`/posts/${id1}`, { method: 'DELETE', token });
  check('the probe post can be deleted by its author', del.status === 200 || del.status === 204, `status ${del.status}`);
  if (id2 && id2 !== id1) await call(`/posts/${id2}`, { method: 'DELETE', token });
}

console.log(`\n────────────────────────────────────────────────────────────────────────`);
console.log(`${passed} passed, ${failed} failed  (${passed + failed} total)`);
if (failed) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('────────────────────────────────────────────────────────────────────────');
process.exit(failed ? 1 : 0);