/**
 * Admin API — Yönetim ekibi için veri endpoint'leri
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
            countIf(timestamp >= now() - INTERVAL 5 MINUTE) AS events_last_5min,
            uniqExactIf(client_id, timestamp >= now() - INTERVAL 30 MINUTE) AS visitors_last_30min,
            countIf(timestamp >= now() - INTERVAL 30 MINUTE) AS events_last_30min
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
      const statsResult = await app.clickhouse.query({
        query: `
          SELECT
            count() AS total_events,
            countIf(event_type = 'page_view') AS pageviews,
            countIf(event_type = 'session_start') AS session_starts,
            countIf(event_type = 'scroll') AS scrolls,
            countIf(event_type = 'custom') AS custom_events,
            countIf(event_type = 'purchase') AS purchases,
            countIf(event_type = 'add_to_cart') AS add_to_carts,
            countIf(event_type = 'view_item') AS view_items,
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

      const recentResult = await app.clickhouse.query({
        query: `
          SELECT
            toTimeZone(timestamp, 'Europe/Istanbul') AS ts,
            event_type, event_name, url_path, browser, os, device_type,
            referrer_domain, country, city,
            substring(client_id, 1, 8) AS client_short,
            substring(session_id, 1, 8) AS session_short
          FROM lynq_analytics.events
          WHERE website_id = {websiteId:String}
          ORDER BY timestamp DESC LIMIT 50
        `,
        query_params: { websiteId }
      });

      const hourlyResult = await app.clickhouse.query({
        query: `
          SELECT
            toStartOfHour(toTimeZone(timestamp, 'Europe/Istanbul')) AS saat,
            count() AS events, uniqExact(client_id) AS visitors,
            countIf(event_type = 'page_view') AS pageviews
          FROM lynq_analytics.events
          WHERE website_id = {websiteId:String}
            AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
          GROUP BY saat ORDER BY saat
        `,
        query_params: { websiteId, hours }
      });

      const badResult = await app.clickhouse.query({
        query: `
          SELECT toTimeZone(timestamp, 'Europe/Istanbul') AS ts,
            reason, substring(payload, 1, 200) AS payload_preview
          FROM lynq_analytics.bad_events
          WHERE website_id = {websiteId:String}
          ORDER BY timestamp DESC LIMIT 20
        `,
        query_params: { websiteId }
      });

      const stats = await statsResult.json();
      const recent = await recentResult.json();
      const hourly = await hourlyResult.json();
      const bad = await badResult.json();

      return reply.send({
        website_id: websiteId, period: `${hours} saat`,
        stats: stats.data[0] || {}, recent_events: recent.data,
        hourly_breakdown: hourly.data, bad_events: bad.data,
        bad_event_count: bad.data.length
      });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // ─── Event detay — tek event'in tüm parametreleri ─────
  app.get('/api/admin/event-detail', async (request, reply) => {
    const websiteId = request.query.website_id || '';
    const limit = Math.min(parseInt(request.query.limit || '50'), 200);
    const eventType = request.query.event_type || '';
    const clientId = request.query.client_id || '';

    try {
      let where = "WHERE website_id = {websiteId:String}";
      const params = { websiteId, limit };

      if (eventType) {
        where += " AND event_type = {eventType:String}";
        params.eventType = eventType;
      }
      if (clientId) {
        where += " AND client_id LIKE {clientId:String}";
        params.clientId = clientId + '%';
      }

      const result = await app.clickhouse.query({
        query: `
          SELECT
            toTimeZone(timestamp, 'Europe/Istanbul') AS ts,
            event_type, event_name,
            -- Kimlik
            client_id, session_id,
            -- Sayfa
            url_path, url_query, page_title,
            -- Kaynak
            referrer, referrer_domain,
            utm_source, utm_medium, utm_campaign, utm_term, utm_content,
            -- Geo
            country, city,
            -- Cihaz
            browser, browser_version, os, device_type, screen, language,
            -- E-Commerce event-level
            transaction_id, affiliation, currency, value, tax, shipping,
            coupon, payment_type, shipping_tier,
            item_list_id, item_list_name,
            promotion_id, promotion_name,
            -- E-Commerce items
            \`items.item_id\` AS item_ids,
            \`items.item_name\` AS item_names,
            \`items.item_brand\` AS item_brands,
            \`items.item_category\` AS item_categories,
            \`items.item_variant\` AS item_variants,
            \`items.price\` AS item_prices,
            \`items.quantity\` AS item_quantities,
            \`items.discount\` AS item_discounts,
            -- Custom event
            event_category, event_label, event_value,
            -- Interaction
            click_element, click_text, click_url, click_id,
            scroll_depth,
            form_id, form_name,
            search_term,
            -- Web Vitals
            lcp_value, cls_value, inp_value,
            -- Properties
            properties
          FROM lynq_analytics.events
          ${where}
          ORDER BY timestamp DESC
          LIMIT {limit:UInt32}
        `,
        query_params: params
      });

      const json = await result.json();

      // Her event için hangi parametreler dolu / boş analizi
      const events = json.data.map(event => {
        const filled = [];
        const empty = [];

        for (const [key, val] of Object.entries(event)) {
          if (key === 'ts') continue;
          const isEmpty = val === '' || val === '0' || val === 0 ||
                          (Array.isArray(val) && val.length === 0) ||
                          (typeof val === 'object' && Object.keys(val).length === 0);
          if (isEmpty) {
            empty.push(key);
          } else {
            filled.push({ key, value: val });
          }
        }

        return {
          ts: event.ts,
          event_type: event.event_type,
          event_name: event.event_name,
          client_id: event.client_id,
          url_path: event.url_path,
          filled_params: filled,
          empty_params: empty,
          filled_count: filled.length,
          empty_count: empty.length
        };
      });

      return reply.send({ events, total: events.length });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // ─── Event type başına parametre doluluk raporu ─────
  app.get('/api/admin/param-coverage', async (request, reply) => {
    const websiteId = request.query.website_id || '';

    try {
      const result = await app.clickhouse.query({
        query: `
          SELECT
            event_type,
            count() AS total,
            -- Sayfa
            countIf(url_path != '') AS has_url_path,
            countIf(page_title != '') AS has_page_title,
            -- Kimlik
            countIf(client_id != '') AS has_client_id,
            countIf(session_id != '') AS has_session_id,
            -- Kaynak
            countIf(referrer != '') AS has_referrer,
            countIf(referrer_domain != '') AS has_referrer_domain,
            countIf(utm_source != '') AS has_utm_source,
            countIf(utm_medium != '') AS has_utm_medium,
            countIf(utm_campaign != '') AS has_utm_campaign,
            -- Geo
            countIf(country != '') AS has_country,
            countIf(city != '') AS has_city,
            -- Cihaz
            countIf(browser != '') AS has_browser,
            countIf(os != '') AS has_os,
            countIf(device_type != '') AS has_device_type,
            countIf(screen != '') AS has_screen,
            countIf(language != '') AS has_language,
            -- E-Commerce
            countIf(transaction_id != '') AS has_transaction_id,
            countIf(currency != '') AS has_currency,
            countIf(value > 0) AS has_value,
            countIf(length(\`items.item_id\`) > 0) AS has_items,
            -- Custom
            countIf(event_category != '') AS has_event_category,
            countIf(event_label != '') AS has_event_label,
            countIf(mapKeys(properties) != []) AS has_properties,
            -- Interaction
            countIf(click_text != '') AS has_click_text,
            countIf(scroll_depth > 0) AS has_scroll_depth,
            countIf(search_term != '') AS has_search_term
          FROM lynq_analytics.events
          WHERE website_id = {websiteId:String}
          GROUP BY event_type
          ORDER BY total DESC
        `,
        query_params: { websiteId }
      });

      const json = await result.json();
      return reply.send({ coverage: json.data });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // ─── Kullanım & maliyet raporu ─────────────
  app.get('/api/admin/usage', async (request, reply) => {
    try {
      const usageResult = await app.clickhouse.query({
        query: `
          SELECT website_id, toStartOfMonth(timestamp) AS ay,
            count() AS events, uniqExact(client_id) AS visitors,
            countIf(event_type = 'page_view') AS pageviews,
            countIf(event_type = 'purchase') AS purchases
          FROM lynq_analytics.events
          GROUP BY website_id, ay ORDER BY ay DESC, events DESC
        `
      });

      const sizeResult = await app.clickhouse.query({
        query: `
          SELECT table, formatReadableSize(sum(bytes_on_disk)) AS disk_size,
            sum(rows) AS total_rows
          FROM system.parts WHERE database = 'lynq_analytics' AND active
          GROUP BY table ORDER BY sum(bytes_on_disk) DESC
        `
      });

      const usage = await usageResult.json();
      const sizes = await sizeResult.json();

      const totalEvents = usage.data.reduce((sum, row) => sum + parseInt(row.events), 0);
      const costEstimate = {
        clickhouse: totalEvents < 10000000 ? 0 : Math.ceil(totalEvents / 10000000) * 50,
        railway: 5, neon: 0,
        total: 0
      };
      costEstimate.total = costEstimate.clickhouse + costEstimate.railway + costEstimate.neon;

      return reply.send({
        monthly_usage: usage.data, storage: sizes.data,
        cost_estimate: { ...costEstimate, note: 'Tahmini aylık maliyet (USD)' }
      });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // ─── Sistem sağlığı ───────────────────────
  app.get('/api/admin/system', async (request, reply) => {
    const checks = {
      server: { status: 'ok', uptime: process.uptime(), memory: process.memoryUsage() },
      clickhouse: { status: 'unknown' },
      postgres: { status: 'unknown' },
      buffer: app.buffer.getStats()
    };

    try {
      const chResult = await app.clickhouse.query({ query: 'SELECT 1' });
      await chResult.json();
      checks.clickhouse.status = 'ok';
      const tableCount = await app.clickhouse.query({ query: "SELECT count() as c FROM system.tables WHERE database = 'lynq_analytics'" });
      const tc = await tableCount.json();
      checks.clickhouse.tables = parseInt(tc.data[0]?.c || 0);
    } catch (err) {
      checks.clickhouse = { status: 'error', error: err.message };
    }

    try {
      const pgResult = await app.pgPool.query('SELECT count(*) as websites FROM websites');
      checks.postgres = { status: 'ok', websites: parseInt(pgResult.rows[0]?.websites || 0) };
    } catch (err) {
      checks.postgres = { status: 'error', error: err.message };
    }

    try {
      const badRate = await app.clickhouse.query({
        query: `SELECT
          (SELECT count() FROM lynq_analytics.bad_events WHERE timestamp >= now() - INTERVAL 1 HOUR) AS bad,
          (SELECT count() FROM lynq_analytics.events WHERE timestamp >= now() - INTERVAL 1 HOUR) AS good`
      });
      const br = await badRate.json();
      checks.bad_event_rate = { bad: parseInt(br.data[0]?.bad || 0), good: parseInt(br.data[0]?.good || 0) };
    } catch {}

    return reply.send(checks);
  });

  // ─── Canlı event stream ────────────────────
  app.get('/api/admin/live', async (request, reply) => {
    const limit = Math.min(parseInt(request.query.limit || '30'), 100);
    const websiteId = request.query.website_id || '';

    try {
      const whereClause = websiteId ? `WHERE website_id = '${websiteId}'` : '';
      const result = await app.clickhouse.query({
        query: `
          SELECT toTimeZone(timestamp, 'Europe/Istanbul') AS ts,
            event_type, event_name, website_id, url_path, page_title,
            browser, os, device_type, referrer_domain, country, city,
            client_id,
            substring(client_id, 1, 8) AS client_short,
            value, transaction_id
          FROM lynq_analytics.events ${whereClause}
          ORDER BY timestamp DESC LIMIT ${limit}
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
