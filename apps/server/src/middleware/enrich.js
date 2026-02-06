/**
 * Event Enrichment — Collector aşamasında yapılacak zenginleştirmeler
 * ──────────────────────────────────────────────────────────────────
 * Ham event'e ek bilgiler ekler: GeoIP, device parsing, UTM, referrer classification.
 *
 * Doküman referansları:
 *   - Bölüm 3.3: Enrichment
 *   - Snowplow: 15+ enrichment (IP → geo, UA → device, UTM, PII pseudonymization)
 *   - Plausible/Umami: Server-side enrichment
 */

const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');

/**
 * Event'i zenginleştir
 * @param {object} event - Validate edilmiş event
 * @param {object} context - { ip, userAgent }
 * @returns {object} Zenginleştirilmiş event
 */
function enrich(event, context) {
  const enriched = { ...event };

  // ─── 1. Device Parsing (ua-parser-js) ──────
  const ua = new UAParser(context.userAgent);
  const browser = ua.getBrowser();
  const os = ua.getOS();
  const device = ua.getDevice();

  enriched.browser = browser.name || 'Unknown';
  enriched.browser_version = browser.version || '';
  enriched.os = os.name || 'Unknown';
  enriched.device_type = mapDeviceType(device.type);

  // ─── 2. Referrer Domain Extraction ─────────
  if (enriched.referrer) {
    try {
      const url = new URL(enriched.referrer);
      enriched.referrer_domain = url.hostname.replace(/^www\./, '');
    } catch {
      enriched.referrer_domain = '';
    }
  } else {
    enriched.referrer_domain = '';
  }

  // ─── 3. UTM Parsing ───────────────────────
  // Tracker session-level attribution gönderiyorsa onu kullan,
  // yoksa URL query'den parse et
  const utmParams = parseUTM(enriched.url_query);
  enriched.utm_source = enriched.utm_source || utmParams.utm_source;
  enriched.utm_medium = enriched.utm_medium || utmParams.utm_medium;
  enriched.utm_campaign = enriched.utm_campaign || utmParams.utm_campaign;
  enriched.utm_term = enriched.utm_term || utmParams.utm_term;
  enriched.utm_content = enriched.utm_content || utmParams.utm_content;

  // ─── 4. GeoIP ──────────────────────────────
  const geo = geoip.lookup(context.ip);
  if (geo) {
    enriched.country = geo.country || '';  // ISO 3166-1: TR, US, DE
    enriched.city = geo.city || '';
  } else {
    enriched.country = '';
    enriched.city = '';
  }

  // ─── 5. Timestamp normalization ────────────
  // Client timestamp'ını DateTime formatına çevir
  try {
    const dt = new Date(enriched.timestamp);
    if (isNaN(dt.getTime())) throw new Error();
    enriched.timestamp = dt.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
  } catch {
    enriched.timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
  }

  return enriched;
}

/**
 * Device type mapping
 * ua-parser-js: mobile, tablet, console, smarttv, wearable, embedded, undefined
 * Lynq Studio: mobile, tablet, desktop
 */
function mapDeviceType(type) {
  if (type === 'mobile') return 'mobile';
  if (type === 'tablet') return 'tablet';
  return 'desktop'; // varsayılan
}

/**
 * URL query string'inden UTM parametrelerini çıkar
 */
function parseUTM(queryString) {
  const result = {
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_term: '',
    utm_content: ''
  };

  if (!queryString) return result;

  // ?key=value formatını parse et
  const query = queryString.startsWith('?') ? queryString.slice(1) : queryString;
  const params = new URLSearchParams(query);

  for (const key of Object.keys(result)) {
    result[key] = (params.get(key) || '').slice(0, 500);
  }

  return result;
}

/**
 * Referrer domain'ini kategorize et
 * search, social, direct, email, other
 */
function classifyReferrer(domain) {
  if (!domain) return 'direct';

  const searchEngines = ['google', 'bing', 'yahoo', 'duckduckgo', 'yandex', 'baidu', 'ecosia'];
  const socialNetworks = ['twitter', 'x.com', 'facebook', 'instagram', 'linkedin', 'reddit', 'youtube', 'tiktok', 'pinterest'];
  const emailProviders = ['mail.google.com', 'outlook.live.com', 'mail.yahoo.com'];

  const lower = domain.toLowerCase();

  if (searchEngines.some(s => lower.includes(s))) return 'search';
  if (socialNetworks.some(s => lower.includes(s))) return 'social';
  if (emailProviders.some(s => lower.includes(s))) return 'email';

  return 'referral';
}

module.exports = { enrich, classifyReferrer, parseUTM };
