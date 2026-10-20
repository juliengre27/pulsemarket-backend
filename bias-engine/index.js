// bias-engine/index.js — Routen /bias/v2 und /bias/v2/:asset
// Einbau in server.js (ESM):   import { registerBiasRoutes } from './bias-engine/index.js'; registerBiasRoutes(app);
// Bei CommonJS-server.js:      import('./bias-engine/index.js').then(m => m.registerBiasRoutes(app));
import * as S from './sources.js';
import * as Q from './scoring.js';
import { enrichCalendarActuals, loggedEvents } from './calendar-actuals.js';
import { buildScenarios, eventRiskFromCalendar, buildTodayScenario, eventsForToday } from './scenarios.js';
import { computeIntraday, upcomingUsd } from './intraday.js';
export { enrichCalendarActuals };

const HORIZONS = ['daily', 'weekly', 'monthly'];

async function loadAll() {
  const today = new Date(); const from = new Date(today - 400 * 864e5);
  const iso = d => d.toISOString().slice(0, 10);
  const [gold, nas, btc, dxy, dgs2, dgs10, dfii10, vix, cotRaw, deribit, cg, gex, mfb, fh, local, ff] = await Promise.all([
    S.yahooDaily(S.YAHOO.GOLD), S.yahooDaily(S.YAHOO.NAS), S.yahooDaily(S.YAHOO.BTC), S.yahooDaily(S.YAHOO.DXY),
    S.fred('DGS2'), S.fred('DGS10'), S.fred('DFII10'), S.fred('VIXCLS'),
    Promise.all(['USDX', 'EUR', 'JPY', 'GBP', 'CHF', 'CAD', 'AUD', 'GOLD', 'NAS', 'BTC'].map(k => S.cot(k))),
    S.deribitBtc(), S.coinglassBtc(), S.gexQQQ(), S.myfxbook(),
    S.finnhubEvents(iso(from), iso(today)), S.localEvents(), S.ffWeek(),
  ]);
  const logged = await loggedEvents();
  const cot = Object.fromEntries(cotRaw.map(c => [c.key, c]));
  // Events: automatisches Log (FF-Forecast + FRED-Actual) hat Vorrang, dann Finnhub, dann manuelle events.json
  const seen = new Set(); const events = [];
  for (const e of [...logged, ...(fh.events || []), ...(local.events || [])]) {
    if (!e?.code || !isFinite(e.actual) || !isFinite(e.forecast)) continue;
    const k = e.date + e.code; if (!seen.has(k)) { seen.add(k); events.push(e); }
  }
  return { gold, nas, btc, dxy, dgs2, dgs10, dfii10, vix, cot, deribit, cg, gex, mfb, events, ff,
    sources: { forexfactory: ff, yahoo_gold: gold, yahoo_nas: nas, yahoo_btc: btc, yahoo_dxy: dxy, fred_dgs2: dgs2, fred_dfii10: dfii10, cot_gold: cot.GOLD, cot_eur: cot.EUR, deribit, coinglass: cg, flashalpha: gex, myfxbook: mfb, finnhub: fh, events_json: local, events_log: { stale: false, fetchedAt: null, count: logged.length } } };
}

