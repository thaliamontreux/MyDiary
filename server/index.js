import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import multer from 'multer';
import AdmZip from 'adm-zip';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

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
  selfUpdateUserProfile,
  saveUserTheme,
  saveUserThemesJson,
  getSiteSetting,
  upsertSiteSetting,
  getAllSiteSettings,
  adminListAuditLogs,
  getAdminStats,
  getRecentRegistrations,
  createInviteCode,
  listInviteCodes,
  revokeInviteCode,
  markUserTosAccepted,
  getMailSettings,
  saveMailSettings
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
    const vaultSlot = String(req.query?.vaultSlot || 'primary');
    let folders = await listUserFolders(req.user.id, vaultSlot);
    // Ensure every vault has a "General" folder
    if (!folders.find((f) => f.path === 'General')) {
      try {
        await createUserFolder(req.user.id, 'General', null, vaultSlot);
        folders = await listUserFolders(req.user.id, vaultSlot);
      } catch (e) {
        // If race or unique conflict, re-list and continue
        folders = await listUserFolders(req.user.id, vaultSlot);
      }
    }
    res.json({
      folders: folders.map((f) => ({
        id: f.id,
        vaultSlot: f.vault_slot,
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
    const vaultSlot = String(req.body?.vaultSlot || 'primary');

    if (!rawPath) {
      res.status(400).json({ error: 'Folder name is required' });
      return;
    }

    const existing = await getUserFolderByPath(req.user.id, rawPath, vaultSlot);
    if (existing) {
      res.status(409).json({ error: 'A folder with this name already exists' });
      return;
    }

    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
    const created = await createUserFolder(req.user.id, rawPath, passwordHash, vaultSlot);

    res.status(201).json({
      folder: {
        id: created.id,
        vaultSlot: created.vault_slot,
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
    const vaultSlot = String(req.body?.vaultSlot || 'primary');
    if (!Number.isFinite(folderId) || folderId <= 0) {
      res.status(400).json({ error: 'Invalid folder id' });
      return;
    }

    const current = await getUserFolderById(req.user.id, folderId, vaultSlot);
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
      const existing = await getUserFolderByPath(req.user.id, rawPath, vaultSlot);
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
        vaultSlot: updated.vault_slot,
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
    const vaultSlot = String(req.body?.vaultSlot || 'primary');
    if (!Number.isFinite(folderId) || folderId <= 0) {
      res.status(400).json({ error: 'Invalid folder id' });
      return;
    }

    const folder = await getUserFolderById(req.user.id, folderId, vaultSlot);
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
    const announcementRow = await getSiteSetting('announcement');
    const maintenanceRow = await getSiteSetting('maintenance_mode');
    const registrationRow = await getSiteSetting('registration_enabled');
    const siteNameRow = await getSiteSetting('site_name');
    const defaultLoginThemeRow = await getSiteSetting('default_login_theme');
    res.json({
      ...summary,
      nodeEnv: process.env.NODE_ENV || 'development',
      announcement: announcementRow?.value_data || '',
      maintenanceMode: maintenanceRow?.value_data === 'true',
      registrationEnabled: registrationRow?.value_data !== 'false',
      siteName: siteNameRow?.value_data || 'My Secret Diary',
      defaultLoginTheme: defaultLoginThemeRow?.value_data || 'trans-pride-dark'
    });
  } catch (error) {
    logError('admin_site_summary_failed', error, { requestId: req.requestId, adminId: req.user?.id });
    res.status(500).json({ error: 'Failed to load site summary' });
  }
});

app.get('/api/admin/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const stats = await getAdminStats();
    res.json(stats);
  } catch (error) {
    logError('admin_stats_failed', error, { requestId: req.requestId, adminId: req.user?.id });
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

app.get('/api/admin/audit-logs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const logs = await adminListAuditLogs(limit, userId || null);
    res.json({ logs });
  } catch (error) {
    logError('admin_audit_logs_failed', error, { requestId: req.requestId, adminId: req.user?.id });
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

app.get('/api/admin/site-settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await getAllSiteSettings();
    const settings = {};
    for (const r of rows) settings[r.key_name] = r.value_data;
    res.json({ settings });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

app.post('/api/admin/site-settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const allowed = ['announcement', 'maintenance_mode', 'registration_enabled', 'site_name', 'default_login_theme', 'motd'];
    const body = req.body || {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        await upsertSiteSetting(key, String(body[key]));
      }
    }
    await createAuditLog(req.user.id, 'admin_site_settings_updated', JSON.stringify(Object.keys(body)), req.ip);
    res.json({ ok: true });
  } catch (error) {
    logError('admin_site_settings_failed', error, { requestId: req.requestId, adminId: req.user?.id });
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// ── Mail Settings ──────────────────────────────────────────────────────────────
app.get('/api/admin/mail-settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const settings = await getMailSettings();
    res.json({ settings });
  } catch (error) {
    logError('admin_mail_settings_get_failed', error, { requestId: req.requestId });
    res.status(500).json({ error: 'Failed to load mail settings' });
  }
});

app.post('/api/admin/mail-settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const settings = await saveMailSettings({
      host: String(body.host || ''),
      port: Number(body.port || 587),
      secure: Boolean(body.secure),
      username: String(body.username || ''),
      password: String(body.password || ''),
      verifyCert: body.verifyCert !== false
    });
    await createAuditLog(req.user.id, 'admin_mail_settings_updated', body.host || 'unknown', req.ip);
    res.json({ settings });
  } catch (error) {
    logError('admin_mail_settings_save_failed', error, { requestId: req.requestId });
    res.status(500).json({ error: 'Failed to save mail settings' });
  }
});

app.post('/api/admin/mail-test-connection', requireAuth, requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const config = {
      host: String(body.host || ''),
      port: Number(body.port || 587),
      secure: Boolean(body.secure),
      auth: {
        user: String(body.username || ''),
        pass: String(body.password || '')
      },
      tls: {
        rejectUnauthorized: body.verifyCert !== false
      }
    };

    const transporter = nodemailer.createTransport(config);
    await transporter.verify();
    res.json({ ok: true, message: 'Connection successful' });
  } catch (error) {
    logError('admin_mail_test_connection_failed', error, { requestId: req.requestId });
    res.status(400).json({ ok: false, error: error.message || 'Connection failed' });
  }
});

