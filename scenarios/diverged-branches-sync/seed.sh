#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

mkdir -p /repos/origin.git
git init --bare /repos/origin.git
git --git-dir=/repos/origin.git symbolic-ref HEAD refs/heads/main
git remote add origin file:///repos/origin.git

echo "# App" > README.md
git add . && git commit -m "Initial commit"
git branch -M main
git push origin main

# Simulate remote commits by pushing directly to bare repo via a temp clone
TMPDIR=$(mktemp -d)
git clone file:///repos/origin.git "$TMPDIR/remote-clone" -q
cd "$TMPDIR/remote-clone"
git checkout -q main 2>/dev/null || git checkout -q -b main origin/main
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

echo "remote change 1" > remote1.md && git add . && git commit -m "remote: add docs section 1"
echo "remote change 2" > remote2.md && git add . && git commit -m "remote: add docs section 2"
echo "remote change 3" > remote3.md && git add . && git commit -m "remote: add docs section 3"
git push origin main -q

cd /workspace

# User's local commits (made before fetching, so now diverged)
echo "local change 1" > local1.md && git add . && git commit -m "local: feature flag config"
echo "local change 2" > local2.md && git add . && git commit -m "local: add CI badge"
