# PulseMarket Bias-Engine v2 (Gold · NAS100 · BTC · DXY)

## Einbau
1. Ordner `bias-engine/` neben `server.js` ablegen.
2. In `server.js`:
   - ESM: `import { registerBiasRoutes } from './bias-engine/index.js'; registerBiasRoutes(app);`
   - CommonJS: `import('./bias-engine/index.js').then(m => m.registerBiasRoutes(app));`
3. Railway-Env: `FRED_API_KEY` (Pflicht), `FINNHUB_API_KEY` (vorhanden). Optional: `COINGLASS_API_KEY`, `FLASHALPHA_API_KEY`, `MYFXBOOK_EMAIL`, `MYFXBOOK_PASSWORD`, `BIAS_LOG_PATH`.
4. Test: `GET /bias/v2` → `dataHealth` zeigt pro Quelle stale/error. Fehlende optionale Keys = Quelle neutral, kein Absturz.

## Endpoints
- `/bias/v2` – alles
- `/bias/v2/DXY` – Treiber-Layer (Surprise-Index, Zinserwartung, synthetischer USD-COT)
- `/bias/v2/GOLD|NAS100|BTC` – je `horizons.daily|weekly|monthly` mit score (-2…+2), label, Komponenten, Level

## Logik
| Horizont | trend | macro | positioning | structure | crowd | dxy |
|---|---|---|---|---|---|---|
| daily | .15 | .25 | .10 | .30 | .10 | .10 |
| weekly | .30 | .30 | .20 | .10 | .05 | .05 |
| monthly | .40 | .35 | .15 | 0 | 0 | .10 |

- **macro** = Makro-Überraschungs-Index (z-Überraschung × Gewicht × Halbwertszeit 10 Tage, CESI-Prinzip) + Zinserwartung (DGS2-Δ 5/20 Tage, Real-Yield-Δ). Inflationsüberraschung nach oben → negativ für alle drei Assets; Wachstumsüberraschung → positiv NAS, leicht positiv BTC, leicht negativ Gold.
- **positioning** = COT Non-Commercial: Wochenveränderung (Richtung) + 3-Jahres-Perzentil; Extrem (>90/<10 %) dämpft den Gesamtscore um 40 %.
- **structure** = BTC: Deribit Max Pain / Call- & Put-Wall / P-C-Ratio, optional Coinglass Funding & Long/Short. NAS: FlashAlpha Net-GEX → Regime Range/Trend. Gold: aktuell keine freie API (CME QuikStrike nur Scrape) → bewusst leer.
- **dxy** fließt invers in Gold (−1), BTC (−0.7), NAS (−0.5).

## Kalender-Actuals (Bug-Fix)
Forex Factory liefert kein `actual`. `calendar-actuals.js` zieht für US-Events (CPI, Core CPI, NFP, Unemployment, Core PCE, Retail Sales, Claims, JOLTS, GDP, PPI, AHE) den Actual aus FRED, sobald die Release-Zeit vorbei ist, und schreibt `{date, code, actual, forecast}` nach `events-log.jsonl`. Dieses Log ist die Surprise-Historie für den Bias – sie baut sich ab dem ersten Deploy von selbst auf. `events.json` ist nur für manuelles Nachtragen älterer Releases (Format: `{"date":"2026-09-11","code":"CPI_YOY","actual":2.9,"forecast":2.8}`).
ISM-Daten gibt es nicht auf FRED → bleiben "Steht noch aus", bis eine zweite Quelle kommt.

## Version 2.1 (15.10.)
- FlashAlpha: Header `X-Api-Key` statt Bearer (war der 404-Grund).
- Deribit: Levels für den nächsten Monatsverfall (`nextExpiry`) statt nur Gesamt-OI; `allExpiries` bleibt als Kontext.
- Retail-Level (Ø-Einstieg Long/Short) als Level-Chips; `trapped` zeigt, welche Seite im Verlust sitzt.
- `/bias/v2?fresh=1` umgeht den 15-Min-Cache.
- Frontend: alte Tages-Bias-Reihe ausgeblendet, Hero-Karten aus v2 (Wochen-Score), "Warum?"-Expander mit Klartext je Karte.

## Version 2.2 – Szenarien (`scenarios.js`)
Pro Asset drei bedingte Szenarien für die nächsten ~5 Handelstage: Fortsetzung oben / unten / Range – jeweils mit Wahrscheinlichkeit, Preisspanne (0,5–1,5σ aus der realisierten 20-Tage-Vola), Trigger und Invalidierungslevel. Level aus Options-OI, Retail-Einstiegen und 10/20-Tage-Swings, mindestens 0,5σ vom Preis entfernt.
- Wahrscheinlichkeit: Bias-Score (Woche 70 % / Tag 30 %) → max. 68/32; COT-Extrem dämpft; **Event-Risiko** (High-Impact-USD-Events in 5 Tagen, CPI/NFP/FOMC/PCE voll gewichtet) staucht Richtung 50/50.
- `trapNote`: welche Retail-Seite im Verlust sitzt und wo ihre Stops liegen.
- Bewusst **keine Punktprognose** (BaFin: öffentliches Tool, IB-Geschäft). Wahrscheinlichkeiten sind unkalibriert – Kalibrierung nach 60 Tagen aus `bias-log.jsonl`, dort werden Basisszenario und Level mitgeloggt.

## Dateien
`package.json` (`"type":"module"`) ist Pflicht – `server.js` ist CommonJS, das Modul ESM.

## Bekannte Schwächen (bitte nicht wegdiskutieren)
- Finnhub Economic Calendar ist Premium-only (403 ist normal). Historie kommt aus `events-log.jsonl`; bis dort ≥6 Punkte je Code liegen, wird grob normiert → ältere Releases in `events.json` nachtragen beschleunigt das.
- Railway-Container verlieren Dateien beim Redeploy → `events-log.jsonl` und `bias-log.jsonl` per `EVENTS_LOG_PATH`/`BIAS_LOG_PATH` auf ein Railway-Volume legen (oder Phase-1-Schritt 5: Postgres).
- COT-Marktnamen sind Strings der CFTC; bei "keine Zeilen" den Namen in `COT_MARKETS` gegen die Socrata-Ausgabe prüfen.
- Yahoo ist inoffiziell; bei 429 Range verkleinern oder Cache-TTL erhöhen.
- Coinglass-Feldnamen (v4) können abweichen → `raw` im Response prüfen und Pfade anpassen.
- Code ist nicht gegen Live-APIs getestet (Sandbox ohne Netz). Erster Lauf wird 1–2 Pfadkorrekturen brauchen.

## Pflicht vor Go-Live
`bias-log.jsonl` 60 Tage laufen lassen, dann Hit-Rate je Horizont gegen tatsächliche Richtung messen (weekly: Schluss T+5 vs. T; monthly: T+21). Unter 55 % → Richtung nicht verkaufen, nur Level und Regime.
