#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

# Check 1: HEAD is attached (on a branch)
if git symbolic-ref HEAD > /dev/null 2>&1; then
  echo "PASS:head_attached:HEAD is on a named branch"
  PASS=$((PASS+1))
else
  echo "FAIL:head_attached:HEAD is still in detached state"
  FAIL=$((FAIL+1))
fi

# Check 2: branch 'rescue' exists
if git show-ref --verify --quiet refs/heads/rescue; then
  echo "PASS:rescue_branch_exists:Branch 'rescue' exists"
  PASS=$((PASS+1))
else
  echo "FAIL:rescue_branch_exists:Branch 'rescue' does not exist"
  FAIL=$((FAIL+1))
fi

# Check 3: both hotfix commits reachable from rescue
HOTFIX1=$(git log rescue --oneline | grep "Hotfix: patch line 1" | wc -l || true)
HOTFIX2=$(git log rescue --oneline | grep "Hotfix: patch line 2" | wc -l || true)

if [ "$HOTFIX1" -ge 1 ] && [ "$HOTFIX2" -ge 1 ]; then
  echo "PASS:commits_reachable:Both hotfix commits reachable from branch 'rescue'"
  PASS=$((PASS+1))
else
  echo "FAIL:commits_reachable:One or both hotfix commits are not reachable from 'rescue'"
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
