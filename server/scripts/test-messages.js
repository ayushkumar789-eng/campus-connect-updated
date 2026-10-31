#!/usr/bin/env node

import { cleanupRun } from './cleanup.js';

// Target a server other than the local dev instance by passing a base URL,
// e.g. `node scripts/test-messages.js http://localhost:5096/api`. Lets the suite runner
// point every suite at one isolated instance instead of the developer's.
const BASE = process.argv[2] ?? 'http://localhost:5050/api';
const stamp = Date.now();
const U = (n) => `${n}_${stamp.toString(36)}`;
const cleanup = () => cleanupRun(stamp);

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` → ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  }
}

function section(name) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

async function api(pathname, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const payload = body !== undefined ? JSON.stringify(body) : undefined;
  const res = await fetch(`${BASE}${pathname}`, { method, headers, body: payload });
  
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function run() {
  console.log('Message API tests\n');
  
  const charlie = { name: 'Charlie', username: U('charlie'), email: `${U('charlie')}@test.com`, password: 'Password@123' };
  const dave = { name: 'Dave', username: U('dave'), email: `${U('dave')}@test.com`, password: 'Password@123' };
  const eve = { name: 'Eve', username: U('eve'), email: `${U('eve')}@test.com`, password: 'Password@123' };

  const regC = await api('/auth/register', { method: 'POST', body: charlie });
  const regD = await api('/auth/register', { method: 'POST', body: dave });
  const regE = await api('/auth/register', { method: 'POST', body: eve });
  
  const tC = regC.body.data.accessToken;
  const tD = regD.body.data.accessToken;
  const tE = regE.body.data.accessToken;
  
  const charlieId = regC.body.data.user.id;
  const daveId = regD.body.data.user.id;
  
  let convId;

  section('Conversations');
  
  const c1 = await api('/conversations', { method: 'POST', body: { participantId: daveId }, token: tC });
  check('creates a direct conversation', c1.status === 201 && c1.body.data.kind === 'direct');
  convId = c1.body.data.id;
  
  const c2 = await api('/conversations', { method: 'POST', body: { participantId: charlieId }, token: tD });
  check('prevents duplicate direct conversations (returns existing)', c2.status === 201 && c2.body.data.id === convId);
  
  const c3 = await api('/conversations', { method: 'POST', body: { participantId: charlieId }, token: tC });
  check('prevents self-conversation', c3.status === 400);

  const get1 = await api(`/conversations/${convId}`, { token: tC });
  check('participant can fetch conversation', get1.status === 200 && get1.body.data.id === convId);

  const get2 = await api(`/conversations/${convId}`, { token: tE });
  check('non-participant blocked from fetching', get2.status === 403);

  section('Messages');
  
  const m1 = await api(`/conversations/${convId}/messages`, { method: 'POST', body: { content: 'Hello Dave' }, token: tC });
  check('sends a message', m1.status === 201 && m1.body.data.content === 'Hello Dave');
  
  const m2 = await api(`/conversations/${convId}/messages`, { method: 'POST', body: { content: 'Sneaky' }, token: tE });
  check('non-participant blocked from sending', m2.status === 403);

  const l1 = await api(`/conversations/${convId}/messages`, { token: tD });
  check('lists messages for participant', l1.status === 200 && l1.body.data.length === 1);
  check('pagination support present', l1.body.pagination !== undefined);
  
  const r1 = await api(`/conversations/${convId}/messages/read`, { method: 'POST', token: tD });
  check('marks messages as read', r1.status === 200);

  const l2 = await api(`/conversations/${convId}/messages`, { token: tD });
  check('readBy includes recipient', l2.body.data[0].readBy.includes(daveId));

  const cl = await api('/conversations', { token: tC });
  check('lists conversations for user', cl.status === 200 && cl.body.data.length === 1 && cl.body.data[0].id === convId);
  check('conversation has lastMessage', cl.body.data[0].lastMessage.content === 'Hello Dave');

  console.log(`\n────────────────────────────────────────────────────`);
  console.log(`  ${passed} passed   ${failed} failed   (${passed + failed} total)\n`);
  
  await cleanup();
  
  if (failed > 0) {
    console.log(`  Failed:\n${failures.map((f) => `   • ${f}`).join('\n')}\n`);
    process.exit(1);
  }
}

run();
