const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const PORT = process.env.PORT || 3000;

if (!FINNHUB_KEY) {
  console.error('FEHLER: FINNHUB_API_KEY ist nicht gesetzt. Bitte als Environment Variable hinzufügen.');
}

// Cache to avoid hitting Finnhub rate limits
let cache = { data: null, lastFetch: 0 };
const CACHE_DURATION_MS = 60 * 1000; // 60 seconds

app.get('/', (req, res) => {
  res.json({ status: 'PulseMarket Backend läuft', endpoints: ['/calendar/today', '/health'] });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', hasApiKey: !!FINNHUB_KEY });
});

app.get('/calendar/today', async (req, res) => {
  try {
    const now = Date.now();

    if (cache.data && now - cache.lastFetch < CACHE_DURATION_MS) {
      return res.json({ source: 'cache', ...cache.data });
    }

    const today = new Date().toISOString().split('T')[0];
    const url = `https://finnhub.io/api/v1/calendar/economic?from=${today}&to=${today}&token=${FINNHUB_KEY}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Finnhub responded with status ${response.status}`);
    }

    const raw = await response.json();

    const processed = (raw.economicCalendar || []).map(item => {
      const time = new Date(item.time);
      return {
        id: `${item.event}-${item.time}`.replace(/\s+/g, '-'),
        time: time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Math.floor(time.getTime() / 1000),
        title: item.event,
        country: item.country,
        impact: item.impact === 3 ? 'High' : item.impact === 2 ? 'Medium' : 'Low',
        actual: item.actual,
        forecast: item.estimate,
        previous: item.prev,
        unit: item.unit || '',
      };
    });

    cache = { data: { events: processed, count: processed.length }, lastFetch: now };

    res.json({ source: 'live', events: processed, count: processed.length });
  } catch (err) {
    console.error('Fehler beim Abrufen des Kalenders:', err.message);
    res.status(500).json({ error: 'Konnte Kalenderdaten nicht laden', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`PulseMarket Backend läuft auf Port ${PORT}`);
});
