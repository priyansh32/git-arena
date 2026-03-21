#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

echo "# App" > README.md
git add . && git commit -m "Initial commit"
git branch -M main

git checkout -b feat/search
echo "const search = (query) => {};" > search.js
git add . && git commit -m "feat: add search stub"

echo "const indexResults = (results) => {};" >> search.js
git add . && git commit -m "feat: add result indexing"

echo "const highlight = (term, results) => {};" >> search.js
git add . && git commit -m "feat: add result highlighting"

git checkout main

# "Accidentally" delete the branch
git branch -D feat/search
