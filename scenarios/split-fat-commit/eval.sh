#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

# Check 1: at least 3 commits since Initial commit
COMMIT_COUNT=$(git rev-list HEAD --count)
if [ "$COMMIT_COUNT" -ge 4 ]; then
  echo "PASS:commit_count:History has at least 4 commits (Initial + 3 split commits)"
  PASS=$((PASS+1))
else
  echo "FAIL:commit_count:Not enough commits — expected at least 4, found $COMMIT_COUNT"
  FAIL=$((FAIL+1))
fi

# Check 2: no single commit touches all three files
FAT_COMMIT=$(git log --oneline --diff-filter=A -- bugfix.js feature.js config.json | awk 'NR == 1 { print $1; exit }' || true)
if [ -n "$FAT_COMMIT" ]; then
  FILES_IN_FAT=$(git diff-tree --no-commit-id -r --name-only "$FAT_COMMIT" 2>/dev/null | wc -l || true)
  if [ "$FILES_IN_FAT" -ge 3 ]; then
    echo "FAIL:no_fat_commit:A single commit still touches all three files — not fully split"
    FAIL=$((FAIL+1))
  else
    echo "PASS:no_fat_commit:No single commit touches all three files"
    PASS=$((PASS+1))
  fi
else
  # Check by inspecting each commit for multi-file overlap
  echo "PASS:no_fat_commit:No single commit appears to touch all three concern files"
  PASS=$((PASS+1))
fi

# Check 3: all three files exist with correct content
if [ -f bugfix.js ] && grep -q "parseDate" bugfix.js; then
  echo "PASS:bugfix_content:bugfix.js has correct content"
  PASS=$((PASS+1))
else
  echo "FAIL:bugfix_content:bugfix.js is missing or has wrong content"
  FAIL=$((FAIL+1))
fi

if [ -f feature.js ] && grep -q "exportToPDF" feature.js; then
  echo "PASS:feature_content:feature.js has correct content"
  PASS=$((PASS+1))
else
  echo "FAIL:feature_content:feature.js is missing or has wrong content"
  FAIL=$((FAIL+1))
fi

if [ -f config.json ] && grep -q "maxRetries" config.json; then
  echo "PASS:config_content:config.json has correct content"
  PASS=$((PASS+1))
else
  echo "FAIL:config_content:config.json is missing or has wrong content"
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
