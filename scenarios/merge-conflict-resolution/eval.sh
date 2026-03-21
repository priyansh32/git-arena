#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

# Check 1: no conflict markers remain
if grep -qE "^(<<<<<<<|=======|>>>>>>>)" app.js 2>/dev/null; then
  echo "FAIL:no_conflict_markers:Conflict markers still present in app.js"
  FAIL=$((FAIL+1))
else
  echo "PASS:no_conflict_markers:No conflict markers in app.js"
  PASS=$((PASS+1))
fi

# Check 2: working tree is clean
if [ -z "$(git status --porcelain)" ]; then
  echo "PASS:clean_tree:Working tree is clean"
  PASS=$((PASS+1))
else
  echo "FAIL:clean_tree:Working tree is not clean — merge not completed or untracked changes remain"
  FAIL=$((FAIL+1))
fi

# Check 3: logging line present
if grep -q "console.log" app.js; then
  echo "PASS:logging_present:Logging line from feat/logging is present"
  PASS=$((PASS+1))
else
  echo "FAIL:logging_present:Logging line is missing from app.js"
  FAIL=$((FAIL+1))
fi

# Check 4: null check present
if grep -q "throw new Error" app.js; then
  echo "PASS:null_check_present:Null check from main is present"
  PASS=$((PASS+1))
else
  echo "FAIL:null_check_present:Null check is missing from app.js"
  FAIL=$((FAIL+1))
fi

# Check 5: HEAD is a merge commit (two parents)
PARENT_COUNT=$(git log -1 --pretty=format:"%P" | wc -w)
if [ "$PARENT_COUNT" -ge 2 ]; then
  echo "PASS:merge_commit:HEAD is a merge commit"
  PASS=$((PASS+1))
else
  echo "FAIL:merge_commit:HEAD is not a merge commit — did you commit after resolving?"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
