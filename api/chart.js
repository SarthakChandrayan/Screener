// GET /api/chart?s=RELIANCE.NS&range=6mo[&lite=1]
// OHLCV history. lite=1 returns only time, close and volume (used by the screener for technicals).

const { SYM, cached, getJSON, send, round } = require("./_lib");

const INTERVAL = { "1d": "5m", "5d": "15m", "1mo": "60m", "3mo": "1d", "6mo": "1d", "ytd": "1d", "1y": "1d", "2y": "1d", "5y": "1wk", "10y": "1wk", "max": "1mo" };

module.exports = async (req, res) => {
  const sym = String(req.query.s || "").trim().toUpperCase();
  const range = String(req.query.range || "6mo").toLowerCase();
  const lite = req.query.lite === "1";
  if (!SYM.test(sym)) return send(res, 400, { error: "Pass a symbol like ?s=RELIANCE.NS" });
  if (!INTERVAL[range]) return send(res, 400, { error: "range must be one of " + Object.keys(INTERVAL).join(", ") });
  const interval = INTERVAL[range];
  const intraday = interval.endsWith("m");
  try {
    const data = await cached(`c:${sym}:${range}:${lite}`, intraday ? 30e3 : 600e3, async () => {
      const j = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}&includePrePost=false`);
      const r = j?.chart?.result?.[0];
      if (!r) return null;
      const q = r.indicators?.quote?.[0] || {};
      const ts = r.timestamp || [];
      const out = { t: [], o: [], h: [], l: [], c: [], v: [] };
      for (let i = 0; i < ts.length; i++) {
        const c = q.close?.[i];
        if (!Number.isFinite(c)) continue;
        const row = [ts[i], q.open?.[i] ?? c, q.high?.[i] ?? c, q.low?.[i] ?? c, c, q.volume?.[i] ?? 0];
        // charts need strictly increasing times; Yahoo sometimes repeats the live bar
        const n = out.t.length;
        if (n && row[0] <= out.t[n - 1]) { ["t", "o", "h", "l", "c", "v"].forEach(k => out[k].pop()); }
        ["t", "o", "h", "l", "c", "v"].forEach((k, j2) => out[k].push(j2 === 0 || j2 === 5 ? row[j2] : round(row[j2], 4)));
      }
      const m = r.meta || {};
      const body = {
        sym, range, interval, intraday,
        name: m.longName || m.shortName || null,
        currency: m.currency || null,
        prevClose: range === "1d" ? (m.previousClose ?? m.chartPreviousClose ?? null) : (m.chartPreviousClose ?? null),
        t: out.t, c: out.c, v: out.v,
      };
      if (!lite) Object.assign(body, { o: out.o, h: out.h, l: out.l });
      return body;
    });
    if (!data) return send(res, 404, { error: "No data for " + sym });
    send(res, 200, data, intraday ? 30 : 1800);
  } catch (e) {
    send(res, e.status === 404 ? 404 : 502, { error: e.status === 404 ? "No data for " + sym : e.message });
  }
};
