/**
 * Event Buffer — In-memory batch insert mekanizması
 * ──────────────────────────────────────────────────
 * ClickHouse küçük insert'lerde verimsizdir. Buffer'da biriktir, toplu yaz.
 * Doküman: Bölüm 3.3, 6.1
 */

const { insertEvents, insertRawEvents, insertBadEvents } = require('./clickhouse');

function createBuffer(clickhouseClient) {
  const FLUSH_INTERVAL = parseInt(process.env.BUFFER_FLUSH_INTERVAL_MS || '5000', 10);
  const MAX_SIZE = parseInt(process.env.BUFFER_MAX_SIZE || '1000', 10);

  let eventBuffer = [];
  let rawEventBuffer = [];
  let badEventBuffer = [];
  let flushing = false;

  // Periyodik flush
  const timer = setInterval(() => {
    flush().catch(err => console.error('[buffer] Periodic flush error:', err.message));
  }, FLUSH_INTERVAL);

  if (timer.unref) timer.unref();

  function addEvent(event) {
    eventBuffer.push(event);
    console.log('[buffer] Event added, buffer size:', eventBuffer.length);

    if (eventBuffer.length >= MAX_SIZE) {
      flush().catch(err => console.error('[buffer] Max size flush error:', err.message));
    }
  }

  function addRawEvent(rawEvent) {
    rawEventBuffer.push(rawEvent);
  }

  function addBadEvent(badEvent) {
    badEventBuffer.push(badEvent);
  }

  async function flush() {
    if (flushing) return;

    const eventsToFlush = eventBuffer.length;
    const rawToFlush = rawEventBuffer.length;
    const badToFlush = badEventBuffer.length;

    if (eventsToFlush === 0 && rawToFlush === 0 && badToFlush === 0) return;

    flushing = true;
    console.log(`[buffer] Flushing: ${eventsToFlush} events, ${rawToFlush} raw, ${badToFlush} bad`);

    try {
      const events = eventBuffer;
      const rawEvents = rawEventBuffer;
      const badEvents = badEventBuffer;

      eventBuffer = [];
      rawEventBuffer = [];
      badEventBuffer = [];

      const promises = [];

      if (events.length > 0) {
        promises.push(
          insertEvents(clickhouseClient, events)
            .then(() => console.log(`[buffer] ✓ Flushed ${events.length} events to ClickHouse`))
            .catch(err => {
              console.error(`[buffer] ✗ Failed to flush events:`, err.message);
              // Geri ekle
              eventBuffer.push(...events);
            })
        );
      }

      if (rawEvents.length > 0) {
        promises.push(
          insertRawEvents(clickhouseClient, rawEvents)
            .then(() => console.log(`[buffer] ✓ Flushed ${rawEvents.length} raw events`))
            .catch(err => console.error(`[buffer] ✗ Failed to flush raw events:`, err.message))
        );
      }

      if (badEvents.length > 0) {
        promises.push(
          insertBadEvents(clickhouseClient, badEvents)
            .then(() => console.log(`[buffer] ✓ Flushed ${badEvents.length} bad events`))
            .catch(err => console.error(`[buffer] ✗ Failed to flush bad events:`, err.message))
        );
      }

      await Promise.allSettled(promises);
    } finally {
      flushing = false;
    }
  }

  function getStats() {
    return {
      eventCount: eventBuffer.length,
      rawEventCount: rawEventBuffer.length,
      badEventCount: badEventBuffer.length
    };
  }

  return { addEvent, addRawEvent, addBadEvent, flush, getStats };
}

module.exports = { createBuffer };
