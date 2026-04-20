#!/usr/bin/env bash
set -euo pipefail

# Installs Nginx, provisions TLS using Cloudflare DNS challenge,
# and reverse-proxies ports 80/443 to a local app on APP_PORT.
#
# Usage:
#   sudo ./scripts/setup-nginx-cloudflare.sh -d diary.example.com -e admin@example.com -t <cloudflare_api_token>
#
# Optional:
#   -p <app_port>        (default: 5173)
#   -b <api_port>        (default: 4000)
#   -s <site_name>       (default: diaryapp)
#   -w                   Include www.<domain> in certificate and server_name

DOMAIN=""
EMAIL=""
CF_API_TOKEN=""
APP_PORT="5173"
API_PORT="4000"
SITE_NAME="diaryapp"
INCLUDE_WWW="false"

while getopts ":d:e:t:p:b:s:wh" opt; do
  case "$opt" in
    d) DOMAIN="$OPTARG" ;;
    e) EMAIL="$OPTARG" ;;
    t) CF_API_TOKEN="$OPTARG" ;;
    p) APP_PORT="$OPTARG" ;;
    b) API_PORT="$OPTARG" ;;
    s) SITE_NAME="$OPTARG" ;;
    w) INCLUDE_WWW="true" ;;
    h)
      echo "Usage: sudo $0 -d <domain> -e <email> -t <cloudflare_api_token> [-p app_port] [-b api_port] [-s site_name] [-w]"
      exit 0
      ;;
    *)
      echo "Invalid option: -$OPTARG"
      exit 1
      ;;
  esac
done

if [[ -z "$DOMAIN" || -z "$EMAIL" || -z "$CF_API_TOKEN" ]]; then
  echo "Error: -d, -e, and -t are required."
  echo "Usage: sudo $0 -d <domain> -e <email> -t <cloudflare_api_token> [-p app_port] [-b api_port] [-s site_name] [-w]"
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

NGINX_CONF="/etc/nginx/sites-available/${SITE_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${SITE_NAME}"
CF_CRED_DIR="/root/.secrets/certbot"
CF_CRED_FILE="${CF_CRED_DIR}/cloudflare.ini"
CERT_PATH="/etc/letsencrypt/live/${DOMAIN}"

CERT_DOMAINS=("-d" "$DOMAIN")
SERVER_NAMES="$DOMAIN"

if [[ "$INCLUDE_WWW" == "true" ]]; then
  CERT_DOMAINS+=("-d" "www.${DOMAIN}")
  SERVER_NAMES="$DOMAIN www.${DOMAIN}"
fi

echo "[1/6] Installing dependencies..."
apt-get update
apt-get install -y nginx certbot python3-certbot-dns-cloudflare

echo "[2/6] Writing Cloudflare credentials for certbot..."
mkdir -p "$CF_CRED_DIR"
cat > "$CF_CRED_FILE" <<EOF
# Cloudflare API token with Zone:DNS Edit + Zone:Zone Read
dns_cloudflare_api_token = ${CF_API_TOKEN}
EOF
chmod 600 "$CF_CRED_FILE"

echo "[3/6] Requesting Let's Encrypt certificate via Cloudflare DNS challenge..."
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials "$CF_CRED_FILE" \
  --dns-cloudflare-propagation-seconds 60 \
  --agree-tos \
  --non-interactive \
  --keep-until-expiring \
  -m "$EMAIL" \
  "${CERT_DOMAINS[@]}"

echo "[4/6] Writing nginx reverse proxy config..."
cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAMES};

    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${SERVER_NAMES};

    ssl_certificate ${CERT_PATH}/fullchain.pem;
    ssl_certificate_key ${CERT_PATH}/privkey.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

echo "[5/6] Enabling site and restarting nginx..."
ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "[6/6] Installing certificate auto-renew cron (safe if duplicate)..."
CRON_CMD='certbot renew --quiet --deploy-hook "systemctl reload nginx"'
( crontab -l 2>/dev/null | grep -v -F "$CRON_CMD"; echo "15 3 * * * $CRON_CMD" ) | crontab -

echo
echo "Done."
echo "Nginx now proxies: http(s)://${DOMAIN} -> http://127.0.0.1:${APP_PORT}"
echo "Nginx now proxies API: http(s)://${DOMAIN}/api -> http://127.0.0.1:${API_PORT}"
echo "Cloudflare DNS challenge is configured via ${CF_CRED_FILE}"
