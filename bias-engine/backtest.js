// bias-engine/backtest.js — Rückrechnung des Tagesszenarios über die letzten N Handelstage.
// Für jeden Tag: Lage zur Entscheidungszeit (Standard 09:00 UTC = 11:00 Berlin) aus Stundenkerzen rekonstruieren,
// buildTodayScenario laufen lassen, gegen den realen Rest des Tages prüfen. Ergebnis: Trefferquote Basisszenario,
// Brier-Score der 3-Wege-Wahrscheinlichkeiten, Richtungstreffer, alles gegen naive Baselines.
//
// EHRLICHE GRENZEN: (1) Der Tages-Score aus Makro/COT/Crowd ist historisch nicht verfügbar → Proxy = Trend-Score × 0,5.
// Getestet wird also Struktur + Szenario-Logik, nicht die komplette Engine. (2) Events (Earnings/FF) fehlen historisch →
// evtSoon = 0. (3) Yahoo-Stundenkerzen reichen ~2 Jahre zurück; Tagesgrenzen sind UTC-Tage, nicht Börsentage.
import * as S from './sources.js';
import * as Q from './scoring.js';
import { structureFromBars } from './intraday.js';
import { buildTodayScenario } from './scenarios.js';

const r = (x, d = 2) => x == null || !isFinite(x) ? null : +(+x).toFixed(d);
const ASSETS = { GOLD: 'GC=F', NAS100: 'NQ=F', BTC: 'BTC-USD', DXY: 'DX-Y.NYB' };

function groupByUtcDay(bars) {
  const m = new Map();
  for (const b of bars) { const k = new Date(b.t).toISOString().slice(0, 10); const d = m.get(k); if (!d) m.set(k, { t: Date.parse(k), o: b.o, h: b.h, l: b.l, c: b.c, bars: [b] }); else { d.h = Math.max(d.h, b.h); d.l = Math.min(d.l, b.l); d.c = b.c; d.bars.push(b); } }
  return [...m.values()].sort((a, b) => a.t - b.t);
}

// Welches Szenario ist eingetreten? Konsistent mit den Definitionen in buildTodayScenario.
// Alle drei Fälle: Schluss über PDH = up, unter PDL = dn, dazwischen = Range/Rückkehr. Gleichwertige Bänder.
function realized(t, close) { return close > t.prevHigh ? 'up' : close < t.prevLow ? 'dn' : 'rg'; }
const cls = n => /oben/.test(n) ? 'up' : /unten/.test(n) ? 'dn' : 'rg';

// Volatilitätsgleicher Random Walk vom Entscheidungspreis bis Tagesende: welche Klassenverteilung erzeugt reiner Zufall?
// Das ist die ehrliche Baseline – die Bänder (über PDH / unter PDL / dazwischen) treffen auch ohne Information oft.
let _seed = 42; const rnd = () => { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; };
const gauss = () => { const u = Math.max(rnd(), 1e-12), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function randomWalkProbs(px, t, steps, sigmaH, paths = 400) {
  const c = { up: 0, dn: 0, rg: 0 };
  for (let k = 0; k < paths; k++) { let lp = Math.log(px); for (let s = 0; s < steps; s++) lp += gauss() * sigmaH; c[realized(t, Math.exp(lp))]++; }
  return { up: c.up / paths, dn: c.dn / paths, rg: c.rg / paths };
}
function hourlySigma(bars, n = 20 * 24) { const b = bars.slice(-n); const rs = []; for (let i = 1; i < b.length; i++) rs.push(Math.log(b[i].c / b[i - 1].c)); const m = rs.reduce((a, x) => a + x, 0) / rs.length; return Math.sqrt(rs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, rs.length - 1)) || 1e-6; }

