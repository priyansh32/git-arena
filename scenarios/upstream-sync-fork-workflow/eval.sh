#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

git fetch upstream -q 2>/dev/null || true
git fetch origin -q 2>/dev/null || true

# Check 1: all three upstream commits present in local main
U1=$(git log main --oneline | grep "core module A" | wc -l || true)
U2=$(git log main --oneline | grep "core module B" | wc -l || true)
U3=$(git log main --oneline | grep "core module C" | wc -l || true)

if [ "$U1" -ge 1 ] && [ "$U2" -ge 1 ] && [ "$U3" -ge 1 ]; then
  echo "PASS:upstream_commits:All three upstream commits are in local main"
  PASS=$((PASS+1))
else
  echo "FAIL:upstream_commits:One or more upstream commits are missing from local main"
  FAIL=$((FAIL+1))
fi

# Check 2: own fork commits still present
F1=$(git log main --oneline | grep "fork contribution" | wc -l || true)
F2=$(git log main --oneline | grep "helper utilities" | wc -l || true)

if [ "$F1" -ge 1 ] && [ "$F2" -ge 1 ]; then
  echo "PASS:fork_commits:Both fork contribution commits are still present"
  PASS=$((PASS+1))
else
  echo "FAIL:fork_commits:One or more fork commits are missing"
  FAIL=$((FAIL+1))
fi

# Check 3: linear history (no merge commits)
MERGES=$(git log main --merges --oneline | wc -l || true)
if [ "$MERGES" -eq 0 ]; then
  echo "PASS:linear_history:History is linear — no merge commits"
  PASS=$((PASS+1))
else
  echo "FAIL:linear_history:History contains $MERGES merge commit(s)"
  FAIL=$((FAIL+1))
fi

# Check 4: fork commits are on top of upstream commits
UPSTREAM_LOG_POS=$(git log main --oneline | awk '/core module C/ { print NR; exit }' || true)
FORK_LOG_POS=$(git log main --oneline | awk '/fork contribution/ { print NR; exit }' || true)

if [ -n "$UPSTREAM_LOG_POS" ] && [ -n "$FORK_LOG_POS" ] && [ "$FORK_LOG_POS" -lt "$UPSTREAM_LOG_POS" ]; then
  echo "PASS:correct_order:Fork commits are on top of upstream commits"
  PASS=$((PASS+1))
else
  echo "FAIL:correct_order:Fork commits are not on top of upstream commits"
  FAIL=$((FAIL+1))
fi

# Check 5: origin/main in sync with local main
LOCAL=$(git rev-parse main)
REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "MISSING")
if [ "$REMOTE" = "MISSING" ]; then
  echo "FAIL:origin_synced:origin/main is missing — cannot verify push status"
  FAIL=$((FAIL+1))
elif [ "$LOCAL" = "$REMOTE" ]; then
  echo "PASS:origin_synced:origin/main is in sync with local main"
  PASS=$((PASS+1))
else
  echo "FAIL:origin_synced:origin/main is not in sync with local main — did you push?"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
