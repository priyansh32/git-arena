#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

# Check 1: no new commits were created
COMMIT_COUNT=$(git rev-list main --count)
if [ "$COMMIT_COUNT" -eq 2 ]; then
  echo "PASS:commit_count:No extra commits were created"
  PASS=$((PASS+1))
else
  echo "FAIL:commit_count:Expected exactly 2 commits, found $COMMIT_COUNT"
  FAIL=$((FAIL+1))
fi

# Check 2: app.js matches HEAD exactly (no diff)
if git diff --quiet HEAD -- app.js; then
  echo "PASS:file_restored:app.js matches the committed HEAD version"
  PASS=$((PASS+1))
else
  echo "FAIL:file_restored:app.js still differs from HEAD"
  FAIL=$((FAIL+1))
fi

# Check 3: restored content is the original one
if grep -q "const port = 3000;" app.js && ! grep -q "DEBUG MODE" app.js; then
  echo "PASS:content_expected:app.js contains the expected original content"
  PASS=$((PASS+1))
else
  echo "FAIL:content_expected:app.js content is not the expected restored version"
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
