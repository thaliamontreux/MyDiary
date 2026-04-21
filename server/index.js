import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

import { createUser, findUserByEmail, findUserByUsername, getVault, initializeDatabase, markUserTosAccepted, pingDatabase, upsertVault, deleteUserById, updateUsername } from './db.js';
import { requireAuth, signAuthToken } from './auth.js';
import { log, logError, requestLogger } from './logger.js';
import { createRateLimiter } from './rateLimit.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';

const CORS_ORIGIN = process.env.CORS_ORIGIN || '';
const corsOrigins = CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean);
const trustProxy = process.env.TRUST_PROXY || '1';

const authWindowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const authMax = Number(process.env.AUTH_RATE_LIMIT_MAX || 60);
const apiWindowMs = Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60 * 1000);
const apiMax = Number(process.env.API_RATE_LIMIT_MAX || 240);

app.set('trust proxy', trustProxy);

const authRateLimiter = createRateLimiter({
  windowMs: authWindowMs,
  maxRequests: authMax,
  prefix: 'auth'
});
const apiRateLimiter = createRateLimiter({
  windowMs: apiWindowMs,
  maxRequests: apiMax,
  prefix: 'api'
});

app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

app.use(requestLogger);

app.use(cors(corsOrigins.length ? { origin: corsOrigins, credentials: true } : undefined));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
});

app.use('/api', apiRateLimiter);
app.use(express.json({ limit: '5mb' }));

app.use((err, _req, res, next) => {
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Payload too large' });
    return;
  }
  next(err);
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get('/api/ready', async (_req, res) => {
  try {
    await pingDatabase();
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, error: 'Database unavailable' });
  }
});

app.post('/api/auth/username', requireAuth, async (req, res) => {
  try {
    const rawUsername = String(req.body?.username || '').trim();
    if (!rawUsername || rawUsername.length < 3) {
      res.status(400).json({ error: 'Username must be at least 3 characters' });
      return;
    }

    const existing = await findUserByUsername(rawUsername);
    if (existing && existing.id !== req.user.id) {
      res.status(409).json({ error: 'That username is already taken' });
      return;
    }

    const updated = await updateUsername(req.user.id, rawUsername);
    res.json({
      user: {
        id: updated.id,
        email: updated.email,
        firstName: updated.first_name || null,
        middleName: updated.middle_name || null,
        lastName: updated.last_name || null,
        username: updated.username || null,
        addressLine: updated.address_line || null,
        city: updated.city || null,
        stateRegion: updated.state_region || null,
        postalCode: updated.postal_code || null,
        countryCode: updated.country_code || null,
        tosAccepted: Boolean(updated.tos_accepted_at)
      }
    });
  } catch (error) {
    logError('username_update_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to update username' });
  }
});

app.delete('/api/auth/account', requireAuth, async (req, res) => {
  try {
    const ok = await deleteUserById(req.user.id);
    if (!ok) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    logError('account_delete_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

app.post('/api/auth/accept-tos', requireAuth, async (req, res) => {
  try {
    const updated = await markUserTosAccepted(req.user.id);
    res.json({
      user: {
        id: updated.id,
        email: updated.email,
        firstName: updated.first_name || null,
        middleName: updated.middle_name || null,
        lastName: updated.last_name || null,
        username: updated.username || null,
        addressLine: updated.address_line || null,
        city: updated.city || null,
        stateRegion: updated.state_region || null,
        postalCode: updated.postal_code || null,
        countryCode: updated.country_code || null,
        tosAccepted: Boolean(updated.tos_accepted_at)
      }
    });
  } catch (error) {
    logError('accept_tos_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to record agreement' });
  }
});

app.post('/api/auth/register', authRateLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const firstName = String(req.body?.firstName || '').trim();
    const middleName = String(req.body?.middleName || '').trim() || null;
    const lastName = String(req.body?.lastName || '').trim();
    const username = String(req.body?.username || '').trim();
    const addressLine = String(req.body?.addressLine || '').trim();
    const city = String(req.body?.city || '').trim();
    const stateRegion = String(req.body?.stateRegion || '').trim();
    const postalCode = String(req.body?.postalCode || '').trim();
    const countryCode = String(req.body?.countryCode || '').trim().toUpperCase();

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email is required' });
      return;
    }
    if (password.length < 10) {
      res.status(400).json({ error: 'Password must be at least 10 characters' });
      return;
    }
    if (!firstName || !lastName) {
      res.status(400).json({ error: 'First and last name are required' });
      return;
    }
    if (!username || username.length < 3) {
      res.status(400).json({ error: 'Username must be at least 3 characters' });
      return;
    }
    if (!addressLine || !city || !stateRegion || !postalCode || !countryCode) {
      res.status(400).json({ error: 'Please complete your address and country' });
      return;
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const existingUsername = await findUserByUsername(username);
    if (existingUsername) {
      res.status(409).json({ error: 'That username is already taken' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = await createUser({
      email,
      passwordHash,
      firstName,
      middleName,
      lastName,
      username,
      addressLine,
      city,
      stateRegion,
      postalCode,
      countryCode
    });

    const token = signAuthToken({ id: userId, email, username });
    res.status(201).json({
      token,
      user: {
        id: userId,
        email,
        firstName,
        middleName,
        lastName,
        username,
        addressLine,
        city,
        stateRegion,
        postalCode,
        countryCode,
        tosAccepted: false
      }
    });
  } catch (error) {
    logError('register_failed', error, { requestId: req.requestId });
    res.status(500).json({ error: 'Failed to create account' });
  }
});

app.post('/api/auth/login', authRateLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const user = await findUserByEmail(email);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = signAuthToken({ id: user.id, email: user.email, username: user.username || undefined });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name || null,
        middleName: user.middle_name || null,
        lastName: user.last_name || null,
        username: user.username || null,
        addressLine: user.address_line || null,
        city: user.city || null,
        stateRegion: user.state_region || null,
        postalCode: user.postal_code || null,
        countryCode: user.country_code || null,
        tosAccepted: Boolean(user.tos_accepted_at)
      }
    });
  } catch (error) {
    logError('login_failed', error, { requestId: req.requestId });
    res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/api/vault/:slot', requireAuth, async (req, res) => {
  try {
    const slot = String(req.params.slot || 'primary');
    const vault = await getVault(req.user.id, slot);
    res.json({ meta: vault?.vault_meta || null, data: vault?.vault_data || null });
  } catch (error) {
    logError('vault_load_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to load vault' });
  }
});

app.put('/api/vault/:slot', requireAuth, async (req, res) => {
  try {
    const slot = String(req.params.slot || 'primary');
    const meta = req.body?.meta || null;
    const data = req.body?.data || null;

    await upsertVault(req.user.id, slot, meta, data);
    res.json({ ok: true });
  } catch (error) {
    logError('vault_save_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to save vault' });
  }
});

initializeDatabase()
  .then(() => {
    const server = app.listen(PORT, HOST, () => {
      log('info', 'api_started', { host: HOST, port: PORT });
    });

    const shutdown = () => {
      server.close(() => {
        process.exit(0);
      });

      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })
  .catch((error) => {
    logError('api_start_failed', error);
    process.exit(1);
  });
