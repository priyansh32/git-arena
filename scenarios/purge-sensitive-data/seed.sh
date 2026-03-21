#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

echo "# App" > README.md
git add . && git commit -m "Initial commit"
git branch -M main
git checkout -b feat/integrations

echo "const stripe = require('stripe');" > stripe.js
git add . && git commit -m "feat: add stripe client"

# The accidental commit
cat > secrets.env <<'EOF'
STRIPE_SECRET_KEY=sk_live_FAKEKEYFORSCENARIO12345
DATABASE_URL=postgres://admin:hunter2@prod-db:5432/shop
EOF
git add . && git commit -m "chore: add env config"

echo "module.exports = { charge: async () => {} };" >> stripe.js
git add . && git commit -m "feat: implement charge function"

echo "module.exports.refund = async () => {};" >> stripe.js
git add . && git commit -m "feat: implement refund function"
