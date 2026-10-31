#!/usr/bin/env bash
#
# Real-user end-to-end run against a genuinely empty database.
#
# Owns the database reset and the server lifecycle, which is the part that
# matters. A server left running across a database drop keeps the models it
# registered at boot, so the unique indexes are never rebuilt — and a database
# without them accepts duplicate follows, which inflates follower counters and
# sends the target a duplicate notification. That failure looks exactly like an
# application bug, and it cost an hour of chasing one once already. Dropping
# first and *then* booting sidesteps it entirely.
#
# Usage: npm run test:empty-db
set -euo pipefail

cd "$(dirname "$0")/../server"

DB="${E2E_DB:-campusconnect_e2e}"
PORT_NUM="${E2E_PORT:-5099}"
MONGO_HOST="${MONGO_HOST:-mongodb://127.0.0.1:27017}"

echo "→ stopping any instance on :$PORT_NUM"
kill "$(lsof -ti tcp:$PORT_NUM)" 2>/dev/null || true
sleep 2

echo "→ dropping $DB"
node -e "
const m = require('mongoose');
(async () => {
  await m.connect('$MONGO_HOST/$DB');
  await m.connection.dropDatabase();
  await m.disconnect();
})();
"

echo "→ booting a fresh instance (indexes are synced at startup)"
# NODE_ENV=test matters here. The rate limiters are keyed off it
# (server/src/middleware/rateLimit.js), so with NODE_ENV left at its
# `development` default this run is throttled mid-journey — and a journey that
# dies on a 429 looks exactly like an application bug. A suite must not be
# able to fail because it sent N requests in N seconds.
#
# Exported rather than prefixed onto the boot command, so smoke-empty-db.js and
# its cleanup resolve the same database rather than falling back elsewhere.
export NODE_ENV=test
export MONGO_URI="$MONGO_HOST/$DB"
export ALLOW_LOCAL_STORAGE=true
export SERVER_URL="http://localhost:$PORT_NUM"
PORT=$PORT_NUM nohup node src/server.js > /tmp/cc-e2e.log 2>&1 &

# Poll /health instead of sleeping a fixed four seconds. Index creation on an
# empty database is I/O-bound and its duration varies with disk and cache state,
# so any fixed wait is either too short on a slow machine or wasted on a fast
# one. This waits exactly as long as boot takes and no longer.
echo "→ waiting for /health"
READY=0
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:$PORT_NUM/api/health" > /dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "$READY" -ne 1 ] || ! grep -q "MongoDB connected" /tmp/cc-e2e.log; then
  echo "✖ server failed to boot:"
  cat /tmp/cc-e2e.log
  exit 1
fi
grep -E "indexes" /tmp/cc-e2e.log || true

echo "→ running the journey"
set +e
node scripts/smoke-empty-db.js "http://localhost:$PORT_NUM/api"
STATUS=$?
set -e

echo "→ stopping instance"
kill "$(lsof -ti tcp:$PORT_NUM)" 2>/dev/null || true

exit $STATUS
