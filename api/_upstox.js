// Upstox market data (used when the UPSTOX_TOKEN environment variable is set).
// Docs: https://upstox.com/developer/api-documentation — Full Market Quotes V3, Historical Candle Data V3, Instrument Search.
// Anything Upstox can't price (global indices, FX, BSE scrip codes, unknown tickers) falls back to Yahoo in the callers.

const { cached, mapLimit, round } = require("./_lib");

const BASE = "https://api.upstox.com";
const token = () => process.env.UPSTOX_TOKEN || process.env.UPSTOX_ACCESS_TOKEN || "";
const enabled = () => !!token();

// Yahoo-style index symbols used by the app → Upstox instrument keys
const INDEX_KEYS = {
  "^NSEI": "NSE_INDEX|Nifty 50",
  "^NSEBANK": "NSE_INDEX|Nifty Bank",
  "^CNXIT": "NSE_INDEX|Nifty IT",
  "^NSEMDCP50": "NSE_INDEX|Nifty Midcap 50",
  "^CNXAUTO": "NSE_INDEX|Nifty Auto",
  "^CNXFMCG": "NSE_INDEX|Nifty FMCG",
  "^CNXPHARMA": "NSE_INDEX|Nifty Pharma",
  "^CNXMETAL": "NSE_INDEX|Nifty Metal",
  "^CNXENERGY": "NSE_INDEX|Nifty Energy",
  "^CNXREALTY": "NSE_INDEX|Nifty Realty",
  "^CNXPSUBANK": "NSE_INDEX|Nifty PSU Bank",
  "^INDIAVIX": "NSE_INDEX|India VIX",
  "^BSESN": "BSE_INDEX|SENSEX",
};

async function call(path) {
  const r = await fetch(BASE + path, { headers: { Accept: "application/json", Authorization: "Bearer " + token() } });
  let j = null;
  try { j = await r.json(); } catch { /* non-JSON error page */ }
  if (!r.ok || j?.status === "error") {
    const e = new Error(j?.errors?.[0]?.message || `HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return j;
}

// RELIANCE.NS → NSE_EQ|INE002A01018 via Instrument Search, cached for a day ("" = no match)
async function instrumentKey(sym) {
  if (INDEX_KEYS[sym]) return INDEX_KEYS[sym];
  const m = sym.match(/^(.+)\.(NS|BO)$/);
  if (!m || /^\d+$/.test(m[1])) return ""; // BSE scrip codes aren't searchable
  const [, ts, ex] = m;
  const exch = ex === "NS" ? "NSE" : "BSE";
  return cached("uk:" + sym, 24 * 3600e3, async () => {
    const q = ts.replace(/[&\-]/g, " ").trim();
    const j = await call(`/v2/instruments/search?query=${encodeURIComponent(q)}&exchanges=${exch}&segments=EQ&records=30`);
    const hit = (j.data || []).find(d => String(d.trading_symbol).toUpperCase() === ts && d.segment === exch + "_EQ");
    return hit?.instrument_key || "";
  });
}

async function keysFor(syms) {
  let err = null;
  const keys = await mapLimit(syms, 8, s => instrumentKey(s).catch(e => { err = err || e; return ""; }));
  const byKey = new Map();
  syms.forEach((s, i) => { if (keys[i]) byKey.set(keys[i], s); });
  if (!byKey.size && err) throw err; // e.g. expired token: let the caller report it
  return byKey;
}

function toQuote(d, key) {
  const price = d.last_price;
  const prev = d.prev_close_price ?? (Number.isFinite(d.net_change) ? price - d.net_change : null);
  return {
    price: round(price, 4),
    prevClose: prev,
    change: prev ? round(price - prev, 4) : null,
    changePct: prev ? round((price / prev - 1) * 100, 3) : null,
    open: d.ohlc?.open ?? null,
    high: d.ohlc?.high ?? null,
    low: d.ohlc?.low ?? null,
    volume: d.volume ?? d.ohlc?.volume ?? null,
    w52h: d.year_high ?? null,
    w52l: d.year_low ?? null,
    name: null,
    exchange: key.startsWith("BSE") ? "BSE" : "NSE",
    currency: "INR",
    time: Number(d.last_trade_time) || Date.parse(d.timestamp) || Date.now(),
    spark: [],
    src: "upstox",
  };
}

// { "RELIANCE.NS": quote, ... } for the symbols Upstox could price
async function quotes(syms) {
  const byKey = await keysFor(syms);
  const list = [...byKey.keys()], out = {};
  for (let i = 0; i < list.length; i += 500) {
    const j = await call(`/v3/market-quote/quotes?instrument_key=${list.slice(i, i + 500).map(encodeURIComponent).join(",")}`);
    for (const [k, d] of Object.entries(j.data || {})) {
      const key = d.instrument_token || k.replace(":", "|");
      const sym = byKey.get(key);
      if (sym && d.last_price > 0) out[sym] = toQuote(d, key);
    }
  }
  return out;
}

// Daily-and-longer history. Intraday ranges stay on Yahoo (Upstox history ends at the previous session).
const PLAN = {
  "3mo": ["days", 92], "6mo": ["days", 183], "ytd": ["days", "ytd"], "1y": ["days", 366], "2y": ["days", 731],
  "5y": ["weeks", 1827], "10y": ["weeks", 3653], "max": ["months", "max"],
};
const istDate = daysAgo => new Date(Date.now() + 19800e3 - daysAgo * 864e5).toISOString().slice(0, 10);

// → [[unixSec, o, h, l, c, v], ...] ascending, or null if Upstox doesn't cover this symbol/range
async function candles(sym, range) {
  const plan = PLAN[range];
  if (!plan) return null;
  const key = await instrumentKey(sym);
  if (!key) return null;
  const [unit, span] = plan;
  const to = istDate(0);
  const from = span === "ytd" ? to.slice(0, 4) + "-01-01" : span === "max" ? "2000-01-01" : istDate(span);
  const j = await call(`/v3/historical-candle/${encodeURIComponent(key)}/${unit}/1/${to}/${from}`);
  const rows = (j.data?.candles || [])
    .map(c => [Math.floor(Date.parse(c[0]) / 1000), c[1], c[2], c[3], c[4], c[5] || 0])
    .filter(r => Number.isFinite(r[0]) && Number.isFinite(r[4]))
    .sort((a, b) => a[0] - b[0]);
  return rows.length ? rows : null;
}

module.exports = { enabled, quotes, candles, instrumentKey };