export async function computeBias() {
  const [d, intra] = await Promise.all([loadAll(), computeIntraday({ fredFn: S.fred }).catch(e => ({ error: e.message, rates: { score: 0, ok: false }, oil: { score: 0, ok: false }, fedFunds: { ok: false, score: 0 }, earnings: { ok: false, risk5d: 0, upcoming: [] }, structure: {}, upcoming: [], health: {} }))]);
  // computeIntraday lief parallel ohne den Wochenkalender → 10-Tage-Vorschau jetzt mit beiden Wochen rechnen
  intra.upcoming = upcomingUsd(d.ff?.events || [], intra.ffNextEvents || []);
  const surprise = Q.surpriseIndex(d.events);
  const ratesFred = Q.ratesScore({ dgs2: d.dgs2.obs, dfii10: d.dfii10.obs, dgs10: d.dgs10.obs });
  // Zinsscore: FRED (Tagesverzögerung, 20d-Trend) 55 % · Live-Yahoo (heute/5d) 35 % · Fed-Funds-Pfad 10 %
  const rates = { ...ratesFred, fred: ratesFred.score, live: intra.rates?.ok ? intra.rates.score : null, fedPath: intra.fedFunds?.ok ? intra.fedFunds.score : null,
    score: Q.clamp(ratesFred.score * (intra.rates?.ok ? 0.55 : 0.9) + (intra.rates?.ok ? intra.rates.score * 0.35 : 0) + (intra.fedFunds?.ok ? intra.fedFunds.score * 0.1 : 0)) };
  const oil = intra.oil?.ok ? intra.oil.score : 0;
  const vixNow = d.vix.obs?.at(-1)?.v ?? null;

  // ---- DXY: Treiber-Layer ----
  const usdRows = Q.syntheticUsdCot(d.cot);
  const dxyParts = {
    trend: Q.trendScore(d.dxy.closes),
    macro: { score: Q.clamp(surprise.score * 0.6 + rates.score * 0.4) },
    positioning: Q.cotScore(usdRows),
    crowd: Q.crowdScore(d.mfb?.EURUSD ? { ...d.mfb.EURUSD, longPercentage: 100 - +d.mfb.EURUSD.longPercentage, avgLongPrice: d.mfb.EURUSD.avgShortPrice, avgShortPrice: d.mfb.EURUSD.avgLongPrice } : null), // EURUSD-Longs = USD-Shorts (Entry-Preise sind EURUSD-Kurse)
  };
  const dxyStruct = intra.structure?.DXY ? { score: intra.structure.DXY.score, regime: intra.structure.DXY.regime, ohlc: intra.structure.DXY } : null;
  const dxyOut = horizonsFor(dxyParts, dxyStruct);

  // ---- Assets ----
  const link = (h, sign) => sign * dxyOut[h].score; // DXY-Kopplung
  const build = (name, closes, cotRows, structure, crowd, macroAdj, dxySign) => {
    const parts = { trend: Q.trendScore(closes), macro: { score: macroAdj }, positioning: Q.cotScore(cotRows), structure, crowd };
    const out = {};
    for (const h of HORIZONS) {
      const scalar = { trend: parts.trend.score, macro: parts.macro.score, positioning: parts.positioning.score,
        structure: parts.structure?.score ?? null, crowd: parts.crowd?.score ?? null, dxy: link(h, dxySign) };
      out[h] = Q.combine(scalar, h, parts.positioning.damp);
    }
    const levels = { ...(structure?.levels ?? {}), ...(crowd?.levels ?? {}) };
    return { asset: name, horizons: out, components: parts, levels: Object.keys(levels).length ? levels : null, regime: structure?.regime ?? null, expiry: structure?.expiry ?? null };
  };

  // Makro-Wirkung pro Asset: Inflationsüberraschung nach oben = hawkish = schlecht für Gold/NAS/BTC;
  // Wachstumsüberraschung nach oben = gut für NAS, neutral-leicht negativ für Gold.
  // Öl: Inflationsimpuls → Yields hoch → schlecht für NAS/BTC; Gold netto leicht positiv (Hedge > Zinseffekt, solange Realzinsen nicht mitziehen).
  const infl = Q.clamp(surprise.inflationImpulse / 2), grow = Q.clamp(surprise.growthImpulse / 2);
  const goldMacro = Q.clamp(-infl * 0.5 - rates.score * 0.5 - grow * 0.2 + oil * 0.15);
  const nasMacro  = Q.clamp(-infl * 0.5 - rates.score * 0.3 + grow * 0.5 - (vixNow > 25 ? 0.5 : 0) - oil * 0.3);
  const btcMacro  = Q.clamp(-infl * 0.4 - rates.score * 0.4 + grow * 0.3 - oil * 0.2);

  // Struktur: Options-/Gamma-Struktur (falls vorhanden) + Intraday-OHLC-Struktur (PDH/PDL, Wochen-Open, ATR). Gold hatte bisher gar keine.
  const ohlc = intra.structure || {};
  const mergeStruct = (base, k, w = 0.6) => {
    const o = ohlc[k]; if (!o) return base;
    if (!base) return { score: o.score, regime: o.regime, levels: o.levels, ohlc: o };
    return { ...base, score: Q.clamp((base.score ?? 0) + o.score * w), levels: { ...(base.levels || {}), ...o.levels }, ohlc: o };
  };
  const gold = build('GOLD', d.gold.closes, d.cot.GOLD?.rows, mergeStruct(null, 'GOLD', 1), Q.crowdScore(d.mfb?.XAUUSD, d.gold.closes?.at(-1)), goldMacro, -1);
  const nas  = build('NAS100', d.nas.closes, d.cot.NAS?.rows, mergeStruct(Q.structureNas(d.gex, vixNow), 'NAS100'), null, nasMacro, -0.5);
  const btc  = build('BTC', d.btc.closes, d.cot.BTC?.rows, mergeStruct(Q.structureBtc(d.deribit, d.cg, d.btc.closes?.at(-1)), 'BTC'), null, btcMacro, -0.7);

  // ---- Szenarien für die nächsten ~5 Handelstage ----
  const eventRisk = eventRiskFromCalendar(d.ff?.events || []);
  const earnRisk = intra.earnings?.risk5d ?? 0;
  gold.scenarios = buildScenarios(gold, d.gold.closes, { eventRisk, label: 'Gold' });
  nas.scenarios  = buildScenarios(nas,  d.nas.closes,  { eventRisk: Math.max(eventRisk, earnRisk), label: 'NAS100' }); // Mega-Cap-Earnings zählen für NAS wie Makro-Events
  btc.scenarios  = buildScenarios(btc,  d.btc.closes,  { eventRisk: Math.max(eventRisk * 0.6, earnRisk * 0.5), label: 'Bitcoin' }); // BTC reagiert schwächer auf US-Makro

  // ---- Tagesszenario (heute) aus PDH/PDL/ATR + Events der nächsten 20 h ----
  const evToday = eventsForToday(d.ff?.events || [], intra.earnings?.upcoming || []);
  gold.today = buildTodayScenario(gold, ohlc.GOLD, { eventsToday: evToday.filter(e => !/-Zahlen$/.test(e.title)), label: 'Gold' });
  nas.today  = buildTodayScenario(nas,  ohlc.NAS100, { eventsToday: evToday, label: 'NAS100' });
  btc.today  = buildTodayScenario(btc,  ohlc.BTC, { eventsToday: evToday.filter(e => /-Zahlen$/.test(e.title) ? e.weight >= 0.9 : true), label: 'Bitcoin' });
  // DXY: keine Retail-Level übergeben – die sind EURUSD-Kurse und würden als DXY-Support fehlinterpretiert
  const dxyAsset = { horizons: dxyOut, components: { ...dxyParts, structure: dxyStruct, crowd: { ...dxyParts.crowd, trapped: null, levels: null } }, levels: null, regime: dxyStruct?.regime ?? null };
  const dxyScen = buildScenarios(dxyAsset, d.dxy.closes, { eventRisk, label: 'DXY' });
  const dxyToday = buildTodayScenario(dxyAsset, ohlc.DXY, { eventsToday: evToday.filter(e => !/-Zahlen$/.test(e.title)), label: 'DXY' });

  // Vorwarnung für den Wochenhorizont: schweres Event (FOMC/CPI/NFP) in 5–10 Tagen liegt außerhalb des 5-Tage-eventRisk
  const heavyAhead = (intra.upcoming || []).filter(u => u.heavy);
  const weekWarning = heavyAhead.length ? `Schwere Events voraus: ${heavyAhead.slice(0, 3).map(u => `${u.title} in ${u.daysTo} Tagen`).join(', ')}. Wochen-Bias vor dem Termin weniger belastbar.` : null;

  return {
    generatedAt: new Date().toISOString(),
    dxy: { horizons: dxyOut, components: { ...dxyParts, structure: dxyStruct }, surprise, rates, vix: vixNow, scenarios: dxyScen, today: dxyToday },
    eventsToday: evToday,
    eventRisk, earningsRisk: earnRisk, weekWarning,
    intraday: { rates: intra.rates, oil: intra.oil, fedFunds: intra.fedFunds, earnings: intra.earnings, upcoming: intra.upcoming, generatedAt: intra.generatedAt, error: intra.error ?? null },
    assets: { GOLD: gold, NAS100: nas, BTC: btc },
    dataHealth: { ...Object.fromEntries(Object.entries(d.sources).map(([k, v]) => [k, { stale: !!v?.stale, error: v?.error ?? null, fetchedAt: v?.fetchedAt ?? null }])), ...(intra.health || {}) },
    disclaimer: 'Beobachtung, keine Anlageberatung. Positionierungsdaten (COT) haben 3 Tage Verzögerung.',
  };
}

