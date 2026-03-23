#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0
TOTAL=5

# Check 1: gh-pages branch exists
if git show-ref --verify --quiet refs/heads/gh-pages; then
  echo "PASS:branch_exists:gh-pages branch exists"
  PASS=$((PASS+1))
else
  echo "FAIL:branch_exists:gh-pages branch does not exist"
  FAIL=$((FAIL+1))
  echo "SCORE:$PASS/$TOTAL"
  exit 0
fi

# Check 2: gh-pages has no common ancestor with main (truly orphaned)
COMMON=$(git merge-base main gh-pages 2>/dev/null || echo "none")
if [ "$COMMON" = "none" ] || [ -z "$COMMON" ]; then
  echo "PASS:no_common_ancestor:gh-pages has no common ancestor with main"
  PASS=$((PASS+1))
else
  echo "FAIL:no_common_ancestor:gh-pages shares a common ancestor with main — not an orphan branch"
  FAIL=$((FAIL+1))
fi

# Check 3: exactly one commit on gh-pages
GH_COMMIT_COUNT=$(git rev-list gh-pages --count)
if [ "$GH_COMMIT_COUNT" -eq 1 ]; then
  echo "PASS:single_root_commit:gh-pages has exactly one root commit"
  PASS=$((PASS+1))
else
  echo "FAIL:single_root_commit:Expected 1 commit on gh-pages, found $GH_COMMIT_COUNT"
  FAIL=$((FAIL+1))
fi

# Check 4: index.html present on gh-pages
if git cat-file -e gh-pages:index.html 2>/dev/null; then
  echo "PASS:index_html:index.html exists on gh-pages"
  PASS=$((PASS+1))
else
  echo "FAIL:index_html:index.html not found on gh-pages"
  FAIL=$((FAIL+1))
fi

# Check 5: main is unchanged (still 2 commits)
MAIN_COUNT=$(git rev-list main --count)
if [ "$MAIN_COUNT" -eq 2 ]; then
  echo "PASS:main_unchanged:main still has exactly 2 commits"
  PASS=$((PASS+1))
else
  echo "FAIL:main_unchanged:main commit count has changed — was 2, now $MAIN_COUNT"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
