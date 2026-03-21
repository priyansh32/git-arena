#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

cat > ui.js <<'EOF'
const header = "App";
const footer = "2023";
const theme = "light";
EOF
git add . && git commit -m "Initial commit"
git branch -M main

git checkout -b feat/redesign

# Three commits on feat/redesign that each touch ui.js
cat > ui.js <<'EOF'
const header = "SuperApp";
const footer = "2023";
const theme = "light";
EOF
git add . && git commit -m "redesign: update header branding"

cat > ui.js <<'EOF'
const header = "SuperApp";
const footer = "2024";
const theme = "light";
EOF
git add . && git commit -m "redesign: update footer year"

cat > ui.js <<'EOF'
const header = "SuperApp";
const footer = "2024";
const theme = "dark";
EOF
git add . && git commit -m "redesign: switch to dark theme"

git checkout main

# Three commits on main that also touch ui.js — will conflict
cat > ui.js <<'EOF'
const header = "App";
const footer = "2023";
const theme = "light";
const version = "2.0";
EOF
git add . && git commit -m "main: add version constant"

cat > ui.js <<'EOF'
const header = "App";
const footer = "2023";
const theme = "light";
const version = "2.0";
const locale = "en-US";
EOF
git add . && git commit -m "main: add locale constant"

cat > ui.js <<'EOF'
const header = "App";
const footer = "2023";
const theme = "light";
const version = "2.0";
const locale = "en-US";
const analytics = true;
EOF
git add . && git commit -m "main: add analytics flag"
