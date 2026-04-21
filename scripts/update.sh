#!/usr/bin/env bash
# MyDiary auto-updater: fetches from git, rebuilds if there are new commits,
# and restarts the systemd services. Safe to run on a timer.
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$APP_DIR"

LOG_TAG="mydiary-updater"
log() { logger -t "$LOG_TAG" -- "$*"; echo "[$LOG_TAG] $*"; }

BRANCH="${MYDIARY_BRANCH:-main}"

log "checking for updates on branch $BRANCH in $APP_DIR"

# Make sure we're on the right branch
git fetch --quiet origin "$BRANCH"

LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
  log "no updates (HEAD=$LOCAL_HEAD)"
  exit 0
fi

log "updates available: $LOCAL_HEAD -> $REMOTE_HEAD; pulling"

# Hard reset to origin to avoid merge conflicts in an unattended context.
# Any local changes will be stashed just in case.
if ! git diff --quiet || ! git diff --cached --quiet; then
  log "local changes detected; stashing"
  git stash push -u -m "mydiary-updater auto stash $(date -Iseconds)" || true
fi

git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

# Install deps (use ci if lockfile is clean, else install)
if [ -f package-lock.json ]; then
  log "running npm ci"
  npm ci --omit=dev --no-audit --no-fund || npm install --no-audit --no-fund
else
  log "running npm install"
  npm install --no-audit --no-fund
fi

# Ensure dev deps (e.g. vite) are available for build
log "installing build deps"
npm install --no-audit --no-fund

log "building frontend"
npm run build

# Restart services if they exist
for svc in mydiary-api mydiary-web; do
  if systemctl list-unit-files | grep -q "^${svc}.service"; then
    log "restarting ${svc}.service"
    sudo -n systemctl restart "${svc}.service" || systemctl --user restart "${svc}.service" || true
  fi
done

log "update complete at $(git rev-parse HEAD)"
