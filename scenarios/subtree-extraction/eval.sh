#!/usr/bin/env bash
set -euo pipefail

PASS=0
FAIL=0

# Check 1: logger-repo exists and is a git repo
if [ -d /workspace/logger-repo/.git ]; then
  echo "PASS:repo_exists:logger-repo is a valid git repository"
  PASS=$((PASS+1))
else
  echo "FAIL:repo_exists:logger-repo does not exist or is not a git repository"
  FAIL=$((FAIL+1))
  echo "SCORE:$PASS/5"
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
LOGGER_COMMITS=$(git log --oneline | grep -E "logger:|Initial commit" | wc -l)
TOTAL_COMMITS=$(git rev-list HEAD --count)

# There should be 3 logger-only commits (+ optionally initial)
AUTH_COMMITS=$(git log --oneline | grep "auth:" | wc -l)
DB_COMMITS=$(git log --oneline | grep "db:" | wc -l)

if [ "$AUTH_COMMITS" -eq 0 ] && [ "$DB_COMMITS" -eq 0 ]; then
  echo "PASS:filtered_history:No auth or db commits in logger-repo history"
  PASS=$((PASS+1))
else
  echo "FAIL:filtered_history:Non-logger commits found in logger-repo (auth: $AUTH_COMMITS, db: $DB_COMMITS)"
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
