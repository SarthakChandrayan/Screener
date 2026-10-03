// HELP — function directory and shortcuts.

import { esc } from "../util.js";
import { panel, href } from "./common.js";

export const FUNCTIONS = [
  ["TOP", "Market overview dashboard"],
  ["WEI", "World indices, currencies, commodities, rates"],
  ["W", "Watchlist"],
  ["PORT", "Portfolio, P&L, allocation, tax estimate"],
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
  </div>`;
  return { title: "Help" };
}
