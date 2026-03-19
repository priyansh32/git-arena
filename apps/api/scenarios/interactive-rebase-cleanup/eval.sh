set -eu
cd /workspace
META_DIR=/workspace/.gitarena
MAIN_SHA=$(cat "$META_DIR/main_sha")
EXPECTED_TREE=$(cat "$META_DIR/expected_tree")
ORIGINAL_WIP_SHA=$(cat "$META_DIR/original_wip_sha")
ORIGINAL_FIXUP_SHA=$(cat "$META_DIR/original_fixup_sha")

if git symbolic-ref -q HEAD >/dev/null 2>&1; then
  CURRENT_BRANCH=$(git branch --show-current)
  echo "ASSERT:head_attached:PASS:15:HEAD is attached to branch '$CURRENT_BRANCH'."
else
  echo "ASSERT:head_attached:FAIL:15:HEAD is detached after cleanup."
fi

AHEAD_COUNT=$(git rev-list --count "$MAIN_SHA"..HEAD)
if [ "$AHEAD_COUNT" -eq 1 ]; then
  echo "ASSERT:single_commit_stack:PASS:30:Feature branch has a single commit on top of main."
else
  echo "ASSERT:single_commit_stack:FAIL:30:Feature branch has $AHEAD_COUNT commits ahead of main; expected exactly 1."
fi

if git merge-base --is-ancestor "$ORIGINAL_WIP_SHA" HEAD || git merge-base --is-ancestor "$ORIGINAL_FIXUP_SHA" HEAD; then
  echo "ASSERT:history_rewritten:FAIL:25:Original WIP/fixup commits are still present in branch history."
else
  echo "ASSERT:history_rewritten:PASS:25:Original WIP/fixup commits are no longer in branch history."
fi

CURRENT_TREE=$(git rev-parse HEAD^{tree})
if [ "$CURRENT_TREE" = "$EXPECTED_TREE" ]; then
  echo "ASSERT:content_preserved:PASS:20:Repository content matches the expected post-cleanup tree."
else
  echo "ASSERT:content_preserved:FAIL:20:Repository content differs from the expected tree."
fi

HEAD_SUBJECT=$(git log -1 --pretty=%s)
HEAD_SUBJECT_LOWER=$(printf '%s' "$HEAD_SUBJECT" | tr '[:upper:]' '[:lower:]')
case "$HEAD_SUBJECT_LOWER" in
  *wip*|*fixup*)
    echo "ASSERT:clean_commit_message:FAIL:10:Final commit message still looks temporary ('$HEAD_SUBJECT')."
    ;;
  *)
    echo "ASSERT:clean_commit_message:PASS:10:Final commit message is cleaned up."
    ;;
esac
