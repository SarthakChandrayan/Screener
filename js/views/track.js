// TRACK — did the buy plans actually work? Compares every saved plan with simply holding the Nifty 50
// from the same day, so you can judge the picks with your own eyes instead of trusting the score.

import { $, esc, fmt, cls, short, toast } from "../util.js";
import { getQuote, refreshQuotes, fetchActions } from "../api.js";
import { getPlans, clearPlans } from "../track.js";
import { panel, href } from "./common.js";
import { loadHistory, runBacktest, cachedBacktest, saveBacktest } from "../backtest.js";

const JUDGE_DAYS = 30; // younger plans are shown but not counted: a few weeks is just noise
const DAY = 864e5;
const NIFTY_YIELD = 1.2; // % a year: the Nifty 50's approximate dividend yield, so both sides include dividends
let ACTS = {};

function evaluate(p) {
  const now = getQuote("^NSEI")?.price;
  const stocks = p.picks.map(s => {
    const px = getQuote(s.sym)?.price, ev = ACTS[s.sym];
    // the saved price is pre-split; dividends since the plan count as return (Yahoo amounts are in today's share terms)
    const split = (ev?.splits || []).filter(x => x.t * 1000 > p.at).reduce((a, x) => a * x.ratio, 1);
    const div = (ev?.divs || []).filter(x => x.t * 1000 > p.at && x.t * 1000 <= Date.now()).reduce((a, x) => a + x.amt, 0);
    const then = s.price / split;
    return { ...s, now: px, then, split, div, ret: px ? ((px + div) / then - 1) * 100 : null };
  });
  const priced = stocks.filter(s => s.ret != null);
  const wsum = priced.reduce((a, s) => a + s.w, 0);
  const ret = priced.length && wsum ? priced.reduce((a, s) => a + s.w * s.ret, 0) / wsum : null;
  const days = Math.floor((Date.now() - p.at) / DAY);
  const nifty = now ? (now / p.nifty - 1) * 100 + NIFTY_YIELD * days / 365 : null;
  return { ...p, stocks, ret, nifty, edge: ret != null && nifty != null ? ret - nifty : null, days, judged: days >= JUDGE_DAYS, coverage: priced.length / stocks.length };
}

const yr = sec => new Date(sec * 1000).getFullYear();
const mon = sec => new Date(sec * 1000).toLocaleDateString("en-IN", { month: "short", year: "numeric" });

function curveSVG(c) {
  const W = 640, H = 210, pad = 30, keys = [["all", "bt-all"], ["nifty", "bt-n"], ["strat", "bt-s"]];
  // log scale so a doubling looks the same at any point in time
  const all = c.flatMap(p => keys.map(([k]) => Math.log(p[k])));
  const lo = Math.min(...all, 0), hi = Math.max(...all, 0), span = hi - lo || 1;
  const X = i => pad + i / (c.length - 1) * (W - pad * 2), Y = v => H - pad - (Math.log(v) - lo) / span * (H - pad * 2);
  const end = k => c[c.length - 1][k];
  return `<figure class="eq"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Growth of ₹1: method picks vs all stocks equally vs Nifty 50">
    <line x1="${pad}" x2="${W - pad}" y1="${Y(1)}" y2="${Y(1)}" class="eq-base"/>
    ${keys.map(([k, cl]) => `<polyline class="${cl}" points="${c.map((p, i) => `${X(i).toFixed(1)},${Y(p[k]).toFixed(1)}`).join(" ")}"/>`).join("")}
    <text x="${pad}" y="${H - 8}" class="eq-t">${mon(c[0].t)}</text><text x="${W - pad}" y="${H - 8}" class="eq-t" text-anchor="end">${mon(c[c.length - 1].t)}</text>
    ${(() => { // end labels, nudged apart so they never overlap
      const L = keys.map(([k, cl]) => ({ cl, v: end(k), y: Y(end(k)) - 5 })).sort((a, b) => a.y - b.y);
      for (let i = 1; i < L.length; i++) if (L[i].y - L[i - 1].y < 16) L[i].y = L[i - 1].y + 16;
      return L.map(l => `<text x="${W - pad - 2}" y="${l.y.toFixed(1)}" class="eq-t ${l.cl}t" text-anchor="end">₹${l.v.toFixed(1)}</text>`).join("");
    })()}
  </svg><figcaption><span class="lg bt-sl"></span>Method's top 10 <span class="lg bt-alll"></span>All ${"stocks"} equally <span class="lg bt-nl"></span>Nifty 50 · what ₹1 became (log scale)</figcaption></figure>`;
}

