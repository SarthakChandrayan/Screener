// Shared helpers for the /api functions. Files starting with "_" are not deployed as endpoints.
// All data comes from Yahoo Finance's public (unofficial) endpoints and Google News RSS:
// fine for personal use, but they can change or rate-limit without notice.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// NSE/BSE tickers plus indices (^NSEI), FX (INR=X), futures (GC=F), crypto (BTC-USD), foreign (000001.SS)
const SYM = /^[A-Z0-9^=&\-_.]{1,30}$/;

function parseSyms(raw, max) {
  return [...new Set(String(raw || "").split(",").map(s => s.trim().toUpperCase()).filter(s => SYM.test(s)))].slice(0, max);
}

// Per-instance memo. Warm serverless instances reuse it, which keeps Yahoo traffic down.
const memo = new Map();
async function cached(key, ttlMs, fn) {
  const hit = memo.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();
  if (val != null) {
    memo.set(key, { val, exp: Date.now() + ttlMs });
    if (memo.size > 3000) memo.delete(memo.keys().next().value);
  }
  return val;
}

async function getJSON(url, headers = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
  if (!r.ok) { const e = new Error(`Upstream HTTP ${r.status}`); e.status = r.status; throw e; }
  return r.json();
}

async function getText(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) { const e = new Error(`Upstream HTTP ${r.status}`); e.status = r.status; throw e; }
  return r.text();
}

// Yahoo's quoteSummary endpoint needs a session cookie + "crumb" token.
let auth = null;
async function getAuth(force) {
  if (auth && !force && Date.now() - auth.at < 3600e3) return auth;
  let cookie = "";
  for (const u of ["https://fc.yahoo.com/", "https://finance.yahoo.com/"]) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA }, redirect: "manual" });
      const set = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [r.headers.get("set-cookie")].filter(Boolean);
      cookie = set.map(c => c.split(";")[0]).join("; ");
      if (cookie) break;
    } catch { /* try the next one */ }
  }
  const r = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, Cookie: cookie } });
  const crumb = (await r.text()).trim();
  if (!r.ok || !crumb || crumb.includes("<") || crumb.length > 40) throw new Error("Couldn't get a Yahoo session");
  auth = { cookie, crumb, at: Date.now() };
  return auth;
}

async function getJSONAuthed(buildUrl) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    const a = await getAuth(attempt > 0);
    try { return await getJSON(buildUrl(encodeURIComponent(a.crumb)), { Cookie: a.cookie }); }
    catch (e) { last = e; if (e.status !== 401 && e.status !== 403) throw e; }
  }
  throw last;
}

async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch { out[k] = null; } }
  }));
  return out;
}

function send(res, status, body, cacheSec = 0) {
  if (cacheSec) res.setHeader("Cache-Control", `s-maxage=${cacheSec}, stale-while-revalidate=${cacheSec * 2}`);
  res.status(status).json(body);
}

const round = (n, d = 2) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);

module.exports = { UA, SYM, parseSyms, cached, getJSON, getText, getJSONAuthed, mapLimit, send, round };
