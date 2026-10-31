#!/usr/bin/env bash
#
# Runs every suite against one isolated API instance.
#
# ── Why this exists ────────────────────────────────────────────────────────
#
# The suites used to be pointed at a developer's long-running dev server on
# :5050, which made them fail for reasons that had nothing to do with the code
# under test. They register accounts, and registration is rate limited per IP
# (30/hour by default) — so a handful of consecutive runs exhausts the bucket and
# every subsequent suite dies on the same opaque line:
#
#     TypeError: Cannot read properties of undefined (reading 'accessToken')
#
# which says nothing about rate limiting and invites a long hunt through the auth
# code for a bug that is not there. Observed directly during this work: three
# suites passing, then failing, then passing again with no code change between
# them, purely on whether the dev server had been restarted.
#
# The fix is the one the rate limiter itself is designed around: `NODE_ENV=test`
# disables the limiters, because a test suite issuing hundreds of unpaced
# requests from one address is indistinguishable from the flood they exist to
# stop. Nothing about production is weakened — the guard is `isTest`, which a
# `NODE_ENV=production` process cannot be.
#
# ── What it isolates ───────────────────────────────────────────────────────
#
#   • its own port (5096), so it never collides with a running dev server;
#   • its own database, dropped first, so a previous run's residue cannot mask a
#     regression;
#   • NODE_ENV=test, so no rate limiter, no request logging, and index
#     reconciliation in `sync` mode against a database that is disposable.
#
# Usage:
#   npm test                 # this runner — the default, and what CI should call
#   npm run test:isolated    # same thing, explicit
#   SUITE_PORT=5100 npm test # if 5096 is taken
set -uo pipefail

cd "$(dirname "$0")/../server"

PORT_NUM="${SUITE_PORT:-5096}"
DB="${SUITE_DB:-campusconnect_suite}"
MONGO_HOST="${MONGO_HOST:-mongodb://127.0.0.1:27017}"
BASE="http://localhost:$PORT_NUM/api"
LOG="/tmp/campusconnect-suite-$PORT_NUM.log"

cleanup() {
  kill "$(lsof -ti tcp:"$PORT_NUM")" 2>/dev/null || true
}
trap cleanup EXIT

echo "→ freeing :$PORT_NUM"
cleanup
sleep 1

echo "→ dropping $DB"
node -e "
const m = require('mongoose');
(async () => {
  await m.connect('$MONGO_HOST/$DB');
  await m.connection.dropDatabase();
  await m.disconnect();
})();
" || { echo "✖ could not reach MongoDB at $MONGO_HOST"; exit 1; }

echo "→ booting isolated instance (NODE_ENV=test, limiters off)"
# Exported, not just prefixed onto the boot command.
#
# Each suite calls `cleanupRun()` at the end, and `cleanup.js` resolves its
# connection from `process.env.MONGO_URI` with a fallback to
# `mongodb://127.0.0.1:27017/campusconnect` — the *dev* database. Setting
# MONGO_URI only for the server process leaves every suite's cleanup pointed at
# the developer's database instead of the disposable one, which both fails to
# clean the suite database and issues delete statements against real data.
export MONGO_URI="$MONGO_HOST/$DB"
export NODE_ENV=test
export ALLOW_LOCAL_STORAGE=true
# Upload URLs are minted from SERVER_URL, not from the request, so the stored
# `fileUrl` a client is handed back has to point at the port this instance is
# actually on. Left at its :5050 default, the suite uploads a file, then tries to
# fetch the returned URL, and gets ECONNREFUSED against a port nothing is
# listening on — reported as "uploaded file is retrievable" failing, which reads
# like a storage bug and is not one.
export SERVER_URL="http://localhost:$PORT_NUM"

PORT="$PORT_NUM" node src/server.js > "$LOG" 2>&1 &

# Wait for readiness rather than sleeping a fixed amount: a slow first-run index
# build is normal on a fresh database, and a fixed sleep is how you get a suite
# that fails once a week for no reason.
printf '→ waiting for readiness'
for _ in $(seq 1 60); do
  if curl -fsS "$BASE/health" > /dev/null 2>&1; then
    echo " ready"
    break
  fi
  printf '.'
  sleep 1
done

if ! curl -fsS "$BASE/health" > /dev/null 2>&1; then
  echo
  echo "✖ instance never became ready. Log:"
  cat "$LOG"
  exit 1
fi

# Suites, in the order they should run: the broadest coverage first, so a
# regression in the core surfaces before the narrower suites add noise.
SUITES=(
  "smoke.js"
  "smoke-notifications.js"
  "e2e-browser.js"
  "edge-cases.js"
  "test-messages.js"
  "test-events.js"
  "test-events-rsvp.js"
  "test-uploads.js"
)

failed=0
declare -a summary=()

for suite in "${SUITES[@]}"; do
  echo
  echo "───────────────────────────────────────── $suite"
  output="$(node "scripts/$suite" "$BASE" 2>&1)"
  status=$?
  # Strip ANSI colour so the tally is greppable in CI logs.
  plain="$(printf '%s' "$output" | sed 's/\x1b\[[0-9;]*m//g')"

  passed="$(printf '%s' "$plain" | grep -oE '[0-9]+ passed' | tail -1 | grep -oE '[0-9]+')"
  failures="$(printf '%s' "$plain" | grep -cE '^\s*(✗|✖)')"

  if [ "$status" -ne 0 ] || [ "$failures" -ne 0 ]; then
    failed=1
    printf '%s\n' "$plain" | grep -E '^\s*(✗|✖)|TypeError|Error:' | head -20
    summary+=("  ✗ $suite${passed:+  ($passed passed, $failures failed)}")
  else
    printf '%s\n' "$plain" | tail -4
    summary+=("  ✓ $suite${passed:+  ($passed passed)}")
  fi
done

echo "→ stopping instance"
kill "$(lsof -ti tcp:$PORT_NUM)" 2>/dev/null || true
sleep 2

# Suites that own their own server lifecycle. They cannot join the list above:
# `test-prod-gate.js` and `edge-infra.js` both bind the port under test and
# deliberately misconfigure the environment, which would fight the shared
# instance for it.
echo
echo "→ running the server-lifecycle suites"
for suite in "test-prod-gate.js" "edge-infra.js"; do
  echo
  echo "───────────────────────────────────────── $suite"
  output="$(node "scripts/$suite" 2>&1)"
  status=$?
  plain="$(printf '%s' "$output" | sed 's/\x1b\[[0-9;]*m//g')"

  passed="$(printf '%s' "$plain" | grep -oE '[0-9]+ passed' | tail -1 | grep -oE '[0-9]+')"
  failures="$(printf '%s' "$plain" | grep -cE '^\s*(✗|✖)')"

  if [ "$status" -ne 0 ] || [ "$failures" -ne 0 ]; then
    failed=1
    printf '%s\n' "$plain" | grep -E '^\s*(✗|✖)|TypeError|Error:' | head -20
    summary+=("  ✗ $suite${passed:+  ($passed passed, $failures failed)}")
  else
    printf '%s\n' "$plain" | tail -3
    summary+=("  ✓ $suite${passed:+  ($passed passed)}")
  fi
done

echo
echo "═════════════════════════════════════════"
for line in "${summary[@]}"; do echo "$line"; done
echo "═════════════════════════════════════════"

if [ "$failed" -ne 0 ]; then
  echo "SUITE FAILED"
  exit 1
fi
echo "All suites passed."
