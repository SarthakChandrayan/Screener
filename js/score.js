// Stock scorecard: turns a screener row into 0–100 pillar scores (quality, value, growth, momentum,
// safety, income), an overall score for an investing style, plain-English reasons, red flags and a
// confidence level.
//
// How a metric is scored (the same idea as NSE's factor indices, e.g. Nifty200 Quality 30 / Momentum 30):
//   • against fixed rules of thumb for Indian large and mid caps (works for a single stock), and
//   • against its peers: valuation and margins vs the same sector, everything else vs all stocks scanned.
//   With peers available the score is 60% peer rank + 40% rule of thumb.
// Multi-year history (3–4 annual reports) is weighted above the latest year, so one good or bad year
// can't dominate. Banks and NBFCs skip margin, cash-flow and debt checks that don't apply to lenders.

const ok = Number.isFinite;
const clamp = v => Math.max(0, Math.min(100, v));
// 0 at `bad`, 100 at `good`, linear in between (works either direction)
const ramp = (v, bad, good) => clamp((v - bad) / (good - bad) * 100);
const p1 = v => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)).replace(/\.0$/, "");

export const PILLARS = [
  ["quality", "Quality", "Does the business make good money, year after year? (ROE, margins, cash flow)"],
  ["value", "Value", "Is the price reasonable vs its profits and vs its sector? (P/E, P/B, EV/EBITDA, PEG)"],
  ["growth", "Growth", "Have sales and profits grown over several years?"],
  ["momentum", "Momentum", "Has the share price risen strongly over the past year? (12-month return, skipping the latest month)"],
  ["safety", "Safety", "How risky is it? (debt, distress risk, volatility, dilution)"],
  ["income", "Income", "Does it pay you to hold it? (dividend yield)"],
];

export const STYLES = [
  { k: "balanced", name: "Balanced", desc: "A bit of everything — good default", w: { quality: 30, value: 20, growth: 20, momentum: 15, safety: 15 } },
  { k: "quality", name: "Long-term quality", desc: "Great businesses to hold for years", w: { quality: 40, value: 15, growth: 20, momentum: 5, safety: 20 } },
  { k: "value", name: "Value", desc: "Decent companies at cheap prices", w: { quality: 20, value: 45, growth: 10, momentum: 5, safety: 20 } },
  { k: "growth", name: "Growth", desc: "Fast-growing sales and profits", w: { quality: 20, value: 10, growth: 45, momentum: 15, safety: 10 } },
  { k: "momentum", name: "Momentum", desc: "Stocks already rising strongly", w: { quality: 10, value: 5, growth: 15, momentum: 60, safety: 10 } },
  { k: "income", name: "Dividend & safety", desc: "Steady payers with low risk", w: { quality: 20, value: 15, growth: 5, momentum: 5, safety: 25, income: 30 } },
];

export const isFinancial = r => /bank|financ|insur/i.test(r.sector || "");
const notFin = r => !isFinancial(r);

// Derived values that aren't stored on the row
const DERIVED = {
  ey: r => (ok(r.pe) && r.pe > 0 ? 100 / r.pe : null),                                   // earnings yield %, higher = cheaper
  profRatio: r => (r.niYrs >= 3 ? r.profYrs / r.niYrs : null),
  fNorm: r => (r.fMax >= 6 ? r.fScore / r.fMax * 9 : null),
};
const val = (r, k) => (DERIVED[k] ? DERIVED[k](r) : r[k]);

