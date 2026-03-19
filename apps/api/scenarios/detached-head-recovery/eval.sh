set -eu
cd /workspace
META_DIR=/workspace/.gitarena
DETACHED_SHA=$(cat "$META_DIR/detached_sha")

if git symbolic-ref -q HEAD >/dev/null 2>&1; then
  CURRENT_BRANCH=$(git branch --show-current)
  echo "ASSERT:not_detached:PASS:30:HEAD is on branch '$CURRENT_BRANCH'."
else
  echo "ASSERT:not_detached:FAIL:30:HEAD is detached. Checkout or create a branch before submitting."
fi

if git show-ref --verify --quiet refs/heads/feature/recovery; then
  if git merge-base --is-ancestor "$DETACHED_SHA" feature/recovery; then
    echo "ASSERT:recovery_branch_contains_work:PASS:40:Branch 'feature/recovery' contains the detached work commit."
  else
    echo "ASSERT:recovery_branch_contains_work:FAIL:40:Branch 'feature/recovery' exists but does not contain detached work."
  fi
else
  echo "ASSERT:recovery_branch_contains_work:FAIL:40:Expected branch 'feature/recovery' was not found."
fi

if git branch --contains "$DETACHED_SHA" | grep -q .; then
  echo "ASSERT:detached_commit_preserved:PASS:20:Detached commit remains reachable from at least one branch."
else
  echo "ASSERT:detached_commit_preserved:FAIL:20:Detached commit is unreachable from all branches."
fi

if git rev-parse --verify --quiet refs/tags/v0.1 >/dev/null 2>&1; then
  echo "ASSERT:tag_preserved:PASS:10:Tag v0.1 is still present."
else
  echo "ASSERT:tag_preserved:FAIL:10:Tag v0.1 was removed."
fi
