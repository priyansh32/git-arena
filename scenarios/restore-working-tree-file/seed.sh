#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

cat > app.js <<'EOF'
const port = 3000;

function startServer() {
  return `Starting on ${port}`;
}
EOF

echo "# Sample App" > README.md
git add . && git commit -m "Initial commit"
git branch -M main

echo "Run with node app.js" > docs.md
git add docs.md && git commit -m "docs: add startup note"

# Accidental local edit that should be discarded
cat > app.js <<'EOF'
const port = 5000;

function startServer() {
  console.log("DEBUG MODE");
  return `Starting on ${port}`;
}
EOF
