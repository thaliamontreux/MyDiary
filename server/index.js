import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

import {
  createUser,
  deleteUserById,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  getSiteSummary,
  getVault,
  listUsers,
  pingDatabase,
  setUserAdminFlag,
  upsertUserPassword,
  updateUsername,
  upsertVault,
  adminUpdateUserProfile,
  initializeDatabase,
  listUserFolders,
  getUserFolderById,
  getUserFolderByPath,
  createUserFolder,
  updateUserFolder,
  deleteUserFolder
} from './db.js';
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

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
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
  if (req.path && req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  }
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

app.get('/api/folders', requireAuth, async (req, res) => {
  try {
    const folders = await listUserFolders(req.user.id);
    res.json({
      folders: folders.map((f) => ({
        id: f.id,
        path: f.path,
        hasPassword: Boolean(f.password_hash),
        createdAt: f.created_at,
        updatedAt: f.updated_at
      }))
    });
  } catch (error) {
    logError('folders_list_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to load folders' });
  }
});

app.post('/api/folders', requireAuth, async (req, res) => {
  try {
    const rawPath = String(req.body?.path || '').trim();
    const password = String(req.body?.password || '');

    if (!rawPath) {
      res.status(400).json({ error: 'Folder name is required' });
      return;
    }

    const existing = await getUserFolderByPath(req.user.id, rawPath);
    if (existing) {
      res.status(409).json({ error: 'A folder with this name already exists' });
      return;
    }

    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
    const created = await createUserFolder(req.user.id, rawPath, passwordHash);

    res.status(201).json({
      folder: {
        id: created.id,
        path: created.path,
        hasPassword: Boolean(created.password_hash),
        createdAt: created.created_at,
        updatedAt: created.updated_at
      }
    });
  } catch (error) {
    logError('folders_create_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

app.patch('/api/folders/:id', requireAuth, async (req, res) => {
  try {
    const folderId = Number(req.params.id);
    if (!Number.isFinite(folderId) || folderId <= 0) {
      res.status(400).json({ error: 'Invalid folder id' });
      return;
    }

    const current = await getUserFolderById(req.user.id, folderId);
    if (!current) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    const rawPath = req.body?.path != null ? String(req.body.path).trim() : undefined;
    const newPassword = req.body?.newPassword != null ? String(req.body.newPassword) : undefined;
    const clearPassword = Boolean(req.body?.clearPassword);

    if (rawPath !== undefined && !rawPath) {
      res.status(400).json({ error: 'Folder name cannot be empty' });
      return;
    }

    if (rawPath && rawPath !== current.path) {
      const existing = await getUserFolderByPath(req.user.id, rawPath);
      if (existing && existing.id !== folderId) {
        res.status(409).json({ error: 'Another folder already uses this name' });
        return;
      }
    }

    const passwordHash = newPassword ? await bcrypt.hash(newPassword, 12) : undefined;

    const updated = await updateUserFolder(req.user.id, folderId, {
      path: rawPath,
      passwordHash,
      clearPassword
    });

    res.json({
      folder: {
        id: updated.id,
        path: updated.path,
        hasPassword: Boolean(updated.password_hash),
        createdAt: updated.created_at,
        updatedAt: updated.updated_at
      }
    });
  } catch (error) {
    logError('folders_update_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

app.delete('/api/folders/:id', requireAuth, async (req, res) => {
  try {
    const folderId = Number(req.params.id);
    if (!Number.isFinite(folderId) || folderId <= 0) {
      res.status(400).json({ error: 'Invalid folder id' });
      return;
    }
    const ok = await deleteUserFolder(req.user.id, folderId);
    if (!ok) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    logError('folders_delete_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

app.post('/api/folders/:id/verify', requireAuth, async (req, res) => {
  try {
    const folderId = Number(req.params.id);
    if (!Number.isFinite(folderId) || folderId <= 0) {
      res.status(400).json({ error: 'Invalid folder id' });
      return;
    }

    const folder = await getUserFolderById(req.user.id, folderId);
    if (!folder) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    if (!folder.password_hash) {
      res.json({ ok: true });
      return;
    }

    const password = String(req.body?.password || '');
    const ok = await bcrypt.compare(password, folder.password_hash);
    if (!ok) {
      res.status(401).json({ error: 'Incorrect folder password' });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    logError('folders_verify_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to verify folder password' });
  }
});

app.get('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const user = await findUserById(targetId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({
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
        tosAccepted: Boolean(user.tos_accepted_at),
        isAdmin: Boolean(user.is_admin),
        mustChangePassword: Boolean(user.must_change_password),
        createdAt: user.created_at
      }
    });
  } catch (error) {
    logError('admin_user_get_failed', error, { requestId: req.requestId, adminId: req.user?.id });
    res.status(500).json({ error: 'Failed to load user' });
  }
});

app.patch('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const payload = req.body || {};
    const existing = await findUserById(targetId);
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const updateData = {
      id: targetId,
      email: payload.email ? String(payload.email) : existing.email,
      firstName: payload.firstName ? String(payload.firstName) : existing.first_name,
      middleName: payload.middleName ? String(payload.middleName) : existing.middle_name,
      lastName: payload.lastName ? String(payload.lastName) : existing.last_name,
      username: payload.username ? String(payload.username) : existing.username,
      addressLine: payload.addressLine ? String(payload.addressLine) : existing.address_line,
      city: payload.city ? String(payload.city) : existing.city,
      stateRegion: payload.stateRegion ? String(payload.stateRegion) : existing.state_region,
      postalCode: payload.postalCode ? String(payload.postalCode) : existing.postal_code,
      countryCode: payload.countryCode ? String(payload.countryCode) : existing.country_code,
      isAdmin: payload.isAdmin !== undefined ? Boolean(payload.isAdmin) : Boolean(existing.is_admin),
      mustChangePassword: payload.mustChangePassword !== undefined ? Boolean(payload.mustChangePassword) : Boolean(existing.must_change_password)
    };
    const updated = await adminUpdateUserProfile(updateData);
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
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
        tosAccepted: Boolean(updated.tos_accepted_at),
        isAdmin: Boolean(updated.is_admin),
        mustChangePassword: Boolean(updated.must_change_password),
        createdAt: updated.created_at
      }
    });
  } catch (error) {
    logError('admin_user_update_failed', error, { requestId: req.requestId, adminId: req.user?.id });
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = Number(req.query.limit || '200');
    const users = await listUsers(limit);
    res.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.first_name || null,
        middleName: u.middle_name || null,
        lastName: u.last_name || null,
        username: u.username || null,
        addressLine: u.address_line || null,
        city: u.city || null,
        stateRegion: u.state_region || null,
        postalCode: u.postal_code || null,
        countryCode: u.country_code || null,
        tosAccepted: Boolean(u.tos_accepted_at),
        isAdmin: Boolean(u.is_admin),
        mustChangePassword: Boolean(u.must_change_password),
        createdAt: u.created_at
      }))
    });
  } catch (error) {
    logError('admin_users_list_failed', error, { requestId: req.requestId, adminId: req.user?.id });
    res.status(500).json({ error: 'Failed to load users' });
  }
});

