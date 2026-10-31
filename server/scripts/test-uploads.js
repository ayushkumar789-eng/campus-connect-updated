#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { cleanupRun } from './cleanup.js';

// Target a server other than the local dev instance by passing a base URL,
// e.g. `node scripts/test-uploads.js http://localhost:5096/api`. Lets the suite runner
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

async function api(pathname, { method = 'GET', body, token, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${pathname}`, { method, headers, body: payload });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function run() {
  console.log('Upload Regression tests\n');
  
  const user1Data = { name: 'Alice', username: U('alice'), email: `${U('alice')}@test.com`, password: 'Password@123' };
  const user2Data = { name: 'Bob', username: U('bob'), email: `${U('bob')}@test.com`, password: 'Password@123' };

  const reg1 = await api('/auth/register', { method: 'POST', body: user1Data });
  const reg2 = await api('/auth/register', { method: 'POST', body: user2Data });
  
  const t1 = reg1.body.data.accessToken;
  const t2 = reg2.body.data.accessToken;
  
  const tmpDir = process.env.TMPDIR ?? '/tmp';
  const imgFile = path.join(tmpDir, `cc-img-${stamp}.png`);
  const validPng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
  fs.writeFileSync(imgFile, validPng);

  const corruptImg = path.join(tmpDir, `cc-corrupt-${stamp}.png`);
  fs.writeFileSync(corruptImg, Buffer.from('this is not an image at all', 'utf8'));

  const emptyFile = path.join(tmpDir, `cc-empty-${stamp}.png`);
  fs.writeFileSync(emptyFile, Buffer.from(''));

  const svgFile = path.join(tmpDir, `cc-svg-${stamp}.svg`);
  fs.writeFileSync(svgFile, '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');

  const oversizeFile = path.join(tmpDir, `cc-big-${stamp}.png`);
  fs.writeFileSync(oversizeFile, Buffer.alloc(6 * 1024 * 1024, 'a'));

  section('1. Groups Uploads');

  const fd1 = new FormData();
  fd1.append('name', 'Upload Group');
  fd1.append('description', 'test');
  fd1.append('category', 'general');
  fd1.append('coverImage', new Blob([fs.readFileSync(imgFile)], { type: 'image/png' }), 'group.png');

  const groupRes = await api('/groups', { method: 'POST', token: t1, form: fd1 });
  check('Group creation with valid image', groupRes.status === 201 && groupRes.body?.coverImage?.url, groupRes.body);
  const groupId = groupRes.body?.id;

  const fd2 = new FormData();
  fd2.append('description', 'updated description');
  fd2.append('coverImage', new Blob([fs.readFileSync(imgFile)], { type: 'image/png' }), 'group2.png');
  const groupUpd = await api(`/groups/${groupId}`, { method: 'PUT', token: t1, form: fd2 });
  check('Group update with valid image', groupUpd.status === 200 && groupUpd.body?.coverImage?.url, groupUpd.body);

  section('2. Events Uploads');
  
  const fd3 = new FormData();
  const d = new Date();
  d.setDate(d.getDate() + 1);
  fd3.append('title', 'Upload Event');
  fd3.append('startsAt', d.toISOString());
  fd3.append('coverImage', new Blob([fs.readFileSync(imgFile)], { type: 'image/png' }), 'event.png');

  const eventRes = await api('/events', { method: 'POST', token: t1, form: fd3 });
  check('Event creation with valid image', eventRes.status === 201 && eventRes.body?.data?.coverImage?.url, eventRes.body);
  const eventId = eventRes.body?.data?.id;

  const fd4 = new FormData();
  fd4.append('title', 'Upload Event Upd');
  fd4.append('coverImage', new Blob([fs.readFileSync(imgFile)], { type: 'image/png' }), 'event2.png');
  const eventUpd = await api(`/events/${eventId}`, { method: 'PUT', token: t1, form: fd4 });
  check('Event update with valid image / replacing existing cover image', eventUpd.status === 200 && eventUpd.body?.data?.coverImage?.url, eventUpd.body);

  section('3. Edge Cases & Rejections');

  const fdMismatch = new FormData();
  fdMismatch.append('title', 'Mismatch Event');
  fdMismatch.append('startsAt', d.toISOString());
  fdMismatch.append('coverImage', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'fake.png');
  const mismatchRes = await api('/events', { method: 'POST', token: t1, form: fdMismatch });
  check('Invalid MIME/content mismatch (fake PNG)', mismatchRes.status === 400, mismatchRes.body);

  const fdEmpty = new FormData();
  fdEmpty.append('title', 'Empty Event');
  fdEmpty.append('startsAt', d.toISOString());
  fdEmpty.append('coverImage', new Blob([fs.readFileSync(emptyFile)], { type: 'image/png' }), 'empty.png');
  const emptyRes = await api('/events', { method: 'POST', token: t1, form: fdEmpty });
  check('Empty file upload rejection', emptyRes.status === 400, emptyRes.body);

  const fdSvg = new FormData();
  fdSvg.append('title', 'SVG Event');
  fdSvg.append('startsAt', d.toISOString());
  fdSvg.append('coverImage', new Blob([fs.readFileSync(svgFile)], { type: 'image/svg+xml' }), 'image.svg');
  const svgRes = await api('/events', { method: 'POST', token: t1, form: fdSvg });
  check('SVG upload rejection', svgRes.status === 400, svgRes.body);

  const fdBig = new FormData();
  fdBig.append('title', 'Big Event');
  fdBig.append('startsAt', d.toISOString());
  fdBig.append('coverImage', new Blob([fs.readFileSync(oversizeFile)], { type: 'image/png' }), 'big.png');
  const bigRes = await api('/events', { method: 'POST', token: t1, form: fdBig });
  check('Oversized file rejection', bigRes.status === 400 || bigRes.status === 413, bigRes.body);

  const fdCorrupt = new FormData();
  fdCorrupt.append('title', 'Corrupt Event');
  fdCorrupt.append('startsAt', d.toISOString());
  fdCorrupt.append('coverImage', new Blob([fs.readFileSync(corruptImg)], { type: 'image/png' }), 'corrupt.png');
  const corruptRes = await api('/events', { method: 'POST', token: t1, form: fdCorrupt });
  check('Corrupted image rejection', corruptRes.status === 400, corruptRes.body);

  const groupUnauth = await api(`/groups/${groupId}`, { method: 'PUT', token: t2, form: fd2 });
  check('Unauthorized update (different user)', groupUnauth.status === 403, groupUnauth.body);

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
