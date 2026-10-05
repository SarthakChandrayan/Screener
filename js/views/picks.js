// PICKS — "manager's note": turns the scorecard into a ready plan. You enter an amount and a risk
// level; it reads the market's mood, picks a diversified buy list, sizes each position in rupees and
// shares, and gives an entry plan, thesis, key risk and a review level for every stock.

import { $, esc, fmt, cls, short, store, toast, downloadCSV } from "../util.js";
import { universe, addWatch } from "../state.js";
import { fetchChart, getQuote, feed } from "../api.js";
import { dataCheck, dataBadge } from "../dataqual.js";
import { savePlan } from "../track.js";
import { techSummary } from "../tech.js";
import { scanSymbols, stockRow, TECH } from "../scan.js";
import { scoreRow, verdict } from "../score.js";
import { panel, href } from "./common.js";

const PROFILES = {
  conservative: {
    name: "Safe", desc: "Steady big companies, smaller swings",
    w: { quality: 35, value: 20, growth: 10, momentum: 5, safety: 20, income: 10 },
    n: 10, maxW: 0.14, core: 0.3, minScore: 55, maxVol: 32, minMcap: 50000, maxFall: -30,
  },
  balanced: {
    name: "Balanced", desc: "Quality and growth at sensible prices",
    w: { quality: 30, value: 20, growth: 20, momentum: 15, safety: 15 },
    n: 10, maxW: 0.15, core: 0.2, minScore: 55, maxVol: 40, minMcap: 0, maxFall: -45,
  },
  aggressive: {
    name: "Aggressive", desc: "Faster growers, bigger ups and downs",
    w: { quality: 20, value: 10, growth: 35, momentum: 25, safety: 10 },
    n: 8, maxW: 0.18, core: 0, minScore: 52, maxVol: 99, minMcap: 0, maxFall: -100,
  },
};
const MAX_PER_SECTOR = 2;
const INDEX_ETF = "NIFTYBEES.NS";

const SECTOR_RISK = [
  [/^IT$/, "A slowdown in US/European tech spending, or a stronger rupee, would hit revenue."],
  [/bank/i, "If the economy slows, bad loans rise and profits fall quickly."],
  [/financ|insur/i, "Rising interest rates or bad loans squeeze its margins."],
  [/auto/i, "Car and bike demand moves in cycles; raw-material costs can eat margins."],
  [/fmcg/i, "Slow rural demand; these stocks are usually already priced richly."],
  [/metal|mining/i, "Profits swing with global commodity prices, especially China's demand."],
  [/energy|oil/i, "Oil prices and government pricing decisions drive profits."],
  [/health|pharma/i, "US FDA inspections and drug price controls can hit earnings suddenly."],
  [/power/i, "Returns are regulated; project delays and policy changes are the main risks."],
  [/capital goods|infra/i, "Order delays or slower government spending would slow growth."],
  [/cement|material/i, "Price wars and fuel costs can squeeze margins."],
  [/telecom/i, "Tariff wars and heavy spending on networks."],
  [/consumer|retail|services/i, "Depends on people spending freely; a slowdown hurts fast."],
  [/realty/i, "Sensitive to interest rates and property sales cycles."],
];
const sectorRisk = s => SECTOR_RISK.find(([re]) => re.test(s || ""))?.[1] || "Company-specific execution risk — follow the quarterly results.";

const ok = Number.isFinite;
const rup = n => fmt.inr(Math.round(n / 100) * 100);

function marketMood(t) {
  if (!t) return { level: 1, label: "Unknown", text: "Couldn't read the Nifty's trend, so the plan assumes a normal market.", parts: 3 };
  const above200 = t.vsSma200 > 0, above50 = t.vsSma50 > 0;
  if (above200 && above50) return { level: 2, label: "Positive", text: `The Nifty 50 is in an uptrend — ${fmt.pct(t.vsSma200, 1)} above its 200-day average, ${fmt.pct(t.r6m, 1)} over 6 months. Good time to build positions, but don't put it all in on one day.`, parts: 3 };
  if (above200) return { level: 1, label: "Neutral", text: `The Nifty 50 is still above its long-term average but has dipped below its 50-day average (${fmt.pct(t.vsSma50, 1)}). A short-term wobble — invest gradually.`, parts: 4 };
  return { level: 0, label: "Cautious", text: `The Nifty 50 is ${fmt.pct(t.vsSma200, 1)} below its 200-day average — the market is in a downtrend. Buy slowly in small parts and keep extra cash ready for lower prices.`, parts: 6 };
}

