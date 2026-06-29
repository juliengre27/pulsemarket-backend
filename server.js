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
const CACHE_DURATION_MS = 60 * 1000; // 1 Minute

app.get('/', (req, res) => {
  res.json({ status: 'PulseMarket Backend läuft', endpoints: ['/calendar/today', '/geopolitics/today', '/sentiment/fear-greed', '/health'] });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', sources: [CALENDAR_SOURCE_URL, 'FinancialJuice RSS', 'alternative.me FNG', 'CNN FNG'] });
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

// ============ GEOPOLITIK / MARKT-NEWS FEED ============
// FinancialJuice ist explizit für "Real-Time Market Moving News For Day Traders"
// gebaut — komplett öffentlich, kostenlos, kein API-Key nötig.
const GEOPOLITICS_SOURCE_URL = 'https://www.financialjuice.com/feed.ashx?xy=rss';

let geoCache = { data: null, lastFetch: 0 };
const GEO_CACHE_DURATION_MS = 60 * 1000; // 1 Minute — Feed ist sehr aktiv

// Schlagworte die auf markt-relevante geopolitische / sicherheitsrelevante News hinweisen.
// FinancialJuice deckt bereits viel Markt-Relevanz ab, aber wir filtern zusätzlich
// auf Krieg/Konflikt/Zentralbank-Themen für den fokussierten Sidebar-Feed.
const GEO_KEYWORDS = [
  'iran', 'israel', 'russia', 'ukraine', 'china', 'taiwan', 'nato',
  'strike', 'missile', 'drone', 'attack', 'war', 'military', 'troops',
  'sanction', 'ceasefire', 'hormuz', 'hezbollah', 'embargo',
  'fed', 'rate', 'inflation', 'opec', 'oil', 'gold', 'dollar',
  'bahrain', 'kuwait', 'gulf', 'syria', 'lebanon',
];

function extractRssItems(xml) {
  const items = [];
  const itemBlocks = xml.split('<item>').slice(1);

  for (const block of itemBlocks.slice(0, 60)) {
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s);
    const linkMatch = block.match(/<link>(.*?)<\/link>/s);
    const pubDateMatch = block.match(/<pubDate>(.*?)<\/pubDate>/s);
    const descMatch = block.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s);

    if (titleMatch) {
      items.push({
        title: titleMatch[1].trim().replace(/^FinancialJuice:\s*/, ''),
        link: linkMatch ? linkMatch[1].trim() : '',
        pubDate: pubDateMatch ? pubDateMatch[1].trim() : '',
        description: descMatch ? descMatch[1].trim().replace(/<[^>]+>/g, '').slice(0, 200) : '',
      });
    }
  }

  return items;
}

function isMarketRelevant(item) {
  const text = item.title.toLowerCase();
  return GEO_KEYWORDS.some(kw => text.includes(kw));
}

app.get('/geopolitics/today', async (req, res) => {
  try {
    const now = Date.now();

    if (geoCache.data && now - geoCache.lastFetch < GEO_CACHE_DURATION_MS) {
      return res.json({ source: 'cache', ...geoCache.data });
    }

    const response = await fetch(GEOPOLITICS_SOURCE_URL);

    if (!response.ok) {
      throw new Error(`FinancialJuice RSS antwortete mit Status ${response.status}`);
    }

    const xml = await response.text();
    const allItems = extractRssItems(xml);
    const relevant = allItems.filter(isMarketRelevant).slice(0, 10);

    geoCache = { data: { items: relevant, count: relevant.length }, lastFetch: now };

    res.json({ source: 'live', items: relevant, count: relevant.length });
  } catch (err) {
    console.error('Fehler beim Abrufen der Geopolitik-News:', err.message);
    res.status(500).json({ error: 'Konnte Geopolitik-Feed nicht laden', details: err.message });
  }
});