// ---- /bias/daily: Kompatibilitäts-View aus v2 (ersetzt die alte Vier-Faktoren-Rechnung in server.js) ----
// Gleiche Form wie früher (instrument, bias, arrow, score, factors), aber dieselbe Rechnung wie v2 → kein Widerspruch mehr.
export function legacyDailyView(v2) {
  const map = { XAUUSD: v2.assets.GOLD, NAS100: v2.assets.NAS100, BTCUSD: v2.assets.BTC };
  const lbl = s => s > 0.3 ? 'LONG' : s < -0.3 ? 'SHORT' : 'NEUTRAL';
  const arrow = s => s > 0.3 ? '▲' : s < -0.3 ? '▼' : '·';
  const f = (name, c, note) => c == null ? null : { name, ok: true, value: (+c).toFixed(2), points: +(+c).toFixed(1), note };
  const out = {};
  for (const [k, a] of Object.entries(map)) {
    const day = a.horizons.daily.score, c = a.components;
    const factors = [f('Trend (1M/3M, SMA50/200)', c.trend?.score, c.trend?.aboveSma200 ? 'über SMA200' : 'unter SMA200'),
      f('Makro (Überraschung + Zinsen + Öl)', c.macro?.score, 'Zinsen/Inflationsimpuls'),
      f('Struktur (Optionen + Intraday-Level)', c.structure?.score, c.structure?.regime ?? ''),
      f('Positionierung (COT)', c.positioning?.score, c.positioning?.extreme ? 'COT-Extrem' : `Perzentil ${c.positioning?.percentile3y}`),
      f('Retail-Crowd', c.crowd?.score, c.crowd?.trapped ? `${c.crowd.trapped} gefangen` : 'neutral')].filter(Boolean);
    out[k] = { instrument: k, bias: lbl(day), arrow: arrow(day), score: +day.toFixed(2), confidence: 1, factors,
      comment: `Tages-Bias aus /bias/v2 (${a.horizons.daily.label}). Woche: ${a.horizons.weekly.label}, Monat: ${a.horizons.monthly.label}.` };
  }
  // EURUSD ≈ −DXY (Tageshorizont)
  const e = -v2.dxy.horizons.daily.score;
  out.EURUSD = { instrument: 'EURUSD', bias: lbl(e), arrow: arrow(e), score: +e.toFixed(2), confidence: 1, factors: [f('DXY-Bias (invertiert)', e, v2.dxy.horizons.daily.label)].filter(Boolean), comment: 'Abgeleitet aus dem DXY-Treiber-Layer von /bias/v2.' };
  return { source: 'v2', asOf: v2.generatedAt, disclaimer: v2.disclaimer, instruments: out, weekWarning: v2.weekWarning ?? null };
}
function horizonsFor(parts, structure) {
  const out = {};
  for (const h of HORIZONS) {
    out[h] = Q.combine({ trend: parts.trend.score, macro: parts.macro.score, positioning: parts.positioning.score, structure: structure?.score ?? null, crowd: parts.crowd?.score ?? null, dxy: null }, h, parts.positioning.damp);
  }
  return out;
}

