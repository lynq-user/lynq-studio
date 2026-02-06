/**
 * Lynq Studio — Ingestion Server
 * ───────────────────────────────
 * Fastify tabanlı HTTP server.
 * Tracker'dan gelen event'leri alır, validate eder, zenginleştirir,
 * buffer'da biriktirir ve ClickHouse'a batch insert yapar.
 *
 * Doküman referansları:
 *   - Bölüm 3.3: Ingestion Layer (Collect Endpoint)
 *   - Bölüm 4.1: Node.js (Fastify)
 *   - Bölüm 6.1: Proxy/ingestion layer kullan
 */

// Lokal'de .env dosyasını oku, production'da environment variable'lar kullanılır
try { require('dotenv').config({ path: '../../.env' }); } catch(e) {}

const Fastify = require('fastify');
const cors = require('@fastify/cors');
const rateLimit = require('@fastify/rate-limit');
const fastifyStatic = require('@fastify/static');
const path = require('path');

const { createClickHouseClient, ensureClickHouseTables } = require('./services/clickhouse');
const { createPgPool } = require('./services/postgres');
const { createBuffer } = require('./services/buffer');
const { collectRoute } = require('./routes/collect');
const { healthRoute } = require('./routes/health');
const { adminRoute } = require('./routes/admin');

async function start() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'info'
    },
    trustProxy: true  // Railway/proxy arkasında gerçek IP'yi al (X-Forwarded-For)
  });

  // ─── CORS ──────────────────────────────────
  // Sadece kendi domain'lerinden gelen isteklere izin ver
  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
  });

  // ─── text/plain body'yi JSON olarak parse et ──
  // Tracker CORS preflight'tan kaçınmak için text/plain gönderir
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, function (req, body, done) {
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      done(err);
    }
  });

  // ─── Rate Limiting ─────────────────────────
  // IP başına dakikada max 60 event (bot ve abuse koruması)
  await app.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10)
  });

  // ─── Static Files (Tracker JS serve) ───────
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '../../..', 'packages', 'tracker', 'dist'),
    prefix: '/t/',
    decorateReply: false
  });

  // ─── Admin Panel (static HTML) ─────────────
  await app.register(require('@fastify/static'), {
    root: path.join(__dirname, '../..', 'admin'),
    prefix: '/admin/',
    decorateReply: false
  });

  // ─── Services ──────────────────────────────
  const clickhouse = createClickHouseClient();
  const pgPool = createPgPool();
  const buffer = createBuffer(clickhouse);

  // ClickHouse tablolarının varlığını kontrol et (hata olursa bile server başlasın)
  ensureClickHouseTables(clickhouse).catch(err => console.error('ClickHouse check failed:', err.message));

  // Service'leri request context'ine ekle
  app.decorate('clickhouse', clickhouse);
  app.decorate('pgPool', pgPool);
  app.decorate('buffer', buffer);

  // ─── Routes ────────────────────────────────
  app.register(collectRoute);
  app.register(healthRoute);
  app.register(adminRoute);

  // ─── Graceful Shutdown ─────────────────────
  // Kapanırken buffer'daki kalan event'leri flush et
  const shutdown = async () => {
    app.log.info('Shutting down — flushing buffer...');
    await buffer.flush();
    await clickhouse.close();
    await pgPool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // ─── Start ─────────────────────────────────
  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Lynq Studio server running on port ${port}`);
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
