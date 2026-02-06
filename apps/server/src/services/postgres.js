/**
 * PostgreSQL Client — App DB bağlantısı
 * ──────────────────────────────────────
 * Plausible ve Umami yaklaşımı: uygulama verileri (kullanıcı hesapları,
 * website kayıtları, API key'ler) PostgreSQL'de tutulur.
 *
 * Doküman: Bölüm 3.4 — PostgreSQL (Uygulama Verileri)
 */

const { Pool } = require('pg');

/**
 * PostgreSQL connection pool oluştur
 */
function createPgPool() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'lynq_app',
    user: process.env.POSTGRES_USER || 'lynq',
    password: process.env.POSTGRES_PASSWORD || 'lynq_dev_password',
    max: 10, // connection pool boyutu
    idleTimeoutMillis: 30000
  });

  pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
  });

  return pool;
}

/**
 * Website ID'sinin geçerli olup olmadığını kontrol et
 * (Cache ile optimize edilebilir — Faz 3)
 */
async function isValidWebsite(pool, websiteId) {
  try {
    const result = await pool.query(
      'SELECT id FROM websites WHERE id = $1',
      [websiteId]
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * API key ile website ID'yi doğrula
 */
async function getWebsiteByApiKey(pool, apiKey) {
  try {
    const result = await pool.query(
      `SELECT w.id, w.domain, w.name
       FROM api_keys ak
       JOIN websites w ON w.id = ak.website_id
       WHERE ak.key = $1 AND ak.is_active = true`,
      [apiKey]
    );

    if (result.rows.length > 0) {
      // last_used_at güncelle (fire and forget)
      pool.query(
        'UPDATE api_keys SET last_used_at = NOW() WHERE key = $1',
        [apiKey]
      ).catch(() => {});

      return result.rows[0];
    }

    return null;
  } catch {
    return null;
  }
}

module.exports = { createPgPool, isValidWebsite, getWebsiteByApiKey };
