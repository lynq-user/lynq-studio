-- ──────────────────────────────────────────────
-- Lynq Studio — ClickHouse Schema v2
-- ──────────────────────────────────────────────
-- E-Commerce + Custom Event desteği ile genişletilmiş.
-- GA4 uyumlu event modeli.
-- ──────────────────────────────────────────────

-- ═══════════════════════════════════════════════
-- 1. ANA EVENT TABLOSU
-- ═══════════════════════════════════════════════
-- Tüm event tipleri tek tabloda: page_view, e-commerce, custom, scroll...
-- Boş sütunlar ClickHouse'da çok iyi sıkıştırılır (sparse serialization).

CREATE TABLE IF NOT EXISTS lynq_analytics.events
(
    -- ── Zaman & Kimlik ──────────────────────
    timestamp         DateTime('UTC')           DEFAULT now(),
    event_type        LowCardinality(String),   -- page_view, session_start, scroll, custom,
                                                 -- view_item, add_to_cart, purchase, refund...
    event_name        String                    DEFAULT '',  -- Custom event adı veya e-com event tipi

    website_id        String,
    client_id         String                    DEFAULT '',
    session_id        String                    DEFAULT '',

    -- ── Sayfa Bilgileri ─────────────────────
    url_path          String                    DEFAULT '',
    url_query         String                    DEFAULT '',
    page_title        String                    DEFAULT '',

    -- ── Trafik Kaynağı ──────────────────────
    referrer          String                    DEFAULT '',
    referrer_domain   String                    DEFAULT '',
    utm_source        LowCardinality(String)    DEFAULT '',
    utm_medium        LowCardinality(String)    DEFAULT '',
    utm_campaign      String                    DEFAULT '',
    utm_term          String                    DEFAULT '',
    utm_content       String                    DEFAULT '',

    -- ── GeoIP ───────────────────────────────
    country           LowCardinality(String)    DEFAULT '',
    city              String                    DEFAULT '',

    -- ── Cihaz ───────────────────────────────
    browser           LowCardinality(String)    DEFAULT '',
    browser_version   String                    DEFAULT '',
    os                LowCardinality(String)    DEFAULT '',
    device_type       LowCardinality(String)    DEFAULT '',
    screen            String                    DEFAULT '',
    language          LowCardinality(String)    DEFAULT '',

    -- ══════════════════════════════════════════
    -- E-COMMERCE ALANLARI (GA4 resmi parametreleri)
    -- https://developers.google.com/analytics/devguides/collection/ga4/reference/events
    -- ══════════════════════════════════════════

    -- Event-level e-commerce parametreleri
    transaction_id    String                    DEFAULT '',  -- purchase, refund
    affiliation       String                    DEFAULT '',  -- Mağaza/satıcı adı
    currency          LowCardinality(String)    DEFAULT '',  -- ISO 4217: TRY, USD, EUR
    value             Float64                   DEFAULT 0,   -- Toplam tutar
    tax               Float64                   DEFAULT 0,
    shipping          Float64                   DEFAULT 0,
    coupon            String                    DEFAULT '',  -- Event-level kupon
    payment_type      LowCardinality(String)    DEFAULT '',  -- credit_card, bank_transfer, paypal
    shipping_tier     String                    DEFAULT '',  -- express, standard, cargo
    item_list_id      String                    DEFAULT '',  -- view_item_list: Liste ID'si
    item_list_name    String                    DEFAULT '',  -- view_item_list: Liste adı
    creative_name     String                    DEFAULT '',  -- select_promotion
    creative_slot     String                    DEFAULT '',  -- select_promotion
    promotion_id      String                    DEFAULT '',  -- view_promotion, select_promotion
    promotion_name    String                    DEFAULT '',  -- view_promotion, select_promotion

    -- ─── Items (GA4 items[] array — Nested type) ──
    -- GTM'den gelen ecommerce.items dizisinin birebir karşılığı.
    -- Her item parametresi GA4 dokümanıyla aynı isimde.
    -- Nested type ClickHouse'da parallel array olarak saklanır, sorgu performansı yüksektir.
    -- Kullanım: items.item_id, items.price, items.quantity şeklinde erişilir.

    `items.item_id`         Array(String),       -- SKU veya ürün ID
    `items.item_name`       Array(String),       -- Ürün adı
    `items.affiliation`     Array(String),       -- Ürün bazlı mağaza/satıcı
    `items.coupon`          Array(String),       -- Ürün bazlı kupon kodu
    `items.discount`        Array(Float64),      -- Ürün bazlı indirim tutarı
    `items.index`           Array(UInt32),       -- Liste içindeki sırası (position)
    `items.item_brand`      Array(String),       -- Marka: Nike, Apple
    `items.item_category`   Array(String),       -- Kategori 1: Giyim
    `items.item_category2`  Array(String),       -- Kategori 2: Erkek
    `items.item_category3`  Array(String),       -- Kategori 3: T-Shirt
    `items.item_category4`  Array(String),       -- Kategori 4: Crew Neck
    `items.item_category5`  Array(String),       -- Kategori 5: Kısa Kollu
    `items.item_list_id`    Array(String),       -- Hangi listeden geldi (ID)
    `items.item_list_name`  Array(String),       -- Hangi listeden geldi (ad)
    `items.item_variant`    Array(String),       -- Varyant: Kırmızı, XL, 128GB
    `items.location_id`     Array(String),       -- Mağaza lokasyonu ID
    `items.price`           Array(Float64),      -- Birim fiyat
    `items.quantity`        Array(UInt32),        -- Adet

    -- ══════════════════════════════════════════
    -- CUSTOM EVENT ALANLARI (Esnek yapı)
    -- ══════════════════════════════════════════
    -- Sabit sütunlar: sık kullanılan custom event parametreleri
    event_category    LowCardinality(String)    DEFAULT '',  -- menu, filter, video, form, cta...
    event_label       String                    DEFAULT '',  -- "Hamburger Menu", "Size Filter"
    event_value       Float64                   DEFAULT 0,   -- Sayısal değer (video süre, scroll %, vs.)

    -- Esnek JSON: Her türlü ek veri için
    -- ClickHouse Map tipi → SQL ile doğrudan sorgula
    properties        Map(String, String)       DEFAULT map(),

    -- ══════════════════════════════════════════
    -- INTERACTION TRACKING
    -- ══════════════════════════════════════════
    -- Otomatik yakalanan etkileşim bilgileri
    click_element     String                    DEFAULT '',  -- Tıklanan elementin CSS selector'ı
    click_text        String                    DEFAULT '',  -- Butonun/linkin görünen metni
    click_url         String                    DEFAULT '',  -- Link href'i
    click_classes     String                    DEFAULT '',  -- CSS class'ları
    click_id          String                    DEFAULT '',  -- Element ID'si

    -- Scroll
    scroll_depth      UInt8                     DEFAULT 0,   -- 0-100 arası yüzde

    -- Form
    form_id           String                    DEFAULT '',  -- Form ID/name
    form_name         String                    DEFAULT '',
    form_destination  String                    DEFAULT '',  -- Form action URL

    -- Video
    video_provider    LowCardinality(String)    DEFAULT '',  -- youtube, vimeo, html5
    video_title       String                    DEFAULT '',
    video_url         String                    DEFAULT '',
    video_duration    Float64                   DEFAULT 0,   -- Saniye
    video_percent     UInt8                     DEFAULT 0,   -- İzleme yüzdesi

    -- File Download
    file_name         String                    DEFAULT '',
    file_extension    LowCardinality(String)    DEFAULT '',  -- pdf, xlsx, zip...

    -- Search
    search_term       String                    DEFAULT '',  -- Site içi arama terimi

    -- Web Vitals
    lcp_value         Float64                   DEFAULT 0,
    fid_value         Float64                   DEFAULT 0,
    cls_value         Float64                   DEFAULT 0,
    inp_value         Float64                   DEFAULT 0
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (website_id, timestamp)
TTL timestamp + INTERVAL 2 YEAR
SETTINGS index_granularity = 8192;


-- ═══════════════════════════════════════════════
-- 2. HAM EVENT TABLOSU (Non-lossy — Snowplow ilkesi)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lynq_analytics.raw_events
(
    timestamp         DateTime('UTC')           DEFAULT now(),
    website_id        String,
    payload           String,
    ip_hash           String                    DEFAULT '',
    user_agent        String                    DEFAULT ''
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (website_id, timestamp)
TTL timestamp + INTERVAL 6 MONTH
SETTINGS index_granularity = 8192;


-- ═══════════════════════════════════════════════
-- 3. BAD EVENTS TABLOSU
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lynq_analytics.bad_events
(
    timestamp         DateTime('UTC')           DEFAULT now(),
    website_id        String                    DEFAULT '',
    payload           String,
    reason            String,
    ip_hash           String                    DEFAULT '',
    user_agent        String                    DEFAULT ''
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp)
TTL timestamp + INTERVAL 3 MONTH
SETTINGS index_granularity = 8192;


-- ═══════════════════════════════════════════════
-- 4. MATERIALIZED VIEW'LAR — Temel Metrikler
-- ═══════════════════════════════════════════════

-- ─── 4.1 Günlük Genel Özet ─────────────────

CREATE TABLE IF NOT EXISTS lynq_analytics.daily_stats
(
    date              Date,
    website_id        String,
    pageviews         UInt64,
    visitors          UInt64,
    sessions          UInt64,
    bounces           UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (website_id, date);

CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.daily_stats_mv
TO lynq_analytics.daily_stats AS
SELECT
    toDate(timestamp) AS date, website_id,
    countIf(event_type = 'page_view') AS pageviews,
    uniqExact(client_id) AS visitors,
    uniqExact(session_id) AS sessions,
    0 AS bounces
FROM lynq_analytics.events GROUP BY date, website_id;


-- ─── 4.2 Sayfa Görüntüleme Özeti ───────────

CREATE TABLE IF NOT EXISTS lynq_analytics.page_stats
(
    date              Date,
    website_id        String,
    url_path          String,
    pageviews         UInt64,
    visitors          UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (website_id, date, url_path);

CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.page_stats_mv
TO lynq_analytics.page_stats AS
SELECT
    toDate(timestamp) AS date, website_id, url_path,
    count() AS pageviews, uniqExact(client_id) AS visitors
FROM lynq_analytics.events WHERE event_type = 'page_view'
GROUP BY date, website_id, url_path;


-- ─── 4.3 Referrer / Traffic Source Özeti ────

CREATE TABLE IF NOT EXISTS lynq_analytics.referrer_stats
(
    date              Date,
    website_id        String,
    referrer_domain   String,
    utm_source        LowCardinality(String),
    utm_medium        LowCardinality(String),
    pageviews         UInt64,
    visitors          UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (website_id, date, referrer_domain);

CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.referrer_stats_mv
TO lynq_analytics.referrer_stats AS
SELECT
    toDate(timestamp) AS date, website_id, referrer_domain, utm_source, utm_medium,
    count() AS pageviews, uniqExact(client_id) AS visitors
FROM lynq_analytics.events WHERE event_type = 'page_view'
GROUP BY date, website_id, referrer_domain, utm_source, utm_medium;


-- ─── 4.4 Browser / Device Özeti ────────────

CREATE TABLE IF NOT EXISTS lynq_analytics.device_stats
(
    date              Date,
    website_id        String,
    browser           LowCardinality(String),
    os                LowCardinality(String),
    device_type       LowCardinality(String),
    visitors          UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (website_id, date, browser, os, device_type);

CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.device_stats_mv
TO lynq_analytics.device_stats AS
SELECT
    toDate(timestamp) AS date, website_id, browser, os, device_type,
    uniqExact(client_id) AS visitors
FROM lynq_analytics.events WHERE event_type = 'page_view'
GROUP BY date, website_id, browser, os, device_type;


-- ─── 4.5 Ülke Özeti ───────────────────────

CREATE TABLE IF NOT EXISTS lynq_analytics.country_stats
(
    date              Date,
    website_id        String,
    country           LowCardinality(String),
    visitors          UInt64,
    pageviews         UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (website_id, date, country);

CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.country_stats_mv
TO lynq_analytics.country_stats AS
SELECT
    toDate(timestamp) AS date, website_id, country,
    uniqExact(client_id) AS visitors, count() AS pageviews
FROM lynq_analytics.events WHERE event_type = 'page_view'
GROUP BY date, website_id, country;


-- ═══════════════════════════════════════════════
-- 5. MATERIALIZED VIEW'LAR — E-Commerce
-- ═══════════════════════════════════════════════

-- ─── 5.1 Günlük Gelir Özeti ────────────────

CREATE TABLE IF NOT EXISTS lynq_analytics.revenue_daily
(
    date              Date,
    website_id        String,
    currency          LowCardinality(String),
    transactions      UInt64,
    revenue           Float64,
    tax_total         Float64,
    shipping_total    Float64,
    items_sold        UInt64,
    buyers            UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (website_id, date, currency);

CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.revenue_daily_mv
TO lynq_analytics.revenue_daily AS
SELECT
    toDate(timestamp) AS date, website_id, currency,
    count() AS transactions,
    sum(value) AS revenue,
    sum(tax) AS tax_total,
    sum(shipping) AS shipping_total,
    sum(length(`items.item_id`)) AS items_sold,
    uniqExact(client_id) AS buyers
FROM lynq_analytics.events
WHERE event_type = 'purchase' AND value > 0
GROUP BY date, website_id, currency;


-- ─── 5.2 Ürün Performansı ──────────────────

CREATE TABLE IF NOT EXISTS lynq_analytics.product_stats
(
    date              Date,
    website_id        String,
    item_id           String,
    item_name         String,
    item_brand        String,
    item_category     String,
    views             UInt64,
    adds_to_cart      UInt64,
    purchases         UInt64,
    revenue           Float64,
    quantity_sold     UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (website_id, date, item_id);

-- Ürün bazlı view_item
CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.product_views_mv
TO lynq_analytics.product_stats AS
SELECT
    toDate(timestamp) AS date, website_id,
    item_id, item_name, item_brand, item_category,
    1 AS views, 0 AS adds_to_cart, 0 AS purchases, 0 AS revenue, 0 AS quantity_sold
FROM lynq_analytics.events
ARRAY JOIN
    `items.item_id`       AS item_id,
    `items.item_name`     AS item_name,
    `items.item_brand`    AS item_brand,
    `items.item_category` AS item_category
WHERE event_type = 'view_item' AND length(`items.item_id`) > 0;

-- Ürün bazlı add_to_cart
CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.product_cart_mv
TO lynq_analytics.product_stats AS
SELECT
    toDate(timestamp) AS date, website_id,
    item_id, item_name, item_brand, item_category,
    0 AS views, 1 AS adds_to_cart, 0 AS purchases, 0 AS revenue, 0 AS quantity_sold
FROM lynq_analytics.events
ARRAY JOIN
    `items.item_id`       AS item_id,
    `items.item_name`     AS item_name,
    `items.item_brand`    AS item_brand,
    `items.item_category` AS item_category
WHERE event_type = 'add_to_cart' AND length(`items.item_id`) > 0;

-- Ürün bazlı purchase
CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.product_purchase_mv
TO lynq_analytics.product_stats AS
SELECT
    toDate(timestamp) AS date, website_id,
    item_id, item_name, item_brand, item_category,
    0 AS views, 0 AS adds_to_cart, 1 AS purchases,
    item_price AS revenue, toUInt64(item_qty) AS quantity_sold
FROM lynq_analytics.events
ARRAY JOIN
    `items.item_id`       AS item_id,
    `items.item_name`     AS item_name,
    `items.item_brand`    AS item_brand,
    `items.item_category` AS item_category,
    `items.price`         AS item_price,
    `items.quantity`      AS item_qty
WHERE event_type = 'purchase' AND length(`items.item_id`) > 0;


-- ═══════════════════════════════════════════════
-- 6. MATERIALIZED VIEW'LAR — Custom Events
-- ═══════════════════════════════════════════════

-- ─── 6.1 Custom Event Özeti ────────────────

CREATE TABLE IF NOT EXISTS lynq_analytics.custom_event_stats
(
    date              Date,
    website_id        String,
    event_name        String,
    event_category    LowCardinality(String),
    event_count       UInt64,
    unique_users      UInt64,
    total_value       Float64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (website_id, date, event_name, event_category);

CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.custom_event_stats_mv
TO lynq_analytics.custom_event_stats AS
SELECT
    toDate(timestamp) AS date, website_id, event_name, event_category,
    count() AS event_count,
    uniqExact(client_id) AS unique_users,
    sum(event_value) AS total_value
FROM lynq_analytics.events
WHERE event_type = 'custom' AND event_name != ''
GROUP BY date, website_id, event_name, event_category;


-- ─── 6.2 E-Commerce Funnel Özeti ───────────

CREATE TABLE IF NOT EXISTS lynq_analytics.ecommerce_funnel
(
    date              Date,
    website_id        String,
    view_item_users   UInt64,
    add_to_cart_users UInt64,
    checkout_users    UInt64,
    purchase_users    UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (website_id, date);

CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.ecommerce_funnel_mv
TO lynq_analytics.ecommerce_funnel AS
SELECT
    toDate(timestamp) AS date, website_id,
    uniqExactIf(client_id, event_type = 'view_item') AS view_item_users,
    uniqExactIf(client_id, event_type = 'add_to_cart') AS add_to_cart_users,
    uniqExactIf(client_id, event_type IN ('begin_checkout', 'add_payment_info', 'add_shipping_info')) AS checkout_users,
    uniqExactIf(client_id, event_type = 'purchase') AS purchase_users
FROM lynq_analytics.events
WHERE event_type IN ('view_item', 'add_to_cart', 'begin_checkout', 'add_payment_info', 'add_shipping_info', 'purchase')
GROUP BY date, website_id;
