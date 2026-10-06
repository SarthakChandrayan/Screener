// Backtest: would the price-based part of our scoring have worked over the last ~10 years?
//
// Every month (using weekly closes), score each stock the way the live momentum and safety pillars do:
// 1-year and 6-month return divided by volatility, plus a tilt to calmer stocks. Buy the top 10 (at most
// 2 per sector, like the Buy plan) in equal amounts, hold for a month, pay ~0.4% on whatever is traded.
//
// Compared with (a) the Nifty 50 and (b) buying every stock in our list equally each month. (b) is the
// fairer test: our list is today's index members, so it leaves out companies that collapsed or were dropped
// (survivorship bias). That bias flatters both our picks and (b) alike, so "picks vs (b)" isolates the skill.
// Prices only (dividends excluded on every side). Company figures can't be backtested with free data,
// because we don't know what they looked like on past dates.

import { store } from "./util.js";
import { pool } from "./api.js";
import { NIFTY50, NEXT50, MIDCAP, STOCKS } from "./universes.js";

const MASTER = [...NIFTY50, ...NEXT50, ...MIDCAP].map(s => s.sym);
const CHUNK = 25;
const KEY = "screener-backtest-v2"; // v2: adds the comparison of price rules
const COST = 0.004;   // round-trip cost on traded value: charges + slippage
const TOP = 10, PER_SECTOR = 2;

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "HTTP " + r.status);
  return r.json();
}

export async function loadHistory(onProgress = () => {}) {
  const chunks = [];
  for (let i = 0; i < MASTER.length; i += CHUNK) chunks.push(MASTER.slice(i, i + CHUNK));
  const data = {};
  let done = 0;
  const nifty = get("/api/history?s=" + encodeURIComponent("^NSEI") + "&v=1");
  await pool(chunks, 4, async c => {
    try { Object.assign(data, (await get("/api/history?s=" + encodeURIComponent(c.join(",")) + "&v=1")).data); } catch { /* run with what we have */ }
    onProgress(++done / chunks.length);
  });
  const n = (await nifty).data?.["^NSEI"];
  if (!n) throw new Error("Couldn't load Nifty 50 history");
  return { data, nifty: n };
}

// weekly bars → map of "YYYY-Www" → close, so sources with slightly different weekly timestamps line up
const weekKey = sec => {
  const d = new Date(sec * 1000 + 19800e3); // IST
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const y = d.getUTCFullYear(), w = Math.floor((d - Date.UTC(y, 0, 4)) / 6048e5) + 1;
  return y + "-" + String(w).padStart(2, "0");
};

const stdev = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };

