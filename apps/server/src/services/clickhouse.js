/**
 * ClickHouse Client — Analytics DB bağlantısı
 */

const { createClient } = require('@clickhouse/client');

function createClickHouseClient() {
  const host = process.env.CLICKHOUSE_HOST || 'http://localhost:8123';

  const config = {
    url: host,
    database: process.env.CLICKHOUSE_DB || 'lynq_analytics',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || ''
  };

  // ClickHouse Cloud HTTPS bağlantısı için TLS ayarları
  if (host.startsWith('https://')) {
    config.tls = { rejectUnauthorized: true };
  }

  console.log('ClickHouse config:', { url: host, database: config.database, username: config.username, hasPassword: !!config.password, tls: !!config.tls });
  const client = createClient(config);
  return client;
}

async function ensureClickHouseTables(client) {
  try {
    const result = await client.query({ query: 'SHOW TABLES' });
    const json = await result.json();
    const tableNames = json.data.map(row => row.name);

    if (tableNames.includes('events')) {
      console.log('✓ ClickHouse OK — ' + tableNames.length + ' tables found');
    } else {
      console.warn('⚠ ClickHouse events table not found');
    }
  } catch (err) {
    console.error('✗ ClickHouse connection failed:', err.message);
  }
}

async function insertEvents(client, events) {
  if (!events.length) return;
  await client.insert({ table: 'events', values: events, format: 'JSONEachRow' });
}

async function insertRawEvents(client, events) {
  if (!events.length) return;
  await client.insert({ table: 'raw_events', values: events, format: 'JSONEachRow' });
}

async function insertBadEvents(client, events) {
  if (!events.length) return;
  await client.insert({ table: 'bad_events', values: events, format: 'JSONEachRow' });
}

module.exports = {
  createClickHouseClient,
  ensureClickHouseTables,
  insertEvents,
  insertRawEvents,
  insertBadEvents
};
