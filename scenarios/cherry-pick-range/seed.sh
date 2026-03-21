#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

echo "# App" > README.md
git add . && git commit -m "Initial commit"
git branch -M main

git checkout -b feat/v2

# Unfinished work interleaved with the ready commits
echo "v2 api draft" > api-v2.js && git add . && git commit -m "wip: v2 api draft"
echo "v2 auth draft" > auth-v2.js && git add . && git commit -m "wip: v2 auth draft"

# READY: bug fix (mark clearly for evaluator)
echo "function sanitize(input) { return input.trim(); }" > sanitize.js
git add . && git commit -m "fix: input sanitization regression [cherry-pick-me]"

echo "v2 db draft" > db-v2.js && git add . && git commit -m "wip: v2 db schema"

# READY: test 1
echo "test('sanitize trims input', () => {});" > sanitize.test.js
git add . && git commit -m "test: sanitize unit test [cherry-pick-me]"

echo "v2 cache draft" > cache-v2.js && git add . && git commit -m "wip: v2 caching layer"
echo "v2 queue draft" > queue-v2.js && git add . && git commit -m "wip: v2 job queue"

# READY: test 2
echo "test('sanitize handles null', () => {});" >> sanitize.test.js
git add . && git commit -m "test: sanitize null input test [cherry-pick-me]"

echo "v2 logging" > logging-v2.js && git add . && git commit -m "wip: v2 logging"
echo "v2 metrics" > metrics-v2.js && git add . && git commit -m "wip: v2 metrics"

git checkout main
