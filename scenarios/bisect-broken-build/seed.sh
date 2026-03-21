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
node -e "
const {add, multiply} = require('./compute');
if (add(2,3) !== 5) process.exit(1);
if (multiply(3,4) !== 12) process.exit(1);
process.exit(0);
" 2>/dev/null && exit 0 || exit 1
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
echo "$BAD_SHA" > /tmp/bad_sha_oracle

for i in 07 08 09 10; do
  echo "// patch $i" >> compute.js
  git add . && git commit -m "commit $i: minor patch"
done
