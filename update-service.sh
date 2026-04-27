#!/usr/bin/env bash
set -euo pipefail

# Always run from the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[1/2] Pulling latest changes from git..."
git pull

echo "[2/2] Running install-service.sh..."
./install-service.sh

echo "All done."
