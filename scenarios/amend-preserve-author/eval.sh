#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

# Check 1: commit count unchanged (still 2)
COUNT=$(git rev-list main --count)
if [ "$COUNT" -eq 2 ]; then
  echo "PASS:commit_count:Commit count is still 2"
  PASS=$((PASS+1))
else
  echo "FAIL:commit_count:Expected 2 commits, found $COUNT"
  FAIL=$((FAIL+1))
fi

# Check 2: typo fixed in last commit message
MSG=$(git log -1 --format="%s")
if ! echo "$MSG" | grep -qi "relase"; then
  echo "PASS:typo_fixed:Commit message typo has been corrected"
  PASS=$((PASS+1))
else
  echo "FAIL:typo_fixed:Typo 'relase' still present in commit message: $MSG"
  FAIL=$((FAIL+1))
fi

# Check 3: CHANGELOG.md in last commit
CHANGELOG_IN_COMMIT=$(git show --name-only HEAD | grep "CHANGELOG.md" | wc -l || true)
if [ "$CHANGELOG_IN_COMMIT" -ge 1 ]; then
  echo "PASS:changelog_included:CHANGELOG.md is included in the amended commit"
  PASS=$((PASS+1))
else
  echo "FAIL:changelog_included:CHANGELOG.md is not in the last commit"
  FAIL=$((FAIL+1))
fi

# Check 4: original author preserved
AUTHOR_NAME=$(git log -1 --format="%an")
AUTHOR_EMAIL=$(git log -1 --format="%ae")

if [ "$AUTHOR_NAME" = "Jane Doe" ] && [ "$AUTHOR_EMAIL" = "jane@example.com" ]; then
  echo "PASS:author_preserved:Original author Jane Doe <jane@example.com> is preserved"
  PASS=$((PASS+1))
else
  echo "FAIL:author_preserved:Author changed — got: $AUTHOR_NAME <$AUTHOR_EMAIL>"
  FAIL=$((FAIL+1))
fi

# Check 5: working tree clean
if [ -z "$(git status --porcelain)" ]; then
  echo "PASS:clean_tree:Working tree is clean"
  PASS=$((PASS+1))
else
  echo "FAIL:clean_tree:Working tree is not clean — CHANGELOG.md may be untracked"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
