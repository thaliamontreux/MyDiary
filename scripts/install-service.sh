#!/usr/bin/env bash
# MyDiary installer: installs the app as systemd services on Linux,
# with an auto-updater timer that pulls from git and rebuilds on new commits.
#
# Usage (as root or with sudo):
#   sudo APP_DIR=/opt/mydiary SERVICE_USER=mydiary ./scripts/install-service.sh
#
# Variables (override with env):
#   APP_DIR         Target install directory (default: current checkout)
#   SERVICE_USER    System user to run services (default: mydiary)
#   UPDATE_INTERVAL systemd OnUnitActiveSec value (default: 5min)
#   BRANCH          Git branch to track (default: main)
#
# This script is idempotent - safe to re-run.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

APP_DIR="${APP_DIR:-$REPO_DIR}"
SERVICE_USER="${SERVICE_USER:-mydiary}"
UPDATE_INTERVAL="${UPDATE_INTERVAL:-5min}"
BRANCH="${BRANCH:-main}"

if [ "$EUID" -ne 0 ]; then
  echo "This script must be run as root (try: sudo $0)" >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd is required (systemctl not found)" >&2
  exit 1
fi

echo "=== MyDiary installer ==="
echo "APP_DIR         = $APP_DIR"
echo "SERVICE_USER    = $SERVICE_USER"
echo "UPDATE_INTERVAL = $UPDATE_INTERVAL"
echo "BRANCH          = $BRANCH"
echo ""

# 1. Ensure service user exists
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  echo "[install] creating system user $SERVICE_USER"
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

# 2. If APP_DIR is different from current checkout, clone/copy
if [ "$APP_DIR" != "$REPO_DIR" ]; then
  if [ ! -d "$APP_DIR/.git" ]; then
    echo "[install] copying project to $APP_DIR"
    mkdir -p "$APP_DIR"
    rsync -a --delete --exclude node_modules --exclude dist "$REPO_DIR/" "$APP_DIR/"
  fi
fi

cd "$APP_DIR"

# 3. Ownership
echo "[install] setting ownership to $SERVICE_USER"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

# 4. Ensure Node.js is available
if ! command -v node >/dev/null 2>&1; then
  echo "[install] Node.js not found - please install Node.js 18+ before running this script" >&2
  exit 1
fi
NODE_VERSION="$(node -v)"
echo "[install] using Node.js $NODE_VERSION"

# 5. Install deps + build as service user
echo "[install] installing npm dependencies"
sudo -u "$SERVICE_USER" bash -lc "cd '$APP_DIR' && npm install --no-audit --no-fund"

echo "[install] building frontend"
sudo -u "$SERVICE_USER" bash -lc "cd '$APP_DIR' && npm run build"

# 6. Make scripts executable
chmod +x "$APP_DIR/scripts/update.sh" "$APP_DIR/scripts/install-service.sh" 2>/dev/null || true
chmod +x "$APP_DIR/start-all.sh" 2>/dev/null || true

# 7. Configure sudoers so the service user can restart its services
SUDOERS_FILE="/etc/sudoers.d/mydiary-updater"
echo "[install] configuring passwordless systemctl restart for $SERVICE_USER"
cat > "$SUDOERS_FILE" <<EOF
# Allow the MyDiary service user to restart its own services unattended
$SERVICE_USER ALL=(root) NOPASSWD: /bin/systemctl restart mydiary-api.service, /bin/systemctl restart mydiary-web.service, /usr/bin/systemctl restart mydiary-api.service, /usr/bin/systemctl restart mydiary-web.service
EOF
chmod 0440 "$SUDOERS_FILE"

# 8. Install systemd unit files from templates
render_template() {
  local src="$1"
  local dst="$2"
  sed \
    -e "s|{{APP_DIR}}|$APP_DIR|g" \
    -e "s|{{SERVICE_USER}}|$SERVICE_USER|g" \
    -e "s|{{UPDATE_INTERVAL}}|$UPDATE_INTERVAL|g" \
    "$src" > "$dst"
}

echo "[install] installing systemd unit files to /etc/systemd/system"
render_template "$APP_DIR/deploy/systemd/mydiary-api.service.template"     /etc/systemd/system/mydiary-api.service
render_template "$APP_DIR/deploy/systemd/mydiary-web.service.template"     /etc/systemd/system/mydiary-web.service
render_template "$APP_DIR/deploy/systemd/mydiary-updater.service.template" /etc/systemd/system/mydiary-updater.service
render_template "$APP_DIR/deploy/systemd/mydiary-updater.timer.template"   /etc/systemd/system/mydiary-updater.timer

# 9. Reload systemd + enable + start
echo "[install] reloading systemd"
systemctl daemon-reload

echo "[install] enabling + starting mydiary-api.service"
systemctl enable --now mydiary-api.service

echo "[install] enabling + starting mydiary-web.service"
systemctl enable --now mydiary-web.service

echo "[install] enabling + starting mydiary-updater.timer"
systemctl enable --now mydiary-updater.timer

# 10. Summary
echo ""
echo "=== Install complete ==="
echo "API:     systemctl status mydiary-api.service"
echo "Web:     systemctl status mydiary-web.service"
echo "Updater: systemctl status mydiary-updater.timer"
echo ""
echo "View logs:"
echo "  journalctl -u mydiary-api.service -f"
echo "  journalctl -u mydiary-web.service -f"
echo "  journalctl -u mydiary-updater.service -f"
echo ""
echo "Force an update now:"
echo "  sudo systemctl start mydiary-updater.service"
echo ""
