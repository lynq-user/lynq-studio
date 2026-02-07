/**
 * Event Validation — Snowplow'dan öğrenilen
 * ──────────────────────────────────────────
 * Gelen JSON'ın beklenen schema'ya uygun olup olmadığını kontrol eder.
 * GA4 uyumlu e-commerce event'leri ve custom event'leri destekler.
 */

// Kabul edilen event tipleri — GA4 e-commerce + custom + standart
const VALID_EVENT_TYPES = [
  // Standart
  'page_view', 'session_start', 'scroll', 'click', 'web_vital',
  // Custom
  'custom',
  // GA4 E-Commerce
  'view_item_list', 'select_item', 'view_item', 'add_to_wishlist',
  'add_to_cart', 'remove_from_cart', 'view_cart',
  'begin_checkout', 'add_shipping_info', 'add_payment_info',
  'purchase', 'refund',
  // GA4 Promotions
  'view_promotion', 'select_promotion',
  // Diğer GA4
  'search', 'share', 'sign_up', 'login', 'generate_lead',
  'form_submit', 'file_download', 'video_start', 'video_progress', 'video_complete'
];

const REQUIRED_FIELDS = ['website_id', 'event_type'];
const MAX_STRING = 500;
const MAX_ITEMS = 200;       // Bir event'te max 200 ürün
const MAX_PROPERTIES = 50;   // Custom properties max 50 key

/**
 * Gelen event payload'ını validate et
 */
function validate(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, event: null, error: 'invalid_body' };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!body[field] || typeof body[field] !== 'string' || body[field].trim() === '') {
      return { valid: false, event: null, error: `missing_${field}` };
    }
  }

  if (!VALID_EVENT_TYPES.includes(body.event_type)) {
    return { valid: false, event: null, error: 'invalid_event_type' };
  }

  // ─── Temel alanlar ──────────────────────
  const event = {
    website_id:    t(body.website_id, 64),
    event_type:    body.event_type,
    event_name:    t(body.event_name, MAX_STRING),
    client_id:     t(body.client_id, 64),
    session_id:    t(body.session_id, 64),
    url_path:      t(body.url_path, MAX_STRING),
    url_query:     t(body.url_query, MAX_STRING),
    page_title:    t(body.page_title, MAX_STRING),
    referrer:      t(body.referrer, MAX_STRING),
    screen:        t(body.screen, 20),
    language:      t(body.language, 20),
    timestamp:     body.timestamp || new Date().toISOString(),

    // ─── Trafik kaynağı (session-level attribution) ──
    utm_source:    t(body.utm_source, 100),
    utm_medium:    t(body.utm_medium, 100),
    utm_campaign:  t(body.utm_campaign, MAX_STRING),
    utm_term:      t(body.utm_term, MAX_STRING),
    utm_content:   t(body.utm_content, MAX_STRING),

    // ─── E-Commerce event-level parametreleri ──
    transaction_id:  t(body.transaction_id, MAX_STRING),
    affiliation:     t(body.affiliation, MAX_STRING),
    currency:        t(body.currency, 10),
    value:           num(body.value),
    tax:             num(body.tax),
    shipping:        num(body.shipping),
    coupon:          t(body.coupon, MAX_STRING),
    payment_type:    t(body.payment_type, 100),
    shipping_tier:   t(body.shipping_tier, 100),
    item_list_id:    t(body.item_list_id, MAX_STRING),
    item_list_name:  t(body.item_list_name, MAX_STRING),
    creative_name:   t(body.creative_name, MAX_STRING),
    creative_slot:   t(body.creative_slot, MAX_STRING),
    promotion_id:    t(body.promotion_id, MAX_STRING),
    promotion_name:  t(body.promotion_name, MAX_STRING),

    // ─── Custom event parametreleri ────────────
    event_category:  t(body.event_category, 100),
    event_label:     t(body.event_label, MAX_STRING),
    event_value:     num(body.event_value),

    // ─── Interaction tracking ──────────────────
    click_element:   t(body.click_element, MAX_STRING),
    click_text:      t(body.click_text, MAX_STRING),
    click_url:       t(body.click_url, MAX_STRING),
    click_classes:   t(body.click_classes, MAX_STRING),
    click_id:        t(body.click_id, 100),
    scroll_depth:    Math.min(Math.max(parseInt(body.scroll_depth) || 0, 0), 100),
    form_id:         t(body.form_id, 100),
    form_name:       t(body.form_name, MAX_STRING),
    form_destination: t(body.form_destination, MAX_STRING),
    video_provider:  t(body.video_provider, 50),
    video_title:     t(body.video_title, MAX_STRING),
    video_url:       t(body.video_url, MAX_STRING),
    video_duration:  num(body.video_duration),
    video_percent:   Math.min(Math.max(parseInt(body.video_percent) || 0, 0), 100),
    file_name:       t(body.file_name, MAX_STRING),
    file_extension:  t(body.file_extension, 20),
    search_term:     t(body.search_term, MAX_STRING),

    // ─── Web Vitals ───────────────────────────
    lcp_value:       num(body.lcp_value),
    fid_value:       num(body.fid_value),
    cls_value:       num(body.cls_value),
    inp_value:       num(body.inp_value),

    // ─── Custom properties (Map) ──────────────
    properties:      sanitizeProperties(body.properties)
  };

  // ─── Items array → ClickHouse Nested format ──
  // GTM'den items[] olarak gelir, ClickHouse'a items.xxx parallel array'leri olarak yazılır
  const items = parseItems(body.items);
  Object.assign(event, items);

  return { valid: true, event, error: null };
}

