// bias-engine/scoring.js — reine Rechenlogik, keine Netzwerkzugriffe. Alle Scores in [-2, +2].

export const clamp = (x, lo = -2, hi = 2) => Math.max(lo, Math.min(hi, x));
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))) || 1e-9; };
const sma = (a, n) => a.length >= n ? mean(a.slice(-n)) : null;
export const pctRank = (arr, v) => arr.length ? arr.filter(x => x <= v).length / arr.length : 0.5;

// ---------- 1) TREND / MOMENTUM (stärkster Wochen-/Monatsprädiktor) ----------
export function trendScore(closes) {
  if (!closes || closes.length < 60) return { score: 0, detail: 'zu wenig Daten' };
  const p = closes.at(-1);
  const r = (n) => closes.length > n ? p / closes.at(-1 - n) - 1 : 0;
  const s50 = sma(closes, 50), s200 = sma(closes, 200), s20 = sma(closes, 20);
  // realisierte Vola (20d) zum Normalisieren der Returns
  const rets = closes.slice(-61).map((c, i, a) => i ? Math.log(c / a[i - 1]) : null).filter(Boolean);
  const vol20 = std(rets.slice(-20)) * Math.sqrt(252);
  const z = (ret, days) => ret / (vol20 * Math.sqrt(days / 252) || 1e-9); // Return in Vola-Einheiten
  let s = 0;
  s += clamp(z(r(21), 21), -1, 1);          // 1M
  s += clamp(z(r(63), 63), -1, 1) * 0.75;   // 3M
  s += p > s50 ? 0.5 : -0.5;
  s += s200 ? (p > s200 ? 0.5 : -0.5) : 0;
  s += s20 && s50 ? (s20 > s50 ? 0.25 : -0.25) : 0;
  return { score: clamp(s / 1.5), ret1m: r(21), ret3m: r(63), aboveSma50: p > s50, aboveSma200: s200 ? p > s200 : null, vol20 };
}

// ---------- 2) MAKRO-ÜBERRASCHUNGS-MOMENTUM (CESI-Prinzip) ----------
// Jedes Event: z = (actual - forecast) / std(hist. Überraschungen des gleichen Codes)
// sign: +1 = Überraschung nach oben ist USD-bullish (hawkish), -1 = USD-bearish
// weight: Marktrelevanz. Abklingen mit Halbwertszeit (Tage).
export const EVENT_META = {
  CPI_YOY:      { sign: +1, w: 1.0, inflation: true },
  CORE_CPI_YOY: { sign: +1, w: 1.2, inflation: true },
  CPI_MOM:      { sign: +1, w: 0.8, inflation: true },
  CORE_CPI_MOM: { sign: +1, w: 1.2, inflation: true },
  CORE_PCE_YOY: { sign: +1, w: 1.0, inflation: true },
  PPI_MOM:      { sign: +1, w: 0.4, inflation: true },
  NFP:          { sign: +1, w: 1.2, growth: true },
  UNEMPLOYMENT: { sign: -1, w: 0.8, growth: true },   // höhere Arbeitslosigkeit = dovish
  AHE_MOM:      { sign: +1, w: 0.6, inflation: true },
  ISM_MFG:      { sign: +1, w: 0.6, growth: true },
  ISM_SERV:     { sign: +1, w: 0.7, growth: true },
  RETAIL_MOM:   { sign: +1, w: 0.6, growth: true },
  GDP:          { sign: +1, w: 0.7, growth: true },
  CLAIMS:       { sign: -1, w: 0.3, growth: true },   // höhere Claims = schwächer
  JOLTS:        { sign: +1, w: 0.4, growth: true },
};
export function surpriseIndex(events, { asOf = new Date(), halfLifeDays = 10, lookbackDays = 45 } = {}) {
  const byCode = {};
  for (const e of events) { if (EVENT_META[e.code] && isFinite(e.actual) && isFinite(e.forecast)) (byCode[e.code] ??= []).push(e); }
  let usd = 0, infl = 0, growth = 0, wsum = 0; const contributions = [];
  for (const [code, list] of Object.entries(byCode)) {
    const hist = list.map(e => e.actual - e.forecast);
    const sd = hist.length >= 6 ? std(hist) : null;
    for (const e of list) {
      const age = (asOf - new Date(e.date)) / 864e5;
      if (age < 0 || age > lookbackDays) continue;
      const meta = EVENT_META[code];
      // ohne Historie: grobe Normierung über 10% des Forecast-Betrags (nur Notlösung)
      const z = clamp((e.actual - e.forecast) / (sd ?? Math.max(Math.abs(e.forecast) * 0.1, 1e-6)), -3, 3);
      const decay = Math.pow(0.5, age / halfLifeDays);
      const c = meta.sign * z * meta.w * decay;
      usd += c; wsum += meta.w * decay;
      if (meta.inflation) infl += c; if (meta.growth) growth += c;
      contributions.push({ date: e.date, code, actual: e.actual, forecast: e.forecast, z: +z.toFixed(2), usdImpulse: +c.toFixed(2) });
    }
  }
  const norm = wsum ? usd / wsum : 0;             // ≈ gewichtete mittlere z-Überraschung
  return { score: clamp(norm * 1.5), inflationImpulse: +infl.toFixed(2), growthImpulse: +growth.toFixed(2),
    contributions: contributions.sort((a, b) => b.date.localeCompare(a.date)) };
}

