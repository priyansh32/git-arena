#!/usr/bin/env bash
set -euo pipefail

PASS=0
FAIL=0
TOTAL=5

# Check 1: logger-repo exists and is a git repo
if [ -d /workspace/logger-repo/.git ]; then
  echo "PASS:repo_exists:logger-repo is a valid git repository"
  PASS=$((PASS+1))
else
  echo "FAIL:repo_exists:logger-repo does not exist or is not a git repository"
  FAIL=$((FAIL+1))
  echo "SCORE:$PASS/$TOTAL"
  exit 0
fi

cd /workspace/logger-repo

# Check 2: index.js at root (not nested under packages/logger)
if [ -f index.js ] && grep -q "log" index.js; then
  echo "PASS:root_layout:index.js is at the root of logger-repo"
  PASS=$((PASS+1))
else
  echo "FAIL:root_layout:index.js not found at root — contents may still be nested"
  FAIL=$((FAIL+1))
fi

# Check 3: only logger commits present (3 commits that touched logger + possibly initial)
AUTH_COMMITS=$(git log --oneline | grep "auth:" | wc -l || true)
DB_COMMITS=$(git log --oneline | grep "db:" | wc -l || true)
AUTH_IN_TREE=$(git rev-list HEAD | while read -r commit; do
  git ls-tree -r "$commit" --name-only 2>/dev/null | grep "^auth/" || true
done | wc -l)
DB_IN_TREE=$(git rev-list HEAD | while read -r commit; do
  git ls-tree -r "$commit" --name-only 2>/dev/null | grep "^db/" || true
done | wc -l)

if [ "$AUTH_COMMITS" -eq 0 ] && [ "$DB_COMMITS" -eq 0 ] && [ "$AUTH_IN_TREE" -eq 0 ] && [ "$DB_IN_TREE" -eq 0 ]; then
  echo "PASS:filtered_history:No auth/db commits and no auth/db tree objects in logger-repo history"
  PASS=$((PASS+1))
else
  echo "FAIL:filtered_history:Non-logger history remains (auth commits: $AUTH_COMMITS, db commits: $DB_COMMITS, auth tree hits: $AUTH_IN_TREE, db tree hits: $DB_IN_TREE)"
  FAIL=$((FAIL+1))
fi

# Check 4: logger content is complete
if grep -q "writeLog" index.js && grep -q "formatLog" index.js && grep -q "levels" index.js; then
  echo "PASS:content_complete:All logger code is present in index.js"
  PASS=$((PASS+1))
else
  echo "FAIL:content_complete:Some logger code is missing from index.js"
  FAIL=$((FAIL+1))
fi

# Check 5: working tree clean
if [ -z "$(git status --porcelain)" ]; then
  echo "PASS:clean_tree:Working tree of logger-repo is clean"
  PASS=$((PASS+1))
else
  echo "FAIL:clean_tree:Working tree of logger-repo is not clean"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
