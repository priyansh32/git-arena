#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

# Record the SHA of the initial commit to check main was reset
INITIAL_SHA=$(git log --oneline --all | grep "Initial commit" | awk '{print $1}')

# Check 1: main does not contain the three accidental commits
CHARGE_ON_MAIN=$(git log main --oneline | grep "add charge function" | wc -l || true)
if [ "$CHARGE_ON_MAIN" -eq 0 ]; then
  echo "PASS:main_clean:Accidental commits are not on main"
  PASS=$((PASS+1))
else
  echo "FAIL:main_clean:Accidental commits are still present on main"
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

# Check 3: main working tree is clean
STATUS=$(git -C /workspace status --porcelain)
CURRENT=$(git symbolic-ref --short HEAD)
git checkout main -q
CLEAN=$(git status --porcelain)
if [ -z "$CLEAN" ]; then
  echo "PASS:main_working_tree_clean:Working tree on main is clean"
  PASS=$((PASS+1))
else
  echo "FAIL:main_working_tree_clean:Working tree on main has uncommitted changes"
  FAIL=$((FAIL+1))
fi
git checkout "$CURRENT" -q 2>/dev/null || true

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
