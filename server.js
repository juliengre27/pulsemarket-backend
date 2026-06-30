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
  res.json({ status: 'PulseMarket Backend läuft', endpoints: ['/calendar/today', '/geopolitics/today', '/trump/today', '/sentiment/fear-greed', '/gold/candles/:timeframe', '/gold/observation', '/gold/fundamentals', '/health'] });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', sources: [CALENDAR_SOURCE_URL, 'FinancialJuice RSS', 'alternative.me FNG', 'CNN FNG', 'Yahoo Finance GC=F'] });
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
// Drei kombinierte, komplett kostenlose Quellen ohne API-Key:
// 1. FinancialJuice — "Real-Time Market Moving News For Day Traders"
// 2. trumpstruth.org — echtes, kostenloses RSS-Archiv von Trumps
//    Original-Posts auf Truth Social (nicht nur Medienberichte über ihn)
const GEOPOLITICS_SOURCE_URL = 'https://www.financialjuice.com/feed.ashx?xy=rss';
const TRUMP_TRUTH_SOCIAL_URL = 'https://www.trumpstruth.org/feed';

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

// Nur Trump-News mit echter Markt-/Wirtschafts-/Geopolitik-Relevanz durchlassen —
// nicht jede beliebige Trump-Schlagzeile (z.B. reiner Innenpolitik-Klatsch).
const TRUMP_RELEVANT_KEYWORDS = [
  'tariff', 'trade', 'china', 'fed', 'rate', 'powell', 'economy', 'market',
  'iran', 'israel', 'russia', 'ukraine', 'war', 'military', 'sanction',
  'oil', 'gold', 'dollar', 'inflation', 'tax', 'deal',
];

function extractRssItems(xml) {
  const items = [];
  const itemBlocks = xml.split('<item>').slice(1);

  for (const block of itemBlocks.slice(0, 60)) {
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s);
    const linkMatch = block.match(/<link>(.*?)<\/link>/s);
    const pubDateMatch = block.match(/<pubDate>(.*?)<\/pubDate>/s);
    const descMatch = block.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s);
    const sourceMatch = block.match(/<source[^>]*>(.*?)<\/source>/s);

    if (titleMatch) {
      items.push({
        title: titleMatch[1].trim().replace(/^FinancialJuice:\s*/, ''),
        link: linkMatch ? linkMatch[1].trim() : '',
        pubDate: pubDateMatch ? pubDateMatch[1].trim() : '',
        description: descMatch ? descMatch[1].trim().replace(/<[^>]+>/g, '').slice(0, 200) : '',
        sourceName: sourceMatch ? sourceMatch[1].trim() : null,
      });
    }
  }

  return items;
}

function isMarketRelevant(item) {
  const text = item.title.toLowerCase();
  return GEO_KEYWORDS.some(kw => text.includes(kw));
}

// Ordnet jeder News-Meldung die Assets zu, die sie wahrscheinlich betrifft —
// basierend auf enthaltenen Schlagworten. Gold reagiert am breitesten
// (Geopolitik, Zinsen, Dollar betreffen praktisch immer Gold als Safe Haven).
function tagAssetsForNews(item) {
  const text = item.title.toLowerCase();
  const assets = new Set();

  const goldKeywords = ['gold', 'fed', 'rate', 'inflation', 'dollar', 'iran', 'israel', 'russia', 'ukraine', 'war', 'military', 'strike', 'missile', 'oil', 'opec', 'sanction', 'hormuz', 'gulf', 'safe haven', 'treasury', 'tariff', 'trump'];
  const nasKeywords = ['fed', 'rate', 'inflation', 'nasdaq', 'tech', 'stocks', 'earnings', 'nvidia', 'apple', 'microsoft', 'gdp', 'tariff', 'trump'];
  const btcKeywords = ['bitcoin', 'crypto', 'btc', 'eth', 'blockchain', 'fed', 'rate', 'dollar'];

  if (goldKeywords.some(kw => text.includes(kw))) assets.add('gold');
  if (nasKeywords.some(kw => text.includes(kw))) assets.add('nas');
  if (btcKeywords.some(kw => text.includes(kw))) assets.add('btc');

  // Fallback: wenn gar nichts zugeordnet werden konnte, gilt es für alle drei
  if (assets.size === 0) {
    assets.add('gold'); assets.add('nas'); assets.add('btc');
  }

  return Array.from(assets);
}

async function fetchFinancialJuiceItems() {
  const response = await fetch(GEOPOLITICS_SOURCE_URL);
  if (!response.ok) throw new Error(`FinancialJuice RSS antwortete mit Status ${response.status}`);
  const xml = await response.text();
  return extractRssItems(xml)
    .filter(isMarketRelevant)
    .map(item => ({ ...item, tag: 'Markt-relevant' }));
}

