/**
 * Admin API — Yönetim ekibi için veri endpoint'leri
 * ─────────────────────────────────────────────────
 * Müşteri bazlı debug, event logları, kullanım metrikleri,
 * maliyet hesaplama, sistem sağlığı.
 */

async function adminRoute(app) {

  // ─── Tüm müşterilerin özet durumu ─────────
  app.get('/api/admin/clients', async (request, reply) => {
    try {
      const result = await app.clickhouse.query({
        query: `
          SELECT
            website_id,
            count() AS total_events,
            countIf(event_type = 'page_view') AS pageviews,
            uniqExact(client_id) AS unique_visitors,
            uniqExact(session_id) AS sessions,
            min(timestamp) AS first_event,
            max(timestamp) AS last_event,
            countIf(timestamp >= now() - INTERVAL 1 HOUR) AS events_last_hour,
            countIf(timestamp >= now() - INTERVAL 24 HOUR) AS events_last_24h,
            countIf(timestamp >= now() - INTERVAL 5 MINUTE) AS events_last_5min
          FROM lynq_analytics.events
          GROUP BY website_id
          ORDER BY total_events DESC
        `
      });
      const json = await result.json();
      return reply.send({ clients: json.data });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // ─── Tek müşteri detaylı debug bilgisi ─────
  app.get('/api/admin/clients/:websiteId', async (request, reply) => {
    const { websiteId } = request.params;
    const hours = parseInt(request.query.hours || '24');

    try {
      // Genel istatistikler
      const statsResult = await app.clickhouse.query({
        query: `
          SELECT
            count() AS total_events,
            countIf(event_type = 'page_view') AS pageviews,
            countIf(event_type = 'session_start') AS session_starts,
            countIf(event_type = 'scroll') AS scrolls,
            countIf(event_type = 'custom') AS custom_events,
            countIf(event_type = 'purchase') AS purchases,
            uniqExact(client_id) AS unique_visitors,
            uniqExact(session_id) AS sessions,
            min(timestamp) AS first_event,
            max(timestamp) AS last_event
          FROM lynq_analytics.events
          WHERE website_id = {websiteId:String}
            AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
        `,
        query_params: { websiteId, hours }
      });

      // Son event'ler (debug için)
      const recentResult = await app.clickhouse.query({
        query: `
          SELECT
            toTimeZone(timestamp, 'Europe/Istanbul') AS ts,
            event_type,
            event_name,
            url_path,
            browser,
            os,
            device_type,
            referrer_domain,
            substring(client_id, 1, 8) AS client_short,
            substring(session_id, 1, 8) AS session_short
          FROM lynq_analytics.events
          WHERE website_id = {websiteId:String}
          ORDER BY timestamp DESC
          LIMIT 50
        `,
        query_params: { websiteId }
      });

      // Saatlik dağılım
      const hourlyResult = await app.clickhouse.query({
        query: `
          SELECT
            toStartOfHour(toTimeZone(timestamp, 'Europe/Istanbul')) AS saat,
            count() AS events,
            uniqExact(client_id) AS visitors,
            countIf(event_type = 'page_view') AS pageviews
          FROM lynq_analytics.events
          WHERE website_id = {websiteId:String}
            AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
          GROUP BY saat
          ORDER BY saat
        `,
        query_params: { websiteId, hours }
      });

      // Bad events (hatalar)
      const badResult = await app.clickhouse.query({
        query: `
          SELECT
            toTimeZone(timestamp, 'Europe/Istanbul') AS ts,
            reason,
            substring(payload, 1, 200) AS payload_preview
          FROM lynq_analytics.bad_events
          WHERE website_id = {websiteId:String}
          ORDER BY timestamp DESC
          LIMIT 20
        `,
        query_params: { websiteId }
      });

      const stats = await statsResult.json();
      const recent = await recentResult.json();
      const hourly = await hourlyResult.json();
      const bad = await badResult.json();

      return reply.send({
        website_id: websiteId,
        period: `${hours} saat`,
        stats: stats.data[0] || {},
        recent_events: recent.data,
        hourly_breakdown: hourly.data,
        bad_events: bad.data,
        bad_event_count: bad.data.length
      });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // ─── Kullanım & maliyet raporu ─────────────
  app.get('/api/admin/usage', async (request, reply) => {
    try {
      // Aylık kullanım per client
      const usageResult = await app.clickhouse.query({
        query: `
          SELECT
            website_id,
            toStartOfMonth(timestamp) AS ay,
            count() AS events,
            uniqExact(client_id) AS visitors,
            countIf(event_type = 'page_view') AS pageviews,
            countIf(event_type = 'purchase') AS purchases
          FROM lynq_analytics.events
          GROUP BY website_id, ay
          ORDER BY ay DESC, events DESC
        `
      });

      // Toplam veri boyutu (tahmini)
      const sizeResult = await app.clickhouse.query({
        query: `
          SELECT
            table,
            formatReadableSize(sum(bytes_on_disk)) AS disk_size,
            sum(rows) AS total_rows
          FROM system.parts
          WHERE database = 'lynq_analytics' AND active
          GROUP BY table
          ORDER BY sum(bytes_on_disk) DESC
        `
      });

      const usage = await usageResult.json();
      const sizes = await sizeResult.json();

      // Maliyet hesaplama (tahmini)
      const totalEvents = usage.data.reduce((sum, row) => sum + parseInt(row.events), 0);
      const costEstimate = {
        clickhouse: totalEvents < 10000000 ? 0 : Math.ceil(totalEvents / 10000000) * 50,
        railway: 5,
        neon: 0,
        total: 0
      };
      costEstimate.total = costEstimate.clickhouse + costEstimate.railway + costEstimate.neon;

      return reply.send({
        monthly_usage: usage.data,
        storage: sizes.data,
        cost_estimate: {
          ...costEstimate,
          note: 'Tahmini aylık maliyet (USD)'
        }
      });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // ─── Sistem sağlığı (detaylı) ─────────────
  app.get('/api/admin/system', async (request, reply) => {
    const checks = {
      server: { status: 'ok', uptime: process.uptime(), memory: process.memoryUsage() },
      clickhouse: { status: 'unknown' },
      postgres: { status: 'unknown' },
      buffer: app.buffer.getStats()
    };

    // ClickHouse check
    try {
      const chResult = await app.clickhouse.query({ query: 'SELECT 1' });
      await chResult.json();
      checks.clickhouse.status = 'ok';

      const tableCount = await app.clickhouse.query({ query: 'SELECT count() as c FROM system.tables WHERE database = \'lynq_analytics\'' });
      const tc = await tableCount.json();
      checks.clickhouse.tables = parseInt(tc.data[0]?.c || 0);
    } catch (err) {
      checks.clickhouse.status = 'error';
      checks.clickhouse.error = err.message;
    }

    // PostgreSQL check
    try {
      const pgResult = await app.pgPool.query('SELECT NOW() as now, count(*) as websites FROM websites');
      checks.postgres.status = 'ok';
      checks.postgres.websites = parseInt(pgResult.rows[0]?.websites || 0);
    } catch (err) {
      checks.postgres.status = 'error';
      checks.postgres.error = err.message;
    }

    // Son 1 saatte bad event oranı
    try {
      const badRate = await app.clickhouse.query({
        query: `
          SELECT
            (SELECT count() FROM lynq_analytics.bad_events WHERE timestamp >= now() - INTERVAL 1 HOUR) AS bad,
            (SELECT count() FROM lynq_analytics.events WHERE timestamp >= now() - INTERVAL 1 HOUR) AS good
        `
      });
      const br = await badRate.json();
      checks.bad_event_rate = {
        bad: parseInt(br.data[0]?.bad || 0),
        good: parseInt(br.data[0]?.good || 0)
      };
    } catch {}

    return reply.send(checks);
  });

  // ─── Canlı event stream (son N event) ──────
  app.get('/api/admin/live', async (request, reply) => {
    const limit = Math.min(parseInt(request.query.limit || '30'), 100);
    const websiteId = request.query.website_id || '';

    try {
      const whereClause = websiteId ? `WHERE website_id = '${websiteId}'` : '';
      const result = await app.clickhouse.query({
        query: `
          SELECT
            toTimeZone(timestamp, 'Europe/Istanbul') AS ts,
            event_type,
            event_name,
            website_id,
            url_path,
            page_title,
            browser,
            os,
            device_type,
            referrer_domain,
            country,
            substring(client_id, 1, 8) AS client_short,
            value,
            transaction_id
          FROM lynq_analytics.events
          ${whereClause}
          ORDER BY timestamp DESC
          LIMIT ${limit}
        `
      });
      const json = await result.json();
      return reply.send({ events: json.data, count: json.data.length });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });
}

module.exports = { adminRoute };
