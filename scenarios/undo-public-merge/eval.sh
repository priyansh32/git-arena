#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

MERGE_SHA=$(cat /tmp/merge_sha_oracle 2>/dev/null || echo "MISSING")

# Check 1: a revert commit exists in main's history
REVERT_COUNT=$(git log main --oneline | grep -i "^[a-f0-9]* [Rr]evert" | wc -l || true)
if [ "$REVERT_COUNT" -ge 1 ]; then
  echo "PASS:revert_exists:A revert commit exists on main"
  PASS=$((PASS+1))
else
  echo "FAIL:revert_exists:No revert commit found on main"
  FAIL=$((FAIL+1))
fi

# Check 2: billing.js not present
if [ ! -f billing.js ]; then
  echo "PASS:billing_removed:billing.js is not present in working tree"
  PASS=$((PASS+1))
else
  echo "FAIL:billing_removed:billing.js is still present — revert did not remove it"
  FAIL=$((FAIL+1))
fi

# Check 3: merge commit is still in history (not rewritten)
if git log main --oneline | grep -q "${MERGE_SHA:0:7}"; then
  echo "PASS:history_preserved:Original merge commit is still in history"
  PASS=$((PASS+1))
else
  echo "FAIL:history_preserved:Merge commit was removed from history — did you rewrite instead of revert?"
  FAIL=$((FAIL+1))
fi

# Check 4: working tree clean
if [ -z "$(git status --porcelain)" ]; then
  echo "PASS:clean_tree:Working tree is clean"
  PASS=$((PASS+1))
else
  echo "FAIL:clean_tree:Working tree has uncommitted changes"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