export async function backtestAsset(key, { days = 120, hourUtc = 9, fetchChart = S.yahooChart } = {}) {
  const sym = ASSETS[key]; if (!sym) throw new Error('asset unbekannt');
  const hc = await fetchChart(sym, '1h', days > 300 ? '2y' : '1y');
  if (!hc?.bars?.length) throw new Error(`keine Stundenkerzen für ${sym}: ${hc?.error || ''}`);
  const daysAll = groupByUtcDay(hc.bars);
  const rows = []; const start = Math.max(20, daysAll.length - days);
  for (let i = start; i < daysAll.length - 1; i++) { // letzter Tag ist unvollständig → auslassen
    const day = daysAll[i]; const cut = day.t + hourUtc * 3600e3;
    const before = day.bars.filter(b => b.t < cut); if (before.length < 2) continue; // Wochenende/Feiertag
    const after = day.bars.filter(b => b.t >= cut); if (!after.length) continue;
    const px = before.at(-1).c;
    const dailyBars = daysAll.slice(0, i + 1).map(d => ({ t: d.t, o: d.o, h: d.h, l: d.l, c: d.c }));
    const ohlc = structureFromBars({ bars: dailyBars, last: px }, { bars: before }, cut);
    if (!ohlc) continue;
    const closes = daysAll.slice(0, i).map(d => d.c);
    const trend = Q.trendScore(closes); const dayScore = Q.clamp(trend.score * 0.5);
    const asset = { asset: key, horizons: { daily: { score: dayScore } }, components: { trend } };
    const t = buildTodayScenario(asset, ohlc, { label: key, asset: key });
    if (!t) continue;
    const close = after.at(-1).c, hi = Math.max(...after.map(b => b.h)), lo = Math.min(...after.map(b => b.l));
    const real = realized(t, close);
    const p = Object.fromEntries(t.scenarios.map(s => [cls(s.name), s.p / 100]));
    const baseCls = cls(t.base);
    // Richtungs-Lean: up vs dn ohne Range – hat die bevorzugte Seite bis Tagesschluss gewonnen?
    const lean = p.up > p.dn ? 'up' : p.dn > p.up ? 'dn' : null;
    const move = close - px; const leanHit = lean ? (lean === 'up' ? move > 0 : move < 0) : null;
    // Zielerreichung des Basisszenarios: Extremum hat die Zielzone mindestens zur Hälfte erreicht
    const base = t.scenarios[0]; const mid = (base.from + base.to) / 2;
    const targetHit = baseCls === 'up' ? hi >= Math.min(base.from, base.to) + Math.abs(base.to - base.from) * 0.5 : baseCls === 'dn' ? lo <= Math.max(base.from, base.to) - Math.abs(base.to - base.from) * 0.5 : (close >= base.from && close <= base.to);
    const brier = ['up', 'dn', 'rg'].reduce((s, k) => s + ((p[k] ?? 0) - (real === k ? 1 : 0)) ** 2, 0);
    const brierRange = ['up', 'dn', 'rg'].reduce((s, k) => s + ((k === 'rg' ? 1 : 0) - (real === k ? 1 : 0)) ** 2, 0); // Baseline "immer Range"
    const brierUni = ['up', 'dn', 'rg'].reduce((s, k) => s + (1 / 3 - (real === k ? 1 : 0)) ** 2, 0);          // Baseline 1/3
    // Random-Walk-Baseline: gleiche Vola, gleiche Restzeit, keine Information
    const allBars = daysAll.slice(Math.max(0, i - 25), i).flatMap(d => d.bars).concat(before);
    const pRW = randomWalkProbs(px, t, after.length, hourlySigma(allBars));
    const brierRW = ['up', 'dn', 'rg'].reduce((s, k) => s + (pRW[k] - (real === k ? 1 : 0)) ** 2, 0);
    const rwBase = Object.entries(pRW).sort((a, b) => b[1] - a[1])[0][0];
    rows.push({ date: new Date(day.t).toISOString().slice(0, 10), regime: ohlc.regime, price: r(px, 2), close: r(close, 2), movePct: r(move / px * 100, 2),
      atrUsedPct: ohlc.atrUsedPct, dayScore: r(dayScore), base: t.base, p: { up: r(p.up), dn: r(p.dn), rg: r(p.rg) }, realized: real, baseHit: baseCls === real, targetHit, lean, leanHit, brier: r(brier, 3), brierRange: r(brierRange, 3), brierUni: r(brierUni, 3), brierRW: r(brierRW, 3), rwBaseHit: rwBase === real, pRW: { up: r(pRW.up), dn: r(pRW.dn), rg: r(pRW.rg) }, mid: r(mid, 2) });
  }
  return summarize(key, rows, hourUtc);
}

