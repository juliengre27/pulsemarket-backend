
Claude hat die Antwort abgeschlossen
gib mir nur NY UND london, da zwischn 8-9 uhr auch gute trades entstehen bzw. 10 11 uhr teste das auch noch


Orchestrierte Session-Filter für NY und London mit Zeitfenster-Validierung
Orchestrierte Session-Filter für NY und London mit Zeitfenster-Validierung
Gute Idee — testen wir, wo die 46 Trades zeitlich verdienen und ob ein London+NY-Fenster das System verbessert. Deine Stunden (8–9, 10–11) interpretiere ich als Berlin-Zeit:


Analysierte Session-Filter und implementierte London-plus-New-York-Kombination
Analysierte Session-Filter und implementierte London-plus-New-York-Kombination
Session-Filter ist drin — mit drei Modi in den Settings:

„Nur New York" (Default, Backtest-Beste): Signale nur 15–19 Uhr Berlin. PF 1.86, +16R — das Fenster, in dem dein System nachweislich verdient
„London + New York": dein Wunsch — zusätzlich 08–12 Uhr Berlin offen. Kostet im Backtest ~4R, gibt dir aber die Vormittags-Chancen, falls dort künftig S1/S4 feuern
„Alle Zeiten": wie bisher
Das Panel zeigt außerhalb des Fensters „Session zu — wartet auf Fenster" — du weißt immer, warum gerade Stille ist.

Meine ehrliche Empfehlung: Starte mit „Nur New York". Nicht weil London tot ist, sondern weil die Daten sagen: Dein System hat vormittags aktuell kein funktionierendes Werkzeug (die 4 Verlierer waren fast alle S3, das ohnehin wackelt). Deine 8–9/10–11-Uhr-Beobachtung kann trotzdem stimmen — nur fängt der Indikator diese Trades nicht. Wenn du sie willst, ist der saubere Weg: 2–3 Wochen im Journal notieren, welches Muster du vormittags siehst (vermutlich London-ORB oder EMA50-Continuation?), dann teste ich genau das an den 97 Tagen — und wenn es trägt, wird es S5 mit eigenem London-Fenster. So wächst das System durch Beweise statt durch Gefühl.

Praktisch heißt NY-only für deinen Alltag übrigens: Ein einziges konzentriertes Zeitfenster am Tag — 15:00–19:00, perfekt planbar neben Job, Training und PulseMarket. Ein Fenster, ~1 Trade alle 1–2 Tage, PF 1.86. Das ist kein Verzicht, das ist Fokus. Alerts neu anlegen — und dann steht das Ding wirklich. 🎯


Gold master
PINE 
hast du jetzt asia rausgenommen und nur aklarme gesetzt wenn wirklich ein trade kommt ?


Bestätigte Asia-Entfernung und Alerts nur bei echten Trades
Bestätigte Asia-Entfernung und Alerts nur bei echten Trades
Ja zu beidem — mit einer wichtigen Präzisierung:

Alarme: Der „Jeder alert()-Funktionsaufruf"-Alarm feuert nur noch bei ③ — also nur, wenn ein fertiger Trade mit Entry/SL/TP steht. Die ①/②-Zwischenmeldungen (Zone getappt, FVG armed) sind aus dem Alarm-Stream komplett raus. Ein Ping = ein handelbarer Trade. (Wer Zwischenschritte will, müsste sie als separate Einzel-Alerts bewusst abonnieren — standardmäßig: Stille bis zum Signal.)

Asia: Zweigeteilt, und das ist Absicht. Das Setup S3 (Asia-Reversal) ist mit dem Default „Nur New York" faktisch stumm — es arbeitet morgens (07–12 Uhr Berlin), und da ist die Session zu. Es ist nicht gelöscht: Stellst du auf „London + New York", kann es wieder feuern. Nach 0/3 im Backtest plus dem Beinahe-Fail gestern ist „stumm auf Bewährung" genau der richtige Status. Die Asia-Range selbst (High/Low über Nacht) läuft dagegen bewusst weiter — sie ist ja nicht als Entry, sondern als Ziel validiert (100% Anlauf-Statistik): Deine TPs und der Kompass rechnen weiter mit den Asia-Levels, auch wenn du nur im NY-Fenster tradest.

