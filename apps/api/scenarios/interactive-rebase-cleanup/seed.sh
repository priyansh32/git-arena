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

printf '\nfeature_line=one\n' >> app.txt
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
printf '%s\n' "$WIP_SHA" > "$META_DIR/original_wip_sha"
printf '%s\n' "$FIXUP_SHA" > "$META_DIR/original_fixup_sha"
