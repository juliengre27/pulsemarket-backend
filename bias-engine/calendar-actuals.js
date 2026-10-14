// bias-engine/calendar-actuals.js
// Forex Factory liefert keine Actual-Werte. Für die wichtigsten US-Releases holen wir
// den Actual aus FRED und schreiben (Forecast aus FF + Actual aus FRED) in events-log.jsonl,
// damit der Surprise-Index seine Historie von selbst aufbaut.
import { fred, normalizeEvent } from './sources.js';
import { appendFile, readFile } from 'node:fs/promises';

const pct = (a, b) => (a / b - 1) * 100;
// code → { series, calc(obs) → actual im Format des FF-Forecasts }
const MAP = {
  CPI_MOM:      { series: 'CPIAUCSL', calc: o => +pct(o.at(-1).v, o.at(-2).v).toFixed(1) },
  CORE_CPI_MOM: { series: 'CPILFESL', calc: o => +pct(o.at(-1).v, o.at(-2).v).toFixed(1) },
  CPI_YOY:      { series: 'CPIAUCSL', calc: o => +pct(o.at(-1).v, o.at(-13).v).toFixed(1) },
  CORE_CPI_YOY: { series: 'CPILFESL', calc: o => +pct(o.at(-1).v, o.at(-13).v).toFixed(1) },
  CORE_PCE_YOY: { series: 'PCEPILFE', calc: o => +pct(o.at(-1).v, o.at(-13).v).toFixed(1) },
  PPI_MOM:      { series: 'PPIFIS',   calc: o => +pct(o.at(-1).v, o.at(-2).v).toFixed(1) },
  NFP:          { series: 'PAYEMS',   calc: o => Math.round(o.at(-1).v - o.at(-2).v) },        // in Tausend
  UNEMPLOYMENT: { series: 'UNRATE',   calc: o => o.at(-1).v },
  AHE_MOM:      { series: 'CES0500000003', calc: o => +pct(o.at(-1).v, o.at(-2).v).toFixed(1) },
  RETAIL_MOM:   { series: 'RSAFS',    calc: o => +pct(o.at(-1).v, o.at(-2).v).toFixed(1) },
  CLAIMS:       { series: 'ICSA',     calc: o => Math.round(o.at(-1).v / 1000) },             // in Tausend
  JOLTS:        { series: 'JTSJOL',   calc: o => +(o.at(-1).v / 1000).toFixed(2) },          // in Mio
  GDP:          { series: 'A191RL1Q225SBEA', calc: o => o.at(-1).v },
};
// FF-Titel → Code (FF schreibt z. B. "Core CPI m/m", "Non-Farm Employment Change", "Unemployment Claims")
function codeFromFF(title) {
  const t = title.toLowerCase();
  if (/non-farm employment change/.test(t)) return 'NFP';
  if (/unemployment claims/.test(t)) return 'CLAIMS';
  if (/core pce price index m\/m/.test(t)) return null;             // kein YoY-Forecast bei FF → überspringen
  if (/jolts/.test(t)) return 'JOLTS';
  if (/advance gdp|prelim gdp|final gdp/.test(t)) return 'GDP';
  return normalizeEvent(title);
}
const parseNum = s => { if (s == null) return null; const m = String(s).replace(/[%,]/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };

const LOG = process.env.EVENTS_LOG_PATH || new URL('./events-log.jsonl', import.meta.url);
const logged = new Set();

/** Füllt processed-Events (aus /calendar/today) mit FRED-Actuals und loggt Überraschungen. */
export async function enrichCalendarActuals(events) {
  const now = Date.now() / 1000;
  return Promise.all(events.map(async ev => {
    if (ev.country !== 'USD' || ev.actual || ev.timestamp > now) return ev;
    const code = codeFromFF(ev.title); const m = code && MAP[code];
    if (!m) return ev;
    try {
      const f = await fred(m.series, 20);
      if (f.stale || !f.obs?.length) return ev;
      // Plausibilität: FRED-Beobachtung darf nicht älter als 45 Tage vor dem Event sein (sonst noch nicht veröffentlicht)
      const obsAge = (ev.timestamp * 1000 - new Date(f.obs.at(-1).d)) / 864e5;
      if (obsAge > 45 || obsAge < -3) return ev;
      const actual = m.calc(f.obs);
      const forecast = parseNum(ev.forecast);
      const date = new Date(ev.timestamp * 1000).toISOString().slice(0, 10);
      const key = date + code;
      if (forecast != null && !logged.has(key)) {
        logged.add(key);
        appendFile(LOG, JSON.stringify({ date, code, actual, forecast, previous: parseNum(ev.previous), country: 'US', source: 'FF+FRED' }) + '\n').catch(() => {});
      }
      return { ...ev, actual: String(actual) + (/%|m\/m|y\/y/.test(ev.title) || /CPI|PCE|PPI|GDP|UNEMPLOYMENT|RETAIL|AHE/.test(code) ? '%' : ''), actualSource: 'FRED' };
    } catch { return ev; }
  }));
}

/** Historie aus dem Log (für den Surprise-Index) */
export async function loggedEvents() {
  try {
    const txt = await readFile(LOG, 'utf8');
    return txt.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}
