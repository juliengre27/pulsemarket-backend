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
//
// Parameter aus dem Backtest (≈850 Tage, Dez 2025–Okt 2026, Entscheidung 09:00 UTC) – siehe /bias/backtest:
//   • innerhalb der Vortagesrange gibt es KEINE Richtung (Lean 43–52 % über alle vier Assets) → nur Range + Ausbruchslevel
//   • Expansion läuft bei Gold/DXY durch (Lean ~60 %), bei NAS/BTC nicht (50 %) → Fortsetzungs-Bonus nur für Gold/DXY
//   • Range-Basis: NAS trendet intraday (Range nur 45 % getroffen) → niedrigere Range-Wahrscheinlichkeit als Gold/BTC/DXY
//   • Modell war unterkonfident (44 % gesagt, 53–61 % eingetreten) → Streckung; NAS war kalibriert → keine Streckung
//   Streckung und Boni sind In-Sample – der Beweis kommt aus dem Live-Log (bias-log.jsonl), nicht aus dem Backtest.
export const TODAY_PARAMS = {
  GOLD:   { contBonus: 0.10, rangeBase: 0.50, stretch: 1.25 },
  DXY:    { contBonus: 0.10, rangeBase: 0.50, stretch: 1.25 },
  BTC:    { contBonus: 0.02, rangeBase: 0.50, stretch: 1.20 },
  NAS100: { contBonus: 0.00, rangeBase: 0.36, stretch: 1.00 },
  DEFAULT:{ contBonus: 0.04, rangeBase: 0.45, stretch: 1.10 },
};
export function buildTodayScenario(a, ohlc, { eventsToday = [], label = '', asset = null } = {}) {
  if (!ohlc?.prevHigh || !ohlc?.prevLow || !ohlc?.atr14) return null;
  const P = TODAY_PARAMS[asset || a?.asset] || TODAY_PARAMS.DEFAULT;
  const px = ohlc.price, pdh = ohlc.prevHigh, pdl = ohlc.prevLow, pdc = ohlc.prevClose, atr = ohlc.atr14, wo = ohlc.weekOpen;
  const dec = decimals(px); const fmt = v => r2(v, dec).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const day = a.horizons?.daily?.score ?? 0;
  const used = (ohlc.atrUsedPct ?? 0) / 100;
  const evtSoon = eventsToday.length ? Math.max(...eventsToday.map(e => e.weight ?? 0.5)) : 0;
  const above = px > pdh, below = px < pdl;
  const stretch = p => { const q = p.map(x => 1 / 3 + (x - 1 / 3) * P.stretch).map(x => clamp(x, 0.05, 0.9)); const s = q.reduce((t, x) => t + x, 0); return q.map(x => x / s); };

  let up, dn, rg, note;
  if (above || below) {
    // ---- Expansion: Fortsetzung (Schluss jenseits des Ausbruchslevels) · Rückkehr (Schluss in der Vortagesrange) · Umkehr (Schluss jenseits der Gegenseite)
    // Gleichwertige Bänder – die alte Definition (Rückkehr = zwischen Vortagestief und -schluss) traf nur in 4–9 % der Fälle.
    let pCont = 0.5 + P.contBonus + clamp(day * (above ? 1 : -1), -2, 2) * 0.03;  // Tages-Score in Ausbruchsrichtung stützt
    pCont = 0.5 + (pCont - 0.5) * (1 - 0.5 * evtSoon);
    let pRet = 0.32 + 0.12 * evtSoon; let pRev = 1 - pCont - pRet; if (pRev < 0.06) { pRev = 0.06; pRet = 1 - pCont - pRev; }
    const [pC, pR, pV] = stretch([pCont, pRet, pRev]);
    const lvl = above ? pdh : pdl;
    const target = above ? Math.max(pdc + atr, px + atr * 0.4) : Math.min(pdc - atr, px - atr * 0.4);
    const cont = { name: above ? 'Fortsetzung nach oben' : 'Fortsetzung nach unten', p: r2(pC * 100), from: r2(above ? Math.max(px, pdh) : target, dec), to: r2(above ? target : Math.min(px, pdl), dec),
      trigger: `Preis hält ${above ? 'über' : 'unter'} ${fmt(lvl)}`, invalidation: `Preis zurück ${above ? 'unter' : 'über'} ${fmt(lvl)}`,
      text: `Hält der Preis ${above ? 'über' : 'unter'} ${fmt(lvl)}, ist ${fmt(target)} (Vortagesschluss ${above ? '+' : '−'} 1 ATR) das Tagesziel.` };
    const ret = { name: 'Rückkehr in die Vortagesrange', p: r2(pR * 100), from: r2(pdl, dec), to: r2(pdh, dec),
      trigger: `Preis zurück ${above ? 'unter' : 'über'} ${fmt(lvl)}`, invalidation: `Preis ${above ? 'über' : 'unter'} ${fmt(target)}`,
      text: `Ausbruch verpufft: Schluss zwischen ${fmt(pdl)} und ${fmt(pdh)}, Vortagesschluss ${fmt(pdc)} als Magnet.` };
    const rev = { name: above ? 'Volle Umkehr nach unten' : 'Volle Umkehr nach oben', p: r2(pV * 100), from: r2(above ? pdl - atr * 0.4 : pdh, dec), to: r2(above ? pdl : pdh + atr * 0.4, dec),
      trigger: `Preis ${above ? 'unter' : 'über'} ${fmt(above ? pdl : pdh)}`, invalidation: `Preis ${above ? 'über' : 'unter'} ${fmt(pdc)}`,
      text: `Fehlausbruch mit Durchlauf zur Gegenseite: Schluss ${above ? 'unter' : 'über'} ${fmt(above ? pdl : pdh)}.` };
    if (above) { up = cont; dn = rev; } else { dn = cont; up = rev; } rg = ret;
    note = `Expansion ${above ? 'über das Vortageshoch' : 'unter das Vortagestief'} ${fmt(lvl)}.`;
  } else {
    // ---- Innerhalb der Vortagesrange: keine Richtung (Backtest: Lean unter Münzwurf), Range als Basis, Ausbruch beidseitig gleich
    let pRange = P.rangeBase; if (used > 0.8) pRange += 0.08; pRange += 0.12 * evtSoon; pRange = clamp(pRange, 0.25, 0.7);
    let pUp = 0.5 + (Math.abs(day) > 0.8 ? Math.sign(day) * 0.04 : 0); // nur ein sehr klarer Tages-Score neigt minimal
    const [pR, pU, pD] = stretch([pRange, (1 - pRange) * pUp, (1 - pRange) * (1 - pUp)]);
    up = { name: 'Ausbruch nach oben', p: r2(pU * 100), from: r2(pdh, dec), to: r2(pdh + atr * 0.6, dec), trigger: `Preis über ${fmt(pdh)}`, invalidation: `Preis zurück unter ${fmt(pdh)}`, text: `Bruch über ${fmt(pdh)} öffnet ${fmt(pdh)}–${fmt(pdh + atr * 0.6)} (0,6 ATR).` };
    dn = { name: 'Ausbruch nach unten', p: r2(pD * 100), from: r2(pdl - atr * 0.6, dec), to: r2(pdl, dec), trigger: `Preis unter ${fmt(pdl)}`, invalidation: `Preis zurück über ${fmt(pdl)}`, text: `Bruch unter ${fmt(pdl)} öffnet ${fmt(pdl - atr * 0.6)}–${fmt(pdl)} (0,6 ATR).` };
    rg = { name: 'Range', p: r2(pR * 100), from: r2(pdl, dec), to: r2(pdh, dec), trigger: `Preis bleibt zwischen ${fmt(pdl)} und ${fmt(pdh)}`, invalidation: 'Schluss außerhalb der Vortagesrange',
      text: `Seitwärts zwischen ${fmt(pdl)} und ${fmt(pdh)}; ${fmt(pdc)} (Vortagesschluss) und ${fmt(wo)} (Wochen-Open) als Magneten. Keine bevorzugte Seite.` };
    note = `Preis innerhalb der Vortagesrange (${Math.round((ohlc.posInPrevRangePct ?? 50))} % von unten).`;
  }
  const scen = [up, dn, rg].sort((x, y) => y.p - x.p); const base = scen[0];
  const evTxt = eventsToday.length ? ` Events heute: ${eventsToday.map(e => `${e.title} ${e.timeBerlin}`).join(', ')} – davor eher Range, Richtung entscheidet sich am Event.` : '';
  const atrTxt = ohlc.atrUsedPct != null ? ` Bereits ${ohlc.atrUsedPct} % der Tages-ATR (${fmt(atr)}) verbraucht${used > 0.8 ? ' – Tagesrange ist weitgehend ausgeschöpft' : ''}.` : '';
  return { asOf: new Date().toISOString().slice(0, 10), price: r2(px, dec), atr14: r2(atr, dec), atrUsedPct: ohlc.atrUsedPct ?? null, regime: ohlc.regime,
    range: { from: r2(above || below ? Math.min(px, pdl) : pdl, dec), to: r2(above || below ? Math.max(px, pdh) : pdh, dec) }, prevHigh: r2(pdh, dec), prevLow: r2(pdl, dec), prevClose: r2(pdc, dec), weekOpen: r2(wo, dec),
    eventsToday, scenarios: scen, base: base.name, params: P,
    summary: `${label} heute: ${note} Basis „${base.name}“ (${base.p} %). ${base.text}${atrTxt}${evTxt}`,
    disclaimer: 'Modellbasiertes Tagesszenario; Parameter aus Backtest Dez 2025–Okt 2026 (in-sample). Beobachtung, keine Anlageberatung.' };
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
