#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

git fetch origin -q 2>/dev/null

# Check 1: all three remote commits present in local history
R1=$(git log main --oneline | grep "add docs section 1" | wc -l || true)
R2=$(git log main --oneline | grep "add docs section 2" | wc -l || true)
R3=$(git log main --oneline | grep "add docs section 3" | wc -l || true)

if [ "$R1" -ge 1 ] && [ "$R2" -ge 1 ] && [ "$R3" -ge 1 ]; then
  echo "PASS:remote_commits_present:All three remote commits are in local history"
  PASS=$((PASS+1))
else
  echo "FAIL:remote_commits_present:Some remote commits are missing from local history"
  FAIL=$((FAIL+1))
fi

# Check 2: both local commits present
L1=$(git log main --oneline | grep "feature flag config" | wc -l || true)
L2=$(git log main --oneline | grep "add CI badge" | wc -l || true)

if [ "$L1" -ge 1 ] && [ "$L2" -ge 1 ]; then
  echo "PASS:local_commits_present:Both local commits are still in history"
  PASS=$((PASS+1))
else
  echo "FAIL:local_commits_present:One or more local commits are missing"
  FAIL=$((FAIL+1))
fi

# Check 3: history is linear (no merge commit)
MERGE_COMMITS=$(git log main --oneline --merges | wc -l || true)
if [ "$MERGE_COMMITS" -eq 0 ]; then
  echo "PASS:linear_history:History is linear — no merge commits"
  PASS=$((PASS+1))
else
  echo "FAIL:linear_history:History contains merge commits — a rebase was expected"
  FAIL=$((FAIL+1))
fi

# Check 4: local commits are on top of remote commits
# The remote commits should appear before the local commits in log
LAST_REMOTE_LINE=$(git log main --oneline | grep -n "add docs section 3" | cut -d: -f1)
FIRST_LOCAL_LINE=$(git log main --oneline | grep -n "feature flag config" | cut -d: -f1)

if [ -n "$LAST_REMOTE_LINE" ] && [ -n "$FIRST_LOCAL_LINE" ] && [ "$FIRST_LOCAL_LINE" -lt "$LAST_REMOTE_LINE" ]; then
  echo "PASS:correct_order:Local commits are on top of remote commits"
  PASS=$((PASS+1))
else
  echo "FAIL:correct_order:Local commits are not on top of remote commits"
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
