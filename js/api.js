// Client for the /api functions, with a live quote store that views subscribe to.

import { store } from "./util.js";

export const bus = new EventTarget();
const quotes = new Map();
export const getQuote = s => quotes.get(s);

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
