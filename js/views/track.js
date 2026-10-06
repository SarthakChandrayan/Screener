// TRACK — did the buy plans actually work? Compares every saved plan with simply holding the Nifty 50
// from the same day, so you can judge the picks with your own eyes instead of trusting the score.

import { $, esc, fmt, cls, short, toast } from "../util.js";
import { getQuote, refreshQuotes, fetchActions } from "../api.js";
import { getPlans, clearPlans } from "../track.js";
import { panel, href } from "./common.js";

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

export function mount(el) {
  el.innerHTML = `<div id="tHero"></div><div id="tList"></div>`;

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

  const syms = () => ["^NSEI", ...new Set(getPlans().flatMap(p => p.picks.map(s => s.sym)))];
  render();
  refreshQuotes(syms()).catch(() => {});
  fetchActions(syms().filter(s => s !== "^NSEI")).then(a => { ACTS = a; render(); }).catch(() => {});
  return { title: "Track record", syms, onQuotes: render };
}
