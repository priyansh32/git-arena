#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

cat > server.js <<'EOF'
function handleRequest(req, res) {
  const data = req.body;
  res.send(data);
}

function startServer(port) {
  console.log("Starting on port", port);
}
EOF
git add . && git commit -m "Initial commit"
git branch -M main

# Simulate both edits already made (user needs to separate them at staging)
cat > server.js <<'EOF'
function handleRequest(req, res) {
  if (!req.body) return res.status(400).send("Bad Request");
  const data = req.body;
  res.send(data);
}

function startServer(port) {
  console.log("Starting on port", port);
}

// EXPERIMENTAL: streaming support (WIP - do not commit)
function streamResponse(req, res) {
  res.setHeader("Transfer-Encoding", "chunked");
  res.write("data...");
  res.end();
}
EOF
