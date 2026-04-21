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

APP_DIR="${APP_DIR:-/opt/MyDiary}"
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

# 1. Ensure service user exists with home = APP_DIR
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  echo "[install] creating system user $SERVICE_USER with home $APP_DIR"
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
else
  CURRENT_HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6)"
  if [ "$CURRENT_HOME" != "$APP_DIR" ]; then
    echo "[install] updating $SERVICE_USER home: $CURRENT_HOME -> $APP_DIR"
    usermod --home "$APP_DIR" "$SERVICE_USER" || true
  fi
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
# Guard: refuse to chown inside /home/<someone> unless SERVICE_USER matches that user
case "$APP_DIR" in
  /home/*)
    HOME_OWNER="$(echo "$APP_DIR" | awk -F/ '{print $3}')"
    if [ -n "$HOME_OWNER" ] && [ "$HOME_OWNER" != "$SERVICE_USER" ]; then
      echo ""
      echo "ERROR: Refusing to chown $APP_DIR to $SERVICE_USER." >&2
      echo "       It lives inside /home/$HOME_OWNER which would lock that user out." >&2
      echo "" >&2
      echo "Choose one:" >&2
      echo "  1) Reinstall under /opt/mydiary (recommended):" >&2
      echo "       sudo git clone https://github.com/thaliamontreux/MyDiary /opt/mydiary" >&2
      echo "       sudo APP_DIR=/opt/mydiary SERVICE_USER=$SERVICE_USER \\" >&2
      echo "            /opt/mydiary/scripts/install-service.sh" >&2
      echo "" >&2
      echo "  2) Run the service as the home's owner ($HOME_OWNER):" >&2
      echo "       sudo APP_DIR=$APP_DIR SERVICE_USER=$HOME_OWNER \\" >&2
      echo "            $APP_DIR/scripts/install-service.sh" >&2
      echo "" >&2
      exit 2
    fi
    ;;
esac
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
# Use non-login shell (no -l) and force HOME to APP_DIR so npm cache lives there,
# not in a stale $HOME from an earlier install.
echo "[install] installing npm dependencies"
sudo -H -u "$SERVICE_USER" env HOME="$APP_DIR" bash -c "cd '$APP_DIR' && npm install --no-audit --no-fund"

echo "[install] building frontend"
sudo -H -u "$SERVICE_USER" env HOME="$APP_DIR" bash -c "cd '$APP_DIR' && npm run build"

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