// Plain-English entry instruction for one stock
function entryPlan(r, t) {
  const s50 = t?.sma50;
  if ((ok(r.rsi) && r.rsi > 70) || (ok(r.vsSma50) && r.vsSma50 > 12)) {
    return { tag: "Wait for a dip", c: "v-mid", text: `Ran up recently. Buy a third now, the rest if it comes back near ${s50 ? fmt.inr(s50) : "its 50-day average"}.` };
  }
  if (ok(r.vsSma200) && r.vsSma200 < 0) return { tag: "Buy slowly", c: "v-mid", text: "Still below its long-term trend. Buy in 3 small parts over 6 weeks." };
  return { tag: "Buy now", c: "up", text: "Price is in a healthy range. Buy in 2–3 parts over the next few weeks." };
}

function reviewLevel(r, t) {
  if (!ok(r.price)) return null;
  const lv = Math.max(r.price * 0.8, t?.sma200 ? t.sma200 * 0.92 : 0);
  return lv < r.price ? lv : r.price * 0.85;
}

function buildPlan(rows, prof, amount, mood) {
  const scored = rows.map(r => ({ ...r, ...scoreRow(r, { w: prof.w }), dq: dataCheck(r) }));
  const candidates = scored
    .filter(r => r.score != null && r.coverage >= 0.6 && r.score >= prof.minScore && ok(r.price))
    .filter(r => !r.flags.some(f => f.sev === 2))
    .filter(r => !ok(r.volatility) || r.volatility <= prof.maxVol)
    .filter(r => !ok(r.offHigh) || r.offHigh >= prof.maxFall)
    .filter(r => !prof.minMcap || !ok(r.mcapCr) || r.mcapCr >= prof.minMcap)
    .sort((a, b) => b.score - a.score);
  // Never recommend a stock whose numbers are missing or contradict each other
  const eligible = candidates.filter(r => r.dq.usable);
  const skipped = candidates.filter(r => !r.dq.usable).slice(0, 8);
  const per = {}, picks = [];
  for (const r of eligible) {
    if (picks.length >= prof.n) break;
    if ((per[r.sector] || 0) >= MAX_PER_SECTOR) continue;
    per[r.sector] = (per[r.sector] || 0) + 1;
    picks.push(r);
  }
  // Size by conviction (score above 40), capped per stock, then re-spread the excess
  let w = picks.map(r => Math.max(1, r.score - 40));
  const tot = w.reduce((a, b) => a + b, 0) || 1;
  w = w.map(x => x / tot);
  for (let k = 0; k < 5; k++) {
    const over = w.reduce((a, x) => a + Math.max(0, x - prof.maxW), 0);
    if (over < 1e-6) break;
    const free = w.filter(x => x < prof.maxW).reduce((a, b) => a + b, 0) || 1;
    w = w.map(x => (x >= prof.maxW ? prof.maxW : x + over * x / free));
  }
  const cash = mood.level === 0 ? 0.2 : mood.level === 1 ? 0.1 : 0.05;
  const core = picks.length ? prof.core : 1 - cash;
  const stockMoney = amount * (1 - core - cash);
  picks.forEach((r, i) => {
    const t = TECH.get(r.sym);
    r.weight = w[i] * (1 - core - cash);
    r.amount = stockMoney * w[i];
    r.shares = Math.floor(r.amount / r.price);
    r.entry = entryPlan(r, t);
    r.review = reviewLevel(r, t);
    r.conviction = r.score >= 72 && !r.flags.length ? "High" : "Medium";
  });
  const avoid = scored.filter(r => r.flags.some(f => f.sev === 2)).sort((a, b) => (b.mcapCr || 0) - (a.mcapCr || 0)).slice(0, 6);
  return { picks, avoid, skipped, core, cash, coreAmt: amount * core, cashAmt: amount * cash, eligible: eligible.length };
}