// Metric table. dir: 1 = higher is better, -1 = lower is better. abs: [bad, good] rule of thumb.
// peer: "sector" (compare with same-sector stocks), "all" (all stocks scanned) or null (rule of thumb only).
// w: weight inside its pillar. when(r): does it apply to this company? say(v, r, ctx): reason shown when it scores 70+.
const METRICS = [
  // quality: multi-year first
  { k: "avgRoe", p: "quality", w: 2.5, dir: 1, abs: [6, 22], peer: "all", say: (v, r) => `Average ROE ${p1(v)}% over ${r.nYrs} years — consistently earns well on shareholders' money` },
  { k: "roe", p: "quality", w: 1.5, dir: 1, abs: [5, 22], peer: "all", say: v => `ROE ${p1(v)}% — makes ₹${p1(v)} a year on every ₹100 of shareholders' money` },
  { k: "cashConv", p: "quality", w: 1.5, dir: 1, abs: [0.4, 1.0], peer: null, when: notFin, say: v => `Turns ${Math.round(Math.min(v, 1.5) * 100)}% of its reported profit into actual cash` },
  { k: "profRatio", p: "quality", w: 1, dir: 1, abs: [0.5, 1], peer: null, say: (v, r) => (v === 1 ? `Profitable in every one of the last ${r.niYrs} years` : null) },
  { k: "fNorm", p: "quality", w: 1.5, dir: 1, abs: [3, 8], peer: null, say: (v, r) => `Piotroski F-score ${r.fScore}/${r.fMax} — healthy and improving finances (profit, cash flow, debt, efficiency all checked)` },
  { k: "opm", p: "quality", w: 1, dir: 1, abs: [5, 25], peer: "sector", when: notFin, say: v => `Operating margin ${p1(v)}% — better than most companies in its sector` },
  { k: "npm", p: "quality", w: 1, dir: 1, abs: [2, 18], peer: "sector", say: v => `Net margin ${p1(v)}% — healthy final profit on sales` },
  { k: "roa", p: "quality", w: 0.75, dir: 1, abs: [1, 10], absFin: [0.5, 2], peer: "sector", say: v => `ROA ${p1(v)}% — earns well on everything it owns` },
  // value: judged against sector peers, because a "cheap" P/E differs a lot between sectors
  { k: "ey", p: "value", w: 2, dir: 1, abs: [1.7, 8], peer: "sector", say: (v, r, c) => (c?.sectorSize(r) >= 5 ? `P/E ${p1(r.pe)} — cheaper than most ${r.sector} peers (sector median ${p1(c.median("pe", r))})` : `P/E ${p1(r.pe)} — you pay ₹${p1(r.pe)} for each ₹1 of yearly profit, a reasonable price`) },
  { k: "pb", p: "value", w: 1, dir: -1, abs: [10, 1.5], absFin: [4, 1], peer: "sector", say: (v, r, c) => (c?.sectorSize(r) >= 5 ? `P/B ${p1(v)} — lower than most ${r.sector} peers (median ${p1(c.median("pb", r))})` : `P/B ${p1(v)} — priced close to the value of its assets`) },
  { k: "evEbitda", p: "value", w: 1, dir: -1, abs: [35, 8], peer: "sector", when: r => notFin(r) && r.evEbitda > 0, say: v => `EV/EBITDA ${p1(v)} — cheap compared with its operating profit` },
  { k: "peg", p: "value", w: 1, dir: -1, abs: [3, 0.8], peer: "all", when: r => r.peg > 0, say: v => `PEG ${p1(v)} — price looks fair for how fast profits are growing` },
  // growth: 3-year compound growth matters more than the latest quarter
  { k: "revCagr", p: "growth", w: 2, dir: 1, abs: [0, 18], peer: "all", say: (v, r) => `Sales grew ${p1(v)}% a year over ${r.nYrs - 1} years` },
  { k: "epsCagr", p: "growth", w: 2, dir: 1, abs: [0, 22], peer: "all", say: (v, r) => `Profit per share grew ${p1(v)}% a year over ${r.nYrs - 1} years` },
  { k: "revGrowth", p: "growth", w: 1, dir: 1, abs: [-5, 20], peer: "all", say: v => `Sales up ${p1(v)}% from a year ago` },
  { k: "epsGrowth", p: "growth", w: 0.75, dir: 1, abs: [-10, 25], peer: "all", say: v => `Profit per share up ${p1(v)}% from a year ago` },
  { k: "revUpYrs", p: "growth", w: 0.75, dir: 1, abs: [0, 3], peer: null, when: r => r.nYrs >= 4, say: v => (v >= 3 ? "Sales grew every single year" : null) },
  // momentum: plain 12-1 momentum, the rule that beat an equal-weight basket in 7 of 9 years in our 10-year backtest
  // (scaling by volatility or preferring calmer stocks did worse, so neither is used here)
  { k: "r121", p: "momentum", w: 3, dir: 1, abs: [-10, 40], peer: "all", say: v => `Strong momentum: up ${p1(v)}% over the past year (not counting the last month)` },
  { k: "vsSma200", p: "momentum", w: 0.5, dir: 1, abs: [-15, 15], peer: null, say: v => `Trading ${p1(v)}% above its 200-day average — a long-term uptrend` },
  // safety
  { k: "de", p: "safety", w: 1.5, dir: -1, abs: [2, 0], peer: null, when: notFin, say: v => (v < 0.05 ? "Practically debt-free" : `Low debt (debt/equity ${v.toFixed(2)})`) },
  { k: "volatility", p: "safety", w: 0.75, dir: -1, abs: [50, 18], peer: "all", say: v => `Calmer share price than most (volatility ${p1(v)}% a year)` },
  { k: "beta", p: "safety", w: 0.75, dir: -1, abs: [1.6, 0.7], peer: null, say: v => `Beta ${v.toFixed(2)} — swings less than the market` },
  { k: "altmanZ", p: "safety", w: 1, dir: 1, abs: [1.1, 4], peer: null, when: notFin, say: v => `Altman Z-score ${v.toFixed(1)} — very low risk of financial distress` },
  { k: "cr", p: "safety", w: 0.5, dir: 1, abs: [0.8, 2], peer: null, when: notFin, say: v => `Current ratio ${v.toFixed(2)} — can easily pay this year's bills` },
  { k: "dilution", p: "safety", w: 0.75, dir: -1, abs: [20, 0], peer: null, say: v => (v <= 1 ? "Hasn't been issuing new shares (no dilution)" : null) },
  // income
  { k: "dy", p: "income", w: 1, dir: 1, abs: [0, 4], peer: "all", say: v => `Dividend yield ${p1(v)}% — pays you cash every year` },
];
const TOTAL_W = METRICS.filter(m => m.p !== "income").reduce((a, m) => a + m.w, 0);

