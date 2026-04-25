import fs from 'fs';
import path from 'path';

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const SERVICE_TYPE = process.env.SERVICE_TYPE || 'api'; // 'api' or 'web'
const LOG_DIR = '/var/log/MyDiary';
const LOG_FILE = path.join(LOG_DIR, `${SERVICE_TYPE}.log`);

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

// Ensure log directory exists
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (err) {
  console.error('Failed to create log directory:', err.message);
}

function shouldLog(level) {
  const current = LEVELS[LOG_LEVEL] ?? LEVELS.info;
  const requested = LEVELS[level] ?? LEVELS.info;
  return requested >= current;
}

function writeToFile(line) {
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', { encoding: 'utf8' });
  } catch (err) {
    console.error('Failed to write to log file:', err.message);
  }
}

export function log(level, message, meta = {}) {
  if (!shouldLog(level)) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta
  };
  const line = JSON.stringify(payload);
  // eslint-disable-next-line no-console
  console.log(line);
  writeToFile(line);
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

// Crash handlers - write to file before exit
function handleCrash(type, err) {
  const crashLog = JSON.stringify({
    ts: new Date().toISOString(),
    level: 'fatal',
    type,
    message: err?.message,
    stack: err?.stack,
    service: SERVICE_TYPE
  });
  console.error(crashLog);
  try {
    fs.appendFileSync(LOG_FILE, crashLog + '\n');
    fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), level: 'fatal', message: `${SERVICE_TYPE} process exiting` }) + '\n');
  } catch {}
  process.exit(1);
}

process.on('uncaughtException', (err) => handleCrash('uncaughtException', err));
process.on('unhandledRejection', (reason) => handleCrash('unhandledRejection', new Error(String(reason))));
