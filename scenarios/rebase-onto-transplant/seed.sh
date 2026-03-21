#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

echo "# App" > README.md
git add . && git commit -m "Initial commit"
git branch -M main

# theming branch (will NOT be merged)
git checkout -b feat/theming
echo "const theme = { primary: '#333' };" > theme.js
git add . && git commit -m "feat: base theme object"
echo "const applyTheme = (t) => {};" >> theme.js
git add . && git commit -m "feat: applyTheme function"

# dark-mode branched FROM theming (this is the problem)
git checkout -b feat/dark-mode
echo "const darkMode = { primary: '#000' };" > dark.js
git add . && git commit -m "feat: dark mode palette"
echo "const toggleDark = () => {};" >> dark.js
git add . && git commit -m "feat: dark mode toggle"
