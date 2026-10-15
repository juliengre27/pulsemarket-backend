// bias-engine/sources.js — alle externen Datenquellen, jede mit Cache + stale-Flag.
// Node >= 18 (globales fetch). Keine Abhängigkeiten.

const CACHE = new Map();
async function cached(key, ttlMs, fn) {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  try {
    const v = await fn();
    CACHE.set(key, { t: Date.now(), v: { ...v, stale: false, fetchedAt: new Date().toISOString() } });
    return CACHE.get(key).v;
  } catch (e) {
    if (hit) return { ...hit.v, stale: true, error: String(e.message || e) };
    return { stale: true, error: String(e.message || e), fetchedAt: null };
  }
}
const H = 3600e3, D = 24 * H;

// ---------- Yahoo: Tageskerzen für Trend ----------
export const YAHOO = {
  GOLD: 'GC=F', NAS: 'NQ=F', BTC: 'BTC-USD', DXY: 'DX-Y.NYB',
  EURUSD: 'EURUSD=X', USDJPY: 'JPY=X', US2Y: '^IRX', VIX: '^VIX', VXN: '^VXN',
};
export function yahooDaily(symbol, range = '1y') {
  return cached(`yh:${symbol}`, 30 * 60e3, async () => {
    const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 PulseMarket' } });
    if (!r.ok) throw new Error(`yahoo ${symbol} ${r.status}`);
    const j = await r.json();
    const res = j.chart.result[0];
    const q = res.indicators.quote[0];
    const closes = [], dates = [];
    res.timestamp.forEach((t, i) => { if (q.close[i] != null) { closes.push(q.close[i]); dates.push(t * 1000); } });
    return { symbol, closes, dates, openInterest: res.meta?.openInterest ?? null };
  });
}

// ---------- FRED ----------
export function fred(series, limit = 300) {
  return cached(`fred:${series}`, 6 * H, async () => {
    const key = process.env.FRED_API_KEY;
    if (!key) throw new Error('FRED_API_KEY fehlt');
    const u = `https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${key}&file_type=json&sort_order=desc&limit=${limit}`;
    const r = await fetch(u);
    if (!r.ok) throw new Error(`fred ${series} ${r.status}`);
    const j = await r.json();
    const obs = j.observations.filter(o => o.value !== '.').map(o => ({ d: o.date, v: +o.value })).reverse();
    return { series, obs };
  });
}

// ---------- CFTC COT (Socrata, kostenlos, kein Key) ----------
// Legacy-Report 6dca-aqww: noncomm_positions_long_all / short_all, Markt-Namen wie unten.
const COT_MARKETS = {
  USDX: 'U.S. DOLLAR INDEX - ICE FUTURES U.S.',
  EUR: 'EURO FX - CHICAGO MERCANTILE EXCHANGE',
  JPY: 'JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE',
  GBP: 'BRITISH POUND - CHICAGO MERCANTILE EXCHANGE',
  CHF: 'SWISS FRANC - CHICAGO MERCANTILE EXCHANGE',
  CAD: 'CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE',
  AUD: 'AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE',
  GOLD: 'GOLD - COMMODITY EXCHANGE INC.',
  NAS: 'NASDAQ MINI - CHICAGO MERCANTILE EXCHANGE',
  BTC: 'BITCOIN - CHICAGO MERCANTILE EXCHANGE',
};
export function cot(key, weeks = 156) {
  return cached(`cot:${key}`, 12 * H, async () => {
    const name = COT_MARKETS[key];
    const where = encodeURIComponent(`market_and_exchange_names='${name}'`);
    const u = `https://publicreporting.cftc.gov/resource/6dca-aqww.json?$where=${where}&$order=report_date_as_yyyy_mm_dd DESC&$limit=${weeks}`;
    const r = await fetch(u, { headers: { 'User-Agent': 'PulseMarket bias-engine' } });
    if (!r.ok) throw new Error(`cftc ${key} ${r.status}`);
    const rows = (await r.json()).map(x => ({
      date: x.report_date_as_yyyy_mm_dd?.slice(0, 10),
      net: (+x.noncomm_positions_long_all) - (+x.noncomm_positions_short_all),
      oi: +x.open_interest_all,
    })).reverse();
    if (!rows.length) throw new Error(`cftc ${key}: keine Zeilen (Marktname prüfen)`);
    return { key, rows };
  });
}