async function fetchTrumpItems() {
  const response = await fetch(TRUMP_TRUTH_SOCIAL_URL);
  if (!response.ok) throw new Error(`Truth Social RSS antwortete mit Status ${response.status}`);
  const xml = await response.text();
  const items = extractRssItems(xml);

  // Truth-Social-Post-Titel sind oft nur kurze Auszüge des eigentlichen Inhalts.
  // Wir prüfen Titel UND Description auf Markt-Relevanz, statt nur den Titel,
  // damit echte Markt-relevante Posts nicht durchs Raster fallen.
  const relevant = items.filter(item => {
    const text = (item.title + ' ' + item.description).toLowerCase();
    return TRUMP_RELEVANT_KEYWORDS.some(kw => text.includes(kw));
  });

  return relevant.slice(0, 8).map(item => ({ ...item, tag: 'Trump' }));
}

app.get('/geopolitics/today', async (req, res) => {
  try {
    const now = Date.now();

    if (geoCache.data && now - geoCache.lastFetch < GEO_CACHE_DURATION_MS) {
      return res.json({ source: 'cache', ...geoCache.data });
    }

    // Beide Quellen unabhängig abrufen — wenn eine fehlschlägt, soll die
    // andere trotzdem durchkommen, statt dass der ganze Feed ausfällt.
    const [fjResult, trumpResult] = await Promise.allSettled([
      fetchFinancialJuiceItems(),
      fetchTrumpItems(),
    ]);

    const fjItems = fjResult.status === 'fulfilled' ? fjResult.value : [];
    const trumpItems = trumpResult.status === 'fulfilled' ? trumpResult.value : [];

    if (fjResult.status === 'rejected') console.error('FinancialJuice Fehler:', fjResult.reason?.message);
    if (trumpResult.status === 'rejected') console.error('Trump-News Fehler:', trumpResult.reason?.message);

    // Beide Quellen mischen, nach Datum sortieren, auf Top 14 begrenzen
    const combined = [...fjItems, ...trumpItems]
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, 14)
      .map(item => ({ ...item, assets: tagAssetsForNews(item) }));

    if (fjItems.length === 0 && trumpItems.length === 0) {
      throw new Error('Beide News-Quellen nicht erreichbar');
    }

    const payload = { items: combined, count: combined.length };
    geoCache = { data: payload, lastFetch: now };

    res.json({ source: 'live', ...payload });
  } catch (err) {
    console.error('Fehler beim Abrufen der Geopolitik-News:', err.message);
    res.status(500).json({ error: 'Konnte Geopolitik-Feed nicht laden', details: err.message });
  }
});

// Dediziertes Endpoint nur für Trumps Truth-Social-Posts — für die Hauptspalte,
// die ausschließlich seine Original-Posts zeigen soll.
let trumpOnlyCache = { data: null, lastFetch: 0 };
const TRUMP_CACHE_DURATION_MS = 60 * 1000;

