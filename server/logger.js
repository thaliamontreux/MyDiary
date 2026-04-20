const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function shouldLog(level) {
  const current = LEVELS[LOG_LEVEL] ?? LEVELS.info;
  const requested = LEVELS[level] ?? LEVELS.info;
  return requested >= current;
}

export function log(level, message, meta = {}) {
  if (!shouldLog(level)) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

export function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  const requestId = req.requestId || 'n/a';

  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - start;
    const durationMs = Number(durationNs) / 1e6;
    log('info', 'request_completed', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      ip: req.ip || req.socket?.remoteAddress || 'unknown'
    });
  });

  next();
}

export function logError(message, error, meta = {}) {
  log('error', message, {
    ...meta,
    error: {
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    }
  });
}
