#!/usr/bin/env bash
set -euo pipefail

cd /workspace

PASS=0
FAIL=0

ORACLE=$(git rev-parse --verify refs/gitarena/oracles/bisect-bad-sha 2>/dev/null || echo "MISSING")

# Check 1: bad-commit.txt exists
if [ ! -f bad-commit.txt ]; then
  echo "FAIL:file_exists:bad-commit.txt does not exist in /workspace"
  FAIL=$((FAIL+1))
  echo "SCORE:$PASS/$((PASS+FAIL))"
  exit 0
fi
echo "PASS:file_exists:bad-commit.txt exists"
PASS=$((PASS+1))

# Check 2: content is a valid full SHA
SUBMITTED=$(tr -d '[:space:]' < bad-commit.txt)
if echo "$SUBMITTED" | grep -qE "^[0-9a-f]{40}$"; then
  echo "PASS:valid_sha_format:bad-commit.txt contains a valid 40-character SHA"
  PASS=$((PASS+1))
else
  echo "FAIL:valid_sha_format:bad-commit.txt does not contain a valid SHA — got: $SUBMITTED"
  FAIL=$((FAIL+1))
fi

# Check 3: SHA matches the oracle
if [ "$ORACLE" = "MISSING" ]; then
  echo "FAIL:correct_commit:Oracle ref missing — cannot validate expected bad commit SHA"
  FAIL=$((FAIL+1))
elif [ "$SUBMITTED" = "$ORACLE" ]; then
  echo "PASS:correct_commit:SHA matches the commit that introduced the regression"
  PASS=$((PASS+1))
else
  echo "FAIL:correct_commit:SHA is incorrect. Expected: $ORACLE, Got: $SUBMITTED"
  FAIL=$((FAIL+1))
fi

TOTAL=$((PASS+FAIL))
echo "SCORE:$PASS/$TOTAL"
