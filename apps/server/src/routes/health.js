/**
 * GET /health — Sağlık kontrolü endpoint'i
 * Monitoring ve load balancer health check'leri için.
 */

async function healthRoute(app) {

  app.get('/health', async (request, reply) => {
    let chStatus = 'unknown';
    try {
      await app.clickhouse.query({ query: 'SELECT 1' });
      chStatus = 'connected';
    } catch (err) {
      chStatus = 'error: ' + (err.message || 'unknown');
    }

    return reply.code(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      buffer: app.buffer.getStats(),
      clickhouse: chStatus,
      env: {
        ch_host: process.env.CLICKHOUSE_HOST ? 'set' : 'MISSING',
        ch_db: process.env.CLICKHOUSE_DB || 'MISSING',
        ch_user: process.env.CLICKHOUSE_USER || 'MISSING',
        ch_pass: process.env.CLICKHOUSE_PASSWORD ? 'set' : 'MISSING',
        db_url: process.env.DATABASE_URL ? 'set' : 'MISSING'
      }
    });
  });
}

module.exports = { healthRoute };
