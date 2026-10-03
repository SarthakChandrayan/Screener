// W — watchlist with live quotes.

import { $, fmt, cls, normSym, rangeBar, spark, toast, short, esc } from "../util.js";
import { getQuote, refreshQuotes } from "../api.js";
import { nameOf } from "../universes.js";
import { watchlist, addWatch, removeWatch, moveWatch } from "../state.js";
import { panel, secLink, sortTable, nextSort, flash, href } from "./common.js";

let sort = null;

export function mount(el) {
  el.innerHTML = `<div class="grid">${panel("Watchlist", `
    <form id="wAdd" class="row-form" autocomplete="off">
      <input id="wSym" placeholder="Add ticker: TATAPOWER, 500325, ^NSEI, GC=F" aria-label="Ticker to add">
      <button class="btn amber">Add</button>
      <span class="muted">Tip: NSE tickers by default · 6-digit codes are BSE · click a column to sort</span>
    </form>
    <div class="tbl" id="wTbl"></div>`, { cls: "c12" })}</div>`;

  const cols = [
    { k: "sym", l: "Ticker", n: false, f: r => secLink(r.s), v: r => r.s },
    { k: "name", l: "Name", n: false, f: r => `<span class="muted">${esc(nameOf(r.s, r.q))}</span>`, v: r => nameOf(r.s, r.q) },
    { k: "price", l: "Last", f: r => fmt.px(r.q?.price), c: r => flash(r.q), v: r => r.q?.price },
    { k: "change", l: "Chg", f: r => fmt.chg(r.q?.change), c: r => cls(r.q?.change), v: r => r.q?.change },
    { k: "changePct", l: "Chg %", f: r => fmt.pct(r.q?.changePct), c: r => cls(r.q?.changePct), v: r => r.q?.changePct },
    { k: "spark", l: "Intraday", f: r => spark(r.q?.spark), v: () => null },
    { k: "open", l: "Open", f: r => fmt.px(r.q?.open), v: r => r.q?.open },
    { k: "high", l: "High", f: r => fmt.px(r.q?.high), v: r => r.q?.high },
    { k: "low", l: "Low", f: r => fmt.px(r.q?.low), v: r => r.q?.low },
    { k: "prev", l: "Prev close", f: r => fmt.px(r.q?.prevClose), v: r => r.q?.prevClose },
    { k: "volume", l: "Volume", f: r => fmt.big(r.q?.volume), v: r => r.q?.volume },
    { k: "w52", l: "52W range", f: r => rangeBar(r.q?.w52l, r.q?.w52h, r.q?.price), v: r => (r.q && r.q.w52h > r.q.w52l ? (r.q.price - r.q.w52l) / (r.q.w52h - r.q.w52l) : null) },
    { k: "time", l: "Time", f: r => (r.q ? fmt.time(r.q.time) : "—"), v: r => r.q?.time },
    { k: "x", l: "", f: r => `<span class="row-acts"><button class="ib" data-up="${esc(r.s)}" title="Move up" aria-label="Move ${esc(short(r.s))} up">↑</button><button class="ib" data-down="${esc(r.s)}" title="Move down" aria-label="Move ${esc(short(r.s))} down">↓</button><a class="ib" href="${href("ALRT", r.s)}" title="Set alert" aria-label="Set alert for ${esc(short(r.s))}">⏰</a><button class="ib x" data-rm="${esc(r.s)}" title="Remove" aria-label="Remove ${esc(short(r.s))}">×</button></span>`, v: () => null },
  ];

  const render = () => {
    $("#wTbl", el).innerHTML = sortTable(cols, watchlist().map(s => ({ s, q: getQuote(s) })), sort, { empty: "Your watchlist is empty — add a ticker above." });
  };

  $("#wAdd", el).addEventListener("submit", e => {
    e.preventDefault();
    const s = normSym($("#wSym", el).value);
    if (!s) return;
    if (!addWatch(s)) toast(short(s) + " is already on the watchlist");
    $("#wSym", el).value = "";
    render();
    refreshQuotes([s]).catch(() => {});
  });
  $("#wTbl", el).addEventListener("click", e => {
    const th = e.target.closest("th[data-sort]");
    if (th) { const k = th.dataset.sort; sort = nextSort(sort, k, !["sym", "name"].includes(k)); render(); return; }
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.rm) { removeWatch(b.dataset.rm); toast("Removed " + short(b.dataset.rm)); }
    else if (b.dataset.up) { sort = null; moveWatch(b.dataset.up, -1); }
    else if (b.dataset.down) { sort = null; moveWatch(b.dataset.down, 1); }
    render();
  });
  render();
  return { syms: watchlist, onQuotes: render };
}
