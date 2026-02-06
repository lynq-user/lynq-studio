/**
 * Admin User Journey API — Tek kullanıcının tüm hareketleri
 */

async function adminUserRoute(app) {

  // ─── Kullanıcı yolculuğu (tüm event'ler sıralı) ─────
  app.get('/api/admin/user/:clientId', async (request, reply) => {
    const { clientId } = request.params;
    const websiteId = request.query.website_id || '';

    try {
      let where = "WHERE client_id = {clientId:String}";
      const params = { clientId };

      if (websiteId) {
        where += " AND website_id = {websiteId:String}";
        params.websiteId = websiteId;
      }

      // Kullanıcı özeti
      const summaryResult = await app.clickhouse.query({
        query: `
          SELECT
            client_id,
            count() AS total_events,
            countIf(event_type = 'page_view') AS pageviews,
            countIf(event_type = 'purchase') AS purchases,
            countIf(event_type = 'add_to_cart') AS add_to_carts,
            uniqExact(session_id) AS total_sessions,
            min(toTimeZone(timestamp, 'Europe/Istanbul')) AS first_seen,
            max(toTimeZone(timestamp, 'Europe/Istanbul')) AS last_seen,
            any(browser) AS browser,
            any(os) AS os,
            any(device_type) AS device_type,
            any(country) AS country,
            any(city) AS city,
            any(language) AS language,
            any(screen) AS screen
          FROM lynq_analytics.events
          ${where}
          GROUP BY client_id
        `,
        query_params: params
      });

      // Tüm event'ler kronolojik sırada
      const eventsResult = await app.clickhouse.query({
        query: `
          SELECT
            toTimeZone(timestamp, 'Europe/Istanbul') AS ts,
            event_type,
            event_name,
            session_id,
            url_path,
            url_query,
            page_title,
            referrer,
            referrer_domain,
            utm_source,
            utm_medium,
            utm_campaign,
            country,
            city,
            browser,
            device_type,
            scroll_depth,
            transaction_id,
            currency,
            value,
            \`items.item_id\` AS item_ids,
            \`items.item_name\` AS item_names,
            \`items.price\` AS item_prices,
            event_category,
            event_label,
            click_text,
            search_term,
            properties
          FROM lynq_analytics.events
          ${where}
          ORDER BY timestamp ASC
          LIMIT 500
        `,
        query_params: params
      });

      const summary = await summaryResult.json();
      const events = await eventsResult.json();

      // Session'lara ayır
      const sessions = {};
      for (const ev of events.data) {
        const sid = ev.session_id || 'unknown';
        if (!sessions[sid]) {
          sessions[sid] = {
            session_id: sid,
            events: [],
            first_event: ev.ts,
            last_event: ev.ts,
            referrer_domain: '',
            utm_source: '',
            utm_medium: '',
            landing_page: ''
          };
        }
        sessions[sid].events.push(ev);
        sessions[sid].last_event = ev.ts;

        // Session'ın ilk event'inden attribution al
        if (sessions[sid].events.length === 1) {
          sessions[sid].referrer_domain = ev.referrer_domain;
          sessions[sid].utm_source = ev.utm_source;
          sessions[sid].utm_medium = ev.utm_medium;
          sessions[sid].landing_page = ev.url_path;
        }
      }

      return reply.send({
        client_id: clientId,
        summary: summary.data[0] || {},
        sessions: Object.values(sessions).reverse(),
        total_events: events.data.length
      });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });
}

module.exports = { adminUserRoute };
