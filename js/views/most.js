// MOST — gainers, losers, most active and 52-week extremes for a universe.

import { $, fmt, cls, store } from "../util.js";
import { getQuote, refreshQuotes } from "../api.js";
import { universe } from "../state.js";
import { panel, secLink, universeSelect, flash } from "./common.js";

export function mount(el) {
  let uni = store.get("bahi-most-uni", "N100");
  el.innerHTML = `<div class="row-form bar">${universeSelect(uni)}<span class="muted">Live from quotes · turnover = price × volume</span></div>
    <div class="grid" id="mGrid"></div>`;

  const tbl = (rows, extra) => rows.length ? `<table class="t"><thead><tr><th class="l">Ticker</th><th>Last</th><th>Chg %</th><th>${extra[0]}</th></tr></thead><tbody>${rows.map(r => `
    <tr><td class="l">${secLink(r.s)}</td><td class="${flash(r.q)}">${fmt.px(r.q.price)}</td><td class="${cls(r.q.changePct)}">${fmt.pct(r.q.changePct)}</td><td>${extra[1](r)}</td></tr>`).join("")}</tbody></table>`
    : `<p class="muted pad">Nothing here yet.</p>`;

  function render() {
    const rows = universe(uni).map(s => ({ s, q: getQuote(s) })).filter(r => r.q && Number.isFinite(r.q.changePct));
    rows.forEach(r => { r.turn = (r.q.price || 0) * (r.q.volume || 0); r.pos = r.q.w52h > r.q.w52l ? (r.q.price - r.q.w52l) / (r.q.w52h - r.q.w52l) : null; });
    const by = (f, d = -1) => rows.slice().sort((a, b) => (f(a) - f(b)) * d);
    const adv = rows.filter(r => r.q.changePct > 0).length, dec = rows.filter(r => r.q.changePct < 0).length;
    const vol = ["Volume", r => fmt.big(r.q.volume)], turn = ["Turnover ₹", r => fmt.big(r.turn)];
    const hi = ["vs 52W high", r => fmt.pct((r.q.price / r.q.w52h - 1) * 100)], lo = ["vs 52W low", r => fmt.pct((r.q.price / r.q.w52l - 1) * 100)];
    $("#mGrid", el).innerHTML = `
      ${panel("Breadth", `<div class="breadth"><span class="up">▲ ${adv} advancing</span><span class="dn">▼ ${dec} declining</span><span class="muted">${rows.length - adv - dec} unchanged</span>
        <div class="bbar"><i class="bu" style="width:${rows.length ? adv / rows.length * 100 : 0}%"></i><i class="bd" style="width:${rows.length ? dec / rows.length * 100 : 0}%"></i></div></div>`, { cls: "c12" })}
      ${panel("Top gainers", tbl(by(r => r.q.changePct).filter(r => r.q.changePct > 0).slice(0, 12), vol), { cls: "c4" })}
      ${panel("Top losers", tbl(by(r => r.q.changePct, 1).filter(r => r.q.changePct < 0).slice(0, 12), vol), { cls: "c4" })}
      ${panel("Most active (turnover)", tbl(by(r => r.turn).slice(0, 12), turn), { cls: "c4" })}
      ${panel("Near 52-week high", tbl(rows.filter(r => r.pos != null).sort((a, b) => b.pos - a.pos).slice(0, 10), hi), { cls: "c6" })}
      ${panel("Near 52-week low", tbl(rows.filter(r => r.pos != null).sort((a, b) => a.pos - b.pos).slice(0, 10), lo), { cls: "c6" })}`;
  }
  $("#uni", el).onchange = e => { uni = e.target.value; store.set("bahi-most-uni", uni); render(); refreshQuotes(universe(uni)).catch(() => {}); };
  render();
  return { syms: () => universe(uni), onQuotes: render };
}
