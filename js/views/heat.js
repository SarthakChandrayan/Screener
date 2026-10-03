// HEAT — sector heatmap of today's moves.

import { $, esc, fmt, cls, store, short } from "../util.js";
import { getQuote, refreshQuotes, cachedFundamentals } from "../api.js";
import { universe } from "../state.js";
import { sectorOf } from "../universes.js";
import { universeSelect, href } from "./common.js";

const tone = p => {
  if (!Number.isFinite(p)) return "background:#1a1a1a";
  const a = Math.min(Math.abs(p) / 3, 1) * 0.75 + 0.12;
  return `background:${p >= 0 ? `rgba(34,197,94,${a.toFixed(2)})` : `rgba(239,68,68,${a.toFixed(2)})`}`;
};

export function mount(el) {
  let uni = store.get("bahi-heat-uni", "N100");
  el.innerHTML = `<div class="row-form bar">${universeSelect(uni)}
    <span class="legend-scale"><i style="background:rgba(239,68,68,.87)"></i>−3%<i style="background:#1a1a1a"></i>0<i style="background:rgba(34,197,94,.87)"></i>+3%</span>
    <span class="muted">Tile size follows market cap once fundamentals are loaded (run EQS on the same list).</span></div>
    <div id="heat" class="heat"></div>`;

  function render() {
    const groups = {};
    universe(uni).forEach(s => {
      const q = getQuote(s), f = cachedFundamentals(s);
      (groups[f?.sector && sectorOf(s) === "Other" ? f.sector : sectorOf(s)] ||= []).push({ s, q, w: f?.mcap ? Math.sqrt(f.mcap / 1e9) : 10 });
    });
    const secs = Object.entries(groups).map(([k, v]) => {
      const p = v.filter(x => Number.isFinite(x.q?.changePct));
      const tw = p.reduce((a, x) => a + x.w, 0);
      return { k, v: v.sort((a, b) => b.w - a.w), avg: tw ? p.reduce((a, x) => a + x.q.changePct * x.w, 0) / tw : null, w: v.reduce((a, x) => a + x.w, 0) };
    }).sort((a, b) => b.w - a.w);
    $("#heat", el).innerHTML = secs.length ? secs.map(g => `
      <section class="hsec" style="flex-grow:${g.w.toFixed(1)}">
        <header><span>${esc(g.k)}</span><b class="${cls(g.avg)}">${fmt.pct(g.avg)}</b></header>
        <div class="htiles">${g.v.map(x => `<a class="tile" href="${href("DES", x.s)}" style="${tone(x.q?.changePct)};flex-grow:${x.w.toFixed(1)}" title="${esc(short(x.s))} ${fmt.px(x.q?.price)}">
          <b>${esc(short(x.s))}</b><span>${fmt.pct(x.q?.changePct)}</span></a>`).join("")}</div>
      </section>`).join("") : `<p class="muted pad">This list is empty.</p>`;
  }
  $("#uni", el).onchange = e => { uni = e.target.value; store.set("bahi-heat-uni", uni); render(); refreshQuotes(universe(uni)).catch(() => {}); };
  render();
  return { syms: () => universe(uni), onQuotes: render };
}