// ---------- Deribit (öffentlich) — BTC Options-OI ----------
export function deribitBtc() {
  return cached('deribit:BTC', H, async () => {
    const r = await fetch('https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option');
    if (!r.ok) throw new Error(`deribit ${r.status}`);
    const rows = (await r.json()).result;
    const spot = rows[0]?.underlying_price ?? rows[0]?.estimated_delivery_price;
    // Expiry-Code (z. B. 31OCT26) → Datum
    const MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
    const expDate = (code) => { const m = code.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/); return m ? Date.UTC(2000 + +m[3], MON[m[2]], +m[1], 8) : null; };
    const byExp = {};
    for (const o of rows) {
      const [, exp, strike, type] = o.instrument_name.split('-');
      const e = (byExp[exp] ??= { exp, date: expDate(exp), byStrike: {}, callOI: 0, putOI: 0 });
      const k = +strike; const oi = o.open_interest || 0;
      e.byStrike[k] ??= { call: 0, put: 0 };
      if (type === 'C') { e.byStrike[k].call += oi; e.callOI += oi; } else { e.byStrike[k].put += oi; e.putOI += oi; }
    }
    const analyse = (byStrike) => {
      const strikes = Object.keys(byStrike).map(Number).sort((a, b) => a - b);
      let best = null;
      for (const s of strikes) {
        let pain = 0;
        for (const k of strikes) pain += Math.max(0, s - k) * byStrike[k].call + Math.max(0, k - s) * byStrike[k].put;
        if (!best || pain < best.pain) best = { strike: s, pain };
      }
      const top = (t) => strikes.map(k => ({ k, v: byStrike[k][t] })).sort((a, b) => b.v - a.v).slice(0, 3);
      return { maxPain: best?.strike, callWall: top('call')[0]?.k, putWall: top('put')[0]?.k, topCalls: top('call'), topPuts: top('put') };
    };
    // Gesamtbild (alle Verfälle) …
    const all = {}; let callOI = 0, putOI = 0;
    for (const e of Object.values(byExp)) { callOI += e.callOI; putOI += e.putOI; for (const [k, v] of Object.entries(e.byStrike)) { all[k] ??= { call: 0, put: 0 }; all[k].call += v.call; all[k].put += v.put; } }
    const total = analyse(all);
    // … und der nächste große Verfall (letzter Freitag des Monats = Monats-/Quartalsverfall) mit relevantem OI
    const now = Date.now();
    const isMonthly = (d) => { const x = new Date(d); const nx = new Date(x); nx.setUTCDate(x.getUTCDate() + 7); return x.getUTCDay() === 5 && nx.getUTCMonth() !== x.getUTCMonth(); };
    const next = Object.values(byExp).filter(e => e.date && e.date > now && isMonthly(e.date)).sort((a, b) => a.date - b.date)[0];
    const nextExp = next ? { exp: next.exp, date: new Date(next.date).toISOString().slice(0, 10), callOI: next.callOI, putOI: next.putOI, putCallRatio: next.putOI / Math.max(1, next.callOI), ...analyse(next.byStrike) } : null;
    return { spot, callOI, putOI, putCallRatio: putOI / Math.max(1, callOI), ...total, nextExpiry: nextExp };
  });
}

// ---------- Coinglass (optional, COINGLASS_API_KEY) ----------
export function coinglassBtc() {
  return cached('cg:BTC', 15 * 60e3, async () => {
    const key = process.env.COINGLASS_API_KEY;
    if (!key) throw new Error('COINGLASS_API_KEY fehlt (optional)');
    const h = { 'CG-API-KEY': key, accept: 'application/json' };
    const [fr, ls] = await Promise.all([
      fetch('https://open-api-v4.coinglass.com/api/futures/funding-rate/exchange-list?symbol=BTC', { headers: h }).then(r => r.json()),
      fetch('https://open-api-v4.coinglass.com/api/futures/global-long-short-account-ratio/history?symbol=BTCUSDT&exchange=Binance&interval=4h&limit=1', { headers: h }).then(r => r.json()),
    ]);
    const binance = fr?.data?.find?.(x => x.exchange === 'Binance') || fr?.data?.[0]?.stablecoin_margin_list?.find?.(x => x.exchange === 'Binance');
    return { fundingRate: binance?.funding_rate ?? null, longShortRatio: ls?.data?.[0]?.global_account_long_short_ratio ?? null, raw: { fr, ls } };
  });
}