// ---- Bias-Logging für die 60-Tage-Auswertung (JSONL, später Postgres) ----
import { appendFile } from 'node:fs/promises';
export async function logBias(result, path = process.env.BIAS_LOG_PATH || './bias-log.jsonl') {
  // Horizont-Scores + Szenarien (Basisszenario, Wahrscheinlichkeiten, Level) für die spätere Trefferquote
  const sc = v => v?.scenarios ? { price: v.scenarios.price, base: v.scenarios.base, p: Object.fromEntries(v.scenarios.scenarios.map(s => [s.name, s.p])), support: v.scenarios.support, resistance: v.scenarios.resistance,
    today: v.today ? { base: v.today.base, p: Object.fromEntries(v.today.scenarios.map(s => [s.name, s.p])), range: v.today.range, atr: v.today.atr14 } : null } : null;
  const row = { t: result.generatedAt, eventRisk: result.eventRisk, dxy: { ...result.dxy.horizons, scen: sc(result.dxy) },
    ...Object.fromEntries(Object.entries(result.assets).map(([k, v]) => [k, { ...v.horizons, scen: sc(v) }])) };
  try { await appendFile(path, JSON.stringify(row) + '\n'); } catch (e) { console.warn('bias log failed', e.message); }
}

export function registerBiasRoutes(app) {
  let last = null, lastT = 0;
  const get = async (fresh = false) => { if (fresh || !last || Date.now() - lastT > 15 * 60e3) { last = await computeBias(); lastT = Date.now(); logBias(last); } return last; };
  // ?fresh=1 umgeht den 15-Minuten-Cache (nur zum Testen; Quellen-Caches in sources.js bleiben aktiv)
  app.get('/bias/v2', async (req, res) => { try { res.json(await get(req.query.fresh === '1')); } catch (e) { res.status(500).json({ error: e.message }); } });
  // /bias/daily aus v2 ableiten (alte Route in server.js heißt jetzt /bias/daily-legacy)
  app.get('/bias/daily', async (req, res) => { try { res.json(legacyDailyView(await get(req.query.fresh === '1'))); } catch (e) { res.status(500).json({ error: e.message }); } });
  // Nur die Intraday-Schicht (Live-Zinsen, Öl, Fed-Funds, Earnings, Struktur) – zum Debuggen
  app.get('/bias/intraday', async (req, res) => { try { res.json(await computeIntraday({ fredFn: S.fred })); } catch (e) { res.status(500).json({ error: e.message }); } });
  // Backtest des Tagesszenarios: /bias/backtest?asset=GOLD|NAS100|BTC|DXY|ALL&days=120&hour=9&html=1  (6h-Cache pro Parametersatz)
  const btCache = new Map();
  app.get('/bias/backtest', async (req, res) => {
    try {
      const { backtestAsset, backtestAll, backtestHtml } = await import('./backtest.js');
      const asset = (req.query.asset || 'ALL').toUpperCase(), days = Math.min(400, +req.query.days || 120), hourUtc = Math.min(23, Math.max(0, +req.query.hour || 9));
      const key = `${asset}:${days}:${hourUtc}`; let v = btCache.get(key);
      if (!v || Date.now() - v.t > 6 * 3600e3) { const out = asset === 'ALL' ? await backtestAll({ days, hourUtc }) : { [asset]: await backtestAsset(asset, { days, hourUtc }) }; v = { t: Date.now(), out }; btCache.set(key, v); }
      if (req.query.html === '1') { res.type('html').send(backtestHtml(v.out)); } else res.json(v.out);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/bias/v2/:asset', async (req, res) => {
    try { const r = await get(); const a = req.params.asset.toUpperCase();
      if (a === 'DXY') return res.json(r.dxy); const x = r.assets[a]; if (!x) return res.status(404).json({ error: 'asset unbekannt' }); res.json(x); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
}
