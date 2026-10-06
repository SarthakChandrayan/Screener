// GET /api/history?s=SYM1,SYM2,... (max 25): ten years of weekly closes per stock, for the backtest.
// Cached on Vercel's CDN for a day; the browser always asks for the same fixed batches (like /api/scan).

const { parseSyms, mapLimit, send, round } = require("./_lib");
const { series } = require("./chart");

module.exports = async (req, res) => {
  const syms = parseSyms(req.query.s, 25);
  if (!syms.length) return send(res, 400, { error: "Pass symbols like ?s=RELIANCE.NS,^NSEI" });
  const data = {};
  let ok = 0;
  await mapLimit(syms, 5, async s => {
    const c = await series(s, "10y", true).catch(() => null);
    if (!c || c.c.length < 30) return;
    ok++;
    data[s] = { t: c.t, c: c.c.map(x => round(x, 2)) };
  });
  if (!ok) return send(res, 502, { error: "No price history available right now" });
  send(res, 200, { data }, ok === syms.length ? 86400 : 600);
};