function summarize(key, rows, hourUtc) {
  const n = rows.length; const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const pct = a => a.length ? r(a.filter(Boolean).length / a.length * 100, 1) : null;
  const byRegime = {};
  for (const x of rows) { const g = (byRegime[x.regime] ??= { n: 0, baseHit: [], rwBaseHit: [], leanHit: [], brier: [], brierRW: [] }); g.n++; g.baseHit.push(x.baseHit); g.rwBaseHit.push(x.rwBaseHit); if (x.leanHit != null) g.leanHit.push(x.leanHit); g.brier.push(x.brier); g.brierRW.push(x.brierRW); }
  for (const g of Object.values(byRegime)) { g.baseHitPct = pct(g.baseHit); g.rwBaseHitPct = pct(g.rwBaseHit); g.leanHitPct = pct(g.leanHit); g.brier = r(mean(g.brier), 3); g.brierRW = r(mean(g.brierRW), 3); delete g.baseHit; delete g.rwBaseHit; delete g.leanHit; }
  const byBase = {};
  for (const x of rows) { const g = (byBase[x.base] ??= { n: 0, hit: [], target: [] }); g.n++; g.hit.push(x.baseHit); g.target.push(x.targetHit); }
  for (const g of Object.values(byBase)) { g.hitPct = pct(g.hit); g.targetPct = pct(g.target); delete g.hit; delete g.target; }
  const realizedDist = { up: pct(rows.map(x => x.realized === 'up')), dn: pct(rows.map(x => x.realized === 'dn')), rg: pct(rows.map(x => x.realized === 'rg')) };
  // Kalibrierung: in Buckets der vorhergesagten Basis-Wahrscheinlichkeit, wie oft trat sie ein?
  const calib = {};
  for (const x of rows) { const pb = x.p[cls(x.base)]; const b = pb < 0.4 ? '<40' : pb < 0.5 ? '40-50' : pb < 0.6 ? '50-60' : '≥60'; const g = (calib[b] ??= { n: 0, hit: [], pMean: [] }); g.n++; g.hit.push(x.baseHit); g.pMean.push(pb); }
  for (const g of Object.values(calib)) { g.hitPct = pct(g.hit); g.pMeanPct = r(mean(g.pMean) * 100, 1); delete g.hit; delete g.pMean; }
  const brier = r(mean(rows.map(x => x.brier)), 3), brierRange = r(mean(rows.map(x => x.brierRange)), 3), brierUni = r(mean(rows.map(x => x.brierUni)), 3), brierRW = r(mean(rows.map(x => x.brierRW)), 3);
  const rwBaseHitPct = pct(rows.map(x => x.rwBaseHit));
  const leanRows = rows.filter(x => x.leanHit != null);
  const verdict = [];
  if (n < 40) verdict.push('Zu wenig Tage für eine belastbare Aussage.');
  const edge = r((brierRW - brier) / brierRW * 100, 1);
  verdict.push(brier < brierRW ? `Brier ${brier} gegen Random-Walk-Baseline ${brierRW} → ${edge} % besser als Zufall mit gleicher Vola.` : `Brier ${brier} ist NICHT besser als ein Random Walk mit gleicher Vola (${brierRW}) → die Wahrscheinlichkeiten tragen keine Information über die Bandstruktur hinaus.`);
  verdict.push(`Basis trifft ${pct(rows.map(x => x.baseHit))} %, der Random Walk hätte ${rwBaseHitPct} % getroffen.`);
  const lh = pct(leanRows.map(x => x.leanHit));
  verdict.push(lh != null ? `Richtungs-Lean trifft in ${lh} % der Tage (50 % = Münzwurf, n=${leanRows.length}).` : 'Kein Richtungs-Lean messbar.');
  return { asset: key, days: n, decisionTimeUtc: `${String(hourUtc).padStart(2, '0')}:00`, from: rows[0]?.date, to: rows.at(-1)?.date,
    baseHitPct: pct(rows.map(x => x.baseHit)), rwBaseHitPct, targetHitPct: pct(rows.map(x => x.targetHit)), leanHitPct: lh, brier, brierBaselineRandomWalk: brierRW, brierBaselineRange: brierRange, brierBaselineUniform: brierUni,
    realizedDist, byRegime, byBase, calibration: calib, verdict: verdict.join(' '),
    caveats: ['Tages-Score ist nur ein Trend-Proxy (Makro/COT/Crowd historisch nicht verfügbar).', 'Events (Earnings/Kalender) historisch nicht berücksichtigt.', 'UTC-Tage statt Börsentage; Entscheidungszeit fix.'],
    rows: rows.slice(-60) };
}

export async function backtestAll(opts) {
  const out = {}; for (const k of Object.keys(ASSETS)) { try { out[k] = await backtestAsset(k, opts); } catch (e) { out[k] = { error: e.message }; } } return out;
}

