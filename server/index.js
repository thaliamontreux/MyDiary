import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';

import { createUser, findUserByEmail, getVault, initializeDatabase, upsertVault } from './db.js';
import { requireAuth, signAuthToken } from './auth.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email is required' });
      return;
    }
    if (password.length < 10) {
      res.status(400).json({ error: 'Password must be at least 10 characters' });
      return;
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'Account already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = await createUser(email, passwordHash);

    const token = signAuthToken({ id: userId, email });
    res.status(201).json({ token, user: { id: userId, email } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create account' });
  }
});

app.post('/api/auth/login', async (req, res) => {
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

    const token = signAuthToken({ id: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch {
    res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/api/vault/:slot', requireAuth, async (req, res) => {
  try {
    const slot = String(req.params.slot || 'primary');
    const vault = await getVault(req.user.id, slot);
    res.json({ meta: vault?.vault_meta || null, data: vault?.vault_data || null });
  } catch {
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
  } catch {
    res.status(500).json({ error: 'Failed to save vault' });
  }
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Diary API listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
