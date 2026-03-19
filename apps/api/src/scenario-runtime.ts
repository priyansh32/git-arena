export interface ScenarioRuntime {
  seedScript: string;
  evaluatorScript: string;
}

const detachedHeadRecoverySeedScript = `
set -eu
WORKSPACE=/workspace
META_DIR="$WORKSPACE/.gitarena"

mkdir -p "$WORKSPACE" "$META_DIR"
cd "$WORKSPACE"

git init -b main >/dev/null
git config user.name "Git Arena"
git config user.email "trainer@gitarena.dev"

cat > README.md <<'EOF'
# Detached HEAD Recovery

Recover the detached commit and keep project history intact.
EOF

git add README.md
git commit -m "chore: initial scaffold" >/dev/null

printf '\\nTrack detached work recovery here.\\n' >> README.md
git add README.md
git commit -m "docs: add challenge notes" >/dev/null
git tag v0.1

git checkout --detach >/dev/null
cat > hotfix.txt <<'EOF'
critical hotfix prepared on detached HEAD
EOF
git add hotfix.txt
git commit -m "feat: detached hotfix" >/dev/null

git rev-parse HEAD > "$META_DIR/detached_sha"
`;

const detachedHeadRecoveryEvaluatorScript = `
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
`;

const interactiveRebaseCleanupSeedScript = `
set -eu
WORKSPACE=/workspace
META_DIR="$WORKSPACE/.gitarena"

mkdir -p "$WORKSPACE" "$META_DIR"
cd "$WORKSPACE"

git init -b main >/dev/null
git config user.name "Git Arena"
git config user.email "trainer@gitarena.dev"

cat > app.txt <<'EOF'
app_mode=baseline
feature_line=none
EOF

git add app.txt
git commit -m "chore: initial app scaffold" >/dev/null

git checkout -b feature/rebase-cleanup >/dev/null

printf '\\nfeature_line=one\\n' >> app.txt
git add app.txt
git commit -m "wip: start feature implementation" >/dev/null
WIP_SHA=$(git rev-parse HEAD)

sed -i 's/feature_line=one/feature_line=one-fixed/' app.txt
git add app.txt
git commit -m "fixup: correct feature line value" >/dev/null
FIXUP_SHA=$(git rev-parse HEAD)

cat > tests.txt <<'EOF'
smoke_test=true
feature_line_expected=one-fixed
EOF

git add tests.txt
git commit -m "wip: add smoke test plan" >/dev/null

git rev-parse main > "$META_DIR/main_sha"
git rev-parse HEAD^{tree} > "$META_DIR/expected_tree"
printf '%s\\n' "$WIP_SHA" > "$META_DIR/original_wip_sha"
printf '%s\\n' "$FIXUP_SHA" > "$META_DIR/original_fixup_sha"
`;

const interactiveRebaseCleanupEvaluatorScript = `
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
`;

const remoteDivergenceResolutionSeedScript = `
set -eu
WORKSPACE=/workspace
META_DIR="$WORKSPACE/.gitarena"
ORIGIN_DIR=/repos/origin.git
TMP_DIR=/tmp/gitarena-remote-seed

rm -rf "$ORIGIN_DIR" "$TMP_DIR"
mkdir -p /repos "$TMP_DIR"

git init --bare "$ORIGIN_DIR" >/dev/null

git init -b main "$TMP_DIR/bootstrap" >/dev/null
cd "$TMP_DIR/bootstrap"
git config user.name "Git Arena"
git config user.email "trainer@gitarena.dev"

cat > notes.txt <<'EOF'
release_notes
- baseline
EOF

git add notes.txt
git commit -m "chore: bootstrap repository" >/dev/null
git remote add origin "$ORIGIN_DIR"
git push -u origin main >/dev/null
git --git-dir="$ORIGIN_DIR" symbolic-ref HEAD refs/heads/main

rm -rf "$WORKSPACE"
git clone "$ORIGIN_DIR" "$WORKSPACE" >/dev/null
cd "$WORKSPACE"
git config user.name "Git Arena"
git config user.email "trainer@gitarena.dev"

echo "- local: prepare rollback checklist" >> notes.txt
git add notes.txt
git commit -m "feat: local rollback checklist" >/dev/null
LOCAL_SHA=$(git rev-parse HEAD)

git clone "$ORIGIN_DIR" "$TMP_DIR/remote-update" >/dev/null
cd "$TMP_DIR/remote-update"
git config user.name "Remote Maintainer"
git config user.email "remote@gitarena.dev"
echo "- remote: add deployment checklist" >> notes.txt
git add notes.txt
git commit -m "feat: remote deployment checklist" >/dev/null
REMOTE_SHA=$(git rev-parse HEAD)
git push origin main >/dev/null

cd "$WORKSPACE"
git fetch origin main >/dev/null

mkdir -p "$META_DIR"
printf '%s\\n' "$LOCAL_SHA" > "$META_DIR/local_sha"
printf '%s\\n' "$REMOTE_SHA" > "$META_DIR/remote_sha"
`;

const remoteDivergenceResolutionEvaluatorScript = `
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
`;

const scenarioRuntimes: Record<string, ScenarioRuntime> = {
  "detached-head-recovery": {
    seedScript: detachedHeadRecoverySeedScript,
    evaluatorScript: detachedHeadRecoveryEvaluatorScript
  },
  "interactive-rebase-cleanup": {
    seedScript: interactiveRebaseCleanupSeedScript,
    evaluatorScript: interactiveRebaseCleanupEvaluatorScript
  },
  "remote-divergence-resolution": {
    seedScript: remoteDivergenceResolutionSeedScript,
    evaluatorScript: remoteDivergenceResolutionEvaluatorScript
  }
};

export function getScenarioRuntime(scenarioId: string): ScenarioRuntime {
  const runtime = scenarioRuntimes[scenarioId];
  if (!runtime) {
    throw new Error(`No runtime definition found for scenario '${scenarioId}'`);
  }

  return runtime;
}
