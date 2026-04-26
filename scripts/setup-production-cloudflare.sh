#!/usr/bin/env bash
set -euo pipefail

# One-command production setup (single box):
# - Builds frontend static files
# - Runs Node API as a systemd service
# - Configures Nginx + TLS (Cloudflare DNS challenge)
# - Routes:
#   /api -> Node API (default 127.0.0.1:4000)
#   /    -> built frontend (dist)
#
# Usage:
#   sudo ./scripts/setup-production-cloudflare.sh \
#     -d mydiary.example.com \
#     -e admin@example.com \
#     -t CLOUDFLARE_API_TOKEN \
#     -a /opt/MyDiary
#
# Optional:
#   -p <api_port>        (default: 4000)
#   -s <site_name>       (default: mydiary)
#   -n <service_name>    (default: mydiary-api)
#   -u <service_user>    (default: www-data)
#   -w                   Include www.<domain> in certificate and server_name

DOMAIN=""
EMAIL=""
CF_API_TOKEN=""
APP_DIR=""
API_PORT="4000"
SITE_NAME="mydiary"
SERVICE_NAME="mydiary-api"
SERVICE_USER="www-data"
INCLUDE_WWW="false"

while getopts ":d:e:t:a:p:s:n:u:wh" opt; do
  case "$opt" in
    d) DOMAIN="$OPTARG" ;;
    e) EMAIL="$OPTARG" ;;
    t) CF_API_TOKEN="$OPTARG" ;;
    a) APP_DIR="$OPTARG" ;;
    p) API_PORT="$OPTARG" ;;
    s) SITE_NAME="$OPTARG" ;;
    n) SERVICE_NAME="$OPTARG" ;;
    u) SERVICE_USER="$OPTARG" ;;
    w) INCLUDE_WWW="true" ;;
    h)
      echo "Usage: sudo $0 -d <domain> -e <email> -t <cloudflare_api_token> -a <app_dir> [-p api_port] [-s site_name] [-n service_name] [-u service_user] [-w]"
      exit 0
      ;;
    *)
      echo "Invalid option: -$OPTARG"
      exit 1
      ;;
  esac
done

if [[ -z "$DOMAIN" || -z "$EMAIL" || -z "$CF_API_TOKEN" || -z "$APP_DIR" ]]; then
  echo "Error: -d, -e, -t, and -a are required."
  echo "Usage: sudo $0 -d <domain> -e <email> -t <cloudflare_api_token> -a <app_dir> [-p api_port] [-s site_name] [-n service_name] [-u service_user] [-w]"
  exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "Please run as root (use sudo)."
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This script currently supports Debian/Ubuntu systems (apt-get required)."
  exit 1
fi

if [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "Could not find package.json in APP_DIR: $APP_DIR"
  exit 1
fi

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  echo "Service user '$SERVICE_USER' does not exist."
  exit 1
fi

NGINX_CONF="/etc/nginx/sites-available/${SITE_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${SITE_NAME}"
CF_CRED_DIR="/root/.secrets/certbot"
CF_CRED_FILE="${CF_CRED_DIR}/cloudflare.ini"
CERT_PATH="/etc/letsencrypt/live/${DOMAIN}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

CERT_DOMAINS=("-d" "$DOMAIN")
SERVER_NAMES="$DOMAIN"
if [[ "$INCLUDE_WWW" == "true" ]]; then
  CERT_DOMAINS+=("-d" "www.${DOMAIN}")
  SERVER_NAMES="$DOMAIN www.${DOMAIN}"
fi

echo "[1/7] Installing system dependencies..."
apt-get update
apt-get install -y nginx certbot python3-certbot-dns-cloudflare curl ca-certificates

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Installing Node 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "[2/7] Installing app deps + building frontend..."
cd "$APP_DIR"
npm ci
npm run build

if [[ ! -f "$APP_DIR/dist/index.html" ]]; then
  echo "Build failed: dist/index.html not found"
  exit 1
fi

echo "[3/7] Writing systemd service for API..."
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=MyDiary API Service
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/env node server/cluster.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo "[4/7] Waiting for API health endpoint..."
for i in {1..20}; do
  if curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then
  echo "API did not become healthy on 127.0.0.1:${API_PORT}."
  echo "Run: journalctl -u ${SERVICE_NAME} -n 200 --no-pager"
  exit 1
fi

echo "[5/7] Writing Cloudflare credentials for certbot..."
mkdir -p "$CF_CRED_DIR"
cat > "$CF_CRED_FILE" <<EOF
# Cloudflare API token with Zone:DNS Edit + Zone:Zone Read
dns_cloudflare_api_token = ${CF_API_TOKEN}
EOF
chmod 600 "$CF_CRED_FILE"

echo "[6/7] Requesting Let's Encrypt cert via Cloudflare DNS challenge..."
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials "$CF_CRED_FILE" \
  --dns-cloudflare-propagation-seconds 60 \
  --agree-tos \
  --non-interactive \
  --keep-until-expiring \
  -m "$EMAIL" \
  "${CERT_DOMAINS[@]}"

echo "[7/7] Writing nginx site config and reloading..."
cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAMES};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${SERVER_NAMES};

    ssl_certificate ${CERT_PATH}/fullchain.pem;
    ssl_certificate_key ${CERT_PATH}/privkey.pem;

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript application/xml+rss image/svg+xml;

    root ${APP_DIR}/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Theme backgrounds and assets
    location /themes/ {
        alias ${APP_DIR}/themes/;
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
        try_files $uri =404;
    }

    location /assets/ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
        try_files \$uri =404;
    }

    location / {
        try_files \$uri /index.html;
    }
}
EOF

ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

CRON_CMD='certbot renew --quiet --deploy-hook "systemctl reload nginx"'
( crontab -l 2>/dev/null | grep -v -F "$CRON_CMD"; echo "15 3 * * * $CRON_CMD" ) | crontab -

echo
echo "Done."
echo "Frontend: https://${DOMAIN}"
echo "API health: https://${DOMAIN}/api/health"
echo "Service logs: journalctl -u ${SERVICE_NAME} -f"
