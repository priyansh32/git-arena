#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

# Check 1: exactly one commit ahead of main
AHEAD=$(git rev-list main..feat/user-auth --count)
if [ "$AHEAD" -eq 1 ]; then
  echo "PASS:single_commit:feat/user-auth is exactly one commit ahead of main"
  PASS=$((PASS+1))
else
  echo "FAIL:single_commit:Expected 1 commit ahead of main, found $AHEAD"
  FAIL=$((FAIL+1))
fi

# Check 2: commit message starts with 'feat:'
MSG=$(git log -1 --format="%s" feat/user-auth)
if echo "$MSG" | grep -qE "^feat:"; then
  echo "PASS:conventional_commit:Commit message starts with 'feat:'"
  PASS=$((PASS+1))
else
  echo "FAIL:conventional_commit:Commit message does not start with 'feat:' — got: $MSG"
  FAIL=$((FAIL+1))
fi

# Check 3: all five functions present in auth.js
EXPECTED=("login" "logout" "register" "token" "refreshToken")
ALL_PRESENT=true
AUTH_CONTENT=$(git show feat/user-auth:auth.js 2>/dev/null || true)
for fn in "${EXPECTED[@]}"; do
  if ! echo "$AUTH_CONTENT" | grep -q "$fn"; then
    ALL_PRESENT=false
    break
  fi
done

if $ALL_PRESENT; then
  echo "PASS:content_preserved:All original code is present in auth.js"
  PASS=$((PASS+1))
else
  echo "FAIL:content_preserved:auth.js is missing content that was in the original commits"
  FAIL=$((FAIL+1))
fi

# Check 4: working tree clean
if [ -z "$(git status --porcelain)" ]; then
  echo "PASS:clean_tree:Working tree is clean"
  PASS=$((PASS+1))
else
  echo "FAIL:clean_tree:Working tree is not clean"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
