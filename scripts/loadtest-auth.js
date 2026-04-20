#!/usr/bin/env node

const API_BASE = (process.env.LOADTEST_API_BASE || 'http://127.0.0.1:4000').replace(/\/$/, '');
const CONCURRENCY = Number(process.env.LOADTEST_CONCURRENCY || 25);
const REQUESTS = Number(process.env.LOADTEST_REQUESTS || 200);
const TIMEOUT_MS = Number(process.env.LOADTEST_TIMEOUT_MS || 10000);

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

async function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function hitHealth() {
  const start = nowMs();
  try {
    const response = await withTimeout(fetch(`${API_BASE}/api/health`), TIMEOUT_MS);
    const duration = nowMs() - start;
    return {
      ok: response.ok,
      status: response.status,
      duration
    };
  } catch {
    return {
      ok: false,
      status: 0,
      duration: nowMs() - start
    };
  }
}

async function run() {
  const queue = Array.from({ length: REQUESTS }, (_, i) => i);
  const results = [];

  const workers = Array.from({ length: Math.min(CONCURRENCY, REQUESTS) }, async () => {
    while (queue.length > 0) {
      queue.pop();
      const result = await hitHealth();
      results.push(result);
    }
  });

  await Promise.all(workers);

  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  const durations = results.map((r) => r.duration).sort((a, b) => a - b);
  const p50 = durations[Math.floor(durations.length * 0.5)] || 0;
  const p95 = durations[Math.floor(durations.length * 0.95)] || 0;
  const p99 = durations[Math.floor(durations.length * 0.99)] || 0;

  const byStatus = results.reduce((acc, r) => {
    const key = String(r.status);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    apiBase: API_BASE,
    requests: REQUESTS,
    concurrency: CONCURRENCY,
    ok,
    failed,
    p50Ms: Math.round(p50 * 100) / 100,
    p95Ms: Math.round(p95 * 100) / 100,
    p99Ms: Math.round(p99 * 100) / 100,
    statusHistogram: byStatus
  }, null, 2));

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
