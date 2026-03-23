#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

# Check 1: secrets.env not in current working tree
if [ ! -f secrets.env ]; then
  echo "PASS:not_in_worktree:secrets.env is not in the working tree"
  PASS=$((PASS+1))
else
  echo "FAIL:not_in_worktree:secrets.env still exists in the working tree"
  FAIL=$((FAIL+1))
fi

# Check 2: secrets.env not in any commit tree in the branch
SECRET_IN_HISTORY=$(git log --all --full-history --oneline -- secrets.env | wc -l || true)
if [ "$SECRET_IN_HISTORY" -eq 0 ]; then
  echo "PASS:not_in_history:secrets.env does not appear in any commit in branch history"
  PASS=$((PASS+1))
else
  echo "FAIL:not_in_history:secrets.env still appears in $SECRET_IN_HISTORY commit(s)"
  FAIL=$((FAIL+1))
fi

# Check 3: actual git objects — verify the file content is not in any tree object
FOUND_IN_OBJECTS=$(git rev-list --all | while read -r commit; do
  git ls-tree -r "$commit" --name-only 2>/dev/null | grep "^secrets.env$" || true
done | wc -l)

if [ "$FOUND_IN_OBJECTS" -eq 0 ]; then
  echo "PASS:not_in_objects:secrets.env not found in any tree object across all commits"
  PASS=$((PASS+1))
else
  echo "FAIL:not_in_objects:secrets.env still exists in $FOUND_IN_OBJECTS tree object(s)"
  FAIL=$((FAIL+1))
fi

# Check 4: other files intact
if [ -f stripe.js ] && grep -q "refund" stripe.js; then
  echo "PASS:history_intact:stripe.js is present and contains expected content"
  PASS=$((PASS+1))
else
  echo "FAIL:history_intact:stripe.js is missing or has lost content"
  FAIL=$((FAIL+1))
fi

# Check 5: working tree clean
if [ -z "$(git status --porcelain)" ]; then
  echo "PASS:clean_tree:Working tree is clean"
  PASS=$((PASS+1))
else
  echo "FAIL:clean_tree:Working tree is not clean"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