// Kompakte HTML-Ansicht, damit das Ergebnis im Browser ohne JSON-Lesen verständlich ist
export function backtestHtml(res) {
  const esc = s => String(s).replace(/</g, '&lt;');
  const card = (k, v) => v.error ? `<section><h2>${k}</h2><p class="bad">${esc(v.error)}</p></section>` : `<section><h2>${k} <small>${v.from} → ${v.to} · ${v.days} Tage · Entscheidung ${v.decisionTimeUtc} UTC</small></h2>
  <p class="verdict">${esc(v.verdict)}</p>
  <table><tr><th>Basis trifft</th><th>Random Walk hätte</th><th>Zielzone erreicht</th><th>Richtungs-Lean</th><th>Brier Modell</th><th>Brier Random Walk</th><th>Brier 1/3</th></tr>
  <tr><td>${v.baseHitPct} %</td><td>${v.rwBaseHitPct} %</td><td>${v.targetHitPct} %</td><td>${v.leanHitPct ?? '–'} %</td><td>${v.brier}</td><td>${v.brierBaselineRandomWalk}</td><td>${v.brierBaselineUniform}</td></tr></table>
  <h3>Nach Regime</h3><table><tr><th>Regime</th><th>n</th><th>Basis trifft</th><th>RW hätte</th><th>Lean trifft</th><th>Brier</th><th>Brier RW</th></tr>${Object.entries(v.byRegime).map(([g, x]) => `<tr><td>${esc(g)}</td><td>${x.n}</td><td>${x.baseHitPct} %</td><td>${x.rwBaseHitPct} %</td><td>${x.leanHitPct ?? '–'} %</td><td>${x.brier}</td><td>${x.brierRW}</td></tr>`).join('')}</table>
  <h3>Nach Basisszenario</h3><table><tr><th>Szenario</th><th>n</th><th>trifft</th><th>Ziel erreicht</th></tr>${Object.entries(v.byBase).map(([g, x]) => `<tr><td>${esc(g)}</td><td>${x.n}</td><td>${x.hitPct} %</td><td>${x.targetPct} %</td></tr>`).join('')}</table>
  <h3>Kalibrierung (vorhergesagt vs. eingetreten)</h3><table><tr><th>Bucket</th><th>n</th><th>Ø vorhergesagt</th><th>eingetreten</th></tr>${Object.entries(v.calibration).map(([g, x]) => `<tr><td>${g} %</td><td>${x.n}</td><td>${x.pMeanPct} %</td><td>${x.hitPct} %</td></tr>`).join('')}</table>
  <p class="muted">Realisiert: ↑ ${v.realizedDist.up} % · ↓ ${v.realizedDist.dn} % · Range ${v.realizedDist.rg} %</p>
  <details><summary>Letzte ${v.rows.length} Tage</summary><table><tr><th>Datum</th><th>Regime</th><th>Basis</th><th>p↑/p↓/pR</th><th>real</th><th>Δ %</th><th>Brier</th></tr>${v.rows.slice().reverse().map(x => `<tr class="${x.baseHit ? 'ok' : 'bad'}"><td>${x.date}</td><td>${esc(x.regime)}</td><td>${esc(x.base)}</td><td>${x.p.up}/${x.p.dn}/${x.p.rg}</td><td>${x.realized}</td><td>${x.movePct}</td><td>${x.brier}</td></tr>`).join('')}</table></details></section>`;
  return `<!doctype html><html lang="de"><meta charset="utf-8"><title>PulseMarket · Backtest Tagesszenario</title><style>body{font:14px/1.45 system-ui,sans-serif;background:#111;color:#ddd;max-width:1100px;margin:24px auto;padding:0 16px}h2 small{font-weight:400;color:#888;font-size:12px}table{border-collapse:collapse;margin:6px 0 14px;width:100%}th,td{border:1px solid #333;padding:4px 8px;text-align:left}th{background:#1b1b1b;color:#aaa;font-weight:500}.ok td{color:#9fd59f}.bad td{color:#d59f9f}.verdict{background:#1b1b1b;padding:10px;border-left:3px solid #c9a227}.muted{color:#888}section{margin-bottom:36px}details summary{cursor:pointer;color:#c9a227}</style>
  <h1>Backtest · Tagesszenario</h1><p class="muted">Brier-Score: 0 = perfekt, 0,667 = Gleichverteilung. Maßstab ist der Random Walk mit gleicher Volatilität und Restzeit (Monte Carlo, 400 Pfade/Tag) – die Bänder treffen auch ohne Information oft. Caveats: ${esc(Object.values(res).find(v => v.caveats)?.caveats.join(' ') || '')}</p>${Object.entries(res).map(([k, v]) => card(k, v)).join('')}</html>`;
}
