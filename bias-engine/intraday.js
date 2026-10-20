// bias-engine/intraday.js — Schicht 1+2: was die Tages-Engine bisher nicht gesehen hat.
//   • Live-Zinsen (^TNX/^FVX/^IRX, stündlich) statt FRED mit 1 Tag Verzögerung
//   • Öl (CL=F) als Inflations-/Yield-Treiber
//   • Fed-Funds-Futures (ZQ) → implizierter Leitzins pro Kontrakt + Hike/Cut-Odds vs. aktueller Effective Rate
//   • Mega-Cap-Earnings als Event-Risiko für NAS100
//   • Intraday-Struktur pro Asset: Vortages-High/Low/Close, Wochen-Open, ATR(14), Overnight-Range, Lage in der Range
//   • 10-Tage-Vorschau High-Impact-USD-Events (FF diese + nächste Woche)
// Alles reine Rechenlogik + die Fetcher aus sources.js. Jede Quelle darf ausfallen → Teilscore 0, Health-Flag gesetzt.
import * as S from './sources.js';
import { clamp } from './scoring.js';

const r = (x, d = 2) => x == null || !isFinite(x) ? null : +(+x).toFixed(d);
// Fehler nicht verschlucken: ein gescheiterter Fetch kommt als {failed:true, error} zurück, damit health die Ursache zeigt
const safe = async (p) => { try { const v = await p; return v?.stale && v?.error && !v?.bars && !v?.events && !v?.obs ? { failed: true, error: v.error } : v; } catch (e) { return { failed: true, error: String(e.message || e) }; } };

// ---------- Live-Zinsen ----------
// Yahoo liefert ^TNX/^FVX in Prozent (5.14). Falls jemals ×10 (CBOE-Konvention 51.4) → normalisieren.
const pctNorm = v => v == null ? null : v > 25 ? v / 10 : v;
export async function ratesLive() {
  const [tnx, fvx, irx] = await Promise.all([S.yahooChart('^TNX', '1h', '5d'), S.yahooChart('^FVX', '1h', '5d'), S.yahooChart('^IRX', '1h', '5d')].map(safe));
  // Yahoos meta.chartPreviousClose ist bei Intraday-Charts der Schluss VOR dem 5-Tage-Fenster, nicht der Vortag.
  // Deshalb Tagesschlüsse aus den Stundenkerzen gruppieren (Datum der Börse ≈ UTC-Datum des letzten Bars des Tages).
  const pick = (c) => {
    if (!c?.bars?.length) return null;
    const byDay = new Map(); for (const b of c.bars) byDay.set(new Date(b.t).toISOString().slice(0, 10), b.c); // letzte Kerze je Tag gewinnt
    const closes = [...byDay.values()].map(pctNorm);
    const last = pctNorm(c.last ?? closes.at(-1)); const prev = closes.length >= 2 ? closes.at(-2) : last; const first = closes[0];
    return { last: r(last, 3), chgToday: r(last - prev, 3), chg5d: r(last - first, 3), sessionDate: [...byDay.keys()].at(-1), asOf: c.meta?.marketTime ? new Date(c.meta.marketTime).toISOString() : null };
  };
  const t = pick(tnx), f = pick(fvx), i = pick(irx);
  // Score [-2,2]: +7 bp am letzten Handelstag im 10Y ≈ +1, +17 bp über 5 Tage ≈ +1. Hawkish = positiv (USD-bullish, Gold/NAS-negativ).
  let s = 0, n = 0;
  if (t) { s += clamp(t.chgToday * 15, -1.5, 1.5) * 0.5 + clamp(t.chg5d * 6, -1.5, 1.5) * 0.5; n++; }
  if (f) { s += clamp(f.chgToday * 15, -1.5, 1.5) * 0.5 + clamp(f.chg5d * 6, -1.5, 1.5) * 0.5; n++; }
  const curve = t && f ? r(t.last - f.last, 3) : null;
  return { score: r(n ? clamp(s / n * 1.3) : 0), us10y: t, us5y: f, us3m: i, curve10y5y: curve, ok: n > 0 };
}

