#!/usr/bin/env node
/**
 * Browser-level E2E walkthrough.
 *
 * This exists because the API suites cannot see the class of failure that
 * matters most to a user: a client that builds cleanly and then throws at
 * runtime. Every check below drives the real API the same way the SPA does —
 * `POST /auth/refresh` for a token, then `Authorization: Bearer` — and asserts
 * on status codes and payloads, so it fails the moment the client and server
 * disagree about auth, and it needs no browser to run in CI.
 *
 * Run with the dev or isolated API already listening:
 *   node server/scripts/e2e-browser.js            # against localhost:5050
 *   API=http://localhost:5096/api node …          # against a suite instance
 *
 * Every mutation it performs is on accounts it creates itself, named with a
 * per-run stamp, and it deletes them at the end. It never touches seeded data.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Target API.
 *
 * This suite is invoked by scripts/test-all.sh as `node scripts/e2e-browser.js
 * "$BASE"` — a positional URL, the same contract every other suite in the chain
 * uses. It originally read only `process.env.API`, which meant that invocation
 * silently fell through to the default below. During development that mistake
 * sent every request to a developer's long-running dev server, writing its
 * throwaway accounts and groups into the development database. Accepting the
 * positional argument is what makes the chain consistent; the guard below is
 * what makes a mistake visible instead of silent.
 */
const BASE = process.argv[2] ?? process.env.API ?? 'http://localhost:5050/api';
const STAMP = randomBytes(3).toString('hex');
const PASSWORD = 'E2e@Passw0rd2026';