// ---------- FlashAlpha GEX (optional, FLASHALPHA_API_KEY) ----------
// Free-Tier: 5 Requests/Tag. Der Cache liegt deshalb zusätzlich auf Disk (Volume), damit Neustarts
// und ?fresh=1 das Kontingent nicht verbrennen. Pfad: neben BIAS_LOG_PATH, sonst ./gex-cache.json.
import { writeFile as _wf } from 'node:fs/promises';
const GEX_CACHE = process.env.GEX_CACHE_PATH || (process.env.BIAS_LOG_PATH ? process.env.BIAS_LOG_PATH.replace(/[^/]*$/, 'gex-cache.json') : './gex-cache.json');
export function gexQQQ() {
  return cached('gex:QQQ', 12 * H, async () => {
    const key = process.env.FLASHALPHA_API_KEY;
    if (!key) throw new Error('FLASHALPHA_API_KEY fehlt (optional)');
    // Disk-Cache zuerst: jünger als 12h → kein API-Call
    try { const c = JSON.parse(await readFile(GEX_CACHE, 'utf8')); if (Date.now() - c.t < 12 * H) return c.v; } catch {}
    // Doku: GET /v1/exposure/{ticker}/gex, Header X-Api-Key. Fallback auf alte Pfadform, falls 404.
    // Auth-Varianten nacheinander probieren (Doku nennt X-Api-Key; 403 = Header/Key abgelehnt)
    const tries = [
      ['https://lab.flashalpha.com/v1/exposure/QQQ/gex', { 'X-Api-Key': key }],
      ['https://lab.flashalpha.com/v1/exposure/QQQ/gex', { 'x-api-key': key, Authorization: `Bearer ${key}` }],
      [`https://lab.flashalpha.com/v1/exposure/QQQ/gex?api_key=${encodeURIComponent(key)}`, {}],
      ['https://lab.flashalpha.com/v1/exposure/gex/QQQ', { 'X-Api-Key': key }],
    ];
    let r, codes = [];
    for (const [u, hh] of tries) {
      r = await fetch(u, { headers: { accept: 'application/json', ...hh } });
      if (r.ok) break; codes.push(r.status);
    }
    if (!r.ok) throw new Error(`flashalpha ${codes.join('/')} (429 = Tageslimit 5 Req. verbraucht; 403 = Key/Header prüfen)`);
    const j = await r.json(); const d = j.data ?? j;
    const pick = (...ks) => { for (const k of ks) { const v = k.split('.').reduce((o, p) => o?.[p], d); if (v != null) return +v; } return null; };
    const v = { netGex: pick('net_gex', 'netGex', 'summary.net_gex', 'total_gex'), gammaFlip: pick('gamma_flip', 'gammaFlip', 'summary.gamma_flip', 'flip'),
      callWall: pick('call_wall', 'callWall', 'summary.call_wall'), putWall: pick('put_wall', 'putWall', 'summary.put_wall'), regime: d.regime ?? d.summary?.regime ?? null, raw: j };
    _wf(GEX_CACHE, JSON.stringify({ t: Date.now(), v })).catch(() => {});
    return v;
  });
}

// ---------- Myfxbook Community Outlook (optional) ----------
let MFB_SESSION = null;
export function myfxbook() {
  return cached('mfb', H, async () => {
    const { MYFXBOOK_EMAIL: e, MYFXBOOK_PASSWORD: p } = process.env;
    if (!e || !p) throw new Error('MYFXBOOK_EMAIL/PASSWORD fehlen (optional)');
    if (!MFB_SESSION) {
      const l = await fetch(`https://www.myfxbook.com/api/login.json?email=${encodeURIComponent(e)}&password=${encodeURIComponent(p)}`).then(r => r.json());
      if (l.error) throw new Error(`myfxbook login: ${l.message}`);
      MFB_SESSION = l.session;
    }
    const j = await fetch(`https://www.myfxbook.com/api/get-community-outlook.json?session=${MFB_SESSION}`).then(r => r.json());
    if (j.error) { MFB_SESSION = null; throw new Error(`myfxbook outlook: ${j.message}`); }
    const pick = (n) => j.symbols.find(s => s.name === n);
    return { XAUUSD: pick('XAUUSD'), EURUSD: pick('EURUSD'), USDJPY: pick('USDJPY') };
  });
}

