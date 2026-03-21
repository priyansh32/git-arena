#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

mkdir -p packages/logger packages/auth packages/db

echo "module.exports = { log: () => {} };" > packages/logger/index.js
echo "module.exports = { login: () => {} };" > packages/auth/index.js
echo "module.exports = { query: () => {} };" > packages/db/index.js
git add . && git commit -m "Initial commit: scaffold all packages"

echo "const levels = ['info','warn','error'];" >> packages/logger/index.js
git add packages/logger && git commit -m "logger: add log levels"

echo "module.exports.hash = () => {};" >> packages/auth/index.js
git add packages/auth && git commit -m "auth: add password hashing"

echo "const formatLog = (level, msg) => \`[\${level}] \${msg}\`;" >> packages/logger/index.js
git add packages/logger && git commit -m "logger: add log formatter"

echo "module.exports.pool = {};" >> packages/db/index.js
git add packages/db && git commit -m "db: add connection pool"

echo "const writeLog = (entry) => process.stdout.write(entry);" >> packages/logger/index.js
git add packages/logger && git commit -m "logger: add write function"