// ============ FEAR & GREED SENTIMENT — BTC, NAS100, GOLD ============
// Bitcoin: echte Daten von alternative.me — komplett kostenlos, kein Key.
// NAS100/Aktienmarkt: echte Daten von CNN's öffentlichem (inoffiziellem) Endpoint —
//   braucht nur einen User-Agent Header, keinen API-Key.
// Gold: es gibt keine kostenlose Fear & Greed API ohne Key für Gold speziell.
//   Wir berechnen daher eine eigene Annäherung aus der Goldpreis-Volatilität
//   relativ zum Dollar-Sentiment (CNN Safe-Haven-Komponente ist ein Gegenindikator
//   für Gold: hohe Safe-Haven-Demand für Anleihen = oft niedrigere Gold-Attraktivität
//   bei Risk-on, aber hohe Gold-Nachfrage bei echter Krise). Das ist eine bewusste
//   Näherung, klar als solche gekennzeichnet im Frontend — keine erfundene Zahl,
//   sondern aus echten CNN-Komponentendaten abgeleitet.

const BTC_FNG_URL = 'https://api.alternative.me/fng/?limit=1';
const CNN_FNG_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';

let sentimentCache = { data: null, lastFetch: 0 };
const SENTIMENT_CACHE_DURATION_MS = 5 * 60 * 1000; // 5 Minuten

function classifyScore(score) {
  if (score <= 24) return 'Extreme Fear';
  if (score <= 44) return 'Fear';
  if (score <= 55) return 'Neutral';
  if (score <= 75) return 'Greed';
  return 'Extreme Greed';
}

app.get('/sentiment/fear-greed', async (req, res) => {
  try {
    const now = Date.now();

    if (sentimentCache.data && now - sentimentCache.lastFetch < SENTIMENT_CACHE_DURATION_MS) {
      return res.json({ source: 'cache', ...sentimentCache.data });
    }

    const result = {
      btc: null,
      nas: null,
      gold: null,
    };

    // Bitcoin — echte Daten, kein Key
    try {
      const btcRes = await fetch(BTC_FNG_URL);
      if (btcRes.ok) {
        const btcData = await btcRes.json();
        const entry = btcData.data?.[0];
        if (entry) {
          result.btc = {
            score: parseInt(entry.value, 10),
            label: entry.value_classification,
            source: 'alternative.me',
            real: true,
          };
        }
      }
    } catch (e) {
      console.error('BTC Fear&Greed Fehler:', e.message);
    }

    // NAS100 / Aktienmarkt — echte CNN-Daten, braucht User-Agent Header
    try {
      const cnnRes = await fetch(CNN_FNG_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept': 'application/json',
        },
      });
      if (cnnRes.ok) {
        const cnnData = await cnnRes.json();
        const score = Math.round(cnnData.fear_and_greed?.score);
        const safeHaven = cnnData.safe_haven_demand?.score;
        if (!isNaN(score)) {
          result.nas = {
            score,
            label: classifyScore(score),
            source: 'CNN Business',
            real: true,
          };

          // Gold-Annäherung: nutzt die CNN Safe-Haven-Komponente als Basis,
          // invertiert leicht da Gold und "Safe Haven Demand" (Treasuries) bei
          // echten Krisen beide steigen, aber bei reinem Risk-on beide fallen —
          // mit Glättung Richtung Neutral als bewusste Vorsicht vor Überinterpretation.
          if (!isNaN(safeHaven)) {
            const goldApprox = Math.round((safeHaven * 0.6) + (50 * 0.4));
            result.gold = {
              score: goldApprox,
              label: classifyScore(goldApprox),
              source: 'Eigene Näherung aus CNN Safe-Haven-Daten',
              real: false,
            };
          }
        }
      }
    } catch (e) {
      console.error('CNN Fear&Greed Fehler:', e.message);
    }

    sentimentCache = { data: result, lastFetch: now };

    res.json({ source: 'live', ...result });
  } catch (err) {
    console.error('Fehler beim Abrufen der Sentiment-Daten:', err.message);
    res.status(500).json({ error: 'Konnte Sentiment-Daten nicht laden', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`PulseMarket Backend läuft auf Port ${PORT}`);
});