export function mount(el) {
  let profK = store.get("bahi-picks-risk", "balanced");
  let amount = store.get("bahi-picks-amt", 100000);
  let niftyT = null, rows = null, plan = null;

  el.innerHTML = `<div class="grid">
    ${panel("Your plan", `<div class="row-form">
        <label>How much do you want to invest? (₹)<input id="amt" type="number" min="1000" step="1000" value="${amount}"></label>
        <div class="seg risk" id="risk" role="radiogroup" aria-label="Risk level">${Object.entries(PROFILES).map(([k, p]) => `<button role="radio" data-k="${k}" class="${k === profK ? "on" : ""}" aria-checked="${k === profK}" title="${esc(p.desc)}">${p.name}</button>`).join("")}</div>
        <button class="btn amber" id="refresh">Refresh picks</button>
        <span id="state" class="muted"></span>
      </div>`, { cls: "c12" })}
    <div class="c12" id="note"><div class="panel"><p class="pad muted">Reading the market and scoring the Nifty 100… the first time takes about a minute.</p></div></div>
  </div>`;

  function render() {
    if (!rows) return;
    const openSet = new Set([...el.querySelectorAll("details.explain")].map((d, i) => (d.open ? i : -1)));
    const prof = PROFILES[profK], mood = marketMood(niftyT);
    plan = buildPlan(rows, prof, amount, mood);
    const { picks } = plan;
    const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
    const sectors = new Set(picks.map(p => p.sector)).size;
    const gap = Math.round(42 / mood.parts);
    const saved = savePlan({ risk: profK, riskName: prof.name, nifty: getQuote("^NSEI")?.price ?? niftyT?.px, picks: picks.map(r => ({ sym: r.sym, name: r.name, price: r.price, w: r.weight })) });
    if (saved) toast("Today's plan saved to your Track record");
    const checked = picks.filter(r => r.dq.level === "good").length;

    $("#note", el).innerHTML = `
      <section class="panel memo">
        <header class="ph"><h2>Manager's note · ${esc(today)}</h2><div class="pa">
          <button class="btn" id="watchAll">☆ Watch all</button><button class="btn" id="csv">Download plan</button></div></header>
        <div class="pb memo-body">
          <div class="mood mood-${mood.level}"><b>Market mood: ${mood.label}</b><span>${esc(mood.text)}</span></div>
          <p class="prose">For <b>${rup(amount)}</b> at a <b>${prof.name.toLowerCase()}</b> risk level, here is what I'd do:</p>
          <div class="alloc-sum">
            ${picks.length ? `<div><b>${rup(amount * (1 - plan.core - plan.cash))}</b><span>across ${picks.length} stocks in ${sectors} sectors</span></div>` : ""}
            ${plan.core ? `<div><b>${rup(plan.coreAmt)}</b><span>in a Nifty 50 index ETF (<a class="sym" href="${href("DES", INDEX_ETF)}">NIFTYBEES</a>) as a safe core</span></div>` : ""}
            <div><b>${rup(plan.cashAmt)}</b><span>kept as cash to buy dips</span></div>
          </div>
          <p class="sources">Prices: <b>${feed.source === "upstox" ? "Upstox, live" : "Yahoo Finance, up to 15 min delayed"}</b> · Company figures: <b>Yahoo Finance</b> · Data checked on ${checked} of ${picks.length} picks${plan.skipped.length ? ` · ${plan.skipped.length} skipped for bad data` : ""} · <a class="sym" href="${href("TRACK")}">See how past plans did ›</a></p>
          <p class="prose"><b>How to buy:</b> don't invest it all today. Split it into <b>${mood.parts} equal parts</b> and buy one part about every ${gap} days. Follow the "When to buy" note for each stock. Check this page once a month: if a stock leaves the list or falls below its review level, re-read its story before adding more.</p>
        </div>
      </section>
      ${picks.length ? `<section class="panel buylist"><header class="ph"><h2>Your buy list</h2></header><div class="pb tbl"><table class="t">
        <thead><tr><th class="l hide-sm">#</th><th class="l">Stock</th><th>Invest</th><th>Shares</th><th class="l">When to buy</th></tr></thead>
        <tbody>${picks.map((r, i) => `<tr><td class="l hide-sm">${i + 1}</td>
          <td class="l"><a class="sym" href="${href("DES", r.sym)}">${esc(r.name)}</a><span class="sub">${esc(short(r.sym))} · ${esc(r.sector)}${r.conviction === "High" ? ` · <span class="up">high conviction</span>` : ""}</span>${dataBadge(r.dq)}</td>
          <td><b>${rup(r.amount)}</b></td><td>${r.shares ? fmt.n(r.shares, 0) : "<1"}</td>
          <td class="l"><span class="tag ${r.entry.c}">${r.entry.tag}</span></td></tr>`).join("")}
          ${plan.core ? `<tr class="core"><td class="l hide-sm">+</td><td class="l"><a class="sym" href="${href("DES", INDEX_ETF)}">Nifty 50 index ETF</a><span class="sub">NIFTYBEES · safe core</span></td><td><b>${rup(plan.coreAmt)}</b></td><td></td><td class="l"><span class="tag up">Same schedule</span></td></tr>` : ""}
        </tbody></table></div></section>
        <details class="explain"><summary>Why each stock was picked, its main risk and when to re-check ▸</summary><div class="picks">${picks.map(pickCard).join("")}</div></details>`
        : `<div class="panel"><p class="pad">Nothing passes my checks right now (${plan.eligible} stocks scored high enough before diversification). In a market like this, the index ETF and cash are the plan.</p></div>`}
      ${plan.skipped.length ? `<details class="explain"><summary>Skipped because their data looked wrong or incomplete (${plan.skipped.length}) ▸</summary>${panel("Left out for bad data", `<p class="pad muted">These scored well enough, but I won't recommend a stock when its numbers are missing or contradict each other. Check them yourself on the company's results.</p><table class="t"><tbody>${plan.skipped.map(r => `<tr><td class="l"><a class="sym" href="${href("DES", r.sym)}">${esc(short(r.sym))}</a> <span class="muted">${esc(r.name)}</span></td><td class="l v-mid">${esc(r.dq.detail)}</td></tr>`).join("")}</tbody></table>`, { cls: "avoid" })}</details>` : ""}
      ${plan.avoid.length ? `<details class="explain"><summary>Stocks to avoid for now (${plan.avoid.length}) ▸</summary>${panel("Avoid for now", `<table class="t"><tbody>${plan.avoid.map(r => `<tr><td class="l"><a class="sym" href="${href("DES", r.sym)}">${esc(short(r.sym))}</a> <span class="muted">${esc(r.name)}</span></td><td class="l dn">${esc(r.flags.filter(f => f.sev === 2).map(f => f.text).join(" · "))}</td></tr>`).join("")}</tbody></table>`, { cls: "avoid" })}</details>` : ""}
      <p class="fine muted">These picks come from fixed rules applied to public data, refreshed each time you open this page — not from a SEBI-registered adviser who knows your finances. Any stock can fall, and the data can be wrong or late, so read each company's story (click its name) before you buy. Only invest money you won't need for 3+ years.</p>`;
    el.querySelectorAll("details.explain").forEach((d, i) => { if (openSet.has(i)) d.open = true; });
  }

  function pickCard(r, i) {
    const v = verdict(r.score);
    const up = r.upside;
    return `<article class="pick">
      <header>
        <span class="rank">${i + 1}</span>
        <div class="who"><a class="sym" href="${href("DES", r.sym)}">${esc(short(r.sym))}</a><span class="sub">${esc(r.name)} · ${esc(r.sector)}</span></div>
        <span class="conv ${r.conviction === "High" ? "hi" : ""}">${r.conviction} conviction</span>
      </header>
      <div class="buy">
        <div><small>Invest</small><b>${rup(r.amount)}</b><span class="muted">${(r.weight * 100).toFixed(0)}% of total</span></div>
        <div><small>About</small><b>${r.shares ? fmt.n(r.shares, 0) : "<1"} share${r.shares === 1 ? "" : "s"}</b><span class="muted">at ${fmt.inr(r.price, 2)}</span></div>
        <div><small>Score</small><b class="${v.c}">${r.score}</b><span class="muted">${esc(v.label)}</span></div>
      </div>
      <p class="when"><span class="tag ${r.entry.c}">${r.entry.tag}</span> ${esc(r.entry.text)}</p>
      <p class="why-h up">Why I like it</p>
      <ul class="why">${r.reasons.slice(0, 3).map(t => `<li>${esc(t)}</li>`).join("")}</ul>
      <p class="why-h dn">Main risk</p>
      <p class="risk-t">${esc(r.flags[0]?.text || sectorRisk(r.sector))}</p>
      <dl class="kvs">
        ${r.review ? `<dt>Re-check if it falls below</dt><dd>${fmt.inr(r.review)}</dd>` : ""}
        ${ok(up) && up > 0 ? `<dt>Analysts' average target</dt><dd>${fmt.inr(r.price * (1 + up / 100))} <span class="${cls(up)}">${fmt.pct(up, 0)}</span></dd>` : ""}
        <dt>Hold for</dt><dd>3+ years</dd>
      </dl>
      <footer><a class="btn" href="${href("DES", r.sym)}">Read more ›</a><a class="btn" href="${href("PORT", "add", r.sym)}">I bought it</a><a class="btn" href="${href("ALRT", r.sym)}">Alert</a></footer>
    </article>`;
  }

  let seq = 0;
  async function load(fresh) {
    const my = ++seq, alive = () => my === seq;
    const say = t => { if (alive()) $("#state", el).textContent = t; };
    const syms = universe("N100");
    const nifty = fetchChart("^NSEI", "1y", true).then(d => { niftyT = techSummary(d); }).catch(() => {});
    const res = await scanSymbols(syms, { say, alive, fresh, partial: () => {} });
    await nifty;
    if (!alive() || !res) return;
    rows = syms.map(stockRow);
    render();
  }

  $("#risk", el).addEventListener("click", e => {
    const b = e.target.closest("[data-k]");
    if (!b) return;
    profK = b.dataset.k; store.set("bahi-picks-risk", profK);
    el.querySelectorAll("#risk button").forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); });
    render();
  });
  $("#amt", el).addEventListener("change", e => {
    const v = Math.round(+e.target.value);
    if (!(v >= 1000)) { e.target.value = amount; return toast("Enter at least ₹1,000"); }
    amount = v; store.set("bahi-picks-amt", amount); render();
  });
  $("#refresh", el).onclick = () => load(true);
  $("#note", el).addEventListener("click", e => {
    if (!plan) return;
    if (e.target.id === "watchAll") { const n = plan.picks.filter(r => addWatch(r.sym)).length; toast(`Added ${n} to watchlist`); }
    if (e.target.id === "csv") {
      downloadCSV("my-stock-plan.csv", [["Stock", "Name", "Sector", "Invest ₹", "Shares", "Price", "Score", "When to buy", "Re-check below", "Main risk"],
        ...plan.picks.map(r => [short(r.sym), r.name, r.sector, Math.round(r.amount), r.shares, r.price, r.score, r.entry.text, r.review ? Math.round(r.review) : "", r.flags[0]?.text || sectorRisk(r.sector)]),
        ...(plan.core ? [["NIFTYBEES", "Nifty 50 index ETF", "Index", Math.round(plan.coreAmt), "", "", "", "Same schedule as the stocks", "", "Moves with the whole market"]] : []),
        ["CASH", "Kept for dips", "", Math.round(plan.cashAmt), "", "", "", "", "", ""]]);
    }
  });

  load(false);
  return {
    title: "Manager's picks",
    syms: () => (rows ? plan?.picks.map(r => r.sym) || [] : []),
    onQuotes: () => { if (rows) { rows = universe("N100").map(stockRow); render(); } },
    unmount: () => { seq++; },
  };
}
