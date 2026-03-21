#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

cat > config.js <<'EOF'
module.exports = {
  host: "localhost",
  port: 3000,
};
EOF
git add . && git commit -m "Initial commit"
git branch -M main

# User starts editing (stash candidate)
cat > config.js <<'EOF'
module.exports = {
  host: "localhost",
  port: 3000,
  timeout: 5000,
};
EOF

# Stash the in-progress work
git stash push -m "wip: add timeout setting"

# Simulate colleague's commit arriving on main
cat > config.js <<'EOF'
module.exports = {
  host: "localhost",
  port: 3000,
  retries: 3,
};
EOF
git add . && git commit -m "feat: add retry configuration"

# Pop the stash to trigger the conflict — leave user in conflict state
git stash pop || true
