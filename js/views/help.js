// HELP — function directory and shortcuts.

import { esc } from "../util.js";
import { GLOSSARY } from "../glossary.js";
import { panel, href } from "./common.js";

export const FUNCTIONS = [
  ["PICKS", "Manager's picks: a ready buy plan for your amount and risk level"],
  ["TOP", "Market overview dashboard"],
  ["WEI", "World indices, currencies, commodities, rates"],
  ["W", "Watchlist"],
  ["PORT", "Portfolio, P&L, allocation, tax estimate"],
  ["IDEAS", "Stock ideas: ranked shortlist with plain-English reasons"],
  ["EQS", "Equity screener (live or CSV)"],
  ["MOST", "Gainers, losers, most active, 52W extremes"],
  ["HEAT", "Sector heatmap"],
  ["N", "News headlines"],
  ["COMP", "Compare performance: COMP TCS INFY WIPRO"],
  ["ALRT", "Price alerts"],
  ["HELP", "This page"],
];
export const SEC_FUNCTIONS = [
  ["DES", "Security overview (default)"],
  ["GP", "Full-screen price chart"],
  ["N", "News for the security"],
  ["ALRT", "Create an alert"],
  ["COMP", "Compare against Nifty 50"],
];

export function mount(el) {
  const rows = list => `<table class="t"><tbody>${list.map(([k, d]) => `<tr><td class="l"><a class="sym" href="${href(k)}">${k}</a></td><td class="l">${esc(d)}</td></tr>`).join("")}</tbody></table>`;
  el.innerHTML = `<div class="grid">
    ${panel("New here? Start with this", `<ol class="pad prose steps">
      <li><b>Just want to know what to buy?</b> — <a class="sym" href="${href("PICKS")}">PICKS</a> gives you a ready plan: which stocks, how much in each, when to buy and when to re-check.</li>
      <li><b>Get a feel for the market</b> — <a class="sym" href="${href("TOP")}">TOP</a> shows how the big indices and sectors are doing today.</li>
      <li><b>Find ideas</b> — <a class="sym" href="${href("IDEAS")}">IDEAS</a> scores the Nifty 100 (or your own list) and shows the best-looking companies for your style, with reasons and red flags in plain English.</li>
      <li><b>Research one</b> — click a ticker, or type it (e.g. <code>TITAN</code>) and press Enter. The scorecard at the top sums it up; the panels below have the detail.</li>
      <li><b>Dig deeper or build your own filters</b> — <a class="sym" href="${href("EQS")}">EQS</a> lets you filter on any number. Hover a column name to see what it means.</li>
      <li><b>Track it</b> — add to your watchlist (<a class="sym" href="${href("W")}">W</a>), set price alerts (<a class="sym" href="${href("ALRT")}">ALRT</a>), and log what you buy in <a class="sym" href="${href("PORT")}">PORT</a>.</li>
    </ol>
    <p class="pad muted">Nothing here is a guarantee. Scores are a quick read of public numbers, not a recommendation — do your own reading before investing.</p>`, { cls: "c12" })}
    ${panel("Functions", rows(FUNCTIONS), { cls: "c6" })}
    ${panel("Security functions", `<p class="pad">Type a ticker, optionally followed by a function, then press <kbd>Enter</kbd>:</p>
      <table class="t"><tbody>${SEC_FUNCTIONS.map(([k, d]) => `<tr><td class="l"><code>RELIANCE ${k}</code></td><td class="l">${esc(d)}</td></tr>`).join("")}</tbody></table>
      <p class="pad muted">NSE is the default exchange. Use a 6-digit code for BSE (<code>500325</code>), or Yahoo-style symbols for anything else: <code>^NSEI</code>, <code>INR=X</code>, <code>GC=F</code>, <code>BTC-USD</code>, <code>AAPL</code>.</p>`, { cls: "c6" })}
    ${panel("Keyboard", `<table class="t"><tbody>
      <tr><td class="l"><kbd>/</kbd> or just start typing</td><td class="l">Focus the command line</td></tr>
      <tr><td class="l"><kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd></td><td class="l">Pick a suggestion</td></tr>
      <tr><td class="l"><kbd>Esc</kbd></td><td class="l">Clear the command line</td></tr>
      <tr><td class="l"><kbd>Alt</kbd>+<kbd>←</kbd></td><td class="l">Back (browser history)</td></tr></tbody></table>`, { cls: "c6" })}
    ${panel("About the data", `<p class="pad prose">Quotes, charts and fundamentals come from Yahoo Finance's public endpoints via this app's own <code>/api</code> functions; headlines from Google News. Prices are delayed (seconds to ~15 minutes) and the source is unofficial — fine for research, not for trading execution. For tick-by-tick data, connect a broker API (see README). Your watchlist, portfolio, alerts and saved screens are stored only in this browser. Not investment or tax advice.</p>`, { cls: "c6" })}
    ${panel("Glossary — what the numbers mean", `<dl class="gloss">${Object.values(GLOSSARY).map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join("")}</dl>`, { cls: "c12", id: "glossary" })}
  </div>`;
  return { title: "Help" };
}
