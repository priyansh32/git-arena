#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

cat > api.js <<'EOF'
function getUser(id) {
  return db.find(id);
}
EOF
git add . && git commit -m "Initial commit"
git branch -M main

git checkout -b feat/recommendations
echo "function recommend(userId) { return []; }" > recommend.js
git add . && git commit -m "feat: scaffold recommendation engine"

# In-progress changes (NOT committed — user is mid-feature)
cat >> recommend.js <<'EOF'

// WIP: collaborative filtering (not ready to commit)
function collaborativeFilter(matrix) {
  return matrix.reduce((acc, row) => acc.concat(row), []);
}
EOF
# Do NOT stage or commit this — leave it as unstaged changes
