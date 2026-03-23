#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

# Check 1: branch feat/search exists
if git show-ref --verify --quiet refs/heads/feat/search; then
  echo "PASS:branch_exists:Branch feat/search exists"
  PASS=$((PASS+1))
else
  echo "FAIL:branch_exists:Branch feat/search does not exist"
  FAIL=$((FAIL+1))
fi

# Check 2: all three commits present
C1=$(git log feat/search --oneline 2>/dev/null | grep "add search stub" | wc -l || true)
C2=$(git log feat/search --oneline 2>/dev/null | grep "add result indexing" | wc -l || true)
C3=$(git log feat/search --oneline 2>/dev/null | grep "add result highlighting" | wc -l || true)

if [ "$C1" -ge 1 ] && [ "$C2" -ge 1 ] && [ "$C3" -ge 1 ]; then
  echo "PASS:all_commits_recovered:All three feature commits are present on feat/search"
  PASS=$((PASS+1))
else
  echo "FAIL:all_commits_recovered:One or more commits are missing from feat/search"
  FAIL=$((FAIL+1))
fi

# Check 3: search.js contains expected content
if git show feat/search:search.js 2>/dev/null | grep -q "highlight"; then
  echo "PASS:content_intact:search.js contains the full feature code"
  PASS=$((PASS+1))
else
  echo "FAIL:content_intact:search.js is missing expected content"
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

# Check 5: HEAD is attached
if git symbolic-ref HEAD > /dev/null 2>&1; then
  echo "PASS:head_attached:HEAD is attached to a named branch"
  PASS=$((PASS+1))
else
  echo "FAIL:head_attached:HEAD is in detached state — create and check out feat/search"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
