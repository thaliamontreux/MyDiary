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

## Production (single box, Cloudflare)

Use the one-command setup script to make deployment simpler:

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
