#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

# Build 10-commit history; inject bug at commit 6
cat > compute.js <<'EOF'
function add(a, b) { return a + b; }
function multiply(a, b) { return a * b; }
EOF

cat > test.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if grep -q "return a - b" compute.js 2>/dev/null; then
  exit 1
fi

exit 0
EOF
chmod +x test.sh

git add . && git commit -m "commit 01: initial implementation"

for i in 02 03 04 05; do
  echo "// refactor pass $i" >> compute.js
  git add . && git commit -m "commit $i: refactor pass"
done

# Introduce the bug at commit 06
cat > compute.js <<'EOF'
function add(a, b) { return a - b; }
function multiply(a, b) { return a * b; }
EOF
git add . && git commit -m "commit 06: performance optimisation"

# Store the bad SHA for the evaluator before adding more commits
BAD_SHA=$(git rev-parse HEAD)
git update-ref refs/gitarena/oracles/bisect-bad-sha "$BAD_SHA"

for i in 07 08 09 10; do
  echo "// patch $i" >> compute.js
  git add . && git commit -m "commit $i: minor patch"
done
