#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

ORACLE_SHA=$(git rev-parse --verify refs/gitarena/oracles/wrong-branch-main-base 2>/dev/null || echo "MISSING")

# Check 1: main does not contain any of the three accidental commits
CHARGE_ON_MAIN=$(git log main --oneline | grep "add charge function" | wc -l || true)
REFUND_ON_MAIN=$(git log main --oneline | grep "add refund function" | wc -l || true)
HISTORY_ON_MAIN=$(git log main --oneline | grep "add payment history" | wc -l || true)
if [ "$CHARGE_ON_MAIN" -eq 0 ] && [ "$REFUND_ON_MAIN" -eq 0 ] && [ "$HISTORY_ON_MAIN" -eq 0 ]; then
  echo "PASS:main_clean:Accidental commits are not on main"
  PASS=$((PASS+1))
else
  echo "FAIL:main_clean:One or more accidental commits are still present on main"
  FAIL=$((FAIL+1))
fi

# Check 2: all three commits reachable from feat/payments
C1=$(git log feat/payments --oneline | grep "add charge function" | wc -l || true)
C2=$(git log feat/payments --oneline | grep "add refund function" | wc -l || true)
C3=$(git log feat/payments --oneline | grep "add payment history" | wc -l || true)

if [ "$C1" -ge 1 ] && [ "$C2" -ge 1 ] && [ "$C3" -ge 1 ]; then
  echo "PASS:commits_on_feature:All three commits reachable from feat/payments"
  PASS=$((PASS+1))
else
  echo "FAIL:commits_on_feature:One or more commits are missing from feat/payments"
  FAIL=$((FAIL+1))
fi

# Check 3: main points back to the original pre-accident commit
MAIN_SHA=$(git rev-parse main)
if [ "$ORACLE_SHA" = "MISSING" ]; then
  echo "FAIL:main_reset:Oracle ref missing — cannot validate main baseline SHA"
  FAIL=$((FAIL+1))
elif [ "$MAIN_SHA" = "$ORACLE_SHA" ]; then
  echo "PASS:main_reset:main was reset to its original commit"
  PASS=$((PASS+1))
else
  echo "FAIL:main_reset:main does not point to the original commit (${ORACLE_SHA:0:7})"
  FAIL=$((FAIL+1))
fi

# Check 4: repository working tree is clean (without branch checkout side effects)
if [ -z "$(git status --porcelain)" ]; then
  echo "PASS:main_working_tree_clean:Repository working tree is clean"
  PASS=$((PASS+1))
else
  echo "FAIL:main_working_tree_clean:Repository working tree has uncommitted changes"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
