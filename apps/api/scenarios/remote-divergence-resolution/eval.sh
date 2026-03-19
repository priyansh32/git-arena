set -eu
cd /workspace
META_DIR=/workspace/.gitarena
LOCAL_SHA=$(cat "$META_DIR/local_sha")
REMOTE_SHA=$(cat "$META_DIR/remote_sha")

if git symbolic-ref -q HEAD >/dev/null 2>&1; then
  CURRENT_BRANCH=$(git branch --show-current)
  echo "ASSERT:head_attached:PASS:15:HEAD is attached to branch '$CURRENT_BRANCH'."
else
  echo "ASSERT:head_attached:FAIL:15:HEAD is detached."
fi

if git rev-parse --verify --quiet refs/remotes/origin/main >/dev/null 2>&1; then
  echo "ASSERT:origin_visible:PASS:15:origin/main is available locally."
else
  echo "ASSERT:origin_visible:FAIL:15:origin/main is missing."
fi

COUNTS=$(git rev-list --left-right --count HEAD...origin/main)
AHEAD=$(printf '%s' "$COUNTS" | awk '{print $1}')
BEHIND=$(printf '%s' "$COUNTS" | awk '{print $2}')
if [ "$AHEAD" -eq 0 ] && [ "$BEHIND" -eq 0 ]; then
  echo "ASSERT:branch_synchronized:PASS:30:Local branch is synchronized with origin/main."
else
  echo "ASSERT:branch_synchronized:FAIL:30:Local branch is ahead by $AHEAD and behind by $BEHIND relative to origin/main."
fi

if git merge-base --is-ancestor "$LOCAL_SHA" HEAD && git merge-base --is-ancestor "$REMOTE_SHA" HEAD; then
  echo "ASSERT:history_preserved:PASS:30:Both local and remote changes are preserved."
else
  echo "ASSERT:history_preserved:FAIL:30:Local or remote commit history was lost."
fi

if [ -z "$(git status --porcelain)" ]; then
  echo "ASSERT:worktree_clean:PASS:10:Working tree is clean after reconciliation."
else
  echo "ASSERT:worktree_clean:FAIL:10:Working tree has uncommitted changes."
fi