Kurz: Du bekommst ab jetzt nur noch Alarme für echte NY-Trades (15–19 Uhr Berlin), deren Ziele weiterhin von der Asia-Liquidität wissen. Genau eine Sache bleibt zu tun, damit das auch live so ankommt: alte Alerts löschen, neu anlegen — die laufenden feuern noch den alten Stand mit allen Zwischenmeldungen.

ok dann lass uns jetzzt pluse market so bearbeiten wie wir es gestern besprochen haben


Rekonstruierend PulseMarket-Architektur aus fragmentarischen Erinnerungen
Rekonstruierend PulseMarket-Architektur aus fragmentarischen Erinnerungen
Bevor ich loslege, hole ich mir kurz, was wir gestern zu PulseMarket festgehalten haben:


Orchestrierte API-Integration für PulseMarket mit robusten Fallback-Mechanismen
Orchestrierte API-Integration für PulseMarket mit robusten Fallback-Mechanismen
Da ist der /bias/daily-Endpoint — genau wie gestern beschlossen, inklusive der Datenquellen-Recherche als erste Etappe:

Die Quellen-Frage ist gelöst (Details in BIAS_SETUP.md): FRED liefert kostenlos US10Y, Realzinsen (DFII10) und VIX (einziger neuer Key, 2 Minuten Anmeldung). Binance public deckt BTC komplett ab (Preis, 200-Tage-Trend, Funding Rate — alles ohne Key). Crypto Fear & Greed kommt von alternative.me (frei, kein Key), Aktien-F&G nutzt deine bestehende CNN-Quelle, QQQ als NAS100-Proxy und EURUSD laufen über deinen vorhandenen Finnhub-Key, und DXY bleibt beim EURUSD-Proxy-Ansatz aus deinem IntermarketFilter. Bund-Renditen und BTC-ETF-Flows → Phase 2 (kostenlos nicht sauber verfügbar — der Bias funktioniert ohne, die confidence-Angabe macht Lücken transparent).

Der Endpoint liefert pro Instrument genau dein gewünschtes Format: fertiger Bias (LONG/SHORT/NEUTRAL + Score + Pfeil), die Rohfaktoren einzeln (Name, Wert, Punkte, deutscher Begründungssatz) und einen Kommentar in Beobachtungssprache — BaFin-soft, „Umfeld spricht eher für…", keine Empfehlungen. Gold wird z. B. aus Realzins-Wochenveränderung, Dollar-Proxy, VIX und Risk-Sentiment gescored; BTC kontrarisch an den F&G-Extremen plus Funding-Überhitzung und 200-Tage-Trend.

Robustheit, weil du das Ding morgens brauchst: 15-Minuten-Cache (schont die Free-Limits), 8-Sekunden-Timeouts, und jede Quelle darf einzeln ausfallen — der Faktor wird dann neutral gewertet und die Confidence sinkt sichtbar, statt dass der Endpoint stirbt.

Einbau in 5 Minuten: bias.js nach routes/ ins Backend-Repo, in server.js die Zeile app.use('/bias', require('./routes/bias'));, in Railway die Variable FRED_API_KEY setzen, deployen, dann curl .../bias/daily | jq. Wichtig, ehrlich: Ich konnte hier nicht gegen die Live-APIs testen (kein Netz in meiner Umgebung) — die Struktur ist defensiv gebaut, aber schick mir nach dem ersten curl die Antwort, falls eine Quelle zickt (Kandidat Nr. 1: das Finnhub-Forex-Symbol OANDA:EUR_USD — falls leer, sag Bescheid, dann stelle ich auf den Candle-Endpoint um).

Und der schöne Bonus für deinen Workflow: Sobald das läuft, hast du morgens beide Ebenen — GOLD MASTER sagt dir die Struktur (Zonen, Liquidität, Setups), /bias/daily das Makro-Umfeld dahinter. Wenn beide in dieselbe Richtung zeigen, ist das dein A+-Tag. Soll ich als Nächstes die Bias-Karte fürs Frontend bauen, oder testest du erst den Endpoint?


Bias
JS 

Bias setup
Dokument · MD 
schritt für schritt anleitung wie ich das baue + webseiten und to dos


