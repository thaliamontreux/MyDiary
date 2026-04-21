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
  const existingAppPassword = process.env.MYSQL_APP_PASSWORD || process.env.MYSQL_PASSWORD || '';
  const appPassword = existingAppPassword || crypto.randomBytes(18).toString('base64url');

  const admin = await mysql.createConnection({
    ...transport,
    user: adminUser,
    password: adminPassword
  });

  try {
    await admin.query(`CREATE DATABASE IF NOT EXISTS ${sqlIdentifier(databaseName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    const userSpec = `${sqlString(appUser)}@${sqlString(appHost)}`;
    await admin.query(`CREATE USER IF NOT EXISTS ${userSpec} IDENTIFIED BY ${sqlString(appPassword)}`);
    await admin.query(`ALTER USER ${userSpec} IDENTIFIED BY ${sqlString(appPassword)}`);
    await admin.query(`GRANT ALL PRIVILEGES ON ${sqlIdentifier(databaseName)}.* TO ${userSpec}`);
    await admin.query('FLUSH PRIVILEGES');

    const shouldPromoteAppUserInEnv = !process.env.MYSQL_USER || process.env.MYSQL_USER === 'root';
    if (shouldPromoteAppUserInEnv || !process.env.MYSQL_APP_PASSWORD) {
      await updateEnvFile({
        MYSQL_USER: appUser,
        MYSQL_PASSWORD: appPassword,
        MYSQL_DATABASE: databaseName,
        MYSQL_APP_USER: appUser,
        MYSQL_APP_PASSWORD: appPassword,
        MYSQL_APP_HOST: appHost
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

  const connectionLimit = Number(process.env.MYSQL_CONNECTION_LIMIT || 20);
  const queueLimit = Number(process.env.MYSQL_QUEUE_LIMIT || 0);
  const maxIdle = Number(process.env.MYSQL_MAX_IDLE || Math.max(4, Math.floor(connectionLimit / 2)));
  const idleTimeout = Number(process.env.MYSQL_IDLE_TIMEOUT_MS || 60000);
  const connectTimeout = Number(process.env.MYSQL_CONNECT_TIMEOUT_MS || 10000);
  const keepAliveInitialDelay = Number(process.env.MYSQL_KEEP_ALIVE_INITIAL_DELAY_MS || 0);

  pool = mysql.createPool({
    ...bootstrap.transport,
    user: bootstrap.user,
    password: bootstrap.password,
    database: bootstrap.databaseName,
    waitForConnections: true,
    connectionLimit,
    queueLimit,
    maxIdle,
    idleTimeout,
    connectTimeout,
    enableKeepAlive: true,
    keepAliveInitialDelay
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(100) DEFAULT NULL,
      middle_name VARCHAR(100) DEFAULT NULL,
      last_name VARCHAR(100) DEFAULT NULL,
      username VARCHAR(64) DEFAULT NULL,
      address_line VARCHAR(255) DEFAULT NULL,
      city VARCHAR(128) DEFAULT NULL,
      state_region VARCHAR(128) DEFAULT NULL,
      postal_code VARCHAR(32) DEFAULT NULL,
      country_code VARCHAR(2) DEFAULT NULL,
      is_admin TINYINT(1) NOT NULL DEFAULT 0,
      must_change_password TINYINT(1) NOT NULL DEFAULT 0,
      tos_accepted_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_users_username (username)
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(128) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // One-time migration hook for older installs that created a simpler users table
  const [existingMigrations] = await pool.query(
    'SELECT name FROM schema_migrations WHERE name = ? LIMIT 1',
    ['add_user_profile_fields_v1']
  );
  if (existingMigrations.length === 0) {
    // Add profile columns and username uniqueness if they do not already exist.
    // We cannot rely on "IF NOT EXISTS" in ALTER TABLE across all MySQL versions,
    // so we inspect INFORMATION_SCHEMA first and then add missing pieces.

    const databaseName = bootstrap.databaseName;

    async function ensureColumn(tableName, columnName, definitionSql) {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS count
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [databaseName, tableName, columnName]
      );
      if (!rows[0].count) {
        await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${definitionSql}`);
      }
    }

    async function ensureUniqueIndex(tableName, indexName, indexSql) {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS count
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [databaseName, tableName, indexName]
      );
      if (!rows[0].count) {
        await pool.query(`ALTER TABLE ${tableName} ADD UNIQUE KEY ${indexSql}`);
      }
    }

    await ensureColumn('users', 'first_name', 'first_name VARCHAR(100) DEFAULT NULL');
    await ensureColumn('users', 'middle_name', 'middle_name VARCHAR(100) DEFAULT NULL');
    await ensureColumn('users', 'last_name', 'last_name VARCHAR(100) DEFAULT NULL');
    await ensureColumn('users', 'username', 'username VARCHAR(64) DEFAULT NULL');
    await ensureColumn('users', 'address_line', 'address_line VARCHAR(255) DEFAULT NULL');
    await ensureColumn('users', 'city', 'city VARCHAR(128) DEFAULT NULL');
    await ensureColumn('users', 'state_region', 'state_region VARCHAR(128) DEFAULT NULL');
    await ensureColumn('users', 'postal_code', 'postal_code VARCHAR(32) DEFAULT NULL');
    await ensureColumn('users', 'country_code', 'country_code VARCHAR(2) DEFAULT NULL');
    await ensureColumn('users', 'tos_accepted_at', 'tos_accepted_at TIMESTAMP NULL DEFAULT NULL');

    await ensureUniqueIndex('users', 'uniq_users_username', 'uniq_users_username (username)');

    await pool.query(
      'INSERT INTO schema_migrations (name) VALUES (?)',
      ['add_user_profile_fields_v1']
    );
  }

  // Add admin flags and must-change-password if missing
  const [adminFlagMigrations] = await pool.query(
    'SELECT name FROM schema_migrations WHERE name = ? LIMIT 1',
    ['add_user_admin_flags_v1']
  );
  if (adminFlagMigrations.length === 0) {
    const databaseName = bootstrap.databaseName;

    async function ensureColumnSimple(tableName, columnName, definitionSql) {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS count
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [databaseName, tableName, columnName]
      );
      if (!rows[0].count) {
        await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${definitionSql}`);
      }
    }

    await ensureColumnSimple('users', 'is_admin', 'is_admin TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumnSimple('users', 'must_change_password', 'must_change_password TINYINT(1) NOT NULL DEFAULT 0');

    await pool.query(
      'INSERT INTO schema_migrations (name) VALUES (?)',
      ['add_user_admin_flags_v1']
    );
  }

  // Seed default admin if not present
  const [adminRows] = await pool.query(
    'SELECT id FROM users WHERE is_admin = 1 LIMIT 1'
  );
  if (!adminRows.length) {
    const adminEmail = 'admin@example.com';
    const adminPassword = 'admin';
    const adminHash = await bcrypt.hash(adminPassword, 12);
    await pool.query(
      'INSERT INTO users (email, password_hash, username, is_admin, must_change_password) VALUES (?, ?, ?, 1, 1)',
      [adminEmail.toLowerCase(), adminHash, 'admin']
    );
  }
}

export async function createUser({
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
}) {
  ensurePool();
  const [result] = await pool.query(
    `INSERT INTO users (
       email,
       password_hash,
       first_name,
       middle_name,
       last_name,
       username,
       address_line,
       city,
       state_region,
       postal_code,
       country_code
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      email,
      passwordHash,
      firstName || null,
      middleName || null,
      lastName || null,
      username || null,
      addressLine || null,
      city || null,
      stateRegion || null,
      postalCode || null,
      countryCode || null
    ]
  );
  return result.insertId;
}

