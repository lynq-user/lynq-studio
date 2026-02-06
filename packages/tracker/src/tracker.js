/**
 * Lynq Studio — JS Tracker
 * ─────────────────────────
 * Hedef: <2KB (gzip), sıfır bağımlılık, first-party analytics.
 *
 * Kullanım:
 *   <script defer src="https://yoursite.com/t.js"
 *           data-website-id="UUID"
 *           data-endpoint="https://yoursite.com/api/collect">
 *   </script>
 *
 * Manuel event:
 *   window.lynq.event('signup_click', { plan: 'pro' });
 *
 * Doküman referansları:
 *   - Bölüm 3.2 (Tracker gereksinimleri)
 *   - Plausible: cookie kullanmadan 2KB tracker
 *   - Umami: sendBeacon + sessionStorage
 *   - Snowplow: first-party cookie ile client_id (2 yıl)
 */
(function () {
  'use strict';

  // ─── Konfigürasyon ──────────────────────────
  // 1. Önce window.__lynq config'i kontrol et (GTM uyumlu)
  // 2. Yoksa script tag'ındaki data attribute'ları oku
  var config = window.__lynq || {};
  var script = document.currentScript;

  var websiteId = config.websiteId || (script && script.getAttribute('data-website-id')) || '';
  var endpoint = config.endpoint || (script && script.getAttribute('data-endpoint')) || '/api/collect';

  if (!websiteId) return; // website-id yoksa hiçbir şey yapma

  // ─── Client ID (First-Party Cookie — 2 yıl) ──
  // Snowplow'un domain_userid yaklaşımı:
  // HttpOnly: false (JS erişimi gerekli), Secure, SameSite: Lax
  var CLIENT_ID_KEY = '_lynq_id';
  var SESSION_ID_KEY = '_lynq_sid';
  var SESSION_TIMEOUT = 30 * 60 * 1000; // 30 dakika (GA4 ile aynı)
  var COOKIE_MAX_AGE = 63072000;        // 2 yıl (saniye)

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? match[1] : null;
  }

  function setCookie(name, value, maxAge) {
    var parts = [name + '=' + value, 'path=/', 'max-age=' + maxAge, 'SameSite=Lax'];
    if (location.protocol === 'https:') parts.push('Secure');
    document.cookie = parts.join('; ');
  }

  function uuid() {
    // crypto.randomUUID() varsa kullan, yoksa fallback
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // Client ID: Cookie'den oku veya yeni üret
  var clientId = getCookie(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = uuid();
    setCookie(CLIENT_ID_KEY, clientId, COOKIE_MAX_AGE);
  }

  // ─── Session ID (sessionStorage — tab kapatılınca silinir) ──
  // Ek olarak 30dk inactivity timeout ile yeni session başlatılır.
  var sessionId;
  var lastActivity;

  function getSession() {
    try {
      var stored = sessionStorage.getItem(SESSION_ID_KEY);
      var storedTime = sessionStorage.getItem(SESSION_ID_KEY + '_t');
      var now = Date.now();

      if (stored && storedTime && (now - parseInt(storedTime, 10)) < SESSION_TIMEOUT) {
        sessionId = stored;
        lastActivity = now;
        sessionStorage.setItem(SESSION_ID_KEY + '_t', String(now));
        return false; // mevcut session
      }
    } catch (e) { /* sessionStorage erişim hatası — private browsing */ }

    // Yeni session başlat
    sessionId = uuid();
    lastActivity = Date.now();
    try {
      sessionStorage.setItem(SESSION_ID_KEY, sessionId);
      sessionStorage.setItem(SESSION_ID_KEY + '_t', String(lastActivity));
    } catch (e) { /* */ }
    return true; // yeni session
  }

  // ─── Event Gönderimi ────────────────────────
  function send(eventType, eventName, props) {
    var payload = {
      website_id: websiteId,
      event_type: eventType,
      event_name: eventName || '',
      client_id: clientId,
      session_id: sessionId,
      url_path: location.pathname,
      url_query: location.search,
      page_title: document.title || '',
      referrer: document.referrer || '',
      screen: screen.width + 'x' + screen.height,
      language: navigator.language || '',
      timestamp: new Date().toISOString(),
      properties: props ? JSON.stringify(props) : '{}'
    };

    var body = JSON.stringify(payload);

    // sendBeacon ile text/plain gönder — CORS preflight tetiklemez
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' }));
    } else {
      // Fallback: fetch — no credentials, no preflight
      fetch(endpoint, {
        method: 'POST',
        body: body,
        headers: { 'Content-Type': 'text/plain' },
        keepalive: true,
        mode: 'cors'
      }).catch(function () { /* sessiz hata */ });
    }
  }

  // ─── Sayfa Görüntüleme ──────────────────────
  function trackPageView() {
    var isNewSession = getSession();

    // Yeni session ise session_start gönder
    if (isNewSession) {
      send('session_start', '', {});
    }

    send('page_view', '', {});
  }

  // ─── SPA Desteği (History API dinleme) ──────
  // Route değişikliklerinde otomatik page_view tetiklenir
  var currentPath = location.pathname + location.search;

  function handleUrlChange() {
    var newPath = location.pathname + location.search;
    if (newPath !== currentPath) {
      currentPath = newPath;
      trackPageView();
    }
  }

  // pushState ve replaceState'i wrap et
  var origPushState = history.pushState;
  history.pushState = function () {
    origPushState.apply(this, arguments);
    handleUrlChange();
  };

  var origReplaceState = history.replaceState;
  history.replaceState = function () {
    origReplaceState.apply(this, arguments);
    handleUrlChange();
  };

  window.addEventListener('popstate', handleUrlChange);

  // ─── Scroll Depth Tracking ──────────────────
  // %25, %50, %75, %100 eşiklerinde tetiklenir
  var scrollMarks = {};

  function trackScroll() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    ) - window.innerHeight;

    if (docHeight <= 0) return;

    var percent = Math.round((scrollTop / docHeight) * 100);
    var thresholds = [25, 50, 75, 100];

    for (var i = 0; i < thresholds.length; i++) {
      var t = thresholds[i];
      if (percent >= t && !scrollMarks[t]) {
        scrollMarks[t] = true;
        send('scroll', '', { depth: t });
      }
    }
  }

  // Scroll'u throttle ile dinle (her 500ms'de bir)
  var scrollTimer;
  window.addEventListener('scroll', function () {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function () {
      scrollTimer = null;
      trackScroll();
    }, 500);
  }, { passive: true });

  // ─── E-Commerce event isimleri ──────────────
  var ECOM_EVENTS = [
    'view_item_list', 'select_item', 'view_item', 'add_to_wishlist',
    'add_to_cart', 'remove_from_cart', 'view_cart',
    'begin_checkout', 'add_shipping_info', 'add_payment_info',
    'purchase', 'refund',
    'view_promotion', 'select_promotion'
  ];

  // E-commerce alanları (properties'den ayrı gönderilecek)
  var ECOM_FIELDS = [
    'transaction_id', 'affiliation', 'currency', 'value', 'tax',
    'shipping', 'coupon', 'payment_type', 'shipping_tier',
    'item_list_id', 'item_list_name', 'items',
    'creative_name', 'creative_slot', 'promotion_id', 'promotion_name'
  ];

  // Interaction alanları
  var INTERACTION_FIELDS = [
    'event_category', 'event_label', 'event_value',
    'click_element', 'click_text', 'click_url', 'click_id', 'click_classes',
    'scroll_depth', 'form_id', 'form_name', 'form_destination',
    'video_provider', 'video_title', 'video_url', 'video_duration', 'video_percent',
    'file_name', 'file_extension', 'search_term',
    'lcp_value', 'fid_value', 'cls_value', 'inp_value'
  ];

  /**
   * Akıllı event gönderimi — event ismini tanır ve doğru alanları ayırır.
   *
   * Kullanım:
   *   lynq.track('purchase', { transaction_id: 'ORD-123', value: 349.90, currency: 'TRY', items: [...] })
   *   lynq.track('add_to_cart', { items: [{ item_id: 'SKU1', item_name: 'Nike', price: 199 }] })
   *   lynq.track('menu_click', { event_category: 'navigation', event_label: 'hamburger' })
   *   lynq.track('search', { search_term: 'kepenk motoru' })
   */
  function smartSend(name, data) {
    if (!name) return;
    getSession();
    data = data || {};

    // Event tipini belirle
    var isEcom = ECOM_EVENTS.indexOf(name) !== -1;
    var eventType = isEcom ? name : 'custom';

    // Payload oluştur
    var payload = {
      website_id: websiteId,
      event_type: eventType,
      event_name: name,
      client_id: clientId,
      session_id: sessionId,
      url_path: location.pathname,
      url_query: location.search,
      page_title: document.title || '',
      referrer: document.referrer || '',
      screen: screen.width + 'x' + screen.height,
      language: navigator.language || '',
      timestamp: new Date().toISOString()
    };

    // E-commerce ve interaction alanlarını doğrudan payload'a ekle
    var knownFields = ECOM_FIELDS.concat(INTERACTION_FIELDS);
    var extraProps = {};

    for (var key in data) {
      if (!data.hasOwnProperty(key)) continue;
      if (knownFields.indexOf(key) !== -1) {
        // Bilinen alan → doğrudan payload'a
        payload[key] = data[key];
      } else {
        // Bilinmeyen alan → properties map'ine
        extraProps[key] = String(data[key]);
      }
    }

    // Kalan properties'i ekle
    if (Object.keys(extraProps).length > 0) {
      payload.properties = JSON.stringify(extraProps);
    }

    // Gönder
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' }));
    } else {
      fetch(endpoint, {
        method: 'POST', body: body,
        headers: { 'Content-Type': 'text/plain' },
        keepalive: true, mode: 'cors'
      }).catch(function () {});
    }
  }

  // ─── Public API ─────────────────────────────
  window.lynq = {
    /**
     * Genel event gönderimi — her türlü event için kullanılır.
     * E-commerce, custom, interaction — hepsini otomatik tanır.
     *
     * @example
     * // E-Commerce
     * lynq.track('purchase', { transaction_id: 'ORD-123', value: 349.90, currency: 'TRY', items: [...] })
     * lynq.track('add_to_cart', { items: [{ item_id: 'SKU1', item_name: 'Nike Air', price: 199.95 }] })
     * lynq.track('view_item', { items: [{ item_id: 'SKU1', item_name: 'Nike Air', price: 199.95 }] })
     *
     * // Custom Event
     * lynq.track('menu_click', { event_category: 'navigation', event_label: 'hamburger' })
     * lynq.track('filter_apply', { event_category: 'filter', filter_type: 'size', filter_value: '42' })
     * lynq.track('newsletter_signup', { email_domain: 'gmail.com' })
     *
     * // Site Search
     * lynq.track('search', { search_term: 'kepenk motoru' })
     *
     * // File Download
     * lynq.track('file_download', { file_name: 'katalog.pdf', file_extension: 'pdf' })
     *
     * // Video
     * lynq.track('video_start', { video_title: 'Montaj Rehberi', video_provider: 'youtube' })
     */
    track: function (name, data) {
      smartSend(name, data);
    },

    // Geriye uyumluluk — eski API
    event: function (name, props) {
      smartSend(name, props);
    }
  };

  // ─── İlk sayfa görüntüleme ─────────────────
  trackPageView();
})();
