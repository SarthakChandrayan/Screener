// Shared data loading for the screener and the ideas page: one flat row per stock
// (quote + fundamentals + technicals), and a scan that fills in whatever is missing.

import { fmt, store, istDate } from "./util.js";
import { getQuote, refreshQuotes, fetchFundamentals, cachedFundamentals, fundamentalsAt, fetchChart, pool, primeFundamentals, saveFundamentals, fetchScanBatch, cachedRedFlags, fetchRedFlags } from "./api.js";
import { nameOf, STOCKS, NIFTY50, NEXT50, MIDCAP } from "./universes.js";
import { techSummary } from "./tech.js";
import { buildContext } from "./score.js";

// Technicals are kept for the rest of the (IST) day, so coming back to a page is instant
const TKEY = "screener-tech-v1";
export const TECH = new Map((() => { const t = store.get(TKEY, null); return t?.day === istDate() ? Object.entries(t.data) : []; })());
const saveTech = () => store.set(TKEY, { day: istDate(), data: Object.fromEntries(TECH) });

// Batches for /api/scan are fixed slices of this list (same as api/warm.js), so the CDN cache is shared by everyone
const MASTER = [...NIFTY50, ...NEXT50, ...MIDCAP].map(s => s.sym);
const MASTER_IDX = new Map(MASTER.map((s, i) => [s, i]));
const CHUNK = 25;
const ready = s => !!cachedFundamentals(s) && TECH.has(s);
export const coverage = syms => (syms.length ? syms.filter(ready).length / syms.length : 0);

async function fillFromBatches(syms, say, alive) {
  const chunks = [...new Set(syms.filter(s => MASTER_IDX.has(s) && !ready(s)).map(s => Math.floor(MASTER_IDX.get(s) / CHUNK)))];
  if (!chunks.length) return;
  let done = 0;
  await pool(chunks, 4, async ci => {
    if (!alive()) return;
    try {
      const r = await fetchScanBatch(MASTER.slice(ci * CHUNK, ci * CHUNK + CHUNK));
      for (const [sym, d] of Object.entries(r.data || {})) {
        if (d.f) primeFundamentals(sym, d.f);
        if (d.h) { const t = techSummary(d.h); if (t) TECH.set(sym, t); }
      }
    } catch { /* fall back to one-by-one below */ }
    done++;
    say(`Loading market data ${Math.round(done / chunks.length * 100)}%…`);
  });
  saveFundamentals();
  saveTech();
}

// Peer group for scoring: every stock loaded so far (up to all 227 in the universe) plus any extra rows,
// so a stock is compared with the same peers wherever it's shown. Rebuilt at most every 30 seconds.
let peerMemo = { at: 0, n: -1, ctx: null };
export function peerContext(extra = []) {
  const base = MASTER.filter(ready);
  const others = extra.filter(r => !MASTER_IDX.has(r.sym));
  const n = base.length * 1000 + others.length;
  if (!others.length && peerMemo.ctx && peerMemo.n === n && Date.now() - peerMemo.at < 30e3) return peerMemo.ctx;
  const ctx = buildContext([...base.map(stockRow), ...others]);
  if (!others.length) peerMemo = { at: Date.now(), n, ctx };
  return ctx;
}

export function stockRow(s) {
  const q = getQuote(s) || {}, f = cachedFundamentals(s) || {}, t = TECH.get(s) || {};
  const price = q.price ?? t.px ?? null, w52h = q.w52h ?? f.w52h;
  return {
    sym: s, name: f.name || nameOf(s, q), sector: STOCKS.get(s)?.sector || f.sector || "Other",
    // market cap from Yahoo, or shares × live price when Yahoo leaves it out
    price, chgPct: q.changePct, mcapCr: f.mcap ? f.mcap / 1e7 : f.sharesOut && price ? f.sharesOut * price / 1e7 : null,
    pe: f.pe, fpe: f.fpe, pb: f.pb, ps: f.ps, peg: f.peg, evEbitda: f.evEbitda,
    roe: f.roe, roa: f.roa, opm: f.opm, npm: f.npm, de: f.de, cr: f.cr,
    revGrowth: f.revGrowth, epsGrowth: f.epsGrowth, dy: f.dy, beta: f.beta,
    upside: f.target && price ? (f.target / price - 1) * 100 : null,
    offHigh: w52h && price ? (price / w52h - 1) * 100 : null,
    r1w: t.r1w, r1m: t.r1m, r3m: t.r3m, r6m: t.r6m, r1y: t.r1y, ytd: t.ytd,
    rsi: t.rsi, vsSma50: t.vsSma50, vsSma200: t.vsSma200, volRatio: t.volRatio, volatility: t.volatility,
    // for data checks (js/dataqual.js)
    eps: f.eps, histPx: t.px ?? null, fundAt: fundamentalsAt(s), hasQuote: q.price != null,
    // multi-year history (api/fundamentals.js) and trading facts used by the scorecard
    nYrs: f.nYrs, histFrom: f.histFrom, histTo: f.histTo, revCagr: f.revCagr, epsCagr: f.epsCagr, profYrs: f.profYrs, niYrs: f.niYrs,
    revUpYrs: f.revUpYrs, avgRoe: f.avgRoe, roeMin: f.roeMin, cashConv: f.cashConv, fcfYrs: f.fcfYrs, dilution: f.dilution, deChange: f.deChange,
    fScore: f.fScore, fMax: f.fMax, fFails: f.fFails, altmanZ: f.altmanZ,
    newsFlags: cachedRedFlags(s),
    nextEarnings: f.nextEarnings, turnoverCr: f.avgVol && price ? f.avgVol * price / 1e7 : null,
  };
}

// Fetch quotes, fundamentals and 1Y technicals for `syms`.
// say(text) reports progress, partial() is called as technicals arrive, alive() returns false once the caller moved on.
export async function scanSymbols(syms, { say = () => {}, partial = () => {}, alive = () => true, fresh = false } = {}) {
  if (fresh) syms.forEach(s => TECH.delete(s));
  say(`Fetching quotes for ${syms.length} stocks…`);
  await Promise.all([refreshQuotes(syms).catch(() => {}), fillFromBatches(syms, say, alive)]);
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
  saveTech();
  const withF = syms.filter(s => cachedFundamentals(s)).length;
  say(`${syms.length} stocks · fundamentals for ${withF}${fundErr ? ` (${fundErr})` : ""} · technicals for ${syms.filter(s => TECH.has(s)).length} · ${fmt.time(Date.now())} IST`);
  return syms.map(stockRow);
}

// Check the news for warning signs on a shortlist (the stocks you're actually shown)
export function checkNews(syms) {
  const names = {};
  syms.forEach(s => { names[s] = STOCKS.get(s)?.name || cachedFundamentals(s)?.name; });
  return fetchRedFlags(syms, names);
}
