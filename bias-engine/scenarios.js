// bias-engine/scenarios.js — Szenarien für die nächsten ~5 Handelstage.
// Bewusst KEINE Punktprognose: bedingte Szenarien mit Wahrscheinlichkeit, Spanne und Invalidierungslevel.
// Wahrscheinlichkeiten sind modellbasiert (Bias-Score + Vola + Event-Risiko), nicht kalibriert –
// Kalibrierung kommt aus dem 60-Tage-Log.

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const r2 = (x, d = 0) => +(+x).toFixed(d);

function decimals(price) { return price < 10 ? 4 : price < 1000 ? 1 : 0; }

/**
 * @param {object} a  Asset-Objekt aus computeBias (horizons, components, levels)
 * @param {number[]} closes  Tagesschlüsse (für Swings)
 * @param {object} opts { eventRisk: 0..1, label }
 */
export function buildScenarios(a, closes, { eventRisk = 0, label = '' } = {}) {
  if (!closes?.length || closes.length < 30) return null;
  const px = closes.at(-1); const dec = decimals(px);
  const vol = a.components?.trend?.vol20 ?? 0.2;                 // annualisiert
  const sigma5 = px * vol * Math.sqrt(5 / 252);                  // 1σ-Bewegung über 5 Tage
  const hi10 = Math.max(...closes.slice(-10)), lo10 = Math.min(...closes.slice(-10));
  const hi20 = Math.max(...closes.slice(-20)), lo20 = Math.min(...closes.slice(-20));
  const wk = a.horizons?.weekly?.score ?? 0, day = a.horizons?.daily?.score ?? 0;
  const bias = clamp(wk * 0.7 + day * 0.3, -2, 2);

  // Basiswahrscheinlichkeit aus dem Bias: Score 0 → 50/50; Score ±2 → 68/32 (bewusst nicht aggressiver)
  let pUp = 0.5 + bias * 0.09;
  // Event-Risiko staucht Richtung 50/50 (vor CPI/NFP/FOMC ist der Bias weniger wert)
  pUp = 0.5 + (pUp - 0.5) * (1 - 0.6 * eventRisk);
  // COT-Extrem: zusätzlicher Dämpfer Richtung Gegenrichtung (Reversal-Risiko)
  if (a.components?.positioning?.extreme) pUp = 0.5 + (pUp - 0.5) * 0.75;
  pUp = clamp(pUp, 0.25, 0.75);

  // Range-Wahrscheinlichkeit: hoch bei positivem Gamma / "zwischen den Walls", niedrig bei hoher Vola
  let pRange = 0.35;
  if (a.regime === 'range_positive_gamma' || a.regime === 'zwischen den Walls') pRange = 0.45;
  if (a.regime === 'trend_negative_gamma') pRange = 0.25;
  if (vol > 0.3) pRange -= 0.08;
  pRange = clamp(pRange - 0.15 * eventRisk, 0.15, 0.5);
  const pUpDir = (1 - pRange) * pUp, pDnDir = (1 - pRange) * (1 - pUp);

  // Level: Options-/Retail-Level, sonst Swings
  const L = a.levels || {};
  // Level müssen mindestens 0,5σ vom Preis entfernt sein, sonst ist die Range unbrauchbar eng → Fallback σ-Band
  const minD = sigma5 * 0.5;
  const resist = [L.callWall, L.retailShortEntry, hi10, hi20].filter(v => v != null && v > px + minD).sort((x, y) => x - y)[0] ?? px + sigma5;
  const support = [L.putWall, L.retailLongEntry, lo10, lo20].filter(v => v != null && v < px - minD).sort((x, y) => y - x)[0] ?? px - sigma5;
  const magnet = L.maxPain ?? null;

  const fmt = v => r2(v, dec).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const pct = v => ((v / px - 1) * 100).toFixed(1) + ' %';

  const up = { name: 'Fortsetzung nach oben', p: r2(pUpDir * 100), from: r2(px + sigma5 * 0.5, dec), to: r2(px + sigma5 * 1.5, dec),
    trigger: `Tagesschluss über ${fmt(resist)}`, invalidation: `Schluss unter ${fmt(support)}`,
    text: `Bruch über ${fmt(resist)} (${pct(resist)}) öffnet ${fmt(px + sigma5 * 0.5)}–${fmt(px + sigma5 * 1.5)} (1σ-Spanne der nächsten 5 Tage).` };
  const dn = { name: 'Fortsetzung nach unten', p: r2(pDnDir * 100), from: r2(px - sigma5 * 1.5, dec), to: r2(px - sigma5 * 0.5, dec),
    trigger: `Tagesschluss unter ${fmt(support)}`, invalidation: `Schluss über ${fmt(resist)}`,
    text: `Bruch unter ${fmt(support)} (${pct(support)}) öffnet ${fmt(px - sigma5 * 1.5)}–${fmt(px - sigma5 * 0.5)}.` };
  const rg = { name: 'Range', p: r2(pRange * 100), from: r2(support, dec), to: r2(resist, dec),
    trigger: `Preis bleibt zwischen ${fmt(support)} und ${fmt(resist)}`, invalidation: 'Tagesschluss außerhalb der Spanne',
    text: `Seitwärts zwischen ${fmt(support)} und ${fmt(resist)}${magnet ? `, Max Pain ${fmt(magnet)} als Magnet bis zum Verfall` : ''}.` };

  // Retail-Falle als Zusatzhinweis
  const cr = a.components?.crowd; let trapNote = null;
  if (cr?.trapped === 'longs' && cr.avgLongEntry) trapNote = `${cr.longPct} % der Retail-Trader sind long mit Ø-Einstieg ${fmt(cr.avgLongEntry)} – im Verlust. Stop-Cluster liegen unter ${fmt(support)}; ein Durchlauf dorthin ist das wahrscheinlichste Liquiditätsziel vor einer Gegenbewegung.`;
  if (cr?.trapped === 'shorts' && cr.avgShortEntry) trapNote = `${100 - cr.longPct} % der Retail-Trader sind short mit Ø-Einstieg ${fmt(cr.avgShortEntry)} – im Verlust. Stop-Cluster liegen über ${fmt(resist)}; ein Squeeze dorthin ist das wahrscheinlichste Liquiditätsziel.`;

  const scen = [up, dn, rg].sort((x, y) => y.p - x.p);
  const base = scen[0];
  const summary = `${label}: Basisszenario „${base.name}“ (${base.p} %). ${base.text} Erwartete 1σ-Bewegung bis Freitag ±${fmt(sigma5)} (${(sigma5 / px * 100).toFixed(1)} %).`
    + (eventRisk > 0 ? ` Event-Risiko in den nächsten 5 Tagen: Wahrscheinlichkeiten Richtung 50/50 gestaucht.` : '')
    + (a.components?.positioning?.extreme ? ` COT-Extrem – Reversal-Risiko erhöht.` : '');

  return { asOf: new Date().toISOString().slice(0, 10), price: r2(px, dec), sigma5: r2(sigma5, dec), sigma5Pct: r2(sigma5 / px * 100, 2),
    support: r2(support, dec), resistance: r2(resist, dec), magnet: magnet != null ? r2(magnet, dec) : null,
    eventRisk: r2(eventRisk, 2), scenarios: scen, base: base.name, trapNote, summary,
    disclaimer: 'Modellbasierte Szenarien mit unkalibrierten Wahrscheinlichkeiten. Beobachtung, keine Anlageberatung.' };
}

// Event-Risiko aus dem FF-Kalender: High-Impact-USD-Events in den nächsten 5 Tagen, gewichtet nach Nähe und Typ
const HEAVY = /cpi|non-farm|nfp|fomc|federal funds|pce|unemployment rate/i;
export function eventRiskFromCalendar(events = [], now = Date.now()) {
  let risk = 0;
  for (const e of events) {
    if (e.country !== 'USD' || e.impact !== 'High' || !e.timestamp) continue;
    const days = (e.timestamp * 1000 - now) / 864e5;
    if (days < -0.2 || days > 5) continue;
    const w = HEAVY.test(e.title || '') ? 1 : 0.4;
    risk = Math.max(risk, w * (1 - Math.max(0, days) / 5));
  }
  return clamp(risk, 0, 1);
}
