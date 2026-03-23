#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

# Set up upstream bare repo
mkdir -p /repos/upstream.git /repos/origin.git
git init --bare /repos/upstream.git
git init --bare /repos/origin.git
git --git-dir=/repos/upstream.git symbolic-ref HEAD refs/heads/main
git --git-dir=/repos/origin.git symbolic-ref HEAD refs/heads/main

git remote add upstream file:///repos/upstream.git
git remote add origin file:///repos/origin.git

echo "# Open Source Project" > README.md
git add . && git commit -m "Initial commit"
git branch -M main
git push upstream main
git push origin main

# Your fork commits (made before upstream moved)
echo "const myFeature = () => {};" > my-feature.js
git add . && git commit -m "feat: add my feature (fork contribution)"
echo "const myHelper = () => {};" > my-helper.js
git add . && git commit -m "chore: add helper utilities"
git push origin main

# Simulate upstream moving forward (via temp clone)
TMPDIR=$(mktemp -d)
git clone file:///repos/upstream.git "$TMPDIR/upstream-clone" -q
cd "$TMPDIR/upstream-clone"
git checkout -q main 2>/dev/null || git checkout -q -b main origin/main
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"
echo "const coreA = {};" > core-a.js && git add . && git commit -m "upstream: core module A"
echo "const coreB = {};" > core-b.js && git add . && git commit -m "upstream: core module B"
echo "const coreC = {};" > core-c.js && git add . && git commit -m "upstream: core module C"
git push origin main -q

# Reset local main back to before the fork commits (simulate old fork state)
cd /workspace
git reset --hard HEAD~2
