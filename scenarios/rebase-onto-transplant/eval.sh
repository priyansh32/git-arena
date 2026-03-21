#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

# Check 1: feat/dark-mode's first parent chain reaches main without going through feat/theming
THEMING_COMMITS=$(git log feat/theming --oneline | grep -E "base theme|applyTheme" | wc -l || true)
DM_HAS_THEMING=$(git log feat/dark-mode --oneline | grep -E "base theme|applyTheme" | wc -l || true)

if [ "$DM_HAS_THEMING" -eq 0 ]; then
  echo "PASS:no_theming_commits:feat/dark-mode does not include theming commits"
  PASS=$((PASS+1))
else
  echo "FAIL:no_theming_commits:feat/dark-mode still includes theming commits"
  FAIL=$((FAIL+1))
fi

# Check 2: dark mode commits are present
C1=$(git log feat/dark-mode --oneline | grep "dark mode palette" | wc -l || true)
C2=$(git log feat/dark-mode --oneline | grep "dark mode toggle" | wc -l || true)

if [ "$C1" -ge 1 ] && [ "$C2" -ge 1 ]; then
  echo "PASS:dark_commits_present:Both dark mode commits are on feat/dark-mode"
  PASS=$((PASS+1))
else
  echo "FAIL:dark_commits_present:Dark mode commits are missing from feat/dark-mode"
  FAIL=$((FAIL+1))
fi

# Check 3: feat/dark-mode is based on main (merge-base is main's HEAD)
MAIN_HEAD=$(git rev-parse main)
MERGE_BASE=$(git merge-base main feat/dark-mode)
if [ "$MERGE_BASE" = "$MAIN_HEAD" ]; then
  echo "PASS:based_on_main:feat/dark-mode branches directly from main"
  PASS=$((PASS+1))
else
  echo "FAIL:based_on_main:feat/dark-mode does not branch from main's current HEAD"
  FAIL=$((FAIL+1))
fi

# Check 4: exactly 2 commits ahead of main
AHEAD=$(git rev-list main..feat/dark-mode --count)
if [ "$AHEAD" -eq 2 ]; then
  echo "PASS:commit_count:feat/dark-mode is exactly 2 commits ahead of main"
  PASS=$((PASS+1))
else
  echo "FAIL:commit_count:Expected 2 commits ahead of main, found $AHEAD"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