// ---------- Forex-Factory-Wochenkalender (für Event-Risiko der Szenarien) ----------
export function ffWeek() {
  return cached('ff:week', 30 * 60e3, async () => {
    const r = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', { headers: { 'User-Agent': 'Mozilla/5.0 PulseMarket', Accept: 'application/json' } });
    if (!r.ok) throw new Error(`forexfactory ${r.status}`);
    const raw = await r.json();
    return { events: raw.map(x => ({ title: x.title, country: x.country, impact: x.impact, timestamp: x.date ? Math.floor(new Date(x.date).getTime() / 1000) : null })) };
  });
}

// ---------- Makro-Events: Finnhub-Adapter + lokaler Fallback ----------
// Vereinheitlichtes Format: { date:'YYYY-MM-DD', code:'CPI_YOY', actual, forecast, previous, country:'US' }
export function finnhubEvents(from, to) {
  return cached(`fh:${from}:${to}`, 3 * H, async () => {
    const key = process.env.FINNHUB_API_KEY;
    if (!key) throw new Error('FINNHUB_API_KEY fehlt');
    const r = await fetch(`https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${key}`);
    if (!r.ok) throw new Error(`finnhub calendar ${r.status} (Economic Calendar ist bei Finnhub Premium-only — dann events.json nutzen)`);
    const j = await r.json();
    const events = (j.economicCalendar || []).filter(e => e.country === 'US' && e.actual != null && e.estimate != null)
      .map(e => ({ date: e.time?.slice(0, 10), code: normalizeEvent(e.event), name: e.event, actual: +e.actual, forecast: +e.estimate, previous: e.prev != null ? +e.prev : null, country: 'US' }))
      .filter(e => e.code);
    return { events };
  });
}
import { readFile } from 'node:fs/promises';
export async function localEvents(path = new URL('./events.json', import.meta.url)) {
  try { return { events: JSON.parse(await readFile(path, 'utf8')), stale: false }; }
  catch { return { events: [], stale: true, error: 'events.json fehlt' }; }
}
export function normalizeEvent(name = '') {
  const n = name.toLowerCase();
  if (/core.*cpi.*(y\/y|yoy|year)/.test(n)) return 'CORE_CPI_YOY';
  if (/\bcpi\b.*(y\/y|yoy|year)/.test(n)) return 'CPI_YOY';
  if (/core.*cpi.*(m\/m|mom)/.test(n)) return 'CORE_CPI_MOM';
  if (/\bcpi\b.*(m\/m|mom)/.test(n)) return 'CPI_MOM';
  if (/core.*pce.*(y\/y|yoy)/.test(n)) return 'CORE_PCE_YOY';
  if (/non.?farm|nfp|payroll/.test(n)) return 'NFP';
  if (/unemployment rate/.test(n)) return 'UNEMPLOYMENT';
  if (/average hourly earnings.*(m\/m|mom)/.test(n)) return 'AHE_MOM';
  if (/ism manufacturing pmi/.test(n)) return 'ISM_MFG';
  if (/ism (non-manufacturing|services) pmi/.test(n)) return 'ISM_SERV';
  if (/retail sales.*(m\/m|mom)/.test(n) && !/core|ex/.test(n)) return 'RETAIL_MOM';
  if (/gdp.*(q\/q|qoq|annualized)/.test(n)) return 'GDP';
  if (/initial jobless|initial claims/.test(n)) return 'CLAIMS';
  if (/jolts/.test(n)) return 'JOLTS';
  if (/\bppi\b.*(m\/m|mom)/.test(n) && !/core/.test(n)) return 'PPI_MOM';
  return null;
}
