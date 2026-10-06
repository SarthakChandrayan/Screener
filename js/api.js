// Client for the /api functions, with a live quote store that views subscribe to.

import { store } from "./util.js";

export const bus = new EventTarget();
const quotes = new Map();
export const getQuote = s => quotes.get(s);
// Which backend served the last refresh: "upstox" (live) or "yahoo" (delayed), plus any Upstox error
export const feed = { source: "yahoo", warning: null };

async function j(url) {
  const r = await fetch(url);
  if (!r.ok) {
    let msg = "HTTP " + r.status;
    try { msg = (await r.json()).error || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return r.json();
}

export async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  }));
}

let inflight = null;
export async function fetchQuotes(syms) {
  const list = [...new Set(syms.filter(Boolean))];
  if (!list.length) return {};
  const parts = [];
  for (let i = 0; i < list.length; i += 50) parts.push(list.slice(i, i + 50));
  const res = await Promise.allSettled(parts.map(p => j("/api/quote?s=" + encodeURIComponent(p.join(",")))));
  const ok = res.filter(r => r.status === "fulfilled");
  if (!ok.length) throw res[0].reason;
  const out = {};
  ok.forEach(r => Object.assign(out, r.value.quotes || {}));
  feed.source = ok.some(r => r.value.source === "upstox") ? "upstox" : "yahoo";
  feed.warning = ok.map(r => r.value.warning).find(Boolean) || null;
  for (const [k, v] of Object.entries(out)) {
    const prev = quotes.get(k);
    v.tick = prev && prev.price !== v.price ? (v.price > prev.price ? 1 : -1) : 0;
    quotes.set(k, v);
  }
  bus.dispatchEvent(new CustomEvent("quotes", { detail: out }));
  return out;
}
// Coalesce overlapping refreshes (poller + a view asking at the same moment)
export function refreshQuotes(syms) {
  if (inflight) return inflight.then(() => fetchQuotes(syms.filter(s => !quotes.has(s))));
  inflight = fetchQuotes(syms).finally(() => { inflight = null; });
  return inflight;
}

const memo = new Map();
function memoFetch(key, ttl, fn) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.p;
  const p = fn().catch(e => { memo.delete(key); throw e; });
  memo.set(key, { at: Date.now(), p });
  return p;
}

export const fetchChart = (sym, range, lite = false) =>
  memoFetch(`c:${sym}:${range}:${lite}`, range === "1d" || range === "5d" ? 30e3 : 600e3,
    () => j(`/api/chart?s=${encodeURIComponent(sym)}&range=${range}${lite ? "&lite=1" : ""}`));

export const searchSymbols = q => memoFetch("s:" + q, 600e3, () => j("/api/search?q=" + encodeURIComponent(q)).then(r => r.results || []));

export const fetchNews = q => memoFetch("n:" + q, 300e3, () => j("/api/news?q=" + encodeURIComponent(q)).then(r => r.items || []));

// Fundamentals change slowly, so they are cached in the browser for 12 hours.
const FKEY = "bahi-fund-v1", FTTL = 12 * 3600e3;
let fcache = store.get(FKEY, {});
export function cachedFundamentals(sym) {
  const e = fcache[sym];
  return e && Date.now() - e.at < FTTL ? e.d : null;
}
// When this browser last fetched a stock's fundamentals (ms), or null
export const fundamentalsAt = sym => (cachedFundamentals(sym) ? fcache[sym].at : null);
// Store fundamentals that arrived some other way (the /api/scan batches); call saveFundamentals() after
export const primeFundamentals = (sym, d) => { if (d) fcache[sym] = { at: Date.now(), d }; };
export const saveFundamentals = () => store.set(FKEY, fcache);
export const fetchScanBatch = syms => j("/api/scan?s=" + encodeURIComponent(syms.join(",")));
export async function fetchFundamentals(syms, onProgress) {
  const need = syms.filter(s => !cachedFundamentals(s));
  let done = syms.length - need.length, errors = 0, lastErr = null;
  onProgress?.(done, syms.length);
  const chunks = [];
  for (let i = 0; i < need.length; i += 10) chunks.push(need.slice(i, i + 10));
  await pool(chunks, 3, async c => {
    try {
      const r = await j("/api/fundamentals?s=" + encodeURIComponent(c.join(",")));
      for (const [k, v] of Object.entries(r.data || {})) fcache[k] = { at: Date.now(), d: v };
    } catch (e) { errors++; lastErr = e; }
    done += c.length;
    onProgress?.(done, syms.length);
  });
  // drop expired entries, then save; if storage is full, keep it in memory only
  const now = Date.now();
  for (const k of Object.keys(fcache)) if (now - fcache[k].at > FTTL) delete fcache[k];
  store.set(FKEY, fcache);
  const out = {};
  syms.forEach(s => { const d = cachedFundamentals(s); if (d) out[s] = d; });
  if (errors && !Object.keys(out).length) throw lastErr;
  return out;
}

// Splits/bonus issues and dividends per symbol ({splits:[{t,ratio}], divs:[{t,amt}]}, t in seconds).
// Cached in the browser for 12 hours; failures just mean no adjustment this time.
const AKEY = "screener-actions-v1";
let acache = store.get(AKEY, {});
export async function fetchActions(syms) {
  const now = Date.now(), need = [...new Set(syms)].filter(s => /\.(NS|BO)$/.test(s) && !(acache[s] && now - acache[s].at < 12 * 3600e3));
  const chunks = [];
  for (let i = 0; i < need.length; i += 20) chunks.push(need.slice(i, i + 20));
  await pool(chunks, 3, async c => {
    try {
      const r = await j("/api/actions?s=" + encodeURIComponent(c.join(",")));
      for (const [k, v] of Object.entries(r.data || {})) acache[k] = { at: now, d: v };
    } catch { /* try again next time */ }
  });
  store.set(AKEY, acache);
  const out = {};
  syms.forEach(s => { if (acache[s]) out[s] = acache[s].d; });
  return out;
}