export function runBacktest({ data, nifty }) {
  // calendar: Nifty's weeks
  const weeks = nifty.t.map(weekKey), nClose = nifty.c;
  const idx = new Map(weeks.map((w, i) => [w, i]));
  const px = {}; // sym → array aligned to calendar (null when missing)
  for (const [sym, s] of Object.entries(data)) {
    const a = new Array(weeks.length).fill(null);
    s.t.forEach((t, i) => { const k = idx.get(weekKey(t)); if (k != null) a[k] = s.c[i]; });
    px[sym] = a;
  }
  const syms = Object.keys(px);
  // rebalance at the last week of each month
  const month = i => new Date(nifty.t[i] * 1000 + 19800e3).toISOString().slice(0, 7);
  const rebal = [];
  for (let i = 52; i < weeks.length - 1; i++) if (month(i) !== month(i + 1)) rebal.push(i);
  const last = (a, i) => { for (let j = i; j >= 0 && j > i - 3; j--) if (a[j] > 0) return a[j]; return null; };

  // Price rules tested side by side. Each gets the same stocks, dates and costs.
  const capped = list => { const per = {}, out = [];
    for (const c of list) { if (out.length >= TOP) break; const sec = STOCKS.get(c.s)?.sector || "Other"; if ((per[sec] || 0) >= PER_SECTOR) continue; per[sec] = (per[sec] || 0) + 1; out.push(c.s); }
    return out; };
  const RULES = {
    method: { name: "Our price score: 1-year and 6-month trend ÷ volatility, calmer stocks preferred", pick: c => capped([...c].sort((a, b) => b.score - a.score)) },
    mom: { name: "Plain momentum: biggest 12-month gain, ignoring the last month", pick: c => capped([...c].sort((a, b) => b.r121 - a.r121)) },
    lowvol: { name: "Low volatility: the 10 calmest stocks", pick: c => capped([...c].sort((a, b) => a.vol - b.vol)) },
    calmmom: { name: "Momentum among the calmer half of stocks", pick: c => { const med = [...c].sort((a, b) => a.vol - b.vol)[Math.floor(c.length / 2)].vol; return capped(c.filter(x => x.vol <= med).sort((a, b) => b.r121 - a.r121)); } },
    trend: { name: "Trend filter: every stock above its 40-week average, equally", pick: c => c.filter(x => x.above).map(x => x.s) },
  };
  const state = Object.fromEntries(Object.keys(RULES).map(k => [k, { held: [], periods: [] }]));

  for (let p = 0; p < rebal.length; p++) {
    const k = rebal[p], k2 = rebal[p + 1] ?? weeks.length - 1;
    if (k2 <= k) break;
    // measure every stock with a full year of history up to week k (nothing after k is used)
    const cands = [];
    for (const s of syms) {
      const a = px[s];
      const c0 = a[k], c52 = last(a, k - 52), c26 = last(a, k - 26), c4 = last(a, k - 4);
      if (!(c0 > 0 && c52 > 0 && c26 > 0 && c4 > 0)) continue;
      const rets = [];
      let sum = 0, n = 0;
      for (let j = k - 51; j <= k; j++) {
        if (a[j] > 0 && a[j - 1] > 0) rets.push(Math.log(a[j] / a[j - 1]));
        if (j > k - 40 && a[j] > 0) { sum += a[j]; n++; }
      }
      if (rets.length < 40) continue;
      const vol = stdev(rets) * Math.sqrt(52) * 100;
      if (!(vol > 0)) continue;
      cands.push({ s, m12: (c0 / c52 - 1) * 100 / vol, m6: (c0 / c26 - 1) * 100 / (vol / Math.SQRT2), vol, r121: c4 / c52 - 1, above: n > 30 && c0 > sum / n });
    }
    if (cands.length < 30) continue;
    const rank = (key, dir) => { const v = cands.map(c => c[key]).sort((a, b) => a - b); return c => (v.indexOf(c[key]) / (v.length - 1)) * (dir > 0 ? 1 : -1) + (dir > 0 ? 0 : 1); };
    const r12 = rank("m12", 1), r6 = rank("m6", 1), rv = rank("vol", -1);
    cands.forEach(c => { c.score = 0.45 * r12(c) + 0.35 * r6(c) + 0.2 * rv(c); });
    const ret = s => { const a = px[s], b = a[k], e = last(a, k2); return b > 0 && e > 0 ? e / b - 1 : 0; };
    const all = cands.reduce((x, c) => x + ret(c.s), 0) / cands.length, nRet = nClose[k2] / nClose[k] - 1;
    for (const [key, rule] of Object.entries(RULES)) {
      const st = state[key], pick = rule.pick(cands);
      // no stock qualifies (trend filter in a crash) → sit in cash for the month
      const gross = pick.length ? pick.reduce((x, s) => x + ret(s), 0) / pick.length : 0;
      const turnover = pick.length ? (st.held.length ? pick.filter(s => !st.held.includes(s)).length / pick.length : 1) : st.held.length ? 1 : 0;
      st.periods.push({ from: nifty.t[k], to: nifty.t[k2], strat: gross - turnover * COST, nifty: nRet, all, picks: pick });
      st.held = pick;
    }
  }
  const main = summarize(state.method.periods);
  if (!main) return null;
  main.variants = Object.entries(RULES).map(([key, rule]) => {
    const r = key === "method" ? main : summarize(state[key].periods);
    return r && { key, name: rule.name, cagr: r.cagr.strat, maxDD: r.maxDD.strat, yearsBeatAll: r.yearsBeatAll, fullYears: r.fullYears, worstYear: r.worstYear, edge: r.cagr.strat - r.cagr.all };
  }).filter(Boolean);
  return main;
}

function summarize(periods) {
  if (periods.length < 12) return null;
  const curve = k => { let v = 1; return periods.map(p => (v *= 1 + p[k])); };
  const eq = { strat: curve("strat"), nifty: curve("nifty"), all: curve("all") };
  const years = (periods[periods.length - 1].to - periods[0].from) / (365.25 * 86400);
  const cagr = k => (Math.pow(eq[k][eq[k].length - 1], 1 / years) - 1) * 100;
  const maxDD = k => { let peak = 1, dd = 0; for (const v of eq[k]) { peak = Math.max(peak, v); dd = Math.min(dd, v / peak - 1); } return dd * 100; };
  const byYear = {};
  periods.forEach(p => {
    const y = new Date(p.to * 1000).getFullYear();
    const r = (byYear[y] ||= { strat: 1, nifty: 1, all: 1, n: 0 });
    r.strat *= 1 + p.strat; r.nifty *= 1 + p.nifty; r.all *= 1 + p.all; r.n++;
  });
  const yearly = Object.entries(byYear).map(([y, r]) => ({ year: +y, strat: (r.strat - 1) * 100, nifty: (r.nifty - 1) * 100, all: (r.all - 1) * 100, months: r.n }));
  const full = yearly.filter(y => y.months >= 10);
  return {
    from: periods[0].from, to: periods[periods.length - 1].to, months: periods.length, years,
    cagr: { strat: cagr("strat"), nifty: cagr("nifty"), all: cagr("all") },
    maxDD: { strat: maxDD("strat"), nifty: maxDD("nifty"), all: maxDD("all") },
    monthsBeatNifty: periods.filter(p => p.strat > p.nifty).length,
    yearsBeatNifty: full.filter(y => y.strat > y.nifty).length, yearsBeatAll: full.filter(y => y.strat > y.all).length, fullYears: full.length,
    worstYear: Math.min(...full.map(y => y.strat)), yearly,
    curve: periods.map((p, i) => ({ t: p.to, strat: eq.strat[i], nifty: eq.nifty[i], all: eq.all[i] })),
    lastPicks: periods[periods.length - 1].picks, at: Date.now(),
  };
}

export const cachedBacktest = () => { const r = store.get(KEY, null); return r && Date.now() - r.at < 7 * 864e5 ? r : null; };
export const saveBacktest = r => store.set(KEY, r);
