#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

mkdir -p /repos/origin.git
git init --bare /repos/origin.git
git remote add origin file:///repos/origin.git

echo "# App v2" > README.md
git add . && git commit -m "Initial commit"

echo "feature complete" > feature.md
git add . && git commit -m "feat: complete v2 feature set"

echo "bugs squashed" > changelog.md
git add . && git commit -m "fix: resolve all known issues before release"

git branch -M main
git push origin main