/* ---------- peer context ---------- */
// Built once per list of rows: sorted values per metric (all stocks, and per sector) for percentile ranks.
export function buildContext(rows) {
  const all = {}, bySec = {};
  for (const m of METRICS) {
    if (!m.peer) continue;
    all[m.k] = []; bySec[m.k] = {};
  }
  for (const r of rows) {
    for (const m of METRICS) {
      if (!m.peer || (m.when && !m.when(r))) continue;
      const v = val(r, m.k);
      if (!ok(v)) continue;
      all[m.k].push(v);
      (bySec[m.k][r.sector] ||= []).push(v);
    }
  }
  const sort = a => a.sort((x, y) => x - y);
  Object.values(all).forEach(sort);
  Object.values(bySec).forEach(s => Object.values(s).forEach(sort));
  const MIN_PEERS = 5;
  const pool = (k, r, peer) => (peer === "sector" && bySec[k]?.[r.sector]?.length >= MIN_PEERS ? bySec[k][r.sector] : all[k]);
  return {
    size: rows.length,
    // 0–100: share of peers this value beats (direction-aware)
    rank(k, v, r, peer, dir) {
      const a = pool(k, r, peer);
      if (!a || a.length < MIN_PEERS) return null;
      let lo = 0, hi = a.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < v) lo = mid + 1; else hi = mid; }
      let eq = lo; while (eq < a.length && a[eq] === v) eq++;
      const pct = (lo + (eq - lo) / 2) / a.length * 100;
      return dir > 0 ? pct : 100 - pct;
    },
    median(k, r) {
      const a = k === "pe" ? null : pool(k, r, "sector");
      if (k === "pe") { const e = pool("ey", r, "sector"); return e?.length ? 100 / e[Math.floor(e.length / 2)] : null; }
      return a?.length ? a[Math.floor(a.length / 2)] : null;
    },
    sectorSize: r => bySec.ey?.[r.sector]?.length || 0,
  };
}

