#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

ORACLE=$(cat /tmp/good_sha_oracle 2>/dev/null || echo "MISSING")

# Check 1: all three commits on local main
C1=$(git log main --oneline | grep "payment gateway integration" | wc -l)
C2=$(git log main --oneline | grep "email notification system" | wc -l)
C3=$(git log main --oneline | grep "audit logging" | wc -l)

if [ "$C1" -ge 1 ] && [ "$C2" -ge 1 ] && [ "$C3" -ge 1 ]; then
  echo "PASS:local_commits_restored:All three lost commits are on local main"
  PASS=$((PASS+1))
else
  echo "FAIL:local_commits_restored:One or more lost commits are missing from local main"
  FAIL=$((FAIL+1))
fi

# Check 2: origin/main also has the commits
git fetch origin 2>/dev/null
C1R=$(git log origin/main --oneline | grep "payment gateway integration" | wc -l)
C2R=$(git log origin/main --oneline | grep "email notification system" | wc -l)
C3R=$(git log origin/main --oneline | grep "audit logging" | wc -l)

if [ "$C1R" -ge 1 ] && [ "$C2R" -ge 1 ] && [ "$C3R" -ge 1 ]; then
  echo "PASS:remote_restored:All three commits are on origin/main"
  PASS=$((PASS+1))
else
  echo "FAIL:remote_restored:origin/main does not have all three commits"
  FAIL=$((FAIL+1))
fi

# Check 3: local and origin are in sync
LOCAL=$(git rev-parse main)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" = "$REMOTE" ]; then
  echo "PASS:in_sync:local main and origin/main point to the same commit"
  PASS=$((PASS+1))
else
  echo "FAIL:in_sync:local main and origin/main are diverged"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
