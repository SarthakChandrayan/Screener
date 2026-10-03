// N — news headlines: market topics, a company, or any search.

import { $, esc, short, isEquity } from "../util.js";
import { fetchNews, getQuote } from "../api.js";
import { STOCKS } from "../universes.js";
import { panel, newsList, href } from "./common.js";
import { go } from "../nav.js";

const TOPICS = [
  ["Markets", "Sensex Nifty stock market India"], ["Economy", "RBI Indian economy inflation GDP"], ["Corporate", "India company results quarterly earnings"],
  ["IPOs", "IPO India NSE BSE listing"], ["Global", "global markets Wall Street stocks"], ["Commodities", "gold crude oil prices"], ["Mutual funds", "mutual funds SIP India"],
];

export function mount(el, args) {
  const sym = args[0] && args[0] !== "Q" ? args[0] : null;
  const query = args[0] === "Q" ? args.slice(1).join(" ") : null;
  const name = sym ? STOCKS.get(sym)?.name || getQuote(sym)?.name || short(sym) : null;
  const q = sym ? (isEquity(sym) ? `"${name}" share` : name) : query || TOPICS[0][1];
  const title = sym ? `News · <a href="${href("DES", sym)}">${esc(short(sym))}</a> ${esc(name)}` : query ? `News · “${esc(query)}”` : "News";

  el.innerHTML = `<div class="grid">${panel(title, `
    <div class="row-form">
      ${TOPICS.map(([l, tq]) => `<button class="btn ${!sym && (query ? query === tq : tq === q) ? "on" : ""}" data-q="${esc(tq)}">${l}</button>`).join("")}
      <form id="nForm" class="inline"><input id="nq" placeholder="Search news…" aria-label="Search news" value="${esc(query || "")}"><button class="btn">Search</button></form>
    </div>
    <div id="nList"><p class="muted pad">Loading…</p></div>`, { cls: "c12" })}</div>`;

  el.addEventListener("click", e => { const b = e.target.closest("[data-q]"); if (b) go("N", "Q", b.dataset.q); });
  $("#nForm", el).addEventListener("submit", e => { e.preventDefault(); const v = $("#nq", el).value.trim(); if (v) go("N", "Q", v); });
  fetchNews(q).then(items => { const n = $("#nList", el); if (n) n.innerHTML = newsList(items, 60); })
    .catch(e => { const n = $("#nList", el); if (n) n.innerHTML = `<p class="muted pad">Headlines unavailable: ${esc(e.message)}</p>`; });
  return { title: sym ? short(sym) + " news" : "News" };
}
