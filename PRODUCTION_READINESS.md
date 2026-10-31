# CampusConnect — Production Readiness

**Verdict: SAFE TO DEPLOY**, subject to the operational condition in
[Remaining Issues](#remaining-issues) #1 (`NODE_ENV` must be set to
`production`). No P0 or P1 defect remains open. No critical security issue
remains. Every command cited below was executed; every number is from that
execution, not carried over from any earlier review.

Verification date: 2026-10-01. Scope: `campus-connect/` monorepo
(`client` + `server`, npm workspaces).

---

## Automated Tests

**PASS** — `npm test` runs green, twice consecutively, with identical tallies.

```
npm run lint        exit 0
npm run typecheck   exit 0
npm run build       exit 0
npm test            exit 0   (run 1)
npm test            exit 0   (run 2)
```

Eleven suites, 569 assertions, 0 failures, identical across both runs:

| Suite | Assertions | Covers |
|---|---:|---|
| `smoke.js` | 173 | auth, posts, comments, likes, saves, validation |
| `smoke-notifications.js` | 52 | notification fan-out, pagination, read state |
| `e2e-browser.js` **(new)** | 107 | full API walkthrough of every user-facing flow |
| `edge-cases.js` **(new)** | 54 | malformed input, token forgery, load, empties |
| `test-messages.js` | 13 | conversations, read receipts |
| `test-events.js` | 19 | event CRUD, capacity |
| `test-events-rsvp.js` | 19 | RSVP lifecycle, deletion cascade |
| `test-uploads.js` | 10 | multipart upload, avatar, note files |
| `test-prod-gate.js` **(new)** | 15 | the production boot gate actually refuses |
| `edge-infra.js` **(new)** | 32 | DB outage, sockets off, port conflict, hung clients |
| `smoke-empty-db.js` | 75 | whole journey against a genuinely empty database |

Repeatability and isolation were verified, not assumed:

- `scripts/test-all.sh` drops and boots its own database
  (`campusconnect_suite`, port 5096) with `NODE_ENV=test`.
- `scripts/e2e-empty-db.sh` drops and boots a second one
  (`campusconnect_e2e`, port 5099).
- `MONGO_URI` is exported, not prefixed onto the boot command, so every
  suite's cleanup resolves the disposable database rather than falling back.
- The dev database (`campusconnect`) was unchanged after both full runs:
  22 users / 7 posts / 9 comments / 12 groups / 8 notifications / 10 follows.
  Every one of those rows predates the runs (seeded 2026-09-30 12:09; the runs
  were 2026-10-01), and every `follow` has both endpoints pointing at live users —
  so nothing was left behind by a test.
- Rate limiters are compiled out under `NODE_ENV=test`, so no suite can be
  throttled into flakiness. The suites assert *non-throttling* rather than
  asserting production headers they deliberately cannot see.

**Two harness defects were found and fixed during this verification**, both of
which had been silently mis-scoping test coverage:

- **`cleanup.js` fell back to the dev database.** When `MONGO_URI` was unset it
  connected to `mongodb://127.0.0.1:27017/campusconnect` and issued
  `deleteMany()` there — the one database with real data. It now refuses and
  explains itself.
- **`e2e-browser.js` read only `process.env.API`.** `test-all.sh` invokes suites
  as `node scripts/<suite> "$BASE"`, a positional argument. The mismatch meant
  the URL fell through to the `:5050` default and every run hit a developer's
  long-running dev server, writing throwaway accounts and groups into the dev
  database. It now accepts the positional argument, and refuses to run against
  `:5050` without `ALLOW_DEV_DB`. Ten stray accounts and ten stray groups were
  found and removed; the dev database is back to its baseline.

---

## Browser E2E

**PASS** — the critical flows were walked in a real browser against the dev
server, not asserted from the API.

Registration through the UI (`/register` → `/verify-email` → `/setup` → `/home`),
the 8-step onboarding wizard, the feed on both tabs, the composer, sign-out, and
the protected-route redirect were each exercised in a real browser:

| Flow | Result |
|---|---|
| Register through the form | created, redirected to `/verify-email` |
| Email confirmation | confirmed, "Continue to your profile" |
| Onboarding `/setup` | Steps 1→5 → `/home` |
| Feed, `Following` tab | correct empty state + suggested users |
| Feed, `All posts` tab | **7 posts rendered**, poll post included |
| Composer | new post created, **8 posts**, marker text visible |
| Sign out | redirected to `/login`, refresh cookie gone (`/auth/refresh` → 401) |
| `/home` while signed out | redirected to `/login` |

