#!/bin/bash
# ClickHouse Cloud'a tabloları oluştur
CH_URL="https://n9c037oj6g.eu-central-1.aws.clickhouse.cloud:8443"
CH_USER="default:3qq_3q.0f4uJC"

run_query() {
  echo "→ $1"
  curl -s --user "$CH_USER" --data-binary "$2" "$CH_URL"
  echo ""
}

run_query "Database" "CREATE DATABASE IF NOT EXISTS lynq_analytics"

run_query "events table" "
CREATE TABLE IF NOT EXISTS lynq_analytics.events
(
    timestamp DateTime('UTC') DEFAULT now(),
    event_type LowCardinality(String),
    event_name String DEFAULT '',
    website_id String,
    client_id String DEFAULT '',
    session_id String DEFAULT '',
    url_path String DEFAULT '',
    url_query String DEFAULT '',
    page_title String DEFAULT '',
    referrer String DEFAULT '',
    referrer_domain String DEFAULT '',
    utm_source LowCardinality(String) DEFAULT '',
    utm_medium LowCardinality(String) DEFAULT '',
    utm_campaign String DEFAULT '',
    utm_term String DEFAULT '',
    utm_content String DEFAULT '',
    country LowCardinality(String) DEFAULT '',
    city String DEFAULT '',
    browser LowCardinality(String) DEFAULT '',
    browser_version String DEFAULT '',
    os LowCardinality(String) DEFAULT '',
    device_type LowCardinality(String) DEFAULT '',
    screen String DEFAULT '',
    language LowCardinality(String) DEFAULT '',
    transaction_id String DEFAULT '',
    affiliation String DEFAULT '',
    currency LowCardinality(String) DEFAULT '',
    value Float64 DEFAULT 0,
    tax Float64 DEFAULT 0,
    shipping Float64 DEFAULT 0,
    coupon String DEFAULT '',
    payment_type LowCardinality(String) DEFAULT '',
    shipping_tier String DEFAULT '',
    item_list_id String DEFAULT '',
    item_list_name String DEFAULT '',
    creative_name String DEFAULT '',
    creative_slot String DEFAULT '',
    promotion_id String DEFAULT '',
    promotion_name String DEFAULT '',
    \`items.item_id\` Array(String),
    \`items.item_name\` Array(String),
    \`items.affiliation\` Array(String),
    \`items.coupon\` Array(String),
    \`items.discount\` Array(Float64),
    \`items.index\` Array(UInt32),
    \`items.item_brand\` Array(String),
    \`items.item_category\` Array(String),
    \`items.item_category2\` Array(String),
    \`items.item_category3\` Array(String),
    \`items.item_category4\` Array(String),
    \`items.item_category5\` Array(String),
    \`items.item_list_id\` Array(String),
    \`items.item_list_name\` Array(String),
    \`items.item_variant\` Array(String),
    \`items.location_id\` Array(String),
    \`items.price\` Array(Float64),
    \`items.quantity\` Array(UInt32),
    event_category LowCardinality(String) DEFAULT '',
    event_label String DEFAULT '',
    event_value Float64 DEFAULT 0,
    properties Map(String, String) DEFAULT map(),
    click_element String DEFAULT '',
    click_text String DEFAULT '',
    click_url String DEFAULT '',
    click_classes String DEFAULT '',
    click_id String DEFAULT '',
    scroll_depth UInt8 DEFAULT 0,
    form_id String DEFAULT '',
    form_name String DEFAULT '',
    form_destination String DEFAULT '',
    video_provider LowCardinality(String) DEFAULT '',
    video_title String DEFAULT '',
    video_url String DEFAULT '',
    video_duration Float64 DEFAULT 0,
    video_percent UInt8 DEFAULT 0,
    file_name String DEFAULT '',
    file_extension LowCardinality(String) DEFAULT '',
    search_term String DEFAULT '',
    lcp_value Float64 DEFAULT 0,
    fid_value Float64 DEFAULT 0,
    cls_value Float64 DEFAULT 0,
    inp_value Float64 DEFAULT 0
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (website_id, timestamp)
TTL timestamp + INTERVAL 2 YEAR
SETTINGS index_granularity = 8192"

run_query "raw_events" "
CREATE TABLE IF NOT EXISTS lynq_analytics.raw_events
(
    timestamp DateTime('UTC') DEFAULT now(),
    website_id String,
    payload String,
    ip_hash String DEFAULT '',
    user_agent String DEFAULT ''
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (website_id, timestamp)
TTL timestamp + INTERVAL 6 MONTH
SETTINGS index_granularity = 8192"

run_query "bad_events" "
CREATE TABLE IF NOT EXISTS lynq_analytics.bad_events
(
    timestamp DateTime('UTC') DEFAULT now(),
    website_id String DEFAULT '',
    payload String,
    reason String,
    ip_hash String DEFAULT '',
    user_agent String DEFAULT ''
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp)
TTL timestamp + INTERVAL 3 MONTH
SETTINGS index_granularity = 8192"

run_query "daily_stats" "
CREATE TABLE IF NOT EXISTS lynq_analytics.daily_stats
(date Date, website_id String, pageviews UInt64, visitors UInt64, sessions UInt64, bounces UInt64)
ENGINE = SummingMergeTree() PARTITION BY toYYYYMM(date) ORDER BY (website_id, date)"

run_query "daily_stats_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.daily_stats_mv TO lynq_analytics.daily_stats AS
SELECT toDate(timestamp) AS date, website_id, countIf(event_type='page_view') AS pageviews, uniqExact(client_id) AS visitors, uniqExact(session_id) AS sessions, 0 AS bounces
FROM lynq_analytics.events GROUP BY date, website_id"

run_query "page_stats" "
CREATE TABLE IF NOT EXISTS lynq_analytics.page_stats
(date Date, website_id String, url_path String, pageviews UInt64, visitors UInt64)
ENGINE = SummingMergeTree() PARTITION BY toYYYYMM(date) ORDER BY (website_id, date, url_path)"

run_query "page_stats_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.page_stats_mv TO lynq_analytics.page_stats AS
SELECT toDate(timestamp) AS date, website_id, url_path, count() AS pageviews, uniqExact(client_id) AS visitors
FROM lynq_analytics.events WHERE event_type='page_view' GROUP BY date, website_id, url_path"

run_query "referrer_stats" "
CREATE TABLE IF NOT EXISTS lynq_analytics.referrer_stats
(date Date, website_id String, referrer_domain String, utm_source LowCardinality(String), utm_medium LowCardinality(String), pageviews UInt64, visitors UInt64)
ENGINE = SummingMergeTree() PARTITION BY toYYYYMM(date) ORDER BY (website_id, date, referrer_domain)"

run_query "referrer_stats_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.referrer_stats_mv TO lynq_analytics.referrer_stats AS
SELECT toDate(timestamp) AS date, website_id, referrer_domain, utm_source, utm_medium, count() AS pageviews, uniqExact(client_id) AS visitors
FROM lynq_analytics.events WHERE event_type='page_view' GROUP BY date, website_id, referrer_domain, utm_source, utm_medium"

run_query "device_stats" "
CREATE TABLE IF NOT EXISTS lynq_analytics.device_stats
(date Date, website_id String, browser LowCardinality(String), os LowCardinality(String), device_type LowCardinality(String), visitors UInt64)
ENGINE = SummingMergeTree() PARTITION BY toYYYYMM(date) ORDER BY (website_id, date, browser, os, device_type)"

run_query "device_stats_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.device_stats_mv TO lynq_analytics.device_stats AS
SELECT toDate(timestamp) AS date, website_id, browser, os, device_type, uniqExact(client_id) AS visitors
FROM lynq_analytics.events WHERE event_type='page_view' GROUP BY date, website_id, browser, os, device_type"

run_query "country_stats" "
CREATE TABLE IF NOT EXISTS lynq_analytics.country_stats
(date Date, website_id String, country LowCardinality(String), visitors UInt64, pageviews UInt64)
ENGINE = SummingMergeTree() PARTITION BY toYYYYMM(date) ORDER BY (website_id, date, country)"

run_query "country_stats_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.country_stats_mv TO lynq_analytics.country_stats AS
SELECT toDate(timestamp) AS date, website_id, country, uniqExact(client_id) AS visitors, count() AS pageviews
FROM lynq_analytics.events WHERE event_type='page_view' GROUP BY date, website_id, country"

run_query "revenue_daily" "
CREATE TABLE IF NOT EXISTS lynq_analytics.revenue_daily
(date Date, website_id String, currency LowCardinality(String), transactions UInt64, revenue Float64, tax_total Float64, shipping_total Float64, items_sold UInt64, buyers UInt64)
ENGINE = SummingMergeTree() PARTITION BY toYYYYMM(date) ORDER BY (website_id, date, currency)"

run_query "revenue_daily_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.revenue_daily_mv TO lynq_analytics.revenue_daily AS
SELECT toDate(timestamp) AS date, website_id, currency, count() AS transactions, sum(value) AS revenue, sum(tax) AS tax_total, sum(shipping) AS shipping_total, sum(length(\`items.item_id\`)) AS items_sold, uniqExact(client_id) AS buyers
FROM lynq_analytics.events WHERE event_type='purchase' AND value>0 GROUP BY date, website_id, currency"

run_query "custom_event_stats" "
CREATE TABLE IF NOT EXISTS lynq_analytics.custom_event_stats
(date Date, website_id String, event_name String, event_category LowCardinality(String), event_count UInt64, unique_users UInt64, total_value Float64)
ENGINE = SummingMergeTree() PARTITION BY toYYYYMM(date) ORDER BY (website_id, date, event_name, event_category)"

run_query "custom_event_stats_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.custom_event_stats_mv TO lynq_analytics.custom_event_stats AS
SELECT toDate(timestamp) AS date, website_id, event_name, event_category, count() AS event_count, uniqExact(client_id) AS unique_users, sum(event_value) AS total_value
FROM lynq_analytics.events WHERE event_type='custom' AND event_name!='' GROUP BY date, website_id, event_name, event_category"

run_query "ecommerce_funnel" "
CREATE TABLE IF NOT EXISTS lynq_analytics.ecommerce_funnel
(date Date, website_id String, view_item_users UInt64, add_to_cart_users UInt64, checkout_users UInt64, purchase_users UInt64)
ENGINE = SummingMergeTree() PARTITION BY toYYYYMM(date) ORDER BY (website_id, date)"

run_query "ecommerce_funnel_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS lynq_analytics.ecommerce_funnel_mv TO lynq_analytics.ecommerce_funnel AS
SELECT toDate(timestamp) AS date, website_id,
uniqExactIf(client_id, event_type='view_item') AS view_item_users,
uniqExactIf(client_id, event_type='add_to_cart') AS add_to_cart_users,
uniqExactIf(client_id, event_type IN ('begin_checkout','add_payment_info','add_shipping_info')) AS checkout_users,
uniqExactIf(client_id, event_type='purchase') AS purchase_users
FROM lynq_analytics.events WHERE event_type IN ('view_item','add_to_cart','begin_checkout','add_payment_info','add_shipping_info','purchase') GROUP BY date, website_id"

echo ""
echo "✓ Tüm tablolar oluşturuldu!"
echo ""
curl -s --user "$CH_USER" --data-binary "SHOW TABLES FROM lynq_analytics" "$CH_URL"