export function mount(el) {
  el.innerHTML = `<div id="tHero"></div><div id="tBack"></div><div id="tList"></div>`;
  renderBacktest();

  function render() {
    const open = new Set([...el.querySelectorAll("details.trk[open]")].map(d => d.dataset.at));
    const plans = getPlans().map(evaluate).sort((a, b) => b.at - a.at);
    if (!plans.length) {
      $("#tHero", el).innerHTML = `<section class="panel trk-empty"><div class="pad prose">
        <h3>No plans tracked yet</h3>
        <p>Every time you open <a class="sym" href="${href("PICKS")}">Buy plan</a>, today's picks and prices are saved here automatically (once a day for each risk level).</p>
        <p>Come back in a few weeks. This page will show how each plan did compared with just buying the Nifty 50 on the same day, so you can see whether the picks are worth following.</p>
        <a class="btn amber" href="${href("PICKS")}">Open today's buy plan</a></div></section>`;
      $("#tList", el).innerHTML = "";
      return;
    }
    const judged = plans.filter(p => p.judged && p.edge != null);
    const wins = judged.filter(p => p.edge > 0).length;
    const avg = k => judged.reduce((a, p) => a + p[k], 0) / (judged.length || 1);
    const oldest = Math.max(...plans.map(p => p.days));

    let verdict;
    if (!judged.length) verdict = { c: "mood-1", t: "Too early to judge", s: `Your oldest plan is ${oldest} day${oldest === 1 ? "" : "s"} old. Plans count once they're ${JUDGE_DAYS} days old, and you need about 3–6 months of them before the result means much.` };
    else if (judged.length < 4) verdict = { c: "mood-1", t: `Early signs: beat the Nifty ${wins} of ${judged.length} time${judged.length === 1 ? "" : "s"}`, s: "Still too few plans to trust either way. Keep going." };
    else if (wins / judged.length >= 0.6 && avg("edge") > 0) verdict = { c: "mood-2", t: `Working so far: beat the Nifty ${wins} of ${judged.length} times`, s: `On average the picks returned ${fmt.pct(avg("ret"), 1)} vs ${fmt.pct(avg("nifty"), 1)} for the Nifty. Past results don't guarantee future ones, but this is a good sign.` };
    else verdict = { c: "mood-0", t: `Not beating the index: ${wins} of ${judged.length} times`, s: `On average ${fmt.pct(avg("ret"), 1)} vs ${fmt.pct(avg("nifty"), 1)} for the Nifty. If this doesn't improve, a Nifty 50 index fund is the simpler, better choice.` };

    $("#tHero", el).innerHTML = `<section class="panel memo"><header class="ph"><h2>Track record · is this working?</h2>
        <div class="pa"><button class="btn" id="clear">Clear history</button></div></header>
      <div class="pb memo-body">
        <div class="mood ${verdict.c}"><b>${esc(verdict.t)}</b><span>${esc(verdict.s)}</span></div>
        <div class="alloc-sum">
          <div><b>${plans.length}</b><span>plans saved · ${judged.length} old enough to judge</span></div>
          <div><b>${judged.length ? `${wins} / ${judged.length}` : "—"}</b><span>times the picks beat the Nifty 50</span></div>
          <div><b class="${cls(avg("edge"))}">${judged.length ? fmt.pct(avg("edge"), 1) : "—"}</b><span>average lead over the Nifty</span></div>
        </div>
        <p class="sources">Each plan assumes you bought its stocks, in its proportions, at that day's price, and compares that with buying the Nifty 50 the same day. Returns include dividends and are adjusted for splits and bonus issues; the Nifty gets an estimated ${NIFTY_YIELD}% a year in dividends so the comparison is fair. Plans younger than ${JUDGE_DAYS} days are shown but not counted.</p>
      </div></section>`;

    $("#tList", el).innerHTML = panel("Every plan", `<div class="trk-list">${plans.map(p => {
      const res = p.edge == null ? `<span class="muted">waiting for prices</span>`
        : !p.judged ? `<span class="muted">${p.days ? `too early to judge (${p.days} day${p.days === 1 ? "" : "s"})` : "saved today"}</span>`
        : p.edge > 0 ? `<span class="tag up">Beat by ${fmt.pct(p.edge, 1).replace("+", "")}</span>` : `<span class="tag dn">Lagged by ${fmt.pct(-p.edge, 1).replace("+", "")}</span>`;
      return `<details class="trk" data-at="${p.at}" ${open.has(String(p.at)) ? "open" : ""}>
        <summary>
          <span class="trk-date"><b>${esc(new Date(p.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }))}</b><small>${esc(p.riskName)} · ${p.picks.length} stocks</small></span>
          <span class="trk-num"><small>Picks</small><b class="${cls(p.ret)}">${fmt.pct(p.ret, 1)}</b></span>
          <span class="trk-num"><small>Nifty 50</small><b class="${cls(p.nifty)}">${fmt.pct(p.nifty, 1)}</b></span>
          <span class="trk-res">${res}</span>
        </summary>
        <table class="t"><thead><tr><th class="l">Stock</th><th>Bought at</th><th>Now</th><th>Return</th><th>Weight</th></tr></thead><tbody>
          ${p.stocks.sort((a, b) => (b.ret ?? -1e9) - (a.ret ?? -1e9)).map(s => `<tr><td class="l"><a class="sym" href="${href("DES", s.sym)}">${esc(short(s.sym))}</a> <span class="muted">${esc(s.name || "")}</span></td>
            <td>${fmt.px(s.then)}${s.split !== 1 ? `<span class="sub">split-adjusted</span>` : ""}</td><td>${fmt.px(s.now)}${s.div ? `<span class="sub">+ ₹${s.div.toFixed(2)} dividends</span>` : ""}</td><td class="${cls(s.ret)}">${fmt.pct(s.ret, 1)}</td><td>${(s.w * 100).toFixed(0)}%</td></tr>`).join("")}
        </tbody></table>
      </details>`;
    }).join("")}</div>`, { cls: "" });

    $("#clear", el).onclick = () => {
      if (!confirm("Delete all saved plans? This can't be undone.")) return;
      clearPlans(); toast("Track record cleared"); render();
    };
  }

  // ---- 10-year backtest of the price-based part of the method ----
  function renderBacktest(state = "") {
    const box = $("#tBack", el), r = cachedBacktest();
    const intro = `<p class="prose">Replays the share-price part of our scoring (steady 1-year and 6-month trends, calmer stocks preferred) every month for about 10 years: buy the top 10 (max 2 per sector), hold a month, pay about 0.4% on every trade. It's compared with the Nifty 50 and with simply buying all ${227} stocks in our list equally.</p>`;
    if (!r) {
      box.innerHTML = panel("Backtest · would the method have worked?", `<div class="pad">${intro}
        <button class="btn amber" id="btRun" type="button" ${state ? "disabled" : ""}>Run the 10-year test</button> <span class="muted small" id="btState">${esc(state || "Downloads about 1 MB of price history the first time; takes a few seconds.")}</span></div>`, { cls: "btest" });
      $("#btRun", el).onclick = runIt;
      return;
    }
    const beatAll = r.yearsBeatAll / r.fullYears, edge = r.cagr.strat - r.cagr.all;
    const v = beatAll >= 0.6 && edge > 2 ? ["mood-2", `The method beat buying everything equally in ${r.yearsBeatAll} of ${r.fullYears} full years`, `It returned ${fmt.pct(r.cagr.strat, 1)} a year vs ${fmt.pct(r.cagr.all, 1)} for all stocks equally and ${fmt.pct(r.cagr.nifty, 1)} for the Nifty 50. A real edge in the past, which is encouraging, though not a promise for the future.`]
      : edge > 0 ? ["mood-1", `A small edge: ${r.yearsBeatAll} of ${r.fullYears} full years ahead of buying everything equally`, `${fmt.pct(r.cagr.strat, 1)} a year vs ${fmt.pct(r.cagr.all, 1)} (all stocks) and ${fmt.pct(r.cagr.nifty, 1)} (Nifty 50). Helpful, but not a strong enough edge to bet heavily on.`]
      : ["mood-0", `No edge: the method did worse than buying every stock equally`, `${fmt.pct(r.cagr.strat, 1)} a year vs ${fmt.pct(r.cagr.all, 1)} (all stocks) and ${fmt.pct(r.cagr.nifty, 1)} (Nifty 50). Lean on the company-quality checks and an index fund rather than on price trends.`];
    box.innerHTML = panel(`Backtest · ${mon(r.from)} to ${mon(r.to)} <span class="muted">run ${esc(new Date(r.at).toLocaleDateString("en-IN"))}</span>`, `<div class="memo-body">
      <div class="mood ${v[0]}"><b>${esc(v[1])}</b><span>${esc(v[2])}</span></div>
      <div class="tiles">
        <div><small>Method, per year</small><b class="${cls(r.cagr.strat)}">${fmt.pct(r.cagr.strat, 1)}</b><span>worst fall ${fmt.pct(r.maxDD.strat, 0)}</span></div>
        <div><small>All stocks equally</small><b>${fmt.pct(r.cagr.all, 1)}</b><span>worst fall ${fmt.pct(r.maxDD.all, 0)}</span></div>
        <div><small>Nifty 50</small><b>${fmt.pct(r.cagr.nifty, 1)}</b><span>worst fall ${fmt.pct(r.maxDD.nifty, 0)}</span></div>
        <div><small>Months ahead of Nifty</small><b>${r.monthsBeatNifty} / ${r.months}</b><span>${Math.round(r.monthsBeatNifty / r.months * 100)}% of months</span></div>
        <div><small>Worst calendar year</small><b class="${cls(r.worstYear)}">${fmt.pct(r.worstYear, 1)}</b><span>${r.worstYear < 0 ? "could you sit through that?" : "no losing year in this period"}</span></div>
      </div>
      ${curveSVG(r.curve)}
      <div class="tbl"><table class="t"><thead><tr><th class="l">Year</th><th>Method</th><th>All stocks</th><th>Nifty 50</th><th class="l">Result</th></tr></thead><tbody>
        ${r.yearly.map(y => `<tr><td class="l">${y.year}${y.months < 10 ? ` <span class="muted small">(${y.months} months)</span>` : ""}</td><td class="${cls(y.strat)}">${fmt.pct(y.strat, 1)}</td><td>${fmt.pct(y.all, 1)}</td><td>${fmt.pct(y.nifty, 1)}</td>
          <td class="l">${y.strat > y.all ? `<span class="up">ahead by ${(y.strat - y.all).toFixed(1)} pts</span>` : `<span class="dn">behind by ${(y.all - y.strat).toFixed(1)} pts</span>`}</td></tr>`).join("")}
      </tbody></table></div>
      ${r.variants?.length ? `<h3 class="subh">Other price rules, same stocks, dates and costs</h3>
      <div class="tbl"><table class="t"><thead><tr><th class="l">Rule</th><th>Per year</th><th>vs all stocks</th><th>Worst fall</th><th>Years ahead</th></tr></thead><tbody>
        ${[...r.variants].sort((a, b) => b.edge - a.edge).map(x => `<tr${x.key === "method" ? ` class="cur"` : ""}><td class="l wrap">${esc(x.name)}${x.key === "method" ? ` <span class="muted small">(used in the Buy plan)</span>` : ""}</td>
          <td class="${cls(x.cagr)}">${fmt.pct(x.cagr, 1)}</td><td class="${cls(x.edge)}">${x.edge > 0 ? "+" : ""}${x.edge.toFixed(1)} pts</td><td>${fmt.pct(x.maxDD, 0)}</td><td>${x.yearsBeatAll} of ${x.fullYears}</td></tr>`).join("")}
        <tr class="ref"><td class="l">Benchmark: all stocks equally</td><td>${fmt.pct(r.cagr.all, 1)}</td><td>—</td><td>${fmt.pct(r.maxDD.all, 0)}</td><td>—</td></tr>
      </tbody></table></div>
      <p class="muted small pad">A rule only shows real skill if it beats "all stocks equally" in most years, not just on average. Trying several rules and picking whichever did best can also just fit the past, so treat a winner here as a hint, not proof.${r.cagr.strat <= r.cagr.all ? " Because our rule didn't beat the benchmark, the Buy plan currently gives price trends much less weight." : ""}</p>` : ""}
      <details class="explain"><summary>What this test can and can't tell you ▸</summary><ul class="why pad">
        <li><b>Tested:</b> the share-price part of the score (trend strength divided by volatility, preferring calmer stocks) with monthly rebalancing and trading costs.</li>
        <li><b>Not tested:</b> the company-quality, value and growth checks, the red flags and the news scan. Free data doesn't show what a company's figures looked like on past dates, so testing them would quietly use future information.</li>
        <li><b>Survivorship bias:</b> the stock list is today's index members, so companies that collapsed or were dropped are missing. That flatters both the method and "all stocks equally", which is why the fair comparison is between those two, not with the Nifty.</li>
        <li><b>Prices only:</b> dividends are left out on every side, about 1–1.5% a year.</li>
        <li><b>Past results don't guarantee future ones.</b> Momentum has worked in Indian stocks over long periods, but it can lag badly for a year or two, especially after sharp market turns.</li>
      </ul></details>
      <p class="sources">Current top 10 by this rule: ${r.lastPicks.map(s => `<a class="sym" href="${href("DES", s)}">${esc(short(s))}</a>`).join(", ")} · <button class="ib" id="btRun" type="button">Re-run</button> <span class="muted small" id="btState">${esc(state)}</span></p>
    </div>`, { cls: "btest" });
    $("#btRun", el).onclick = runIt;
  }
  let running = false;
  async function runIt() {
    if (running) return;
    running = true;
    const say = t => { const n = $("#btState", el); if (n) n.textContent = t; };
    try {
      say("Downloading 10 years of prices…");
      const hist = await loadHistory(p => say(`Downloading 10 years of prices… ${Math.round(p * 100)}%`));
      say("Replaying ~120 months…");
      const r = runBacktest(hist);
      if (!r) throw new Error("Not enough price history came back to run the test.");
      saveBacktest(r); renderBacktest();
    } catch (e) { say(e.message); }
    running = false;
  }

  const syms = () => ["^NSEI", ...new Set(getPlans().flatMap(p => p.picks.map(s => s.sym)))];
  render();
  refreshQuotes(syms()).catch(() => {});
  fetchActions(syms().filter(s => s !== "^NSEI")).then(a => { ACTS = a; render(); }).catch(() => {});
  return { title: "Track record", syms, onQuotes: render };
}
