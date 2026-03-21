#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

FIX=$(git log main --oneline | grep "input sanitization regression" | wc -l || true)
T1=$(git log main --oneline | grep "sanitize unit test" | wc -l || true)
T2=$(git log main --oneline | grep "sanitize null input test" | wc -l || true)

if [ "$FIX" -ge 1 ] && [ "$T1" -ge 1 ] && [ "$T2" -ge 1 ]; then
  echo "PASS:target_commits_on_main:All three target commits are on main"
  PASS=$((PASS+1))
else
  echo "FAIL:target_commits_on_main:One or more target commits are missing from main"
  FAIL=$((FAIL+1))
fi

# Check 2: v2 wip commits NOT on main
WIP_COUNT=$(git log main --oneline | grep "wip:" | wc -l || true)
if [ "$WIP_COUNT" -eq 0 ]; then
  echo "PASS:no_wip_commits:No wip commits from feat/v2 are on main"
  PASS=$((PASS+1))
else
  echo "FAIL:no_wip_commits:$WIP_COUNT wip commit(s) from feat/v2 are on main"
  FAIL=$((FAIL+1))
fi

# Check 3: sanitize.js present on main
if [ -f sanitize.js ] && grep -q "sanitize" sanitize.js; then
  echo "PASS:sanitize_present:sanitize.js is present with expected content"
  PASS=$((PASS+1))
else
  echo "FAIL:sanitize_present:sanitize.js is missing or has unexpected content"
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
