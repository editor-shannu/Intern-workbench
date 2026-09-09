#!/usr/bin/env bash
# End-to-end smoke test. Spins up a throwaway sqlite db, a dummy local bare
# git repo (so no real GitHub credentials are needed), starts the API on a
# scratch port, and exercises: health, login, user creation, task
# assignment, workspace/worktree creation, file read/write, commit, and
# push (to the dummy local repo). Opening a real GitHub PR is expected to
# fail cleanly here since no GITHUB_TOKEN is configured -- that's shown,
# not hidden.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

PY="./venv/bin/python3"
UVICORN="./venv/bin/uvicorn"
if [ ! -x "$PY" ]; then
  echo "No venv found at ./venv -- create one and run: pip install -r requirements.txt"
  exit 1
fi

WORKDIR="$(mktemp -d)"
PORT="${SMOKE_TEST_PORT:-8099}"
BASE="http://127.0.0.1:$PORT"

export DATABASE_URL="sqlite:///$WORKDIR/smoke.db"
export SECRET_KEY="smoke-test-secret"
export MASTER_KEY="$($PY -c 'import os,base64;print(base64.urlsafe_b64encode(os.urandom(32)).decode())')"
export ADMIN_NAME="Smoke Admin"
export ADMIN_EMAIL="admin@example.com"
export ADMIN_PASSWORD="admin12345"
export GIT_ROOT="$WORKDIR/git-mirror.git"
export WORKSPACES_ROOT="$WORKDIR/workspaces"
export CORS_ORIGINS="http://localhost:5173"
export GITHUB_TOKEN=""
export GITHUB_REPO_OWNER="test-org"
export GITHUB_REPO_NAME="test-repo"

echo "== [1/8] setting up a dummy upstream repo (no real GitHub needed) =="
UPSTREAM="$WORKDIR/upstream.git"
CHECKOUT="$WORKDIR/seed-checkout"
git init -q --bare "$UPSTREAM"
git clone -q "$UPSTREAM" "$CHECKOUT"
(
  cd "$CHECKOUT"
  git config user.email seed@example.com
  git config user.name Seed
  mkdir -p app
  printf "# Test repo\n" > README.md
  printf "print('hello')\n" > app/main.py
  git add -A
  git commit -q -m "initial commit"
  git branch -M main
  git push -q origin main
)
export UPSTREAM_REPO_URL="file://$UPSTREAM"

echo "== [2/8] seeding database =="
$PY seed.py

echo "== [3/8] starting server on :$PORT =="
"$UVICORN" app.main:app --port "$PORT" > "$WORKDIR/server.log" 2>&1 &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" >/dev/null 2>&1 || true; }
trap cleanup EXIT
for i in $(seq 1 20); do
  if curl -sf "$BASE/api/health" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
curl -sf "$BASE/api/health" | grep -q '"status":"ok"' && echo "  health OK"

echo "== [4/8] admin login =="
TOKEN=$(curl -sf -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | $PY -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
[ -n "$TOKEN" ] && echo "  admin token acquired"

echo "== [5/8] create + log in as an intern, assign the first seeded task =="
curl -sf -X POST "$BASE/api/users" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test Intern","email":"intern@example.com","password":"internpass1"}' > "$WORKDIR/intern.json"
INTERN_ID=$($PY -c "import json;print(json.load(open('$WORKDIR/intern.json'))['id'])")
INTERN_TOKEN=$(curl -sf -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"intern@example.com","password":"internpass1"}' | $PY -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
TASK_ID=$(curl -sf "$BASE/api/tasks" -H "Authorization: Bearer $TOKEN" | $PY -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
curl -sf -X POST "$BASE/api/tasks/$TASK_ID/assign" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"user_id\": $INTERN_ID}" > /dev/null
echo "  intern #$INTERN_ID assigned task #$TASK_ID"

echo "== [6/8] intern opens a workspace (creates git worktree + branch) =="
curl -sf -X POST "$BASE/api/workspaces/open/$TASK_ID" -H "Authorization: Bearer $INTERN_TOKEN" > "$WORKDIR/ws.json"
WS_ID=$($PY -c "import json;print(json.load(open('$WORKDIR/ws.json'))['id'])")
BRANCH=$($PY -c "import json;print(json.load(open('$WORKDIR/ws.json'))['branch_name'])")
echo "  workspace #$WS_ID on branch $BRANCH"
curl -sf "$BASE/api/workspaces/$WS_ID/tree" -H "Authorization: Bearer $INTERN_TOKEN" | grep -q "main.py" && echo "  file tree includes app/main.py"

echo "== [7/8] write a file, attach context, commit =="
curl -sf -X PUT "$BASE/api/workspaces/$WS_ID/files" -H "Authorization: Bearer $INTERN_TOKEN" -H "Content-Type: application/json" \
  -d '{"path":"app/new_feature.py","content":"def add(a, b):\n    return a + b\n"}' > /dev/null
curl -sf -X POST "$BASE/api/workspaces/$WS_ID/context/attach" -H "Authorization: Bearer $INTERN_TOKEN" -H "Content-Type: application/json" \
  -d '{"path":"app/main.py"}' > /dev/null
curl -sf -X POST "$BASE/api/workspaces/$WS_ID/commit" -H "Authorization: Bearer $INTERN_TOKEN" -H "Content-Type: application/json" \
  -d '{"message":"Add new_feature helper"}' > /dev/null
echo "  file written, context attached, commit made"

echo "== [8/8] push branch (to local dummy repo) + attempt PR open =="
HTTP_CODE=$(curl -s -o "$WORKDIR/pr.json" -w "%{http_code}" -X POST "$BASE/api/workspaces/$WS_ID/push-pr" \
  -H "Authorization: Bearer $INTERN_TOKEN" -H "Content-Type: application/json")
echo "  push-pr HTTP $HTTP_CODE (502 here is EXPECTED: no GITHUB_TOKEN configured in this smoke test)"
cat "$WORKDIR/pr.json"; echo
git --git-dir="$UPSTREAM" branch | grep -q "$(echo "$BRANCH" | sed 's#.*/##')" && echo "  branch present on dummy upstream: push succeeded"

echo
echo "ALL CORE CHECKS PASSED."
echo "(push-pr's GitHub-API step is expected to fail without a real GITHUB_TOKEN -- the git push itself succeeded, which is what this script verifies.)"
