#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

ORACLE=$(git rev-parse --verify refs/gitarena/oracles/force-push-good-tip 2>/dev/null || echo "MISSING")

# Check 1: all three commits on local main
C1=$(git log main --oneline | grep "payment gateway integration" | wc -l || true)
C2=$(git log main --oneline | grep "email notification system" | wc -l || true)
C3=$(git log main --oneline | grep "audit logging" | wc -l || true)

if [ "$C1" -ge 1 ] && [ "$C2" -ge 1 ] && [ "$C3" -ge 1 ]; then
  echo "PASS:local_commits_restored:All three lost commits are on local main"
  PASS=$((PASS+1))
else
  echo "FAIL:local_commits_restored:One or more lost commits are missing from local main"
  FAIL=$((FAIL+1))
fi

# Check 2: origin/main also has the commits
git fetch origin 2>/dev/null || true
C1R=$(git log origin/main --oneline | grep "payment gateway integration" | wc -l || true)
C2R=$(git log origin/main --oneline | grep "email notification system" | wc -l || true)
C3R=$(git log origin/main --oneline | grep "audit logging" | wc -l || true)

if [ "$C1R" -ge 1 ] && [ "$C2R" -ge 1 ] && [ "$C3R" -ge 1 ]; then
  echo "PASS:remote_restored:All three commits are on origin/main"
  PASS=$((PASS+1))
else
  echo "FAIL:remote_restored:origin/main does not have all three commits"
  FAIL=$((FAIL+1))
fi

# Check 3: local and origin are in sync
LOCAL=$(git rev-parse main)
REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "MISSING")
if [ "$REMOTE" = "MISSING" ]; then
  echo "FAIL:in_sync:origin/main is missing — cannot compare local and remote tips"
  FAIL=$((FAIL+1))
elif [ "$LOCAL" = "$REMOTE" ]; then
  echo "PASS:in_sync:local main and origin/main point to the same commit"
  PASS=$((PASS+1))
else
  echo "FAIL:in_sync:local main and origin/main are diverged"
  FAIL=$((FAIL+1))
fi

# Check 4: restored tip matches the original pre-force-push SHA
if [ "$ORACLE" = "MISSING" ]; then
  echo "FAIL:tip_restored:Oracle ref missing — cannot verify restored tip SHA"
  FAIL=$((FAIL+1))
elif [ "$LOCAL" = "$ORACLE" ] && [ "$REMOTE" = "$ORACLE" ]; then
  echo "PASS:tip_restored:main tip is restored to the original pre-force-push SHA"
  PASS=$((PASS+1))
else
  echo "FAIL:tip_restored:Expected local+origin main to point at $ORACLE, got local=$LOCAL origin=$REMOTE"
  FAIL=$((FAIL+1))
fi

# Check 5: history is linear (no merge commits)
MERGES=$(git rev-list --merges main --count)
if [ "$MERGES" -eq 0 ]; then
  echo "PASS:linear_history:main history is linear with no merge commits"
  PASS=$((PASS+1))
else
  echo "FAIL:linear_history:main history contains $MERGES merge commit(s)"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
