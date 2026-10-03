// TOP — market overview dashboard.

import { $, esc, fmt, cls } from "../util.js";
import { getQuote, fetchNews } from "../api.js";
import { MARKETS, NIFTY50, sectorOf } from "../universes.js";
import { watchlist } from "../state.js";
import { panel, miniQuotes, secLink, newsList, href, flash } from "./common.js";

const grp = g => MARKETS.find(m => m.group === g).items.map(x => x[0]);
const INDIA = grp("India").slice(0, 9);
const WORLD = ["^GSPC", "^IXIC", "^DJI", "^FTSE", "^GDAXI", "^N225", "^HSI", "000001.SS"];
const MACRO = ["INR=X", "EURINR=X", "DX-Y.NYB", "GC=F", "SI=F", "CL=F", "BZ=F", "^TNX", "BTC-USD"];
const N50 = NIFTY50.map(s => s.sym);

export function mount(el) {
  el.innerHTML = `<div class="grid">
    ${panel(`India <a href="${href("WEI")}">WEI ›</a>`, "", { cls: "c4", id: "pIndia" })}
    ${panel(`Global <a href="${href("WEI")}">WEI ›</a>`, "", { cls: "c4", id: "pWorld" })}
    ${panel("FX · Commodities · Rates", "", { cls: "c4", id: "pMacro" })}
    ${panel(`Nifty 50 gainers <a href="${href("MOST")}">MOST ›</a>`, "", { cls: "c4", id: "pGain" })}
    ${panel(`Nifty 50 losers <a href="${href("MOST")}">MOST ›</a>`, "", { cls: "c4", id: "pLose" })}
    ${panel(`Watchlist <a href="${href("W")}">W ›</a>`, "", { cls: "c4", id: "pWatch" })}
    ${panel(`Nifty 50 sectors <a href="${href("HEAT")}">HEAT ›</a>`, "", { cls: "c5", id: "pSec" })}
    ${panel(`Top headlines <a href="${href("N")}">N ›</a>`, `<p class="muted pad">Loading headlines…</p>`, { cls: "c7", id: "pNews" })}
  </div>`;

  const body = id => $(`#${id} .pb`, el);
  function render() {
    body("pIndia").innerHTML = miniQuotes(INDIA);
    body("pWorld").innerHTML = miniQuotes(WORLD);
    body("pMacro").innerHTML = miniQuotes(MACRO);
    const w = watchlist();
    body("pWatch").innerHTML = w.length ? miniQuotes(w.slice(0, 10), { names: false }) : `<p class="muted pad">Empty. Type a ticker and press <kbd>W</kbd> on its page to add it.</p>`;

    const rows = N50.map(s => ({ s, q: getQuote(s) })).filter(r => Number.isFinite(r.q?.changePct)).sort((a, b) => b.q.changePct - a.q.changePct);
    const movers = list => list.length ? `<table class="t"><tbody>${list.map(({ s, q }) => `<tr><td>${secLink(s)}</td><td class="${flash(q)}">${fmt.px(q.price)}</td><td class="${cls(q.changePct)}">${fmt.pct(q.changePct)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted pad">Waiting for quotes…</p>`;
    body("pGain").innerHTML = movers(rows.filter(r => r.q.changePct > 0).slice(0, 8));
    body("pLose").innerHTML = movers(rows.filter(r => r.q.changePct < 0).reverse().slice(0, 8));

    const sec = {};
    rows.forEach(({ s, q }) => { const k = sectorOf(s); (sec[k] ||= []).push(q.changePct); });
    const secs = Object.entries(sec).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length, v.length]).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...secs.map(x => Math.abs(x[1])));
    body("pSec").innerHTML = secs.length ? `<div class="bars">${secs.map(([k, v, n]) => `
      <div class="bar-row"><span class="bl">${esc(k)} <small>${n}</small></span>
      <span class="bt"><i class="${v >= 0 ? "bu" : "bd"}" style="width:${(Math.abs(v) / max * 50).toFixed(1)}%;${v >= 0 ? "left:50%" : `right:50%`}"></i></span>
      <span class="${cls(v)} bv">${fmt.pct(v)}</span></div>`).join("")}</div>` : `<p class="muted pad">Waiting for quotes…</p>`;
  }
  render();

  fetchNews("Sensex Nifty stock market India").then(items => { const b = body("pNews"); if (b) b.innerHTML = newsList(items, 14); })
    .catch(e => { const b = body("pNews"); if (b) b.innerHTML = `<p class="muted pad">Headlines unavailable: ${esc(e.message)}</p>`; });

  return {
    syms: () => [...INDIA, ...WORLD, ...MACRO, ...N50, ...watchlist()],
    onQuotes: render,
  };
}
