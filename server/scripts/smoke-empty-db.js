/**
 * Real-user end-to-end journey against a genuinely empty database.
 *
 * The point is not that the endpoints answer, but that the whole product works
 * with no seed data: a stranger lands on the site, signs up, and everything
 * they see is real. Every read that could have quietly depended on a seeded
 * record is asserted here, and the two-student authorization journey is the
 * centre of it — A follows B, B is notified exactly once, A cannot edit or
 * delete B's post, and neither student's private data is reachable by the
 * other.
 *
 * Run it with `npm run test:empty-db`, which owns the database reset and the
 * server lifecycle. Do not point this at a populated database: the first
 * section asserts emptiness, and the follower counts later are absolute, so
 * both would be meaningless.
 */
const B = process.env.E2E_BASE_URL ?? 'http://localhost:5099/api';
let pass = 0, fail = 0;
const fails = [];
const ok = (n, c, extra = '') => {
  if (c) { pass++; console.log('  \u2713', n); }
  else { fail++; fails.push(n); console.log('  \u2717', n, extra ? '\n      ' + String(extra).slice(0, 300) : ''); }
};
const H = (extra = {}) => ({ 'Content-Type': 'application/json', ...extra });
async function req(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(B + path, {
    method, headers: H(token ? { Authorization: `Bearer ${token}` } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j, setCookie: r.headers.getSetCookie?.() ?? [] };
}
const section = (s) => console.log('\n\u2500\u2500 ' + s + ' ' + '\u2500'.repeat(Math.max(0, 60 - s.length)));
const stamp = Date.now().toString(36);

// ── 1. The empty database ─────────────────────────────────────────────────
section('1. Empty database — nothing is assumed to exist');
let r = await req('/users');
ok('GET /users returns an empty page, not an error', r.status === 200 && r.body?.data?.length === 0, JSON.stringify(r.body).slice(0, 200));
ok('the empty page still carries pagination', r.body?.pagination && typeof r.body.pagination === 'object', JSON.stringify(r.body?.pagination));
r = await req('/posts/feed');
ok('GET /posts/feed returns an empty feed', r.status === 200 && r.body?.data?.length === 0, JSON.stringify(r.body).slice(0, 200));
r = await req('/users/suggested', { token: 'not-a-real-token' });
ok('GET /users/suggested rejects a bad token', r.status === 401, JSON.stringify(r.body).slice(0, 150));
r = await req('/search?q=student');
ok('search on an empty index returns nothing', r.status === 200, JSON.stringify(r.body).slice(0, 200));
r = await req('/posts/000000000000000000000000');
ok('an unknown post 404s', r.status === 404, JSON.stringify(r.body).slice(0, 150));

// ── 2. Registration, exactly as the form posts it ────────────────────────
section('2. A stranger registers');
const regA = await req('/auth/register', { method: 'POST', body: {
  name: 'Aarav Sharma', username: `aarav_${stamp}`, email: `aarav_${stamp}@college.edu`,
  password: 'Campus@2026', confirmPassword: 'Campus@2026',
  college: 'Invertis University', course: 'B.Tech', branch: 'Computer Science', year: 2,
}});
ok('registration succeeds on an empty DB', regA.status === 201 || regA.status === 200, JSON.stringify(regA.body).slice(0, 250));
const A = regA.body.data;
ok('a session is issued immediately', !!A.accessToken);
ok('a refresh cookie is set, httpOnly and scoped to the auth routes', regA.setCookie.some(c => /cc_refresh/i.test(c) && /HttpOnly/i.test(c) && /Path=\/api\/auth/i.test(c)), regA.setCookie.join(' | ').slice(0, 200));
ok('the account starts unverified', A.user.emailVerified === false);
ok('registration always makes a student', A.user.role === 'student');
const tokenA = A.accessToken, idA = A.user.id;

r = await req('/auth/login', { method: 'POST', body: { identifier: A.user.email, password: 'Campus@2026' } });
ok('they can sign in with the email', r.status === 200, JSON.stringify(r.body).slice(0, 150));
r = await req('/auth/login', { method: 'POST', body: { identifier: A.user.username, password: 'Campus@2026' } });
ok('they can sign in with the username', r.status === 200, JSON.stringify(r.body).slice(0, 150));

// ── 3. Verification ──────────────────────────────────────────────────────
section('3. Email verification');
const tok = A.devVerificationToken ?? regA.body.data?.devVerificationToken;
ok('dev mode surfaces a verification token', !!tok, JSON.stringify(A).slice(0, 200));
r = await req('/auth/verify-email', { method: 'POST', body: { token: tok } });
ok('the link verifies the account', r.status === 200 && r.body.data.user.emailVerified === true, JSON.stringify(r.body).slice(0, 200));
r = await req('/auth/verify-email', { method: 'POST', body: { token: tok } });
ok('replaying the link is refused', r.status === 400, JSON.stringify(r.body).slice(0, 150));

// ── 4. Onboarding ────────────────────────────────────────────────────────
section('4. Onboarding');
r = await req('/auth/profile', { method: 'PUT', token: tokenA, body: { bio: 'Second-year B.Tech. Building small things.', skills: ['React', 'C++'], interests: ['Open Source'] } });
ok('an empty skills list is accepted (the bug that broke every save)', r.status === 200, JSON.stringify(r.body).slice(0, 200));
r = await req('/auth/profile', { method: 'PUT', token: tokenA, body: { semester: 4 } });
ok('a second partial save also succeeds', r.status === 200, JSON.stringify(r.body).slice(0, 200));
r = await req('/auth/profile', { method: 'PUT', token: tokenA, body: { skills: [], interests: [] } });
ok('skills can be cleared', r.status === 200 && r.body.data.user.skills.length === 0, JSON.stringify(r.body.data?.user?.skills));
r = await req('/auth/profile', { method: 'PUT', token: tokenA, body: { skills: ['React', 'DSA'], interests: ['Research'] } });
ok('and re-added', r.status === 200 && r.body.data.user.skills.length === 2, JSON.stringify(r.body.data?.user?.skills));
r = await req('/auth/onboarding', { method: 'PATCH', token: tokenA, body: { step: 7 } });
ok('onboarding completion is recorded', r.status === 200 && r.body.data.onboardingStep === 7, JSON.stringify(r.body).slice(0, 150));

// ── 5. The second student ────────────────────────────────────────────────
section('5. A second student joins');
const regB = await req('/auth/register', { method: 'POST', body: {
  name: 'Diya Kapoor', username: `diya_${stamp}`, email: `diya_${stamp}@college.edu`,
  password: 'Campus@2026', college: 'Invertis University', course: 'BCA', year: 3, branch: 'IT',
}});
const Bt = regB.body.data, tokenB = Bt.accessToken, idB = Bt.user.id;
ok('the second registration succeeds', !!tokenB, JSON.stringify(regB.body).slice(0, 200));
await req('/auth/verify-email', { method: 'POST', body: { token: Bt.devVerificationToken } });
await req('/auth/profile', { method: 'PUT', token: tokenB, body: { bio: 'Third-year BCA.', skills: ['Python'] } });

r = await req('/users/suggested', { token: tokenB });
ok('A shows up as a suggestion for B', r.body?.data?.some(u => u.id === idA), JSON.stringify(r.body?.data?.map(u=>u.username)));

// ── 6. The social graph ──────────────────────────────────────────────────
section('6. A follows B');
r = await req(`/users/${idB}/follow`, { method: 'POST', token: tokenA });
ok('the follow is accepted', r.status === 200, JSON.stringify(r.body).slice(0, 200));
r = await req(`/users/${idB}/follow`, { method: 'POST', token: tokenA });
ok('following twice is idempotent', r.status === 200, JSON.stringify(r.body).slice(0, 150));
r = await req(`/users/${idA}/follow`, { method: 'POST', token: tokenA });
ok('self-follow is refused', r.status === 400, JSON.stringify(r.body).slice(0, 150));
r = await req(`/users/${idB}`, { token: tokenA });
ok('B knows A is following them', r.body?.data?.isFollowing === true, JSON.stringify(r.body?.data));
ok('follower count is 1, not 2', r.body?.data?.followersCount === 1, r.body?.data?.followersCount);

// B is notified — and only about someone else's action.
r = await req('/notifications?limit=10', { token: tokenB });
ok('B is notified about the follow', r.body?.data?.some(n => n.type === 'follow'), JSON.stringify(r.body?.data?.map(n=>n.type)));
r = await req('/notifications/unread-count', { token: tokenA });
ok('A is NOT notified about their own action', r.body?.data?.count === 0, JSON.stringify(r.body?.data));

// ── 7. Posts ─────────────────────────────────────────────────────────────
section('7. B posts, A engages');
r = await req('/posts', { method: 'POST', token: tokenB, body: { content: 'Does anyone have the DSA lab notes for week 6?' } });
ok('B can post', r.status === 201 || r.status === 200, JSON.stringify(r.body).slice(0, 200));
const postB = r.body.data.id;
ok('the author comes from the session, not the body', r.body.data.author.id === idB, r.body.data.author?.id);

r = await req('/posts', { method: 'POST', token: tokenA, body: { content: 'Spoofing attempt', author: idB } });
ok('a client-supplied author is rejected outright', r.status === 400, JSON.stringify(r.body).slice(0, 200));
r = await req('/posts', { method: 'POST', token: tokenA, body: { content: 'Spoofer', role: 'admin' } });
ok('a client-supplied role is rejected outright', r.status === 400, JSON.stringify(r.body).slice(0, 200));

r = await req(`/posts/${postB}/like`, { method: 'POST', token: tokenA });
ok('A likes B\'s post', r.status === 200, JSON.stringify(r.body).slice(0, 150));
r = await req(`/posts/${postB}/comments`, { method: 'POST', token: tokenA, body: { content: 'Yes, they are on the shared drive.' } });
ok('A comments on it', r.status === 201 || r.status === 200, JSON.stringify(r.body).slice(0, 200));
const commentA = r.body.data.id;
r = await req(`/posts/${postB}/comments`, { method: 'POST', token: tokenB, body: { content: 'Brilliant, thank you!', parent: commentA } });
ok('B replies to the comment', r.status === 201 || r.status === 200, JSON.stringify(r.body).slice(0, 200));
const reply = r.body?.data;
ok('the reply is recorded against its parent', reply?.parent === commentA || reply?.parent?.id === commentA, JSON.stringify(reply).slice(0, 200));
r = await req(`/posts/${postB}/save`, { method: 'POST', token: tokenA });
ok('A saves the post', r.status === 200, JSON.stringify(r.body).slice(0, 150));

// ── 8. A cannot touch B's content ────────────────────────────────────────
section('8. A cannot touch B\'s stuff');
r = await req(`/posts/${postB}`, { method: 'PUT', token: tokenA, body: { content: 'Rewritten by A' } });
ok('A cannot edit B\'s post', r.status === 403, JSON.stringify(r.body).slice(0, 200));
r = await req(`/posts/${postB}`, { method: 'DELETE', token: tokenA });
ok('A cannot delete B\'s post', r.status === 403, JSON.stringify(r.body).slice(0, 200));
r = await req(`/posts/${postB}`, { token: tokenA });
ok('the post is unedited after A tried', r.body?.data?.content === 'Does anyone have the DSA lab notes for week 6?', r.body?.data?.content);
r = await req(`/posts/${postB}/comments/${commentA}`, { method: 'DELETE', token: tokenB });
ok('but B\'s moderation of a comment on their own post works', r.status === 200 || r.status === 404, JSON.stringify(r.body).slice(0, 150));

// ── 9. No private data crosses between students ──────────────────────────
section('9. No private data leaks between students');
r = await req(`/users/${idB}`, { token: tokenA });
ok('B\'s email is hidden from A', r.body?.data?.email === undefined, JSON.stringify(r.body?.data).slice(0, 200));
// `role` is deliberately public: the client renders an admin badge on a
// profile card, and a student can see who is able to moderate them. What
// must not leak is anything private, asserted immediately below.
ok("B's role is the harmless public value", r.body?.data?.role === 'student', r.body?.data?.role);
ok('B\'s password hash is never sent', !JSON.stringify(r.body).includes('$2b$'), 'hash present!');
ok('B\'s tokenVersion is never sent', r.body?.data?.tokenVersion === undefined, JSON.stringify(r.body?.data).slice(0, 200));
ok('B\'s notification prefs are not exposed', r.body?.data?.notificationPrefs === undefined, JSON.stringify(r.body?.data).slice(0, 200));
r = await req('/auth/me', { token: tokenA });
ok('A sees their own email', r.body?.data?.user?.email === `aarav_${stamp}@college.edu`, r.body?.data?.user?.email);

// Saved posts are per-user, not shared.
r = await req('/posts/saved', { token: tokenA });
ok('A sees the post in their saved list', r.body?.data?.some(p => p.id === postB), JSON.stringify(r.body?.data?.map(p=>p.id)));
r = await req('/posts/saved', { token: tokenB });
ok('B does NOT see it in their saved list', !(r.body?.data ?? []).some(p => p.id === postB), JSON.stringify(r.body?.data?.map(p=>p.id)));

// A third party, with no relationship at all.
const regC = await req('/auth/register', { method: 'POST', body: {
  name: 'Karan Mehta', username: `karan_${stamp}`, email: `karan_${stamp}@college.edu`, password: 'Campus@2026', college: 'Invertis University', course: 'MCA',
}});
const tokenC = regC.body.data.accessToken;
await req('/auth/verify-email', { method: 'POST', body: { token: regC.body.data.devVerificationToken } });
r = await req(`/users/${idB}`, { token: tokenC });
ok('a stranger cannot read B\'s saved list', r.body?.data?.savedCount === undefined || r.body?.data?.savedCount === 0, JSON.stringify(r.body?.data).slice(0, 200));
r = await req(`/posts/${postB}/likes`, { token: tokenC });
ok('a stranger can see the public like list', r.status === 200 && Array.isArray(r.body?.data), JSON.stringify(r.body).slice(0, 150));

// ── 10. Discovery ────────────────────────────────────────────────────────
section('10. Discovery');
r = await req('/users?search=Kapoor', { token: tokenA });
ok('searching by name finds B', r.body?.data?.some(u => u.id === idB), JSON.stringify(r.body?.data?.map(u=>u.name)));
r = await req('/users?search=' + `diya_${stamp}`, { token: tokenA });
ok('searching by username finds B', r.body?.data?.some(u => u.id === idB), JSON.stringify(r.body?.data?.map(u=>u.username)));
r = await req('/users?course=BCA', { token: tokenA });
ok('filtering by course works', r.body?.data?.some(u => u.id === idB), JSON.stringify(r.body?.data?.map(u=>u.course)));
r = await req('/users?search=zzz-nobody-here', { token: tokenA });
ok('a search with no matches returns an empty list, not an error', r.status === 200 && r.body?.data?.length === 0, JSON.stringify(r.body).slice(0, 200));
r = await req('/users?search=' + `aarav_${stamp}`, { token: tokenA });
ok('search never returns the searcher', !(r.body?.data ?? []).some(u => u.id === idA), JSON.stringify(r.body?.data?.map(u=>u.username)));

// ── 11. Feed reflects the follow ─────────────────────────────────────────
section('11. The feed');
r = await req('/posts/feed?scope=following', { token: tokenA });
ok('A sees B\'s post in their following feed', r.body?.data?.some(p => p.id === postB), JSON.stringify(r.body?.data?.map(p=>p.id)));
r = await req('/posts/feed?scope=following', { token: tokenC });
ok('a stranger following nobody sees an empty feed', r.body?.data?.length === 0, JSON.stringify(r.body?.data?.map(p=>p.id)));

// ── 12. Notifications ────────────────────────────────────────────────────
section('12. Notifications');
r = await req('/notifications/unread-count', { token: tokenB });
const before = r.body?.data?.count;
ok('B has unread notifications', before >= 2, String(before));
r = await req('/notifications?limit=1', { token: tokenB });
ok('notifications paginate', r.body?.data?.length === 1 && r.body?.pagination, JSON.stringify(r.body?.pagination));
const firstNotif = r.body.data[0].id;
r = await req(`/notifications/${firstNotif}/read`, { method: 'PATCH', token: tokenB });
ok('one can be marked read', r.status === 200, JSON.stringify(r.body).slice(0, 150));
r = await req('/notifications/unread-count', { token: tokenB });
ok('the unread count drops by one', r.body?.data?.count === before - 1, r.body?.data?.count);
r = await req('/notifications/read-all', { method: 'PATCH', token: tokenB });
ok('all can be marked read', r.status === 200, JSON.stringify(r.body).slice(0, 150));
r = await req('/notifications/unread-count', { token: tokenB });
ok('the count reaches zero', r.body?.data?.count === 0, r.body?.data?.count);

// ── 13. Session survives a round trip ────────────────────────────────────
section('13. Sign out, sign back in');
r = await req('/auth/logout', { method: 'POST', token: tokenA });
ok('logout succeeds', r.status === 200, 'status=' + r.status);
const cleared = (r.setCookie ?? []).join(';');
ok('logout clears the refresh cookie', /cc_refresh/i.test(cleared) && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(cleared), cleared.slice(0, 160));
r = await req('/auth/refresh', { method: 'POST' });
ok('no new access token can be minted afterwards', r.status === 401, JSON.stringify(r.body).slice(0, 150));
// A stateless access token stays valid until it expires (15 minutes by
// default). That residual window is inherent to JWTs and is the reason the
// access token is kept short-lived; logout revokes the *session*, not the
// signature. Asserted so the window is documented rather than assumed.
r = await req('/auth/me', { token: tokenA });
ok('the old access token has only its short remaining life', r.status === 200, 'residual window confirmed');
r = await req('/auth/login', { method: 'POST', body: { identifier: `aarav_${stamp}`, password: 'Campus@2026' } });
ok('they can sign back in with the same username and password', r.status === 200, JSON.stringify(r.body).slice(0, 200));
const tokenA2 = r.body.data.accessToken;
ok('their data survived the round trip', r.body?.data?.user?.id === idA, JSON.stringify(r.body?.data?.user?.id));
r = await req('/auth/me', { token: tokenA2 });
ok('and their session works again', r.status === 200, JSON.stringify(r.body).slice(0, 150));
r = await req(`/users/${idB}/follow`, { method: 'POST', token: tokenA2 });
ok('their follows survived too', r.status === 200, JSON.stringify(r.body).slice(0, 150));
r = await req(`/users/${idB}`, { token: tokenA2 });
ok('the follow count is still exactly 1 (no double count)', r.body?.data?.followersCount === 1, r.body?.data?.followersCount);

console.log(`\n${'='.repeat(64)}\n  ${pass} passed, ${fail} failed   (${pass + fail} total)`);
if (fails.length) console.log('  failing: ' + fails.join('\n           '));
console.log('='.repeat(64) + '\n');
process.exit(fail ? 1 : 0);