app.post('/api/admin/users/:id/admin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const isAdmin = Boolean(req.body?.isAdmin);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    await setUserAdminFlag(targetId, isAdmin);
    res.json({ ok: true });
  } catch (error) {
    logError('admin_users_adminflag_failed', error, { requestId: req.requestId, adminId: req.user?.id });
    res.status(500).json({ error: 'Failed to update admin flag' });
  }
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const ok = await deleteUserById(targetId);
    if (!ok) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    logError('admin_users_delete_failed', error, { requestId: req.requestId, adminId: req.user?.id });
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.get('/api/admin/site-summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    const summary = await getSiteSummary();
    res.json({
      ...summary,
      nodeEnv: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    logError('admin_site_summary_failed', error, { requestId: req.requestId, adminId: req.user?.id });
    res.status(500).json({ error: 'Failed to load site summary' });
  }
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (newPassword.length < 10) {
      res.status(400).json({ error: 'New password must be at least 10 characters' });
      return;
    }

    const user = await findUserByEmail(String(req.user.email || ''));
    if (!user) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const nextHash = await bcrypt.hash(newPassword, 12);
    await upsertUserPassword(user.id, nextHash);

    res.json({ ok: true });
  } catch (error) {
    logError('change_password_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to change password' });
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
        tosAccepted: Boolean(updated.tos_accepted_at),
        isAdmin: Boolean(updated.is_admin),
        mustChangePassword: Boolean(updated.must_change_password)
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
        tosAccepted: Boolean(updated.tos_accepted_at),
        isAdmin: Boolean(updated.is_admin),
        mustChangePassword: Boolean(updated.must_change_password)
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

    const token = signAuthToken({ id: userId, email, isAdmin: false });
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
        tosAccepted: false,
        isAdmin: false,
        mustChangePassword: false
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

    const token = signAuthToken({ id: user.id, email: user.email, isAdmin: Boolean(user.is_admin) });
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
        tosAccepted: Boolean(user.tos_accepted_at),
        isAdmin: Boolean(user.is_admin),
        mustChangePassword: Boolean(user.must_change_password)
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
