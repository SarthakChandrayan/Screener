// Shared data loading for the screener and the ideas page: one flat row per stock
// (quote + fundamentals + technicals), and a scan that fills in whatever is missing.

import { fmt } from "./util.js";
import { getQuote, refreshQuotes, fetchFundamentals, cachedFundamentals, fetchChart, pool } from "./api.js";
import { nameOf, STOCKS } from "./universes.js";
import { techSummary } from "./tech.js";

export const TECH = new Map();

export function stockRow(s) {
  const q = getQuote(s) || {}, f = cachedFundamentals(s) || {}, t = TECH.get(s) || {};
  const price = q.price ?? t.px ?? null, w52h = q.w52h ?? f.w52h;
  return {
    sym: s, name: f.name || nameOf(s, q), sector: STOCKS.get(s)?.sector || f.sector || "Other",
    price, chgPct: q.changePct, mcapCr: f.mcap ? f.mcap / 1e7 : null,
    pe: f.pe, fpe: f.fpe, pb: f.pb, ps: f.ps, peg: f.peg, evEbitda: f.evEbitda,
    roe: f.roe, roa: f.roa, opm: f.opm, npm: f.npm, de: f.de, cr: f.cr,
    revGrowth: f.revGrowth, epsGrowth: f.epsGrowth, dy: f.dy, beta: f.beta,
    upside: f.target && price ? (f.target / price - 1) * 100 : null,
    offHigh: w52h && price ? (price / w52h - 1) * 100 : null,
    r1w: t.r1w, r1m: t.r1m, r3m: t.r3m, r6m: t.r6m, r1y: t.r1y, ytd: t.ytd,
    rsi: t.rsi, vsSma50: t.vsSma50, vsSma200: t.vsSma200, volRatio: t.volRatio, volatility: t.volatility,
  };
}

// Fetch quotes, fundamentals and 1Y technicals for `syms`.
// say(text) reports progress, partial() is called as technicals arrive, alive() returns false once the caller moved on.
export async function scanSymbols(syms, { say = () => {}, partial = () => {}, alive = () => true, fresh = false } = {}) {
  if (fresh) syms.forEach(s => TECH.delete(s));
  say(`Fetching quotes for ${syms.length} stocks…`);
  await refreshQuotes(syms).catch(() => {});
  let fundErr = "";
  await fetchFundamentals(syms, (d, n) => alive() && say(`Fundamentals ${d}/${n}…`)).catch(e => { fundErr = e.message; });
  if (!alive()) return null;
  partial();
  let done = 0;
  const need = syms.filter(s => !TECH.has(s));
  await pool(need, 6, async s => {
    if (!alive()) return;
    try { const t = techSummary(await fetchChart(s, "1y", true)); if (t) TECH.set(s, t); } catch { /* skip */ }
    done++;
    if (done % 10 === 0 && alive()) { say(`Technicals ${done}/${need.length}…`); partial(); }
  });
  if (!alive()) return null;
  const withF = syms.filter(s => cachedFundamentals(s)).length;
  say(`${syms.length} stocks · fundamentals for ${withF}${fundErr ? ` (${fundErr})` : ""} · technicals for ${syms.filter(s => TECH.has(s)).length} · ${fmt.time(Date.now())} IST`);
  return syms.map(stockRow);
}