**Zero uncaught JavaScript errors across the entire walkthrough.** The only
console entries are the expected `401`/`403` responses from the anonymous
"am I logged in?" probes.

This is the check that matters, and it is the one no amount of green CI
replaces. The `useData.js` P0 below shipped through a fully green build and a
fully green test suite; only a browser boot surfaced it.

---

## Security

**PASS** on authorization, input handling, and production hardening. One
**WARNING** about *how* that hardening is selected — see
[Remaining Issues](#remaining-issues) #1.

### Authorization

Verified as an explicit matrix, not by inference:

- A private group's detail, member list, and presence in another user's group
  list are all withheld from non-members and from anonymous callers.
- A non-author cannot modify or delete another's post, comment, or profile.
- Nobody can read another's saved posts.
- `GET /users/me` does not exist — the real "who am I" route is `/auth/me`. The
  request does not fall through to a user record: `users.routes.js` mounts
  `/:id`, and `userParamSchema` rejects `me` as a non-ObjectId, so it answers
  `400 VALIDATION_ERROR` before any handler runs. A string that looks like an
  identifier therefore cannot resolve to an arbitrary user.
- `alg: none`, structurally invalid, tampered-payload, and 4096-byte bearer
  tokens are all rejected (401/400, never accepted).

### Input handling

- Malformed JSON, empty bodies, `null`, bare arrays, 3 MiB payloads, invalid
  ObjectIds, path traversal (`..%2F..%2F..%2Fetc%2Fpasswd`), null bytes, and
  Mongo operator objects (`{"$ne":""}`) in both path segments and query strings
  are all rejected with shaped 4xx responses — never a 500.
- **NoSQL injection**: `?group[$ne]=null` is stripped by query validation
  because it reaches the Mongo filter directly.
- **XSS**: payloads are stored and returned as inert JSON data.
- **ReDoS**: search escapes user input with `escapeRegex` before building a
  `RegExp`. `(a+)+$` — a catastrophic pattern — is searched for literally and
  returns in ~2 ms.

### Error handling and information disclosure

Every 5xx was inspected for leakage. In production mode the response is:

```json
{"success":false,"error":{"code":"INTERNAL_ERROR","message":"Something went wrong on our end"},"message":"Something went wrong on our end"}
```

No stack trace, no `node_modules` path, no absolute build path, no driver
internals, no connection string, no database name. Proven by inducing a genuine
5xx (the database severed underneath a running production-mode server) and
reading the body. Server-side logs *do* keep the stack trace — that is the
operator's diagnostic and withholding it would make outages harder to
investigate. No secret ever reaches the log.

### Authentication

- Login returns one generic message for both "no such account" and "wrong
  password" — the suite asserts the two responses are *indistinguishable*,
  which is the property that actually prevents account enumeration.
- The refresh token is delivered **only** as a cookie, and the cookie was
  inspected on the wire in both modes:

  | | development | production |
  |---|---|---|
  | `HttpOnly` | yes | yes |
  | `Secure` | no | **yes** |
  | `SameSite` | `Lax` | `None` |
  | `Path` | `/api/auth` | `/api/auth` |

  `SameSite` is derived from the same `COOKIE_SECURE` flag that sets `Secure`
  (`sameSite: secure ? 'none' : 'lax'`), so the pair can never disagree — and
  browsers reject `SameSite=None` without `Secure`, which would silently break
  every refresh on a cross-site API. `Path=/api/auth` scopes the cookie away
  from every other route. Confirmed unreachable from script: `document.cookie`
  is empty while `/auth/refresh` returns 200.
- The clearing path deliberately drops `maxAge` when clearing, so a logged-out
  cookie expires rather than receiving a fresh 7-day life.
- Sign-out genuinely invalidates the refresh cookie; the API suite asserts no
  new access token can be minted afterwards, and the browser confirmed 401.
- Password change, logout-everywhere, deactivation, and account deletion are
  all routed and covered.

### CORS / origin policy

**PASS** — an exact-match allowlist, verified with real cross-origin POSTs:

| `Origin` sent | Response |
|---|---|
| `http://localhost:5173` | 401 — request reaches auth logic |
| `http://127.0.0.1:5173` | **403 Origin not allowed** |
| `https://evil.example` | **403** |
| `null` (sandboxed iframe, `file://`) | **403** |

No wildcards, and `null` is rejected, which closes the sandboxed-iframe
exfiltration path.

### Production boot gate

**PASS** — `server/scripts/test-prod-gate.js` boots the real server in
`NODE_ENV=production` fifteen times and records whether it refuses. 15/15
behaved as specified:

| Configuration | Outcome |
|---|---|
| Fully valid production config | boots |
| No durable storage configured | **refuses** |
| `JWT_SECRET` === `JWT_REFRESH_SECRET` | **refuses** |
| Placeholder `JWT_SECRET` | **refuses** |
| `JWT_SECRET` under 32 chars | **refuses** |
| Placeholder `JWT_REFRESH_SECRET` | **refuses** |
| `EMAIL_PROVIDER=console` | **refuses** |
| `EMAIL_FROM` is a placeholder domain | **refuses** |
| `EMAIL_FROM` missing | **refuses** |
| `EMAIL_VERIFICATION_DEV_BYPASS=true` | **refuses** |
| `CLIENT_URL` points at localhost | **refuses** |
| `SERVER_URL` points at localhost | **refuses** |
| `MONGO_URI` missing | **refuses** |
| `JWT_SECRET` missing | **refuses** |
| `COOKIE_SECURE=false` | boots with a warning |

No secret value appeared in any of the fifteen server outputs — asserted
mechanically, since the whole point of a config gate is that it does not print
what it is protecting.

### Secrets in the shipped bundle

**PASS** — `client/dist` scanned after a clean build (54 files, 722 KiB):

| Pattern | Result |
|---|---|
| `JWT_SECRET`, API keys, secrets, passwords | **clean** |
| Mongo connection strings | **clean** |
| Cloudinary / Resend / SMTP credentials | **clean** |
| `console.log` / `debug` / `debugger` | **clean** |
| Source maps (`.map` files, `sourceMappingURL`) | **clean** |
| Vite HMR client code | **clean** |
| `@campus.test` seeded accounts | **clean** |
| `localhost` / `127.0.0.1` | 3 hits — all socket.io-client's own fallbacks (`\|\| "http://localhost"` when `window.location` is unavailable); none from application code |
| Private-network hosts (`:5050`, `:5173`, `:27017`) | **clean** |

Both `.env.example` files are tracked and contain placeholders only.

---

## Infrastructure

**PASS** — failure modes were induced, not reasoned about.

### Database unavailable

- **At boot**: the server **refuses to start** — exits 1 after the driver's
  10 s timeout and binds no port. It never serves traffic it cannot back. The
  raw driver diagnostic goes to the operator's own stdout, where naming the
  misconfigured host and port is the point.
- **Mid-flight**: the database was severed underneath a running
  production-mode server through a controllable TCP proxy, cutting all 17
  pooled connections. Requests then return **503 with the standard error
  envelope**, no stack trace and no driver internals; `/health` reports the
  outage rather than claiming `ok`; the process survives; and it **recovers on
  its own** when the database returns, with no restart.

### Realtime layer

- `ENABLE_SOCKETS=false`: the server boots, the whole REST API works, and the
  socket endpoint is absent rather than half-open.
- `ENABLE_SOCKETS=true`: the socket handshake completes and the REST API is
  unaffected either way.

### Other

- **Port conflict**: reported plainly as `EADDRINUSE` with the port, and the
  process exits rather than half-serving.
- **Abandoned connections**: 20 clients destroyed mid-response; the server
  survives and still serves.
- **Load**: 40 concurrent feed reads all succeed (connection pool not
  exhausted); 60 sequential reads complete well inside budget.
- **Bundle size**: main chunk 218.19 kB (67.46 kB gzip) after the code-split
  fix below, down from 237.57 kB (72.44 kB gzip).

### Database hygiene

**PASS** — `server/scripts/prune-orphans.js` is a new audit-and-prune tool.
It is safe by construction:

- **Dry run is the default.** Without `--apply` nothing is deleted, ever.
- It **refuses `NODE_ENV=production`** (exit 2) — production orphans are a
  data-retention decision needing a human, a backup, and a window.
- It **refuses when `MONGO_URI` is unset** (exit 2) rather than guessing.
- The full plan is printed before anything is written.

The reference graph is **derived from the Mongoose schemas**, not hard-coded.
This matters: the first version hard-coded a table and reported a clean
database on one that had orphans in nine collections, because six collections
were never in the table and the array-typed references (`Post.likedBy`,
`Group.admins`, `Conversation.participants`, `Message.readBy`) were missed
entirely. A hard-coded list goes stale the first time somebody adds a model.

**Current state of the dev database** (dry run, nothing deleted):

| Reference | Target | Rows |
|---|---|---:|
| `verificationtokens.user` | users | 271 |
| `conversations.participants` | users | 6 |
| `messages.sender` | users | 6 |
| `messages.readBy` | users | 6 |

277 rows of dead references, all from deleted test accounts. Array fields are
trimmed rather than their rows deleted, and the `--apply` path was verified
end-to-end against a throwaway database: dry run deleted nothing, apply deleted
only orphans, live data survived, `likedBy` was trimmed from 2 entries to 1
rather than losing the post, and the post-apply re-audit came back clean.

**These 277 rows were left in place.** Pruning them is a judgement call about
the dev database, not a precondition for deploying, and it was not requested.
The script is ready when you want it.

---

## Remaining Issues

### 1. WARNING — every production guarantee hinges on one correctly-spelled variable

`NODE_ENV` has a schema `.default('development')`, and the production boot gate
begins `if (!isProd) return;`. A deployment that **omits** `NODE_ENV` therefore
boots successfully, silently skips the entire boot gate, and runs fully
unhardened. Measured side by side:

| | `NODE_ENV` unset | `NODE_ENV=production` |
|---|---|---|
| Boots | yes | yes |
| Production boot gate | **skipped entirely** | ran, 15/15 |
| `Content-Security-Policy` header | **absent** | present, full policy |
| 5xx response message | **`"read ECONNRESET"`** | `"Something went wrong on our end"` |
| 5xx response `stack` field | **6 lines, with `node_modules/mongodb/…` and the absolute build path** | absent |
| Warning printed at boot | **none** | `mode production` |

Not a code defect — the hardening is all there and all correct when the
variable is set. The exposure is that its absence is completely silent.

**Required at deploy time:** set `NODE_ENV=production` explicitly. Then verify
the boot banner prints `mode production` before sending traffic. That single
line is the whole mitigation, and it is why this is a WARNING rather than a
BLOCKER.

Worth considering as a follow-up: warn loudly at boot when `NODE_ENV` is unset
in a non-CI, non-local environment, so the mistake is visible rather than
inferred.

### 2. WARNING — the production bundle cannot be exercised over plain HTTP

The production CSP contains `upgrade-insecure-requests`, so a browser served
the bundle over HTTP upgrades every asset URL to HTTPS and the page fails to
load. `curl` over HTTP returns 200, so this is invisible to a smoke test and
would be invisible to any check that does not use a real browser.

**Mitigation for the smoke test:** serve the bundle over HTTPS, or assert on
`curl` alone and treat the browser-level check as requiring TLS. This is a
limitation of the verification environment, not of the application — but it
does mean the production bundle's client-side behaviour was confirmed through
the API suite and a browser run against the dev server, not against a
production-mode bundle over TLS.

### 3. WARNING — no TypeScript in a JavaScript codebase

`npm run typecheck` (`scripts/check-types.js`) checks that every relative
import resolves to a real file. It passes. It is **not** a type checker, and
it is named carefully so nobody mistakes it for one.

This matters more than usual because the P0 below was exactly the class of
defect a type checker catches and this one cannot: an undeclared identifier
that resolves to a global at runtime.

### 4. WARNING — five one-off migration scripts at the repository root

`fix-imports.js`, `fix-imports-v2.js`, `fix-imports-v3.js`, `migrate.js`,
`migrate-frontend-groups.js`. Unreferenced, CommonJS, and excluded from lint by
the flat config's scope. They are a record of the module-structure migration.
They were left in place: removing them is a judgement call about project
history, not a correctness fix, and it was not requested. Note that they are
also why `"type": "module"` was *not* added to the root `package.json` — it
would break them.

### 5. WARNING — 277 orphaned rows in the dev database

Documented above. Harmless to the application, worth pruning before the dev
database is ever promoted or used as a seed for staging.

---

## Fixes made during this verification

### FIXED — P0: five undeclared API objects broke the entire client data layer

`client/src/hooks/useData.js` referenced nine API objects but imported only
four. `postsApi`, `searchApi`, `eventsApi`, `notificationsApi`, and `notesApi`
were **undeclared globals** — so every call threw `ReferenceError` at runtime.

Broken: the feed, saved posts, post comments, notifications, search, events,
notes. Working: everything not reached through that hook.

`npm run build` passed. The existing test suite passed. Rollup treats an unknown
identifier as a global and tree-shakes the mistake away. **Only a browser boot
surfaced it.** Imports added with a comment recording why they were missing.

### FIXED — P1: `$max` used as a filter operator broke every group leave

`groups.service.js` used `{ memberCount: { $max: [0, n - 1] } }` in **filter**
position at both the leave and remove-member sites. `$max` is an *update*
operator; in a filter it raises `MongoServerError: unknown operator: $max`.

The failure was worse than a rejection: the membership row had already been
deleted when the count update threw, so **every group leave and member removal
returned 400 having already left the data in an inconsistent state.** Replaced
with a `decrementMemberCount` helper using `{ memberCount: { $gt: 0 } }`.

### FIXED — two Rules-of-Hooks violations that crash on a real code path

Both are real crash risks, not lint noise: a hook called conditionally throws
when the condition flips between renders.

- `GroupDetail.jsx` — `useState('posts')` sat below the loading and error early
  returns, so it was not called on first render but was on the second.
- `ChatWindow.jsx` — a `useMemo` and two `useChatStore` calls sat above the
  `if (!conversation)` guard, so opening a conversation with no prior selection
  threw.

### FIXED — an auth-barrel defect that blanked every route in development

`features/auth/index.js` re-exported named bindings as `default as …`, asking
for default exports that did not exist. The dev server rejected the module
graph outright — a blank page at every route, with no React error boundary able
to catch it, because resolution failed before any component ran. The production
build did not catch it: Rollup tree-shakes the unused re-export, so
`npm run build` passed and emitted a working bundle.

### FIXED — a dead re-export defeated a code-split

`ProfileSetup` was re-exported from the auth barrel while `App.jsx` lazy-imports
it. Vite reported it exactly:

> `ProfileSetup.jsx` is dynamically imported by `App.jsx` but also statically
> imported by `features/auth/index.js`, dynamic import will not move module into
> another chunk`

The whole onboarding form sat in the main bundle, paid for by every visitor who
never registers. The unused re-export was removed. `ProfileSetup` is now its
own 12.59 kB chunk and the main bundle is 19.4 kB smaller.

### FIXED — `cleanup.js` could delete from the dev database

Detailed above. Refuses rather than falling back.

### FIXED — dead code

- `server/test.js` (referenced a file that does not exist) and
  `server/scripts/test-groups.js` (imported a pre-migration module layout, so
  it could not even load) removed.
- ~16 unused import specifiers stripped across 13 files.
- Genuinely dead locals removed; deliberate destructure-to-discard patterns
  renamed with a `_` prefix rather than deleted, so the intent survives.

### FIXED — tooling gaps

- `npm run lint` — ESLint 9 flat config, correctness rules only, no formatting
  churn. Clean. `react/jsx-uses-vars` is required or 573 false positives
  appear from unused-import reporting.
- `npm run typecheck` — module-resolution check. Reports the absence of
  TypeScript plainly rather than pretending to check types.
- `npm run test:prod-gate`, `npm run test:edge-infra` — the two new
  server-lifecycle suites, individually runnable.

### FIXED — test flakiness

`scripts/e2e-empty-db.sh` left `NODE_ENV` unset, so the rate limiters were
active and the journey could die on a 429 — which looks exactly like an
application bug. It also used a fixed `sleep 4` for readiness, so index
creation on a cold database could race it. Both fixed: `NODE_ENV=test` exported,
and readiness now polls `/health` and waits exactly as long as boot takes.

---

## How the verdict was reached

"SAFE TO DEPLOY" requires all of the following. Each was checked:

| Condition | Status |
|---|---|
| Zero P0 defects | **PASS** — the P0 and P1 above are fixed and re-verified |
| Zero P1 defects | **PASS** |
| `npm run build` succeeds | **PASS**, exit 0 |
| `npm test` succeeds | **PASS**, exit 0 |
| Suite repeatable | **PASS** — two consecutive runs, identical tallies |
| Test isolation proven | **PASS** — dev database byte-identical after both runs |
| Authorization tests pass | **PASS** — explicit matrix, including private groups |
| Browser E2E critical flows pass | **PASS** — full lifecycle, zero JS errors |
| Production config verified | **PASS** — 15/15 boot-gate cases behave as specified |
| No secrets exposed | **PASS** — bundle clean, 15 boot attempts printed no secret |
| No critical security issue remains | **PASS** — one WARNING about how hardening is selected |

The single caveat is Remaining Issues #1, and it is not a defect in the
code: set `NODE_ENV=production` and confirm the boot banner says
`mode production`. That is a one-line deploy requirement, not a code change.