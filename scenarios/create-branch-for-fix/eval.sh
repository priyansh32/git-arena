#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

TARGET_BRANCH="fix/readme-typo"
MAIN_ORACLE=$(git rev-parse --verify refs/gitarena/oracles/create-branch-main 2>/dev/null || echo "MISSING")

# Check 1: target branch exists
if git show-ref --verify --quiet "refs/heads/$TARGET_BRANCH"; then
  echo "PASS:branch_exists:Branch $TARGET_BRANCH exists"
  PASS=$((PASS+1))
  BRANCH_EXISTS=1
else
  echo "FAIL:branch_exists:Branch $TARGET_BRANCH does not exist"
  FAIL=$((FAIL+1))
  BRANCH_EXISTS=0
fi

# Check 2: main unchanged
MAIN_SHA=$(git rev-parse main)
if [ "$MAIN_ORACLE" = "MISSING" ]; then
  echo "FAIL:main_unchanged:Oracle ref missing — cannot verify main SHA"
  FAIL=$((FAIL+1))
elif [ "$MAIN_SHA" = "$MAIN_ORACLE" ]; then
  echo "PASS:main_unchanged:main remained unchanged"
  PASS=$((PASS+1))
else
  echo "FAIL:main_unchanged:main moved from ${MAIN_ORACLE:0:7} to ${MAIN_SHA:0:7}"
  FAIL=$((FAIL+1))
fi

# Check 3: fix branch is exactly one commit ahead of main
if [ "$BRANCH_EXISTS" -eq 1 ]; then
  AHEAD=$(git rev-list --count "main..$TARGET_BRANCH")
  if [ "$AHEAD" -eq 1 ]; then
    echo "PASS:single_fix_commit:$TARGET_BRANCH is exactly one commit ahead of main"
    PASS=$((PASS+1))
  else
    echo "FAIL:single_fix_commit:Expected one commit ahead of main, found $AHEAD"
    FAIL=$((FAIL+1))
  fi
else
  echo "FAIL:single_fix_commit:Cannot verify commit count because branch is missing"
  FAIL=$((FAIL+1))
fi

# Check 4: README typo fixed on target branch
README_ON_BRANCH=$(git show "$TARGET_BRANCH:README.md" 2>/dev/null || true)
if echo "$README_ON_BRANCH" | grep -q "GitArena" && ! echo "$README_ON_BRANCH" | grep -q "GitArnea"; then
  echo "PASS:typo_fixed:README typo is fixed on $TARGET_BRANCH"
  PASS=$((PASS+1))
else
  echo "FAIL:typo_fixed:README typo is not correctly fixed on $TARGET_BRANCH"
  FAIL=$((FAIL+1))
fi

# Check 5: working tree clean
if [ -z "$(git status --porcelain)" ]; then
  echo "PASS:clean_tree:Working tree is clean"
  PASS=$((PASS+1))
else
  echo "FAIL:clean_tree:Working tree is not clean"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
