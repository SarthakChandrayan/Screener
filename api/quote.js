// Vercel serverless function: GET /api/quote?s=RELIANCE.NS,TCS.NS,500325.BO
// Fetches delayed quotes from Yahoo Finance's public chart endpoint.
// Unofficial source: fine for personal use, may change or rate-limit without notice.

const VALID = /^[A-Z0-9&\-_.^]{1,30}\.(NS|BO)$/;

async function fetchOne(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (bahi-screener)" } });
  if (!r.ok) return null;
  const j = await r.json();
  const m = j?.chart?.result?.[0]?.meta;
  if (!m || !(m.regularMarketPrice > 0)) return null;
  return {
    price: m.regularMarketPrice,
    prevClose: m.chartPreviousClose ?? m.previousClose ?? null,
    time: m.regularMarketTime ? m.regularMarketTime * 1000 : Date.now(),
    currency: m.currency || "INR",
  };
}

module.exports = async (req, res) => {
  const syms = String(req.query.s || "")
    .split(",").map(s => s.trim().toUpperCase()).filter(s => VALID.test(s))
    .slice(0, 40);
  if (!syms.length) {
    res.status(400).json({ error: "Pass symbols like ?s=RELIANCE.NS,TCS.NS" });
    return;
  }
  const quotes = {};
  // small batches so we don't hammer the upstream
  for (let i = 0; i < syms.length; i += 8) {
    const batch = syms.slice(i, i + 8);
    const results = await Promise.allSettled(batch.map(fetchOne));
    results.forEach((r, k) => { if (r.status === "fulfilled" && r.value) quotes[batch[k]] = r.value; });
  }
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
  res.status(200).json({ quotes, fetchedAt: Date.now() });
};