app.get('/trump/today', async (req, res) => {
  try {
    const now = Date.now();

    if (trumpOnlyCache.data && now - trumpOnlyCache.lastFetch < TRUMP_CACHE_DURATION_MS) {
      return res.json({ source: 'cache', ...trumpOnlyCache.data });
    }

    const items = await fetchTrumpItems();
    const tagged = items.map(item => ({ ...item, assets: tagAssetsForNews(item) }));

    const payload = { items: tagged, count: tagged.length };
    trumpOnlyCache = { data: payload, lastFetch: now };

    res.json({ source: 'live', ...payload });
  } catch (err) {
    console.error('Fehler beim Abrufen der Trump-Posts:', err.message);
    res.status(500).json({ error: 'Konnte Trump-Feed nicht laden', details: err.message });
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

// ============ FUNDAMENTALE GOLD-TREIBER — DXY & US10Y ============
// Beide über Yahoo Finance, gleiche kostenlose Quelle wie der Gold-Chart.
// DXY = Dollar-Index (^DXY), US10Y = 10-Jahres-Treasury-Rendite (^TNX, in 0.1%-Einheiten)
const DXY_TICKER = '^DXY';
const US10Y_TICKER = '^TNX';

let fundamentalsCache = { data: null, lastFetch: 0 };
const FUNDAMENTALS_CACHE_DURATION_MS = 3 * 60 * 1000; // 3 Minuten

async function fetchYahooQuote(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`Yahoo Finance (${ticker}) antwortete mit Status ${res.status}`);
  const data = await res.json();
  const result = data.chart?.result?.[0];
  if (!result) throw new Error(`Keine Daten für ${ticker}`);

  const closes = (result.indicators?.quote?.[0]?.close || []).filter(v => v != null);
  if (closes.length < 2) throw new Error(`Zu wenig Datenpunkte für ${ticker}`);

  const current = closes[closes.length - 1];
  const previous = closes[closes.length - 2];
  const changePercent = ((current - previous) / previous) * 100;

  return { current, previous, changePercent };
}

app.get('/gold/fundamentals', async (req, res) => {
  try {
    const now = Date.now();

    if (fundamentalsCache.data && now - fundamentalsCache.lastFetch < FUNDAMENTALS_CACHE_DURATION_MS) {
      return res.json({ source: 'cache', ...fundamentalsCache.data });
    }

    const [dxyResult, us10yResult] = await Promise.allSettled([
      fetchYahooQuote(DXY_TICKER),
      fetchYahooQuote(US10Y_TICKER),
    ]);

    const dxy = dxyResult.status === 'fulfilled' ? dxyResult.value : null;
    const us10y = us10yResult.status === 'fulfilled' ? us10yResult.value : null;

    if (dxyResult.status === 'rejected') console.error('DXY Fehler:', dxyResult.reason?.message);
    if (us10yResult.status === 'rejected') console.error('US10Y Fehler:', us10yResult.reason?.message);

    // ── Fundamentale Interpretation für Gold ──
    // DXY und Gold sind historisch stark invers korreliert: starker Dollar
    // macht Gold für andere Währungen teurer -> Nachfrage sinkt.
    // Steigende Realrenditen (US10Y) erhöhen die Opportunitätskosten,
    // Gold zu halten (das keine Zinsen zahlt) -> typischerweise bearish für Gold.
    const factors = [];

    if (dxy) {
      const dxyBearishForGold = dxy.changePercent > 0.1;
      const dxyBullishForGold = dxy.changePercent < -0.1;
      factors.push({
        name: 'US-Dollar-Index (DXY)',
        value: dxy.current.toFixed(2),
        changePercent: dxy.changePercent,
        implication: dxyBearishForGold ? 'bearish' : dxyBullishForGold ? 'bullish' : 'neutral',
        explanation: dxyBearishForGold
          ? `Dollar wird stärker (+${dxy.changePercent.toFixed(2)}%) — historisch belastend für Gold, da es für Nicht-Dollar-Käufer teurer wird.`
          : dxyBullishForGold
          ? `Dollar schwächt sich ab (${dxy.changePercent.toFixed(2)}%) — historisch unterstützend für Gold.`
          : `Dollar nahezu unverändert (${dxy.changePercent.toFixed(2)}%) — kein klarer Impuls für Gold von dieser Seite.`,
      });
    }

    if (us10y) {
      const yieldBearishForGold = us10y.changePercent > 0.5;
      const yieldBullishForGold = us10y.changePercent < -0.5;
      factors.push({
        name: 'US 10-Jahres-Rendite',
        value: us10y.current.toFixed(2) + '%',
        changePercent: us10y.changePercent,
        implication: yieldBearishForGold ? 'bearish' : yieldBullishForGold ? 'bullish' : 'neutral',
        explanation: yieldBearishForGold
          ? `Renditen steigen (+${us10y.changePercent.toFixed(2)}%) — erhöht die Opportunitätskosten, zinsloses Gold zu halten. Historisch bearish.`
          : yieldBullishForGold
          ? `Renditen fallen (${us10y.changePercent.toFixed(2)}%) — senkt die Opportunitätskosten für Gold. Historisch bullisch.`
          : `Renditen nahezu unverändert (${us10y.changePercent.toFixed(2)}%) — kein klarer Impuls von dieser Seite.`,
      });
    }

    const bullishCount = factors.filter(f => f.implication === 'bullish').length;
    const bearishCount = factors.filter(f => f.implication === 'bearish').length;

    let fundamentalBias = 'Neutral';
    if (bullishCount > bearishCount) fundamentalBias = 'Bullisch';
    else if (bearishCount > bullishCount) fundamentalBias = 'Bearisch';

    const payload = {
      factors,
      fundamentalBias,
      disclaimer: 'Keine Anlageberatung. Diese fundamentale Einordnung beschreibt historisch beobachtete Korrelationen (Dollar-Stärke, Realrenditen) und dient ausschließlich Bildungs- und Informationszwecken.',
    };

    fundamentalsCache = { data: payload, lastFetch: now };

    res.json({ source: 'live', ...payload });
  } catch (err) {
    console.error('Fehler beim Abrufen der fundamentalen Daten:', err.message);
    res.status(500).json({ error: 'Konnte fundamentale Daten nicht laden', details: err.message });
  }
});

// ============ GOLD CHART DATA — H1/H4/D1 ============
// Yahoo Finance's v8 chart endpoint funktioniert ohne offiziellen API-Key —
// braucht nur einen Browser-User-Agent Header. Liefert echte OHLC-Kerzendaten.
// Ticker GC=F = Gold Futures (COMEX), sehr nah an XAUUSD Spot-Preis.

const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/GC=F';

let goldChartCache = {}; // pro Timeframe gecacht
const GOLD_CHART_CACHE_DURATION_MS = 2 * 60 * 1000; // 2 Minuten

const TIMEFRAME_CONFIG = {
  '1h': { interval: '60m', range: '1mo' },
  '4h': { interval: '60m', range: '3mo' }, // wird zu 4H aggregiert
  '1d': { interval: '1d', range: '1y' },
};

async function fetchYahooCandles(interval, range) {
  const url = `${YAHOO_CHART_URL}?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`Yahoo Finance antwortete mit Status ${res.status}`);
  const data = await res.json();

  const result = data.chart?.result?.[0];
  if (!result) throw new Error('Keine Chart-Daten in Yahoo-Antwort');

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};

  const candles = timestamps.map((t, i) => ({
    time: t,
    open: quote.open?.[i],
    high: quote.high?.[i],
    low: quote.low?.[i],
    close: quote.close?.[i],
    volume: quote.volume?.[i],
  })).filter(c => c.open != null && c.close != null);

  return candles;
}

// Aggregiert 1H-Kerzen zu 4H-Kerzen
function aggregateTo4H(hourlyCandles) {
  const grouped = {};
  hourlyCandles.forEach(c => {
    const bucketStart = Math.floor(c.time / (4 * 3600)) * (4 * 3600);
    if (!grouped[bucketStart]) grouped[bucketStart] = [];
    grouped[bucketStart].push(c);
  });

  return Object.keys(grouped).sort((a, b) => a - b).map(key => {
    const group = grouped[key];
    return {
      time: parseInt(key, 10),
      open: group[0].open,
      high: Math.max(...group.map(c => c.high)),
      low: Math.min(...group.map(c => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum, c) => sum + (c.volume || 0), 0),
    };
  });
}

// Berechnet eine vollständige EMA-Zeitreihe (für die Chart-Linie, nicht nur den letzten Wert)
function calcEMASeries(candles, period) {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  const series = [];
  let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
  series.push({ time: candles[period - 1].time, value: ema });
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    series.push({ time: candles[i].time, value: ema });
  }
  return series;
}

app.get('/gold/candles/:timeframe', async (req, res) => {
  try {
    const tf = req.params.timeframe;
    const config = TIMEFRAME_CONFIG[tf];

    if (!config) {
      return res.status(400).json({ error: 'Ungültiger Timeframe. Erlaubt: 1h, 4h, 1d' });
    }

    const now = Date.now();
    const cacheKey = tf;

    if (goldChartCache[cacheKey] && now - goldChartCache[cacheKey].lastFetch < GOLD_CHART_CACHE_DURATION_MS) {
      return res.json({ source: 'cache', ...goldChartCache[cacheKey].payload });
    }

    let candles = await fetchYahooCandles(config.interval, config.range);

    if (tf === '4h') {
      candles = aggregateTo4H(candles);
    }

    const ema20 = calcEMASeries(candles, 20);
    const ema50 = calcEMASeries(candles, 50);

    const payload = {
      candles,
      ema20,
      ema50,
      timeframe: tf,
      count: candles.length,
    };

    goldChartCache[cacheKey] = { payload, lastFetch: now };

    res.json({ source: 'live', ...payload });
  } catch (err) {
    console.error('Fehler beim Abrufen der Gold-Kerzendaten:', err.message);
    res.status(500).json({ error: 'Konnte Gold-Chartdaten nicht laden', details: err.message });
  }
});

// ============ GOLD SIGNAL ENGINE — SMC/ICT KONZEPTE ============
// Berechnet ein institutionelles Smart-Money-Setup basierend auf:
// - Marktstruktur H1/H4/D1 (höhere Hochs/Tiefs vs tiefere Hochs/Tiefs)
// - Liquiditätsbrüche / Break of Structure
// - Order Blocks (letzte gegenläufige Kerze vor starkem Move)
// - Fair Value Gaps (Imbalance-Zonen)
// - Liquidity Sweeps (Spring/Upthrust — Stop-Hunt vor Reversal)
// - Equal Highs/Lows (Liquiditätspools)
// - Premium/Discount (Position im aktuellen Range relativ zu 50%)
// - ATR für Volatilitätskontext
// - EMA20/EMA50 Momentum

function detectSwings(candles, lookback = 5) {
  const swings = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const slice = candles.slice(i - lookback, i + lookback + 1);
    const current = candles[i];
    const isSwingHigh = slice.every(c => c.high <= current.high);
    const isSwingLow = slice.every(c => c.low >= current.low);
    if (isSwingHigh) swings.push({ type: 'high', time: current.time, price: current.high, index: i });
    if (isSwingLow) swings.push({ type: 'low', time: current.time, price: current.low, index: i });
  }
  return swings;
}

function calcEMA(candles, period) {
  if (candles.length < period) return null;
  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
}

function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trueRanges = [];
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    trueRanges.push(tr);
  }
  const recent = trueRanges.slice(-period);
  return recent.reduce((sum, v) => sum + v, 0) / recent.length;
}

// Wyckoff Selling Climax / Buying Climax — extremes Volumen am Ende eines
// Trends, mit langem Docht in Gegenrichtung (Absorption durch Smart Money).
function detectWyckoffClimax(candles) {
  if (candles.length < 20) return null;

  const recentVols = candles.slice(-20).map(c => c.volume || 0);
  const avgVol = recentVols.reduce((s, v) => s + v, 0) / recentVols.length;
  const last = candles[candles.length - 1];

  if (!last.volume || avgVol === 0) return null;

  const volRatio = last.volume / avgVol;
  const bodySize = Math.abs(last.close - last.open);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  const range = last.high - last.low || 0.0001;

  // Selling Climax: extremes Volumen, langer unterer Docht, schließt im oberen Teil der Kerze
  if (volRatio > 2 && lowerWick / range > 0.4 && (last.close - last.low) / range > 0.5) {
    return { type: 'selling_climax', volRatio: Math.round(volRatio * 10) / 10 };
  }
  // Buying Climax: extremes Volumen, langer oberer Docht, schließt im unteren Teil der Kerze
  if (volRatio > 2 && upperWick / range > 0.4 && (last.high - last.close) / range > 0.5) {
    return { type: 'buying_climax', volRatio: Math.round(volRatio * 10) / 10 };
  }

  return null;
}

function analyzeTrend(candles) {
  const swings = detectSwings(candles);
  const highs = swings.filter(s => s.type === 'high').slice(-4);
  const lows = swings.filter(s => s.type === 'low').slice(-4);

  let structure = 'Range';
  if (highs.length >= 2 && lows.length >= 2) {
    const higherHighs = highs[highs.length - 1].price > highs[highs.length - 2].price;
    const higherLows = lows[lows.length - 1].price > lows[lows.length - 2].price;
    const lowerHighs = highs[highs.length - 1].price < highs[highs.length - 2].price;
    const lowerLows = lows[lows.length - 1].price < lows[lows.length - 2].price;

    if (higherHighs && higherLows) structure = 'Bullish';
    else if (lowerHighs && lowerLows) structure = 'Bearish';
  }

  const lastClose = candles[candles.length - 1]?.close;
  const lastSwingHigh = highs[highs.length - 1];
  const lastSwingLow = lows[lows.length - 1];

  let liquidityBreak = null;
  if (lastSwingHigh && lastClose > lastSwingHigh.price) {
    liquidityBreak = { type: 'bullish_bos', level: lastSwingHigh.price };
  } else if (lastSwingLow && lastClose < lastSwingLow.price) {
    liquidityBreak = { type: 'bearish_bos', level: lastSwingLow.price };
  }

  return {
    structure, highs, lows,
    lastSwingHigh: lastSwingHigh ? lastSwingHigh.price : null,
    lastSwingLow: lastSwingLow ? lastSwingLow.price : null,
    liquidityBreak,
    lastClose,
  };
}

// Order Block: letzte bärische Kerze vor einem starken bullischen Move (oder umgekehrt),
// die als institutionelle Einstiegszone fungiert.
function detectOrderBlocks(candles, atr) {
  const blocks = [];
  const minMoveSize = (atr || 1) * 1.5; // Move muss mind. 1.5x ATR sein um relevant zu sein

  for (let i = 2; i < candles.length - 1; i++) {
    const curr = candles[i];
    const next = candles[i + 1];
    const moveSize = Math.abs(next.close - curr.close);

    // Bullish OB: bärische Kerze, gefolgt von starkem bullischem Move
    if (curr.close < curr.open && next.close > next.open && moveSize > minMoveSize) {
      blocks.push({
        type: 'bullish',
        time: curr.time,
        high: curr.high,
        low: curr.low,
        index: i,
      });
    }
    // Bearish OB: bullische Kerze, gefolgt von starkem bärischem Move
    if (curr.close > curr.open && next.close < next.open && moveSize > minMoveSize) {
      blocks.push({
        type: 'bearish',
        time: curr.time,
        high: curr.high,
        low: curr.low,
        index: i,
      });
    }
  }

  // Nur die letzten 3 pro Richtung behalten, und nur unverletzte (Preis noch nicht durchgelaufen)
  const lastClose = candles[candles.length - 1]?.close;
  const valid = blocks.filter(b => {
    if (b.type === 'bullish') return lastClose > b.low; // noch nicht unterhalb gebrochen
    return lastClose < b.high; // noch nicht oberhalb gebrochen
  });

  const bullishOBs = valid.filter(b => b.type === 'bullish').slice(-2);
  const bearishOBs = valid.filter(b => b.type === 'bearish').slice(-2);

  return { bullish: bullishOBs, bearish: bearishOBs };
}

// Fair Value Gap: Lücke zwischen High von Kerze[i-1] und Low von Kerze[i+1]
// bei starker Impulskerze dazwischen.
function detectFVGs(candles) {
  const fvgs = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const next = candles[i + 1];

    // Bullish FVG: Low der nächsten Kerze über High der vorherigen
    if (next.low > prev.high) {
      fvgs.push({ type: 'bullish', top: next.low, bottom: prev.high, time: candles[i].time, index: i });
    }
    // Bearish FVG: High der nächsten Kerze unter Low der vorherigen
    if (next.high < prev.low) {
      fvgs.push({ type: 'bearish', top: prev.low, bottom: next.high, time: candles[i].time, index: i });
    }
  }

  // Nur unausgefüllte FVGs behalten (Preis noch nicht komplett durchgelaufen)
  const lastClose = candles[candles.length - 1]?.close;
  const unfilled = fvgs.filter(f => {
    if (f.type === 'bullish') return lastClose > f.bottom;
    return lastClose < f.top;
  });

  return unfilled.slice(-4);
}

// Liquidity Sweep: Preis bricht kurz unter/über ein Swing-Level (sammelt Stops)
// und kehrt sofort zurück — klassischer Spring/Upthrust.
function detectLiquiditySweep(candles, swings) {
  if (candles.length < 3) return null;
  const last3 = candles.slice(-3);
  const highs = swings.filter(s => s.type === 'high').slice(-3);
  const lows = swings.filter(s => s.type === 'low').slice(-3);

  for (const low of lows) {
    const sweepCandle = last3.find(c => c.low < low.price && c.close > low.price);
    if (sweepCandle) {
      return { type: 'bullish_sweep', level: low.price, description: `Liquidität unter Swing Low ${low.price.toFixed(2)} abgeholt — sofortige Rückkehr über das Level (Spring)` };
    }
  }
  for (const high of highs) {
    const sweepCandle = last3.find(c => c.high > high.price && c.close < high.price);
    if (sweepCandle) {
      return { type: 'bearish_sweep', level: high.price, description: `Liquidität über Swing High ${high.price.toFixed(2)} abgeholt — sofortige Rückkehr unter das Level (Upthrust)` };
    }
  }
  return null;
}

// Equal Highs/Lows: zwei oder mehr Swings auf annähernd gleichem Level = Liquiditätspool
function detectEqualLevels(swings, tolerance = 0.0015) {
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');

  function findEqual(levels) {
    for (let i = levels.length - 1; i > 0; i--) {
      for (let j = i - 1; j >= 0; j--) {
        const diff = Math.abs(levels[i].price - levels[j].price) / levels[i].price;
        if (diff < tolerance) {
          return { level: (levels[i].price + levels[j].price) / 2, count: 2 };
        }
      }
    }
    return null;
  }

  return {
    equalHighs: findEqual(highs.slice(-6)),
    equalLows: findEqual(lows.slice(-6)),
  };
}

// Premium/Discount: Position des aktuellen Preises im Range zwischen letztem Swing High und Low
function calcPremiumDiscount(candles, trend) {
  if (!trend.lastSwingHigh || !trend.lastSwingLow) return null;
  const range = trend.lastSwingHigh - trend.lastSwingLow;
  if (range <= 0) return null;
  const lastClose = candles[candles.length - 1]?.close;
  const position = (lastClose - trend.lastSwingLow) / range;

  let zone = 'Equilibrium';
  if (position > 0.7) zone = 'Premium';
  else if (position < 0.3) zone = 'Discount';

  return { zone, position: Math.round(position * 100) };
}

app.get('/gold/observation', async (req, res) => {
  try {
    const [h1Candles, h4CandlesRaw, d1Candles] = await Promise.all([
      fetchYahooCandles('60m', '1mo'),
      fetchYahooCandles('60m', '3mo'),
      fetchYahooCandles('1d', '1y'),
    ]);

    const h4Candles = aggregateTo4H(h4CandlesRaw);

    const h1Analysis = analyzeTrend(h1Candles);
    const h4Analysis = analyzeTrend(h4Candles);
    const d1Analysis = analyzeTrend(d1Candles);

    const ema20_h1 = calcEMA(h1Candles, 20);
    const ema50_h1 = calcEMA(h1Candles, 50);
    const atr_h1 = calcATR(h1Candles, 14);
    const lastPrice = h1Candles[h1Candles.length - 1]?.close;

    const h1Swings = detectSwings(h1Candles);
    const orderBlocks = detectOrderBlocks(h1Candles, atr_h1);
    const fvgs = detectFVGs(h1Candles);
    const sweep = detectLiquiditySweep(h1Candles, h1Swings);
    const equalLevels = detectEqualLevels(h1Swings);
    const premiumDiscount = calcPremiumDiscount(h1Candles, h1Analysis);
    const wyckoffClimax = detectWyckoffClimax(h1Candles);

    // ── Signal-Logik — gewichtetes Scoring-System ──
    // Jedes übereinstimmende Konzept erhöht den Score in eine Richtung.
    let bullScore = 0;
    let bearScore = 0;
    const reasons = [];

    // H4 Struktur (Hauptgewicht — 3 Punkte)
    if (h4Analysis.structure === 'Bullish') {
      bullScore += 3;
      reasons.push({ text: 'H4-Struktur ist bullisch (höhere Hochs, höhere Tiefs)', weight: 'high', dir: 'bull' });
    } else if (h4Analysis.structure === 'Bearish') {
      bearScore += 3;
      reasons.push({ text: 'H4-Struktur ist bearisch (tiefere Hochs, tiefere Tiefs)', weight: 'high', dir: 'bear' });
    } else {
      reasons.push({ text: 'H4-Struktur ist aktuell Range — kein klarer Trend', weight: 'low', dir: 'neutral' });
    }

    // D1 Struktur als übergeordneter Kontext (2 Punkte)
    if (d1Analysis.structure === 'Bullish') {
      bullScore += 2;
      reasons.push({ text: 'D1 (Daily) bestätigt bullischen Gesamtkontext', weight: 'medium', dir: 'bull' });
    } else if (d1Analysis.structure === 'Bearish') {
      bearScore += 2;
      reasons.push({ text: 'D1 (Daily) bestätigt bearischen Gesamtkontext', weight: 'medium', dir: 'bear' });
    }

    // H1 Liquiditätsbruch / BOS (2 Punkte)
    if (h1Analysis.liquidityBreak?.type === 'bullish_bos') {
      bullScore += 2;
      reasons.push({ text: `H1 Break of Structure — Preis über letztem Swing High bei ${h1Analysis.liquidityBreak.level.toFixed(2)}`, weight: 'medium', dir: 'bull' });
    } else if (h1Analysis.liquidityBreak?.type === 'bearish_bos') {
      bearScore += 2;
      reasons.push({ text: `H1 Break of Structure — Preis unter letztem Swing Low bei ${h1Analysis.liquidityBreak.level.toFixed(2)}`, weight: 'medium', dir: 'bear' });
    }

    // Liquidity Sweep (starkes Signal — 3 Punkte, da klassisches Reversal-Setup)
    if (sweep?.type === 'bullish_sweep') {
      bullScore += 3;
      reasons.push({ text: sweep.description, weight: 'high', dir: 'bull' });
    } else if (sweep?.type === 'bearish_sweep') {
      bearScore += 3;
      reasons.push({ text: sweep.description, weight: 'high', dir: 'bear' });
    }

    // Wyckoff Climax (starkes Signal — 2 Punkte, klassisches Erschöpfungs-Muster)
    if (wyckoffClimax?.type === 'selling_climax') {
      bullScore += 2;
      reasons.push({ text: `Wyckoff Selling Climax erkannt — Volumen ${wyckoffClimax.volRatio}x über Durchschnitt mit langem unterem Docht (mögliche Verkaufserschöpfung)`, weight: 'high', dir: 'bull' });
    } else if (wyckoffClimax?.type === 'buying_climax') {
      bearScore += 2;
      reasons.push({ text: `Wyckoff Buying Climax erkannt — Volumen ${wyckoffClimax.volRatio}x über Durchschnitt mit langem oberem Docht (mögliche Kauferschöpfung)`, weight: 'high', dir: 'bear' });
    }

    // Order Blocks in der Nähe des aktuellen Preises (1 Punkt je nahem OB)
    const nearBullishOB = orderBlocks.bullish.find(ob => lastPrice <= ob.high * 1.003 && lastPrice >= ob.low * 0.997);
    const nearBearishOB = orderBlocks.bearish.find(ob => lastPrice <= ob.high * 1.003 && lastPrice >= ob.low * 0.997);
    if (nearBullishOB) {
      bullScore += 1;
      reasons.push({ text: `Preis nahe bullischem Order Block (${nearBullishOB.low.toFixed(2)}–${nearBullishOB.high.toFixed(2)})`, weight: 'low', dir: 'bull' });
    }
    if (nearBearishOB) {
      bearScore += 1;
      reasons.push({ text: `Preis nahe bearischem Order Block (${nearBearishOB.low.toFixed(2)}–${nearBearishOB.high.toFixed(2)})`, weight: 'low', dir: 'bear' });
    }

    // Fair Value Gaps in der Nähe (1 Punkt je nahem FVG)
    const nearBullishFVG = fvgs.find(f => f.type === 'bullish' && lastPrice <= f.top * 1.003 && lastPrice >= f.bottom * 0.997);
    const nearBearishFVG = fvgs.find(f => f.type === 'bearish' && lastPrice <= f.top * 1.003 && lastPrice >= f.bottom * 0.997);
    if (nearBullishFVG) {
      bullScore += 1;
      reasons.push({ text: `Preis in offenem bullischem Fair Value Gap (${nearBullishFVG.bottom.toFixed(2)}–${nearBullishFVG.top.toFixed(2)})`, weight: 'low', dir: 'bull' });
    }
    if (nearBearishFVG) {
      bearScore += 1;
      reasons.push({ text: `Preis in offenem bearischem Fair Value Gap (${nearBearishFVG.bottom.toFixed(2)}–${nearBearishFVG.top.toFixed(2)})`, weight: 'low', dir: 'bear' });
    }

    // Equal Highs/Lows als Liquiditätsziel (informativ, kein Score)
    if (equalLevels.equalLows) {
      reasons.push({ text: `Equal Lows bei ${equalLevels.equalLows.level.toFixed(2)} — Liquiditätspool unterhalb`, weight: 'low', dir: 'neutral' });
    }
    if (equalLevels.equalHighs) {
      reasons.push({ text: `Equal Highs bei ${equalLevels.equalHighs.level.toFixed(2)} — Liquiditätspool oberhalb`, weight: 'low', dir: 'neutral' });
    }

    // Premium/Discount (1 Punkt — kauft günstiger im Discount, verkauft teurer im Premium)
    if (premiumDiscount) {
      if (premiumDiscount.zone === 'Discount') {
        bullScore += 1;
        reasons.push({ text: `Preis im Discount (${premiumDiscount.position}% des Range) — günstige Zone für Longs`, weight: 'low', dir: 'bull' });
      } else if (premiumDiscount.zone === 'Premium') {
        bearScore += 1;
        reasons.push({ text: `Preis im Premium (${premiumDiscount.position}% des Range) — teure Zone, eher für Shorts`, weight: 'low', dir: 'bear' });
      } else {
        reasons.push({ text: `Preis im Equilibrium (${premiumDiscount.position}% des Range) — keine klare Premium/Discount-Kante`, weight: 'low', dir: 'neutral' });
      }
    }

    // EMA Momentum (1 Punkt)
    if (ema20_h1 && ema50_h1) {
      if (ema20_h1 > ema50_h1) {
        bullScore += 1;
        reasons.push({ text: 'EMA20 über EMA50 auf H1 — kurzfristiges Momentum bullisch', weight: 'low', dir: 'bull' });
      } else {
        bearScore += 1;
        reasons.push({ text: 'EMA20 unter EMA50 auf H1 — kurzfristiges Momentum bearisch', weight: 'low', dir: 'bear' });
      }
    }

    // ── Finale Bias-Bestimmung — bewusst als Beobachtung formuliert, ──
    // ── kein Trading-Signal, kein Entry/SL/TP. ──
    const scoreDiff = bullScore - bearScore;
    const totalScore = bullScore + bearScore;
    let bias = 'Neutral';
    let biasStrength = 'Niedrig';

    if (scoreDiff >= 6) {
      bias = 'Bullisch';
      biasStrength = 'Hoch';
    } else if (scoreDiff >= 3) {
      bias = 'Bullisch';
      biasStrength = 'Mittel';
    } else if (scoreDiff <= -6) {
      bias = 'Bearisch';
      biasStrength = 'Hoch';
    } else if (scoreDiff <= -3) {
      bias = 'Bearisch';
      biasStrength = 'Mittel';
    }

    res.json({
      source: 'live',
      bias,
      biasStrength,
      lastPrice,
      bullScore,
      bearScore,
      totalScore,
      reasons: reasons.map(r => r.text), // einfache Liste für bestehendes Frontend
      reasonsDetailed: reasons, // mit weight/dir für erweiterte Darstellung
      atr: atr_h1,
      premiumDiscount,
      equalLevels,
      orderBlocks: {
        bullish: orderBlocks.bullish.map(ob => ({ high: ob.high, low: ob.low, time: ob.time })),
        bearish: orderBlocks.bearish.map(ob => ({ high: ob.high, low: ob.low, time: ob.time })),
      },
      fvgs: fvgs.map(f => ({ type: f.type, top: f.top, bottom: f.bottom, time: f.time })),
      liquiditySweep: sweep,
      wyckoffClimax,
      timeframes: {
        h1: { structure: h1Analysis.structure, lastSwingHigh: h1Analysis.lastSwingHigh, lastSwingLow: h1Analysis.lastSwingLow },
        h4: { structure: h4Analysis.structure, lastSwingHigh: h4Analysis.lastSwingHigh, lastSwingLow: h4Analysis.lastSwingLow },
        d1: { structure: d1Analysis.structure, lastSwingHigh: d1Analysis.lastSwingHigh, lastSwingLow: d1Analysis.lastSwingLow },
      },
      disclaimer: 'Keine Anlageberatung und kein Trading-Signal. Diese Beobachtung fasst automatisch erkannte Marktstruktur-Muster (Trendrichtung, Order Blocks, Fair Value Gaps, Liquidity Sweeps) rein zu Bildungs- und Informationszwecken zusammen. Sie stellt keine Kauf- oder Verkaufsempfehlung dar. Jede Trading-Entscheidung liegt vollständig in der eigenen Verantwortung.',
    });
  } catch (err) {
    console.error('Fehler bei der Gold-Bias-Berechnung:', err.message);
    res.status(500).json({ error: 'Konnte Beobachtung nicht berechnen', details: err.message });
  }
});