Orchestrierte schrittweise Anleitung mit API-Setup, Deployment und Aufgabenliste
Orchestrierte schrittweise Anleitung mit API-Setup, Deployment und Aufgabenliste
Hier die komplette Anleitung — vom Key bis zum ersten Test:

Schritt 1 — FRED-API-Key holen (2 Min., einmalig)

Öffne https://fred.stlouisfed.org → oben rechts „My Account" → Account erstellen (E-Mail reicht)
Nach dem Login: https://fred.stlouisfed.org/docs/api/api_key.html → „Request API Key" → Zweck z. B. „personal dashboard" → Key wird sofort angezeigt
Key kopieren und kurz zwischenspeichern (32 Zeichen, sieht aus wie abcd1234...)
Schritt 2 — bias.js ins Backend-Repo

Öffne https://github.com/juliengre27/pulsemarket-backend
Navigiere in den Ordner routes/ (dort liegen deine anderen Routen wie calendar/gold). Falls es den Ordner nicht gibt: bei „Add file" einfach routes/bias.js als Pfad eintippen — GitHub legt den Ordner automatisch an
„Add file" → „Create new file" → Name: bias.js → den kompletten Inhalt aus meiner bias.js einfügen → unten grüner Button „Commit changes"
Schritt 3 — Route in server.js registrieren

Im Repo die Hauptdatei öffnen (server.js oder index.js — die Datei, wo deine anderen app.use(...)-Zeilen stehen)
Stift-Symbol (Bearbeiten) → bei den anderen Routen-Einbindungen diese Zeile ergänzen:
js
app.use('/bias', require('./routes/bias'));
„Commit changes" — Railway deployt automatisch bei jedem Push (siehst du unter https://railway.app im Projekt unter „Deployments", dauert ~1–2 Min.)
Schritt 4 — FRED-Key in Railway hinterlegen

https://railway.app → dein Backend-Projekt → Tab „Variables"
„New Variable": Name FRED_API_KEY, Wert = dein Key aus Schritt 1 → speichern
Railway startet den Service automatisch neu (dein FINNHUB_API_KEY liegt da ja schon)
Schritt 5 — Testen
Im Browser oder Terminal:

https://DEIN-BACKEND.up.railway.app/bias/daily
(deine Railway-URL ist dieselbe wie bei /calendar/today). Einzelnes Instrument: .../bias/daily?instrument=XAUUSD

Erwartung: JSON mit instruments.XAUUSD.bias (LONG/SHORT/NEUTRAL), score, confidence und den Faktoren mit deutschen Begründungen.

Schritt 6 — Troubleshooting-Checks (falls was hakt)

confidence: 1.0 überall → perfekt, alle Quellen liefern
confidence < 1 → schau in factors, welcher "ok": false hat; die Fehlermeldung steht in note
Wahrscheinlichster Kandidat: EURUSD via Finnhub (OANDA:EUR_USD) — falls der leer bleibt, schick mir die JSON-Antwort, dann stelle ich auf Finnhubs Candle-Endpoint um
CNN Fear & Greed blockt manchmal Server-IPs → falls ok: false: auch nicht schlimm, Faktor läuft neutral; kannst du später auf deine bestehende /sentiment/fear-greed-Logik intern umbiegen
To-dos danach (in sinnvoller Reihenfolge):

