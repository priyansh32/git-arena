#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

# Check 1: exactly one commit since Initial commit
COMMIT_COUNT=$(git rev-list main --count)
if [ "$COMMIT_COUNT" -eq 2 ]; then
  echo "PASS:one_new_commit:Exactly one new commit exists since the initial commit"
  PASS=$((PASS+1))
else
  echo "FAIL:one_new_commit:Expected 2 total commits (initial + fix), found $COMMIT_COUNT"
  FAIL=$((FAIL+1))
fi

# Check 2: the fix commit contains the null check
LAST_COMMIT_DIFF=""
if [ "$COMMIT_COUNT" -ge 2 ]; then
  LAST_COMMIT_DIFF=$(git diff HEAD~1 HEAD -- server.js)
  if echo "$LAST_COMMIT_DIFF" | grep -q "400"; then
    echo "PASS:fix_committed:The null check / 400 response is in the commit"
    PASS=$((PASS+1))
  else
    echo "FAIL:fix_committed:The bug fix does not appear to be in the last commit"
    FAIL=$((FAIL+1))
  fi
else
  echo "FAIL:fix_committed:Cannot inspect commit diff because no new commit was created"
  FAIL=$((FAIL+1))
fi

# Check 3: experimental code NOT in the last commit
if [ "$COMMIT_COUNT" -ge 2 ] && ! echo "$LAST_COMMIT_DIFF" | grep -q "streamResponse"; then
  echo "PASS:experimental_not_committed:Experimental code is not in the commit"
  PASS=$((PASS+1))
elif [ "$COMMIT_COUNT" -lt 2 ]; then
  echo "FAIL:experimental_not_committed:Cannot validate commit contents because no new commit was created"
  FAIL=$((FAIL+1))
else
  echo "FAIL:experimental_not_committed:Experimental code was included in the commit"
  FAIL=$((FAIL+1))
fi

# Check 4: experimental code present in working tree
if grep -q "streamResponse" server.js; then
  echo "PASS:experimental_in_worktree:Experimental code is still in the working tree"
  PASS=$((PASS+1))
else
  echo "FAIL:experimental_in_worktree:Experimental code is missing from working tree"
  FAIL=$((FAIL+1))
fi

# Check 5: server.js is modified (unstaged changes present)
UNSTAGED=$(git diff --name-only | grep "server.js" | wc -l || true)
if [ "$UNSTAGED" -ge 1 ]; then
  echo "PASS:unstaged_changes:server.js has unstaged changes (experimental code still pending)"
  PASS=$((PASS+1))
else
  echo "FAIL:unstaged_changes:server.js has no unstaged changes — experimental code may have been staged or discarded"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
