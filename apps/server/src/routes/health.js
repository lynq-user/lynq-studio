/**
 * GET /health — Sağlık kontrolü endpoint'i
 * Monitoring ve load balancer health check'leri için.
 */

async function healthRoute(app) {

  app.get('/health', async (request, reply) => {
    try {
      // ClickHouse bağlantı kontrolü
      await app.clickhouse.query({ query: 'SELECT 1' });

      return reply.code(200).send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        buffer: {
          events: app.buffer.getStats().eventCount,
          rawEvents: app.buffer.getStats().rawEventCount,
          badEvents: app.buffer.getStats().badEventCount
        }
      });
    } catch (err) {
      return reply.code(503).send({
        status: 'error',
        message: 'ClickHouse connection failed'
      });
    }
  });
}

module.exports = { healthRoute };
