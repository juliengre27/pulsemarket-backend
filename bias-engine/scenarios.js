// bias-engine/scenarios.js — Szenarien für die nächsten ~5 Handelstage.
// Bewusst KEINE Punktprognose: bedingte Szenarien mit Wahrscheinlichkeit, Spanne und Invalidierungslevel.
// Wahrscheinlichkeiten sind modellbasiert (Bias-Score + Vola + Event-Risiko), nicht kalibriert –
// Kalibrierung kommt aus dem 60-Tage-Log.

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const r2 = (x, d = 0) => +(+x).toFixed(d);

function decimals(price) { return price < 10 ? 4 : price < 1000 ? 2 : 0; }

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

  // Range-Wahrscheinlichkeit: hoch bei positivem Gamma / "zwischen den Walls", niedrig bei hoher Vola.
  // Event-Risiko ERHÖHT die Range-Wahrscheinlichkeit: vor FOMC/CPI/Mega-Cap-Earnings wartet der Markt ab,
  // die Richtungsentscheidung fällt erst am Event (vorher war das Vorzeichen hier falsch).
  let pRange = 0.35;
  if (a.regime === 'range_positive_gamma' || a.regime === 'zwischen den Walls') pRange = 0.45;
  if (a.regime === 'trend_negative_gamma') pRange = 0.25;
  if (vol > 0.3) pRange -= 0.08;
  pRange = clamp(pRange + 0.15 * eventRisk, 0.15, 0.6);
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

  // Zielzone beginnt am Ausbruchslevel (nicht am aktuellen Preis) und reicht 1σ darüber hinaus
  const upFrom = Math.max(resist, px + sigma5 * 0.5), upTo = upFrom + sigma5;
  const dnTo = Math.min(support, px - sigma5 * 0.5), dnFrom = dnTo - sigma5;
  const up = { name: 'Fortsetzung nach oben', p: r2(pUpDir * 100), from: r2(upFrom, dec), to: r2(upTo, dec),
    trigger: `Tagesschluss über ${fmt(resist)}`, invalidation: `Schluss unter ${fmt(support)}`,
    text: `Bruch über ${fmt(resist)} (${pct(resist)}) öffnet ${fmt(upFrom)}–${fmt(upTo)} (Ausbruchslevel + 1σ).` };
  const dn = { name: 'Fortsetzung nach unten', p: r2(pDnDir * 100), from: r2(dnFrom, dec), to: r2(dnTo, dec),
    trigger: `Tagesschluss unter ${fmt(support)}`, invalidation: `Schluss über ${fmt(resist)}`,
    text: `Bruch unter ${fmt(support)} (${pct(support)}) öffnet ${fmt(dnFrom)}–${fmt(dnTo)} (Ausbruchslevel − 1σ).` };
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

