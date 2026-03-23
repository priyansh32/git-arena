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

# The three commits that will be "lost"
echo "feat: payment gateway" > payments.md
git add . && git commit -m "feat: payment gateway integration"

echo "feat: email notifications" > email.md
git add . && git commit -m "feat: email notification system"

echo "feat: audit log" > audit.md
git add . && git commit -m "feat: audit logging"

git push origin main

# Store the good SHA
GOOD_SHA=$(git rev-parse HEAD)
git update-ref refs/gitarena/oracles/force-push-good-tip "$GOOD_SHA"

# Simulate a force push from teammate: reset remote to before those 3 commits
BEFORE_THREE=$(git rev-parse HEAD~3)
git push origin "+${BEFORE_THREE}:refs/heads/main"

# Reset local main to match the "damaged" remote to complete the scenario
git reset --hard origin/main
