#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

# Check 1: no conflict markers
if grep -qE "^(<<<<<<<|=======|>>>>>>>)" config.js 2>/dev/null; then
  echo "FAIL:no_conflict_markers:Conflict markers still present in config.js"
  FAIL=$((FAIL+1))
else
  echo "PASS:no_conflict_markers:No conflict markers in config.js"
  PASS=$((PASS+1))
fi

# Check 2: timeout setting present (from stash)
if grep -q "timeout" config.js; then
  echo "PASS:timeout_present:Stashed timeout setting is present"
  PASS=$((PASS+1))
else
  echo "FAIL:timeout_present:Timeout setting from stash is missing"
  FAIL=$((FAIL+1))
fi

# Check 3: retries setting present (from colleague)
if grep -q "retries" config.js; then
  echo "PASS:retries_present:Colleague's retries setting is present"
  PASS=$((PASS+1))
else
  echo "FAIL:retries_present:Retries setting from colleague's commit is missing"
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

# Check 5: stash list empty
if [ -z "$(git stash list)" ]; then
  echo "PASS:stash_cleared:Stash list is empty"
  PASS=$((PASS+1))
else
  echo "FAIL:stash_cleared:Stash list still contains entries"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