// ---------- Öl ----------
export async function oilImpulse() {
  const c = await safe(S.yahooChart('CL=F', '1d', '3mo'));
  if (!c?.bars?.length) return { score: 0, ok: false };
  const cl = c.bars.map(b => b.c); const px = c.last ?? cl.at(-1);
  const chg = n => cl.length > n ? px / cl.at(-1 - n) - 1 : 0;
  const c1 = chg(1), c5 = chg(5), c20 = chg(20);
  // +10 % in 5 Tagen ≈ +1, +20 % in 20 Tagen ≈ +1. Positiv = Inflationsimpuls.
  const score = clamp(clamp(c5 * 10, -1.5, 1.5) * 0.6 + clamp(c20 * 5, -1.5, 1.5) * 0.4);
  return { score: r(score), price: r(px, 2), chg1d: r(c1 * 100, 2), chg5d: r(c5 * 100, 2), chg20d: r(c20 * 100, 2), ok: true,
    note: px >= 90 ? 'Öl ≥ 90 $: dominanter Inflations-/Yield-Treiber' : null };
}

// ---------- Fed-Funds-Futures ----------
// Kontrakt-Symbol bei Yahoo: ZQ<MonatsCode><YY>.CBT (F G H J K M N Q U V X Z). Implizierter Satz = 100 − Preis.
const MC = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'];
export async function fedFunds(fredFn = S.fred) {
  const now = new Date(); const syms = [];
  for (let k = 0; k < 5; k++) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1)); syms.push({ month: d.toISOString().slice(0, 7), sym: `ZQ${MC[d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(2)}.CBT` }); }
  const [charts, dff] = await Promise.all([Promise.all(syms.map(s => safe(S.yahooChart(s.sym, '1d', '1mo')))), safe(fredFn('DFF', 10))]);
  const eff = dff?.obs?.at(-1)?.v ?? null;
  const contracts = syms.map((s, i) => { const c = charts[i]; if (!c?.last) return null; const implied = 100 - c.last; return { month: s.month, symbol: s.sym, implied: r(implied, 3), vsEffective: eff != null ? r((implied - eff) * 100, 1) : null }; }).filter(Boolean);
  if (!contracts.length) return { ok: false, effective: eff, contracts: [], note: 'ZQ-Kontrakte nicht ladbar (Yahoo-Symbolformat prüfen: ZQX26.CBT)' };
  // Odds für ±25 bp am nächsten Meeting ≈ (implied des Folgemonats − effective)/0.25. Grob, aber richtungssicher.
  const next = contracts.find(c => c.month > now.toISOString().slice(0, 7)) ?? contracts.at(-1);
  const bp = next?.vsEffective ?? null;
  const path = bp == null ? null : bp > 12.5 ? `Hike eingepreist (${bp} bp)` : bp < -12.5 ? `Cut eingepreist (${bp} bp)` : `Pause (${bp} bp)`;
  // Score: eingepreiste +25 bp über 3 Monate ≈ +1 (hawkish). Dämpfer, weil die Zinsscores aus FRED/Live das meiste schon tragen.
  const far = contracts.at(-1)?.vsEffective ?? bp ?? 0;
  return { ok: true, effective: eff, nextMeetingPricedBp: bp, path, contracts, score: r(clamp(far / 25)) };
}

// ---------- Mega-Cap-Earnings → Event-Risiko NAS100 ----------
const MEGA = { NVDA: 1, AAPL: 1, MSFT: 1, AMZN: 1, GOOGL: 1, GOOG: 1, META: 1, TSLA: 0.9, AVGO: 0.8, NFLX: 0.6, AMD: 0.6, ORCL: 0.5, COST: 0.3, ASML: 0.5, TSM: 0.6 };
export async function earningsRisk(now = Date.now()) {
  const iso = d => new Date(d).toISOString().slice(0, 10);
  const e = await safe(S.finnhubEarnings(iso(now), iso(now + 10 * 864e5)));
  if (!e?.events) return { ok: false, risk5d: 0, upcoming: [] };
  const up = e.events.filter(x => MEGA[x.symbol]).map(x => {
    const t = Date.parse(x.date + 'T' + (x.hour === 'bmo' ? '12:00:00Z' : '21:00:00Z'));
    return { symbol: x.symbol, date: x.date, hour: x.hour, weight: MEGA[x.symbol], daysTo: r((t - now) / 864e5, 1) };
  }).filter(x => x.daysTo >= -0.2).sort((a, b) => a.daysTo - b.daysTo);
  let risk = 0; for (const x of up) if (x.daysTo <= 5) risk = Math.max(risk, 0.7 * x.weight * (1 - Math.max(0, x.daysTo) / 5));
  return { ok: true, risk5d: r(clamp(risk, 0, 1)), upcoming: up };
}

