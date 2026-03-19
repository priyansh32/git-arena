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
printf '%s\n' "$LOCAL_SHA" > "$META_DIR/local_sha"
printf '%s\n' "$REMOTE_SHA" > "$META_DIR/remote_sha"
