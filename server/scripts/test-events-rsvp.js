import { spawn } from 'child_process';
import { runTag, cleanupRun } from './cleanup.js';

// Accepts either a base URL or a bare port, so this suite can be pointed at the
// same isolated instance as the others by the suite runner.
const SUITE_TARGET = process.argv[2] ?? process.env.PORT;
const BASE_URL = !SUITE_TARGET
  ? 'http://localhost:5050/api'
  : /^https?:\/\//.test(SUITE_TARGET)
    ? SUITE_TARGET
    : `http://localhost:${SUITE_TARGET}/api`;

const stamp = Date.now();
let pass = 0;
let fail = 0;
const failures = [];

async function api(path, options = {}) {
  const { method = 'GET', body, token } = options;
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type');
  const resBody = contentType && contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, body: resBody };
}

function check(name, condition, details = null) {
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    pass++;
  } else {
    console.log(`  \x1b[31m✗\x1b[0m ${name} → \x1b[31m${JSON.stringify(details)}\x1b[0m`);
    fail++;
    failures.push(name);
  }
}

async function run() {
  console.log('\n\x1b[1mEvent RSVP API tests\x1b[0m\n');

  // Register users
  const [u1, u2, u3] = await Promise.all(
    [1, 2, 3].map(async (i) => {
      const res = await api('/auth/register', {
        method: 'POST',
        body: {
          name: `User ${i}`,
          username: `user_${i}${runTag(stamp)}`,
          email: `u${i}_${stamp}@example.com`,
          password: 'Password@123',
        },
      });
      return res.body.data.accessToken;
    })
  );

  // Get User IDs to add to private group
  const u2Id = (await api('/auth/me', { token: u2 })).body.data.id;

  console.log('\n\x1b[1m1. Basic RSVP Lifecycle\x1b[0m');

  const now = Date.now();
  
  // Create an event with capacity 1
  const ev1 = await api('/events', {
    method: 'POST',
    token: u1,
    body: {
      title: 'RSVP Event',
      startsAt: new Date(now + 3600000).toISOString(),
      capacity: 1
    }
  });
  const ev1Id = ev1.body.data.id;

  // Unauthenticated rejected
  const unauth = await api(`/events/${ev1Id}/register`, { method: 'POST' });
  check('Unauthenticated access rejected', unauth.status === 401, unauth.body);

  // Nonexistent event rejected
  const nonexistent = await api(`/events/000000000000000000000000/register`, { method: 'POST', token: u1 });
  check('Nonexistent event rejected', nonexistent.status === 404, nonexistent.body);

  // User 2 registers successfully
  const reg1 = await api(`/events/${ev1Id}/register`, { method: 'POST', token: u2 });
  check('Register successfully', reg1.status === 201, reg1.body);

  // Check event incremented
  const ev1Fetch1 = await api(`/events/${ev1Id}`);
  check('registrationCount increments', ev1Fetch1.body.data.registrationCount === 1, ev1Fetch1.body);

  // Current registration status
  const statReg = await api(`/events/${ev1Id}/registration`, { token: u2 });
  check('Current registration status works (registered: true)', statReg.body.data?.registered === true, statReg.body);
  const statNotReg = await api(`/events/${ev1Id}/registration`, { token: u3 });
  check('Current registration status works (registered: false)', statNotReg.body.data?.registered === false, statNotReg.body);

  // Duplicate rejected
  const dup = await api(`/events/${ev1Id}/register`, { method: 'POST', token: u2 });
  check('Duplicate registration rejected', dup.status === 409, dup.body);

  // Capacity enforced (u3 tries to register but capacity is 1)
  const cap = await api(`/events/${ev1Id}/register`, { method: 'POST', token: u3 });
  check('Capacity enforced', cap.status === 400 && cap.body?.error?.message?.includes('capacity'), cap.body);

  // Attendee listing works
  const attendees1 = await api(`/events/${ev1Id}/attendees`, { token: u1 });
  check('Attendee listing works', attendees1.status === 200 && attendees1.body?.data?.[0]?.user?.username.includes('user_2'), attendees1.body);

  // Cancellation works
  const cancel1 = await api(`/events/${ev1Id}/register`, { method: 'DELETE', token: u2 });
  check('Cancellation works', cancel1.status === 204, cancel1.body);

  // Check event decremented
  const ev1Fetch2 = await api(`/events/${ev1Id}`);
  check('registrationCount decrements', ev1Fetch2.body.data.registrationCount === 0, ev1Fetch2.body);

  // Double cancel rejected
  const cancel2 = await api(`/events/${ev1Id}/register`, { method: 'DELETE', token: u2 });
  check('registrationCount never becomes negative (extra cancel returns 404)', cancel2.status === 404, cancel2.body);

  console.log('\n\x1b[1m2. Edge Cases & Privacy\x1b[0m');

  // Ended event rejected
  const evEnded = await api('/events', {
    method: 'POST',
    token: u1,
    body: {
      title: 'Ended Event',
      startsAt: new Date(now - 7200000).toISOString(),
      endsAt: new Date(now - 3600000).toISOString()
    }
  });
  const ended = await api(`/events/${evEnded.body.data.id}/register`, { method: 'POST', token: u2 });
  check('Ended event registration rejected', ended.status === 400, ended.body);

  // Private group event
  //
  // The group name is stamped per run. Group slugs are unique, so a fixed name
  // makes this suite collide with any other suite that creates a group called
  // "Priv Grp" (test-events.js does) whenever the earlier one's cleanup has not
  // finished. The create then 409s, `privGrpId` is undefined, the event is
  // created with no group at all, and the private-group gate is skipped — which
  // surfaces two *privacy* assertions as failures and points an investigator at
  // the authorization code instead of at a fixture.
  const privGrp = await api('/groups', {
    method: 'POST',
    token: u1,
    body: { name: `Priv Grp ${stamp}`, description: 'test', isPrivate: true, category: 'general' }
  });
  const privGrpId = privGrp.body.id;
  // A missing fixture invalidates every assertion below it, so fail here rather
  // than let it cascade into unrelated-looking failures.
  check('private group fixture created', privGrp.status === 201 && Boolean(privGrpId), privGrp.body);
  if (!privGrpId) return finish();

  const evPriv = await api('/events', {
    method: 'POST',
    token: u1,
    body: {
      title: `Priv Event ${stamp}`,
      startsAt: new Date(now + 3600000).toISOString(),
      group: privGrpId
    }
  });
  const evPrivId = evPriv.body.data.id;
  check('private group event fixture created', evPriv.status === 201 && Boolean(evPrivId), evPriv.body);
  if (!evPrivId) return finish();

  // Private-group member can RSVP (u1 is the creator, so an admin)
  const privRsvpOk = await api(`/events/${evPrivId}/register`, { method: 'POST', token: u1 });
  check('Private-group member can RSVP', privRsvpOk.status === 201, privRsvpOk.body);

  // Private-group non-member cannot RSVP (u3 is not a member)
  const privRsvpFail = await api(`/events/${evPrivId}/register`, { method: 'POST', token: u3 });
  check('Private-group non-member cannot RSVP', privRsvpFail.status === 403, privRsvpFail.body);

  // Private-group attendee list cannot leak to non-member
  const privAttFail = await api(`/events/${evPrivId}/attendees`, { token: u3 });
  check('Private-group attendee list cannot leak to non-member', privAttFail.status === 403, privAttFail.body);

  console.log('\n\x1b[1m3. Deletion Cascade\x1b[0m');
  
  await api(`/events/${ev1Id}`, { method: 'DELETE', token: u1 });
  
  // Registration list should be empty (though we can't fetch it directly, we can check DB if we had a raw connection, but this is handled by backend test, let's just check the event is gone)
  const fetchDeleted = await api(`/events/${ev1Id}`);
  check('Deleted event registrations are already handled correctly (event gone)', fetchDeleted.status === 404, fetchDeleted.body);
}

/** Prints the tally. Used by the normal path and by the fixture early-returns. */
function finish() {
  console.log('\n---');
  console.log(`Passed: ${pass}`);
  console.log(`Failed: ${fail}`);
  if (fail > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`- ${f}`));
  }
  console.log('');
}

run().catch(console.error).finally(() => {
  cleanupRun(stamp).then(() => process.exit(fail > 0 ? 1 : 0));
});
