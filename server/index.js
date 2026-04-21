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
  deleteUserFolder,
  listUserVaultSlots,
  getUserVaultSlot,
  createUserVaultSlot,
  updateUserVaultSlot,
  deleteUserVaultSlot,
  createTag,
  listTags,
  getTag,
  updateTag,
  deleteTag,
  addTagToEntry,
  removeTagFromEntry,
  getEntryTags,
  getEntriesByTag,
  createAuditLog,
  listAuditLogs,
  setUserTotp,
  getUserTotp,
  setUserRecoveryCodes,
  getUserRecoveryCodes,
  selfUpdateUserProfile
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
    let folders = await listUserFolders(req.user.id);
    // Ensure every user has a "Default Folder"
    if (!folders.find((f) => f.path === 'Default Folder')) {
      try {
        await createUserFolder(req.user.id, 'Default Folder', null);
        folders = await listUserFolders(req.user.id);
      } catch (e) {
        // If race or unique conflict, re-list and continue
        folders = await listUserFolders(req.user.id);
      }
    }
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

function slotToPublic(row) {
  return {
    slotName: row.slot_name,
    label: row.label || (row.slot_name === 'primary' ? 'Main diary' : row.slot_name),
    hasPassword: Boolean(row.access_password_hash),
    hasData: Boolean(row.has_data),
    isPrimary: row.slot_name === 'primary'
  };
}

app.get('/api/vaults', requireAuth, async (req, res) => {
  try {
    let slots = await listUserVaultSlots(req.user.id);
    // Ensure primary row exists
    if (!slots.find((s) => s.slot_name === 'primary')) {
      await createUserVaultSlot(req.user.id, 'primary', 'Main diary', null);
      slots = await listUserVaultSlots(req.user.id);
    }
    res.json({ vaults: slots.map(slotToPublic) });
  } catch (error) {
    logError('vaults_list_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to load vaults' });
  }
});

app.post('/api/vaults', requireAuth, async (req, res) => {
  try {
    const rawSlotName = String(req.body?.slotName || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const label = String(req.body?.label || '').trim();
    const password = String(req.body?.password || '');

    if (!rawSlotName || rawSlotName === 'primary') {
      res.status(400).json({ error: 'Invalid slot name' });
      return;
    }
    if (!label) {
      res.status(400).json({ error: 'Vault label is required' });
      return;
    }
    if (rawSlotName.length > 32) {
      res.status(400).json({ error: 'Slot name too long' });
      return;
    }

    const existing = await getUserVaultSlot(req.user.id, rawSlotName);
    if (existing) {
      res.status(409).json({ error: 'A vault with that slot name already exists' });
      return;
    }

    const accessPasswordHash = password ? await bcrypt.hash(password, 12) : null;
    const created = await createUserVaultSlot(req.user.id, rawSlotName, label, accessPasswordHash);
    res.status(201).json({ vault: slotToPublic(created) });
  } catch (error) {
    logError('vaults_create_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to create vault' });
  }
});

app.patch('/api/vaults/:slot', requireAuth, async (req, res) => {
  try {
    const slotName = String(req.params.slot || '');
    const current = await getUserVaultSlot(req.user.id, slotName);
    if (!current) {
      res.status(404).json({ error: 'Vault not found' });
      return;
    }

    const label = req.body?.label != null ? String(req.body.label).trim() : undefined;
    const newPassword = req.body?.newPassword != null ? String(req.body.newPassword) : undefined;
    const clearPassword = Boolean(req.body?.clearPassword);

    // Enforce: primary cannot have a password
    if (slotName === 'primary' && (newPassword || clearPassword === false && req.body?.newPassword)) {
      if (newPassword) {
        res.status(400).json({ error: 'Main diary cannot be locked with a password' });
        return;
      }
    }
    if (label !== undefined && !label) {
      res.status(400).json({ error: 'Label cannot be empty' });
      return;
    }

    const accessPasswordHash = newPassword ? await bcrypt.hash(newPassword, 12) : undefined;
    const updated = await updateUserVaultSlot(req.user.id, slotName, {
      label,
      accessPasswordHash,
      clearPassword
    });
    res.json({ vault: slotToPublic(updated) });
  } catch (error) {
    logError('vaults_update_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to update vault' });
  }
});

