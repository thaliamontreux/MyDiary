#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

export NODE_ENV=production

# Optionally build frontend if dist is missing or empty
if [ ! -d "dist" ] || [ -z "$(ls -A "dist" 2>/dev/null || true)" ]; then
  npm run build
fi

# Start clustered API server
node server/cluster.js &
API_PID=$!

# Start Vite preview server to serve the built frontend
npm run preview -- --host 0.0.0.0 --port 4173 &
WEB_PID=$!

# Wait until one of the processes exits (so systemd can see failures)
wait -n "$API_PID" "$WEB_PID"
exit $?
