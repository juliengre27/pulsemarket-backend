// Offline-Test der Intraday-Rechenlogik (keine Netzwerkzugriffe). Aufruf: node bias-engine/test-intraday.mjs
import { structureFromBars, upcomingUsd } from './intraday.js';
import { legacyDailyView } from './index.js';
import assert from 'node:assert/strict';

const now = Date.parse('2026-10-20T09:00:00Z');
// 40 Tageskerzen, Abwärtstrend 4.400 → 4.160, letzte geschlossene Kerze = Mo 19.10.
const bars = []; let p = 4400;
for (let i = 40; i >= 1; i--) { const t = now - i * 864e5; p -= 6; bars.push({ t, o: p + 10, h: p + 40, l: p - 30, c: p }); }
const daily = { bars, last: 4120 };                 // heute: unter dem Vortagestief (4160-30 = 4130)
const hourly = { bars: [{ t: now - 7 * 3600e3, o: 4150, h: 4158, l: 4115, c: 4120 }] };
const s = structureFromBars(daily, hourly, now);
console.log('Struktur Gold-Fixture:', s);
assert.equal(s.regime, 'expansion');
assert.ok(s.score < -0.5, 'Score muss klar negativ sein (unter PDL, unter Wochen-Open, unter PDC)');
assert.ok(s.atr14 > 60 && s.atr14 < 90, 'ATR plausibel');
assert.equal(s.prevLow, 4130);
assert.ok(s.atrUsedPct > 50, 'Session-Range gegen ATR gemessen');

// Innerhalb der Range, oberes Drittel → leicht positiv, Regime "innerhalb Vortagesrange"
const s2 = structureFromBars({ bars, last: 4190 }, null, now);
assert.equal(s2.regime, 'innerhalb Vortagesrange');
assert.ok(s2.score > 0 && s2.score < 1, 'moderat positiv (oberes Drittel, über Wochen-Open und PDC): ' + s2.score);

// 10-Tage-Vorschau: FOMC in 8 Tagen muss auftauchen, CPI in 20 Tagen nicht
const up = upcomingUsd([{ title: 'Housing Starts', country: 'USD', impact: 'High', timestamp: (now + 0.2 * 864e5) / 1000 }],
  [{ title: 'FOMC Statement', country: 'USD', impact: 'High', timestamp: (now + 8 * 864e5) / 1000 }, { title: 'CPI m/m', country: 'USD', impact: 'High', timestamp: (now + 20 * 864e5) / 1000 }], now);
console.log('Upcoming:', up);
assert.equal(up.length, 2); assert.equal(up[1].title, 'FOMC Statement'); assert.equal(up[1].heavy, true); assert.equal(up[0].heavy, false);

// Kompat-View: Vorzeichen muss mit v2-daily übereinstimmen
const v2 = { generatedAt: 'x', disclaimer: 'd', weekWarning: null,
  dxy: { horizons: { daily: { score: 0.7, label: 'leicht bullish' } } },
  assets: Object.fromEntries(['GOLD', 'NAS100', 'BTC'].map((k, i) => [k, { horizons: { daily: { score: [-0.74, -0.09, 0.5][i], label: 'l' }, weekly: { label: 'w' }, monthly: { label: 'm' } },
    components: { trend: { score: -1.5, aboveSma200: false }, macro: { score: -0.4 }, structure: { score: -0.8, regime: 'expansion' }, positioning: { score: -0.1, percentile3y: 0.5 }, crowd: null } }])) };
const lv = legacyDailyView(v2);
assert.equal(lv.instruments.XAUUSD.bias, 'SHORT'); assert.equal(lv.instruments.NAS100.bias, 'NEUTRAL'); assert.equal(lv.instruments.BTCUSD.bias, 'LONG'); assert.equal(lv.instruments.EURUSD.bias, 'SHORT');
console.log('Kompat-View XAUUSD:', lv.instruments.XAUUSD.bias, lv.instruments.XAUUSD.score);
console.log('\nALLE TESTS OK');
