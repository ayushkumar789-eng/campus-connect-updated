#!/usr/bin/env node
/**
 * End-to-end API smoke test against a running server.
 * Exercises: register → login → me → profile → follow → post (text/poll/file)
 * → like → comment → reply → save → share → search → feed → pagination.
 *
 * Usage: node scripts/smoke.js [baseUrl]
 */
import fs from 'node:fs';
import path from 'node:path';
import { cleanupRun } from './cleanup.js';

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

/** Minimal cookie jar so the refresh cookie is exercised like a browser. */
const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
}

async function api(pathname, { method = 'GET', body, token, raw = false, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const cookies = cookieHeader();
  if (cookies) headers.Cookie = cookies;

  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${pathname}`, { method, headers, body: payload });
  storeCookies(res);

  if (raw) return res;

  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

const alice = {
  name: 'Rahul Sharma',
  username: U('rahul'),
  email: `${U('rahul')}@campus.test`,
  password: 'Student@2026',
  college: 'Invertis University',
  course: 'MCA',
  branch: 'Computer Science',
  year: 2,
};
const priya = {
  name: 'Priya Verma',
  username: U('priya'),
  email: `${U('priya')}@campus.test`,
  password: 'Student@2026',
  college: 'Invertis University',
  course: 'MCA',
  branch: 'Computer Science',
  year: 2,
};

/**
 * The database constraints the application *relies on* rather than merely
 * prefers.
 *
 * These are not optimisations. Application code checks uniqueness before
 * writing, but that is a race: two concurrent requests both see "free" and both
 * insert. Only the index makes a duplicate impossible. The follow-idempotency
 * assertion below is meaningless without the `follows` index — with it missing,
 * a repeated follow silently created a second edge, inflated the follower
 * counter, and sent the target a duplicate notification, and every test below
 * still passed on a database that happened to have the index.
 *
 * So this is asserted directly, against the live database, before anything
 * else runs. A failure here means the server is running without its
 * constraints and every uniqueness result in this file is not to be trusted.
 */
async function checkSchemaGuarantees() {
  section('Schema guarantees');
  const mongoose = (await import('mongoose')).default;
  const uri = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/campusconnect';
  let conn;
  try {
    conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  } catch (err) {
    check('database is reachable for the schema check', false, err.message);
    return;
  }

  try {
    const db = conn.db;
    const required = [
      ['users', 'username_1', true, 'two accounts could share a username'],
      ['users', 'email_1', true, 'two accounts could share an email'],
      ['follows', 'follower_1_following_1', true, 'a repeat follow would duplicate the edge and double-notify'],
      // Deliberately not unique. Single use is enforced by an atomic claim —
      // `findOneAndUpdate({ _id, consumedAt: null })`, which exactly one of two
      // concurrent requests can match. That is the stronger guarantee; a unique
      // index on the hash would only stop duplicate *rows*, not two requests
      // racing to consume one row. The concurrency check further down is what
      // proves it.
      ['verificationtokens', 'tokenHash_1_purpose_1_consumedAt_1', false, ''],
    ];

    for (const [collection, indexName, unique, why] of required) {
      let indexes = [];
      try {
        indexes = await db.collection(collection).indexes();
      } catch {
        indexes = [];
      }
      const found = indexes.find((i) => i.name === indexName);
      check(`${collection}.${indexName} exists`, !!found, `not found in ${indexes.map((i) => i.name).join(', ') || 'no indexes'}`);
      if (found && unique) {
        check(`${collection}.${indexName} is unique`, found.unique === true, `unique=${found.unique} — ${why}`);
      }
    }

    // A duplicate that already exists would make the index unbuildable, which
    // is how the problem announces itself on a restored database.
    const dupFollows = await db
      .collection('follows')
      .aggregate([
        { $group: { _id: { f: '$follower', t: '$following' }, n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
      ])
      .toArray();
    check('no duplicate follow edges are stored', dupFollows.length === 0, `${dupFollows.length} duplicate(s)`);

    const dupNotifs = await db
      .collection('notifications')
      .aggregate([
        { $group: { _id: { r: '$recipient', a: '$actor', t: '$type', e: '$entity.type' }, n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
      ])
      .toArray();
    check('no duplicate notifications are stored', dupNotifs.length === 0, `${dupNotifs.length} duplicate(s)`);
  } finally {
    await conn.close();
  }
}

const run = async () => {
  console.log(`\x1b[1mCampusConnect API smoke test\x1b[0m → ${BASE}\n`);

  // ── Health ──────────────────────────────────────────────────────────────
  section('Health');
  const health = await api('/health');
  check('GET /health returns ok', health.body?.data?.status === 'ok', health.body);

  await checkSchemaGuarantees();

  // ── Validation ──────────────────────────────────────────────────────────
  section('Validation');
  const weak = await api('/auth/register', {
    method: 'POST',
    body: { name: 'A', username: 'x', email: 'bad', password: '123' },
  });
  check('rejects malformed registration', weak.status === 400, weak.body);
  check(
    'returns per-field errors',
    Array.isArray(weak.body?.errors) && weak.body.errors.length >= 3,
    weak.body?.errors,
  );

  const badPw = await api('/auth/register', {
    method: 'POST',
    body: { ...alice, password: 'short' },
  });
  check('rejects weak password', badPw.status === 400, badPw.body);

  // ── Registration ────────────────────────────────────────────────────────
  section('Authentication');
  const regA = await api('/auth/register', { method: 'POST', body: alice });
  check('registers first student', regA.status === 201, regA.body);
  check('returns access token', typeof regA.body?.data?.accessToken === 'string', regA.body);
  check('sets httpOnly refresh cookie', jar.has('cc_refresh'), [...jar.keys()]);
  check('never returns password hash', !JSON.stringify(regA.body).includes('$2'), regA.body);

  const regB = await api('/auth/register', { method: 'POST', body: priya });
  check('registers second student', regB.status === 201, regB.body);

  const tokenA = regA.body?.data?.accessToken;
  const tokenB = regB.body?.data?.accessToken;
  const idA = regA.body?.data?.user?.id;
  const idB = regB.body?.data?.user?.id;
  check('assigns distinct ids', idA && idB && idA !== idB, { idA, idB });

  const dupe = await api('/auth/register', { method: 'POST', body: alice });
  check('rejects duplicate email', dupe.status === 409, dupe.body);

  const login = await api('/auth/login', {
    method: 'POST',
    body: { identifier: alice.email, password: alice.password },
  });
  check('logs in with email', login.status === 200, login.body);

  const loginUser = await api('/auth/login', {
    method: 'POST',
    body: { identifier: alice.username, password: alice.password },
  });
  check('logs in with username', loginUser.status === 200, loginUser.body);

  const wrongPw = await api('/auth/login', {
    method: 'POST',
    body: { identifier: alice.email, password: 'WrongPass123' },
  });
  check('rejects wrong password', wrongPw.status === 401, wrongPw.body);

  const noUser = await api('/auth/login', {
    method: 'POST',
    body: { identifier: `${U('ghost')}@campus.test`, password: 'Student@2026' },
  });
  check(
    'unknown account gives same generic message (no enumeration)',
    wrongPw.body?.message === noUser.body?.message,
    { wrongPw: wrongPw.body?.message, noUser: noUser.body?.message },
  );

  // ── Session ─────────────────────────────────────────────────────────────
  section('Session');
  const me = await api('/auth/me', { token: tokenA });
  check('GET /auth/me works', me.status === 200 && me.body?.data?.user?.username === alice.username, me.body);
  check('own profile exposes email', typeof me.body?.data?.user?.email === 'string', me.body?.data?.user);

  const meAnon = await api('/auth/me');
  check('rejects unauthenticated /me', meAnon.status === 401, meAnon.body);

  const meBad = await api('/auth/me', { token: 'not-a-real-token' });
  check('rejects invalid token', meBad.status === 401, meBad.body);

  // Refresh rotation (uses the cookie jar)
  jar.clear();
  const regC = await api('/auth/register', { method: 'POST', body: { ...alice, email: `${U('tmp')}@campus.test`, username: U('tmp') } });
  check('captured refresh cookie for rotation test', jar.has('cc_refresh'), [...jar.keys()]);
  const refreshed = await api('/auth/refresh', { method: 'POST' });
  check('rotates session via refresh cookie', refreshed.status === 200 && Boolean(refreshed.body?.data?.accessToken), refreshed.body);
  void regC;

  // ── Profile ─────────────────────────────────────────────────────────────
  section('Profile');
  const setup = await api('/auth/profile', {
    method: 'PUT',
    token: tokenA,
    body: { bio: 'Building things with React and Node.', skills: ['React', 'Node'], interests: ['DSA', 'Open Source'] },
  });
  check('saves profile setup', setup.status === 200, setup.body);
  check('stores skills', setup.body?.data?.user?.skills?.length === 2, setup.body?.data?.user?.skills);
  check('marks profile complete', setup.body?.data?.user?.profileCompleted === true, setup.body?.data?.user);

  // Partial saves. These matter more than they look: the profile form always
  // submits every field, so the omissions and empty lists below are what an
  // "I only changed my bio" edit reduces to on the wire. When the schema gave
  // these fields a `.min(1)`, every save carrying an empty list was rejected
  // and the screen failed silently — so each case is asserted explicitly.
  const bioOnly = await api('/auth/profile', { method: 'PUT', token: tokenA, body: { bio: 'Just the bio.' } });
  check('saves a bio-only update', bioOnly.status === 200, bioOnly.body);
  check(
    'a bio-only update leaves skills alone',
    bioOnly.body?.data?.user?.skills?.length === 2,
    bioOnly.body?.data?.user?.skills,
  );
  check(
    'a bio-only update leaves interests alone',
    bioOnly.body?.data?.user?.interests?.length === 2,
    bioOnly.body?.data?.user?.interests,
  );

  const emptyLists = await api('/auth/profile', {
    method: 'PUT',
    token: tokenA,
    body: { skills: [], interests: [] },
  });
  check('accepts explicitly empty skill lists', emptyLists.status === 200, emptyLists.body);
  check('an empty list actually clears it', emptyLists.body?.data?.user?.skills?.length === 0, emptyLists.body);

  const noLists = await api('/auth/profile', { method: 'PUT', token: tokenA, body: { branch: 'Computer Science' } });
  check('accepts an update with no list fields at all', noLists.status === 200, noLists.body);
  check('stores the branch', noLists.body?.data?.user?.branch === 'Computer Science', noLists.body?.data?.user);

  // The rules that were supposed to exist: a blank entry is a typo, not a tag.
  const blankEntry = await api('/auth/profile', {
    method: 'PUT',
    token: tokenA,
    body: { skills: ['React', '  '] },
  });
  check('rejects a blank entry inside a list', blankEntry.status === 400, blankEntry.body);

  const overCap = await api('/auth/profile', {
    method: 'PUT',
    token: tokenA,
    body: { skills: Array.from({ length: 16 }, (_, i) => `s${i}`) },
  });
  check('rejects a list over the cap', overCap.status === 400, overCap.body);

  // Clearing a field, which is the mirror of the partial-save rules above.
  //
  // "Absent" and "present but empty" arrive on the wire looking the same and
  // mean opposite things, so one of them has to lose. It was the empty string:
  // the Settings form could blank the college box, the client dropped the empty
  // field, and the save reported "Profile updated" having changed nothing. A
  // student who typed the wrong college had no way to correct it, and no way to
  // tell that it hadn't been corrected. A silent no-op behind a success toast is
  // worse than a disabled input, because it actively misleads.
  // Deliberately through `PUT /users/:id`, because that is the route the
  // Settings form posts to (`authApi.updateProfile` → `PUT /auth/profile`).
  const seeded = await api(`/users/${alice.username}`, {
    method: 'PUT',
    token: tokenA,
    body: { college: 'Wrong University', branch: 'Typo Branch' },
  });
  check('stores a college to clear later', seeded.body?.data?.user?.college === 'Wrong University', seeded.body?.data?.user);

  const clearedCollege = await api(`/users/${alice.username}`, { method: 'PUT', token: tokenA, body: { college: '' } });
  check('an empty string clears the college', clearedCollege.body?.data?.user?.college === '', clearedCollege.body?.data?.user);
  check(
    'clearing the college leaves the branch alone',
    clearedCollege.body?.data?.user?.branch === 'Typo Branch',
    clearedCollege.body?.data?.user,
  );

  const clearedBranch = await api(`/users/${alice.username}`, { method: 'PUT', token: tokenA, body: { branch: '' } });
  check('an empty string clears the branch', clearedBranch.body?.data?.user?.branch === '', clearedBranch.body?.data?.user);

  // The typo guard has to survive the new tolerance for blanks, or "accept
  // empty" would just have become "accept anything".
  const typoCollege = await api(`/users/${alice.username}`, { method: 'PUT', token: tokenA, body: { college: 'X' } });
  check('a one-character college is still a typo', typoCollege.status === 400, typoCollege.body?.errors);
  const typoBranch = await api(`/users/${alice.username}`, { method: 'PUT', token: tokenA, body: { branch: 'C' } });
  check('a one-character branch is still a typo', typoBranch.status === 400, typoBranch.body?.errors);

  // `profileCompleted` is a one-way latch, not a derived value.
  //
  // It records that this student has been through onboarding. It used to be
  // recomputed from bio/college/course on every single save, so a student who
  // later cleared their bio or college — an ordinary edit the form invites, and
  // which the schema now permits on purpose — was bounced straight back into the
  // eight-step wizard by the route guard. They had finished it, and an edit
  // undid it.
  const reOnboard = await api('/auth/profile', {
    method: 'PUT',
    token: tokenA,
    body: { college: 'Invertis University', bio: 'Back again.', branch: 'Computer Science' },
  });
  check(
    'onboarding can still close the latch',
    reOnboard.body?.data?.user?.profileCompleted === true,
    reOnboard.body?.data?.user,
  );

  const clearedAfterOnboarding = await api(`/users/${alice.username}`, {
    method: 'PUT',
    token: tokenA,
    body: { college: '', branch: '', bio: '' },
  });
  check('a settings save still succeeds after clearing', clearedAfterOnboarding.status === 200, clearedAfterOnboarding.body);
  check(
    'clearing every field does not reopen onboarding',
    clearedAfterOnboarding.body?.data?.user?.profileCompleted === true,
    clearedAfterOnboarding.body?.data?.user,
  );
  check(
    'and the cleared values really did persist',
    clearedAfterOnboarding.body?.data?.user?.college === ''
      && clearedAfterOnboarding.body?.data?.user?.branch === ''
      && clearedAfterOnboarding.body?.data?.user?.bio === '',
    clearedAfterOnboarding.body?.data?.user,
  );

  const publicA = await api(`/users/${alice.username}`, { token: tokenB });
  check('resolves profile by username', publicA.status === 200, publicA.body);
  check('hides email from others', publicA.body?.data?.email === undefined, publicA.body?.data);
  check('reports isFollowing=false', publicA.body?.data?.isFollowing === false, publicA.body?.data);

  const missing = await api(`/users/${U('nobody')}`);
  check('404s an unknown profile', missing.status === 404, missing.body);

  // ── Verification token, under a genuine race ────────────────────────────
  section('Verification tokens');
  // Single use is not enforced by a unique index but by an atomic claim on
  // `consumedAt`. Sequential replay tests cannot tell an atomic claim apart from
  // a naive read-then-write, which would let a replayed link win under
  // concurrency — so two requests are fired at the same token simultaneously
  // and exactly one must be accepted.
  const race = await api('/auth/register', {
    method: 'POST',
    body: {
      name: 'Race Tester',
      username: U('race'),
      email: `${U('race')}@smoke.test`,
      password: 'SmokeTest@1',
    },
  });
  const raceToken = race.body?.data?.devVerificationToken;
  check('issued a token to race for', !!raceToken, race.body);

  if (raceToken) {
    const [a, b] = await Promise.all([
      api('/auth/verify-email', { method: 'POST', body: { token: raceToken } }),
      api('/auth/verify-email', { method: 'POST', body: { token: raceToken } }),
    ]);
    const winners = [a, b].filter((r) => r.status === 200).length;
    const losers = [a, b].filter((r) => r.status === 400).length;
    check('exactly one of two concurrent verifications succeeds', winners === 1, `statuses ${a.status}/${b.status}`);
    check('the other is rejected as already used', losers === 1, `statuses ${a.status}/${b.status}`);
  }

  // ── Follow ──────────────────────────────────────────────────────────────
  section('Follow graph');
  const follow = await api(`/users/${idA}/follow`, { method: 'POST', token: tokenB });
  check('follows a student', follow.status === 200 && follow.body?.data?.following === true, follow.body);
  check('increments follower count', follow.body?.data?.followersCount === 1, follow.body?.data);

  const followAgain = await api(`/users/${idA}/follow`, { method: 'POST', token: tokenB });
  check('follow is idempotent', followAgain.status === 200 && followAgain.body?.data?.followersCount === 1, followAgain.body?.data);

  const selfFollow = await api(`/users/${idA}/follow`, { method: 'POST', token: tokenA });
  check('blocks self-follow', selfFollow.status === 400, selfFollow.body);

  const afterFollow = await api(`/users/${alice.username}`, { token: tokenB });
  check('profile reflects isFollowing=true', afterFollow.body?.data?.isFollowing === true, afterFollow.body?.data);

  const followers = await api(`/users/${idA}/followers`, { token: tokenA });
  check('lists followers', followers.body?.data?.length === 1 && followers.body.data[0].username === priya.username, followers.body?.data);

  const following = await api(`/users/${idB}/following`, { token: tokenB });
  check('lists following', following.body?.data?.length === 1, following.body?.data);

  // User rows in lists are serialised with `id`, not raw `_id`. The client
  // keys these lists and calls follow/unfollow by `id`, so a raw lean() doc
  // silently breaks both.
  const listRowShape = (rows) =>
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.every((u) => typeof u.id === 'string' && u._id === undefined);

  check('follower rows expose id, not _id', listRowShape(followers.body?.data), followers.body?.data?.[0]);
  check('following rows expose id, not _id', listRowShape(following.body?.data), following.body?.data?.[0]);

  // `/:id/posts` must be registered ahead of `/:id/:direction`, or Express
  // routes "posts" into the direction enum and the profile page 400s.
  const userPosts = await api(`/users/${alice.username}/posts?limit=5`, { token: tokenA });
  check("author's posts resolve by username", userPosts.status === 200, userPosts.body);
  check('author posts are an array', Array.isArray(userPosts.body?.data), userPosts.body);

  const userPostsById = await api(`/users/${idA}/posts?limit=5`, { token: tokenA });
  check("author's posts resolve by id", userPostsById.status === 200, userPostsById.body);

  // Alice has to actually follow someone for "suggestions exclude … existing
  // follows" to mean anything. Until now she followed nobody — `priya` follows
  // *her*, which is the opposite edge — so the assertion was checking a
  // suggestion the endpoint is explicitly meant to return
  // (`people to follow (not already followed)`). It only ever passed because on
  // a populated database priya was pushed out of the top 5 by `followersCount`
  // ranking; against a fresh database she was in the list and the check failed.
  const aliceFollows = await api(`/users/${idB}/follow`, { method: 'POST', token: tokenA });
  check('alice follows a student', aliceFollows.status === 200, aliceFollows.body);

  const suggested = await api('/users/suggested', { token: tokenA });
  check('suggestions are a list', Array.isArray(suggested.body?.data), suggested.body);
  check('suggestion rows expose id, not _id', listRowShape(suggested.body?.data), suggested.body?.data?.[0]);
  check(
    'suggestions exclude self and existing follows',
    suggested.body?.data?.every((u) => u.id !== idA && u.username !== priya.username),
    suggested.body?.data?.map((u) => u.username),
  );

  const directory = await api('/users?limit=5', { token: tokenA });
  check('directory rows expose id, not _id', listRowShape(directory.body?.data), directory.body?.data?.[0]);
  check(
    'directory hides email',
    directory.body?.data?.every((u) => u.email === undefined),
    directory.body?.data?.[0],
  );

  // ── Posts ───────────────────────────────────────────────────────────────
  section('Posts');
  const empty = await api('/posts', { method: 'POST', token: tokenA, body: { content: '' } });
  check('rejects an empty post', empty.status === 400, empty.body);

  const textPost = await api('/posts', {
    method: 'POST',
    token: tokenA,
    body: { content: 'Just completed my React project 🚀' },
  });
  check('creates a text post', textPost.status === 201, textPost.body);
  check('infers type=text', textPost.body?.data?.type === 'text', textPost.body?.data);
  check('embeds author', textPost.body?.data?.author?.username === alice.username, textPost.body?.data?.author);
  check('initial likeCount=0', textPost.body?.data?.likeCount === 0, textPost.body?.data);
  const postId = textPost.body?.data?.id;

  const pollPost = await api('/posts', {
    method: 'POST',
    token: tokenA,
    body: {
      type: 'poll',
      content: 'Which language are you learning?',
      poll: { question: 'Which language are you learning?', options: ['Java', 'Python', 'JavaScript'] },
    },
  });
  check('creates a poll post', pollPost.status === 201 && pollPost.body?.data?.type === 'poll', pollPost.body);
  const pollId = pollPost.body?.data?.id;
  const optJava = pollPost.body?.data?.poll?.options?.[0]?.id;
  check('poll exposes options', pollPost.body?.data?.poll?.options?.length === 3, pollPost.body?.data?.poll);

  const badPoll = await api('/posts', {
    method: 'POST',
    token: tokenA,
    body: { poll: { question: 'Bad?', options: ['only one'] } },
  });
  check('rejects poll with <2 options', badPoll.status === 400, badPoll.body);

  // File upload (local storage fallback)
  const tmpFile = path.join(process.env.TMPDIR ?? '/tmp', `cc-test-${stamp}.pdf`);
  fs.writeFileSync(tmpFile, '%PDF-1.4\n% CampusConnect smoke test document\n');
  const fd = new FormData();
  fd.append('content', 'Uploaded DBMS notes 📚');
  fd.append('type', 'resource');
  fd.append('resourceTitle', 'DBMS Unit 3');
  fd.append('files', new Blob([fs.readFileSync(tmpFile)], { type: 'application/pdf' }), 'DBMS_Unit_3.pdf');

  const filePost = await api('/posts', { method: 'POST', token: tokenA, form: fd });
  check('uploads a file post', filePost.status === 201, filePost.body);
  check('classifies as resource', filePost.body?.data?.type === 'resource', filePost.body?.data);
  check('stores the file url', typeof filePost.body?.data?.resource?.fileUrl === 'string', filePost.body?.data?.resource);

  if (filePost.body?.data?.resource?.fileUrl) {
    const fileRes = await fetch(filePost.body.data.resource.fileUrl);
    check('uploaded file is retrievable', fileRes.ok, { status: fileRes.status });
  }

  // ── Likes ───────────────────────────────────────────────────────────────
  section('Engagement');
  const like = await api(`/posts/${postId}/like`, { method: 'POST', token: tokenB });
  check('likes a post', like.status === 200 && like.body?.data?.liked === true, like.body);
  check('increments likeCount', like.body?.data?.likeCount === 1, like.body?.data);

  const unlike = await api(`/posts/${postId}/like`, { method: 'POST', token: tokenB });
  check('unlikes on second tap', unlike.body?.data?.liked === false && unlike.body?.data?.likeCount === 0, unlike.body?.data);

  const relike = await api(`/posts/${postId}/like`, { method: 'POST', token: tokenB });
  check('re-like returns to 1', relike.body?.data?.likeCount === 1, relike.body?.data);

  const save = await api(`/posts/${postId}/save`, { method: 'POST', token: tokenB });
  check('saves a post', save.body?.data?.saved === true, save.body);
  const unsave = await api(`/posts/${postId}/save`, { method: 'POST', token: tokenB });
  check('unsaves on second tap', unsave.body?.data?.saved === false, unsave.body);

  await api(`/posts/${postId}/save`, { method: 'POST', token: tokenB });

  // Bookmark state has to survive a reload, which means every endpoint that
  // renders a card has to say whether the viewer saved it. `serialisePost`
  // derives `isLiked` from the Post document, but a bookmark lives in its own
  // collection and used to be omitted from list payloads entirely — so the
  // feed reported nothing and a refresh rendered "Save post" over a post that
  // was already bookmarked.
  const feedAfterSave = await api('/posts/feed?scope=all&limit=20', { token: tokenB });
  const inFeed = feedAfterSave.body?.data?.find((p) => p.id === postId);
  check('a bookmarked post reports itself as saved in the feed', inFeed?.isSaved === true, inFeed);
  check(
    'unsaved posts in the feed report isSaved=false, not undefined',
    feedAfterSave.body?.data?.filter((p) => p.id !== postId).every((p) => p.isSaved === false),
    feedAfterSave.body?.data?.find((p) => p.id !== postId),
  );
  const sameFeedForA = await api('/posts/feed?scope=all&limit=20', { token: tokenA });
  const inFeedForA = sameFeedForA.body?.data?.find((p) => p.id === postId);
  check("another user's feed does not inherit the bookmark", inFeedForA?.isSaved === false, inFeedForA);
  const detailAfterSave = await api(`/posts/${postId}`, { token: tokenB });
  check('post detail agrees the post is saved', detailAfterSave.body?.data?.isSaved === true, detailAfterSave.body?.data);

  // A signed-out viewer has no bookmarks, so the flag must still be a real
  // boolean rather than absent — the card reads it straight onto aria-pressed.
  const feedAnon = await api('/posts/feed?scope=all&limit=5');
  check('a signed-out feed still carries a boolean isSaved', feedAnon.body?.data?.every((p) => typeof p.isSaved === 'boolean'), feedAnon.body?.data?.[0]);

  const share = await api(`/posts/${postId}/share`, { method: 'POST', token: tokenB });
  check('shares a post', share.body?.data?.shareCount === 1, share.body?.data);

  const likeReq = await api(`/posts/${postId}/like`, { method: 'POST' });
  check('likes require auth', likeReq.status === 401, likeReq.body);

  // ── Poll voting ─────────────────────────────────────────────────────────
  section('Polls');
  const vote = await api(`/posts/${pollId}/vote`, { method: 'POST', token: tokenB, body: { optionId: optJava } });
  check('records a vote', vote.status === 200, vote.body);
  const javaOpt = vote.body?.data?.poll?.options?.find((o) => o.id === optJava);
  check('vote tallies to 100%', javaOpt?.votes === 1 && javaOpt?.percentage === 100, javaOpt);
  check('marks hasVoted for the voter', javaOpt?.hasVoted === true, javaOpt);

  const revote = await api(`/posts/${pollId}/vote`, {
    method: 'POST',
    token: tokenB,
    body: { optionId: pollPost.body?.data?.poll?.options?.[1]?.id },
  });
  const javaAfter = revote.body?.data?.poll?.options?.find((o) => o.id === optJava);
  const pyAfter = revote.body?.data?.poll?.options?.find((o) => o.id === pollPost.body?.data?.poll?.options?.[1]?.id);
  check('changing a vote moves it (no double count)', javaAfter?.votes === 0 && pyAfter?.votes === 1, { javaAfter, pyAfter });
  check('totalVotes stays exact', revote.body?.data?.poll?.totalVotes === 1, revote.body?.data?.poll?.totalVotes);

  const badOption = await api(`/posts/${pollId}/vote`, { method: 'POST', token: tokenB, body: { optionId: 'aaaaaaaaaaaaaaaaaaaaaaaa' } });
  check('rejects a nonexistent option', badOption.status === 400, badOption.body);

  const voteTextPost = await api(`/posts/${postId}/vote`, { method: 'POST', token: tokenB, body: { optionId: optJava } });
  check('rejects voting on a non-poll', voteTextPost.status === 400, voteTextPost.body);

  // ── Comments ────────────────────────────────────────────────────────────
  section('Comments');
  const comment = await api(`/posts/${postId}/comments`, {
    method: 'POST',
    token: tokenB,
    body: { content: 'Congrats on the launch!' },
  });
  check('adds a comment', comment.status === 201, comment.body);
  const commentId = comment.body?.data?.id;

  const reply = await api(`/posts/${postId}/comments`, {
    method: 'POST',
    token: tokenA,
    body: { content: 'Thanks! Built it with Vite.', parent: commentId },
  });
  check('adds a reply', reply.status === 201, reply.body);

  const orphanReply = await api(`/posts/${postId}/comments`, {
    method: 'POST',
    token: tokenA,
    body: { content: 'Ghost reply', parent: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
  });
  check('rejects a reply to a missing parent', orphanReply.status === 400, orphanReply.body);

  // A reply to a reply is the one shape `getComments` cannot read back: it
  // returns the top level plus the replies hanging directly off it, and nothing
  // deeper. Accepting one produced a comment that counted toward the post and
  // was then invisible in the UI forever, and left `deleteComment`'s one-level
  // cascade under-counting. The invariant belongs on the write path.
  const nested = await api(`/posts/${postId}/comments`, {
    method: 'POST',
    token: tokenA,
    body: { content: 'Reply to a reply', parent: reply.body?.data?.id },
  });
  check('rejects a reply to a reply', nested.status === 400, nested.body);

  const afterNested = await api(`/posts/${postId}/comments`, { token: tokenA });
  check(
    'the refused nested reply is not written',
    !JSON.stringify(afterNested.body?.data ?? []).includes('Reply to a reply'),
    afterNested.body?.data,
  );
  check(
    'the refused nested reply does not move the count',
    (await api(`/posts/${postId}`, { token: tokenA })).body?.data?.commentCount === afterNested.body?.data?.length
      + (afterNested.body?.data ?? []).reduce((n, c) => n + (c.replies?.length ?? 0), 0),
    'post.commentCount vs actual rows',
  );
  check(
    'no reply carries its own nested replies',
    (afterNested.body?.data ?? []).every((c) => (c.replies ?? []).every((r) => !r.replies?.length)),
    afterNested.body?.data,
  );

  const emptyComment = await api(`/posts/${postId}/comments`, { method: 'POST', token: tokenB, body: { content: '   ' } });
  check('rejects an empty comment', emptyComment.status === 400, emptyComment.body);

  const comments = await api(`/posts/${postId}/comments`, { token: tokenA });
  check('lists comments', comments.body?.data?.length === 1, comments.body?.data);
  check('threads the reply under its parent', comments.body?.data?.[0]?.replies?.length === 1, comments.body?.data?.[0]);
  check('replyCount is 1', comments.body?.data?.[0]?.replyCount === 1, comments.body?.data?.[0]);

  const wrongUserDelete = await api(`/comments/${commentId}`, { method: 'DELETE', token: tokenA });
  check("blocks deleting another user's comment", wrongUserDelete.status === 403, wrongUserDelete.body);

  // ── Feed & pagination ───────────────────────────────────────────────────
  section('Feed');
  const ownFeed = await api('/posts/feed?scope=following', { token: tokenA });
  check('own posts appear in own feed', ownFeed.body?.data?.length >= 3, ownFeed.body?.data?.length);
  check('feed returns a cursor', typeof ownFeed.body?.pagination?.nextCursor !== 'undefined', ownFeed.body?.pagination);
  check('newest first', ownFeed.body?.data?.[0]?.createdAt >= ownFeed.body?.data?.[1]?.createdAt, 'ordering');

  const followedFeed = await api('/posts/feed?scope=following', { token: tokenB });
  check("following feed includes followed author's posts", followedFeed.body?.data?.length >= 3, followedFeed.body?.data?.length);

  const allFeed = await api('/posts/feed?scope=all&limit=2', { token: tokenA });
  check('respects the limit', allFeed.body?.data?.length === 2, allFeed.body?.data?.length);
  check('signals more pages', allFeed.body?.pagination?.hasMore === true, allFeed.body?.pagination);
  const cursor = allFeed.body?.pagination?.nextCursor;

  const page2 = await api(`/posts/feed?scope=all&limit=2&cursor=${cursor}`, { token: tokenA });
  check('returns a second page', page2.body?.data?.length >= 1, page2.body?.data?.length);
  const p1ids = allFeed.body.data.map((p) => p.id);
  const p2ids = page2.body.data.map((p) => p.id);
  check('pages do not overlap', !p1ids.some((id) => p2ids.includes(id)), { p1ids, p2ids });

  // A malformed cursor is now rejected rather than silently treated as "first
  // page". Returning page 1 for a bad cursor looks like a working request to the
  // client, and an infinite-scroll list that asked for a page it never receives
  // loops on the same rows forever. Saying the cursor was wrong is both truer
  // and what stops that. `getPagination` still defaults an absent cursor, which
  // is the case this must not break.
  const badCursor = await api('/posts/feed?cursor=not-an-id', { token: tokenA });
  check('rejects a malformed cursor', badCursor.status === 400, badCursor.status);

  const noCursor = await api('/posts/feed', { token: tokenA });
  check('an absent cursor still means the first page', noCursor.status === 200, noCursor.status);

  const anonFeed = await api('/posts/feed?scope=all');
  check('anonymous feed works', anonFeed.status === 200, anonFeed.status);

  const saved = await api('/posts/saved', { token: tokenB });
  check('saved tab lists bookmarks', saved.body?.data?.length === 1 && saved.body.data[0].id === postId, saved.body?.data?.length);
  // The card on this page has to know it is saved. Without the flag it rendered
  // a button labelled "Save post" over an endpoint that *toggles*, so the
  // control claimed to add something it was about to remove.
  check(
    'a saved post reports itself as saved',
    saved.body?.data?.[0]?.isSaved === true,
    saved.body?.data?.[0],
  );

  // And the same post must not claim to be saved on someone else's list.
  const savedForA = await api('/posts/saved', { token: tokenA });
  check(
    'the saved list is per-user',
    !savedForA.body?.data?.some((p) => p.id === postId && p.isSaved === true),
    savedForA.body?.data,
  );

  // ── Authorisation ───────────────────────────────────────────────────────
  section('Authorisation');
  const editOther = await api(`/posts/${postId}`, { method: 'PUT', token: tokenB, body: { content: 'Hijacked' } });
  check("blocks editing another user's post", editOther.status === 403, editOther.body);

  const editOwn = await api(`/posts/${postId}`, { method: 'PUT', token: tokenA, body: { content: 'Just completed my React project 🚀 (v2)' } });
  check('allows editing own post', editOwn.status === 200, editOwn.body);
  check('marks the post edited', Boolean(editOwn.body?.data?.editedAt), editOwn.body?.data?.editedAt);

  const emptyEdit = await api(`/posts/${postId}`, { method: 'PUT', token: tokenA, body: { content: '  ' } });
  check('rejects clearing post content', emptyEdit.status === 400, emptyEdit.body);

  // The client hides "Edit post" on polls; this proves the server agrees, so the
  // menu item is a genuine capability check and not just a UI guess.
  const pollEdit = await api(`/posts/${pollId}`, { method: 'PUT', token: tokenA, body: { content: 'Changed the question' } });
  check('refuses to edit a poll after creation', pollEdit.status === 400, pollEdit.body);

  const strayField = await api(`/posts/${postId}`, { method: 'PUT', token: tokenA, body: { content: 'ok', type: 'video' } });
  check('rejects fields outside the edit schema', strayField.status === 400, strayField.body);

  const editAnonymous = await api(`/posts/${postId}`, { method: 'PUT', body: { content: 'anonymous' } });
  check('requires auth to edit', editAnonymous.status === 401, editAnonymous.body);

  // ── Search ──────────────────────────────────────────────────────────────
  section('Search');
  const search = await api(`/search?q=${encodeURIComponent(alice.name.split(' ')[0])}`, { token: tokenA });
  check('search finds students', search.body?.data?.students?.some((s) => s.username === alice.username), search.body?.data?.students);

  const searchPosts = await api(`/search?q=${encodeURIComponent('React project')}`, { token: tokenA });
  check('search finds posts', searchPosts.body?.data?.posts?.length > 0, searchPosts.body?.data?.posts?.length);

  const noSearch = await api('/search?q=', { token: tokenA });
  check('rejects an empty query', noSearch.status === 400, noSearch.body);

  const anonSearch = await api('/search?q=test');
  check('search works while signed out', anonSearch.status === 200 && Array.isArray(anonSearch.body?.data?.students), anonSearch.status);
  check('anonymous results are unpersonalised', anonSearch.body?.data?.posts?.every((p) => p.isLiked === false) ?? true, anonSearch.body?.data?.posts?.[0]);

  // Regex safety: a hostile query must not throw or match everything.
  const injection = await api('/search?q=%28%2A%29%28', { token: tokenA });
  check('is safe against regex injection', injection.status === 200, injection.body?.message);

  // ── NoSQL operator injection through query params ────────────────────────
  section('Query injection');
  // Express parses `?a[$ne]=x` into a real object, so any query param that is
  // copied straight into a Mongo filter becomes a live operator. That is the
  // shape of a NoSQL injection, and it does not need to leak private data to be
  // a bug — it means the filter is attacker-controlled.
  //
  // Asserted across every list endpoint rather than one at a time, because the
  // exposure is per-route: each has to remember for itself. `group` on an
  // author's posts was the one that actually reached a filter, and it only
  // failed because Mongoose refused to cast an operator to an ObjectId — a
  // side effect, not a guard.
  const OPERATORS = ['%5B%24ne%5D=null', '%5B%24gt%5D=', '%5B%24exists%5D=true'];
  const injectionTargets = [
    ['feed scope', `/posts/feed?scope=${OPERATORS[0]}`, tokenA],
    ['feed cursor', `/posts/feed?cursor=${OPERATORS[1]}`, tokenA],
    ['feed limit', `/posts/feed?limit=${OPERATORS[2]}`, tokenA],
    ['author posts group', `/users/${alice.username}/posts?group=${OPERATORS[0]}`, tokenB],
    ['author posts cursor', `/users/${alice.username}/posts?cursor=${OPERATORS[1]}`, tokenB],
    ['saved cursor', `/posts/saved?cursor=${OPERATORS[1]}`, tokenA],
    ['comments cursor', `/posts/${postId}/comments?cursor=${OPERATORS[1]}`, tokenA],
    ['likes cursor', `/posts/${postId}/likes?cursor=${OPERATORS[1]}`, tokenA],
    ['notifications unread', `/notifications?unread=${OPERATORS[0]}`, tokenA],
    ['directory search', `/users?search=${OPERATORS[0]}`, tokenA],
    ['directory course', `/users?course=${OPERATORS[0]}`, tokenA],
    ['connections cursor', `/users/${alice.username}/followers?cursor=${OPERATORS[1]}`, tokenA],
  ];

  for (const [label, path, token] of injectionTargets) {
    const res = await api(path, { token });
    // Either rejected outright, or answered from the default — never a 5xx and
    // never an unhandled type error. A 500 is the tell that an object reached
    // code expecting a string.
    const rejected = res.status === 400;
    const handled = res.status === 200 || rejected;
    check(`${label} rejects operator injection`, handled, `status ${res.status}: ${res.body?.error?.message ?? ''}`);
  }

  // And a legitimate value still works, so the validation is not just refusing
  // everything — that would pass every assertion above.
  const legitGroup = await api(`/users/${alice.username}/posts?limit=5`, { token: tokenB });
  check('a normal paginated request is still accepted', legitGroup.status === 200, legitGroup.status);
  const legitFeed = await api('/posts/feed?scope=all&limit=5', { token: tokenA });
  check('the feed still accepts a valid scope', legitFeed.status === 200, legitFeed.status);

  // ── Reports ─────────────────────────────────────────────────────────────
  section('Reports');
  const report = await api('/reports', {
    method: 'POST',
    token: tokenB,
    body: { targetType: 'post', targetId: postId, reason: 'spam', details: 'Testing the report flow' },
  });
  check('files a report', report.status === 201, report.body);

  const dupeReport = await api('/reports', {
    method: 'POST',
    token: tokenB,
    body: { targetType: 'post', targetId: postId, reason: 'spam' },
  });
  check('deduplicates repeat reports', dupeReport.status === 200 && dupeReport.body?.data?.alreadyReported === true, dupeReport.body);

  const badReason = await api('/reports', {
    method: 'POST',
    token: tokenB,
    body: { targetType: 'post', targetId: postId, reason: 'because' },
  });
  check('validates the report reason', badReason.status === 400, badReason.body);

  // ── Errors ──────────────────────────────────────────────────────────────
  section('Error handling');
  const notFound = await api('/does-not-exist');
  check('404s unknown routes', notFound.status === 404 && notFound.body?.success === false, notFound.body);

  const badId = await api('/posts/not-an-id');
  check('rejects malformed ids', badId.status === 400, badId.body);

  const missingPost = await api('/posts/aaaaaaaaaaaaaaaaaaaaaaaa');
  check('404s a missing post', missingPost.status === 404, missingPost.body);

  // ── Deletion ────────────────────────────────────────────────────────────
  section('Deletion');
  const delOther = await api(`/posts/${postId}`, { method: 'DELETE', token: tokenB });
  check("blocks deleting another user's post", delOther.status === 403, delOther.body);

  const delOwn = await api(`/posts/${filePost.body?.data?.id}`, { method: 'DELETE', token: tokenA });
  check('deletes own post', delOwn.status === 200, delOwn.body);

  const gone = await api(`/posts/${filePost.body?.data?.id}`);
  check('deleted post is gone', gone.status === 404, gone.body);

  const logout = await api('/auth/logout', { method: 'POST' });
  check('logs out', logout.status === 200, logout.body);
  check('clears the refresh cookie', !jar.has('cc_refresh'), [...jar.keys()]);

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`  \x1b[32m${passed} passed\x1b[0m   ${failed ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed'}   (${passed + failed} total)`);
  if (failures.length) {
    console.log(`\n  Failed:`);
    for (const f of failures) console.log(`   • ${f}`);
  }
  console.log('');

  await cleanup();
  process.exit(failed ? 1 : 0);
};

run().catch(async (err) => {
  console.error('\nSmoke test crashed:', err);
  await cleanup();
  process.exit(1);
});
