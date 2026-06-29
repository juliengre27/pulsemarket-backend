<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PulseMarket — News Trading Cockpit</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

:root{
  --bg: #0a0a0a;
  --bg-card: #131313;
  --bg-elevated: #1a1a1a;
  --purple: #c9a23a;
  --purple-l: #e8b94d;
  --gold: #c9a23a;
  --gold-l: #e8b94d;
  --text: #f5f4f0;
  --text2: #8a8a85;
  --text3: #555550;
  --border: rgba(255,255,255,0.08);
  --green: #2d9d6f;
  --green-l: #4ade80;
  --red: #c0392b;
  --red-l: #ef5350;
  --amber: #c9a23a;
  --amber-l: #e8b94d;
}

*{box-sizing:border-box;margin:0;padding:0}

body{
  font-family:'Inter',sans-serif;
  background:var(--bg);
  color:var(--text);
  min-height:100vh;
}

.mono{font-family:'JetBrains Mono',monospace}

.container{
  max-width:1480px;
  margin:0 auto;
  padding:32px 40px 100px;
}

/* HERO SECTION */
.hero{
  position:relative;
  border-radius:24px;
  padding:0;
  margin-bottom:24px;
  overflow:hidden;
  background:#0a0a0a;
  border:1px solid rgba(255,255,255,0.06);
}

.hero::before{
  content:'';
  position:absolute;
  top:0;left:-30%;
  width:30%;height:100%;
  background:linear-gradient(90deg, transparent, rgba(201,162,58,0.08), transparent);
  animation:heroScan 6s linear infinite;
  pointer-events:none;
  z-index:0;
}

@keyframes heroScan{
  0%{left:-30%;}
  100%{left:130%;}
}

.hero::after{
  content:'';
  position:absolute;
  top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg, transparent, var(--gold-l), transparent);
  background-size:50% 100%;
  background-repeat:no-repeat;
  animation:heroTopLine 4s linear infinite;
  pointer-events:none;
  z-index:1;
  opacity:0.6;
}

@keyframes heroTopLine{
  0%{background-position:-100% 0;}
  100%{background-position:200% 0;}
}

.hero-top{
  position:relative;
  padding:32px 36px 28px;
  overflow:hidden;
}



.hero-chart-bg{
  position:absolute;
  top:0;left:0;right:0;bottom:0;
  opacity:0.28;
  pointer-events:none;
  mask-image:linear-gradient(180deg, rgba(0,0,0,0.9) 0%, transparent 90%);
  will-change:transform;
}

.hero-watermark{
  position:absolute;
  top:0;left:0;right:0;bottom:0;
  display:flex;align-items:center;
  font-size:64px;font-weight:600;letter-spacing:-0.03em;
  color:rgba(255,255,255,0.025);
  line-height:1.05;
  padding:0 36px;
  pointer-events:none;
  z-index:1;
  overflow:hidden;
  white-space:nowrap;
  will-change:transform;
  animation:watermarkDrift 14s ease-in-out infinite;
}

@keyframes watermarkDrift{
  0%, 100%{transform:translate3d(0px, 0px, 0px)}
  50%{transform:translate3d(-32px, 0px, 0px)}
}

.hero-content{position:relative;z-index:2;will-change:transform}

.hero-eyebrow{
  display:inline-flex;align-items:center;gap:6px;
  font-size:11px;font-weight:600;color:var(--gold-l);
  text-transform:uppercase;letter-spacing:0.08em;
  margin-bottom:14px;
}

