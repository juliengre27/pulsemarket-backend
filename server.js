const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());

const PORT = process.env.PORT || 3000;

// Diese Quelle ist komplett kostenlos und öffentlich — kein API-Key nötig.
// Forex Factory veröffentlicht ihren Wirtschaftskalender als wöchentliche JSON-Datei,
// die von vielen MT4/MT5 Trading-Tools genutzt wird.
const CALENDAR_SOURCE_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

// Cache, damit nicht bei jeder Anfrage neu von Forex Factory geladen wird
let cache = { data: null, lastFetch: 0 };
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 Minuten

app.get('/', (req, res) => {
  res.json({ status: 'PulseMarket Backend läuft', endpoints: ['/calendar/today', '/health'] });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', source: CALENDAR_SOURCE_URL });
});

function impactToLevel(impact) {
  if (impact === 'High') return 'High';
  if (impact === 'Medium') return 'Medium';
  return 'Low';
}

// Ordnet Länder-Kürzel grob den Assets zu, die PulseMarket trackt.
// USD-News betreffen alle drei Assets am stärksten.
function assetsForCountry(country) {
  if (country === 'USD') return ['gold', 'nas', 'btc'];
  if (country === 'EUR' || country === 'GBP') return ['gold'];
  return ['gold', 'btc'];
}

app.get('/calendar/today', async (req, res) => {
  try {
    const now = Date.now();

    if (cache.data && now - cache.lastFetch < CACHE_DURATION_MS) {
      return res.json({ source: 'cache', ...cache.data });
    }

    const response = await fetch(CALENDAR_SOURCE_URL);

    if (!response.ok) {
      throw new Error(`Forex Factory Feed antwortete mit Status ${response.status}`);
    }

    const raw = await response.json();

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const todaysEvents = raw.filter(item => {
      return item.date && item.date.startsWith(todayStr);
    });

    const processed = todaysEvents.map((item, idx) => {
      const time = new Date(item.date);
      return {
        id: `${item.title}-${item.date}-${idx}`.replace(/\s+/g, '-'),
        time: time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Math.floor(time.getTime() / 1000),
        title: item.title,
        country: item.country,
        impact: impactToLevel(item.impact),
        actual: item.actual || null,
        forecast: item.forecast || null,
        previous: item.previous || null,
        assets: assetsForCountry(item.country),
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