// ---------- TAGESSZENARIO (heute, Horizont bis zum nächsten Tagesschluss) ----------
// Arbeitet mit Vortages-High/Low/Close, ATR(14) und Session-Range aus intraday.js – nicht mit Wochen-Swings.
// Trigger sind Preislevel (nicht Tagesschlüsse), weil intraday gehandelt wird.
export function buildTodayScenario(a, ohlc, { eventsToday = [], label = '' } = {}) {
  if (!ohlc?.prevHigh || !ohlc?.prevLow || !ohlc?.atr14) return null;
  const px = ohlc.price, pdh = ohlc.prevHigh, pdl = ohlc.prevLow, pdc = ohlc.prevClose, atr = ohlc.atr14, wo = ohlc.weekOpen;
  const dec = decimals(px); const fmt = v => r2(v, dec).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const day = a.horizons?.daily?.score ?? 0;
  const used = (ohlc.atrUsedPct ?? 0) / 100;
  const evtSoon = eventsToday.length ? Math.max(...eventsToday.map(e => e.weight ?? 0.5)) : 0;

  // Richtung: Tages-Score → pUp; Expansion in Richtung → Bonus; Event heute → Richtung Richtung 50/50
  let pUp = 0.5 + day * 0.1;
  const above = px > pdh, below = px < pdl;
  if (above) pUp += 0.08; if (below) pUp -= 0.08;
  pUp = 0.5 + (pUp - 0.5) * (1 - 0.5 * evtSoon);
  pUp = clamp(pUp, 0.3, 0.7);
  // Range-Wahrscheinlichkeit: innerhalb Vortagesrange hoch; viel ATR schon verbraucht → noch höher; Event heute → höher
  let pRange = above || below ? 0.3 : 0.42;
  if (used > 0.8) pRange += 0.15; else if (used > 0.5) pRange += 0.05;
  pRange += 0.12 * evtSoon;
  pRange = clamp(pRange, 0.2, 0.65);
  const pU = (1 - pRange) * pUp, pD = (1 - pRange) * (1 - pUp);

  // Level: innerhalb → Range = Vortag; Ausbruch → Zielzone = Ausbruchslevel bis 0,6 ATR dahinter (Tagesziel, nicht Wochenziel)
  let rangeLo, rangeHi, upFrom, upTo, dnFrom, dnTo, upTrig, dnTrig, note;
  // Drei Fälle: Expansion über PDH, Expansion unter PDL, innerhalb. Bei Expansion ist die "Gegenrichtung" eine volle Umkehr
  // zurück über den Vortagesschluss bis zur anderen Seite der Vortagesrange – selten, aber das ist der Trade bei Fehlausbrüchen.
  if (above) { rangeLo = pdh; rangeHi = Math.max(px, ohlc.sessionHigh ?? px); upFrom = Math.max(px, pdh); upTo = Math.max(pdc + atr, px + atr * 0.4); dnFrom = pdl; dnTo = pdc; upTrig = `Preis hält über ${fmt(pdh)}`; dnTrig = `Preis zurück unter ${fmt(pdc)} (Vortagesschluss)`; note = `Expansion über das Vortageshoch ${fmt(pdh)}.`; }
  else if (below) { rangeLo = Math.min(px, ohlc.sessionLow ?? px); rangeHi = pdl; dnFrom = Math.min(pdc - atr, px - atr * 0.4); dnTo = Math.min(px, pdl); upFrom = pdc; upTo = pdh; dnTrig = `Preis hält unter ${fmt(pdl)}`; upTrig = `Preis zurück über ${fmt(pdc)} (Vortagesschluss)`; note = `Expansion unter das Vortagestief ${fmt(pdl)}.`; }
  else { rangeLo = pdl; rangeHi = pdh; upFrom = pdh; upTo = pdh + atr * 0.6; dnTo = pdl; dnFrom = pdl - atr * 0.6; upTrig = `Preis über ${fmt(pdh)}`; dnTrig = `Preis unter ${fmt(pdl)}`; note = `Preis innerhalb der Vortagesrange (${Math.round((ohlc.posInPrevRangePct ?? 50))} % von unten).`; }

  const up = { name: above ? 'Fortsetzung nach oben' : below ? 'Volle Umkehr nach oben' : 'Ausbruch nach oben', p: r2(pU * 100), from: r2(upFrom, dec), to: r2(upTo, dec), trigger: upTrig, invalidation: `Preis unter ${fmt(below ? pdc - atr : pdl)}`,
    text: above ? `Hält der Preis über ${fmt(pdh)}, ist ${fmt(upTo)} (Vortagesschluss + 1 ATR) das Tagesziel.` : below ? `Fehlausbruch nach unten: zurück über ${fmt(pdc)} öffnet den Weg zum Vortageshoch ${fmt(pdh)}.` : `Bruch über ${fmt(pdh)} öffnet ${fmt(upFrom)}–${fmt(upTo)} (0,6 ATR).` };
  const dn = { name: below ? 'Fortsetzung nach unten' : above ? 'Volle Umkehr nach unten' : 'Ausbruch nach unten', p: r2(pD * 100), from: r2(dnFrom, dec), to: r2(dnTo, dec), trigger: dnTrig, invalidation: `Preis über ${fmt(above ? pdc + atr : pdh)}`,
    text: below ? `Hält der Preis unter ${fmt(pdl)}, ist ${fmt(dnFrom)} (Vortagesschluss − 1 ATR) das Tagesziel.` : above ? `Fehlausbruch nach oben: zurück unter ${fmt(pdc)} öffnet den Weg zum Vortagestief ${fmt(pdl)}.` : `Bruch unter ${fmt(pdl)} öffnet ${fmt(dnFrom)}–${fmt(dnTo)} (0,6 ATR).` };
  const rg = { name: above || below ? 'Rückkehr in die Vortagesrange' : 'Range', p: r2(pRange * 100), from: r2(above ? pdh : below ? pdl : rangeLo, dec), to: r2(above ? pdc : below ? pdc : rangeHi, dec),
    trigger: above ? `Preis fällt zurück unter ${fmt(pdh)}` : below ? `Preis steigt zurück über ${fmt(pdl)}` : `Preis bleibt zwischen ${fmt(pdl)} und ${fmt(pdh)}`, invalidation: above ? `Preis über ${fmt(pdc + atr)}` : below ? `Preis unter ${fmt(pdc - atr)}` : 'Preis läuft am Ausbruchslevel vorbei',
    text: above ? `Ausbruch verpufft: zurück unter ${fmt(pdh)}, Vortagesschluss ${fmt(pdc)} als Magnet.` : below ? `Ausbruch verpufft: zurück über ${fmt(pdl)}, Vortagesschluss ${fmt(pdc)} als Magnet.` : `Seitwärts zwischen ${fmt(pdl)} und ${fmt(pdh)}; ${fmt(pdc)} (Vortagesschluss) und ${fmt(wo)} (Wochen-Open) als Magneten.` };
  const scen = [up, dn, rg].sort((x, y) => y.p - x.p); const base = scen[0];
  const evTxt = eventsToday.length ? ` Events heute: ${eventsToday.map(e => `${e.title} ${e.timeBerlin}`).join(', ')} – davor eher Range, Richtung entscheidet sich am Event.` : '';
  const atrTxt = ohlc.atrUsedPct != null ? ` Bereits ${ohlc.atrUsedPct} % der Tages-ATR (${fmt(atr)}) verbraucht${used > 0.8 ? ' – Tagesrange ist weitgehend ausgeschöpft' : ''}.` : '';
  return { asOf: new Date().toISOString().slice(0, 10), price: r2(px, dec), atr14: r2(atr, dec), atrUsedPct: ohlc.atrUsedPct ?? null, regime: ohlc.regime,
    range: { from: r2(rangeLo, dec), to: r2(rangeHi, dec) }, prevHigh: r2(pdh, dec), prevLow: r2(pdl, dec), prevClose: r2(pdc, dec), weekOpen: r2(wo, dec),
    eventsToday, scenarios: scen, base: base.name,
    summary: `${label} heute: ${note} Basis „${base.name}“ (${base.p} %). ${base.text}${atrTxt}${evTxt}`,
    disclaimer: 'Modellbasiertes Tagesszenario, unkalibriert. Beobachtung, keine Anlageberatung.' };
}

// Events der nächsten ~20 h (High/Medium USD aus FF + Mega-Cap-Earnings) für das Tagesszenario
export function eventsForToday(ffEvents = [], earnings = [], now = Date.now()) {
  const out = [];
  const berlin = t => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  for (const e of ffEvents) {
    if (e.country !== 'USD' || !e.timestamp || !['High', 'Medium'].includes(e.impact)) continue;
    const h = (e.timestamp * 1000 - now) / 3600e3; if (h < -1 || h > 20) continue;
    out.push({ title: e.title, timeBerlin: berlin(e.timestamp * 1000), weight: e.impact === 'High' ? 1 : 0.4, hoursTo: r2(h, 1) });
  }
  for (const x of earnings) if (x.daysTo >= -0.1 && x.daysTo <= 0.85) out.push({ title: `${x.symbol}-Zahlen`, timeBerlin: x.hour === 'bmo' ? '~13:00' : '~22:00', weight: x.weight, hoursTo: r2(x.daysTo * 24, 1) });
  return out.sort((a, b) => a.hoursTo - b.hoursTo);
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
