#!/usr/bin/env bash
# MyDiary auto-updater: fetches from git, rebuilds if there are new commits,
# and restarts the systemd services. Safe to run on a timer.
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$APP_DIR"

# Add node_modules/.bin to PATH so locally installed binaries (e.g., vite) can be found
export PATH="$APP_DIR/node_modules/.bin:/usr/local/bin:/usr/bin:/bin:$PATH"

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

# Stop services before clean install to prevent crashes when node_modules is deleted
log "stopping services"
for svc in mydiary-api mydiary-web; do
  if systemctl list-unit-files | grep -q "^${svc}.service"; then
    log "stopping ${svc}.service"
    systemctl stop "${svc}.service" || true
  fi
done

# Clean install: remove node_modules and package-lock.json to fix broken state
log "cleaning node_modules and package-lock.json"
rm -rf "$APP_DIR/node_modules" "$APP_DIR/package-lock.json"

# Install deps. We use `npm install` (not `npm ci`) so that drift between
# package.json and package-lock.json does not abort the update. This also
# ensures dev deps (e.g. vite) are present for the build step below.
# We include dev deps because NODE_ENV=production in systemd would skip them.
log "running npm install"
npm install --include=dev --no-audit --no-fund

log "building frontend"
npm run build

# Restart services if they exist
for svc in mydiary-api mydiary-web; do
  if systemctl list-unit-files | grep -q "^${svc}.service"; then
    log "restarting ${svc}.service"
    systemctl restart "${svc}.service" || true
  fi
done

log "update complete at $(git rev-parse HEAD)"
