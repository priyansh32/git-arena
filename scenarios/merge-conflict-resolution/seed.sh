#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

cat > app.js <<'EOF'
function processOrder(order) {
  return order;
}
EOF
git add . && git commit -m "Initial commit"
git branch -M main

git checkout -b feat/logging
cat > app.js <<'EOF'
function processOrder(order) {
  console.log("Processing order:", order.id);
  return order;
}
EOF
git add . && git commit -m "feat: add order logging"
git checkout main

# Conflicting change on main
cat > app.js <<'EOF'
function processOrder(order) {
  if (!order) throw new Error("Order is required");
  return order;
}
EOF
git add . && git commit -m "fix: add null check for order"

# Initiate the merge to leave user in conflict state
git merge feat/logging --no-ff || true