// ---------- Intraday-Struktur aus Tages- + Stundenkerzen ----------
export function structureFromBars(daily, hourly, now = Date.now()) {
  if (!daily?.bars || daily.bars.length < 20) return null;
  const B = daily.bars; const px = daily.last ?? B.at(-1).c;
  // Letzte Kerze kann der laufende Tag sein → "Vortag" = letzte Kerze, die vor heute (UTC) schloss
  const todayUTC = new Date(now).toISOString().slice(0, 10);
  const closed = B.filter(b => new Date(b.t).toISOString().slice(0, 10) < todayUTC);
  const prev = closed.at(-1) ?? B.at(-2); const hist = closed.length >= 15 ? closed : B.slice(0, -1);
  // ATR(14) auf Basis der geschlossenen Kerzen
  const tr = hist.slice(-15).map((b, i, a) => i ? Math.max(b.h - b.l, Math.abs(b.h - a[i - 1].c), Math.abs(b.l - a[i - 1].c)) : b.h - b.l);
  const atr = tr.slice(-14).reduce((s, x) => s + x, 0) / Math.min(14, tr.length);
  // Wochen-Open: erste Kerze der laufenden ISO-Woche (Mo)
  const d = new Date(now); const dow = (d.getUTCDay() + 6) % 7; const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
  const wk = B.filter(b => b.t >= monday - 864e5 * 0.5); const weekOpen = wk[0]?.o ?? prev.c;
  const hi20 = Math.max(...hist.slice(-20).map(b => b.h)), lo20 = Math.min(...hist.slice(-20).map(b => b.l));
  // Overnight/Session-Range aus Stundenkerzen des laufenden UTC-Tages
  let onHi = null, onLo = null, todayRange = null;
  if (hourly?.bars?.length) { const tb = hourly.bars.filter(b => b.t >= Date.parse(todayUTC + 'T00:00:00Z')); if (tb.length) { onHi = Math.max(...tb.map(b => b.h)); onLo = Math.min(...tb.map(b => b.l)); todayRange = onHi - onLo; } }
  const posInPrev = prev.h > prev.l ? (px - prev.l) / (prev.h - prev.l) : 0.5; // >1 = über PDH, <0 = unter PDL
  const rangeUsed = todayRange != null && atr ? todayRange / atr : null;
  let s = 0;
  if (px > prev.h) s += 0.6; else if (px < prev.l) s -= 0.6; else s += (posInPrev - 0.5) * 0.6;
  s += px > weekOpen ? 0.3 : -0.3;
  s += px > prev.c ? 0.2 : -0.2;
  if (px > hi20) s += 0.4; if (px < lo20) s -= 0.4;
  // Bereits >80 % der ATR verbraucht → Fortsetzung unwahrscheinlicher, Score dämpfen
  const damp = rangeUsed != null && rangeUsed > 0.8 ? 0.6 : 1;
  const regime = px > prev.h || px < prev.l ? 'expansion' : (prev.h - prev.l) < atr * 0.7 ? 'kompression' : 'innerhalb Vortagesrange';
  const dec = px < 10 ? 4 : px < 1000 ? 2 : 0; const R = v => r(v, dec);
  return { score: r(clamp(s * damp)), regime, price: R(px), prevHigh: R(prev.h), prevLow: R(prev.l), prevClose: R(prev.c), weekOpen: R(weekOpen),
    atr14: R(atr), atrHi: R(prev.c + atr), atrLo: R(prev.c - atr), hi20: R(hi20), lo20: R(lo20),
    sessionHigh: R(onHi), sessionLow: R(onLo), atrUsedPct: rangeUsed != null ? r(rangeUsed * 100, 0) : null, posInPrevRangePct: r(posInPrev * 100, 0),
    levels: { prevHigh: R(prev.h), prevLow: R(prev.l), weekOpen: R(weekOpen), atrHi: R(prev.c + atr), atrLo: R(prev.c - atr) } };
}

