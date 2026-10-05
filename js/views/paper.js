// PAPER — paper trading with live prices and realistic delivery charges, plus an analysis of how you trade.
// Self-contained: its data lives under its own storage key and it only reads the Buy plan's saved snapshots.

import { $, $$, esc, fmt, cls, short, normSym, toast, debounce, marketStatus, downloadCSV } from "../util.js";
import { getQuote, refreshQuotes, fetchChart } from "../api.js";
import { STOCKS, nameOf, sectorOf } from "../universes.js";
import { getPlans } from "../track.js";
import * as P from "../paper.js";
import { panel, href } from "./common.js";

const TAGS = ["Buy plan", "Stock idea", "Long-term", "Dip buy", "Momentum", "News", "Gut feeling", "Other"];
const TYPE_LABEL = { market: "Market", limit: "Limit", sl: "Stop-loss", target: "Target", trail: "Trailing SL" };
const MOODS = ["Calm, following my plan", "Confident", "Unsure", "FOMO (afraid to miss out)", "Revenge (win back a loss)", "Bored"];
const rup = n => fmt.inr(n);
const rup2 = n => fmt.inr(n, 2);
const when = ms => new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
const dayOf = ms => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });

export function mount(el, args) {
  const A = () => P.account();
  let tab = "positions";
  const T = { sym: args[0] ? normSym(args[0]) : "", side: "buy", type: "market", protect: false };

  el.innerHTML = `
    <div class="port-hero paper-hero" id="pHero"></div>
    <div class="grid">
      <div class="c4 paper-left">
        ${panel("Place a paper order", `<form id="ticket" class="ticket" autocomplete="off">
          <label>Stock<input id="tSym" list="tList" placeholder="Type a name or ticker, e.g. TCS" value="${esc(T.sym ? short(T.sym) : "")}"></label>
          <datalist id="tList">${[...STOCKS.values()].map(s => `<option value="${esc(short(s.sym))}">${esc(s.name)}</option>`).join("")}</datalist>
          <div id="tQuote" class="tq muted">Pick a stock to see its live price.</div>
          <div id="tChart" class="tchart hidden"></div>
          <div class="seg side" id="tSide"><button type="button" data-v="buy" class="on">Buy</button><button type="button" data-v="sell">Sell</button></div>
          <div class="seg" id="tType"></div>
          <div class="trow">
            <label>Quantity<input id="tQty" type="number" min="1" step="1" placeholder="Shares"></label>
            <label id="tPriceBox" class="hidden"><span id="tPriceLbl">Limit price ₹</span><input id="tPrice" type="number" min="0" step="0.05"></label>
          </div>
          <div class="quick" id="tQuick"></div>
          <div id="tProtectBox">
            <label class="chk"><input type="checkbox" id="tProtect"> Protect this trade with a stop-loss and target</label>
            <div class="hidden" id="tProtectRow">
              <div class="trow">
                <label>Stop-loss<select id="tSlMode"><option value="fixed">Fixed</option><option value="trail">Trailing (follows price up)</option></select></label>
                <label>Stop % below<input id="tSlPct" type="number" min="0.5" max="49" step="0.5" value="8"></label>
              </div>
              <div class="trow">
                <label>Target % above<input id="tTgPct" type="number" min="0" max="200" step="0.5" value="15" title="0 = no target"></label>
                <label>Size by risk<span class="quick" id="tRiskBtns"><button type="button" class="btn" data-risk="0.5">0.5%</button><button type="button" class="btn" data-risk="1">1%</button><button type="button" class="btn" data-risk="2">2%</button></span></label>
              </div>
              <p class="hint">"Size by risk" picks the number of shares so that hitting your stop-loss loses only that % of your account. Pros usually risk 0.5–2% per trade.</p>
            </div>
          </div>
          <div class="trow">
            <label>Why this trade?<select id="tTag">${TAGS.map(t => `<option>${t}</option>`).join("")}</select></label>
            <label>How do you feel?<select id="tMood"><option value="">Skip</option>${MOODS.map(m => `<option>${esc(m)}</option>`).join("")}</select></label>
          </div>
          <label>Note (optional)<input id="tNote" maxlength="120" placeholder="e.g. strong results, cheap vs peers"></label>
          <div id="tSummary" class="tsum"></div>
          <button class="btn amber big" id="tGo" type="submit">Place paper order</button>
        </form>`)}
        <div id="planBox"></div>
      </div>
      <div class="c8">
        <section class="panel">
          <header class="ph"><div class="tabs" id="tabs" role="tablist">
            ${[["positions", "Holdings"], ["orders", "Orders"], ["history", "Closed trades"], ["analysis", "Analysis"]].map(([k, l]) => `<button role="tab" data-t="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("")}
          </div><div class="pa" id="tabActs"></div></header>
          <div class="pb" id="tabBody"></div>
        </section>
      </div>
    </div>
    <p class="fine muted">Paper trading uses pretend money. Fills use live prices plus 0.05% slippage on market and stop orders, and include delivery charges (₹${P.CHARGES.brokerage} brokerage per order, 0.1% STT, exchange fees, GST, stamp duty, DP charge). Orders only fill during NSE hours. Stop-loss, target and limit orders are checked live while this page is open, and against daily highs and lows for the days you were away. Saved in this browser only.</p>`;

  /* ---------- hero ---------- */
  function renderHero() {
    const a = A(), v = P.value(getQuote), ret = v.total - a.start;
    const n0 = a.equity[0]?.nifty, nNow = getQuote("^NSEI")?.price;
    const nRet = n0 && nNow ? (nNow / n0 - 1) * 100 : null;
    const prev = [...a.equity].reverse().find(e => e.d !== new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
    const today = prev ? v.total - prev.v : null;
    const m = marketStatus();
    $("#pHero", el).innerHTML = `
      <div><div class="muted small">Paper account value</div><div class="ph-val">${rup(v.total)}</div>
        <div class="muted">Started with ${rup(a.start)} on ${dayOf(a.createdAt)} · <span class="${m.open ? "up" : "muted"}">NSE ${m.label.toLowerCase()}</span></div></div>
      <dl class="ph-stats">
        <div><dt>Total return</dt><dd class="${cls(ret)}">${fmt.inr(ret)} <small>${fmt.pct(ret / a.start * 100)}</small></dd></div>
        <div><dt>Nifty 50 same period</dt><dd class="${cls(nRet)}">${nRet == null ? "—" : fmt.pct(nRet)}</dd></div>
        <div><dt>Since yesterday</dt><dd class="${cls(today)}">${today == null ? "—" : fmt.inr(today)}</dd></div>
        <div><dt>Cash free</dt><dd>${rup(P.available())}</dd></div>
        <div><dt>Invested</dt><dd>${rup(v.held)}</dd></div>
      </dl>
      <button class="btn" id="resetBtn" type="button">Reset account</button>`;
    $("#resetBtn", el).onclick = () => {
      const v = prompt("Start a fresh paper account? All paper trades and history will be deleted.\n\nStarting money (₹):", String(a.start));
      if (v == null) return;
      const amt = Math.round(+String(v).replace(/[,₹\s]/g, ""));
      if (!(amt >= 10000)) return toast("Enter at least ₹10,000");
      P.reset(amt); toast("Fresh paper account with " + rup(amt)); renderAll();
    };
  }

  /* ---------- order ticket ---------- */
  function renderType() {
    const types = T.side === "buy" ? ["market", "limit"] : ["market", "limit", "sl", "trail"];
    if (!types.includes(T.type)) T.type = "market";
    $("#tType", el).innerHTML = types.map(t => `<button type="button" data-v="${t}" class="${t === T.type ? "on" : ""}" title="${t === "market" ? "Fill now at the live price" : t === "limit" ? (T.side === "buy" ? "Buy only at this price or lower" : "Sell only at this price or higher") : t === "trail" ? "Stop-loss that rises with the price and sells if it falls this % from its highest point" : "Sell automatically if the price falls to this level"}">${TYPE_LABEL[t]}</button>`).join("");
    $$("#tSide button", el).forEach(b => b.classList.toggle("on", b.dataset.v === T.side));
    $("#tPriceBox", el).classList.toggle("hidden", T.type === "market");
    $("#tPriceLbl", el).textContent = T.type === "sl" ? "Trigger price ₹" : T.type === "trail" ? "Trail distance %" : "Limit price ₹";
    $("#tProtectBox", el).classList.toggle("hidden", T.side !== "buy");
    $("#tGo", el).textContent = T.side === "buy" ? "Place paper buy" : "Place paper sell";
    $("#tGo", el).className = "btn big " + (T.side === "buy" ? "amber" : "sellbtn");
    renderQuick(); renderSummary();
  }
  function renderQuick() {
    const q = getQuote(T.sym);
    $("#tQuick", el).innerHTML = T.side === "buy"
      ? (q?.price ? [10000, 25000, 50000, 100000].map(a => `<button type="button" class="btn" data-amt="${a}">₹${a >= 100000 ? a / 100000 + "L" : a / 1000 + "k"}</button>`).join("") : "")
      : (P.posQty(T.sym) ? [25, 50, 100].map(p => `<button type="button" class="btn" data-pct="${p}">${p === 100 ? "All" : p + "%"}</button>`).join("") : "");
  }
  function renderQuote() {
    const box = $("#tQuote", el);
    if (!T.sym) { box.innerHTML = "Pick a stock to see its live price."; box.className = "tq muted"; return; }
    const q = getQuote(T.sym), held = P.posQty(T.sym);
    box.className = "tq";
    box.innerHTML = q?.price
      ? `<b>${esc(nameOf(T.sym, q))}</b> <span class="muted">${esc(short(T.sym))}</span><br><span class="tpx">${rup2(q.price)}</span> <span class="${cls(q.changePct)}">${fmt.pct(q.changePct)}</span>${held ? ` · <span class="muted">you hold ${held}</span>` : ""}
         <a class="sym small" href="${href("DES", T.sym)}">Research ›</a>`
      : `<span class="muted">Loading price for ${esc(short(T.sym))}… (check the ticker if this doesn't load)</span>`;
  }
  function ticketValues() {
    const q = getQuote(T.sym), ltp = q?.price;
    const qty = Math.floor(+$("#tQty", el).value || 0), lim = +$("#tPrice", el).value || 0;
    const px = T.type === "market" || T.type === "trail" ? ltp : lim;
    const slPct = +$("#tSlPct", el).value, tgPct = +$("#tTgPct", el).value;
    const protect = T.side === "buy" && $("#tProtect", el).checked;
    const trailing = protect && $("#tSlMode", el).value === "trail";
    const sellStop = T.side === "sell" ? (T.type === "sl" ? lim : T.type === "trail" && ltp && lim ? Math.round(ltp * (1 - lim / 100) * 20) / 20 : null) : null;
    const stop = protect && px && slPct > 0 ? Math.round(px * (1 - slPct / 100) * 20) / 20 : sellStop;
    return { ltp, qty, px, lim, protect, trailing, slPct, stop, sl: trailing ? null : stop, trailPct: trailing ? slPct : null, target: protect && px && tgPct > 0 ? Math.round(px * (1 + tgPct / 100) * 20) / 20 : null };
  }
  function renderSummary() {
    const t = ticketValues(), box = $("#tSummary", el);
    if (!T.sym || !t.qty || !t.px) { box.innerHTML = `<span class="muted">${!T.sym ? "Choose a stock" : !t.qty ? "Enter how many shares" : "Enter a price"} to see the cost.</span>`; return; }
    const val = t.qty * t.px, c = P.charges(T.side, val, A().brokerage);
    const m = marketStatus();
    const lines = [];
    if (T.side === "buy") lines.push(`<b>${t.qty} × ${rup2(t.px)}</b> = ${rup(val)} + ${rup2(c.total)} charges = <b>${rup(val + c.total)}</b>`, `Leaves about ${rup(P.available() - val - c.total)} free cash`);
    else {
      const avg = P.posAvg(T.sym), pnl = avg ? (t.px - avg) * t.qty - c.total : null;
      lines.push(`<b>${t.qty} × ${rup2(t.px)}</b> = ${rup(val)} − ${rup2(c.total)} charges = <b>${rup(val - c.total)}</b>`);
      if (pnl != null) lines.push(`Estimated profit on these shares: <b class="${cls(pnl)}">${fmt.inr(pnl)}</b> (bought at ${rup2(avg)})`);
    }
    if (t.protect && t.stop) {
      const risk = (t.px - t.stop) * t.qty, acct = P.value(getQuote).total;
      lines.push(`${t.trailing ? `Trailing stop ${t.slPct}% below the highest price (starts at <b class="dn">${rup2(t.stop)}</b>)` : `Auto-sell if it falls to <b class="dn">${rup2(t.stop)}</b>`}${t.target ? `${t.trailing ? " · target" : " or rises to"} <b class="up">${rup2(t.target)}</b>` : ""}`);
      lines.push(`Risking <b>${rup(risk)}</b> (${(risk / acct * 100).toFixed(1)}% of your account)${t.target ? ` to make ${rup((t.target - t.px) * t.qty)} · reward/risk <b>${((t.target - t.px) / (t.px - t.stop)).toFixed(1)}×</b>` : ""}`);
      if (risk / acct > 0.02) lines.push(`<span class="v-mid">That's more than 2% of your account on one trade. Try "Size by risk".</span>`);
      if (t.target && (t.target - t.px) / (t.px - t.stop) < 1.5) lines.push(`<span class="v-mid">Your target is less than 1.5× your risk. Good trades usually aim for 2× or more.</span>`);
    }
    if (!m.open) lines.push(`<span class="v-mid">Market is closed: ${T.type === "market" ? "this fills at the next session's opening price" : "this waits until the market opens"}.</span>`);
    else if (T.type !== "market") {
      const now = t.ltp;
      const instant = T.type !== "trail" && now && (T.type === "limit" ? (T.side === "buy" ? now <= t.lim : now >= t.lim) : now <= t.lim);
      if (instant) lines.push(`<span class="v-mid">The live price is already past this level, so it will fill straight away.</span>`);
    }
    if (val > A().start * 0.25 && T.side === "buy") lines.push(`<span class="v-mid">That's over 25% of your account in one stock. Real investors rarely go above 10–15%.</span>`);
    box.innerHTML = lines.map(l => `<div>${l}</div>`).join("");
    drawChart(t);
  }

  // 3-month price line with the planned entry, stop-loss and target drawn across it
  let chartData = { sym: null, c: null };
  function loadChart() {
    const sym = T.sym;
    if (!sym) { $("#tChart", el).classList.add("hidden"); return; }
    if (chartData.sym === sym) return drawChart(ticketValues());
    chartData = { sym, c: null };
    fetchChart(sym, "3mo", true).then(d => { if (chartData.sym === sym) { chartData.c = d.c; drawChart(ticketValues()); } }).catch(() => {});
  }
  function drawChart(t) {
    const box = $("#tChart", el), c = chartData.sym === T.sym ? chartData.c : null;
    if (!c || c.length < 5) { box.classList.add("hidden"); return; }
    const W = 320, H = 90;
    const lines = [[t.px, "entry", T.side === "buy" ? "Buy" : "Sell"], [t.stop, "stop", "Stop"], [t.target, "tgt", "Target"]].filter(([v]) => v > 0);
    const vals = [...c, ...lines.map(l => l[0])], lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const X = i => i / (c.length - 1) * (W - 44), Y = v => 6 + (1 - (v - lo) / span) * (H - 12);
    box.classList.remove("hidden");
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="3-month price with planned levels">
      <polyline points="${c.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}" class="tc-p"/>
      ${lines.map(([v, k, l]) => `<line x1="0" x2="${W - 44}" y1="${Y(v)}" y2="${Y(v)}" class="tc-${k}"/><text x="${W - 42}" y="${Y(v) + 3}" class="tc-l tc-${k}t">${l}</text>`).join("")}
    </svg><span class="muted small">Last 3 months</span>`;
  }
  const setSym = debounce(v => {
    const s = normSym(v);
    T.sym = s && s.length > 3 ? s : "";
    renderQuote(); renderQuick(); renderSummary(); loadChart();
    if (T.sym && !getQuote(T.sym)) refreshQuotes([T.sym]).then(() => { renderQuote(); renderQuick(); renderSummary(); }).catch(() => {});
  }, 350);
  $("#tSym", el).addEventListener("input", e => setSym(e.target.value));
  $("#tSide", el).addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (b) { T.side = b.dataset.v; renderType(); } });
  $("#tType", el).addEventListener("click", e => {
    const b = e.target.closest("[data-v]"); if (!b) return;
    T.type = b.dataset.v;
    const q = getQuote(T.sym);
    if (T.type === "trail") $("#tPrice", el).value = 8;
    else if (T.type !== "market" && q?.price && (!$("#tPrice", el).value || +$("#tPrice", el).value < 50)) $("#tPrice", el).value = (T.type === "sl" ? Math.round(q.price * 0.92 * 20) / 20 : q.price).toFixed(2);
    renderType();
  });
  $("#tQuick", el).addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const q = getQuote(T.sym);
    if (b.dataset.amt && q?.price) $("#tQty", el).value = Math.max(1, Math.floor(+b.dataset.amt / (T.type === "market" ? q.price : +$("#tPrice", el).value || q.price)));
    if (b.dataset.pct) $("#tQty", el).value = Math.max(1, Math.floor(P.posQty(T.sym) * +b.dataset.pct / 100));
    renderSummary();
  });
  $("#tProtect", el).onchange = e => { $("#tProtectRow", el).classList.toggle("hidden", !e.target.checked); renderSummary(); };
  $("#tSlMode", el).onchange = renderSummary;
  $("#tRiskBtns", el).addEventListener("click", e => {
    const b = e.target.closest("[data-risk]"); if (!b) return;
    const t = ticketValues();
    if (!t.px || !t.stop) return toast("Pick a stock and a stop-loss % first.");
    const riskRs = P.value(getQuote).total * +b.dataset.risk / 100;
    const qty = Math.floor(riskRs / (t.px - t.stop));
    const maxQty = Math.floor(P.available() / (t.px * 1.003));
    $("#tQty", el).value = Math.max(1, Math.min(qty, maxQty));
    if (qty > maxQty) toast("Capped by your free cash");
    renderSummary();
  });
  ["#tQty", "#tPrice", "#tSlPct", "#tTgPct"].forEach(id => $(id, el).addEventListener("input", renderSummary));

  $("#ticket", el).addEventListener("submit", e => {
    e.preventDefault();
    const t = ticketValues();
    if (!T.sym) return toast("Choose a stock first.");
    if (!t.ltp) return toast("Waiting for a live price for this stock.");
    try {
      const f = STOCKS.get(T.sym);
      P.placeOrder({ sym: T.sym, name: nameOf(T.sym, getQuote(T.sym)), sector: f?.sector || sectorOf(T.sym), side: T.side, type: T.type, qty: t.qty, price: t.lim, refPx: t.ltp, tag: $("#tTag", el).value, mood: $("#tMood", el).value, note: $("#tNote", el).value.trim(), sl: t.sl, target: t.target, trailPct: T.type === "trail" ? t.lim : t.trailPct });
      toast(`Paper ${T.side} order placed for ${t.qty} ${short(T.sym)}`);
      $("#tQty", el).value = ""; $("#tNote", el).value = "";
      runChecks(); tab = "orders";
      renderAll();
    } catch (err) { toast(err.message); }
  });

  /* ---------- copy the Buy plan ---------- */
  function renderPlan() {
    const plan = getPlans().slice(-1)[0], box = $("#planBox", el);
    if (!plan) { box.innerHTML = panel("Test the Buy plan", `<p class="pad prose">Open <a class="sym" href="${href("PICKS")}">Buy plan</a> once and its picks show up here, so you can paper-trade the whole plan in one click.</p>`); return; }
    const def = Math.min(500000, Math.floor(P.available() / 10000) * 10000);
    box.innerHTML = panel("Test the Buy plan", `<div class="pad prose">
      <p>Latest plan: <b>${esc(plan.riskName)}</b>, ${plan.picks.length} stocks, from ${dayOf(plan.at)}.</p>
      <div class="row-form"><label>Amount ₹<input id="planAmt" type="number" min="10000" step="10000" value="${def}"></label>
      <button class="btn amber" type="button" id="planGo">Paper-buy the whole plan</button></div>
      <p class="muted small">Buys each stock in the plan's proportions at today's live price, tagged "Buy plan", so the Analysis tab can show how the plan's trades do.</p></div>`);
    $("#planGo", el).onclick = async () => {
      const amt = +$("#planAmt", el).value;
      if (!(amt >= 10000)) return toast("Enter at least ₹10,000");
      await refreshQuotes(plan.picks.map(p => p.sym)).catch(() => {});
      let n = 0; const skipped = [];
      for (const p of plan.picks) {
        const px = getQuote(p.sym)?.price, qty = px ? Math.floor(amt * p.w / px) : 0;
        if (!qty) { skipped.push(short(p.sym)); continue; }
        try { P.placeOrder({ sym: p.sym, name: p.name, sector: STOCKS.get(p.sym)?.sector || sectorOf(p.sym), side: "buy", type: "market", qty, refPx: px, tag: "Buy plan", note: `From ${plan.riskName} plan of ${dayOf(plan.at)}` }); n++; }
        catch (err) { skipped.push(short(p.sym)); toast(err.message); break; }
      }
      toast(`Placed ${n} paper buy order${n === 1 ? "" : "s"}${skipped.length ? ` · skipped ${skipped.join(", ")}` : ""}`);
      runChecks(); tab = "orders"; renderAll();
    };
  }

  /* ---------- tabs ---------- */
  function renderTab() {
    $$("#tabs button", el).forEach(b => b.classList.toggle("on", b.dataset.t === tab));
    const body = $("#tabBody", el), acts = $("#tabActs", el);
    acts.innerHTML = "";
    if (tab === "positions") body.innerHTML = positionsHTML();
    else if (tab === "orders") body.innerHTML = ordersHTML();
    else if (tab === "history") { body.innerHTML = historyHTML(); if (A().fills.length) acts.innerHTML = `<button class="btn" id="dl" type="button">Download all trades</button>`; }
    else body.innerHTML = analysisHTML();
  }

  function positionsHTML() {
    const a = A(), v = P.value(getQuote);
    const rows = Object.entries(a.positions).map(([sym, p]) => {
      const qty = P.posQty(sym), avg = P.posAvg(sym), q = getQuote(sym), ltp = q?.price ?? avg;
      const pnl = (ltp - avg) * qty, days = Math.round((Date.now() - p.lots[0].at) / 864e5);
      const prot = a.orders.filter(o => o.status === "open" && o.sym === sym && o.side === "sell");
      return { sym, p, qty, avg, ltp, q, pnl, pct: (ltp / avg - 1) * 100, val: qty * ltp, days, prot };
    }).sort((x, y) => y.val - x.val);
    const atRisk = rows.reduce((acc, r) => {
      const stop = r.prot.filter(o => o.type === "sl" || o.type === "trail").map(o => o.price)[0];
      if (stop) acc.rs += Math.max(0, (r.ltp - stop) * r.qty); else acc.naked.push(short(r.sym));
      return acc;
    }, { rs: 0, naked: [] });
    const naked = atRisk.naked.length ? `<span class="v-mid">No stop-loss on ${esc(atRisk.naked.slice(0, 4).join(", "))}${atRisk.naked.length > 4 ? "…" : ""}, so losses there have no limit. Use Sell → Stop-loss or Trailing SL to add one.</span>` : "";
    const heat = !rows.length ? "" : atRisk.naked.length === rows.length ? `<div class="heat-line">${naked}</div>`
      : `<div class="heat-line">Open risk: if every stop-loss hit, you'd lose about <b>${rup(atRisk.rs)}</b> (${(atRisk.rs / v.total * 100).toFixed(1)}% of your account)${naked ? " · " + naked : ""}</div>`;
    if (!rows.length) return `<div class="empty-state"><b>No paper holdings yet</b><p>Place your first paper trade on the left, or test the Buy plan in one click.</p></div>`;
    return `${heat}<div class="tbl"><table class="t"><thead><tr><th class="l">Stock</th><th>Qty</th><th>Avg</th><th>Live</th><th>Value</th><th>P&L</th><th class="hide-sm">Weight</th><th class="l hide-sm">Protection</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr>
        <td class="l"><a class="sym" href="${href("DES", r.sym)}">${esc(short(r.sym))}</a><span class="sub">${esc(r.p.name || "")} · ${r.days}d · ${esc(r.p.lots[0].tag || "")}</span></td>
        <td>${r.qty}</td><td>${fmt.px(r.avg)}</td><td>${fmt.px(r.ltp)} <span class="sub ${cls(r.q?.changePct)}">${fmt.pct(r.q?.changePct)}</span></td>
        <td>${rup(r.val)}</td><td class="${cls(r.pnl)}">${fmt.inr(r.pnl)}<span class="sub ${cls(r.pct)}">${fmt.pct(r.pct)}</span></td>
        <td class="hide-sm">${(r.val / v.total * 100).toFixed(1)}%</td>
        <td class="l hide-sm small">${r.prot.length ? r.prot.map(o => `<span class="${o.type === "sl" || o.type === "trail" ? "dn" : "up"}">${{ sl: "SL", trail: "Trail SL", target: "TGT", limit: "Sell @", market: "Sell" }[o.type]} ${o.price ? fmt.px(o.price) : ""}</span>`).join(" · ") : `<span class="v-mid">none</span>`}</td>
        <td><button class="btn" data-sell="${esc(r.sym)}" type="button">Sell</button></td></tr>`).join("")}
    </tbody></table></div>`;
  }

  function ordersHTML() {
    const a = A(), open = a.orders.filter(o => o.status === "open").sort((x, y) => y.createdAt - x.createdAt);
    const done = a.orders.filter(o => o.status !== "open").sort((x, y) => (y.filledAt || y.closedAt) - (x.filledAt || x.closedAt)).slice(0, 25);
    const row = o => `<tr>
      <td class="l"><a class="sym" href="${href("DES", o.sym)}">${esc(short(o.sym))}</a><span class="sub">${esc(o.tag || "")}${o.parent ? " · auto" : ""}${o.bracket ? ` · then ${o.bracket.trailPct ? `trailing SL ${o.bracket.trailPct}%` : o.bracket.sl ? `SL ${fmt.px(o.bracket.sl)}` : ""}${o.bracket.target ? ` / TGT ${fmt.px(o.bracket.target)}` : ""}` : ""}</span></td>
      <td class="l ${o.side === "buy" ? "up" : "dn"}">${o.side === "buy" ? "Buy" : "Sell"}</td><td class="l">${TYPE_LABEL[o.type]}</td><td>${o.qty}</td>
      <td>${o.status === "filled" ? rup2(o.fillPx) : o.type === "trail" ? `${rup2(o.price)}<span class="sub">${o.trailPct}% below peak ${fmt.px(o.peak)}</span>` : o.price ? rup2(o.price) : "at market"}</td>
      <td class="l small">${o.status === "open" ? when(o.createdAt) : `<span class="${o.status === "filled" ? "up" : "muted"}">${o.status}</span> ${when(o.filledAt || o.closedAt)}${o.reason ? `<span class="sub">${esc(o.reason)}</span>` : ""}`}</td>
      <td class="nowrap">${o.status === "open" ? `${o.type !== "market" ? `<button class="ib" data-edit="${o.id}" type="button" title="Change price">Edit</button>` : ""}<button class="ib x" data-cancel="${o.id}" type="button" title="Cancel order">Cancel</button>` : ""}</td></tr>`;
    const head = `<thead><tr><th class="l">Stock</th><th class="l">Side</th><th class="l">Type</th><th>Qty</th><th>Price</th><th class="l">Status</th><th></th></tr></thead>`;
    return `<h3 class="subh">Open orders (${open.length})</h3>
      ${open.length ? `<div class="tbl"><table class="t">${head}<tbody>${open.map(row).join("")}</tbody></table></div>` : `<p class="pad muted">No open orders.${marketStatus().open ? "" : " Market orders placed now wait for the next session."}</p>`}
      <h3 class="subh">Recent</h3>
      ${done.length ? `<div class="tbl"><table class="t">${head}<tbody>${done.map(row).join("")}</tbody></table></div>` : `<p class="pad muted">Nothing yet.</p>`}`;
  }

  function historyHTML() {
    const C = A().closed.slice().sort((x, y) => y.sellAt - x.sellAt);
    if (!C.length) return `<div class="empty-state"><b>No closed trades yet</b><p>A trade counts here once you sell, or your stop-loss or target fills. That's when you find out if it worked.</p></div>`;
    return `<div class="tbl"><table class="t"><thead><tr><th class="l">Stock</th><th>Qty</th><th>Bought</th><th>Sold</th><th>Held</th><th class="hide-sm">Charges</th><th>P&L</th><th class="hide-sm" title="Profit divided by the risk you took (distance to your stop-loss). 2R = made twice what you risked.">R</th><th class="l hide-sm">Why / exit</th><th class="l">Lesson</th></tr></thead><tbody>
      ${C.map(t => `<tr><td class="l"><a class="sym" href="${href("DES", t.sym)}">${esc(short(t.sym))}</a><span class="sub">${dayOf(t.sellAt)}</span></td>
        <td>${t.qty}</td><td>${fmt.px(t.buyPx)}</td><td>${fmt.px(t.sellPx)}</td><td>${t.days}d</td><td class="hide-sm">${rup2(t.costs)}</td>
        <td class="${cls(t.pnl)}">${fmt.inr(t.pnl)}<span class="sub ${cls(t.pnl)}">${fmt.pct(t.pnl / (t.buyPx * t.qty) * 100)}</span></td>
        <td class="hide-sm ${cls(t.r)}">${t.r == null ? `<span class="muted" title="No stop-loss was set at entry">—</span>` : (t.r > 0 ? "+" : "") + t.r.toFixed(1) + "R"}</td>
        <td class="l hide-sm small">${esc(t.tag || "—")}${t.mood ? ` · ${esc(t.mood.split(" (")[0])}` : ""}<span class="sub">${{ sl: "stop-loss hit", trail: "trailing stop hit", target: "target hit", limit: "limit sell" }[t.exitBy] || "sold at market"}</span></td>
        <td class="l small lesson">${t.lesson ? `<span>${esc(t.lesson)}</span> ` : ""}<button class="ib" data-lesson="${t.id}" type="button" title="Write what you learned">${t.lesson ? "✎" : "+ Add"}</button></td></tr>`).join("")}
    </tbody></table></div>`;
  }

  function insights(s, a) {
    const out = [];
    if (s.n < 10) out.push(["muted", `Only ${s.n} closed trade${s.n === 1 ? "" : "s"} so far. Patterns become meaningful after about 10–20.`]);
    if (s.n >= 3 && s.avgWin != null && s.avgLoss != null) {
      if (s.avgLoss > s.avgWin * 1.2) out.push(["dn", `Your average loss (${rup(s.avgLoss)}) is bigger than your average win (${rup(s.avgWin)}). Cut losers sooner with a stop-loss, or let winners run longer.`]);
      else if (s.avgWin > s.avgLoss * 1.5) out.push(["up", `Your wins (${rup(s.avgWin)} average) are much bigger than your losses (${rup(s.avgLoss)}). That's the habit that makes money even with a modest win rate.`]);
    }
    if (s.holdWin != null && s.holdLoss != null && s.n >= 4 && s.holdLoss > s.holdWin * 1.5) out.push(["dn", `You hold losing trades about ${Math.round(s.holdLoss)} days but sell winners after ${Math.round(s.holdWin)}. That's the most common mistake: selling winners early and hoping losers come back.`]);
    if (s.grossProfit > 0 && s.totalCharges > s.grossProfit * 0.2) out.push(["v-mid", `Charges (${rup(s.totalCharges)}) ate ${Math.round(s.totalCharges / s.grossProfit * 100)}% of your gross profit. Fewer, bigger-conviction trades would keep more of it.`]);
    const tags = s.byTag.filter(t => t.n >= 2);
    if (tags.length >= 2) {
      const best = tags[0], worst = tags[tags.length - 1];
      if (best.pnl > 0) out.push(["up", `Your best kind of trade: "${best.name}" made ${fmt.inr(best.pnl)} over ${best.n} trades.`]);
      if (worst.pnl < 0) out.push(["dn", `Your worst kind of trade: "${worst.name}" lost ${rup(-worst.pnl)} over ${worst.n} trades. Consider dropping it.`]);
    }
    const v = P.value(getQuote);
    const big = Object.keys(a.positions).map(sym => ({ sym, val: P.posQty(sym) * (getQuote(sym)?.price ?? P.posAvg(sym)) })).sort((x, y) => y.val - x.val)[0];
    if (big && big.val / v.total > 0.25) out.push(["v-mid", `${short(big.sym)} is ${Math.round(big.val / v.total * 100)}% of your account. One bad result there would hurt a lot.`]);
    if (s.maxDD < -15) out.push(["v-mid", `Your account fell ${fmt.pct(s.maxDD, 1)} from its peak at one point. Ask yourself honestly whether you'd have held on with real money.`]);
    if (s.n >= 5 && s.rCount < s.n / 2) out.push(["v-mid", `Most of your trades had no stop-loss when you entered. Decide where you're wrong before buying; it's the habit that protects you most.`]);
    if (s.rCount >= 5 && s.avgR != null) out.push([s.avgR > 0.3 ? "up" : s.avgR < 0 ? "dn" : "muted", `Across trades with a stop-loss you average ${(s.avgR > 0 ? "+" : "") + s.avgR.toFixed(2)}R: for every ₹100 you risk, you ${s.avgR >= 0 ? "make" : "lose"} about ₹${Math.abs(Math.round(s.avgR * 100))}.`]);
    const bad = s.byMood.filter(m => /FOMO|Revenge|Bored/.test(m.name) && m.n >= 2 && m.pnl < 0);
    bad.forEach(m => out.push(["dn", `Trades made feeling "${m.name.split(" (")[0]}" lost ${rup(-m.pnl)} over ${m.n} trades. When you feel that way, don't trade.`]));
    const calm = s.byMood.find(m => /^Calm/.test(m.name));
    if (calm && calm.n >= 3 && calm.pnl > 0) out.push(["up", `Calm, planned trades made ${fmt.inr(calm.pnl)}. That's your edge, so stick to it.`]);
    const tags2 = s.byTag.find(t => t.name === "Gut feeling");
    if (tags2 && tags2.n >= 2 && tags2.pnl < 0) out.push(["dn", `"Gut feeling" trades are losing money. Write down a reason before every trade.`]);
    return out;
  }

  function equitySVG(eq) {
    if (eq.length < 2) return `<div class="empty-state small"><b>Your account-vs-Nifty chart starts here</b><p>It adds one point each day you open this page. Come back tomorrow to see the first line.</p></div>`;
    const W = 640, H = 200, pad = 28;
    const a = eq.map(e => e.v / eq[0].v * 100), n = eq.map(e => (e.nifty && eq[0].nifty ? e.nifty / eq[0].nifty * 100 : null));
    const all = [...a, ...n.filter(x => x != null)], lo = Math.min(...all, 100), hi = Math.max(...all, 100), span = hi - lo || 1;
    const X = i => pad + i / (eq.length - 1) * (W - pad * 2), Y = v => H - pad - (v - lo) / span * (H - pad * 2);
    const line = arr => arr.map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean).join(" ");
    return `<figure class="eq"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Paper account value vs Nifty 50, both starting at 100">
      <line x1="${pad}" x2="${W - pad}" y1="${Y(100)}" y2="${Y(100)}" class="eq-base"/>
      <polyline points="${line(n)}" class="eq-n"/><polyline points="${line(a)}" class="eq-a"/>
      <text x="${pad}" y="${H - 8}" class="eq-t">${esc(eq[0].d)}</text><text x="${W - pad}" y="${H - 8}" class="eq-t" text-anchor="end">${esc(eq[eq.length - 1].d)}</text>
      <text x="${W - pad}" y="${Y(a[a.length - 1]) - 6}" class="eq-t eq-at" text-anchor="end">You ${fmt.pct(a[a.length - 1] - 100, 1)}</text>
      ${n[n.length - 1] != null ? `<text x="${W - pad}" y="${Y(n[n.length - 1]) + 14}" class="eq-t eq-nt" text-anchor="end">Nifty ${fmt.pct(n[n.length - 1] - 100, 1)}</text>` : ""}
    </svg><figcaption><span class="lg a"></span>Your paper account <span class="lg n"></span>Nifty 50 (both start at 100)</figcaption></figure>`;
  }

  // Daily change heatmap for the last 12 weeks (weekdays only), from the days you opened this page
  function calendarHTML(eq) {
    if (eq.length < 2) return "";
    const chg = new Map();
    for (let i = 1; i < eq.length; i++) chg.set(eq[i].d, { rs: eq[i].v - eq[i - 1].v, pct: (eq[i].v / eq[i - 1].v - 1) * 100 });
    const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) + "T00:00:00Z");
    const monday = new Date(today); monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7) - 7 * 11);
    const weeks = [];
    for (let w = 0; w < 12; w++) {
      const col = [];
      for (let d = 0; d < 5; d++) {
        const dt = new Date(monday); dt.setUTCDate(monday.getUTCDate() + w * 7 + d);
        const key = dt.toISOString().slice(0, 10), c = chg.get(key), future = dt > today;
        const bg = !c ? "" : `background:${c.pct >= 0 ? `rgba(34,197,94,${Math.min(1, 0.25 + Math.abs(c.pct) / 2)})` : `rgba(239,68,68,${Math.min(1, 0.25 + Math.abs(c.pct) / 2)})`}`;
        col.push(`<i class="${future ? "fut" : c ? "" : "none"}" style="${bg}" title="${key}${c ? ` · ${fmt.inr(c.rs)} (${fmt.pct(c.pct)})` : future ? "" : " · not opened"}"></i>`);
      }
      weeks.push(`<span>${col.join("")}</span>`);
    }
    const up = [...chg.values()].filter(c => c.rs > 0).length, dn = [...chg.values()].filter(c => c.rs < 0).length;
    return `<h3 class="subh">Daily results · last 12 weeks</h3><div class="cal"><div class="cal-grid">${weeks.join("")}</div>
      <p class="muted small">${up} green day${up === 1 ? "" : "s"} · ${dn} red · each square is one weekday; grey means you didn't open the page, so that change shows up on your next visit. Hover a square for the amount.</p></div>`;
  }

  function analysisHTML() {
    const a = A(), s = P.stats();
    const tiles = [
      ["Win rate", s.winRate == null ? "—" : `${s.winRate.toFixed(0)}%`, s.n ? `${s.wins} won · ${s.losses} lost` : "no closed trades", ""],
      ["Avg win vs loss", s.avgWin == null && s.avgLoss == null ? "—" : `${s.avgWin != null ? rup(s.avgWin) : "—"} / ${s.avgLoss != null ? rup(s.avgLoss) : "—"}`, "bigger wins than losses is the goal", ""],
      ["Profit factor", s.profitFactor == null ? "—" : s.profitFactor === Infinity ? "∞" : s.profitFactor.toFixed(2), "₹ won per ₹1 lost · above 1.5 is good", s.profitFactor == null ? "" : s.profitFactor >= 1.5 ? "up" : s.profitFactor < 1 ? "dn" : ""],
      ["Avg per trade", s.expectancy == null ? "—" : fmt.inr(s.expectancy), "after all charges", cls(s.expectancy)],
      ["Worst fall from peak", s.maxDD ? fmt.pct(s.maxDD, 1) : "—", s.ddFrom ? `${s.ddFrom} → ${s.ddTo}` : "of your account value", s.maxDD < -10 ? "dn" : ""],
      ["Avg R per trade", s.avgR == null ? "—" : (s.avgR > 0 ? "+" : "") + s.avgR.toFixed(2) + "R", s.rCount ? `${s.rCount} trades had a stop-loss · above +0.3R is good` : "set stop-losses to measure this", cls(s.avgR)],
      ["Charges paid", rup(s.totalCharges), `${A().fills.length} executed orders`, ""],
    ];
    const ins = insights(s, a);
    const grp = (title, g) => g.length ? `<h3 class="subh">${title}</h3><div class="tbl"><table class="t"><thead><tr><th class="l">${title.split(" ").pop()}</th><th>Trades</th><th>Win rate</th><th>P&L</th></tr></thead><tbody>
      ${g.map(x => `<tr><td class="l">${esc(x.name)}</td><td>${x.n}</td><td>${(x.wins / x.n * 100).toFixed(0)}%</td><td class="${cls(x.pnl)}">${fmt.inr(x.pnl)}</td></tr>`).join("")}</tbody></table></div>` : "";
    return `<div class="analysis">
      ${equitySVG(a.equity)}
      <div class="tiles">${tiles.map(([l, v, sub, c]) => `<div><small>${l}</small><b class="${c}">${v}</b><span>${esc(sub)}</span></div>`).join("")}</div>
      ${calendarHTML(a.equity)}
      <h3 class="subh">What your trades say</h3>
      ${ins.length ? `<ul class="why ins">${ins.map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join("")}</ul>` : `<p class="pad muted">Nothing stands out yet. Keep trading and tagging why.</p>`}
      ${s.best && s.n > 1 ? `<p class="pad small">Best trade: <a class="sym" href="${href("DES", s.best.sym)}">${esc(short(s.best.sym))}</a> <span class="up">${fmt.inr(s.best.pnl)}</span> · Worst: <a class="sym" href="${href("DES", s.worst.sym)}">${esc(short(s.worst.sym))}</a> <span class="${cls(s.worst.pnl)}">${fmt.inr(s.worst.pnl)}</span></p>` : ""}
      ${grp("By reason for the trade", s.byTag)}
      ${grp("By sector", s.bySector)}
      ${grp("By mood when you entered", s.byMood.filter(m => m.name !== "Untagged"))}
    </div>`;
  }

  $("#tabs", el).addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (b) { tab = b.dataset.t; renderTab(); } });
  $("#tabBody", el).addEventListener("click", e => {
    const ed = e.target.closest("[data-edit]");
    if (ed) {
      const o = A().orders.find(x => x.id === ed.dataset.edit);
      if (!o) return;
      const v = prompt(o.type === "trail" ? "New trailing distance (%)" : `New ${o.type === "sl" ? "trigger" : "limit"} price for ${short(o.sym)} (₹)`, o.type === "trail" ? o.trailPct : o.price);
      if (v == null) return;
      try { P.modifyOrder(o.id, +v); toast("Order updated"); runChecks(); renderAll(); } catch (err) { toast(err.message); }
      return;
    }
    const ls = e.target.closest("[data-lesson]");
    if (ls) {
      const t = A().closed.find(x => x.id === ls.dataset.lesson);
      const v = prompt(`What did you learn from this ${short(t.sym)} trade?`, t.lesson || "");
      if (v != null) { P.setLesson(t.id, v.trim()); renderTab(); }
      return;
    }
    const c = e.target.closest("[data-cancel]");
    if (c) { P.cancelOrder(c.dataset.cancel); toast("Order cancelled"); renderAll(); return; }
    const s = e.target.closest("[data-sell]");
    if (s) {
      T.sym = s.dataset.sell; T.side = "sell"; T.type = "market";
      $("#tSym", el).value = short(T.sym);
      $("#tQty", el).value = Math.max(0, P.posQty(T.sym) - P.committed(T.sym)) || "";
      renderQuote(); renderType(); loadChart();
      $("#ticket", el).scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  $("#tabActs", el).addEventListener("click", e => {
    if (e.target.id !== "dl") return;
    downloadCSV("paper-trades.csv", [["Date", "Stock", "Side", "Type", "Qty", "Price", "Charges", "Reason", "Note"],
      ...A().fills.map(f => [new Date(f.at).toISOString(), short(f.sym), f.side, f.type, f.qty, f.px, f.costs.toFixed(2), f.tag || "", f.note || ""])]);
  });

  /* ---------- order checking ---------- */
  function announce(filled) {
    filled.forEach(o => toast(`Paper ${o.side === "buy" ? "bought" : "sold"} ${o.qty} ${short(o.sym)} at ${rup2(o.fillPx)}${o.type === "sl" ? " (stop-loss)" : o.type === "target" ? " (target)" : ""}`));
  }
  function runChecks() {
    const filled = P.checkLive(getQuote, marketStatus().open);
    announce(filled);
    return filled.length;
  }
  // Catch up on orders that may have triggered on days you weren't watching
  async function catchUp() {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const old = A().orders.filter(o => o.status === "open" && new Date(o.createdAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) < today);
    const bySym = new Map();
    old.forEach(o => { const l = bySym.get(o.sym) || []; l.push(o); bySym.set(o.sym, l); });
    let any = false;
    for (const [sym, list] of bySym) {
      const ageDays = (Date.now() - Math.min(...list.map(o => o.createdAt))) / 864e5;
      const range = ageDays < 25 ? "1mo" : ageDays < 85 ? "3mo" : ageDays < 170 ? "6mo" : "1y";
      try {
        const c = await fetchChart(sym, range);
        // oldest first, so a bracket's stop-loss and target resolve in the order they happened
        for (const o of list.sort((x, y) => x.createdAt - y.createdAt)) if (P.checkHistory(o, c)) { announce([o]); any = true; }
      } catch { /* try again next visit */ }
    }
    if (any) renderAll();
  }

  function renderAll() { renderHero(); renderTab(); renderPlan(); renderQuote(); renderType(); loadChart(); }

  const syms = () => ["^NSEI", ...new Set([...Object.keys(A().positions), ...A().orders.filter(o => o.status === "open").map(o => o.sym), ...(T.sym ? [T.sym] : [])])];
  renderAll();
  refreshQuotes(syms()).then(() => { runChecks(); P.recordEquity(getQuote); renderAll(); catchUp(); }).catch(() => catchUp());

  return {
    title: "Paper trading",
    syms,
    onQuotes: () => {
      const n = runChecks();
      P.recordEquity(getQuote);
      renderHero(); renderQuote(); renderSummary();
      if (n || tab === "positions" || tab === "analysis") renderTab();
      if (n) renderPlan();
    },
  };
}