app.delete('/api/vaults/:slot', requireAuth, async (req, res) => {
  try {
    const slotName = String(req.params.slot || '');
    if (slotName === 'primary') {
      res.status(400).json({ error: 'Main diary cannot be deleted' });
      return;
    }
    const ok = await deleteUserVaultSlot(req.user.id, slotName);
    if (!ok) {
      res.status(404).json({ error: 'Vault not found' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    logError('vaults_delete_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to delete vault' });
  }
});

app.post('/api/vaults/:slot/verify', requireAuth, async (req, res) => {
  try {
    const slotName = String(req.params.slot || '');
    const slot = await getUserVaultSlot(req.user.id, slotName);
    if (!slot) {
      res.status(404).json({ error: 'Vault not found' });
      return;
    }
    if (!slot.access_password_hash) {
      res.json({ ok: true });
      return;
    }
    const password = String(req.body?.password || '');
    const ok = await bcrypt.compare(password, slot.access_password_hash);
    if (!ok) {
      res.status(401).json({ error: 'Incorrect vault password' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    logError('vaults_verify_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to verify vault password' });
  }
});

// Tags API endpoints
app.get('/api/tags', requireAuth, async (req, res) => {
  try {
    const tags = await listTags(req.user.id);
    res.json({ tags });
  } catch (error) {
    logError('tags_list_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to load tags' });
  }
});

app.post('/api/tags', requireAuth, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const color = String(req.body?.color || '#6366f1').trim();
    
    if (!name) {
      res.status(400).json({ error: 'Tag name is required' });
      return;
    }
    if (name.length > 64) {
      res.status(400).json({ error: 'Tag name must be 64 characters or less' });
      return;
    }
    
    const tag = await createTag(req.user.id, name, color);
    res.status(201).json({ tag });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'A tag with this name already exists' });
      return;
    }
    logError('tags_create_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

app.patch('/api/tags/:id', requireAuth, async (req, res) => {
  try {
    const tagId = Number(req.params.id);
    const name = req.body?.name ? String(req.body.name).trim() : undefined;
    const color = req.body?.color ? String(req.body.color).trim() : undefined;
    
    if (name !== undefined && name.length > 64) {
      res.status(400).json({ error: 'Tag name must be 64 characters or less' });
      return;
    }
    
    const tag = await updateTag(req.user.id, tagId, { name, color });
    if (!tag) {
      res.status(404).json({ error: 'Tag not found' });
      return;
    }
    res.json({ tag });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'A tag with this name already exists' });
      return;
    }
    logError('tags_update_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

app.delete('/api/tags/:id', requireAuth, async (req, res) => {
  try {
    const tagId = Number(req.params.id);
    const ok = await deleteTag(req.user.id, tagId);
    if (!ok) {
      res.status(404).json({ error: 'Tag not found' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    logError('tags_delete_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// Entry-Tag association endpoints
app.get('/api/entries/:slot/tags', requireAuth, async (req, res) => {
  try {
    const slot = String(req.params.slot || '');
    const tags = await getEntryTags(req.user.id, slot);
    res.json({ tags });
  } catch (error) {
    logError('entry_tags_list_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to load entry tags' });
  }
});

app.post('/api/entries/:slot/tags/:tagId', requireAuth, async (req, res) => {
  try {
    const slot = String(req.params.slot || '');
    const tagId = Number(req.params.tagId);
    
    const tag = await getTag(req.user.id, tagId);
    if (!tag) {
      res.status(404).json({ error: 'Tag not found' });
      return;
    }
    
    await addTagToEntry(req.user.id, slot, tagId);
    res.status(201).json({ ok: true });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Tag already added to entry' });
      return;
    }
    logError('entry_tag_add_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to add tag to entry' });
  }
});

app.delete('/api/entries/:slot/tags/:tagId', requireAuth, async (req, res) => {
  try {
    const slot = String(req.params.slot || '');
    const tagId = Number(req.params.tagId);
    
    await removeTagFromEntry(req.user.id, slot, tagId);
    res.json({ ok: true });
  } catch (error) {
    logError('entry_tag_remove_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to remove tag from entry' });
  }
});

app.get('/api/tags/:id/entries', requireAuth, async (req, res) => {
  try {
    const tagId = Number(req.params.id);
    const tag = await getTag(req.user.id, tagId);
    if (!tag) {
      res.status(404).json({ error: 'Tag not found' });
      return;
    }
    
    const vaultSlots = await getEntriesByTag(req.user.id, tagId);
    res.json({ vault_slots: vaultSlots });
  } catch (error) {
    logError('tag_entries_list_failed', error, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to load entries for tag' });
  }
});

// ── Self-service profile update ──────────────────────────────────────────────
app.patch('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const body = req.body || {};

    // Username: only settable once — send back error if they try to change an existing one
    if (body.username && user.username && body.username !== user.username) {
      return res.status(400).json({ error: 'Username cannot be changed once set' });
    }

    // Validate username uniqueness if setting for the first time
    if (body.username && !user.username) {
      const trimmed = String(body.username).trim();
      if (trimmed.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
      const taken = await findUserByUsername(trimmed);
      if (taken && taken.id !== user.id) return res.status(409).json({ error: 'That username is already taken' });
    }

    const updated = await selfUpdateUserProfile({
      id: req.user.id,
      firstName: body.firstName !== undefined ? String(body.firstName || '').trim() : user.first_name,
      middleName: body.middleName !== undefined ? String(body.middleName || '').trim() || null : user.middle_name,
      lastName: body.lastName !== undefined ? String(body.lastName || '').trim() : user.last_name,
      username: body.username !== undefined ? String(body.username || '').trim() || null : user.username,
      addressLine: body.addressLine !== undefined ? String(body.addressLine || '').trim() : user.address_line,
      city: body.city !== undefined ? String(body.city || '').trim() : user.city,
      stateRegion: body.stateRegion !== undefined ? String(body.stateRegion || '').trim() : user.state_region,
      postalCode: body.postalCode !== undefined ? String(body.postalCode || '').trim() : user.postal_code,
      countryCode: body.countryCode !== undefined ? String(body.countryCode || '').trim().toUpperCase() : user.country_code
    });

    if (!updated) return res.status(500).json({ error: 'Update failed' });

    await createAuditLog(req.user.id, 'profile_updated', null, req.ip);

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
  } catch (err) {
    logError('profile_update_failed', err, { requestId: req.requestId, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ── Audit Logs ────────────────────────────────────────────────────────────────
app.get('/api/audit-logs', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const logs = await listAuditLogs(req.user.id, limit);
    res.json({ logs });
  } catch (err) {
    logError('audit_logs_list_failed', err, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

// ── TOTP 2FA ──────────────────────────────────────────────────────────────────
app.get('/api/2fa/status', requireAuth, async (req, res) => {
  try {
    const totp = await getUserTotp(req.user.id);
    res.json({ enabled: totp?.enabled === 1, hasSecret: Boolean(totp?.secret) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get 2FA status' });
  }
});

app.post('/api/2fa/setup', requireAuth, async (req, res) => {
  try {
    const { secret, enabled } = req.body || {};
    if (!secret) return res.status(400).json({ error: 'Secret is required' });
    await setUserTotp(req.user.id, secret, Boolean(enabled));
    await createAuditLog(req.user.id, enabled ? '2fa_enabled' : '2fa_secret_saved', null, req.ip);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save 2FA settings' });
  }
});

// ── Account Recovery Codes ────────────────────────────────────────────────────
app.post('/api/recovery/save', requireAuth, async (req, res) => {
  try {
    const { codesHash } = req.body || {};
    if (!codesHash) return res.status(400).json({ error: 'codesHash required' });
    await setUserRecoveryCodes(req.user.id, codesHash);
    await createAuditLog(req.user.id, 'recovery_codes_regenerated', null, req.ip);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save recovery codes' });
  }
});

app.get('/api/recovery/status', requireAuth, async (req, res) => {
  try {
    const record = await getUserRecoveryCodes(req.user.id);
    res.json({ hasRecoveryCodes: Boolean(record), createdAt: record?.created_at || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check recovery status' });
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
