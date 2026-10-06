// GET /api/actions?s=RELIANCE.NS,TCS.NS (max 20)
// Splits, bonus issues and dividends over the last 2 years, from Yahoo's chart events.
// Yahoo reports bonus issues as splits (a 1:1 bonus = 2-for-1). Used to keep paper trades and
// saved Buy plans honest: price history is already adjusted, but prices we stored are not.

const { parseSyms, cached, getJSON, mapLimit, send } = require("./_lib");

async function fetchOne(sym) {
  return cached("ca:" + sym, 12 * 3600e3, async () => {
    const j = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1mo&events=div%2Csplit`);
    const ev = j?.chart?.result?.[0]?.events || {};
    const splits = Object.values(ev.splits || {})
      .map(s => ({ t: s.date, ratio: s.numerator / s.denominator }))
      .filter(s => Number.isFinite(s.ratio) && s.ratio > 0 && s.ratio !== 1);
    const divs = Object.values(ev.dividends || {})
      .map(d => ({ t: d.date, amt: d.amount }))
      .filter(d => d.amt > 0);
    return { splits: splits.sort((a, b) => a.t - b.t), divs: divs.sort((a, b) => a.t - b.t) };
  });
}

module.exports = async (req, res) => {
  const syms = parseSyms(req.query.s, 20).filter(s => /\.(NS|BO)$/.test(s));
  if (!syms.length) return send(res, 400, { error: "Pass NSE/BSE symbols like ?s=RELIANCE.NS" });
  let firstErr = null;
  const results = await mapLimit(syms, 5, s => fetchOne(s).catch(e => { firstErr = firstErr || e; return null; }));
  const data = {};
  results.forEach((d, i) => { if (d) data[syms[i]] = d; });
  if (!Object.keys(data).length && firstErr) return send(res, 502, { error: "Corporate actions unavailable: " + firstErr.message });
  send(res, 200, { data }, 21600);
};
