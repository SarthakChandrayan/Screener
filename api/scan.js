// GET /api/scan?s=SYM1,SYM2,... (max 25)
// Everything the Buy plan and screener need for a batch of stocks in one request: fundamentals plus
// one year of daily closes (for trends, RSI, volatility). Responses are cached on Vercel's CDN for hours,
// so after the first visitor (or the morning /api/warm run) everyone gets the batch instantly.

const { parseSyms, mapLimit, send, round } = require("./_lib");
const { fetchOne } = require("./fundamentals");
const { series } = require("./chart");

module.exports = async (req, res) => {
  const syms = parseSyms(req.query.s, 25);
  if (!syms.length) return send(res, 400, { error: "Pass symbols like ?s=RELIANCE.NS,TCS.NS" });
  const data = {};
  let ok = 0;
  await mapLimit(syms, 5, async s => {
    const [f, c] = await Promise.all([fetchOne(s).catch(() => null), series(s, "1y", true).catch(() => null)]);
    if (!f && !c) return;
    ok++;
    // keep the payload small: rounded closes, and only the recent volumes the technicals use
    data[s] = { f, h: c && c.c.length ? { t: c.t, c: c.c.map(x => round(x, 2)), v: c.v.slice(-25) } : null };
  });
  if (!ok) return send(res, 502, { error: "No data available for these symbols right now" });
  // a partial batch is cached briefly so a temporary failure doesn't stick for hours
  send(res, 200, { data, at: Date.now() }, ok === syms.length ? 21600 : 300);
};
