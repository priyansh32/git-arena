#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

echo "# Shop App" > README.md
git add . && git commit -m "Initial commit"
git branch -M main

git checkout -b feat/payments
echo "payments stub" > payments.js
git add . && git commit -m "feat: scaffold payments module"
git checkout main

# Oracle: main should return to this commit after moving accidental commits.
git update-ref refs/gitarena/oracles/wrong-branch-main-base "$(git rev-parse main)"

# The "accidental" commits on main
echo "const charge = (amount) => {};" > payments.js
git add . && git commit -m "feat: add charge function"

echo "const refund = (id) => {};" >> payments.js
git add . && git commit -m "feat: add refund function"

echo "const history = () => {};" >> payments.js
git add . && git commit -m "feat: add payment history"
