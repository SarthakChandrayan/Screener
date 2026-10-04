// DES / GP — security overview: quote, chart, fundamentals, technicals, profile, news.

import { $, esc, fmt, cls, rangeBar, short, isEquity, toast } from "../util.js";
import { getQuote, fetchFundamentals, fetchChart, fetchNews, refreshQuotes } from "../api.js";
import { nameOf, STOCKS } from "../universes.js";
import { inWatch, addWatch, removeWatch } from "../state.js";
import { chartPanel } from "../chart.js";
import { techSummary } from "../tech.js";
import { TECH, stockRow } from "../scan.js";
import { PILLARS, scoreRow, verdict, scoreBar } from "../score.js";
import { panel, kv, newsList, href } from "./common.js";
import { go } from "../nav.js";

const REC = { strong_buy: "Strong buy", buy: "Buy", hold: "Hold", underperform: "Underperform", sell: "Sell", none: "—" };

export function mount(el, args, { full = false } = {}) {
  const sym = args[0];
  if (!sym) {
    el.innerHTML = `<div class="grid">${panel("Security", `<p class="pad">Type a ticker in the command line, e.g. <kbd>RELIANCE</kbd> <kbd>GO</kbd>.</p>`, { cls: "c12" })}</div>`;
    return {};
  }
  const equity = isEquity(sym);
  let fund = null, tech = null;

  el.innerHTML = `
    <div class="sec-head" id="dHead"></div>
    <div class="grid">
      ${full || !equity ? "" : panel(`Scorecard <a href="${href("IDEAS")}">Compare with other stocks in IDEAS ›</a>`, `<div id="dScore"><p class="muted pad">Loading…</p></div>`, { cls: "c12" })}
      ${panel(full ? "Chart" : `Chart <a href="${href("GP", sym)}">GP ›</a>`, `<div id="dChart"></div>`, { cls: full ? "c9" : "c8" })}
      ${panel("Technicals", `<div id="dTech"><p class="muted pad">Loading…</p></div>`, { cls: full ? "c3" : "c4" })}
      ${full ? "" : `
      ${panel("Valuation", `<div id="dVal"><p class="muted pad">${equity ? "Loading…" : "Not applicable."}</p></div>`, { cls: "c4" })}
      ${panel("Profitability & balance sheet", `<div id="dProf"><p class="muted pad">${equity ? "Loading…" : "Not applicable."}</p></div>`, { cls: "c4" })}
      ${panel("Analysts & ownership", `<div id="dAn"><p class="muted pad">${equity ? "Loading…" : "Not applicable."}</p></div>`, { cls: "c4" })}
      ${panel("Company profile", `<div id="dProfile"><p class="muted pad">${equity ? "Loading…" : "—"}</p></div>`, { cls: "c6" })}
      ${panel(`News <a href="${href("N", sym)}">N ›</a>`, `<div id="dNews"><p class="muted pad">Loading…</p></div>`, { cls: "c6" })}`}
    </div>`;

  function head() {
    const q = getQuote(sym);
    const name = fund?.name || nameOf(sym, q);
    const w = inWatch(sym);
    $("#dHead", el).innerHTML = `
      <div class="sh-id">
        <div class="sh-sym">${esc(short(sym))} <span class="sh-ex">${esc(q?.exchange || (sym.endsWith(".BO") ? "BSE" : sym.endsWith(".NS") ? "NSE" : ""))}</span></div>
        <div class="sh-name">${esc(name)}${fund?.sector || STOCKS.get(sym) ? ` · <span class="muted">${esc(fund?.industry || fund?.sector || STOCKS.get(sym)?.sector)}</span>` : ""}</div>
      </div>
      <div class="sh-px">
        <span class="sh-last">${fmt.px(q?.price)}</span>
        <span class="${cls(q?.change)}">${fmt.chg(q?.change)} (${fmt.pct(q?.changePct)})</span>
        <span class="muted small">${q ? (q.currency || "") + " · " + fmt.time(q.time) + " IST" : "Loading quote…"}</span>
      </div>
      <dl class="sh-stats">
        <dt>Open</dt><dd>${fmt.px(q?.open)}</dd><dt>High</dt><dd>${fmt.px(q?.high)}</dd>
        <dt>Low</dt><dd>${fmt.px(q?.low)}</dd><dt>Prev</dt><dd>${fmt.px(q?.prevClose)}</dd>
        <dt>Volume</dt><dd>${fmt.big(q?.volume)}</dd><dt>52W</dt><dd>${rangeBar(q?.w52l, q?.w52h, q?.price)}</dd>
      </dl>
      <div class="sh-acts">
        <button class="btn" data-act="watch">${w ? "★ Watching" : "☆ Watch"}</button>
        ${equity ? `<button class="btn" data-act="buy">+ Portfolio</button>` : ""}
        <a class="btn" href="${href("ALRT", sym)}">Alert</a>
        <a class="btn" href="${href("COMP", sym)}">Compare</a>
        ${full ? `<a class="btn" href="${href("DES", sym)}">DES</a>` : `<a class="btn" href="${href("GP", sym)}">Full chart</a>`}
      </div>`;
  }
  head();

  $("#dHead", el).addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "watch") {
      if (inWatch(sym)) { removeWatch(sym); toast("Removed from watchlist"); } else { addWatch(sym); toast("Added to watchlist"); }
      head();
    } else if (b.dataset.act === "buy") go("PORT", "add", sym);
  });

  const chart = chartPanel($("#dChart", el), sym, { height: full ? Math.max(360, innerHeight - 330) : 380, range: full ? "1y" : "6mo" });

  function renderTech() {
    const q = getQuote(sym), t = tech;
    if (!t) return;
    const px = q?.price ?? t.px;
    const vs = v => v == null ? "—" : `${fmt.px(v)} <small class="${cls(px - v)}">${px >= v ? "above" : "below"}</small>`;
    const rsiNote = t.rsi == null ? "" : t.rsi >= 70 ? " <small class='dn'>overbought</small>" : t.rsi <= 30 ? " <small class='up'>oversold</small>" : "";
    $("#dTech", el).innerHTML = kv([
      ["1 week", fmt.pct(t.r1w), cls(t.r1w)], ["1 month", fmt.pct(t.r1m), cls(t.r1m)], ["3 months", fmt.pct(t.r3m), cls(t.r3m)],
      ["6 months", fmt.pct(t.r6m), cls(t.r6m)], ["YTD", fmt.pct(t.ytd), cls(t.ytd)], ["1 year", fmt.pct(t.r1y), cls(t.r1y)],
      ["RSI (14)", (t.rsi == null ? "—" : t.rsi.toFixed(1)) + rsiNote],
      ["MACD", t.macd == null ? "—" : `${t.macd.toFixed(2)} <small class="${cls(t.macd - t.macdSignal)}">${t.macd >= t.macdSignal ? "bullish" : "bearish"}</small>`],
      ["20 DMA", vs(t.sma20)], ["50 DMA", vs(t.sma50)], ["200 DMA", vs(t.sma200)],
      ["Volatility (1Y)", t.volatility ? t.volatility.toFixed(1) + "%" : "—"],
      ["Vol vs 20D avg", t.volRatio ? t.volRatio.toFixed(2) + "×" : "—"],
    ]);
  }
  fetchChart(sym, "1y", true).then(d => { tech = techSummary(d); renderScore(); if (tech) renderTech(); else $("#dTech", el).innerHTML = `<p class="muted pad">Not enough history.</p>`; })
    .catch(e => { const n = $("#dTech", el); if (n) n.innerHTML = `<p class="muted pad">${esc(e.message)}</p>`; });

  // Plain-English summary: pillar scores, why it looks good, and red flags (same rules as IDEAS, Balanced style)
  function renderScore() {
    const box = $("#dScore", el);
    if (!box || (!fund && !tech)) return;
    if (tech) TECH.set(sym, tech);
    const r = scoreRow(stockRow(sym)), v = verdict(r.score);
    box.innerHTML = `<div class="scorecard">
      <div class="sc-total"><span class="big ${v.c}">${r.score ?? "—"}<small>/100</small></span><span class="${v.c}">${esc(v.label)}</span>
        <span class="muted small">Balanced style · ${fund && tech ? "based on fundamentals and price trend" : "partial data, still loading"}</span></div>
      <dl class="pbars">${PILLARS.map(([k, l, d]) => `<dt title="${esc(d)}">${l}</dt><dd>${scoreBar(r.pillars[k], 110)}<span>${r.pillars[k] ?? "—"}</span></dd>`).join("")}</dl>
      <div><p class="why-h up">Strengths</p>${r.reasons.length ? `<ul class="why">${r.reasons.slice(0, 4).map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : `<p class="muted small">Nothing stands out as strong.</p>`}</div>
      <div><p class="why-h dn">Watch out</p>${r.flags.length ? `<ul class="why flags">${r.flags.map(f => `<li class="${f.sev === 2 ? "sev" : ""}">${esc(f.text)}</li>`).join("")}</ul>` : `<p class="muted small">No red flags in the numbers.</p>`}</div>
    </div>`;
  }

  function renderFund() {
    const f = fund, q = getQuote(sym);
    if (!f || full) return;
    const px = q?.price;
    $("#dVal", el).innerHTML = kv([
      ["Market cap", f.mcap ? "₹" + fmt.cr(f.mcap) : "—"], ["P/E (TTM)", fmt.n(f.pe)], ["Forward P/E", fmt.n(f.fpe)],
      ["P/B", fmt.n(f.pb)], ["P/S", fmt.n(f.ps)], ["PEG", fmt.n(f.peg)], ["EV/EBITDA", fmt.n(f.evEbitda)],
      ["EPS (TTM)", fmt.n(f.eps)], ["Book value / sh", fmt.n(f.bvps)], ["Dividend yield", f.dy != null ? fmt.n(f.dy) + "%" : "—"],
      ["Payout ratio", f.payout != null ? fmt.n(f.payout) + "%" : "—"], ["Beta", fmt.n(f.beta)],
    ]);
    $("#dProf", el).innerHTML = kv([
      ["ROE", f.roe != null ? fmt.n(f.roe) + "%" : "—"], ["ROA", f.roa != null ? fmt.n(f.roa) + "%" : "—"],
      ["Operating margin", f.opm != null ? fmt.n(f.opm) + "%" : "—"], ["Net margin", f.npm != null ? fmt.n(f.npm) + "%" : "—"],
      ["Revenue growth (YoY)", fmt.pct(f.revGrowth), cls(f.revGrowth)], ["Earnings growth (YoY)", fmt.pct(f.epsGrowth), cls(f.epsGrowth)],
      ["Revenue (TTM)", f.revenue ? "₹" + fmt.cr(f.revenue) : "—"], ["EBITDA", f.ebitda ? "₹" + fmt.cr(f.ebitda) : "—"],
      ["Total cash", f.cash ? "₹" + fmt.cr(f.cash) : "—"], ["Total debt", f.debt ? "₹" + fmt.cr(f.debt) : "—"],
      ["Debt / equity", fmt.n(f.de)], ["Current ratio", fmt.n(f.cr)], ["Free cash flow", f.fcf ? "₹" + fmt.cr(f.fcf) : "—"],
    ]);
    const up = f.target && px ? (f.target / px - 1) * 100 : null;
    $("#dAn", el).innerHTML = kv([
      ["Consensus", REC[f.rec] || f.rec || "—"], ["Analysts", f.analysts ?? "—"],
      ["Mean target", f.target ? `${fmt.px(f.target)} <small class="${cls(up)}">${fmt.pct(up, 1)}</small>` : "—"],
      ["Target range", f.targetLow ? `${fmt.px(f.targetLow)} – ${fmt.px(f.targetHigh)}` : "—"],
      ["Held by insiders", f.insiders != null ? fmt.n(f.insiders) + "%" : "—"], ["Held by institutions", f.institutions != null ? fmt.n(f.institutions) + "%" : "—"],
    ]);
    $("#dProfile", el).innerHTML = f.summary ? `<p class="pad prose">${esc(f.summary)}</p>${kv([
      ["Sector", esc(f.sector || "—")], ["Industry", esc(f.industry || "—")], ["Employees", f.employees ? fmt.n(f.employees, 0) : "—"],
      ["HQ", esc(f.city || "—")], ["Website", f.website ? `<a href="${esc(f.website)}" target="_blank" rel="noopener noreferrer">${esc(f.website.replace(/^https?:\/\/(www\.)?/, ""))}</a>` : "—"],
    ])}` : `<p class="muted pad">No profile available.</p>`;
  }
  if (equity && !full) {
    fetchFundamentals([sym]).then(r => { fund = r[sym] || null; if (fund) { renderFund(); renderScore(); head(); } else throw new Error("No fundamentals for this symbol."); })
      .catch(e => ["#dVal", "#dProf", "#dAn", "#dProfile", ...(tech ? [] : ["#dScore"])].forEach(id => { const n = $(id, el); if (n) n.innerHTML = `<p class="muted pad">${esc(e.message)}</p>`; }));
  }

  if (!full) {
    const q0 = getQuote(sym);
    const nm = STOCKS.get(sym)?.name || q0?.name || short(sym);
    fetchNews(equity ? `"${nm}" share` : nm).then(items => { const n = $("#dNews", el); if (n) n.innerHTML = newsList(items, 12); })
      .catch(e => { const n = $("#dNews", el); if (n) n.innerHTML = `<p class="muted pad">${esc(e.message)}</p>`; });
  }

  if (!getQuote(sym)) refreshQuotes([sym]).catch(() => {});

  return {
    title: short(sym),
    syms: () => [sym],
    onQuotes: () => { head(); renderTech(); },
    unmount: () => chart.destroy(),
  };
}

export const mountFull = (el, args) => mount(el, args, { full: true });
