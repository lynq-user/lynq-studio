/**
 * POST /api/collect — Event toplama endpoint'i
 * ─────────────────────────────────────────────
 * Tracker'dan gelen event'leri alır, validate eder, zenginleştirir
 * ve buffer'a ekler. Buffer dolunca ClickHouse'a batch insert yapar.
 *
 * Doküman referansları:
 *   - Bölüm 3.3: Endpoint Tasarımı, Validation, Enrichment
 *   - Response: 204 No Content (en hızlı response)
 */

const { validate } = require('../middleware/validate');
const { enrich } = require('../middleware/enrich');

async function collectRoute(app) {

  app.post('/api/collect', async (request, reply) => {
    const startTime = Date.now();

    try {
      // ─── 1. Validation ──────────────────────
      const { valid, event, error } = validate(request.body);

      if (!valid) {
        // Geçersiz event'i silme — bad_events tablosuna kaydet (non-lossy ilkesi)
        app.buffer.addBadEvent({
          website_id: request.body?.website_id || '',
          payload: JSON.stringify(request.body || {}),
          reason: error,
          ip_hash: hashIP(request.ip),
          user_agent: request.headers['user-agent'] || ''
        });

        // Yine de 204 döndür — tracker'a hata bildirme (güvenlik)
        return reply.code(204).send();
      }

      // ─── 2. Bot Filtering ───────────────────
      const userAgent = request.headers['user-agent'] || '';
      const { isbot: isBotCheck } = require('isbot');
      if (isBotCheck(userAgent)) {
        return reply.code(204).send(); // Bot trafiğini sessizce at
      }

      // ─── 3. Enrichment ─────────────────────
      const enrichedEvent = enrich(event, {
        ip: request.ip,
        userAgent: userAgent
      });

      // ─── 4. Ham veriyi kaydet (non-lossy) ──
      app.buffer.addRawEvent({
        website_id: enrichedEvent.website_id,
        payload: JSON.stringify(request.body),
        ip_hash: hashIP(request.ip),
        user_agent: userAgent
      });

      // ─── 5. Buffer'a ekle ──────────────────
      app.buffer.addEvent(enrichedEvent);

    } catch (err) {
      app.log.error({ err }, 'Collect endpoint error');
    }

    // Her zaman 204 döndür — hızlı response, bilgi sızdırma
    return reply.code(204).send();
  });
}

/**
 * IP adresini hash'le — PII koruması
 * Tam IP saklama, GDPR gereği hash veya truncation uygula
 */
function hashIP(ip) {
  if (!ip) return '';
  const crypto = require('crypto');
  // Günlük salt ile hash — aynı gün içinde aynı IP eşleşir ama gün sonunda anonimleşir
  const daySalt = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return crypto.createHash('sha256').update(ip + daySalt).digest('hex').slice(0, 16);
}

module.exports = { collectRoute };
