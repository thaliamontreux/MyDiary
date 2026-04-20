import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'diary_app',
  waitForConnections: true,
  connectionLimit: 10
});

export async function initializeDatabase() {
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
  const [result] = await pool.query(
    'INSERT INTO users (email, password_hash) VALUES (?, ?)',
    [email, passwordHash]
  );
  return result.insertId;
}

export async function findUserByEmail(email) {
  const [rows] = await pool.query('SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
}

export async function getVault(userId, slot) {
  const [rows] = await pool.query(
    'SELECT vault_meta, vault_data FROM user_vaults WHERE user_id = ? AND slot_name = ? LIMIT 1',
    [userId, slot]
  );
  return rows[0] || null;
}

export async function upsertVault(userId, slot, vaultMeta, vaultData) {
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