/**
 * GTM items[] → ClickHouse Nested parallel arrays
 * GTM gönderir: items: [{ item_id: "X", price: 10 }, ...]
 * ClickHouse ister: items.item_id: ["X", ...], items.price: [10, ...]
 */
function parseItems(items) {
  const result = {
    'items.item_id': [],
    'items.item_name': [],
    'items.affiliation': [],
    'items.coupon': [],
    'items.discount': [],
    'items.index': [],
    'items.item_brand': [],
    'items.item_category': [],
    'items.item_category2': [],
    'items.item_category3': [],
    'items.item_category4': [],
    'items.item_category5': [],
    'items.item_list_id': [],
    'items.item_list_name': [],
    'items.item_variant': [],
    'items.location_id': [],
    'items.price': [],
    'items.quantity': []
  };

  if (!Array.isArray(items)) return result;

  // Max 200 ürün
  const safeItems = items.slice(0, MAX_ITEMS);

  for (const item of safeItems) {
    if (!item || typeof item !== 'object') continue;

    result['items.item_id'].push(t(item.item_id, MAX_STRING));
    result['items.item_name'].push(t(item.item_name, MAX_STRING));
    result['items.affiliation'].push(t(item.affiliation, MAX_STRING));
    result['items.coupon'].push(t(item.coupon, MAX_STRING));
    result['items.discount'].push(num(item.discount));
    result['items.index'].push(Math.max(parseInt(item.index) || 0, 0));
    result['items.item_brand'].push(t(item.item_brand, MAX_STRING));
    result['items.item_category'].push(t(item.item_category, MAX_STRING));
    result['items.item_category2'].push(t(item.item_category2, MAX_STRING));
    result['items.item_category3'].push(t(item.item_category3, MAX_STRING));
    result['items.item_category4'].push(t(item.item_category4, MAX_STRING));
    result['items.item_category5'].push(t(item.item_category5, MAX_STRING));
    result['items.item_list_id'].push(t(item.item_list_id, MAX_STRING));
    result['items.item_list_name'].push(t(item.item_list_name, MAX_STRING));
    result['items.item_variant'].push(t(item.item_variant, MAX_STRING));
    result['items.location_id'].push(t(item.location_id, MAX_STRING));
    result['items.price'].push(num(item.price));
    result['items.quantity'].push(Math.max(parseInt(item.quantity) || 0, 0));
  }

  return result;
}

/** Truncate string */
function t(str, maxLen) {
  if (str === null || str === undefined) return '';
  if (typeof str !== 'string') return String(str).slice(0, maxLen);
  return str.slice(0, maxLen);
}

/** Safe number */
function num(val) {
  if (val === null || val === undefined) return 0;
  const n = parseFloat(val);
  return isFinite(n) ? n : 0;
}

/** Properties → Map(String, String) for ClickHouse */
function sanitizeProperties(props) {
  if (!props) return {};

  if (typeof props === 'string') {
    try { props = JSON.parse(props); } catch { return {}; }
  }

  if (typeof props !== 'object' || Array.isArray(props)) return {};

  const result = {};
  const keys = Object.keys(props).slice(0, MAX_PROPERTIES);

  for (const key of keys) {
    const val = props[key];
    if (val !== null && val !== undefined) {
      result[key] = String(val).slice(0, MAX_STRING);
    }
  }

  return result;
}

module.exports = { validate, VALID_EVENT_TYPES };
