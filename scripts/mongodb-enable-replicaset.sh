#!/usr/bin/env bash
# Enables a single-node replica set ("rs0") on your INSTALLED MongoDB — no Docker.
# Your existing data directory and records are kept exactly as they are.
#
# Usage (macOS/Linux):
#   sudo bash scripts/mongodb-enable-replicaset.sh [port]
set -euo pipefail

PORT="${1:-27017}"
SET_NAME="rs0"
CONFIG=""
for candidate in /etc/mongod.conf /usr/local/etc/mongod.conf /opt/homebrew/etc/mongod.conf; do
  if [ -f "$candidate" ]; then CONFIG="$candidate"; break; fi
done

say() { printf '%s\n' "$*"; }

if [ -z "$CONFIG" ]; then
  say "ERROR: mongod.conf not found in the usual places."
  say "Edit your config by hand (add the replication block shown in DATABASE.md) and rerun."
  exit 1
fi
say "Using config: $CONFIG"

if grep -q "replSetName" "$CONFIG"; then
  say "replication.replSetName is already set in the config; leaving it unchanged."
else
  cp "$CONFIG" "$CONFIG.bak"
  say "Backed up config to $CONFIG.bak"
  printf '\n# Single-node replica set so the app can use MongoDB transactions.\nreplication:\n  replSetName: %s\n' "$SET_NAME" >>"$CONFIG"
  say "Added replication.replSetName=$SET_NAME"
fi

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files mongod.service >/dev/null 2>&1; then
  say "Restarting mongod service..."
  systemctl restart mongod
elif command -v brew >/dev/null 2>&1; then
  say "Restarting via Homebrew..."
  brew services restart mongodb-community 2>/dev/null || brew services restart mongodb-community@7.0 2>/dev/null || true
else
  say "No service manager detected. Stop mongod and start it again with the SAME --dbpath plus --replSet $SET_NAME"
fi

say "Waiting for MongoDB on 127.0.0.1:$PORT ..."
for _ in $(seq 1 40); do
  if mongosh "mongodb://127.0.0.1:$PORT" --quiet --eval "db.adminCommand({hello:1}).ok" >/dev/null 2>&1; then break; fi
  sleep 0.5
done

HELLO=$(mongosh "mongodb://127.0.0.1:$PORT" --quiet --eval "print(db.adminCommand({hello:1}).setName || 'STANDALONE')" | tr -d '[:space:]')
if [ "$HELLO" = "$SET_NAME" ]; then
  say "Already a replica set (setName='$HELLO'); nothing to initialize."
elif [ "$HELLO" != "STANDALONE" ]; then
  say "This server belongs to a DIFFERENT replica set ('$HELLO')."
  say "Keep it and point MONGODB_URI at it with replicaSet=$HELLO, or reconfigure it as $SET_NAME."
  exit 1
else
  say "Initializing the replica set (existing data is kept)..."
  mongosh "mongodb://127.0.0.1:$PORT" --quiet --eval "printjson(db.adminCommand({replSetInitiate:{_id:'$SET_NAME',members:[{_id:0,host:'127.0.0.1:$PORT'}]}}))" >/dev/null
  HELLO=""
  for _ in $(seq 1 40); do
    HELLO=$(mongosh "mongodb://127.0.0.1:$PORT/?replicaSet=$SET_NAME&directConnection=true" --quiet --eval "const h=db.adminCommand({hello:1}); print((h.setName||'')+' '+(h.isWritablePrimary||h.ismaster))" | tr -d '[:space:]')
    case "$HELLO" in
    "$SET_NAME"True* | "$SET_NAME"true*) break ;;
    esac
    sleep 0.5
  done
fi

case "$HELLO" in
"$SET_NAME"True* | "$SET_NAME"true* | "$SET_NAME")
  say ""
  say "Done: '$SET_NAME' is a writable single-node replica set on 127.0.0.1:$PORT."
  say "Your existing data was kept. Keep the default MONGODB_URI in .env.local and run: npm run dev"
  ;;
*)
  say "The replica set did not become PRIMARY in time. Inspect with: mongosh --eval 'rs.status()'"
  exit 1
  ;;
esac
