// bias-engine/index.js — Routen /bias/v2 und /bias/v2/:asset
// Einbau in server.js (ESM):   import { registerBiasRoutes } from './bias-engine/index.js'; registerBiasRoutes(app);
// Bei CommonJS-server.js:      import('./bias-engine/index.js').then(m => m.registerBiasRoutes(app));
import * as S from './sources.js';
import * as Q from './scoring.js';
import { enrichCalendarActuals, loggedEvents } from './calendar-actuals.js';
import { buildScenarios, eventRiskFromCalendar } from './scenarios.js';
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
  const d = await loadAll();
  const surprise = Q.surpriseIndex(d.events);
  const rates = Q.ratesScore({ dgs2: d.dgs2.obs, dfii10: d.dfii10.obs, dgs10: d.dgs10.obs });
  const vixNow = d.vix.obs?.at(-1)?.v ?? null;

  // ---- DXY: Treiber-Layer ----
  const usdRows = Q.syntheticUsdCot(d.cot);
  const dxyParts = {
    trend: Q.trendScore(d.dxy.closes),
    macro: { score: Q.clamp(surprise.score * 0.6 + rates.score * 0.4) },
    positioning: Q.cotScore(usdRows),
    crowd: Q.crowdScore(d.mfb?.EURUSD ? { ...d.mfb.EURUSD, longPercentage: 100 - +d.mfb.EURUSD.longPercentage, avgLongPrice: d.mfb.EURUSD.avgShortPrice, avgShortPrice: d.mfb.EURUSD.avgLongPrice } : null), // EURUSD-Longs = USD-Shorts (Entry-Preise sind EURUSD-Kurse)
  };
  const dxyOut = horizonsFor(dxyParts, null);

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
  const infl = Q.clamp(surprise.inflationImpulse / 2), grow = Q.clamp(surprise.growthImpulse / 2);
  const goldMacro = Q.clamp(-infl * 0.5 - rates.score * 0.5 - grow * 0.2);
  const nasMacro  = Q.clamp(-infl * 0.5 - rates.score * 0.3 + grow * 0.5 - (vixNow > 25 ? 0.5 : 0));
  const btcMacro  = Q.clamp(-infl * 0.4 - rates.score * 0.4 + grow * 0.3);

  const gold = build('GOLD', d.gold.closes, d.cot.GOLD?.rows, null, Q.crowdScore(d.mfb?.XAUUSD, d.gold.closes?.at(-1)), goldMacro, -1);
  const nas  = build('NAS100', d.nas.closes, d.cot.NAS?.rows, Q.structureNas(d.gex, vixNow), null, nasMacro, -0.5);
  const btc  = build('BTC', d.btc.closes, d.cot.BTC?.rows, Q.structureBtc(d.deribit, d.cg, d.btc.closes?.at(-1)), null, btcMacro, -0.7);

  // ---- Szenarien für die nächsten ~5 Handelstage ----
  const eventRisk = eventRiskFromCalendar(d.ff?.events || []);
  gold.scenarios = buildScenarios(gold, d.gold.closes, { eventRisk, label: 'Gold' });
  nas.scenarios  = buildScenarios(nas,  d.nas.closes,  { eventRisk, label: 'NAS100' });
  btc.scenarios  = buildScenarios(btc,  d.btc.closes,  { eventRisk: eventRisk * 0.6, label: 'Bitcoin' }); // BTC reagiert schwächer auf US-Makro
  // DXY: keine Retail-Level übergeben – die sind EURUSD-Kurse und würden als DXY-Support fehlinterpretiert
  const dxyAsset = { horizons: dxyOut, components: { ...dxyParts, crowd: { ...dxyParts.crowd, trapped: null, levels: null } }, levels: null, regime: null };
  const dxyScen = buildScenarios(dxyAsset, d.dxy.closes, { eventRisk, label: 'DXY' });

  return {
    generatedAt: new Date().toISOString(),
    dxy: { horizons: dxyOut, components: dxyParts, surprise, rates, vix: vixNow, scenarios: dxyScen },
    eventRisk,
    assets: { GOLD: gold, NAS100: nas, BTC: btc },
    dataHealth: Object.fromEntries(Object.entries(d.sources).map(([k, v]) => [k, { stale: !!v?.stale, error: v?.error ?? null, fetchedAt: v?.fetchedAt ?? null }])),
    disclaimer: 'Beobachtung, keine Anlageberatung. Positionierungsdaten (COT) haben 3 Tage Verzögerung.',
  };
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
  const sc = v => v?.scenarios ? { price: v.scenarios.price, base: v.scenarios.base, p: Object.fromEntries(v.scenarios.scenarios.map(s => [s.name, s.p])), support: v.scenarios.support, resistance: v.scenarios.resistance } : null;
  const row = { t: result.generatedAt, eventRisk: result.eventRisk, dxy: { ...result.dxy.horizons, scen: sc(result.dxy) },
    ...Object.fromEntries(Object.entries(result.assets).map(([k, v]) => [k, { ...v.horizons, scen: sc(v) }])) };
  try { await appendFile(path, JSON.stringify(row) + '\n'); } catch (e) { console.warn('bias log failed', e.message); }
}

export function registerBiasRoutes(app) {
  let last = null, lastT = 0;
  const get = async (fresh = false) => { if (fresh || !last || Date.now() - lastT > 15 * 60e3) { last = await computeBias(); lastT = Date.now(); logBias(last); } return last; };
  // ?fresh=1 umgeht den 15-Minuten-Cache (nur zum Testen; Quellen-Caches in sources.js bleiben aktiv)
  app.get('/bias/v2', async (req, res) => { try { res.json(await get(req.query.fresh === '1')); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get('/bias/v2/:asset', async (req, res) => {
    try { const r = await get(); const a = req.params.asset.toUpperCase();
      if (a === 'DXY') return res.json(r.dxy); const x = r.assets[a]; if (!x) return res.status(404).json({ error: 'asset unbekannt' }); res.json(x); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
}
