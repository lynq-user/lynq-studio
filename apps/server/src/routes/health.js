/**
 * GET /health — Sağlık kontrolü endpoint'i
 * Monitoring ve load balancer health check'leri için.
 */

async function healthRoute(app) {

  app.get('/health', async (request, reply) => {
    // Server çalışıyor mu? Her zaman 200 döndür — Railway health check için
    return reply.code(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      buffer: app.buffer.getStats()
    });
  });
}

module.exports = { healthRoute };
