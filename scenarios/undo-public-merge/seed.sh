#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

mkdir -p /repos/origin.git
git init --bare /repos/origin.git
git remote add origin file:///repos/origin.git

echo "# App" > README.md
git add . && git commit -m "Initial commit"
git branch -M main
git push origin main

git checkout -b feat/billing
cat > billing.js <<'EOF'
// BROKEN: charges incorrect amount
function charge(user, amount) { return amount * 100; }
EOF
git add . && git commit -m "feat: add billing module"
git checkout main

git merge feat/billing --no-ff -m "Merge branch 'feat/billing' into main"
git push origin main

# Save merge commit SHA for evaluator
MERGE_SHA=$(git rev-parse HEAD)
git update-ref refs/gitarena/oracles/undo-public-merge-sha "$MERGE_SHA"