// ---------- 10-Tage-Vorschau High-Impact-USD ----------
// FOMC-Termine fest hinterlegt (Entscheidung 19:00 UTC / 20:00 Berlin), damit die Vorschau auch ohne FF-Nächste-Woche nie das FOMC verliert.
export const FOMC_DATES = ['2026-10-28', '2026-12-09', '2027-01-27', '2027-03-17'];
const HEAVY = /cpi|non-farm|nfp|fomc|federal funds|pce|unemployment rate|gdp|ism/i;
export function upcomingUsd(thisWeek = [], nextWeek = [], now = Date.now()) {
  const seen = new Set(); const out = []; let fomcSeen = false;
  for (const e of [...thisWeek, ...nextWeek]) {
    if (e.country !== 'USD' || e.impact !== 'High' || !e.timestamp) continue;
    const k = e.title + e.timestamp; if (seen.has(k)) continue; seen.add(k);
    const daysTo = (e.timestamp * 1000 - now) / 864e5; if (daysTo < -0.2 || daysTo > 10) continue;
    if (/fomc|federal funds/i.test(e.title || '')) fomcSeen = true;
    out.push({ title: e.title, at: new Date(e.timestamp * 1000).toISOString(), daysTo: r(daysTo, 1), heavy: HEAVY.test(e.title || '') });
  }
  if (!fomcSeen) for (const d of FOMC_DATES) {
    const t = Date.parse(d + 'T19:00:00Z'); const daysTo = (t - now) / 864e5;
    if (daysTo >= -0.2 && daysTo <= 10) out.push({ title: 'FOMC Statement / Federal Funds Rate', at: new Date(t).toISOString(), daysTo: r(daysTo, 1), heavy: true, source: 'fest hinterlegt' });
  }
  return out.sort((a, b) => a.daysTo - b.daysTo);
}

// ---------- Gesamtpaket ----------
export async function computeIntraday({ assets = { GOLD: 'GC=F', NAS100: 'NQ=F', BTC: 'BTC-USD', DXY: 'DX-Y.NYB' }, ff = null, ffNext = null, fredFn = S.fred, now = Date.now() } = {}) {
  const keys = Object.keys(assets);
  const [rates, oil, fed, earn, ffN, ffT, ...charts] = await Promise.all([
    ratesLive(), oilImpulse(), fedFunds(fredFn), earningsRisk(now), ffNext ? Promise.resolve(ffNext) : safe(S.ffNextWeek()),
    ff ? Promise.resolve(ff) : safe(S.ffWeek()), // standalone (/bias/intraday): Wochenkalender selbst holen (RAM-Cache, kein Extra-Request)
    ...keys.flatMap(k => [safe(S.yahooChart(assets[k], '1d', '3mo')), safe(S.yahooChart(assets[k], '1h', '5d'))]),
  ]);
  const structure = {}; keys.forEach((k, i) => { structure[k] = structureFromBars(charts[2 * i], charts[2 * i + 1], now); });
  const upcoming = upcomingUsd(ffT?.events || [], ffN?.events || [], now);
  const health = { yahoo_rates: { stale: !rates.ok, error: rates.ok ? null : '^TNX/^FVX nicht ladbar', fetchedAt: rates.ok ? new Date().toISOString() : null },
    yahoo_oil: { stale: !oil.ok, error: oil.ok ? null : 'CL=F nicht ladbar', fetchedAt: oil.ok ? new Date().toISOString() : null },
    yahoo_fedfunds: { stale: !fed.ok, error: fed.ok ? null : fed.note, fetchedAt: fed.ok ? new Date().toISOString() : null },
    finnhub_earnings: { stale: !earn.ok, error: earn.ok ? null : 'Finnhub Earnings nicht ladbar', fetchedAt: earn.ok ? new Date().toISOString() : null },
    forexfactory_next: { stale: !ffN?.events, error: ffN?.events ? null : (ffN?.error || 'nextweek nicht ladbar'), fetchedAt: ffN?.fetchedAt ?? null, note: ffN?.events ? null : 'FOMC-Termine aus fester Liste' } };
  return { generatedAt: new Date(now).toISOString(), rates, oil, fedFunds: fed, earnings: earn, structure, upcoming, ffNextEvents: ffN?.events || [], health };
}
