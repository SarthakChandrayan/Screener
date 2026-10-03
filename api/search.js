// GET /api/search?q=reliance
// Symbol lookup via Yahoo Finance search. Indian listings are ranked first.

const { cached, getJSON, send } = require("./_lib");

const RANK = { NSI: 0, BSE: 1 };

module.exports = async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 40);
  if (q.length < 1) return send(res, 400, { error: "Pass ?q=" });
  try {
    const results = await cached("s:" + q.toLowerCase(), 3600e3, async () => {
      const j = await getJSON(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0&enableFuzzyQuery=false`);
      return (j.quotes || [])
        .filter(x => x.symbol && ["EQUITY", "ETF", "INDEX", "MUTUALFUND", "CURRENCY", "FUTURE", "CRYPTOCURRENCY"].includes(x.quoteType))
        .map(x => ({ sym: x.symbol, name: x.longname || x.shortname || x.symbol, exch: x.exchDisp || x.exchange, type: x.quoteType, rank: RANK[x.exchange] ?? 2 }))
        .sort((a, b) => a.rank - b.rank)
        .map(({ rank, ...x }) => x);
    });
    send(res, 200, { results }, 3600);
  } catch (e) {
    send(res, 502, { error: e.message });
  }
};
