#!/usr/bin/env node

import { cleanupRun } from './cleanup.js';

// Target a server other than the local dev instance by passing a base URL,
// e.g. `node scripts/test-events.js http://localhost:5096/api`. Lets the suite runner
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
  console.log('Event API tests\n');
  
  const user1Data = { name: 'Alice', username: U('alice'), email: `${U('alice')}@test.com`, password: 'Password@123' };
  const user2Data = { name: 'Bob', username: U('bob'), email: `${U('bob')}@test.com`, password: 'Password@123' };

  const reg1 = await api('/auth/register', { method: 'POST', body: user1Data });
  const reg2 = await api('/auth/register', { method: 'POST', body: user2Data });
  
  const t1 = reg1.body.data.accessToken;
  const t2 = reg2.body.data.accessToken;
  
  section('1. Validation & Unauthenticated');
  
  const createUnauth = await api('/events', { method: 'POST', body: { title: 'No Auth', startsAt: new Date().toISOString() } });
  check('Unauthenticated creation rejected', createUnauth.status === 401, createUnauth.body);
  
  const createInvalidDates = await api('/events', { 
    method: 'POST', 
    token: t1,
    body: { title: 'Invalid Dates', startsAt: '2025-01-02T10:00:00.000Z', endsAt: '2025-01-01T10:00:00.000Z' } 
  });
  check('Invalid dates rejected', createInvalidDates.status === 400, createInvalidDates.body);
  
  const invalidId = await api('/events/invalid123', { token: t1 });
  check('Invalid event ID rejected', invalidId.status === 400 || invalidId.status === 404, invalidId.body);

  section('2. Creation & Listing');
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const event1Res = await api('/events', {
    method: 'POST',
    token: t1,
    body: { title: 'Alice Event', description: 'desc', startsAt: d.toISOString(), tags: ['fun'] }
  });
  
  check('Authenticated event creation', event1Res.status === 201, event1Res.body);
  const event1Id = event1Res.body?.data?.id;

  const listRes = await api('/events', { token: t2 });
  check('Event listing', listRes.status === 200 && listRes.body?.data?.some(e => e.id === event1Id), listRes.body);

  const detailRes = await api(`/events/${event1Id}`, { token: t2 });
  check('Event detail', detailRes.status === 200 && detailRes.body?.data?.id === event1Id, detailRes.body);

  section('3. Update & Delete');
  
  const updateUnauth = await api(`/events/${event1Id}`, {
    method: 'PUT',
    token: t2,
    body: { title: 'Hacked Title' }
  });
  check('Unauthorized update rejected', updateUnauth.status === 403, updateUnauth.body);

  const deleteUnauth = await api(`/events/${event1Id}`, {
    method: 'DELETE',
    token: t2
  });
  check('Unauthorized delete rejected', deleteUnauth.status === 403, deleteUnauth.body);

  const updateAuth = await api(`/events/${event1Id}`, {
    method: 'PUT',
    token: t1,
    body: { title: 'Alice Event Updated' }
  });
  check('Organizer update', updateAuth.status === 200 && updateAuth.body?.data?.title === 'Alice Event Updated', updateAuth.body);

  const deleteAuth = await api(`/events/${event1Id}`, {
    method: 'DELETE',
    token: t1
  });
  check('Organizer delete', deleteAuth.status === 204, deleteAuth.body);
  
  const getDeleted = await api(`/events/${event1Id}`, { token: t1 });
  check('Deleted event is gone', getDeleted.status === 404, getDeleted.body);

  section('4. Privacy & Groups');

  // Group names are stamped per run: group slugs are unique, so a fixed name
  // collides with any suite that creates a group with the same name
  // (test-events-rsvp.js does). A 409 here yields `undefined` ids, and the
  // privacy checks below then pass or fail for reasons that have nothing to do
  // with privacy.
  const pgRes = await api('/groups', {
    method: 'POST',
    token: t1,
    body: { name: `Pub Grp ${stamp}`, description: 'test', isPrivate: false, category: 'general' }
  });
  const pubGroupId = pgRes.body?.id;
  check('public group fixture created', pgRes.status === 201 && Boolean(pubGroupId), pgRes.body);

  // Create private group
  const privRes = await api('/groups', {
    method: 'POST',
    token: t1,
    body: { name: `Priv Grp ${stamp}`, description: 'test', isPrivate: true, category: 'general' }
  });
  const privGroupId = privRes.body?.id;
  check('private group fixture created', privRes.status === 201 && Boolean(privGroupId), privRes.body);

  const evPubRes = await api('/events', {
    method: 'POST',
    token: t1,
    body: { title: 'Pub Grp Event', startsAt: d.toISOString(), group: pubGroupId }
  });
  const evPubId = evPubRes.body?.data?.id;

  const evPrivRes = await api('/events', {
    method: 'POST',
    token: t1,
    body: { title: 'Priv Grp Event UniqueSearchStr', startsAt: d.toISOString(), group: privGroupId }
  });
  const evPrivId = evPrivRes.body?.data?.id;

  const listPub = await api('/events', { token: t2 });
  check('Public group event visibility', listPub.body?.data?.some(e => e.id === evPubId), listPub.body);
  check('Private group event excluded from global listing', !listPub.body?.data?.some(e => e.id === evPrivId), listPub.body);

  const searchPriv = await api('/events?search=UniqueSearchStr', { token: t2 });
  check('Private group event excluded from search', searchPriv.body?.data?.length === 0, searchPriv.body);

  const detailPrivT2 = await api(`/events/${evPrivId}`, { token: t2 });
  check('Private group non-member blocked', detailPrivT2.status === 403, detailPrivT2.body);

  const listPrivT1 = await api('/events', { token: t1 });
  check('Private group member visibility (listing)', listPrivT1.body?.data?.some(e => e.id === evPrivId), listPrivT1.body);
  
  const detailPrivT1 = await api(`/events/${evPrivId}`, { token: t1 });
  check('Private group member visibility (detail)', detailPrivT1.status === 200, detailPrivT1.body);

  console.log('\n---');
  console.log(`Passed: \x1b[32m${passed}\x1b[0m`);
  console.log(`Failed: \x1b[31m${failed}\x1b[0m`);
  
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`- ${f}`);
  }

  await cleanup();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  cleanup().then(() => process.exit(1));
});
