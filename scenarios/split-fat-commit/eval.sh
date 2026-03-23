#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

# Check 1: exactly 3 commits replace the fat commit (Initial + 3 split commits = 4 total)
COMMIT_COUNT=$(git rev-list HEAD --count)
if [ "$COMMIT_COUNT" -eq 4 ]; then
  echo "PASS:commit_count:History has exactly 4 commits (Initial + 3 split commits)"
  PASS=$((PASS+1))
else
  echo "FAIL:commit_count:Expected exactly 4 commits, found $COMMIT_COUNT"
  FAIL=$((FAIL+1))
fi

# Check 2: each of the three newest commits must touch exactly one of the target files
readarray -t NEWEST_THREE < <(git rev-list --reverse main | tail -n 3)
if [ "${#NEWEST_THREE[@]}" -ne 3 ]; then
  echo "FAIL:split_shape:Expected three commits after the initial commit"
  FAIL=$((FAIL+1))
else
  SPLIT_OK=true
  TOUCHED=""
  for sha in "${NEWEST_THREE[@]}"; do
    FILE_COUNT=$(git diff-tree --no-commit-id -r --name-only "$sha" | sed '/^$/d' | wc -l | tr -d ' ')
    if [ "$FILE_COUNT" -ne 1 ]; then
      SPLIT_OK=false
      break
    fi
    FILE=$(git diff-tree --no-commit-id -r --name-only "$sha" | head -n 1)
    case "$FILE" in
      bugfix.js|feature.js|config.json)
        TOUCHED="${TOUCHED}${FILE}"$'\n'
        ;;
      *)
        SPLIT_OK=false
        ;;
    esac
  done

  UNIQUE_TARGETS=$(printf "%s" "$TOUCHED" | sed '/^$/d' | sort -u | wc -l | tr -d ' ')
  if $SPLIT_OK && [ "$UNIQUE_TARGETS" -eq 3 ]; then
    echo "PASS:split_shape:Three newest commits each touch exactly one target file"
    PASS=$((PASS+1))
  else
    echo "FAIL:split_shape:Split commits are not isolated to one target file each"
    FAIL=$((FAIL+1))
  fi
fi

# Check 3: all three files exist with correct content
if [ -f bugfix.js ] && grep -q "parseDate" bugfix.js; then
  echo "PASS:bugfix_content:bugfix.js has correct content"
  PASS=$((PASS+1))
else
  echo "FAIL:bugfix_content:bugfix.js is missing or has wrong content"
  FAIL=$((FAIL+1))
fi

if [ -f feature.js ] && grep -q "exportToPDF" feature.js; then
  echo "PASS:feature_content:feature.js has correct content"
  PASS=$((PASS+1))
else
  echo "FAIL:feature_content:feature.js is missing or has wrong content"
  FAIL=$((FAIL+1))
fi

if [ -f config.json ] && grep -q "maxRetries" config.json; then
  echo "PASS:config_content:config.json has correct content"
  PASS=$((PASS+1))
else
  echo "FAIL:config_content:config.json is missing or has wrong content"
  FAIL=$((FAIL+1))
fi

# Check 4: working tree clean
if [ -z "$(git status --porcelain)" ]; then
  echo "PASS:clean_tree:Working tree is clean"
  PASS=$((PASS+1))
else
  echo "FAIL:clean_tree:Working tree is not clean"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