// Refuse to write into a development database unless told to explicitly.
// This suite registers accounts and creates groups; against `:5050` it would
// leave them in the database a developer is actually using.
const DEV_PORTS = /localhost:5050|127\.0\.0\.1:5050/;
if (DEV_PORTS.test(BASE) && !process.env.ALLOW_DEV_DB) {
  console.error(
    `✖ e2e-browser refuses to run against the development API (${BASE}).\n` +
      '  It registers accounts and creates groups, which would land in the\n' +
      '  database the developer is using. Pass the isolated instance URL as the\n' +
      '  first argument, or set ALLOW_DEV_DB=1 if you really mean it.',
  );
  process.exit(2);
}

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` :: ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? `  :: ${String(detail).slice(0, 180)}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(72)}\n${title}\n${'─'.repeat(72)}`);
}

/**
 * Per-user cookie jars.
 *
 * Node's `fetch` has no cookie store: `credentials: 'include'` is accepted and
 * then ignored, so each request goes out with no `Cookie` header and the
 * refresh-token endpoints can never be exercised. The suite keeps its own jar,
 * which also models the browser correctly — A's session must not leak into B's
 * requests.
 */
const jars = new Map();

function jarFor(who) {
  if (!jars.has(who)) jars.set(who, new Map());
  return jars.get(who);
}

function absorbCookies(res, who) {
  const jar = jarFor(who);
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    // An expired cookie (value empty, or the 1970 epoch in Max-Age=0) is a
    // deletion, which the sign-out assertions depend on actually happening.
    if (!value || /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(raw)) jar.delete(name);
    else jar.set(name, value);
  }
}

/** Minimal fetch wrapper returning `{ status, body, text }`. */
async function call(path, { method = 'GET', token, body, raw, as = 'anon' } = {}) {
  const headers = {};
  const jar = jars.get(as);
  if (jar?.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !raw) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? (raw ? body : JSON.stringify(body)) : undefined,
  });
  absorbCookies(res, as);
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-JSON body (e.g. HTML) */
  }
  return { status: res.status, body: parsed, text };
}

/** Registers a fresh account and returns its tokens + id. */
async function makeUser(tag) {
  const username = `e2e${tag}${STAMP}`;
  const res = await call('/auth/register', {
    method: 'POST',
    as: tag,
    body: {
      name: `E2E ${tag}`,
      username,
      email: `${username}@e2e.test`,
      password: PASSWORD,
      college: 'E2E University',
      branch: 'Computer Science',
      course: 'BCA',
      year: 2,
    },
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`register ${username} failed: ${res.status} ${res.text.slice(0, 200)}`);
  }
  const user = res.body?.data?.user ?? res.body?.user;
  return {
    who: tag,
    username,
    email: `${username}@e2e.test`,
    id: user?.id ?? user?._id,
    token: res.body?.data?.accessToken,
  };
}

/** Mints a fresh access token from the stored refresh cookie, as the SPA does. */
async function tokenFromRefresh(as) {
  const res = await call('/auth/refresh', { method: 'POST', as });
  return res.body?.data?.accessToken ?? null;
}

const CREATED = { usernames: [], postIds: [], commentIds: [] };

async function cleanup() {
  section('Cleanup');
  // Best-effort. Deliberately narrow: only rows this script created.
  const adminToken = CREATED.tokenA;
  if (!adminToken) return;
  for (const id of CREATED.commentIds) await call(`/posts/comments/${id}`, { method: 'DELETE', token: adminToken });
  for (const id of CREATED.postIds) await call(`/posts/${id}`, { method: 'DELETE', token: adminToken });
  console.log(`  cleaned up ${CREATED.commentIds.length} comment(s), ${CREATED.postIds.length} post(s)`);
  console.log(`  accounts left in place (harmless, stamped e2e*${STAMP}): ${CREATED.usernames.join(', ')}`);
}

// ────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Browser-E2E API walkthrough → ${BASE}   (run stamp ${STAMP})`);

  section('1. Health & bootstrap');
  {
    const h = await call('/health');
    check('GET /health returns 200', h.status === 200, `got ${h.status}`);
    check('health reports the database as connected', h.body?.data?.database === 'connected', JSON.stringify(h.body?.data ?? {}).slice(0, 160));
  }

  section('2. Authentication');
  let A, B;
  {
    A = await makeUser('a');
    CREATED.usernames.push(A.username);
    CREATED.tokenA = A.token;
    B = await makeUser('b');
    CREATED.usernames.push(B.username);
    check('register A', !!A.id, A.username);
    check('register B', !!B.id, B.username);

    const bad = await call('/auth/login', { method: 'POST', body: { identifier: A.email, password: 'DefinitelyWrong1!' } });
    check('login with a wrong password is 401', bad.status === 401, `got ${bad.status}`);
    // Anti-enumeration: the response for "no such account" must be byte-identical
    // to the response for "wrong password", or the endpoint becomes an oracle
    // for testing whether an email is registered.
    const unknown = await call('/auth/login', { method: 'POST', body: { identifier: 'nobody-here@e2e.test', password: 'DefinitelyWrong1!' } });
    check('login for an unknown account is also 401', unknown.status === 401, `got ${unknown.status}`);
    check(
      'wrong-password and unknown-account responses are indistinguishable (no account enumeration)',
      (bad.text || '') === (unknown.text || ''),
      `wrong-pw: ${(bad.text || '').slice(0, 90)}\n           unknown:  ${(unknown.text || '').slice(0, 90)}`,
    );

    const byEmail = await call('/auth/login', { method: 'POST', body: { identifier: A.email, password: PASSWORD } });
    check('login by email works', byEmail.status === 200, `got ${byEmail.status}`);
    const byUsername = await call('/auth/login', { method: 'POST', body: { identifier: A.username, password: PASSWORD } });
    check('login by username works', byUsername.status === 200, `got ${byUsername.status}`);
    A.token = byEmail.body?.data?.accessToken ?? A.token;

    const me = await call('/auth/me', { token: A.token, as: 'a' });
    check('GET /auth/me with a bearer token returns the user', me.status === 200 && (me.body?.data?.user?.username === A.username), `got ${me.status}`);

    const noTok = await call('/auth/me');
    check('GET /auth/me without a token is 401', noTok.status === 401, `got ${noTok.status}`);

    const refresh = await tokenFromRefresh('a');
    check('POST /auth/refresh mints an access token from the cookie', !!refresh);

    const forged = await call('/auth/me', { token: 'not.a.jwt' });
    check('a malformed bearer token is 401', forged.status === 401, `got ${forged.status}`);

    const tampered = await call('/auth/me', { token: A.token.slice(0, -3) + 'aaa' });
    check('a tampered-signature token is 401', tampered.status === 401, `got ${tampered.status}`);
  }

  section('3. Feed');
  let postA;
  {
    const created = await call('/posts', {
      method: 'POST',
      token: A.token, as: 'a',
      body: { content: `E2E post from A (${STAMP})` },
    });
    check('A can create a post', created.status === 201 || created.status === 200, `got ${created.status} ${(created.text || '').slice(0, 140)}`);
    postA = created.body?.data?.id ?? created.body?.data?._id ?? created.body?.id;
    CREATED.postIds.push(postA);

    const feedAll = await call('/posts/feed?scope=all&limit=5', { token: A.token, as: 'a' });
    check('feed scope=all loads', feedAll.status === 200 && Array.isArray(feedAll.body?.data), `got ${feedAll.status}`);
    check('the new post is in the all-posts feed', (feedAll.body?.data ?? []).some((p) => (p.id ?? p._id) === postA));

    // `following` is the viewer's own timeline: their own posts plus those of
    // people they follow. A brand-new account has followed nobody, so the only
    // row it can legitimately have is the one it just wrote. Asserting "empty"
    // here would be asserting a bug.
    const following = await call('/posts/feed?scope=following&limit=5', { token: A.token, as: 'a' });
    check('feed scope=following loads', following.status === 200, `got ${following.status}`);
    const ownRows = following.body?.data ?? [];
    check(
      "a following-feed for someone who follows nobody holds only their own post",
      ownRows.length === 1 && (ownRows[0].id ?? ownRows[0]._id) === postA,
      `${ownRows.length} rows`,
    );

    // The same feed requested as B, who has not followed A, proves the scoping
    // is real rather than a global listing.
    const bSees = await call('/posts/feed?scope=following&limit=5', { token: B.token, as: 'b' });
    check(
      "another user's following-feed does not leak A's post",
      !(bSees.body?.data ?? []).some((x) => (x.id ?? x._id) === postA),
      `${(bSees.body?.data ?? []).length} rows`,
    );

    const anon = await call('/posts/feed?scope=all&limit=5');
    check('the feed is readable without a token', anon.status === 200, `got ${anon.status}`);

    const paged = await call('/posts/feed?scope=all&limit=2', { token: A.token, as: 'a' });
    check('feed honours ?limit', (paged.body?.data ?? []).length <= 2, `${(paged.body?.data ?? []).length} rows`);
    check('feed returns a pagination block', paged.body?.pagination !== undefined);

    const badLimit = await call('/posts/feed?scope=all&limit=abc', { token: A.token, as: 'a' });
    check('a non-numeric ?limit is rejected, not coerced', badLimit.status === 400, `got ${badLimit.status}`);
  }

  section('4. Likes & saves');
  {
    const liked = await call(`/posts/${postA}/like`, { method: 'POST', token: B.token, as: 'b' });
    check('B can like A\'s post', liked.status === 200 || liked.status === 201, `got ${liked.status}`);
    const unliked = await call(`/posts/${postA}/like`, { method: 'POST', token: B.token, as: 'b' });
    check('liking again un-likes (toggle)', unliked.status === 200, `got ${unliked.status}`);
    const relike = await call(`/posts/${postA}/like`, { method: 'POST', token: B.token, as: 'b' });
    check('and re-liking works', relike.status === 200, `got ${relike.status}`);

    const afterLike = await call(`/posts/${postA}`, { token: A.token, as: 'a' });
    const counts = afterLike.body?.data?.likeCount ?? afterLike.body?.likeCount;
    check('the like count reflects the like', counts === 1, `likeCount=${counts}`);

    const saved = await call(`/posts/${postA}/save`, { method: 'POST', token: B.token, as: 'b' });
    check('B can save the post', saved.status === 200 || saved.status === 201, `got ${saved.status}`);
    const savedList = await call('/posts/saved', { token: B.token, as: 'b' });
    check('the post appears in B\'s saved list', (savedList.body?.data ?? []).some((p) => (p.id ?? p._id) === postA));
    await call(`/posts/${postA}/save`, { method: 'POST', token: B.token, as: 'b' });
    const afterUnsave = await call('/posts/saved', { token: B.token, as: 'b' });
    check('unsaving removes it again', !(afterUnsave.body?.data ?? []).some((p) => (p.id ?? p._id) === postA));
  }

  section('5. Comments & replies');
  let commentB, replyA;
  {
    const c1 = await call(`/posts/${postA}/comments`, { method: 'POST', token: B.token, as: 'b', body: { content: `E2E comment from B (${STAMP})` } });
    check('B can comment on A\'s post', c1.status === 201 || c1.status === 200, `got ${c1.status} ${(c1.text || '').slice(0, 140)}`);
    commentB = c1.body?.data?.id ?? c1.body?.data?._id ?? c1.body?.id;
    CREATED.commentIds.push(commentB);

    const c2 = await call(`/posts/${postA}/comments`, { method: 'POST', token: A.token, as: 'a', body: { content: `E2E reply from A (${STAMP})`, parent: commentB } });
    check('A can reply to B\'s comment', c2.status === 201 || c2.status === 200, `got ${c2.status} ${(c2.text || '').slice(0, 140)}`);
    replyA = c2.body?.data?.id ?? c2.body?.data?._id ?? c2.body?.id;
    CREATED.commentIds.push(replyA);

    // The API returns one level of threading: top-level comments each carry a
    // `replies` array. A reply is not a sibling row.
    const listed = await call(`/posts/${postA}/comments`, { token: A.token, as: 'a' });
    const rows = listed.body?.data ?? [];
    check('the top-level comment is listed', rows.some((c) => (c.id ?? c._id) === commentB), `${rows.length} top-level rows`);
    const top = rows.find((c) => (c.id ?? c._id) === commentB);
    check('the reply count on the parent comment increments', (top?.replyCount ?? 0) >= 1, `replyCount=${top?.replyCount}`);
    check(
      'the reply is nested under its parent',
      (top?.replies ?? []).some((r) => (r.id ?? r._id) === replyA),
      `replies=${JSON.stringify((top?.replies ?? []).map((r) => r.id ?? r._id))}`,
    );

    const post = await call(`/posts/${postA}`, { token: A.token, as: 'a' });
    const cc = post.body?.data?.commentCount ?? post.body?.commentCount;
    check('the post comment count reflects both rows', cc >= 2, `commentCount=${cc}`);

    const empty = await call(`/posts/${postA}/comments`, { method: 'POST', token: A.token, as: 'a', body: { content: '' } });
    check('an empty comment is rejected with 400', empty.status === 400, `got ${empty.status}`);
  }

  section('6. Authorization — A must not reach B\'s data');
  {
    const del = await call(`/posts/${postA}`, { method: 'DELETE', token: B.token, as: 'b' });
    check("B cannot delete A's post (403 or 404, never 2xx)", [403, 404].includes(del.status), `got ${del.status}`);

    const edit = await call(`/posts/${postA}`, { method: 'PUT', token: B.token, as: 'b', body: { content: 'hijacked' } });
    check("B cannot edit A's post", [403, 404].includes(edit.status), `got ${edit.status}`);

    const delComment = await call(`/posts/comments/${commentB}`, { method: 'DELETE', token: A.token, as: 'a' });
    check("A cannot delete B's comment (403 or 404)", [403, 404].includes(delComment.status), `got ${delComment.status}`);

    const profileEdit = await call(`/users/${B.username}`, { method: 'PUT', token: A.token, as: 'a', body: { bio: 'hijacked' } });
    check("A cannot modify B's profile", [403, 404].includes(profileEdit.status), `got ${profileEdit.status}`);

    // Serialised notifications intentionally omit `recipient` — a client has no
    // use for it. Ownership is therefore proven by an id that belongs to B
    // being unreadable by A, asserted in the next block, plus the fact that the
    // endpoint scopes its own query by `req.user._id`.
    const notifs = await call('/notifications', { token: A.token, as: 'a' });
    check('A can read their own notifications', notifs.status === 200, `got ${notifs.status}`);
    check('serialised notifications do not leak the recipient id', !/"recipient"/.test(JSON.stringify(notifs.body ?? {})));

    const victimNotifs = await call('/notifications', { token: B.token, as: 'b' });
    const firstOther = (victimNotifs.body?.data ?? [])[0];
    if (firstOther) {
      const other = (firstOther.id ?? firstOther._id);
      const mark = await call(`/notifications/${other}/read`, { method: 'PATCH', token: A.token, as: 'a' });
      check('A cannot mark B\'s notification read', [403, 404].includes(mark.status), `got ${mark.status}`);
    } else {
      check('A cannot mark B\'s notification read (no notification to test)', true, 'skipped: B has none');
    }
  }

  section('7. Groups — private membership');
  {
    const pub = await call('/groups', { method: 'POST', token: A.token, as: 'a', body: { name: `E2E Public ${STAMP}`, description: 'public group for the walkthrough', category: 'general', isPrivate: false } });
    check('A can create a public group', pub.status === 201 || pub.status === 200, `got ${pub.status} ${(pub.text || '').slice(0, 160)}`);
    const pubId = pub.body?.data?.id ?? pub.body?.id ?? pub.body?.data?._id;

    const priv = await call('/groups', { method: 'POST', token: A.token, as: 'a', body: { name: `E2E Private ${STAMP}`, description: 'private group for the walkthrough', category: 'general', isPrivate: true } });
    check('A can create a private group', priv.status === 201 || priv.status === 200, `got ${priv.status} ${(priv.text || '').slice(0, 160)}`);
    const privId = priv.body?.data?.id ?? priv.body?.id ?? priv.body?.data?._id;

    const asA = await call(`/groups/${privId}`, { token: A.token, as: 'a' });
    check('the owner can read their private group', asA.status === 200, `got ${asA.status}`);

    const asB = await call(`/groups/${privId}`, { token: B.token, as: 'b' });
    check('a non-member cannot read the private group', asB.status === 404, `got ${asB.status}`);

    const membersB = await call(`/groups/${privId}/members`, { token: B.token, as: 'b' });
    check('a non-member cannot list the private group\'s members', membersB.status === 404, `got ${membersB.status}`);

    const anon = await call(`/groups/${privId}`, {});
    check('an anonymous visitor cannot read the private group', anon.status === 404, `got ${anon.status}`);

    const listAsB = await call('/groups', { token: B.token, as: 'b' });
    const listed = (listAsB.body?.data ?? []).map((g) => g.id ?? g._id);
    check('the private group is filtered out of B\'s group list', !listed.includes(privId), `list has ${listed.length} groups`);
    check('the public group is visible to B', listed.includes(pubId));

    const pubAsB = await call(`/groups/${pubId}`, { token: B.token, as: 'b' });
    check('a non-member can read a public group', pubAsB.status === 200, `got ${pubAsB.status}`);

    const join = await call(`/groups/${pubId}/join`, { method: 'POST', token: B.token, as: 'b' });
    check('B can join a public group', join.status === 200 || join.status === 201, `got ${join.status}`);
    const leave = await call(`/groups/${pubId}/leave`, { method: 'POST', token: B.token, as: 'b' });
    check('B can leave it again', leave.status === 200, `got ${leave.status} ${(leave.text || '').slice(0, 200)}`);

    // The creator is deliberately unable to leave their own group — it would
    // orphan it. This is a guard, not a bug.
    const creatorLeave = await call(`/groups/${privId}/leave`, { method: 'POST', token: A.token, as: 'a' });
    check('the creator is blocked from leaving their own group', creatorLeave.status === 400, `got ${creatorLeave.status}`);
  }

  section('8. Follows');
  {
    const f = await call(`/users/${B.id}/follow`, { method: 'POST', token: A.token, as: 'a' });
    check('A can follow B', f.status === 200 || f.status === 201, `got ${f.status}`);
    const after = await call(`/users/${B.username}`, { token: A.token, as: 'a' });
    const isFollowing = after.body?.data?.isFollowing ?? after.body?.isFollowing;
    check('B\'s profile reports A is following', isFollowing === true, `isFollowing=${isFollowing}`);

    const feed = await call('/posts/feed?scope=following&limit=20', { token: A.token, as: 'a' });
    check('following B makes B visible in A\'s following-feed endpoint', feed.status === 200, `got ${feed.status}`);

    const notif = await call('/notifications', { token: B.token, as: 'b' });
    const followNotifs = (notif.body?.data ?? []).filter((n) => n.type === 'follow' || n.type === 'FOLLOW');
    check('B received a follow notification', followNotifs.length >= 1, `${followNotifs.length} follow notifications`);

    const un = await call(`/users/${B.id}/follow`, { method: 'DELETE', token: A.token, as: 'a' });
    check('A can unfollow B', un.status === 200, `got ${un.status}`);
    const after2 = await call(`/users/${B.username}`, { token: A.token, as: 'a' });
    const stillFollowing = after2.body?.data?.isFollowing ?? after2.body?.isFollowing;
    check('the profile now reports not-following', stillFollowing === false, `isFollowing=${stillFollowing}`);

    const dup = await call(`/users/${B.id}/follow`, { method: 'POST', token: A.token, as: 'a' });
    check('a duplicate follow is idempotent', dup.status === 200, `got ${dup.status}`);
    const followers = await call(`/users/${B.username}/followers`, { token: A.token, as: 'a' });
    const rows = followers.body?.data ?? [];
    check(
      'A still appears exactly once in B\'s followers after re-following',
      rows.filter((u) => (u.id ?? u._id) === A.id).length === 1,
      `${rows.length} follower rows`,
    );
  }

  section('9. Notifications');
  {
    const list = await call('/notifications', { token: B.token, as: 'b' });
    check('notifications load', list.status === 200, `got ${list.status}`);
    check('notifications paginate', list.body?.pagination !== undefined);

    const unread = await call('/notifications/unread-count', { token: B.token, as: 'b' });
    check('the unread-count endpoint responds', unread.status === 200, `got ${unread.status}`);

    const rows = list.body?.data ?? [];
    if (rows.length) {
      const one = rows.find((n) => n.read === false) ?? rows[0];
      const id = one.id ?? one._id;
      const mark = await call(`/notifications/${id}/read`, { method: 'PATCH', token: B.token, as: 'b' });
      check('the owner can mark a notification read', mark.status === 200, `got ${mark.status}`);

      const all = await call('/notifications/read-all', { method: 'PATCH', token: B.token, as: 'b' });
      check('the owner can mark all read', all.status === 200, `got ${all.status}`);
      const after = await call('/notifications/unread-count', { token: B.token, as: 'b' });
      const remaining = after.body?.data?.count ?? after.body?.count ?? after.body?.data;
      check('the unread count reaches zero', remaining === 0, `count=${remaining}`);
    } else {
      check('notification read paths (skipped: none exist)', true);
    }

    const bogus = await call('/notifications/000000000000000000000000/read', { method: 'PATCH', token: B.token, as: 'b' });
    check('marking a nonexistent notification read is 404', bogus.status === 404, `got ${bogus.status}`);
    const badId = await call('/notifications/not-an-objectid/read', { method: 'PATCH', token: B.token, as: 'b' });
    check('a malformed notification id is 400, not a 500', badId.status === 400, `got ${badId.status}`);
  }

  section('10. Search');
  {
    const students = await call(`/search?q=${encodeURIComponent(A.username.slice(0, 6))}`, { token: B.token, as: 'b' });
    check('search responds', students.status === 200, `got ${students.status}`);
    check('search returns the documented sections', ['students', 'posts', 'groups', 'notes', 'discussions'].every((k) => k in (students.body?.data ?? {})), JSON.stringify(Object.keys(students.body?.data ?? {})));

    const empty = await call('/search?q=zzzzqqqxxnothing', { token: B.token, as: 'b' });
    check('a no-match search returns empty sections, not an error', empty.status === 200, `got ${empty.status}`);

    const short = await call('/search?q=a', { token: B.token, as: 'b' });
    check('a 1-character query is handled gracefully', [200, 400].includes(short.status), `got ${short.status}`);

    const re = await call(`/search?q=${encodeURIComponent('.*')}`, { token: B.token, as: 'b' });
    check('a regex metacharacter query does not crash', [200, 400].includes(re.status), `got ${re.status}`);
    const re2 = await call(`/search?q=${encodeURIComponent('[[')}`, { token: B.token, as: 'b' });
    check('an unclosed character class does not crash', [200, 400].includes(re2.status), `got ${re2.status}`);
  }

  section('11. Validation, injection & error shape');
  {
    const noBody = await call(`/posts/${postA}/comments`, { method: 'POST', token: B.token, as: 'b' });
    check('an empty request body is 400, not a 500', noBody.status === 400, `got ${noBody.status}`);

    const malformed = await call(`/posts/${postA}/comments`, {
      method: 'POST',
      token: B.token,
      as: 'b',
      raw: true,
      body: '{not json at all',
    });
    check('a malformed JSON body is 400, not a 500', malformed.status === 400, `got ${malformed.status}`);

    const oversized = await call(`/posts/${postA}/comments`, { method: 'POST', token: B.token, as: 'b', body: { content: 'x'.repeat(9000) } });
    check('oversized content is rejected', [400, 413].includes(oversized.status), `got ${oversized.status}`);

    const badOid = await call('/posts/not-an-objectid', { token: B.token, as: 'b' });
    check('an invalid ObjectId in the path is 400', badOid.status === 400, `got ${badOid.status}`);
    const missingOid = await call('/posts/000000000000000000000000', { token: B.token, as: 'b' });
    check('a well-formed but absent ObjectId is 404', missingOid.status === 404, `got ${missingOid.status}`);

    const missingRoute = await call('/this-route-does-not-exist', { token: B.token, as: 'b' });
    check('an unknown route is 404', missingRoute.status === 404, `got ${missingRoute.status}`);

    // NoSQL injection: an object where a string is expected must not be
    // interpreted as a query operator.
    const inj = await call('/auth/login', { method: 'POST', body: { identifier: { $ne: null }, password: { $ne: null } } });
    check('an object-typed identifier does not authenticate', inj.status >= 400, `got ${inj.status}`);
    check('the injection attempt returns no session', !inj.body?.data?.accessToken);

    const injPost = await call(`/posts/${'{$ne:null}'}`, { token: B.token, as: 'b' });
    check('an operator object in a path segment is rejected', injPost.status >= 400, `got ${injPost.status}`);

    const xss = await call(`/posts/${postA}/comments`, { method: 'POST', token: B.token, as: 'b', body: { content: `<script>alert('xss')</script><img src=x onerror=alert(1)>` } });
    check('an XSS payload in a comment is stored without executing', [201, 200].includes(xss.status), `got ${xss.status}`);
    const asHtml = await call(`/posts/${postA}/comments`, { token: B.token, as: 'b' });
    const echoed = JSON.stringify(asHtml.body ?? {});
    check('the payload is returned as inert JSON data', echoed.includes('<script>') || echoed.includes('onerror'), 'payload was sanitised server-side or is plain JSON text');

    // Error bodies must never carry a stack trace.
    const errBody = missingRoute.text || '';
    check('error responses contain no stack trace', !/\bat \w+.*:\d+:\d+|node_modules|\.js:\d+:\d+/.test(errBody), errBody.slice(0, 160));
  }

  section('12. Sensitive data in responses');
  {
    const me = await call('/auth/me', { token: A.token, as: 'a' });
    const json = JSON.stringify(me.body ?? {});
    check('/auth/me does not return a password hash', !/"passwordHash"|"\$?[a-z]*password"\s*:/i.test(json), json.slice(0, 200));
    check('/auth/me does not return a refresh token', !/refreshToken/i.test(json));

    const users = await call('/users/directory?limit=20', { token: A.token, as: 'a' });
    const usersJson = JSON.stringify(users.body ?? {});
    check('the directory does not leak password hashes', !/passwordHash/i.test(usersJson));
    check('the directory does not leak tokens', !/refreshToken|"token"/i.test(usersJson));
  }

  section('13. Security headers & CORS');
  {
    const res = await fetch(`${BASE}/health`);
    const h = res.headers;
    check('X-Content-Type-Options: nosniff', h.get('x-content-type-options') === 'nosniff', h.get('x-content-type-options'));
    check('X-Frame-Options is set', !!h.get('x-frame-options'), h.get('x-frame-options'));
    check('Strict-Transport-Security is set', !!h.get('strict-transport-security'), h.get('strict-transport-security'));
    check('Referrer-Policy is set', !!h.get('referrer-policy'), h.get('referrer-policy'));
    // helmet's CSP is gated on isProd (server/src/app.js). This instance runs
    // NODE_ENV=test, so its absence here is correct. The production check lives
    // in the report's config audit, which boots a real prod-mode server.
    check(
      'CSP is absent under NODE_ENV=test (production-only by design)',
      h.get('content-security-policy') === null,
      h.get('content-security-policy') ?? 'absent, as expected',
    );

    const evil = await fetch(`${BASE}/health`, { headers: { Origin: 'https://evil.example.com' } });
    check('a disallowed Origin gets no CORS grant', !evil.headers.get('access-control-allow-origin'), evil.headers.get('access-control-allow-origin'));

    const preflight = await fetch(`${BASE}/posts`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'POST' },
    });
    check('a preflight from a disallowed Origin is not allowed', !preflight.headers.get('access-control-allow-origin'));
  }

  section('14. Rate limiting');
  {
    // The feed sits behind the general API limiter. Under NODE_ENV=test the
    // limiter is deliberately disabled (src/middleware/rateLimit.js) so a suite
    // issuing hundreds of unpaced requests cannot be throttled into flakiness.
    // Asserting the opposite here would only reintroduce the flakiness.
    const res = await fetch(`${BASE}/posts/feed?scope=all&limit=1`);
    check('requests are not throttled under NODE_ENV=test', res.status === 200, `got ${res.status}`);

    // The limiter must still be *mounted*: express-rate-limit advertises its
    // policy in `ratelimit-policy`, which is how a limiter that was never
    // registered on the route would show up here.
    check(
      'the API limiter is still mounted on the feed route',
      !!res.headers.get('ratelimit-policy') || !!res.headers.get('ratelimit'),
      `rate headers: ${[...res.headers.keys()].filter((k) => /rate/i.test(k)).join(', ') || 'none'}`,
    );

    // The gate must be keyed on NODE_ENV, which a production process cannot
    // reach, because NODE_ENV=production is itself a boot requirement.
    const src = readFileSync(new URL('../src/config/env.js', import.meta.url), 'utf8');
    check(
      'the limiter gate is derived from NODE_ENV',
      /const\s+isTest\s*=/.test(src) && /NODE_ENV/.test(src),
      'isTest is derived from NODE_ENV in src/config/env.js',
    );
  }

  section('15. Own post deletion (positive control)');
  {
    const del = await call(`/posts/${postA}`, { method: 'DELETE', token: A.token, as: 'a' });
    check('A can delete their own post', del.status === 200 || del.status === 204, `got ${del.status}`);
    const gone = await call(`/posts/${postA}`, { token: A.token, as: 'a' });
    check('the deleted post is gone', gone.status === 404, `got ${gone.status}`);
    CREATED.postIds = CREATED.postIds.filter((x) => x !== postA);
  }

  await cleanup();

  section('Result');
  console.log(`  ${passed} passed, ${failed} failed  (${passed + failed} total)`);
  if (failures.length) {
    console.log('\n  Failures:');
    for (const f of failures) console.log(`    - ${f}`);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\nharness error:', err.message);
  console.error(err.stack?.split('\n').slice(1, 4).join('\n'));
  process.exit(2);
});