app.post('/api/admin/mail-send-test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const toEmail = String(body.to || '').trim();
    if (!toEmail) return res.status(400).json({ error: 'Recipient email required' });

    const config = {
      host: String(body.host || ''),
      port: Number(body.port || 587),
      secure: Boolean(body.secure),
      auth: {
        user: String(body.username || ''),
        pass: String(body.password || '')
      },
      tls: {
        rejectUnauthorized: body.verifyCert !== false
      }
    };

    const transporter = nodemailer.createTransport(config);
    await transporter.sendMail({
      from: `"MyDiary Test" <${config.auth.user || 'noreply@example.com'}>`,
      to: toEmail,
      subject: 'Test Email from MyDiary',
      text: 'This is a test email from your MyDiary admin panel.\n\nIf you received this, your mail settings are configured correctly!',
      html: '<p>This is a test email from your <strong>MyDiary</strong> admin panel.</p><p>If you received this, your mail settings are configured correctly!</p>'
    });

    await createAuditLog(req.user.id, 'admin_mail_test_sent', toEmail, req.ip);
    res.json({ ok: true, message: 'Test email sent successfully' });
  } catch (error) {
    logError('admin_mail_send_test_failed', error, { requestId: req.requestId });
    res.status(400).json({ ok: false, error: error.message || 'Failed to send test email' });
  }
});

