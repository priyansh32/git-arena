#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

# Check 1: feat/redesign is based on main (merge-base = main HEAD)
MAIN_HEAD=$(git rev-parse main)
MERGE_BASE=$(git merge-base main feat/redesign)
if [ "$MERGE_BASE" = "$MAIN_HEAD" ]; then
  echo "PASS:rebased_on_main:feat/redesign is rebased onto current main"
  PASS=$((PASS+1))
else
  echo "FAIL:rebased_on_main:feat/redesign is not rebased onto the current main HEAD"
  FAIL=$((FAIL+1))
fi

# Check 2: all three redesign commits present
C1=$(git log feat/redesign --oneline | grep "update header branding" | wc -l || true)
C2=$(git log feat/redesign --oneline | grep "update footer year" | wc -l || true)
C3=$(git log feat/redesign --oneline | grep "switch to dark theme" | wc -l || true)

if [ "$C1" -ge 1 ] && [ "$C2" -ge 1 ] && [ "$C3" -ge 1 ]; then
  echo "PASS:redesign_commits:All three redesign commits are present"
  PASS=$((PASS+1))
else
  echo "FAIL:redesign_commits:One or more redesign commits are missing"
  FAIL=$((FAIL+1))
fi

# Check 3: ui.js contains all expected values
UI_CONTENT=$(git show feat/redesign:ui.js 2>/dev/null || true)
CHECKS=("SuperApp" "2024" "dark" "version" "locale" "analytics")
ALL_OK=true
for term in "${CHECKS[@]}"; do
  if ! echo "$UI_CONTENT" | grep -q "$term"; then
    ALL_OK=false
    break
  fi
done

if $ALL_OK; then
  echo "PASS:ui_content:ui.js contains all expected values from both branches"
  PASS=$((PASS+1))
else
  echo "FAIL:ui_content:ui.js is missing some values — conflict not fully resolved"
  FAIL=$((FAIL+1))
fi

# Check 4: no conflict markers
if ! echo "$UI_CONTENT" | grep -qE "^(<<<<<<<|=======|>>>>>>>)"; then
  echo "PASS:no_markers:No conflict markers in ui.js"
  PASS=$((PASS+1))
else
  echo "FAIL:no_markers:Conflict markers still present in ui.js"
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
