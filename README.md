# MyDiary

MyDiary is an encrypted diary app with multi-user authentication and MySQL-backed vault storage.

## Local development

1. Install dependencies:
   - `npm install`
2. Start API server:
   - `npm run dev:api`
3. Start frontend dev server:
   - `npm run dev`
4. Open the URL printed by Vite (usually `http://localhost:5173`).

## Install as a systemd service (with auto-update from git)

Install MyDiary as persistent systemd services on a Linux box. The installer sets
up three units:

- `mydiary-api.service` — the Node API (clustered)
- `mydiary-web.service` — the frontend served by `vite preview` on port `4173`
- `mydiary-updater.timer` — periodically runs `scripts/update.sh`, which does a
  `git fetch`, pulls if new commits exist on `main`, re-runs `npm install`,
  rebuilds the frontend, and restarts the API + web services

### Steps

1. Clone the repo anywhere (e.g. your home), then run the installer. By default it
   installs to `/opt/MyDiary` and runs as a `mydiary` service user.
   - `git clone https://github.com/thaliamontreux/MyDiary ~/MyDiary`
2. Copy `.env.example` → `.env` in the clone and fill in required values
   (`JWT_SECRET`, MySQL settings). The installer will copy it to `/opt/MyDiary`.
3. Install Node.js 18+ (if not already installed).
4. Run the installer (as root):
   - `sudo ~/MyDiary/scripts/install-service.sh`

Override defaults with env vars:

```bash
sudo APP_DIR=/opt/MyDiary \
     SERVICE_USER=mydiary \
     UPDATE_INTERVAL=5min \
     BRANCH=main \
     ~/MyDiary/scripts/install-service.sh
```

The installer is idempotent — safe to re-run.

### What it does

- Creates the `mydiary` system user if missing.
- `chown`s the project to the service user.
- Runs `npm install` and `npm run build` as that user.
- Installs systemd unit files from `deploy/systemd/*.template`.
- Grants the service user passwordless `systemctl restart` for its own units.
- Enables and starts the API, web, and updater timer.

### Operate

- Force an immediate update/rebuild:
  - `sudo systemctl start mydiary-updater.service`
- View logs:
  - `journalctl -u mydiary-api.service -f`
  - `journalctl -u mydiary-web.service -f`
  - `journalctl -u mydiary-updater.service -f`
- Track a different branch:
  - `sudo MYDIARY_BRANCH=staging systemctl edit mydiary-updater.service` and add `Environment=MYDIARY_BRANCH=staging` under `[Service]`.

## Production (single box, Cloudflare — legacy one-shot)

Use the older one-command setup script to make deployment simpler:

1. Copy your `.env` from `.env.example` and fill required values (`JWT_SECRET`, MySQL settings).
2. Run:
   - `sudo ./scripts/setup-production-cloudflare.sh -d mydiary.yourdomain.com -e you@example.com -t CLOUDFLARE_API_TOKEN -a /absolute/path/to/MyDiary`

What the script does:

- Installs dependencies (`nginx`, `certbot`, Cloudflare DNS plugin).
- Installs Node.js if missing.
- Runs `npm ci` and `npm run build`.
- Creates a systemd service for the clustered API.
- Configures HTTPS with Let's Encrypt (Cloudflare DNS challenge).
- Serves frontend from `dist` and proxies `/api` to the Node API.

## Deployment layout

- Frontend: static files served by Nginx (`/`)
- Backend: Node API service (`/api`)
- Database: MySQL

## Helpful commands

- API logs: `journalctl -u mydiary-api -f`
- Nginx test/reload: `sudo nginx -t && sudo systemctl reload nginx`
- API health check: `curl -i https://your-domain/api/health`

## Production readiness notes

- Set `JWT_SECRET` to a long random value before launch.
- Set `CORS_ORIGIN` to your allowed frontend origin(s), comma-separated if needed.
- Keep `TRUST_PROXY=1` when behind Nginx/Cloudflare.
- For horizontal-safe rate limits, set `REDIS_URL` (fallback is in-memory limiter).
- Use cluster mode with `API_CLUSTER_WORKERS` (0 = auto based on CPU count).
- Tune DB/API concurrency using:
  - `MYSQL_CONNECTION_LIMIT`
  - `MYSQL_MAX_IDLE`
  - `AUTH_RATE_LIMIT_*`
  - `API_RATE_LIMIT_*`
- Check readiness in monitoring with `GET /api/ready` (verifies DB connectivity).
- Use multiple app instances behind Nginx/load balancer for higher throughput.

## Load testing

- Run a quick API smoke load test:
  - `npm run loadtest:auth`
- Optional tuning variables:
  - `LOADTEST_API_BASE` (default `http://127.0.0.1:4000`)
  - `LOADTEST_REQUESTS` (default `200`)
  - `LOADTEST_CONCURRENCY` (default `25`)
  - `LOADTEST_TIMEOUT_MS` (default `10000`)