☐ 2–3 Tage laufen lassen und morgens gegen deine eigene Einschätzung halten — passt der Bias zum Tagesverlauf? (Kalibrierungs-Check)
☐ Frontend-Karte „Daily Bias" im Cockpit (4 Zeilen: Instrument · Pfeil · Score · Kommentar) — sag Bescheid, die baue ich dir fertig für dein Vercel-Repo
☐ Morgenroutine verdrahten: Bias-Check als fester Teil deiner 6-Human-Checks (📅-Check erweitert sich um „Makro-Bias gelesen")
☐ Phase 2, wenn alles stabil: Bund-Renditen (Bundesbank-API) für einen echten EUR-Zins-Spread, BTC-ETF-Flows (CoinGlass-Key oder Farside), und ggf. den Bias historisch loggen (jeden Tag in eine JSON/DB schreiben) — dann kannst du nach 2–3 Monaten prüfen, welcher Faktor tatsächlich Vorhersagekraft hatte. Systeme, nicht Meinungen — auch beim Makro.
Melde dich mit dem ersten JSON-Output — dann sehen wir sofort, ob alle Quellen sauber liefern. 🚀

Aktiviere die Websuche im Such- und Tools-Menü. Andernfalls sind die bereitgestellten Links möglicherweise nicht korrekt oder aktuell.

1784187450266_image.png
was schreib ich auf enlisch?

Schreib einfach das rein — kurz und ehrlich reicht denen völlig:

Personal market dashboard that displays daily macro data (Treasury yields, VIX) alongside other public market information. Non-commercial personal project.
Häkchen hast du schon gesetzt → „Request API Key" klicken → der Key erscheint direkt auf der nächsten Seite (und kommt zusätzlich per Mail). Dann ab damit in Railway als FRED_API_KEY — Schritt 4 aus der Anleitung. 🚀

1784187549231_image.png
Der Key ist da — Schritt 1 abgehakt. ✅

Weiter geht's direkt mit Schritt 4 (Railway), das ist der schnellste nächste Zug:

https://railway.app → dein pulsemarket-backend-Projekt → Tab „Variables"
„New Variable" → Name: FRED_API_KEY → Wert: dein Key von eben (komplett kopieren, keine Leerzeichen davor/dahinter)
Speichern — Railway startet den Service automatisch neu
Dann fehlen nur noch Schritt 2+3 auf GitHub: bias.js als neue Datei unter routes/ anlegen (Inhalt aus meiner Datei) und in der server.js die Zeile app.use('/bias', require('./routes/bias')); ergänzen. Sobald der Deploy durch ist (~2 Min.), ruf auf:

https://DEINE-URL.up.railway.app/bias/daily
Und schick mir das JSON — dann checke ich sofort, ob alle Quellen sauber liefern oder ob wir irgendwo nachjustieren müssen.

Ein Sicherheits-Hinweis noch, weil der Key jetzt auf einem Screenshot war: FRED-Keys sind unkritisch (kostenlos, nur Lesezugriff auf öffentliche Daten), da musst du nichts zurückziehen. Trotzdem als Grundregel für alles Weitere: Keys gehören nur in Railway-Variables, nie in den GitHub-Code committen — dein Finnhub-Key liegt ja auch schon richtig. 👍

1784187651228_image.png
Du bist genau richtig — der Variables-Tab ist offen, Service ist „Online".

Zwei Beobachtungen: Oben steht „No Environment Variables", aber unten „7 variables added by Railway" — das sind Railways interne Variablen. Wichtig: Wo ist dein FINNHUB_API_KEY? Der müsste hier stehen. Falls du ihn hier nicht siehst, klapp mal die „7 variables"-Zeile auf (Pfeil links davon) — vielleicht liegt er dort. Sollte er ganz fehlen, müssen wir ihn auch neu setzen, sonst laufen die Finnhub-Faktoren (QQQ, EURUSD) ins Leere.

Jetzt der FRED-Key — klick oben rechts auf „New Variable":

„+ New Variable" klicken
Feld Name (oder „Variable name"): FRED_API_KEY
Feld Value: 893f5755c853a2c73c44ae01ccb8e533 (dein Key von eben)
Add / Deploy bestätigen
Railway triggert dann automatisch einen Neustart.

Und weil dieser Key jetzt zweimal im Chat war: FRED-Keys sind kostenlos und reine Lese-Keys auf öffentliche Daten — kein Sicherheitsrisiko, du musst nichts zurückziehen. Kannst ihn beruhigt so verwenden.

Sag mir kurz, ob du den FINNHUB_API_KEY in der Liste findest — dann wissen wir, ob wir den auch noch nachtragen müssen, bevor du testest.

ist drin

Perfekt — dann sind beide Keys drin und Schritt 4 ist durch. ✅

Jetzt fehlen nur noch die zwei GitHub-Schritte, damit der Endpoint überhaupt existiert:

Schritt 2 — bias.js anlegen:

https://github.com/juliengre27/pulsemarket-backend → in den routes/-Ordner
„Add file" → „Create new file" → Name: bias.js
Kompletten Inhalt meiner bias.js reinkopieren → „Commit changes"
Schritt 3 — Route registrieren:

server.js (oder index.js) öffnen → Stift zum Bearbeiten
Bei den anderen app.use(...)-Zeilen ergänzen:
js
app.use('/bias', require('./routes/bias'));
„Commit changes"
Railway deployt automatisch (~1–2 Min, siehst du im „Deployments"-Tab, wenn es grün wird). Dann im Browser:

https://DEINE-URL.up.railway.app/bias/daily
Schick mir das JSON, das rauskommt — dann prüfe ich sofort, ob alle sechs Quellen sauber liefern (confidence: 1.0 überall wäre das Ziel) oder ob wir irgendwo nachjustieren müssen. 🚀

Kleiner Tipp, falls du deine Railway-URL nicht auswendig weißt: Es ist dieselbe wie bei deinen bestehenden Endpoints — also die URL, unter der /calendar/today oder /health läuft, nur mit /bias/daily dahinter.

1784187851146_image.png
wo?

Wichtige Info aus dem Screenshot: Dein Repo hat keinen routes/-Ordner — nur package.json und server.js. Alles liegt in einer Datei. Das ändert das Vorgehen leicht, macht es aber sogar einfacher.

Zwei Optionen. Ich empfehle Option A (passt zu deiner flachen Struktur):

Option A — Ordner beim Anlegen miterzeugen (empfohlen):

Du bist auf der Repo-Seite → „Add file" → „Create new file" (der Button ist oben rechts, evtl. musst du kurz „Sign in" — bist du eingeloggt? Oben steht „Sign in", also erst einloggen!)
In das Namensfeld tippst du: routes/bias.js
→ Der Schrägstrich / erzeugt den Ordner routes automatisch mit
Inhalt meiner bias.js reinkopieren → „Commit changes"
Dann server.js bearbeiten:
4. Zurück zur Repo-Übersicht → auf server.js klicken → Stift-Symbol (oben rechts, „Edit this file")
5. Die Zeile app.use('/bias', require('./routes/bias')); zu den anderen app.use(...) hinzufügen
6. „Commit changes"

Zuallererst aber: Oben rechts steht „Sign in" — du bist gerade nicht eingeloggt. Ohne Login kannst du keine Dateien anlegen oder committen. Also:

Rechts oben „Sign in" → mit deinem juliengre27-Account anmelden
Dann erscheint bei „Add file" die Option zum Erstellen
Logg dich ein, dann sag Bescheid — ich führe dich durch das Einfügen. Wenn du willst, schau ich mir vorher kurz an, wie deine server.js aufgebaut ist (klick die Datei an und poste einen Screenshot vom Anfang), damit ich dir die app.use-Zeile an der exakt richtigen Stelle zeige und sichergehe, dass sie zu deinem Code-Stil passt.







Claude ist eine KI und kann Fehler machen. Bitte überprüfe die Antworten.
Bias · JS
// ============================================================================
//  PulseMarket · /bias/daily
//  Täglicher Macro/Intermarket/Sentiment-Bias für XAUUSD, EURUSD, NAS100, BTCUSD
//  Quellen: FRED (Yields/VIX) · Binance (BTC) · alternative.me (Crypto F&G)
//           Finnhub (QQQ, EURUSD) · CNN F&G (Aktien)
//  Design: Jede Quelle kann ausfallen → Faktor wird neutral, confidence sinkt.
//  Sprache: Beobachtungen, keine Empfehlungen (BaFin-soft).
// ============================================================================
const express = require('express');
const router = express.Router();
 
const FRED_KEY = process.env.FRED_API_KEY || '';
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';
 
// ---------- Mini-Cache (15 min) ----------
const cache = new Map();
const TTL = 15 * 60 * 1000;
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const v = await fn();
  cache.set(key, { v, t: Date.now() });
  return v;
}
 
// ---------- Fetch-Helper mit Timeout ----------
async function getJSON(url, opts = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(to);
  }
}
 
// ---------- Quellen ----------
// FRED: letzte 12 Beobachtungen einer Serie (Werktage), neueste zuerst
async function fred(seriesId) {
  return cached(`fred:${seriesId}`, async () => {
    if (!FRED_KEY) throw new Error('FRED_API_KEY fehlt');
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=12`;
    const j = await getJSON(url);
    const vals = (j.observations || [])
      .map(o => parseFloat(o.value))
      .filter(v => !isNaN(v));
    if (!vals.length) throw new Error('keine Werte');
    return { latest: vals[0], prev: vals[1] ?? vals[0], week: vals[4] ?? vals[vals.length - 1] };
  });
}
 
async function cryptoFng() {
  return cached('fng:crypto', async () => {
    const j = await getJSON('https://api.alternative.me/fng/?limit=2');
    const d = j?.data?.[0];
    if (!d) throw new Error('leer');
    return { value: parseInt(d.value, 10), label: d.value_classification };
  });
}
 
async function stocksFng() {
  return cached('fng:stocks', async () => {
    const j = await getJSON('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
      headers: { 'User-Agent': 'Mozilla/5.0 (PulseMarket)' }
    });
    const v = j?.fear_and_greed?.score ?? j?.fear_and_greed?.now?.value;
    if (v == null) throw new Error('leer');
    return { value: Math.round(v), label: j?.fear_and_greed?.rating || '' };
  });
}
 
async function btcTicker() {
  return cached('btc:24h', () =>
    getJSON('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'));
}
 
async function btcTrend200() {
  return cached('btc:200d', async () => {
    const k = await getJSON('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=210');
    const closes = k.map(r => parseFloat(r[4]));
    const last = closes[closes.length - 1];
    const ma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / Math.min(200, closes.length);
    return { last, ma200, above: last > ma200 };
  });
}
 
async function btcFunding() {
  return cached('btc:funding', async () => {
    const j = await getJSON('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT');
    return { rate: parseFloat(j.lastFundingRate) };
  });
}
 
async function finnhubQuote(symbol) {
  return cached(`fh:${symbol}`, async () => {
    if (!FINNHUB_KEY) throw new Error('FINNHUB_API_KEY fehlt');
    const j = await getJSON(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`);
    if (!j || !j.c) throw new Error('leer');
    // c=aktuell, pc=Vortagsschluss
    return { price: j.c, prevClose: j.pc, chgPct: j.pc ? (100 * (j.c - j.pc)) / j.pc : 0 };
  });
}
 
// ---------- Faktor-Baukasten ----------
// Jeder Faktor liefert { name, ok, value, points, note }
async function safeFactor(name, fn) {
  try {
    const r = await fn();
    return { name, ok: true, ...r };
  } catch (e) {
    return { name, ok: false, value: null, points: 0, note: `Quelle nicht verfügbar (${e.message}) — neutral gewertet` };
  }
}
 
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
 
// ---------- Instrument-Scorer ----------
async function scoreGold() {
  const factors = await Promise.all([
    safeFactor('US-Realzins 10Y (Δ Woche)', async () => {
      const r = await fred('DFII10');
      const d = r.latest - r.week;
      const points = d <= -0.10 ? 2 : d <= -0.03 ? 1 : d >= 0.10 ? -2 : d >= 0.03 ? -1 : 0;
      return { value: `${r.latest.toFixed(2)}% (${d >= 0 ? '+' : ''}${d.toFixed(2)})`, points, note: points > 0 ? 'Fallende Realzinsen stützen Gold historisch' : points < 0 ? 'Steigende Realzinsen belasten Gold tendenziell' : 'Realzinsen seitwärts' };
    }),
    safeFactor('DXY-Proxy (EURUSD-Momentum)', async () => {
      const q = await finnhubQuote('OANDA:EUR_USD');
      const points = q.chgPct >= 0.3 ? 1 : q.chgPct <= -0.3 ? -1 : 0;
      return { value: `EURUSD ${q.price?.toFixed(4)} (${q.chgPct >= 0 ? '+' : ''}${q.chgPct.toFixed(2)}%)`, points, note: points > 0 ? 'Schwächerer Dollar = Rückenwind für Gold' : points < 0 ? 'Stärkerer Dollar = Gegenwind' : 'Dollar neutral' };
    }),
    safeFactor('VIX-Level', async () => {
      const r = await fred('VIXCLS');
      const points = r.latest >= 25 ? 1 : r.latest <= 14 ? -1 : 0;
      return { value: r.latest.toFixed(1), points, note: points > 0 ? 'Erhöhte Nervosität — Safe-Haven-Nachfrage möglich' : points < 0 ? 'Sehr ruhiger Markt — wenig Absicherungsbedarf' : 'VIX im Normalbereich' };
    }),
    safeFactor('Aktien Fear & Greed', async () => {
      const r = await stocksFng();
      const points = r.value <= 30 ? 1 : r.value >= 75 ? -1 : 0;
      return { value: `${r.value} (${r.label})`, points, note: points > 0 ? 'Risk-off-Stimmung begünstigt Gold' : points < 0 ? 'Starke Risikofreude — Gold weniger gefragt' : 'Sentiment neutral' };
    })
  ]);
  return build('XAUUSD', factors);
}
 
async function scoreEurusd() {
  const factors = await Promise.all([
    safeFactor('US 10Y nominal (Δ Woche)', async () => {
      const r = await fred('DGS10');
      const d = r.latest - r.week;
      const points = d <= -0.10 ? 1 : d >= 0.10 ? -1 : 0;
      return { value: `${r.latest.toFixed(2)}% (${d >= 0 ? '+' : ''}${d.toFixed(2)})`, points, note: points > 0 ? 'Fallende US-Renditen schwächen den Dollar tendenziell' : points < 0 ? 'Steigende US-Renditen stützen den Dollar' : 'US-Renditen seitwärts' };
    }),
    safeFactor('EURUSD-Momentum (Tag)', async () => {
      const q = await finnhubQuote('OANDA:EUR_USD');
      const points = clamp(Math.round(q.chgPct / 0.25), -2, 2);
      return { value: `${q.price?.toFixed(4)} (${q.chgPct >= 0 ? '+' : ''}${q.chgPct.toFixed(2)}%)`, points, note: 'Kurzfristiges Momentum' };
    }),
    safeFactor('Risk-Sentiment (Aktien F&G)', async () => {
      const r = await stocksFng();
      const points = r.value >= 60 ? 1 : r.value <= 30 ? -1 : 0;
      return { value: `${r.value}`, points, note: points > 0 ? 'Risk-on stützt EUR gegen USD leicht' : points < 0 ? 'Risk-off — Dollar als sicherer Hafen gesucht' : 'neutral' };
    })
  ]);
  return build('EURUSD', factors);
}
 
async function scoreNas() {
  const factors = await Promise.all([
    safeFactor('US 10Y (Δ Woche)', async () => {
      const r = await fred('DGS10');
      const d = r.latest - r.week;
      const points = d <= -0.10 ? 2 : d <= -0.03 ? 1 : d >= 0.10 ? -2 : d >= 0.03 ? -1 : 0;
      return { value: `${r.latest.toFixed(2)}% (${d >= 0 ? '+' : ''}${d.toFixed(2)})`, points, note: points > 0 ? 'Fallende Renditen entlasten Tech-Bewertungen' : points < 0 ? 'Steigende Renditen drücken auf Growth' : 'seitwärts' };
    }),
    safeFactor('VIX-Zone', async () => {
      const r = await fred('VIXCLS');
      const points = r.latest <= 16 ? 1 : r.latest >= 25 ? -2 : r.latest >= 20 ? -1 : 0;
      return { value: r.latest.toFixed(1), points, note: points > 0 ? 'Ruhiges Umfeld — trendfreundlich' : points < 0 ? 'Erhöhte Vola — Vorsicht bei Index-Longs' : 'normal' };
    }),
    safeFactor('Aktien Fear & Greed', async () => {
      const r = await stocksFng();
      const points = r.value >= 60 ? 1 : r.value <= 25 ? 1 : r.value <= 40 ? -1 : 0; // Extreme Fear leicht kontrarisch
      return { value: `${r.value} (${r.label})`, points, note: 'Sentiment; extreme Angst wird leicht kontrarisch gewertet' };
    }),
    safeFactor('QQQ-Momentum (Tag)', async () => {
      const q = await finnhubQuote('QQQ');
      const points = q.chgPct >= 0.8 ? 1 : q.chgPct <= -0.8 ? -1 : 0;
      return { value: `${q.price?.toFixed(2)} (${q.chgPct >= 0 ? '+' : ''}${q.chgPct.toFixed(2)}%)`, points, note: 'NAS100-Proxy über QQQ' };
    })
  ]);
  return build('NAS100', factors);
}
 
async function scoreBtc() {
  const factors = await Promise.all([
    safeFactor('Crypto Fear & Greed', async () => {
      const r = await cryptoFng();
      const points = r.value <= 20 ? 2 : r.value <= 35 ? 1 : r.value >= 85 ? -2 : r.value >= 70 ? -1 : 0; // kontrarisch an den Extremen
      return { value: `${r.value} (${r.label})`, points, note: 'Extreme werden kontrarisch gewertet' };
    }),
    safeFactor('Funding Rate (Binance Perp)', async () => {
      const r = await btcFunding();
      const pct = r.rate * 100;
      const points = pct >= 0.05 ? -1 : pct <= -0.01 ? 1 : 0;
      return { value: `${pct.toFixed(3)}%`, points, note: points < 0 ? 'Longs zahlen deutlich — überhitzt' : points > 0 ? 'Negative Funding — Shorts gedrängt' : 'unauffällig' };
    }),
    safeFactor('200-Tage-Trend', async () => {
      const r = await btcTrend200();
      const points = r.above ? 1 : -1;
      return { value: `${Math.round(r.last)} vs MA200 ${Math.round(r.ma200)}`, points, note: r.above ? 'Über MA200 — übergeordneter Aufwärtstrend' : 'Unter MA200 — übergeordneter Abwärtstrend' };
    }),
    safeFactor('24h-Momentum', async () => {
      const t = await btcTicker();
      const chg = parseFloat(t.priceChangePercent);
      const points = chg >= 2 ? 1 : chg <= -2 ? -1 : 0;
      return { value: `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%`, points, note: 'Kurzfrist-Momentum' };
    }),
    safeFactor('Risk-On-Kopplung (QQQ)', async () => {
      const q = await finnhubQuote('QQQ');
      const points = q.chgPct >= 0.8 ? 1 : q.chgPct <= -0.8 ? -1 : 0;
      return { value: `QQQ ${q.chgPct >= 0 ? '+' : ''}${q.chgPct.toFixed(2)}%`, points, note: 'BTC koppelt oft an Tech-Risk-Appetit' };
    })
  ]);
  return build('BTCUSD', factors);
}
 
// ---------- Zusammenbau ----------
function build(instrument, factors) {
  const score = factors.reduce((s, f) => s + (f.points || 0), 0);
  const okCount = factors.filter(f => f.ok).length;
  const confidence = +(okCount / factors.length).toFixed(2);
  const bias = score >= 2 ? 'LONG' : score <= -2 ? 'SHORT' : 'NEUTRAL';
  const arrow = bias === 'LONG' ? '▲' : bias === 'SHORT' ? '▼' : '·';
  const comment =
    bias === 'LONG'
      ? `Makro-Beobachtung: Umfeld spricht aktuell eher für die Long-Seite (Score +${score}).`
      : bias === 'SHORT'
      ? `Makro-Beobachtung: Umfeld spricht aktuell eher für die Short-Seite (Score ${score}).`
      : `Makro-Beobachtung: kein klares Übergewicht (Score ${score >= 0 ? '+' : ''}${score}) — Tagesstruktur entscheidet.`;
  return { instrument, bias, arrow, score, confidence, factors, comment };
}
 
// ---------- Route ----------
router.get('/daily', async (req, res) => {
  try {
    const wanted = (req.query.instrument || '').toUpperCase();
    const jobs = {
      XAUUSD: scoreGold,
      EURUSD: scoreEurusd,
      NAS100: scoreNas,
      BTCUSD: scoreBtc
    };
    const keys = wanted && jobs[wanted] ? [wanted] : Object.keys(jobs);
    const results = await Promise.all(keys.map(k => jobs[k]()));
    const out = {};
    results.forEach(r => (out[r.instrument] = r));
    res.json({
      asOf: new Date().toISOString(),
      disclaimer:
        'Markt-Beobachtungen auf Basis öffentlicher Daten — keine Anlageberatung, keine Handelsempfehlung.',
      instruments: out
    });
  } catch (e) {
    res.status(500).json({ error: 'bias_failed', detail: e.message });
  }
});
 
module.exports = router;
 