/* ---------- red flags ---------- */
// Severity 2 = serious (−8 points), 1 = caution (−3), 0 = for your information (no penalty).
const dayFmt = ms => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const FLAGS = [
  r => ((ok(r.npm) && r.npm < 0) || (ok(r.pe) && r.pe < 0) ? [2, "Losing money right now"] : null),
  r => (r.niYrs >= 3 && r.niYrs - r.profYrs >= 2 ? [2, `Made a loss in ${r.niYrs - r.profYrs} of the last ${r.niYrs} years`] : r.niYrs >= 3 && r.profYrs === r.niYrs - 1 && !(r.npm < 0) ? [1, `Made a loss in one of the last ${r.niYrs} years`] : null),
  r => (notFin(r) && ok(r.de) && r.de > 1.5 ? [2, `Heavy debt (debt/equity ${r.de.toFixed(2)})`] : null),
  r => (notFin(r) && ok(r.cashConv) && r.cashConv < 0.5 && r.npm > 0 ? [2, `Only ${Math.round(r.cashConv * 100)}% of reported profit came in as cash over ${r.nYrs} years — check the quality of earnings`] : null),
  // a bad latest year is serious only if the multi-year trend is weak too
  r => (ok(r.epsGrowth) && r.epsGrowth < -20 ? [ok(r.epsCagr) && r.epsCagr > 8 ? 1 : 2, `Profit fell ${p1(-r.epsGrowth)}% from a year ago${ok(r.epsCagr) && r.epsCagr > 8 ? ` (though it grew ${p1(r.epsCagr)}% a year over ${r.nYrs - 1} years)` : ""}`] : null),
  r => (ok(r.revGrowth) && r.revGrowth < 0 ? [1, `Sales shrank ${p1(-r.revGrowth)}% in the latest year`] : null),
  r => (ok(r.dilution) && r.dilution > 10 ? [1, `Share count up ${p1(r.dilution)}% in ${r.nYrs - 1} years — new shares dilute existing owners`] : null),
  r => (notFin(r) && ok(r.deChange) && r.deChange > 0.5 ? [1, `Debt rising fast (debt/equity up ${r.deChange.toFixed(2)} in ${r.nYrs - 1} years)`] : null),
  r => (r.fMax >= 7 && r.fScore <= 3 ? [1, `Weak financial health: Piotroski F-score ${r.fScore}/${r.fMax} (${(r.fFails || []).slice(0, 3).join("; ")})`] : null),
  r => (notFin(r) && ok(r.altmanZ) && r.altmanZ < 1.1 ? [2, `Financial distress warning: Altman Z-score ${r.altmanZ.toFixed(2)} (below 1.1 signals high risk)`]
    : notFin(r) && ok(r.altmanZ) && r.altmanZ < 2.6 ? [0, `Altman Z-score ${r.altmanZ.toFixed(2)} is in the grey zone — keep an eye on debt and liquidity`] : null),
  r => (ok(r.pe) && r.pe > 70 ? [1, `Very expensive (P/E ${p1(r.pe)}) — needs years of strong growth to justify`] : null),
  r => (ok(r.vsSma200) && r.vsSma200 < -10 ? [1, `In a downtrend: ${p1(-r.vsSma200)}% below its 200-day average`] : null),
  r => (ok(r.offHigh) && r.offHigh < -35 ? [1, `Down ${p1(-r.offHigh)}% from its 52-week high — find out why`] : null),
  r => (ok(r.rsi) && r.rsi > 75 ? [1, `Ran up fast recently (RSI ${p1(r.rsi)}) — may cool off; don't chase`] : null),
  r => (ok(r.volatility) && r.volatility > 45 ? [1, `Very jumpy price (volatility ${p1(r.volatility)}%)`] : null),
  r => (ok(r.turnoverCr) && r.turnoverCr < 5 ? [1, `Thinly traded (about ₹${p1(r.turnoverCr)} Cr a day) — hard to buy or sell without moving the price`] : null),
  // warning signs in the last 90 days of news (api/redflags.js)
  r => (r.newsFlags?.[0] ? [r.newsFlags[0].sev, `In the news (${dayFmt(r.newsFlags[0].time || Date.now())}): ${r.newsFlags[0].cat.toLowerCase()} — "${r.newsFlags[0].title}"`] : null),
  r => (r.newsFlags?.[1] ? [r.newsFlags[1].sev, `In the news (${dayFmt(r.newsFlags[1].time || Date.now())}): ${r.newsFlags[1].cat.toLowerCase()} — "${r.newsFlags[1].title}"`] : null),
  r => (ok(r.volRatio) && r.volRatio > 3 ? [0, `Unusual volume today (${r.volRatio.toFixed(1)}× normal) — check the news`] : null),
  r => {
    const d = r.nextEarnings ? (r.nextEarnings * 1000 - Date.now()) / 864e5 : null;
    return d != null && d >= -1 && d <= 14 ? [0, `Quarterly results due around ${dayFmt(r.nextEarnings * 1000)} — the price can swing sharply`] : null;
  },
];
export const resultsSoon = r => r.nextEarnings && (r.nextEarnings * 1000 - Date.now()) / 864e5 >= -1 && (r.nextEarnings * 1000 - Date.now()) / 864e5 <= 10;

