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

printf '\nTrack detached work recovery here.\n' >> README.md
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
