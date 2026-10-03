// WEI — world equity indices, currencies, commodities, rates.

import { fmt, cls, rangeBar, spark } from "../util.js";
import { getQuote } from "../api.js";
import { MARKETS } from "../universes.js";
import { panel, secLink, flash } from "./common.js";

const ALL = MARKETS.flatMap(g => g.items.map(x => x[0]));

export function mount(el) {
  function render() {
    el.innerHTML = `<div class="grid">${MARKETS.map(g => panel(g.group, `<table class="t">
      <thead><tr><th class="l">Name</th><th>Last</th><th>Chg</th><th>Chg %</th><th class="hide-sm">Day</th><th class="hide-sm">Low</th><th class="hide-sm">High</th><th class="hide-sm">52W range</th><th class="hide-sm">Time</th></tr></thead>
      <tbody>${g.items.map(([s, name]) => {
        const q = getQuote(s);
        return `<tr><td class="l">${secLink(s, name)}</td>
          <td class="${flash(q)}">${fmt.px(q?.price)}</td>
          <td class="${cls(q?.change)}">${fmt.chg(q?.change)}</td>
          <td class="${cls(q?.changePct)}">${fmt.pct(q?.changePct)}</td>
          <td class="hide-sm">${spark(q?.spark, 70, 18)}</td>
          <td class="hide-sm">${fmt.px(q?.low)}</td><td class="hide-sm">${fmt.px(q?.high)}</td>
          <td class="hide-sm">${rangeBar(q?.w52l, q?.w52h, q?.price)}</td>
          <td class="hide-sm muted">${q ? fmt.time(q.time) : "—"}</td></tr>`;
      }).join("")}</tbody></table>`, { cls: g.group === "India" ? "c12" : "c6" })).join("")}</div>`;
  }
  render();
  return { syms: () => ALL, onQuotes: render };
}
