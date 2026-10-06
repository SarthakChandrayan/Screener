// GET /api/fundamentals?s=RELIANCE.NS,TCS.NS (max 15)
// Valuation, profitability, balance sheet, analyst and profile data from Yahoo's quoteSummary.

const { parseSyms, cached, getJSONAuthed, mapLimit, send, round } = require("./_lib");

const MODULES = "price,summaryDetail,defaultKeyStatistics,financialData,assetProfile";
const raw = x => (x && typeof x === "object" ? x.raw : x);
const num = x => { const v = raw(x); return Number.isFinite(v) ? v : null; };
const pct = x => { const v = num(x); return v == null ? null : round(v * 100, 2); };

async function fetchOne(sym) {
  return cached("f:" + sym, 6 * 3600e3, async () => {
    const j = await getJSONAuthed(c => `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${MODULES}&crumb=${c}`);
    const r = j?.quoteSummary?.result?.[0];
    if (!r) return null;
    const p = r.price || {}, sd = r.summaryDetail || {}, ks = r.defaultKeyStatistics || {}, fd = r.financialData || {}, ap = r.assetProfile || {};
    const de = num(fd.debtToEquity);
    return {
      name: p.longName || p.shortName || null,
      sector: ap.sector || null,
      industry: ap.industry || null,
      summary: ap.longBusinessSummary || null,
      website: ap.website || null,
      employees: ap.fullTimeEmployees || null,
      city: ap.city || null,
      mcap: num(p.marketCap) ?? num(sd.marketCap),
      pe: round(num(sd.trailingPE)),
      fpe: round(num(sd.forwardPE) ?? num(ks.forwardPE)),
      pb: round(num(ks.priceToBook)),
      ps: round(num(sd.priceToSalesTrailing12Months)),
      peg: round(num(ks.pegRatio)),
      evEbitda: round(num(ks.enterpriseToEbitda)),
      eps: round(num(ks.trailingEps)),
      bvps: round(num(ks.bookValue)),
      dy: pct(sd.dividendYield),
      payout: pct(sd.payoutRatio),
      beta: round(num(sd.beta) ?? num(ks.beta)),
      roe: pct(fd.returnOnEquity),
      roa: pct(fd.returnOnAssets),
      de: de == null ? null : round(de / 100, 3), // Yahoo reports D/E as a percentage
      cr: round(num(fd.currentRatio)),
      revGrowth: pct(fd.revenueGrowth),
      epsGrowth: pct(fd.earningsGrowth),
      gpm: pct(fd.grossMargins),
      opm: pct(fd.operatingMargins),
      npm: pct(fd.profitMargins),
      revenue: num(fd.totalRevenue),
      ebitda: num(fd.ebitda),
      cash: num(fd.totalCash),
      debt: num(fd.totalDebt),
      fcf: num(fd.freeCashflow),
      target: round(num(fd.targetMeanPrice)),
      targetHigh: round(num(fd.targetHighPrice)),
      targetLow: round(num(fd.targetLowPrice)),
      rec: fd.recommendationKey || null,
      analysts: num(fd.numberOfAnalystOpinions),
      insiders: pct(ks.heldPercentInsiders),
      institutions: pct(ks.heldPercentInstitutions),
      w52h: num(sd.fiftyTwoWeekHigh),
      w52l: num(sd.fiftyTwoWeekLow),
      avgVol: num(sd.averageVolume),
    };
  });
}

module.exports = async (req, res) => {
  const syms = parseSyms(req.query.s, 15);
  if (!syms.length) return send(res, 400, { error: "Pass symbols like ?s=RELIANCE.NS" });
  let firstErr = null;
  const results = await mapLimit(syms, 5, s => fetchOne(s).catch(e => { firstErr = firstErr || e; return null; }));
  const data = {};
  results.forEach((d, i) => { if (d) data[syms[i]] = d; });
  if (!Object.keys(data).length && firstErr) return send(res, 502, { error: "Fundamentals unavailable: " + firstErr.message });
  send(res, 200, { data }, 21600);
};
module.exports.fetchOne = fetchOne;