export async function findUserByEmail(email) {
  ensurePool();
  const [rows] = await pool.query(
    `SELECT
       id,
       email,
       password_hash,
       first_name,
       middle_name,
       last_name,
       username,
       address_line,
       city,
       state_region,
       postal_code,
       country_code,
       tos_accepted_at,
       is_admin,
       must_change_password
     FROM users
     WHERE email = ?
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

export async function upsertUserPassword(userId, passwordHash) {
  ensurePool();
  await pool.query('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [passwordHash, userId]);
}

export async function findUserByUsername(username) {
  ensurePool();
  const [rows] = await pool.query(
    `SELECT
       id,
       email,
       password_hash,
       first_name,
       middle_name,
       last_name,
       username,
       address_line,
       city,
       state_region,
       postal_code,
       country_code,
       tos_accepted_at,
       is_admin,
       must_change_password
     FROM users
     WHERE LOWER(username) = LOWER(?)
     LIMIT 1`,
    [username]
  );
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

export async function pingDatabase() {
  ensurePool();
  await pool.query('SELECT 1');
  return true;
}

export async function markUserTosAccepted(userId) {
  ensurePool();
  await pool.query('UPDATE users SET tos_accepted_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
  const [rows] = await pool.query(
    `SELECT
       id,
       email,
       first_name,
       middle_name,
       last_name,
       username,
       address_line,
       city,
       state_region,
       postal_code,
       country_code,
       tos_accepted_at,
       is_admin,
       must_change_password
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

export async function deleteUserById(userId) {
  ensurePool();
  const [result] = await pool.query('DELETE FROM users WHERE id = ? LIMIT 1', [userId]);
  return result.affectedRows > 0;
}

export async function updateUsername(userId, username) {
  ensurePool();
  await pool.query('UPDATE users SET username = ? WHERE id = ?', [username, userId]);
  const [rows] = await pool.query(
    `SELECT
       id,
       email,
       first_name,
       middle_name,
       last_name,
       username,
       address_line,
       city,
       state_region,
       postal_code,
       country_code,
       tos_accepted_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

export { pool };
