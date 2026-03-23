#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

# Check 1: hotfix commit on main
HOTFIX=$(git log main --format="%s" | grep -icE "^(hotfix|fix)(\\(|:)" || true)
if [ "$HOTFIX" -ge 1 ]; then
  echo "PASS:hotfix_on_main:A hotfix commit exists on main"
  PASS=$((PASS+1))
else
  echo "FAIL:hotfix_on_main:No hotfix commit found on main"
  FAIL=$((FAIL+1))
fi

# Check 2: api.js on main contains error handling
git show main:api.js 2>/dev/null > /tmp/api_main.js || true
if grep -qiE "error|throw|catch|try|404|null" /tmp/api_main.js; then
  echo "PASS:error_handling_in_api:api.js on main contains error handling"
  PASS=$((PASS+1))
else
  echo "FAIL:error_handling_in_api:api.js on main does not appear to have error handling"
  FAIL=$((FAIL+1))
fi

# Check 3: feat/recommendations still has its commit
REC_COMMIT=$(git log feat/recommendations --oneline | grep "scaffold recommendation engine" | wc -l || true)
if [ "$REC_COMMIT" -ge 1 ]; then
  echo "PASS:feature_intact:feat/recommendations scaffold commit is intact"
  PASS=$((PASS+1))
else
  echo "FAIL:feature_intact:feat/recommendations commit is missing"
  FAIL=$((FAIL+1))
fi

# Check 4: WIP collaborative filter code still in working tree on feature branch
CURRENT_BRANCH=$(git symbolic-ref --quiet --short HEAD || echo "DETACHED")
if [ "$CURRENT_BRANCH" = "feat/recommendations" ] && grep -q "collaborativeFilter" recommend.js 2>/dev/null; then
  echo "PASS:wip_preserved:WIP collaborative filter code is still present and you're back on feat/recommendations"
  PASS=$((PASS+1))
else
  echo "FAIL:wip_preserved:Expected to finish on feat/recommendations with WIP code still present"
  FAIL=$((FAIL+1))
fi

# Check 5: no dangling worktrees (cleanup done)
DANGLING=$(git worktree list | grep -v "^/workspace " | grep -v "(bare)" | wc -l || true)
if [ "$DANGLING" -eq 0 ]; then
  echo "PASS:worktree_cleaned:No dangling worktrees remaining"
  PASS=$((PASS+1))
else
  echo "FAIL:worktree_cleaned:$DANGLING worktree(s) still attached — run git worktree remove"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
