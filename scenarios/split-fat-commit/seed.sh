#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

echo "# App" > README.md
git add . && git commit -m "Initial commit"
git branch -M main

# The fat commit: three unrelated changes in one
cat > bugfix.js <<'EOF'
function parseDate(str) {
  return new Date(str);
}
EOF

cat > feature.js <<'EOF'
function exportToPDF(doc) {
  return doc.render("pdf");
}
EOF

cat > config.json <<'EOF'
{
  "maxRetries": 5,
  "timeout": 3000
}
EOF

git add .
git commit -m "various changes: fix date parsing, add pdf export, update config"