app.post('/api/admin/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 10) {
      return res.status(400).json({ error: 'New password must be at least 10 characters' });
    }
    const user = await findUserById(targetId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const hash = await bcrypt.hash(newPassword, 12);
    await upsertUserPassword(targetId, hash);
    await createAuditLog(req.user.id, 'admin_reset_user_password', String(targetId), req.ip);
    res.json({ ok: true });
  } catch (error) {
    logError('admin_reset_password_failed', error, { requestId: req.requestId, adminId: req.user?.id });
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

app.get('/api/admin/recent-registrations', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(20, Number(req.query.limit) || 10);
    const rows = await getRecentRegistrations(limit);
    res.json({ users: rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load registrations' });
  }
});

app.get('/api/admin/invite-codes', requireAuth, requireAdmin, async (req, res) => {
  try {
    const codes = await listInviteCodes(50);
    res.json({ codes });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load invite codes' });
  }
});

app.post('/api/admin/invite-codes', requireAuth, requireAdmin, async (req, res) => {
  try {
    const maxUses = Math.max(1, Math.min(100, Number(req.body?.maxUses) || 1));
    const note = String(req.body?.note || '').trim().slice(0, 255);
    const daysValid = Number(req.body?.daysValid) || 0;
    const expiresAt = daysValid > 0
      ? new Date(Date.now() + daysValid * 86400000).toISOString().slice(0, 19).replace('T', ' ')
      : null;
    const code = crypto.randomBytes(12).toString('base64url');
    const invite = await createInviteCode(req.user.id, { code, maxUses, expiresAt, note });
    await createAuditLog(req.user.id, 'admin_invite_code_created', code, req.ip);
    res.status(201).json({ invite });
  } catch (error) {
    logError('admin_invite_create_failed', error, { requestId: req.requestId, adminId: req.user?.id });
    res.status(500).json({ error: 'Failed to create invite code' });
  }
});

app.delete('/api/admin/invite-codes/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    const ok = await revokeInviteCode(id);
    if (!ok) return res.status(404).json({ error: 'Invite code not found' });
    await createAuditLog(req.user.id, 'admin_invite_code_revoked', String(id), req.ip);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke invite code' });
  }
});

app.post('/api/admin/users/:id/suspend', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const suspended = Boolean(req.body?.suspended);
    await upsertSiteSetting(`suspended_user_${targetId}`, suspended ? 'true' : 'false');
    await createAuditLog(req.user.id, suspended ? 'admin_user_suspended' : 'admin_user_unsuspended', String(targetId), req.ip);
    res.json({ ok: true, suspended });
  } catch (error) {
    logError('admin_suspend_user_failed', error, { requestId: req.requestId, adminId: req.user?.id });
    res.status(500).json({ error: 'Failed to update suspension' });
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
        mustChangePassword: false,
        theme: 'trans-pride-dark'
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
        mustChangePassword: Boolean(user.must_change_password),
        theme: user.theme || 'trans-pride-dark'
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

// ── User Theme ────────────────────────────────────────────────────────────────
app.post('/api/user/theme', requireAuth, async (req, res) => {
  try {
    const themeId = String(req.body?.theme || '').trim();
    if (!themeId) {
      res.status(400).json({ error: 'theme is required' });
      return;
    }
    await saveUserTheme(req.user.id, themeId);
    res.json({ ok: true, theme: themeId });
  } catch (err) {
    logError('user_theme_save_failed', err, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to save theme' });
  }
});

// ── Get Themes List ─────────────────────────────────────────────────────────────
app.get('/api/themes', async (req, res) => {
  try {
    const themesDir = path.resolve(DIST_DIR, '..', 'themes');
    const themes = [];

    try {
      const entries = await fsp.readdir(themesDir, { withFileTypes: true });
      const themeDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

      for (const themeId of themeDirs) {
        const themeJsonPath = path.join(themesDir, themeId, 'theme.json');
        try {
          const themeData = JSON.parse(await fsp.readFile(themeJsonPath, 'utf8'));
          themes.push(themeData);
        } catch (err) {
          // Skip themes with missing/invalid theme.json
          console.log(`Skipping theme ${themeId}: ${err.message}`);
        }
      }
    } catch (err) {
      // Themes directory might not exist
      console.log('Themes directory not found or empty:', err.message);
    }

    res.json({ themes });
  } catch (err) {
    logError('themes_load_failed', err);
    res.status(500).json({ error: 'Failed to load themes' });
  }
});

// ── Theme Upload (ZIP) ────────────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.post('/api/themes/upload', requireAuth, upload.single('themeZip'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries();
    const themeJsonEntry = entries.find(e => e.entryName === 'theme.json' || e.entryName.endsWith('/theme.json'));
    const bgEntry = entries.find(e => e.entryName === 'background.webp' || e.entryName.endsWith('/background.webp'));

    if (!themeJsonEntry || !bgEntry) {
      res.status(400).json({ error: 'ZIP must contain theme.json and background.webp' });
      return;
    }

    const themeConfig = JSON.parse(themeJsonEntry.getData().toString('utf8'));
    if (!themeConfig.id || !themeConfig.name) {
      res.status(400).json({ error: 'theme.json must have id and name fields' });
      return;
    }

    // Save to themes/<id>/ directory
    const themeDir = path.resolve(DIST_DIR, '..', 'themes', themeConfig.id);
    await fsp.mkdir(themeDir, { recursive: true });
    await fsp.writeFile(path.join(themeDir, 'background.webp'), bgEntry.getData());
    await fsp.writeFile(path.join(themeDir, 'theme.json'), JSON.stringify(themeConfig, null, 2), 'utf8');

    // Also copy to dist if it exists
    if (fs.existsSync(DIST_DIR)) {
      const distThemeDir = path.join(DIST_DIR, 'themes', themeConfig.id);
      await fsp.mkdir(distThemeDir, { recursive: true });
      await fsp.writeFile(path.join(distThemeDir, 'background.webp'), bgEntry.getData());
      await fsp.writeFile(path.join(distThemeDir, 'theme.json'), JSON.stringify(themeConfig, null, 2), 'utf8');
    }

    // Update themes.json
    const themesJsonPath = path.resolve(DIST_DIR, '..', 'themes.json');
    let themesData = { themes: [] };
    try {
      themesData = JSON.parse(await fsp.readFile(themesJsonPath, 'utf8'));
    } catch { /* start fresh if missing */ }

    themeConfig.image = `themes/${themeConfig.id}/background.webp`;
    const existingIdx = themesData.themes.findIndex(t => t.id === themeConfig.id);
    if (existingIdx >= 0) {
      themesData.themes[existingIdx] = themeConfig;
    } else {
      themesData.themes.push(themeConfig);
    }

    await fsp.writeFile(themesJsonPath, JSON.stringify(themesData, null, 2), 'utf8');
    if (fs.existsSync(DIST_DIR)) {
      await fsp.writeFile(path.join(DIST_DIR, 'themes.json'), JSON.stringify(themesData, null, 2), 'utf8');
    }

    await saveUserThemesJson(JSON.stringify(themesData));
    res.json({ ok: true, themeName: themeConfig.name, themeId: themeConfig.id });
  } catch (err) {
    logError('theme_upload_failed', err, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to install theme: ' + err.message });
  }
});

