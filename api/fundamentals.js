// GET /api/fundamentals?s=RELIANCE.NS,TCS.NS (max 15)
// Valuation, profitability, balance sheet, analyst and profile data from Yahoo's quoteSummary.

const { parseSyms, cached, getJSON, getJSONAuthed, mapLimit, send, round } = require("./_lib");

const MODULES = "price,summaryDetail,defaultKeyStatistics,financialData,assetProfile,calendarEvents";

// Up to 4 years of annual figures, so scores reward consistency instead of one good (or bad) year
const SERIES = ["TotalRevenue", "NetIncome", "DilutedEPS", "OperatingCashFlow", "FreeCashFlow", "StockholdersEquity", "TotalDebt", "OrdinarySharesNumber",
  // for the Piotroski F-score and Altman Z-score
  "TotalAssets", "CurrentAssets", "CurrentLiabilities", "LongTermDebt", "GrossProfit", "EBIT", "RetainedEarnings", "TotalLiabilitiesNetMinorityInterest"];
async function history(sym) {
  const now = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(sym)}?symbol=${encodeURIComponent(sym)}&type=${SERIES.map(t => "annual" + t).join(",")}&period1=${now - 6 * 365 * 86400}&period2=${now}`;
  const j = await getJSON(url).catch(() => null);
  const by = {};
  for (const r of j?.timeseries?.result || []) {
    const type = r.meta?.type?.[0], key = type?.replace(/^annual/, "");
    if (!key) continue;
    for (const x of r[type] || []) {
      const v = x?.reportedValue?.raw;
      if (x?.asOfDate && Number.isFinite(v)) (by[x.asOfDate] ||= {})[key] = v;
    }
  }
  const years = Object.keys(by).sort().slice(-4).map(d => ({ d, ...by[d] }));
  return years.length >= 2 ? years : null;
}

// Piotroski F-score: 9 pass/fail checks comparing the latest year with the one before (higher = healthier,
// improving business). Skips any check whose inputs are missing; returns the score, how many checks ran,
// and the checks that failed, in plain English.
function piotroski(Y) {
  if (Y.length < 2) return {};
  const [a, b] = [Y[Y.length - 2], Y[Y.length - 1]]; // previous, latest
  const f = Number.isFinite, checks = [];
  const add = (pass, fail) => { if (pass != null) checks.push({ pass, fail }); };
  const roa = y => (f(y.NetIncome) && y.TotalAssets > 0 ? y.NetIncome / y.TotalAssets : null);
  const lev = y => (y.TotalAssets > 0 ? (f(y.LongTermDebt) ? y.LongTermDebt : f(y.TotalDebt) ? y.TotalDebt : null) / y.TotalAssets : null);
  const cur = y => (y.CurrentLiabilities > 0 && f(y.CurrentAssets) ? y.CurrentAssets / y.CurrentLiabilities : null);
  const gm = y => (y.TotalRevenue > 0 && f(y.GrossProfit) ? y.GrossProfit / y.TotalRevenue : null);
  const turn = y => (y.TotalAssets > 0 && f(y.TotalRevenue) ? y.TotalRevenue / y.TotalAssets : null);
  const both = (fn, cmp) => (fn(a) != null && fn(b) != null && Number.isFinite(fn(a)) && Number.isFinite(fn(b)) ? cmp(fn(b), fn(a)) : null);
  add(roa(b) != null ? roa(b) > 0 : null, "not profitable on its assets");
  add(f(b.OperatingCashFlow) ? b.OperatingCashFlow > 0 : null, "negative operating cash flow");
  add(both(roa, (x, y) => x > y), "return on assets fell");
  add(f(b.OperatingCashFlow) && f(b.NetIncome) ? b.OperatingCashFlow > b.NetIncome : null, "cash flow lower than reported profit");
  add(both(lev, (x, y) => x <= y), "more long-term debt relative to assets");
  add(both(cur, (x, y) => x > y), "short-term liquidity got worse");
  add(f(a.OrdinarySharesNumber) && f(b.OrdinarySharesNumber) ? b.OrdinarySharesNumber <= a.OrdinarySharesNumber * 1.005 : null, "issued new shares");
  add(both(gm, (x, y) => x > y), "gross margin fell");
  add(both(turn, (x, y) => x > y), "uses its assets less efficiently (asset turnover fell)");
  return checks.length >= 6 ? { fScore: checks.filter(c => c.pass).length, fMax: checks.length, fFails: checks.filter(c => !c.pass).map(c => c.fail) } : {};
}

// Altman Z''-score (the version for non-manufacturing and emerging-market companies):
// above 2.6 = safe, 1.1–2.6 = grey zone, below 1.1 = distress risk. Not meaningful for banks and NBFCs.
function altman(y) {
  const f = Number.isFinite;
  if (!(y.TotalAssets > 0) || ![y.CurrentAssets, y.CurrentLiabilities, y.RetainedEarnings, y.EBIT, y.StockholdersEquity, y.TotalLiabilitiesNetMinorityInterest].every(f) || !(y.TotalLiabilitiesNetMinorityInterest > 0)) return null;
  const ta = y.TotalAssets;
  return round(6.56 * (y.CurrentAssets - y.CurrentLiabilities) / ta + 3.26 * y.RetainedEarnings / ta + 6.72 * y.EBIT / ta + 1.05 * y.StockholdersEquity / y.TotalLiabilitiesNetMinorityInterest, 2);
}

// Multi-year measures from the annual figures (null when there isn't enough history)
function derive(Y) {
  if (!Y) return {};
  const n = Y.length, first = Y[0], last = Y[n - 1], yrs = n - 1;
  const cagr = (a, b) => (a > 0 && b > 0 ? round((Math.pow(b / a, 1 / yrs) - 1) * 100, 1) : null);
  const has = k => Y.filter(y => Number.isFinite(y[k]));
  const ni = has("NetIncome"), eq = has("StockholdersEquity");
  const roes = Y.filter(y => Number.isFinite(y.NetIncome) && y.StockholdersEquity > 0).map(y => y.NetIncome / y.StockholdersEquity * 100);
  const both = Y.filter(y => Number.isFinite(y.NetIncome) && Number.isFinite(y.OperatingCashFlow));
  const niSum = both.reduce((a, y) => a + y.NetIncome, 0), cfoSum = both.reduce((a, y) => a + y.OperatingCashFlow, 0);
  const rev = has("TotalRevenue");
  const de = y => (y.StockholdersEquity > 0 && Number.isFinite(y.TotalDebt) ? y.TotalDebt / y.StockholdersEquity : null);
  return {
    nYrs: n, histFrom: first.d.slice(0, 4), histTo: last.d.slice(0, 4),
    revCagr: rev.length >= 3 ? cagr(rev[0].TotalRevenue, rev[rev.length - 1].TotalRevenue) : null,
    epsCagr: has("DilutedEPS").length >= 3 ? cagr(first.DilutedEPS, last.DilutedEPS) : null,
    profYrs: ni.length ? ni.filter(y => y.NetIncome > 0).length : null, niYrs: ni.length || null,
    revUpYrs: rev.length >= 3 ? rev.slice(1).filter((y, i) => y.TotalRevenue > rev[i].TotalRevenue).length : null,
    avgRoe: roes.length >= 2 ? round(roes.reduce((a, b) => a + b, 0) / roes.length, 1) : null,
    roeMin: roes.length >= 2 ? round(Math.min(...roes), 1) : null,
    cashConv: both.length >= 2 && niSum > 0 ? round(cfoSum / niSum, 2) : null,
    fcfYrs: has("FreeCashFlow").length ? has("FreeCashFlow").filter(y => y.FreeCashFlow > 0).length : null,
    dilution: first.OrdinarySharesNumber > 0 && last.OrdinarySharesNumber > 0 ? round((last.OrdinarySharesNumber / first.OrdinarySharesNumber - 1) * 100, 1) : null,
    deChange: de(first) != null && de(last) != null ? round(de(last) - de(first), 2) : null,
    eqYrs: eq.length || null,
    sharesOut: Number.isFinite(last.OrdinarySharesNumber) ? last.OrdinarySharesNumber : null,
    // latest-year figures, used when Yahoo's summary leaves the ratio out (common for Indian stocks)
    roaY: Number.isFinite(last.NetIncome) && last.TotalAssets > 0 ? round(last.NetIncome / last.TotalAssets * 100, 2) : null,
    crY: last.CurrentLiabilities > 0 && Number.isFinite(last.CurrentAssets) ? round(last.CurrentAssets / last.CurrentLiabilities, 2) : null,
    fcfY: Number.isFinite(last.FreeCashFlow) ? last.FreeCashFlow : null,
    revGrowthY: n >= 2 && Y[n - 2].TotalRevenue > 0 && Number.isFinite(last.TotalRevenue) ? round((last.TotalRevenue / Y[n - 2].TotalRevenue - 1) * 100, 1) : null,
    epsGrowthY: n >= 2 && Y[n - 2].DilutedEPS > 0 && Number.isFinite(last.DilutedEPS) ? round((last.DilutedEPS / Y[n - 2].DilutedEPS - 1) * 100, 1) : null,
    ...piotroski(Y),
    altmanZ: altman(last),
  };
}
const raw = x => (x && typeof x === "object" ? x.raw : x);
const num = x => { const v = raw(x); return Number.isFinite(v) ? v : null; };
const pct = x => { const v = num(x); return v == null ? null : round(v * 100, 2); };

async function fetchOne(sym) {
  return cached("f:" + sym, 6 * 3600e3, async () => {
    const j = await getJSONAuthed(c => `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${MODULES}&crumb=${c}`);
    const r = j?.quoteSummary?.result?.[0];
    if (!r) return null;
    const p = r.price || {}, sd = r.summaryDetail || {}, ks = r.defaultKeyStatistics || {}, fd = r.financialData || {}, ap = r.assetProfile || {};
    const ce = r.calendarEvents?.earnings || {};
    const hist = derive(await history(sym).catch(() => null));
    const de = num(fd.debtToEquity);
    const eps = num(ks.trailingEps), bvps = num(ks.bookValue);
    return {
      name: p.longName || p.shortName || null,
      sector: ap.sector || null,
      industry: ap.industry || null,
      summary: ap.longBusinessSummary || null,
      website: ap.website || null,
      employees: ap.fullTimeEmployees || null,
      city: ap.city || null,
      // Yahoo sometimes omits market cap (e.g. TCS); fall back to shares outstanding × price
      mcap: num(p.marketCap) ?? num(sd.marketCap) ?? (() => {
        const sh = num(ks.sharesOutstanding) ?? hist.sharesOut, px = num(fd.currentPrice) ?? num(p.regularMarketPrice);
        return sh && px ? Math.round(sh * px) : null;
      })(),
      sharesOut: num(ks.sharesOutstanding) ?? hist.sharesOut ?? null,
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
      // Yahoo often omits these for Indian stocks: fall back to TTM EPS ÷ book value per share, and the latest annual report
      roe: pct(fd.returnOnEquity) ?? (eps != null && bvps > 0 ? round(eps / bvps * 100, 2) : null),
      roa: pct(fd.returnOnAssets) ?? hist.roaY ?? null,
      de: de == null ? null : round(de / 100, 3), // Yahoo reports D/E as a percentage
      cr: round(num(fd.currentRatio)) ?? hist.crY ?? null,
      revGrowth: pct(fd.revenueGrowth) ?? hist.revGrowthY ?? null,
      epsGrowth: pct(fd.earningsGrowth) ?? hist.epsGrowthY ?? null,
      gpm: pct(fd.grossMargins),
      opm: pct(fd.operatingMargins),
      npm: pct(fd.profitMargins),
      revenue: num(fd.totalRevenue),
      ebitda: num(fd.ebitda),
      cash: num(fd.totalCash),
      debt: num(fd.totalDebt),
      fcf: num(fd.freeCashflow) ?? hist.fcfY ?? null,
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
      nextEarnings: num(ce.earningsDate?.[0]) || null,
      ...hist,
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
module.exports.history = history;
module.exports.derive = derive;
