#!/usr/bin/env node
/**
 * Focused check for the notification endpoints behind the Notifications UI:
 * follow → like → comment → reply each fire a notification, the list is scoped
 * to the recipient, unread counting works, and read state sticks.
 *
 * Usage: node scripts/smoke-notifications.js [baseUrl]
 */
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
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail !== undefined ? ` → ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  }
}

const section = (name) => console.log(`\n\x1b[1m${name}\x1b[0m`);

async function api(pathname, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

const register = async (first, last) => {
  const handle = U(first);
  const { body } = await api('/auth/register', {
    method: 'POST',
    body: {
      name: `${first} ${last}`,
      username: handle,
      email: `${handle}@campus.test`,
      password: 'Student@2026',
      college: 'Invertis University',
      course: 'MCA',
    },
  });
  return { token: body.data.accessToken, user: body.data.user };
};

(async () => {
  section('Setup');
  const nikhil = await register('nikhil', 'rao');
  const meera = await register('meera', 'iyer');
  check('two accounts created', Boolean(nikhil.token && meera.token));

  const { body: postBody } = await api('/posts', {
    method: 'POST',
    token: nikhil.token,
    body: { content: 'Notification smoke test post for #dbms revision week.' },
  });
  const postId = postBody.data.id;
  check('post created', Boolean(postId), postBody);

  section('Follow notification');
  await api(`/users/${nikhil.user.id}/follow`, { method: 'POST', token: meera.token });
  const { body: afterFollow } = await api('/notifications', { token: nikhil.token });
  const followNote = afterFollow.data.find((n) => n.type === 'follow');
  check('recipient received a follow notification', Boolean(followNote), afterFollow);
  check('follow notification names the actor', followNote?.actor?.username === meera.user.username);
  check('follow notification points at a User entity', followNote?.entity?.model === 'User', followNote?.entity);
  check('follow notification carries the followed user id', followNote?.entity?.id === nikhil.user.id, followNote?.entity);

  section('Unread counting');
  check('unreadCount reflects the follow', afterFollow.unreadCount >= 1, afterFollow.unreadCount);
  const { body: countBody } = await api('/notifications/unread-count', { token: nikhil.token });
  check('unread-count endpoint agrees', countBody.data.count === afterFollow.unreadCount, countBody);

  section('Like and comment notifications');
  await api(`/posts/${postId}/like`, { method: 'POST', token: meera.token });

  const { body: meeraComment } = await api(`/posts/${postId}/comments`, {
    method: 'POST',
    token: meera.token,
    body: { content: 'Which normalisation form should I prioritise?' },
  });
  const meeraCommentId = meeraComment.data.id;

  // Nikhil replies to Meera — the notification must go to Meera, not Nikhil.
  const { body: nikhilReply } = await api(`/posts/${postId}/comments`, {
    method: 'POST',
    token: nikhil.token,
    body: { content: '3NF covers most of the questions.', parent: meeraCommentId },
  });

  // Nikhil opens a thread of his own, and Meera replies to that. Replying to
  // Nikhil's *reply* instead would be a reply to a reply, which the server
  // refuses (see below) because a comment nested two levels down can never be
  // read back by `getComments` — it would be written, counted, and then
  // invisible in the UI for good.
  await api(`/posts/${postId}/comments`, {
    method: 'POST',
    token: nikhil.token,
    body: { content: '3NF is what the exam wanted.' },
  });
  const { body: nikhilThread } = await api(`/posts/${postId}/comments`, { token: nikhil.token });
  const nikhilOwnComment = nikhilThread.data.find((c) => c.content === '3NF is what the exam wanted.');

  const meeraSecondReply = await api(`/posts/${postId}/comments`, {
    method: 'POST',
    token: meera.token,
    body: { content: 'Got it, thanks.', parent: nikhilOwnComment?.id },
  });
  check("Meera's reply to Nikhil's comment is accepted", meeraSecondReply.status === 201, meeraSecondReply);

  // And the shape that is refused must not fire a notification either.
  const { body: meeraThread } = await api(`/posts/${postId}/comments`, { token: nikhil.token });
  const someReply = meeraThread.data.find((c) => c.replies?.length)?.replies?.[0];
  const refused = await api(`/posts/${postId}/comments`, {
    method: 'POST',
    token: meera.token,
    body: { content: 'A reply to a reply', parent: someReply?.id },
  });
  check('a reply to a reply is refused', refused.status === 400, refused);
  const { body: afterRefusal } = await api('/notifications', { token: nikhil.token });
  check(
    'the refused reply fires no notification',
    !afterRefusal.data.some((n) => n.text?.includes('A reply to a reply') || n.type === 'reply' && n.actor?.id === meera.user.id && n.createdAt > meeraSecondReply.createdAt),
    afterRefusal.data.map((n) => [n.type, n.text]),
  );

  const { body: nikhilNotes } = await api('/notifications', { token: nikhil.token });
  const types = nikhilNotes.data.map((n) => n.type);
  check('like notification created', types.includes('like'), types);
  check('comment notification created', types.includes('comment'), types);
  check('reply notification created', types.includes('reply'), types);
  check('notifications are newest first', nikhilNotes.data[0].createdAt >= nikhilNotes.data.at(-1).createdAt);

  const likeNote = nikhilNotes.data.find((n) => n.type === 'like');
  check('like notification embeds the post excerpt', Boolean(likeNote?.entity?.content), likeNote?.entity);
  check('like notification links to the post', likeNote?.entity?.id === postId);
  check('like notification names the post author', likeNote?.entity?.author?.username === nikhil.user.username);

  section('Entity routing contract');
  // The notifications page picks a link target from `entity.model`: a Post
  // entity becomes `/posts/<id>` and anything else falls back to the actor's
  // profile. It used to branch on `entity` merely being present, so a follow —
  // which does carry a `{ model: 'User' }` entity — was sent to
  // `/posts/<a user id>` and rendered "This post is no longer available". These
  // two assertions are the contract that fix depends on, and the guard against
  // it regressing: whatever claims to be a Post must actually be one, and
  // nothing that is not a Post may be addressed as one.
  const { body: nikhilInbox } = await api('/notifications', { token: nikhil.token });
  const postEntities = nikhilInbox.data.filter((n) => n.entity?.model === 'Post');
  const resolved = await Promise.all(
    postEntities.map((n) => api(`/posts/${n.entity.id}`, { token: nikhil.token })),
  );
  check(
    'every notification claiming a Post entity points at a real post',
    postEntities.length > 0 && resolved.every((r) => r.status === 200),
    postEntities.map((n, i) => [n.type, n.entity.id, resolved[i].status]),
  );
  check(
    'a follow is the only type carrying a User entity here',
    nikhilInbox.data
      .filter((n) => n.entity?.model === 'User')
      .every((n) => n.type === 'follow'),
    nikhilInbox.data.filter((n) => n.entity?.model === 'User').map((n) => n.type),
  );

  section('Repeat interactions');
  // The dedupe index is (recipient, actor, type, entity.model, entity.type,
  // entity.comment). For a like or a follow, `entity.comment` is null and
  // `entity.type` is the post or the followed user, so re-tapping produces one
  // row — correct, nobody wants four notifications for one like.
  //
  // For a comment, `entity.type` is the post but `entity.comment` is the
  // comment itself, so two genuinely distinct comments by the same author on
  // the same post are two different events and both must notify. That is what
  // the assertions below check.
  const beforeRepeat = (await api('/notifications', { token: nikhil.token })).body;
  const commentNotesBefore = beforeRepeat.data.filter((n) => n.type === 'comment' && n.actor?.id === meera.user.id).length;
  await api(`/posts/${postId}/like`, { method: 'POST', token: meera.token });
  await api(`/posts/${postId}/like`, { method: 'POST', token: meera.token });
  const afterRelike = await api(`/posts/${postId}/comments`, {
    method: 'POST',
    token: meera.token,
    body: { content: 'A second, different question about normalisation.' },
  });
  const afterRepeat = (await api('/notifications', { token: nikhil.token })).body;
  check(
    're-liking the same post does not add another notification',
    afterRepeat.data.filter((n) => n.type === 'like' && n.actor?.id === meera.user.id).length === 1,
    afterRepeat.data.filter((n) => n.type === 'like').map((n) => n.actor?.username),
  );
  check('the second distinct comment was stored', afterRelike.status === 201, afterRelike);
  check(
    'a second distinct comment DOES notify (each comment is its own event)',
    afterRepeat.data.filter((n) => n.type === 'comment' && n.actor?.id === meera.user.id).length ===
      commentNotesBefore + 1,
    {
      commentNotesBefore,
      after: afterRepeat.data.filter((n) => n.type === 'comment' && n.actor?.id === meera.user.id).length,
    },
  );

  section('Comment identity (Phase 4)');
  // Two comments by the same author on the same post are distinct events, and
  // each row must be traceable to the comment that caused it. Before
  // `entity.comment` existed the dedupe key was the post alone, so the second
  // comment was discarded as a duplicate and nothing recorded which comment a
  // row referred to.
  const mine = afterRepeat.data.filter((n) => n.type === 'comment' && n.actor?.id === meera.user.id);
  check('each comment notification carries its own commentId', mine.every((n) => !!n.entity?.commentId), mine.map((n) => n.entity));
  check(
    'the commentIds are distinct',
    new Set(mine.map((n) => n.entity.commentId)).size === mine.length,
    mine.map((n) => n.entity.commentId),
  );
  check(
    'comment notifications still point at the post for excerpt + link',
    mine.every((n) => n.entity.id === postId && n.entity.model === 'Post'),
    mine.map((n) => ({ id: n.entity.id, model: n.entity.model })),
  );

  // Deleting a comment must not leave the notification it caused behind.
  //
  // Uses a comment of its own rather than one of the fixtures above, because
  // deleting a comment cascades to its replies and to their notifications.
  // Reusing an earlier comment would remove the reply fixture that the next
  // section asserts on, and the failure would look like a routing bug.
  const doomedPost = await api(`/posts/${postId}/comments`, {
    method: 'POST',
    token: meera.token,
    body: { content: 'A comment that exists only to be deleted.' },
  });
  check('the disposable comment was created', doomedPost.status === 201, doomedPost);
  const doomedId = doomedPost.body.data.id;
  const withDoomed = (await api('/notifications', { token: nikhil.token })).body;
  const doomedNote = withDoomed.data.find((n) => n.entity?.commentId === doomedId);
  check('its notification was created', !!doomedNote, withDoomed.data.map((n) => n.entity));

  const del = await api(`/comments/${doomedId}`, { method: 'DELETE', token: meera.token });
  check('deleting a comment succeeds for its author', del.status === 200, del);
  const afterDelete = (await api('/notifications', { token: nikhil.token })).body;
  check(
    'deleting a comment removes the notification it caused',
    doomedNote && !afterDelete.data.some((n) => n.entity?.commentId === doomedId),
    afterDelete.data.filter((n) => n.type === 'comment').map((n) => n.entity),
  );
  check(
    'the surviving comment notifications are untouched',
    afterDelete.data.filter((n) => n.type === 'comment' && n.actor?.id === meera.user.id).length ===
      mine.length,
    { expected: mine.length, actual: afterDelete.data.filter((n) => n.type === 'comment').length },
  );

  // A post-scoped notification type must be unaffected by all of the above.
  check(
    'post-scoped notifications (like) still dedupe one-per-post',
    afterDelete.data.filter((n) => n.type === 'like' && n.actor?.id === meera.user.id).length === 1,
    afterDelete.data.filter((n) => n.type === 'like').length,
  );

  section('Reply routing');
  const { body: meeraNotes } = await api('/notifications', { token: meera.token });
  const replyTypes = meeraNotes.data.map((n) => n.type);
  check('reply goes to the comment author, not the post author', replyTypes.includes('reply'), replyTypes);
  check('comment author did not get a post-comment notification', !replyTypes.includes('comment'), replyTypes);

  section('Self-interaction is ignored');
  await api(`/posts/${postId}/like`, { method: 'POST', token: nikhil.token });
  const { body: selfNotes } = await api('/notifications', { token: nikhil.token });
  check(
    'liking your own post creates nothing',
    !selfNotes.data.some((n) => n.type === 'like' && n.actor?.id === nikhil.user.id),
  );
  check('no self-directed notifications at all', !selfNotes.data.some((n) => n.actor?.id === nikhil.user.id));
  await api(`/posts/${postId}/like`, { method: 'POST', token: meera.token }); // restore

  section('Read state');
  const target = selfNotes.data.find((n) => n.type === 'reply');
  const { body: readBody } = await api(`/notifications/${target.id}/read`, { method: 'PATCH', token: nikhil.token });
  check('single notification marked read', readBody.data.read === true, readBody);

  const otherRead = await api(`/notifications/${target.id}/read`, { method: 'PATCH', token: meera.token });
  check("cannot mark someone else's notification read", otherRead.status === 404, otherRead);

  const { body: unreadOnly } = await api('/notifications?unread=1', { token: nikhil.token });
  check('unread filter excludes read rows', unreadOnly.data.every((n) => n.read === false), unreadOnly.data);
  check('unread filter is a strict subset', unreadOnly.data.length < selfNotes.data.length, {
    unread: unreadOnly.data.length,
    all: selfNotes.data.length,
  });

  const { body: allRead } = await api('/notifications/read-all', { method: 'PATCH', token: nikhil.token });
  check('mark-all-read reports the rows it changed', allRead.data.updated >= 1, allRead);
  const { body: finalNotes } = await api('/notifications', { token: nikhil.token });
  check('nothing is unread afterwards', finalNotes.unreadCount === 0, finalNotes.unreadCount);

  section('Pagination');
  await api('/notifications/read-all', { method: 'PATCH', token: nikhil.token });
  for (let i = 0; i < 4; i += 1) {
    await api(`/posts/${postId}/like`, { method: 'POST', token: meera.token });
    await api(`/posts/${postId}/like`, { method: 'POST', token: nikhil.token }); // toggle back
  }
  const { body: page1 } = await api('/notifications?limit=2', { token: nikhil.token });
  check('page size is respected', page1.data.length === 2, page1.data.length);
  check('hasMore is reported', page1.pagination.hasMore === true, page1.pagination);
  const { body: page2 } = await api(`/notifications?limit=2&cursor=${page1.pagination.nextCursor}`, { token: nikhil.token });
  const ids = new Set([...page1.data, ...page2.data].map((n) => n.id));
  check('pages do not overlap', ids.size === page1.data.length + page2.data.length);

  section('Pruning deleted posts');
  // Asserted as an invariant rather than a fixed count. The number of post-bound
  // rows legitimately changes with behaviour — per-comment notifications added
  // a row here — and a hardcoded total would silently start failing the next
  // time the notification model improves, or pass while pruning the wrong rows.
  const beforePruneRows = (await api('/notifications', { token: nikhil.token })).body.data;
  const beforePrune = beforePruneRows.length;
  const postBound = beforePruneRows.filter((n) => n.entity?.model === 'Post').length;
  const nonPostBound = beforePrune - postBound;

  await api(`/posts/${postId}`, { method: 'DELETE', token: nikhil.token });
  const { body: pruned } = await api('/notifications/cleared', { method: 'DELETE', token: nikhil.token });
  check('there were post-bound notifications to prune', postBound > 0, { postBound });
  check('every post-bound notification is pruned', pruned.data.removed === postBound, { expected: postBound, ...pruned });

  const { body: afterPrune } = await api('/notifications', { token: nikhil.token });
  check(
    'only the follow notification survives',
    afterPrune.data.length === nonPostBound && afterPrune.data.every((n) => n.type === 'follow'),
    afterPrune.data.map((n) => n.type),
  );
  check('pruning removed exactly the post-bound rows', beforePrune - afterPrune.data.length === pruned.data.removed);

  section('Auth and validation');
  const anon = await api('/notifications');
  check('401 without a token', anon.status === 401, anon);
  const bogus = await api('/notifications/not-an-id/read', { method: 'PATCH', token: nikhil.token });
  check('400 on a malformed id', bogus.status === 400, bogus);
  const missing = await api('/notifications/000000000000000000000000/read', { method: 'PATCH', token: nikhil.token });
  check('404 on an unknown id', missing.status === 404, missing);

  console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
  if (failures.length) {
    console.log('\x1b[31mFailures:\x1b[0m');
    for (const f of failures) console.log(`  - ${f}`);
  }
  await cleanup();
  process.exit(failed ? 1 : 0);
})().catch(async (err) => {
  // Without this a throw anywhere above skips the teardown and abandons the
  // run's accounts in the demo database, where they surface in search and
  // suggested-student lists. `smoke.js` guards its own run the same way.
  console.error('\nNotification smoke test crashed:', err);
  await cleanup();
  process.exit(1);
});
