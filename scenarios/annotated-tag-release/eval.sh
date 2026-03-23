#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0
TOTAL=5

# Check 1: tag v2.0.0 exists locally
if git tag | grep -q "^v2.0.0$"; then
  echo "PASS:tag_exists:Tag v2.0.0 exists locally"
  PASS=$((PASS+1))
else
  echo "FAIL:tag_exists:Tag v2.0.0 does not exist"
  FAIL=$((FAIL+1))
  echo "SCORE:$PASS/$TOTAL"
  exit 0
fi

# Check 2: tag is annotated (object type is 'tag', not 'commit')
TAG_TYPE=$(git cat-file -t v2.0.0)
if [ "$TAG_TYPE" = "tag" ]; then
  echo "PASS:annotated_tag:v2.0.0 is an annotated tag object"
  PASS=$((PASS+1))
else
  echo "FAIL:annotated_tag:v2.0.0 is a lightweight tag (type: $TAG_TYPE) — use git tag -a"
  FAIL=$((FAIL+1))
fi

# Check 3: tag points to HEAD of main
TAG_COMMIT=$(git rev-list -n 1 v2.0.0)
MAIN_HEAD=$(git rev-parse main)
if [ "$TAG_COMMIT" = "$MAIN_HEAD" ]; then
  echo "PASS:tag_points_to_main:v2.0.0 points to HEAD of main"
  PASS=$((PASS+1))
else
  echo "FAIL:tag_points_to_main:v2.0.0 does not point to main HEAD"
  FAIL=$((FAIL+1))
fi

# Check 4: tag has a non-empty message
TAG_MSG=$(git tag -l --format='%(contents)' v2.0.0 | tr -d '[:space:]')
if [ -n "$TAG_MSG" ]; then
  echo "PASS:tag_message:Tag has a non-empty message"
  PASS=$((PASS+1))
else
  echo "FAIL:tag_message:Tag message is empty"
  FAIL=$((FAIL+1))
fi

# Check 5: tag pushed to origin
git fetch origin --tags -q 2>/dev/null || true
if git ls-remote origin refs/tags/v2.0.0 | grep -q "v2.0.0"; then
  echo "PASS:tag_pushed:v2.0.0 tag is present on origin"
  PASS=$((PASS+1))
else
  echo "FAIL:tag_pushed:v2.0.0 tag has not been pushed to origin"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
