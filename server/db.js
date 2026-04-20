import mysql from 'mysql2/promise';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

let pool = null;

function getTransportConfig() {
  const useSocket = (process.env.MYSQL_USE_SOCKET || 'true').toLowerCase() === 'true';
  if (useSocket) {
    return {
      socketPath: process.env.MYSQL_SOCKET_PATH || '/var/run/mysqld/mysqld.sock'
    };
  }
  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306)
  };
}

function sqlIdentifier(name) {
  return `\`${String(name).replace(/`/g, '``')}\``;
}

function sqlString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function updateEnvFile(patch) {
  const envPath = path.resolve(process.cwd(), '.env');
  let content = '';
  try {
    content = await fs.readFile(envPath, 'utf8');
  } catch {
    content = '';
  }

  const lines = content ? content.split(/\r?\n/) : [];
  const existing = new Map();

  lines.forEach((line, index) => {
    const eq = line.indexOf('=');
    if (eq <= 0) return;
    const key = line.slice(0, eq).trim();
    existing.set(key, index);
  });

  const nextLines = [...lines];
  Object.entries(patch).forEach(([key, value]) => {
    const line = `${key}=${value}`;
    if (existing.has(key)) {
      nextLines[existing.get(key)] = line;
    } else {
      nextLines.push(line);
    }
  });

  const normalized = `${nextLines.filter((line) => line !== '').join('\n')}\n`;
  await fs.writeFile(envPath, normalized, 'utf8');
}

async function bootstrapDatabaseAndUserIfNeeded() {
  const transport = getTransportConfig();
  const adminUser = process.env.MYSQL_BOOTSTRAP_ROOT_USER || 'root';
  const adminPassword = process.env.MYSQL_BOOTSTRAP_ROOT_PASSWORD ?? '';
  const databaseName = process.env.MYSQL_DATABASE || 'diary_app';

  const appUser = process.env.MYSQL_APP_USER || 'diary_app_user';
  const appHost = process.env.MYSQL_APP_HOST || 'localhost';
  const appPassword = process.env.MYSQL_APP_PASSWORD || crypto.randomBytes(18).toString('base64url');

  const admin = await mysql.createConnection({
    ...transport,
    user: adminUser,
    password: adminPassword
  });

  try {
    const [rows] = await admin.query('SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?', [databaseName]);
    const databaseExists = Array.isArray(rows) && rows.length > 0;

    if (!databaseExists) {
      await admin.query(`CREATE DATABASE IF NOT EXISTS ${sqlIdentifier(databaseName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      const userSpec = `${sqlString(appUser)}@${sqlString(appHost)}`;
      await admin.query(`CREATE USER IF NOT EXISTS ${userSpec} IDENTIFIED BY ${sqlString(appPassword)}`);
      await admin.query(`ALTER USER ${userSpec} IDENTIFIED BY ${sqlString(appPassword)}`);
      await admin.query(`GRANT ALL PRIVILEGES ON ${sqlIdentifier(databaseName)}.* TO ${userSpec}`);
      await admin.query('FLUSH PRIVILEGES');

      await updateEnvFile({
        MYSQL_USER: appUser,
        MYSQL_PASSWORD: appPassword,
        MYSQL_DATABASE: databaseName,
        MYSQL_APP_USER: appUser,
        MYSQL_APP_PASSWORD: appPassword
      });
    }
  } finally {
    await admin.end();
  }

  return {
    transport,
    databaseName,
    user: process.env.MYSQL_USER || appUser,
    password: process.env.MYSQL_PASSWORD ?? appPassword
  };
}

function ensurePool() {
  if (!pool) throw new Error('Database pool not initialized. Call initializeDatabase() first.');
}

export async function initializeDatabase() {
  const bootstrap = await bootstrapDatabaseAndUserIfNeeded();

  pool = mysql.createPool({
    ...bootstrap.transport,
    user: bootstrap.user,
    password: bootstrap.password,
    database: bootstrap.databaseName,
    waitForConnections: true,
    connectionLimit: 10
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_vaults (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      slot_name VARCHAR(32) NOT NULL,
      vault_meta JSON NULL,
      vault_data JSON NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_slot (user_id, slot_name),
      CONSTRAINT fk_user_vaults_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

export async function createUser(email, passwordHash) {
  ensurePool();
  const [result] = await pool.query(
    'INSERT INTO users (email, password_hash) VALUES (?, ?)',
    [email, passwordHash]
  );
  return result.insertId;
}

export async function findUserByEmail(email) {
  ensurePool();
  const [rows] = await pool.query('SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
}

export async function getVault(userId, slot) {
  ensurePool();
  const [rows] = await pool.query(
    'SELECT vault_meta, vault_data FROM user_vaults WHERE user_id = ? AND slot_name = ? LIMIT 1',
    [userId, slot]
  );
  return rows[0] || null;
}

export async function upsertVault(userId, slot, vaultMeta, vaultData) {
  ensurePool();
  await pool.query(
    `INSERT INTO user_vaults (user_id, slot_name, vault_meta, vault_data)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       vault_meta = VALUES(vault_meta),
       vault_data = VALUES(vault_data),
       updated_at = CURRENT_TIMESTAMP`,
    [userId, slot, JSON.stringify(vaultMeta || null), JSON.stringify(vaultData || null)]
  );
}

export { pool };
