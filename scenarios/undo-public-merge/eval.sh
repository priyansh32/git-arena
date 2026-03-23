#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

MERGE_SHA=$(git rev-parse --verify refs/gitarena/oracles/undo-public-merge-sha 2>/dev/null || echo "MISSING")

# Check 1: merge commit is still in history (not rewritten)
if [ "$MERGE_SHA" = "MISSING" ]; then
  echo "FAIL:history_preserved:Oracle ref missing — cannot validate merge commit ancestry"
  FAIL=$((FAIL+1))
elif git log main --oneline | grep -q "${MERGE_SHA:0:7}"; then
  echo "PASS:history_preserved:Original merge commit is still in history"
  PASS=$((PASS+1))
else
  echo "FAIL:history_preserved:Merge commit was removed from history — did you rewrite instead of revert?"
  FAIL=$((FAIL+1))
fi

# Check 2: exactly one commit was added after the merge
if [ "$MERGE_SHA" = "MISSING" ]; then
  echo "FAIL:single_followup:Oracle ref missing — cannot count commits after merge"
  FAIL=$((FAIL+1))
else
  POST_MERGE_COUNT=$(git rev-list --count "${MERGE_SHA}..main" 2>/dev/null || echo "0")
  if [ "$POST_MERGE_COUNT" -eq 1 ]; then
    echo "PASS:single_followup:Exactly one follow-up commit exists after the merge"
    PASS=$((PASS+1))
  else
    echo "FAIL:single_followup:Expected exactly 1 commit after merge, found $POST_MERGE_COUNT"
    FAIL=$((FAIL+1))
  fi
fi

# Check 3: latest commit carries canonical revert trailer for the merge SHA
if [ "$MERGE_SHA" = "MISSING" ]; then
  echo "FAIL:canonical_revert:Oracle ref missing — cannot verify canonical revert trailer"
  FAIL=$((FAIL+1))
else
  HEAD_BODY=$(git log -1 --format="%B" main)
  if echo "$HEAD_BODY" | grep -q "This reverts commit $MERGE_SHA"; then
    echo "PASS:canonical_revert:Latest commit message references the merge SHA via revert trailer"
    PASS=$((PASS+1))
  else
    echo "FAIL:canonical_revert:Latest commit does not look like a canonical merge revert for $MERGE_SHA"
    FAIL=$((FAIL+1))
  fi
fi

# Check 4: billing.js is no longer tracked on main
if git cat-file -e main:billing.js 2>/dev/null; then
  echo "FAIL:billing_removed:billing.js is still tracked on main"
  FAIL=$((FAIL+1))
else
  echo "PASS:billing_removed:billing.js is no longer present on main"
  PASS=$((PASS+1))
fi

# Check 5: working tree clean
if [ -z "$(git status --porcelain)" ]; then
  echo "PASS:clean_tree:Working tree is clean"
  PASS=$((PASS+1))
else
  echo "FAIL:clean_tree:Working tree has uncommitted changes"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
