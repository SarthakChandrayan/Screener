// GET /api/quote?s=RELIANCE.NS,TCS.NS,^NSEI,INR=X
// Live quotes from Upstox when UPSTOX_TOKEN is set; everything else (and any Upstox failure)
// comes from Yahoo Finance's chart endpoint, delayed, with a small intraday sparkline.

const { parseSyms, cached, getJSON, mapLimit, send, round } = require("./_lib");
const upstox = require("./_upstox");

function sample(arr, n) {
  if (arr.length <= n) return arr;
  const step = (arr.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)]);
}

async function fetchOne(sym) {
  return cached("q:" + sym, 15e3, async () => {
    const j = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=5m`);
    const res = j?.chart?.result?.[0];
    const m = res?.meta;
    if (!m || !(m.regularMarketPrice > 0)) return null;
    const q = res.indicators?.quote?.[0] || {};
    const closes = (q.close || []).filter(Number.isFinite);
    const open = (q.open || []).find(Number.isFinite);
    const prev = m.previousClose ?? m.chartPreviousClose ?? null;
    const price = m.regularMarketPrice;
    return {
      price,
      prevClose: prev,
      change: prev ? round(price - prev, 4) : null,
      changePct: prev ? round((price / prev - 1) * 100, 3) : null,
      open: open ?? null,
      high: m.regularMarketDayHigh ?? null,
      low: m.regularMarketDayLow ?? null,
      volume: m.regularMarketVolume ?? null,
      w52h: m.fiftyTwoWeekHigh ?? null,
      w52l: m.fiftyTwoWeekLow ?? null,
      name: m.longName || m.shortName || null,
      exchange: m.fullExchangeName || m.exchangeName || null,
      currency: m.currency || null,
      time: m.regularMarketTime ? m.regularMarketTime * 1000 : Date.now(),
      spark: sample(closes, 40).map(v => round(v, 4)),
      src: "yahoo",
    };
  });
}

module.exports = async (req, res) => {
  const syms = parseSyms(req.query.s, 60);
  if (!syms.length) return send(res, 400, { error: "Pass symbols like ?s=RELIANCE.NS,TCS.NS" });
  const quotes = {};
  let warning = null;
  if (upstox.enabled()) {
    try { Object.assign(quotes, await upstox.quotes(syms)); }
    catch (e) { warning = "Upstox: " + e.message; }
  }
  const rest = syms.filter(s => !quotes[s]);
  const results = await mapLimit(rest, 10, fetchOne);
  results.forEach((q, i) => { if (q) quotes[rest[i]] = q; });
  send(res, 200, { quotes, source: upstox.enabled() && !warning ? "upstox" : "yahoo", warning, fetchedAt: Date.now() }, upstox.enabled() ? 5 : 15);
};