.hero-title{
  font-size:38px;font-weight:600;letter-spacing:-0.025em;
  line-height:1.12;margin-bottom:10px;
  background:linear-gradient(135deg, #ffffff 25%, var(--purple-l) 100%);
  -webkit-background-clip:text;background-clip:text;
  -webkit-text-fill-color:transparent;
  max-width:560px;
}

.hero-sub{font-size:14.5px;color:var(--text2);margin-bottom:0;max-width:480px;line-height:1.55}

/* APPLE HEALTH STYLE STAT GRID */
.stat-grid-hero{
  position:relative;z-index:2;
  display:grid;
  grid-template-columns:repeat(3, 1fr);
  border-top:1px solid rgba(255,255,255,0.07);
}
.stat-card-hero{
  padding:22px 28px 26px;
  border-right:1px solid rgba(255,255,255,0.07);
  position:relative;
  transition:background .15s;
}
.stat-card-hero:last-child{border-right:none}
.stat-card-hero:hover{background:rgba(255,255,255,0.02)}

.stat-card-icon{
  display:flex;align-items:center;justify-content:center;
  width:30px;height:30px;border-radius:9px;
  margin-bottom:14px;
}
.stat-card-icon.ic-gold,
.stat-card-icon.ic-nas,
.stat-card-icon.ic-btc{background:rgba(201,162,58,0.12)}

.stat-card-label{
  font-size:12px;font-weight:500;color:var(--text2);
  margin-bottom:6px;
}
.stat-card-value{
  font-size:30px;font-weight:600;letter-spacing:-0.02em;
  line-height:1;margin-bottom:8px;
  display:flex;align-items:baseline;gap:8px;
}
.stat-card-trend{
  font-size:13px;font-weight:500;
  display:flex;align-items:center;gap:4px;
}
.stat-card-trend.t-bull{color:var(--green-l)}
.stat-card-trend.t-bear{color:var(--red-l)}
.stat-card-trend.fng-extreme-fear{color:var(--red-l)}
.stat-card-trend.fng-fear{color:#e0935a}
.stat-card-trend.fng-neutral{color:var(--text2)}
.stat-card-trend.fng-greed{color:#9ad17a}
.stat-card-trend.fng-extreme-greed{color:var(--green-l)}
.stat-card-source{
  font-size:10px;color:var(--text3);margin-top:6px;
}
.stat-card-sparkline{
  position:absolute;bottom:0;right:0;width:90px;height:36px;opacity:0.5;
}

.sentiment-row{display:none}
.sentiment-chip{display:none}
.sentiment-asset{display:none}
.sentiment-dir{display:none}

.brand{display:flex;align-items:center;gap:11px}

.brand-icon{
  width:36px;height:36px;
  border-radius:10px;
  background:linear-gradient(135deg, #1c1810, #0a0a0a);
  border:1px solid rgba(232,163,28,0.25);
  display:flex;align-items:center;justify-content:center;
  flex-shrink:0;
}

.brand-name{font-size:18px;font-weight:600;letter-spacing:-0.015em}
.brand-tag{font-size:11px;color:var(--text2);margin-top:1px}

.live-status{
  display:flex;align-items:center;gap:6px;
  font-size:12px;color:var(--text2);
}
.live-dot{
  width:6px;height:6px;border-radius:50%;
  background:var(--green-l);
  box-shadow:0 0 0 0 rgba(52,211,153,0.5);
  animation:pulse 2s infinite;
}
@keyframes pulse{
  0%{box-shadow:0 0 0 0 rgba(52,211,153,0.4)}
  70%{box-shadow:0 0 0 6px rgba(52,211,153,0)}
  100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}
}

/* HERO SPLIT LAYOUT — headline left, calendar right */
.hero-split{
  display:grid;
  grid-template-columns:1fr 300px;
  gap:32px;
  align-items:start;
}
.hero-split-left{min-width:0}
.hero-split-right{
  background:rgba(255,255,255,0.04);
  border:1px solid rgba(255,255,255,0.09);
  border-radius:16px;
  padding:18px 20px;
  min-width:0;
}
.header-calendar-label{
  font-size:11px;font-weight:600;color:var(--gold-l);
  text-transform:uppercase;letter-spacing:0.06em;
  margin-bottom:12px;
}
.header-calendar-list{display:flex;flex-direction:column;gap:11px}
.header-cal-item{display:flex;align-items:flex-start;gap:9px}
.header-cal-item-dot{
  width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:5px;
}
.header-cal-item-dot.impact-high-dot{background:var(--red-l)}
.header-cal-item-dot.impact-medium-dot{background:var(--gold-l)}
.header-cal-item-body{min-width:0;flex:1}
.header-cal-item-time{font-size:12.5px;color:var(--gold-l);font-weight:600}
.header-cal-item-title{
  font-size:13px;color:var(--text);font-weight:500;line-height:1.4;
  margin-top:2px;
}
.header-cal-empty{font-size:12.5px;color:var(--text3)}

@media (max-width:760px){
  .hero-split{grid-template-columns:1fr}
  .hero-split-right{order:-1}
}

@media (max-width:760px){
  .header-calendar{display:none}
}

/* FILTER PILLS */
.filters{
  display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;
}
.pill{
  padding:7px 14px;
  border-radius:8px;
  border:1px solid var(--border);
  background:transparent;
  color:var(--text2);
  font-size:12.5px;
  font-weight:500;
  cursor:pointer;
  font-family:'Inter',sans-serif;
  transition:all .15s;
}
.pill:hover{background:var(--bg-elevated)}
.pill.active{
  background:var(--gold);
  color:#0a0a0a;
  border-color:var(--gold);
}

/* WARN BANNER */
.warn-banner{
  display:flex;align-items:center;gap:10px;
  padding:13px 16px;
  border-radius:10px;
  background:rgba(220,38,38,0.08);
  border:1px solid rgba(220,38,38,0.25);
  margin-bottom:20px;
  font-size:13px;
  color:var(--red-l);
}
.warn-banner svg{flex-shrink:0}
.warn-banner b{color:#fff;font-weight:600}

/* SECTION LABEL */
.section-label{
  font-size:11.5px;
  font-weight:600;
  color:var(--text3);
  text-transform:uppercase;
  letter-spacing:0.06em;
  margin:28px 0 12px;
  display:flex;align-items:center;gap:8px;
}
.section-label::after{
  content:'';
  flex:1;
  height:1px;
  background:var(--border);
}

/* NEWS CARD */
.news-card{
  background:var(--bg-card);
  border:1px solid var(--border);
  border-radius:14px;
  padding:16px 18px;
  margin-bottom:12px;
  transition:border-color .15s;
}
.news-card:hover{border-color:rgba(201,162,58,0.25)}

.news-top{
  display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
  margin-bottom:10px;
}
.news-left{display:flex;gap:12px}
.news-time{
  font-size:12.5px;color:var(--text2);min-width:48px;font-weight:500;
  padding-top:1px;
}
.news-title{font-size:14.5px;font-weight:500;color:var(--text);margin-bottom:2px;line-height:1.4}
.news-source{font-size:11.5px;color:var(--text3)}

.impact-badge{
  font-size:10.5px;font-weight:600;
  padding:3px 9px;border-radius:6px;
  text-transform:uppercase;letter-spacing:0.03em;
  white-space:nowrap;flex-shrink:0;
}
.impact-high{background:rgba(220,38,38,0.15);color:var(--red-l)}
.impact-medium{background:rgba(201,168,76,0.15);color:var(--amber-l)}
.impact-low{background:rgba(139,133,176,0.15);color:var(--text2)}

.data-row{
  display:flex;gap:20px;margin:12px 0;
  padding:10px 0;
  border-top:1px solid var(--border);
  border-bottom:1px solid var(--border);
}
.data-item{display:flex;flex-direction:column;gap:3px}
.data-label{font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:0.04em}
.data-val{font-size:15px;font-weight:600}
.val-beat{color:var(--green-l)}
.val-miss{color:var(--red-l)}
.val-neutral{color:var(--text)}

.explain-box{
  background:rgba(201,162,58,0.06);
  border-radius:9px;
  padding:13px 15px;
  font-size:12.5px;
  line-height:1.65;
  color:var(--text2);
  margin:10px 0;
}
.explain-section{margin-bottom:10px}
.explain-section:last-child{margin-bottom:0}
.explain-label{
  font-size:10px;font-weight:600;color:var(--purple-l);
  text-transform:uppercase;letter-spacing:0.05em;
  margin-bottom:4px;display:flex;align-items:center;gap:5px;
}
.explain-label.future{color:var(--gold-l)}
.explain-text{color:var(--text2)}

.asset-impacts{
  display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;
}
.asset-tag{
  display:flex;align-items:center;gap:5px;
  font-size:11.5px;font-weight:500;
  padding:5px 11px;border-radius:7px;
}
.tag-bull{background:rgba(5,150,105,0.12);color:var(--green-l)}
.tag-bear{background:rgba(220,38,38,0.12);color:var(--red-l)}
.tag-neutral{background:rgba(139,133,176,0.1);color:var(--text2)}

.tv-link{
  display:inline-flex;align-items:center;gap:5px;
  margin-top:12px;
  font-size:12.5px;
  color:var(--purple-l);
  text-decoration:none;
  cursor:pointer;
  background:none;border:none;
  font-family:'Inter',sans-serif;
  padding:0;
}
.tv-link:hover{color:var(--gold-l)}

.upcoming{opacity:0.65}

/* FOOTER */
.footer-note{
  margin-top:32px;
  padding:16px;
  border-radius:10px;
  background:var(--bg-card);
  border:1px solid var(--border);
  font-size:12px;
  color:var(--text3);
  line-height:1.6;
  text-align:center;
}

/* MAIN TABS */
.main-tabs{
  display:flex;gap:4px;margin-bottom:24px;
  background:var(--bg-card);
  border:1px solid var(--border);
  border-radius:12px;padding:4px;
  max-width:420px;
}
.main-tab{
  flex:1;padding:9px;border-radius:7px;
  border:none;background:transparent;
  color:var(--text2);font-size:13px;font-weight:500;
  cursor:pointer;font-family:'Inter',sans-serif;
  transition:all .15s;
  display:flex;align-items:center;justify-content:center;gap:6px;
}
.main-tab.active{background:var(--gold);color:#0a0a0a}
.journal-count-badge{
  background:rgba(255,255,255,0.2);
  border-radius:10px;padding:1px 7px;font-size:10.5px;
}
.view-hidden{display:none}

/* DASHBOARD GRID — two columns for wider layout */
.dashboard-grid{
  display:grid;
  grid-template-columns:1fr 320px;
  gap:24px;
  align-items:start;
}
.main-column{min-width:0}
.side-column{min-width:0;position:sticky;top:24px}

@media (max-width:920px){
  .dashboard-grid{grid-template-columns:1fr}
  .side-column{position:static}
}

/* JOURNAL */
.journal-intro{
  font-size:12.5px;color:var(--text2);line-height:1.6;
  margin-bottom:18px;padding:13px 15px;
  background:rgba(201,162,58,0.06);border-radius:9px;
}

.journal-stats{
  display:grid;grid-template-columns:repeat(3,1fr);gap:10px;
  margin-bottom:20px;
}
.stat-card{
  background:var(--bg-card);border:1px solid var(--border);
  border-radius:12px;padding:14px;text-align:center;
}
.stat-card-val{font-size:22px;font-weight:600}
.stat-card-label{font-size:10.5px;color:var(--text3);margin-top:4px;
  text-transform:uppercase;letter-spacing:0.03em}

.journal-form{
  background:var(--bg-card);border:1px solid var(--border);
  border-radius:14px;padding:18px;margin-bottom:24px;
}
.form-row{display:flex;gap:12px;margin-bottom:14px}
.form-row:last-of-type{margin-bottom:0}
.form-field{flex:1}
.form-field label{
  display:block;font-size:11px;color:var(--text2);
  margin-bottom:6px;font-weight:500;
}
.form-field select, .form-field input{
  width:100%;padding:9px 11px;border-radius:8px;
  border:1px solid var(--border);background:var(--bg-elevated);
  color:var(--text);font-size:13px;font-family:'Inter',sans-serif;
}
.form-field select:focus, .form-field input:focus{
  outline:none;border-color:var(--purple);
}

.toggle-group{display:flex;gap:6px}
.toggle-btn{
  flex:1;padding:9px 8px;border-radius:8px;
  border:1px solid var(--border);background:var(--bg-elevated);
  color:var(--text2);font-size:12px;font-weight:500;
  cursor:pointer;font-family:'Inter',sans-serif;
  transition:all .15s;
}
.toggle-btn.active{background:var(--gold);color:#0a0a0a;border-color:var(--gold)}
.toggle-btn.result-win.active{background:var(--green);border-color:var(--green)}
.toggle-btn.result-loss.active{background:var(--red);border-color:var(--red)}
.toggle-btn.result-be.active{background:var(--amber);border-color:var(--amber)}

.add-trade-btn{
  width:100%;padding:11px;margin-top:16px;
  border-radius:9px;border:none;
  background:var(--gold);color:#1a1408;
  font-size:13.5px;font-weight:600;
  cursor:pointer;font-family:'Inter',sans-serif;
  transition:opacity .15s;
}
.add-trade-btn:hover{opacity:0.88}

.journal-item{
  background:var(--bg-card);border:1px solid var(--border);
  border-radius:12px;padding:13px 16px;margin-bottom:8px;
  display:flex;align-items:center;justify-content:space-between;gap:12px;
}
.journal-item-left{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
.journal-item-asset{font-size:13.5px;font-weight:600;min-width:62px}
.journal-item-meta{font-size:11.5px;color:var(--text3)}
.journal-item-note{font-size:11.5px;color:var(--text2);font-style:italic;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
.journal-item-badges{display:flex;gap:6px;flex-shrink:0}
.j-badge{font-size:10px;font-weight:600;padding:3px 8px;border-radius:6px}
.j-checked-yes{background:rgba(201,162,58,0.15);color:var(--purple-l)}
.j-checked-no{background:rgba(139,133,176,0.12);color:var(--text2)}
.j-result-win{background:rgba(5,150,105,0.15);color:var(--green-l)}
.j-result-loss{background:rgba(220,38,38,0.15);color:var(--red-l)}
.j-result-be{background:rgba(201,168,76,0.15);color:var(--amber-l)}
.journal-delete{
  background:none;border:none;color:var(--text3);
  cursor:pointer;padding:4px;font-size:14px;flex-shrink:0;
}
.journal-delete:hover{color:var(--red-l)}

.journal-empty{
  text-align:center;padding:30px 16px;color:var(--text3);font-size:13px;
}

.reset-journal-btn{
  width:100%;margin-top:16px;padding:10px;
  border-radius:9px;border:1px solid var(--border);
  background:transparent;color:var(--text3);font-size:12px;
  cursor:pointer;font-family:'Inter',sans-serif;
}
.reset-journal-btn:hover{color:var(--red-l);border-color:rgba(220,38,38,0.3)}

@media (max-width:480px){
  .form-row{flex-direction:column;gap:10px}
  .journal-stats{grid-template-columns:repeat(3,1fr);gap:8px}
  .stat-card{padding:10px}
  .stat-card-val{font-size:18px}
  .journal-item-note{display:none}
}

/* AI ASK BOX */
.ai-ask-box{
  background:var(--bg-card);border:1px solid var(--border);
  border-radius:14px;padding:16px 18px;margin-bottom:20px;
}
.ai-ask-label{
  font-size:11px;font-weight:600;color:var(--purple-l);
  text-transform:uppercase;letter-spacing:0.05em;
  margin-bottom:10px;display:flex;align-items:center;gap:6px;
}
.ai-ask-input-row{display:flex;gap:8px}
.ai-ask-input{
  flex:1;padding:10px 13px;border-radius:9px;
  border:1px solid var(--border);background:var(--bg-elevated);
  color:var(--text);font-size:13px;font-family:'Inter',sans-serif;
}
.ai-ask-input:focus{outline:none;border-color:var(--purple)}
.ai-ask-btn{
  padding:10px 16px;border-radius:9px;border:none;
  background:var(--purple);color:#fff;font-size:13px;font-weight:500;
  cursor:pointer;font-family:'Inter',sans-serif;
  display:flex;align-items:center;gap:6px;white-space:nowrap;
  transition:opacity .15s;
}
.ai-ask-btn:hover{opacity:0.88}
.ai-ask-btn:disabled{opacity:0.5;cursor:not-allowed}
.ai-quick-questions{display:flex;flex-direction:column;gap:8px;margin-top:2px}
.ai-quick-q{width:100%}
.ai-quick-q{
  font-size:12.5px;font-weight:500;padding:9px 14px;border-radius:9px;
  border:1px solid var(--border);background:var(--bg-elevated);
  color:var(--text2);cursor:pointer;font-family:'Inter',sans-serif;
  transition:all .15s;
  display:flex;align-items:center;gap:6px;
}
.ai-quick-q::before{
  content:'';width:6px;height:6px;border-radius:50%;
  background:var(--purple-l);flex-shrink:0;
}
.ai-quick-q:hover{background:var(--gold);color:#0a0a0a;border-color:var(--gold)}
.ai-quick-q:hover::before{background:#0a0a0a}
.ai-quick-q.active{background:var(--gold);color:#0a0a0a;border-color:var(--gold)}
.ai-quick-q.active::before{background:#0a0a0a}
.ai-answer-box{
  margin-top:14px;padding:14px 16px;border-radius:10px;
  background:rgba(201,162,58,0.06);border:1px solid var(--border);
  font-size:13px;line-height:1.65;color:var(--text2);
  display:none;
}
.ai-answer-box.visible{display:block}
.ai-answer-question{
  font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;
  display:flex;align-items:center;gap:6px;
}
.ai-loading{
  display:flex;align-items:center;gap:8px;color:var(--text3);font-size:12.5px;
}
.ai-spinner{
  width:13px;height:13px;border-radius:50%;
  border:2px solid var(--border);border-top-color:var(--purple-l);
  animation:spin 0.7s linear infinite;
}
@keyframes spin{to{transform:rotate(360deg)}}
.ai-error{color:var(--red-l)}

/* GEOPOLITICS — MAIN COLUMN, PREMIUM CARDS */
.geo-loading{
  text-align:center;padding:40px 20px;color:var(--text3);font-size:13px;
}
.geo-item{
  display:flex;flex-direction:column;gap:10px;
  background:var(--bg-card);border:1px solid var(--border);
  border-radius:16px;padding:20px 22px;margin-bottom:12px;
  text-decoration:none;color:inherit;
  transition:border-color .15s, transform .15s;
  position:relative;
  overflow:hidden;
}
.geo-item::before{
  content:'';position:absolute;left:0;top:0;bottom:0;width:3px;
  background:linear-gradient(180deg, var(--red-l), var(--gold));
  opacity:0.7;
}
.geo-item:hover{border-color:rgba(232,163,28,0.35);transform:translateX(2px)}
.geo-item-top{display:flex;align-items:center;gap:8px;justify-content:space-between}
.geo-item-badge{
  font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;
  padding:3px 9px;border-radius:6px;
  background:rgba(220,38,38,0.12);color:var(--red-l);
  display:inline-flex;align-items:center;gap:4px;
}
.geo-item-meta{font-size:11.5px;color:var(--text3)}
.geo-item-title{font-size:16px;font-weight:500;color:var(--text);line-height:1.4}
.geo-item-link-row{
  display:flex;align-items:center;gap:5px;font-size:12px;color:var(--gold-l);
  margin-top:2px;
}
.geo-empty{
  text-align:center;padding:40px 20px;color:var(--text3);font-size:13px;
  background:var(--bg-card);border:1px solid var(--border);border-radius:16px;
}

/* CALENDAR BOX — SIDEBAR, COMPACT */
.calendar-box{
  background:var(--bg-card);border:1px solid var(--border);
  border-radius:14px;padding:16px 18px;margin-top:16px;
}
.calendar-box-label{
  font-size:11px;font-weight:600;color:var(--purple-l);
  text-transform:uppercase;letter-spacing:0.05em;
  margin-bottom:12px;
}

@media (max-width:480px){
  .ai-ask-input-row{flex-direction:column}
  .ai-ask-btn{justify-content:center}
}

/* LIVE EVENTS — COMPACT, SIDEBAR */
.live-events-loading{
  text-align:center;padding:16px;color:var(--text3);font-size:12.5px;
}
.live-event-card{
  display:flex;flex-direction:column;gap:4px;
  background:var(--bg-elevated);border:1px solid var(--border);
  border-radius:9px;padding:9px 11px;margin-bottom:7px;
}
.live-event-left{display:flex;align-items:baseline;gap:8px;min-width:0}
.live-event-time{font-size:11px;color:var(--purple-l);min-width:38px;font-weight:600;flex-shrink:0}
.live-event-info{min-width:0;flex:1}
.live-event-title{font-size:12px;font-weight:500;color:var(--text);line-height:1.35}
.live-event-country{font-size:10px;color:var(--text3);margin-top:1px}
.live-event-data{display:flex;gap:8px;font-size:10.5px;margin-top:4px}
.live-event-data span{color:var(--text2)}
.live-event-data b{color:var(--text);font-weight:500}
.live-event-impact-row{display:flex;justify-content:flex-end;margin-top:-18px}
.live-events-empty{
  text-align:center;padding:16px;color:var(--text3);font-size:12px;
  background:var(--bg-elevated);border:1px solid var(--border);border-radius:9px;
}
.live-events-fallback-note{
  font-size:10.5px;color:var(--amber-l);margin-bottom:8px;
  padding:7px 10px;background:rgba(201,168,76,0.08);border-radius:7px;
}

@media (max-width:480px){
  .data-row{gap:14px}
  .news-left{gap:8px}
}
</style>
</head>
<body>

<div class="container">

  <div class="hero" id="hero-outer">
    <div class="hero-top" id="hero-top">
      <canvas id="hero-chart-canvas" class="hero-chart-bg"></canvas>
      <div class="hero-watermark" id="hero-watermark">Know what moves the market — before it moves.</div>
      <div class="hero-content" id="hero-content-inner">
        <div class="header">
          <div class="brand">
            <div class="brand-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#9c8a4a" stroke-width="1"/>
                <path d="M4 12h3l2 6 4-12 2 6h5" stroke="#e8b94d" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              </svg>
            </div>
            <div>
              <div class="brand-name">PulseMarket</div>
            </div>
          </div>
          <div class="live-status">
            <span class="live-dot"></span>
            <span id="live-clock" class="mono">Live</span>
          </div>
        </div>

        <div class="hero-split">
          <div class="hero-split-left">
            <div class="hero-eyebrow">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              Markt-Cockpit · Live
            </div>
            <div class="hero-title">Der Markt bewegt sich.<br>Du weißt zuerst, warum.</div>
            <div class="hero-sub">Wirtschaftskalender, Geopolitik und KI-Erklärungen für Gold, NAS100 und Bitcoin — an einem Ort, in Klartext.</div>
          </div>
          <div class="hero-split-right">
            <div class="header-calendar-label">Heute im Kalender</div>
            <div id="header-cal-list" class="header-calendar-list"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="stat-grid-hero">
      <div class="stat-card-hero">
        <div class="stat-card-icon ic-gold">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8b94d" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9 9h3a2 2 0 010 4H9m3 0h2M9 9v6"/></svg>
        </div>
        <div class="stat-card-label">Gold · Fear &amp; Greed</div>
        <div class="stat-card-value" id="fng-gold-score">—</div>
        <div class="stat-card-trend" id="fng-gold-label">Lädt...</div>
        <div class="stat-card-source" id="fng-gold-source"></div>
      </div>

      <div class="stat-card-hero">
        <div class="stat-card-icon ic-nas">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8b94d" stroke-width="2"><path d="M3 17l6-6 4 4 8-8M21 7v6"/></svg>
        </div>
        <div class="stat-card-label">NAS100 · Fear &amp; Greed</div>
        <div class="stat-card-value" id="fng-nas-score">—</div>
        <div class="stat-card-trend" id="fng-nas-label">Lädt...</div>
        <div class="stat-card-source" id="fng-nas-source"></div>
      </div>

      <div class="stat-card-hero">
        <div class="stat-card-icon ic-btc">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8b94d" stroke-width="2"><path d="M6 3v18M6 8h9a3 3 0 010 6H6m0 0h10a3 3 0 010 6H6"/></svg>
        </div>
        <div class="stat-card-label">Bitcoin · Fear &amp; Greed</div>
        <div class="stat-card-value" id="fng-btc-score">—</div>
        <div class="stat-card-trend" id="fng-btc-label">Lädt...</div>
        <div class="stat-card-source" id="fng-btc-source"></div>
      </div>
    </div>
  </div>

  <div id="api-status" style="font-size:11px;color:var(--text3);margin-bottom:16px;text-align:right">Verbinde mit Finnhub...</div>

  <div class="main-tabs">
    <button class="main-tab active" data-view="feed">News Feed</button>
    <button class="main-tab" data-view="journal">Trade Journal <span id="journal-count" class="journal-count-badge" style="display:none">0</span></button>
  </div>

  <div id="feed-wrapper">
  <div class="dashboard-grid">
  <div class="main-column">
  <div class="filters">
    <button class="pill active" data-filter="all">Alle</button>
    <button class="pill" data-filter="gold">Gold</button>
    <button class="pill" data-filter="nas">NAS100</button>
    <button class="pill" data-filter="btc">BTC</button>
  </div>

  <div class="warn-banner" id="warn-banner">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
    <span>Hoher Impact in <b id="mins-away">13</b> Minuten — Fed Sprecher Rede um 16:00 Uhr. Position prüfen.</span>
  </div>

  <div class="section-label">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20"/></svg>
    Geopolitik · Markt-relevant · Live
  </div>

  <div id="geo-feed-container">
    <div class="geo-loading">Lade geopolitische News...</div>
  </div>

  <div class="footer-note">
    Live via FinancialJuice · aktualisiert alle 3 Minuten · nur markt-relevante Meldungen
  </div>
  </div>

  <div class="side-column">
    <div class="ai-ask-box">
      <div class="ai-ask-label">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        Warum bewegt sich der Markt?
      </div>
      <div class="ai-quick-questions" id="ai-quick-questions">
        <button class="ai-quick-q" data-asset="gold">Warum bewegt sich Gold?</button>
        <button class="ai-quick-q" data-asset="nas">Warum bewegt sich NAS100?</button>
        <button class="ai-quick-q" data-asset="btc">Warum bewegt sich Bitcoin?</button>
        <button class="ai-quick-q" data-asset="caution">Heute besonders vorsichtig?</button>
      </div>
      <div class="ai-answer-box" id="ai-answer-box"></div>
    </div>

    <div id="live-events-container" style="display:none"></div>
  </div>

  </div>
  </div>

  <div id="journal-section" class="view-hidden">

    <div class="journal-intro">
      Trägst du jeden Trade ein, siehst du nach ein paar Wochen ehrlich, ob PulseMarket deine Trefferquote wirklich verbessert — nicht nur das Gefühl.
    </div>

    <div class="journal-stats" id="journal-stats"></div>

    <div class="journal-form">
      <div class="form-row">
        <div class="form-field">
          <label>Asset</label>
          <select id="f-asset">
            <option value="Gold">Gold</option>
            <option value="NAS100">NAS100</option>
            <option value="BTC">BTC</option>
            <option value="EUR/USD">EUR/USD</option>
          </select>
        </div>
        <div class="form-field">
          <label>Richtung</label>
          <select id="f-direction">
            <option value="Long">Long</option>
            <option value="Short">Short</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label>PulseMarket vorher gecheckt?</label>
          <div class="toggle-group">
            <button class="toggle-btn active" data-check="yes">Ja</button>
            <button class="toggle-btn" data-check="no">Nein</button>
          </div>
        </div>
        <div class="form-field">
          <label>Ergebnis</label>
          <div class="toggle-group">
            <button class="toggle-btn result-win active" data-result="win">Gewinn</button>
            <button class="toggle-btn result-loss" data-result="loss">Verlust</button>
            <button class="toggle-btn result-be" data-result="be">Break-Even</button>
          </div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-field" style="flex:1">
          <label>Notiz (optional)</label>
          <input type="text" id="f-note" placeholder="z.B. nach GDP-Release, Higher Low bestätigt">
        </div>
      </div>

      <button class="add-trade-btn" id="add-trade-btn">+ Trade eintragen</button>
    </div>

    <div class="section-label">Verlauf</div>
    <div id="journal-list"></div>

    <button class="reset-journal-btn" id="reset-journal-btn">Journal zurücksetzen</button>

  </div>

</div>

<script>
// Live Finnhub fetch — economic calendar
// Läuft über deinen Backend-Server (Railway), damit der Finnhub-Key
// nicht im Frontend sichtbar ist. So kann diese Seite sicher geteilt werden.
const BACKEND_URL = 'https://pulsemarket-backend-production.up.railway.app';
let latestLiveEvents = [];

async function fetchLiveCalendar(){
  const statusEl = document.getElementById('api-status');
  try {
    const res = await fetch(`${BACKEND_URL}/calendar/today`);
    if(!res.ok) throw new Error('Backend request failed: ' + res.status);
    const data = await res.json();
    if(statusEl) statusEl.textContent = 'Live verbunden · ' + (data.count || 0) + ' Events heute';
    console.log('Kalenderdaten vom Backend:', data);
    renderLiveEvents(data.events || []);
    return data;
  } catch(err) {
    if(statusEl) statusEl.textContent = 'Backend noch nicht verbunden — Beispieldaten werden angezeigt';
    console.warn('Backend-Anfrage fehlgeschlagen (erwartet bis Railway eingerichtet ist):', err);
    renderLiveEvents(null);
    return null;
  }
}

function impactClass(impact){
  if(impact === 'High') return 'impact-high';
  if(impact === 'Medium') return 'impact-medium';
  return 'impact-low';
}

function impactLabelDe(impact){
  if(impact === 'High') return 'Hoch';
  if(impact === 'Medium') return 'Mittel';
  return 'Niedrig';
}

function renderLiveEvents(events){
  const container = document.getElementById('live-events-container');
  if(!container) return;

  if(events === null){
    latestLiveEvents = [];
    container.innerHTML = '<div class="live-events-empty">Live-Kalender konnte nicht geladen werden. Backend prüfen.</div>';
    return;
  }

  latestLiveEvents = events;

  const highImpact = events.filter(ev => ev.impact === 'High');
  const displayEvents = highImpact.length > 0 ? highImpact : events.filter(ev => ev.impact === 'Medium');
  const isFallback = highImpact.length === 0 && displayEvents.length > 0;

  if(events.length === 0){
    container.innerHTML = '<div class="live-events-empty">Keine weiteren Events für heute im Kalender.</div>';
    return;
  }

  if(displayEvents.length === 0){
    container.innerHTML = '<div class="live-events-empty">Ruhiger Tag — keine markt-relevanten High-Impact Events heute.</div>';
    return;
  }

  const fallbackNote = isFallback
    ? '<div class="live-events-fallback-note">Kein High-Impact Event heute — die wichtigsten Medium-Impact Events stattdessen.</div>'
    : '';

  container.innerHTML = fallbackNote + displayEvents.map(ev => {
    const dataHtml = (ev.actual || ev.forecast || ev.previous)
      ? `<div class="live-event-data">
           ${ev.actual ? `<span>Actual <b>${ev.actual}</b></span>` : ''}
           ${ev.forecast ? `<span>Forecast <b>${ev.forecast}</b></span>` : ''}
           ${ev.previous ? `<span>Previous <b>${ev.previous}</b></span>` : ''}
         </div>`
      : '';
    return `
      <div class="live-event-card" data-asset="${(ev.assets || []).join(',')}">
        <div class="live-event-left">
          <span class="live-event-time mono">${ev.time}</span>
          <div class="live-event-info">
            <div class="live-event-title">${ev.title}</div>
            <div class="live-event-country">${ev.country}</div>
          </div>
        </div>
        ${dataHtml}
        <span class="impact-badge ${impactClass(ev.impact)}">${impactLabelDe(ev.impact)}</span>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.live-event-card').forEach(card => {
    const activeFilter = document.querySelector('.pill.active')?.dataset.filter || 'all';
    const assets = card.dataset.asset || '';
    card.style.display = (activeFilter === 'all' || assets.includes(activeFilter)) ? 'flex' : 'none';
  });

  updateHeaderCalendar(events);
}

// ============ HEADER CALENDAR WIDGET ============
function updateHeaderCalendar(events){
  const listEl = document.getElementById('header-cal-list');
  if(!listEl) return;

  if(!events || events.length === 0){
    listEl.innerHTML = '<span class="header-cal-empty">Keine Events heute</span>';
    return;
  }

  const highImpact = events.filter(ev => ev.impact === 'High');
  const relevant = highImpact.length > 0 ? highImpact : events.filter(ev => ev.impact === 'Medium');
  const display = relevant.length > 0 ? relevant : events;

  listEl.innerHTML = display.slice(0, 4).map(ev => `
    <div class="header-cal-item">
      <span class="header-cal-item-dot ${ev.impact === 'High' ? 'impact-high-dot' : 'impact-medium-dot'}"></span>
      <div class="header-cal-item-body">
        <span class="header-cal-item-time mono">${ev.time} Uhr</span>
        <div class="header-cal-item-title">${ev.title}</div>
      </div>
    </div>
  `).join('');
}

fetchLiveCalendar();
setInterval(fetchLiveCalendar, 60 * 1000);

// ============ GEOPOLITICS FEED ============
async function fetchGeopolitics(){
  const container = document.getElementById('geo-feed-container');
  try {
    const res = await fetch(`${BACKEND_URL}/geopolitics/today`);
    if(!res.ok) throw new Error('Geopolitics request failed: ' + res.status);
    const data = await res.json();
    renderGeoFeed(data.items || []);
  } catch(err) {
    console.warn('Geopolitik-Feed Anfrage fehlgeschlagen:', err);
    if(container) container.innerHTML = '<div class="geo-empty">Geopolitik-Feed nicht erreichbar.</div>';
  }
}

function formatGeoDate(pubDate){
  if(!pubDate) return '';
  const d = new Date(pubDate);
  if(isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
}

function timeAgoLabel(pubDate){
  if(!pubDate) return '';
  const d = new Date(pubDate);
  if(isNaN(d.getTime())) return '';
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if(diffMin < 1) return 'gerade jetzt';
  if(diffMin < 60) return `vor ${diffMin} Min`;
  const diffH = Math.round(diffMin / 60);
  if(diffH < 24) return `vor ${diffH} Std`;
  return formatGeoDate(pubDate);
}

function renderGeoFeed(items){
  const container = document.getElementById('geo-feed-container');
  if(!container) return;

  if(items.length === 0){
    container.innerHTML = '<div class="geo-empty">Keine markt-relevanten geopolitischen Meldungen gerade.</div>';
    return;
  }

  container.innerHTML = items.map((item, idx) => `
    <a class="geo-item" href="${item.link}" target="_blank" rel="noopener">
      <div class="geo-item-top">
        <span class="geo-item-badge">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
          ${idx === 0 ? 'Breaking' : 'Markt-relevant'}
        </span>
        <span class="geo-item-meta">${timeAgoLabel(item.pubDate)}</span>
      </div>
      <div class="geo-item-title">${item.title}</div>
      <div class="geo-item-link-row">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
        Quelle ansehen
      </div>
    </a>
  `).join('');
}

fetchGeopolitics();
setInterval(fetchGeopolitics, 60 * 1000);

// ============ FEAR & GREED SENTIMENT ============
function fngColorClass(label){
  const map = {
    'Extreme Fear': 'fng-extreme-fear',
    'Fear': 'fng-fear',
    'Neutral': 'fng-neutral',
    'Greed': 'fng-greed',
    'Extreme Greed': 'fng-extreme-greed',
  };
  return map[label] || 'fng-neutral';
}

function fngLabelDe(label){
  const map = {
    'Extreme Fear': 'Extreme Angst',
    'Fear': 'Angst',
    'Neutral': 'Neutral',
    'Greed': 'Gier',
    'Extreme Greed': 'Extreme Gier',
  };
  return map[label] || label;
}

function renderFngCard(prefix, data){
  const scoreEl = document.getElementById(`fng-${prefix}-score`);
  const labelEl = document.getElementById(`fng-${prefix}-label`);
  const sourceEl = document.getElementById(`fng-${prefix}-source`);
  if(!scoreEl) return;

  if(!data || data.score == null){
    scoreEl.textContent = '—';
    labelEl.textContent = 'Nicht verfügbar';
    if(sourceEl) sourceEl.textContent = '';
    return;
  }

  scoreEl.textContent = data.score;
  labelEl.textContent = fngLabelDe(data.label);
  labelEl.className = 'stat-card-trend ' + fngColorClass(data.label);
  if(sourceEl){
    sourceEl.textContent = data.real
      ? `Quelle: ${data.source}`
      : `Näherung · ${data.source}`;
  }
}

async function fetchFearAndGreed(){
  try {
    const res = await fetch(`${BACKEND_URL}/sentiment/fear-greed`);
    if(!res.ok) throw new Error('Sentiment request failed: ' + res.status);
    const data = await res.json();
    renderFngCard('gold', data.gold);
    renderFngCard('nas', data.nas);
    renderFngCard('btc', data.btc);
  } catch(err) {
    console.warn('Fear & Greed Anfrage fehlgeschlagen:', err);
  }
}

fetchFearAndGreed();
setInterval(fetchFearAndGreed, 5 * 60 * 1000);

// Live clock
function updateClock(){
  const now = new Date();
  const opts = { weekday: 'long', hour: '2-digit', minute: '2-digit' };
  document.getElementById('live-clock').textContent =
    now.toLocaleDateString('de-DE', opts).replace(',', ' ·') + ' Uhr';
}
updateClock();
setInterval(updateClock, 30000);

// Countdown to Fed event
function updateCountdown(){
  const target = new Date();
  target.setHours(16, 0, 0, 0);
  const now = new Date();
  const diffMin = Math.round((target - now) / 60000);
  const banner = document.getElementById('warn-banner');
  if(diffMin > 0 && diffMin <= 20){
    document.getElementById('mins-away').textContent = diffMin;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}
updateCountdown();
setInterval(updateCountdown, 30000);

// ============ TAB SWITCHING ============
document.querySelectorAll('.main-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const view = tab.dataset.view;
    document.getElementById('feed-wrapper').classList.toggle('view-hidden', view !== 'feed');
    document.getElementById('journal-section').classList.toggle('view-hidden', view !== 'journal');
  });
});

// ============ ASSET FILTER PILLS ============
document.querySelectorAll('.pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const filter = pill.dataset.filter;
    document.querySelectorAll('.news-card').forEach(card => {
      const assets = card.dataset.asset || '';
      card.style.display = (filter === 'all' || assets.includes(filter)) ? 'block' : 'none';
    });
    document.querySelectorAll('.live-event-card').forEach(card => {
      const assets = card.dataset.asset || '';
      card.style.display = (filter === 'all' || assets.includes(filter)) ? 'flex' : 'none';
    });
  });
});

// ============ TRADE JOURNAL ============
const JOURNAL_KEY = 'pulsemarket_journal';

function getJournal(){
  try {
    return JSON.parse(localStorage.getItem(JOURNAL_KEY)) || [];
  } catch(e) {
    return [];
  }
}

function saveJournal(entries){
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries));
}

let selectedChecked = 'yes';
let selectedResult = 'win';

document.querySelectorAll('[data-check]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-check]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedChecked = btn.dataset.check;
  });
});

document.querySelectorAll('[data-result]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-result]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedResult = btn.dataset.result;
  });
});

document.getElementById('add-trade-btn').addEventListener('click', () => {
  const entries = getJournal();
  const entry = {
    id: Date.now(),
    date: new Date().toLocaleDateString('de-DE'),
    time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    asset: document.getElementById('f-asset').value,
    direction: document.getElementById('f-direction').value,
    checked: selectedChecked,
    result: selectedResult,
    note: document.getElementById('f-note').value.trim(),
  };
  entries.unshift(entry);
  saveJournal(entries);
  document.getElementById('f-note').value = '';
  renderJournal();
});

document.getElementById('reset-journal-btn').addEventListener('click', () => {
  if(confirm('Wirklich alle Journal-Einträge löschen? Das kann nicht rückgängig gemacht werden.')){
    localStorage.removeItem(JOURNAL_KEY);
    renderJournal();
  }
});

function deleteEntry(id){
  const entries = getJournal().filter(e => e.id !== id);
  saveJournal(entries);
  renderJournal();
}

function renderStats(entries){
  const statsEl = document.getElementById('journal-stats');

  const withCheck = entries.filter(e => e.checked === 'yes');
  const withoutCheck = entries.filter(e => e.checked === 'no');

  const winRate = (list) => {
    const decided = list.filter(e => e.result !== 'be');
    if(decided.length === 0) return null;
    const wins = decided.filter(e => e.result === 'win').length;
    return Math.round((wins / decided.length) * 100);
  };

  const checkedRate = winRate(withCheck);
  const uncheckedRate = winRate(withoutCheck);

  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-card-val">${entries.length}</div>
      <div class="stat-card-label">Trades gesamt</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-val" style="color:var(--green-l)">${checkedRate !== null ? checkedRate + '%' : '—'}</div>
      <div class="stat-card-label">Winrate mit Check (${withCheck.length})</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-val" style="color:var(--text2)">${uncheckedRate !== null ? uncheckedRate + '%' : '—'}</div>
      <div class="stat-card-label">Winrate ohne Check (${withoutCheck.length})</div>
    </div>
  `;
}

function renderJournalList(entries){
  const listEl = document.getElementById('journal-list');

  if(entries.length === 0){
    listEl.innerHTML = '<div class="journal-empty">Noch keine Trades eingetragen. Trag deinen ersten Trade oben ein.</div>';
    return;
  }

  const resultLabel = { win: 'Gewinn', loss: 'Verlust', be: 'Break-Even' };

  listEl.innerHTML = entries.map(e => `
    <div class="journal-item">
      <div class="journal-item-left">
        <span class="journal-item-asset">${e.asset}</span>
        <span class="journal-item-meta">${e.direction} · ${e.date} ${e.time}</span>
        ${e.note ? `<span class="journal-item-note">${e.note}</span>` : ''}
      </div>
      <div class="journal-item-badges">
        <span class="j-badge ${e.checked === 'yes' ? 'j-checked-yes' : 'j-checked-no'}">${e.checked === 'yes' ? 'Geprüft' : 'Ungeprüft'}</span>
        <span class="j-badge j-result-${e.result}">${resultLabel[e.result]}</span>
      </div>
      <button class="journal-delete" onclick="deleteEntry(${e.id})" aria-label="Eintrag löschen">✕</button>
    </div>
  `).join('');
}

function renderJournal(){
  const entries = getJournal();
  renderStats(entries);
  renderJournalList(entries);

  const countBadge = document.getElementById('journal-count');
  if(entries.length > 0){
    countBadge.textContent = entries.length;
    countBadge.style.display = 'inline';
  } else {
    countBadge.style.display = 'none';
  }
}

renderJournal();

// ============ REGELBASIERTE MARKT-ERKLÄRUNG ============
// Kein API-Key nötig — Logik basiert auf den Live-Daten der News-Karten.
// So kann die Seite geteilt werden ohne dass Kosten für dich entstehen.

const aiAnswerBox = document.getElementById('ai-answer-box');

// Sammelt die aktuellen News-Daten direkt aus den gerenderten Karten im Feed.
// In Phase 2 (mit Backend) würde diese Funktion stattdessen die Live-JSON-Daten
// von Finnhub direkt auswerten statt das DOM zu lesen.
function collectMarketSignals(){
  const signals = { gold: [], nas: [], btc: [], highImpactCount: 0 };

  latestLiveEvents.forEach(ev => {
    if(ev.impact === 'High') signals.highImpactCount++;

    const assets = ev.assets || [];
    let dir = 'neutral';

    if(ev.actual && ev.forecast){
      const actualNum = parseFloat(String(ev.actual).replace(/[^0-9.-]/g, ''));
      const forecastNum = parseFloat(String(ev.forecast).replace(/[^0-9.-]/g, ''));
      if(!isNaN(actualNum) && !isNaN(forecastNum)){
        dir = actualNum > forecastNum ? 'bullish' : actualNum < forecastNum ? 'bearish' : 'neutral';
      }
    }

    if(dir === 'neutral') return;

    assets.forEach(asset => {
      if(!signals[asset]) return;
      signals[asset].push({ dir, title: ev.title });
    });
  });

  return signals;
}

function assetLabel(key){
  return { gold: 'Gold', nas: 'NAS100', btc: 'BTC' }[key] || key;
}

function buildExplanation(assetKey){
  const signals = collectMarketSignals();
  const label = assetLabel(assetKey);
  const relevant = signals[assetKey] || [];

  const bullish = relevant.filter(s => s.dir === 'bullish');
  const bearish = relevant.filter(s => s.dir === 'bearish');

  if(relevant.length === 0){
    return `Für ${label} gibt es im aktuellen Live-Kalender keine eindeutigen Datenüberraschungen — Actual liegt nah am Forecast oder steht noch aus. In ruhigen Phasen wie dieser zählt die technische Struktur (Higher Lows, Volumen, FVGs) mehr als die Nachrichtenlage.`;
  }

  if(bearish.length > bullish.length){
    const drivers = bearish.map(s => `„${s.title}"`).slice(0, 2).join(' und ');
    return `${label} steht heute unter Druck. Haupttreiber: ${drivers} — Actual lag unter Forecast. Das heißt nicht automatisch "jetzt shorten". Bestätigung über Struktur (Lower High, BOS) bleibt nötig, bevor du handelst.`;
  }

  if(bullish.length > bearish.length){
    const drivers = bullish.map(s => `„${s.title}"`).slice(0, 2).join(' und ');
    return `${label} hat heute Rückenwind. Haupttreiber: ${drivers} — Actual lag über Forecast. Warte trotzdem auf eine technische Bestätigung (Higher Low, BOS) statt direkt auf die Zahl zu reagieren.`;
  }

  return `Für ${label} stehen sich heute bullishe und bearishe Datenüberraschungen ungefähr die Waage — ${bullish.length} dafür, ${bearish.length} dagegen. Das ist ein Tag für Geduld, nicht für News-Trades. Schau auf die Charttechnik statt auf die Schlagzeilen.`;
}

function buildCautionAnswer(){
  const signals = collectMarketSignals();
  if(signals.highImpactCount >= 2){
    return `Ja — heute stehen ${signals.highImpactCount} High-Impact Events im Kalender. Nach deiner eigenen Regel: 15 Minuten vor und nach jedem dieser Events keinen neuen Trade eröffnen. Warte auf die erste klare Reaktion nach dem letzten Event, bevor du positionierst.`;
  }
  if(signals.highImpactCount === 1){
    return `Ein High-Impact Event steht heute an. Plane deine Trades um dieses Zeitfenster herum — 15 Minuten davor und danach lieber pausieren statt mitten in der Volatilität zu handeln.`;
  }
  return `Heute steht kein High-Impact Event im Kalender — ein ruhigerer Tag aus News-Sicht. Das heißt nicht automatisch risikofrei, aber die Wahrscheinlichkeit für plötzliche News-Spikes ist geringer als an Tagen mit Fed-Reden oder NFP-Releases.`;
}

function showAnswer(assetKey, label){
  document.querySelectorAll('.ai-quick-q').forEach(b => b.classList.remove('active'));
  const clickedBtn = document.querySelector(`.ai-quick-q[data-asset="${assetKey}"]`);
  if(clickedBtn) clickedBtn.classList.add('active');

  aiAnswerBox.classList.add('visible');
  aiAnswerBox.innerHTML = `<div class="ai-loading"><span class="ai-spinner"></span>Signale werden ausgewertet...</div>`;

  setTimeout(() => {
    const text = assetKey === 'caution' ? buildCautionAnswer() : buildExplanation(assetKey);
    aiAnswerBox.innerHTML = `
      <div class="ai-answer-question">${label}</div>
      <div>${text}</div>
    `;
  }, 350);
}

document.querySelectorAll('.ai-quick-q').forEach(btn => {
  btn.addEventListener('click', () => {
    showAnswer(btn.dataset.asset, btn.textContent.trim());
  });
});

// ============ ANIMATED HERO CHART BACKGROUND ============
(function(){
  const canvas = document.getElementById('hero-chart-canvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize(){
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(devicePixelRatio, devicePixelRatio);
  }
  resize();
  window.addEventListener('resize', resize);

  const lines = [
    { color: '201,162,58', points: [], value: 100, vol: 1.0, speed: 0.012, phase: 0 },
    { color: '90,90,86', points: [], value: 100, vol: 1.6, speed: 0.017, phase: 2 },
    { color: '60,60,58', points: [], value: 100, vol: 2.1, speed: 0.009, phase: 4 },
  ];

  const POINT_COUNT = 140;

  function seedLine(line){
    line.points = [];
    let v = 100;
    for(let i = 0; i < POINT_COUNT; i++){
      v += (Math.random() - 0.5) * line.vol;
      line.points.push(v);
    }
    line.value = v;
  }
  lines.forEach(seedLine);

  let t = 0;

  function step(){
    t += 1;
    lines.forEach(line => {
      const drift = Math.sin(t * line.speed + line.phase) * line.vol * 0.5;
      const noise = (Math.random() - 0.5) * line.vol;
      line.value += drift * 0.15 + noise * 0.3;
      line.points.push(line.value);
      if(line.points.length > POINT_COUNT) line.points.shift();
    });
  }

  function draw(){
    const w = canvas.width / devicePixelRatio;
    const h = canvas.height / devicePixelRatio;
    ctx.clearRect(0, 0, w, h);

    const allVals = lines.flatMap(l => l.points);
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const range = (max - min) || 1;
    const padTop = 12;
    const padBottom = 12;

    function yFor(val){
      return padTop + (1 - (val - min) / range) * (h - padTop - padBottom);
    }

    lines.forEach(line => {
      const n = line.points.length;
      const stepX = w / (POINT_COUNT - 1);

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, `rgba(${line.color},0)`);
      grad.addColorStop(0.55, `rgba(${line.color},0.55)`);
      grad.addColorStop(1, `rgba(${line.color},0.9)`);

      ctx.beginPath();
      line.points.forEach((val, i) => {
        const x = i * stepX;
        const y = yFor(val);
        if(i === 0) ctx.moveTo(x, y);
        else {
          const prevX = (i - 1) * stepX;
          const prevY = yFor(line.points[i - 1]);
          const cpX = (prevX + x) / 2;
          ctx.quadraticCurveTo(prevX, prevY, cpX, (prevY + y) / 2);
        }
      });
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      const lastX = (n - 1) * stepX;
      const lastY = yFor(line.points[n - 1]);
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${line.color},0.95)`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${line.color},0.18)`;
      ctx.fill();
    });
  }

  draw();

  setInterval(() => {
    step();
    draw();
  }, 1400);
})();

// ============ SCROLL PARALLAX — HERO DEPTH ============
// Idle floating motion is handled by CSS keyframes (glowFloat, watermarkDrift)
// for guaranteed reliability. This script only adds scroll-based movement on top.
(function(){
  const heroOuter = document.getElementById('hero-outer');

  let ticking = false;
  let scrollY = 0;

  function updateScrollTransform(){
    const progress = Math.min(1, scrollY / 500);

    if(heroOuter){
      heroOuter.style.transform = `translate3d(0px, ${scrollY * 0.18}px, 0px) scale(${1 - progress * 0.04})`;
      heroOuter.style.opacity = String(Math.max(0.25, 1 - progress * 0.75));
    }

    ticking = false;
  }

  window.addEventListener('scroll', () => {
    scrollY = window.scrollY || window.pageYOffset || 0;
    if(!ticking){
      requestAnimationFrame(updateScrollTransform);
      ticking = true;
    }
  }, { passive: true });

  if(heroOuter) heroOuter.style.transformOrigin = 'top center';
})();
</script>

</body>
</html>