// ---------- 3) ZINSERWARTUNG ----------
export function ratesScore({ dgs2, dfii10, dgs10 }) {
  const d = (obs, n) => obs?.length > n ? obs.at(-1).v - obs.at(-1 - n).v : 0;
  const s = clamp(d(dgs2, 20) * 4) * 0.5 + clamp(d(dgs2, 5) * 8) * 0.25 + clamp(d(dfii10, 20) * 4) * 0.25;
  return { score: clamp(s), dgs2_20d: +d(dgs2, 20).toFixed(3), dgs2_5d: +d(dgs2, 5).toFixed(3), real10y_20d: +d(dfii10, 20).toFixed(3),
    curve: dgs10?.length && dgs2?.length ? +(dgs10.at(-1).v - dgs2.at(-1).v).toFixed(2) : null };
}

// ---------- 4) POSITIONING (COT) ----------
// Liefert Richtung aus der Wochenveränderung, Dämpfer aus dem Perzentil.
export function cotScore(rows) {
  if (!rows?.length) return { score: 0, damp: 1, detail: 'kein COT' };
  const nets = rows.map(r => r.net); const cur = nets.at(-1);
  const pct = pctRank(nets, cur);
  const wk = rows.length > 1 ? cur - nets.at(-2) : 0;
  const chgZ = clamp(wk / std(nets.slice(-52).map((n, i, a) => i ? n - a[i - 1] : 0).filter((_, i) => i)), -2, 2);
  const extreme = pct > 0.9 || pct < 0.1;
  return { score: clamp(chgZ * 0.6 + (pct - 0.5) * 2 * 0.4), percentile3y: +pct.toFixed(2), net: cur, weeklyChange: wk,
    damp: extreme ? 0.6 : 1, extreme, reportDate: rows.at(-1).date };
}
export function syntheticUsdCot(cotMap) { // -(Summe der Fremdwährungs-Nets) + USDX-Net
  const fx = ['EUR', 'JPY', 'GBP', 'CHF', 'CAD', 'AUD'];
  const n = cotMap.EUR?.rows?.length; if (!n) return null;
  const rows = [];
  for (let i = 0; i < n; i++) {
    let net = 0; for (const k of fx) net -= cotMap[k]?.rows?.[i]?.net ?? 0;
    net += cotMap.USDX?.rows?.[i]?.net ?? 0;
    rows.push({ date: cotMap.EUR.rows[i].date, net });
  }
  return rows;
}

// ---------- 5) STRUKTUR (nur Tages-/Wochenhorizont) ----------
export function structureBtc(deribit, cg, spot) {
  if (!deribit?.maxPain) return { score: 0, regime: 'unknown' };
  let s = 0;
  if (spot && deribit.maxPain) s += clamp((deribit.maxPain / spot - 1) * 20, -1, 1);   // Magnet zum Max Pain
  s += clamp((1 - deribit.putCallRatio) * 1, -0.5, 0.5);
  if (cg?.fundingRate != null) s -= clamp(cg.fundingRate * 2000, -0.5, 0.5);          // überhitztes Funding = contrarian
  if (cg?.longShortRatio != null) s -= clamp((cg.longShortRatio - 1) * 1.5, -0.5, 0.5);
  return { score: clamp(s), levels: { callWall: deribit.callWall, putWall: deribit.putWall, maxPain: deribit.maxPain }, funding: cg?.fundingRate ?? null, longShort: cg?.longShortRatio ?? null };
}
export function structureNas(gex, vix) {
  if (!gex?.netGex && gex?.netGex !== 0) return { score: 0, regime: vix > 25 ? 'trend_high_vol' : 'unknown' };
  const regime = gex.netGex > 0 ? 'range_positive_gamma' : 'trend_negative_gamma';
  return { score: 0, regime, levels: { callWall: gex.callWall, putWall: gex.putWall, gammaFlip: gex.gammaFlip }, netGex: gex.netGex };
}
export function crowdScore(sym) { // Myfxbook: {longPercentage, shortPercentage, avgLongPrice, avgShortPrice}
  if (!sym) return { score: 0 };
  const lp = +sym.longPercentage;
  return { score: clamp((50 - lp) / 15), longPct: lp, avgLongEntry: +sym.avgLongPrice, avgShortEntry: +sym.avgShortPrice };
}

// ---------- KOMBINATION PRO HORIZONT ----------
// Gewichte je Horizont: [trend, macro(surprise+rates), positioning, structure, crowd, dxyLink]
export const WEIGHTS = {
  daily:   { trend: 0.15, macro: 0.25, positioning: 0.10, structure: 0.30, crowd: 0.10, dxy: 0.10 },
  weekly:  { trend: 0.30, macro: 0.30, positioning: 0.20, structure: 0.10, crowd: 0.05, dxy: 0.05 },
  monthly: { trend: 0.40, macro: 0.35, positioning: 0.15, structure: 0.00, crowd: 0.00, dxy: 0.10 },
};
export function combine(parts, horizon, cotDamp = 1) {
  const w = WEIGHTS[horizon];
  let s = 0, used = 0;
  for (const [k, wk] of Object.entries(w)) { const v = parts[k]; if (v == null || !wk) continue; s += wk * v; used += wk; }
  const raw = used ? s / used : 0;
  const score = clamp(raw * cotDamp);
  return { score: +score.toFixed(2), label: score > 1 ? 'bullish' : score > 0.3 ? 'leicht bullish' : score < -1 ? 'bearish' : score < -0.3 ? 'leicht bearish' : 'neutral', weights: w };
}
