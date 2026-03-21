#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

echo "# App" > README.md
git add . && git commit -m "Initial commit"
git branch -M main

git checkout -b feat/user-auth

echo "const login = () => {};" > auth.js
git add . && git commit -m "wip"

echo "const logout = () => {};" >> auth.js
git add . && git commit -m "more stuff"

echo "const register = () => {};" >> auth.js
git add . && git commit -m "added register"

echo "// token validation" >> auth.js
git add . && git commit -m "tokens maybe"

echo "const refreshToken = () => {};" >> auth.js
git add . && git commit -m "done i think"