app.delete('/api/themes/:id', requireAuth, async (req, res) => {
  try {
    const themeId = String(req.params.id || '').trim().replace(/[^a-z0-9-]/gi, '');
    if (!themeId) {
      res.status(400).json({ error: 'Theme ID is required' });
      return;
    }

    // Remove theme directory
    const themeDir = path.resolve(DIST_DIR, '..', 'themes', themeId);
    try { await fsp.rm(themeDir, { recursive: true, force: true }); } catch { /* ok if missing */ }
    if (fs.existsSync(DIST_DIR)) {
      const distThemeDir = path.join(DIST_DIR, 'themes', themeId);
      try { await fsp.rm(distThemeDir, { recursive: true, force: true }); } catch { /* ok */ }
    }

    // Remove from themes.json
    const themesJsonPath = path.resolve(DIST_DIR, '..', 'themes.json');
    let themesData = { themes: [] };
    try { themesData = JSON.parse(await fsp.readFile(themesJsonPath, 'utf8')); } catch { /* ok */ }
    themesData.themes = themesData.themes.filter(t => t.id !== themeId);
    await fsp.writeFile(themesJsonPath, JSON.stringify(themesData, null, 2), 'utf8');
    if (fs.existsSync(DIST_DIR)) {
      await fsp.writeFile(path.join(DIST_DIR, 'themes.json'), JSON.stringify(themesData, null, 2), 'utf8');
    }

    await saveUserThemesJson(JSON.stringify(themesData));
    res.json({ ok: true });
  } catch (err) {
    logError('theme_delete_failed', err, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to delete theme: ' + err.message });
  }
});

// ── User Stats (server-side metadata only, vault stats computed client-side) ──
app.get('/api/user/stats', requireAuth, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const logs = await listAuditLogs(req.user.id, 200);
    const loginCount = logs.filter(l => l.action === 'login').length;
    const lastLogin = logs.find(l => l.action === 'login')?.created_at || null;
    res.json({
      memberSince: user.created_at,
      loginCount,
      lastLogin,
      email: user.email,
      username: user.username
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load stats' });
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

// ── Serve built frontend (SPA) ───────────────────────────────────────────────
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { maxAge: '1h' }));
  // SPA fallback — return index.html for any non-API route
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    const indexPath = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
}

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