/* ---------- scoring ---------- */
export function scoreRow(r, style = STYLES[0], ctx = null) {
  const fin = isFinancial(r);
  const sum = {}, wts = {}, hits = [];
  let have = 0;
  for (const m of METRICS) {
    if (m.when && !m.when(r)) continue;
    const v = val(r, m.k);
    if (!ok(v)) continue;
    const [bad, good] = fin && m.absFin ? m.absFin : m.abs;
    const absS = ramp(v, bad, good);
    const peerS = ctx && m.peer ? ctx.rank(m.k, v, r, m.peer, m.dir) : null;
    const s = peerS == null ? absS : 0.6 * peerS + 0.4 * absS;
    sum[m.p] = (sum[m.p] || 0) + s * m.w; wts[m.p] = (wts[m.p] || 0) + m.w;
    if (m.p !== "income") have += m.w;
    if (s >= 70) { const t = m.say(v, r, ctx); if (t) hits.push({ p: m.p, s: s * m.w, text: t }); }
  }
  const pillars = {};
  for (const [p] of PILLARS) pillars[p] = wts[p] ? Math.round(sum[p] / wts[p]) : null;

  let tot = 0, wsum = 0, wall = 0;
  for (const [p, w] of Object.entries(style.w)) {
    wall += w;
    if (pillars[p] == null) continue;
    tot += pillars[p] * w; wsum += w;
  }
  const coverage = wall ? wsum / wall : 0;
  const flags = FLAGS.map(f => f(r)).filter(Boolean).map(([sev, text]) => ({ sev, text })).sort((a, b) => b.sev - a.sev);
  const penalty = flags.reduce((a, f) => a + (f.sev === 2 ? 8 : f.sev === 1 ? 3 : 0), 0);
  const score = coverage >= 0.5 ? Math.max(0, Math.round(tot / wsum - penalty)) : null;
  // Confidence: how much of the evidence we actually have (and whether multi-year history is included)
  const share = have / (TOTAL_W - (fin ? METRICS.filter(m => m.when === notFin || m.k === "evEbitda").reduce((a, m) => a + m.w, 0) : 0));
  const confidence = share >= 0.75 && r.nYrs >= 3 ? "High" : share >= 0.55 ? "Medium" : "Low";
  const reasons = hits.filter(h => style.w[h.p]).sort((a, b) => b.s * style.w[b.p] - a.s * style.w[a.p]).map(h => h.text);
  return { score, pillars, reasons, flags, coverage, confidence };
}

export function verdict(score) {
  if (score == null) return { label: "Not enough data", c: "muted" };
  if (score >= 70) return { label: "Strong candidate", c: "up" };
  if (score >= 55) return { label: "Worth a look", c: "v-ok" };
  if (score >= 40) return { label: "Mixed", c: "v-mid" };
  return { label: "Weak right now", c: "dn" };
}

// Small horizontal bar, coloured red → amber → green
export function scoreBar(v, w = 70) {
  if (v == null) return `<span class="sbar empty" style="width:${w}px" title="No data"></span>`;
  const hue = Math.round(v * 1.2); // 0 red → 120 green
  return `<span class="sbar" style="width:${w}px" title="${v}/100"><i style="width:${v}%;background:hsl(${hue} 70% 45%)"></i></span>`;
}
