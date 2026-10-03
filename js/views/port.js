// PORT — holdings, live P&L, sector allocation and a rough capital-gains tax estimate.

import { $, esc, fmt, cls, toast, parseCSV, toNum, downloadCSV, uid } from "../util.js";
import { getQuote, refreshQuotes } from "../api.js";
import { sectorOf, STOCKS } from "../universes.js";
import { portfolio, savePortfolio, yahooSym } from "../state.js";
import { panel, href, sortTable, nextSort } from "./common.js";

const PALETTE = ["#ffa028", "#4da3ff", "#22c55e", "#c084fc", "#22d3ee", "#facc15", "#fb7185", "#a3e635", "#f97316", "#94a3b8", "#e879f9", "#2dd4bf"];
let sort = { k: "value", dir: -1 };

const heldDays = h => (h.date ? Math.floor((Date.now() - new Date(h.date).getTime()) / 864e5) : null);

// Copy the latest live quotes into holdings so P&L survives a reload (and works offline)
function applyQuotes() {
  let changed = false;
  portfolio.holdings.forEach(h => {
    const q = getQuote(yahooSym(h));
    if (q && q.price > 0 && (q.price !== h.ltp || q.prevClose !== h.prev)) { h.ltp = q.price; h.prev = q.prevClose; h.priceAt = q.time; changed = true; }
  });
  if (changed) savePortfolio();
}

export function mount(el, args) {
  el.innerHTML = `
    <div class="port-hero" id="pHero"></div>
    <div class="grid">
      ${panel("Add holding", `
        <form id="addForm" class="form-grid" autocomplete="off">
          <label>Symbol<input id="fSym" required placeholder="RELIANCE" style="text-transform:uppercase"></label>
          <label>Exchange<select id="fEx"><option>NSE</option><option>BSE</option></select></label>
          <label>Quantity<input id="fQty" type="number" min="0" step="any" required></label>
          <label>Avg buy price ₹<input id="fAvg" type="number" min="0" step="any" required></label>
          <label>Buy date<input id="fDate" type="date"></label>
          <label>Sector<input id="fSector" list="sectors" placeholder="auto"></label>
          <button class="btn amber" type="submit">Add</button>
        </form>
        <datalist id="sectors">${[...new Set([...STOCKS.values()].map(s => s.sector))].sort().map(s => `<option>${esc(s)}</option>`).join("")}<option>ETF / Index</option></datalist>
        <details class="more"><summary>Import broker CSV · bulk price update · export</summary>
          <div class="form-grid" style="margin-top:8px">
            <label>Holdings CSV (Zerodha Console, Groww, Upstox…) — needs symbol, quantity and average price columns
              <input type="file" id="importFile" accept=".csv,text/csv"></label>
          </div>
          <label style="margin-top:8px">Manual prices, one per line (for symbols with no live quote): <code>SYMBOL price</code>
            <textarea id="bulkText" placeholder="RELIANCE 2950.5&#10;TCS, 4120"></textarea></label>
          <div class="btns"><button class="btn" id="applyBulk" type="button">Update prices</button><button class="btn" id="exportBtn" type="button">Export CSV</button></div>
        </details>`, { cls: "c12" })}
      ${panel("Holdings", `<div class="tbl" id="holdTable"></div>`, { cls: "c12" })}
      ${panel("Allocation by sector", `<div class="alloc" id="allocBar"></div><div class="legend" id="allocLegend"></div>`, { cls: "c6" })}
      ${panel("Tax if you sold today", `<div id="taxBox"></div><p class="note">Rough estimate on listed equity: STCG 20% (held ≤ 12 months), LTCG 12.5% above the ₹1.25 lakh yearly exemption. Ignores cess, surcharge, grandfathering, gains already booked and carried-forward losses. Not tax advice.</p>`, { cls: "c6" })}
    </div>`;

  $("#fDate", el).value = new Date().toISOString().slice(0, 10);
  if (args[0] === "add" && args[1]) {
    const s = args[1];
    $("#fSym", el).value = s.replace(/\.(NS|BO)$/, "");
    $("#fEx", el).value = s.endsWith(".BO") ? "BSE" : "NSE";
    const q = getQuote(s);
    if (q) $("#fAvg", el).value = q.price;
    setTimeout(() => $("#fQty", el).focus(), 0);
  }

  function render() {
    applyQuotes();
    const H = portfolio.holdings.map(h => {
      const invested = h.qty * h.avg, value = h.qty * h.ltp, pnl = value - invested;
      const day = h.prev ? h.qty * (h.ltp - h.prev) : null;
      return { ...h, invested, value, pnl, ret: invested ? pnl / invested * 100 : 0, day, dayPct: h.prev ? (h.ltp / h.prev - 1) * 100 : null, days: heldDays(h) };
    });
    const inv = H.reduce((a, h) => a + h.invested, 0), val = H.reduce((a, h) => a + h.value, 0), pnl = val - inv;
    const day = H.reduce((a, h) => a + (h.day || 0), 0);
    H.forEach(h => { h.weight = val ? h.value / val * 100 : 0; });

    $("#pHero", el).innerHTML = `
      <div><div class="ph-val">₹${Math.round(val).toLocaleString("en-IN")}</div><div class="muted">${H.length ? `${fmt.words(val)} across ${H.length} holding${H.length === 1 ? "" : "s"}` : "Add your first holding below."}</div></div>
      <dl class="ph-stats">
        <div><dt>Invested</dt><dd>${fmt.inr(inv)}</dd></div>
        <div><dt>Unrealised P&L</dt><dd class="${cls(pnl)}">${fmt.inr(pnl)} <small>${inv ? fmt.pct(pnl / inv * 100) : ""}</small></dd></div>
        <div><dt>Today</dt><dd class="${cls(day)}">${fmt.inr(day)} <small>${val - day ? fmt.pct(day / (val - day) * 100) : ""}</small></dd></div>
      </dl>`;

    const cols = [
      { k: "sym", l: "Stock", n: false, f: h => `<a class="sym" href="${href("DES", yahooSym(h))}">${esc(h.sym)}</a><span class="sub">${esc(h.ex)} · ${esc(h.sector)}</span>` },
      { k: "qty", l: "Qty", f: h => fmt.n(h.qty, h.qty % 1 ? 3 : 0) },
      { k: "avg", l: "Avg", f: h => fmt.px(h.avg) },
      { k: "ltp", l: "LTP", f: h => fmt.px(h.ltp), c: h => (h.priceAt && Date.now() - h.priceAt > 864e5 * 4 ? "stale" : "") },
      { k: "dayPct", l: "Day %", f: h => fmt.pct(h.dayPct), c: h => cls(h.dayPct) },
      { k: "day", l: "Day P&L", f: h => (h.day == null ? "—" : fmt.inr(h.day)), c: h => cls(h.day) },
      { k: "invested", l: "Invested", f: h => fmt.inr(h.invested) },
      { k: "value", l: "Value", f: h => fmt.inr(h.value) },
      { k: "pnl", l: "P&L", f: h => fmt.inr(h.pnl), c: h => cls(h.pnl) },
      { k: "ret", l: "Return", f: h => fmt.pct(h.ret), c: h => cls(h.ret) },
      { k: "weight", l: "Weight", f: h => h.weight.toFixed(1) + "%" },
      { k: "days", l: "Held", f: h => (h.days == null ? `<input type="date" class="mini" data-date="${h.id}" aria-label="Buy date for ${esc(h.sym)}">` : `<span class="pill ${h.days > 365 ? "lt" : "st"}">${h.days > 365 ? "LT" : "ST"}</span> ${h.days}d`) },
      { k: "x", l: "", f: h => `<button class="ib x" data-del="${h.id}" aria-label="Remove ${esc(h.sym)}" title="Remove">×</button>`, v: () => null },
    ];
    $("#holdTable", el).innerHTML = sortTable(cols, H, sort, { empty: "No holdings yet — add one above, or import your broker's holdings CSV." });

    const bySec = {};
    H.forEach(h => { bySec[h.sector] = (bySec[h.sector] || 0) + h.value; });
    const secs = Object.entries(bySec).sort((a, b) => b[1] - a[1]);
    $("#allocBar", el).innerHTML = secs.map(([s, v], i) => `<div title="${esc(s)}" style="width:${val ? v / val * 100 : 0}%;background:${PALETTE[i % PALETTE.length]}"></div>`).join("");
    $("#allocLegend", el).innerHTML = secs.length ? secs.map(([s, v], i) => `<span><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(s)} <b>${(v / val * 100).toFixed(1)}%</b></span>`).join("") : `<span class="muted">Sectors show up once you add holdings.</span>`;

    let st = 0, lt = 0, unknown = 0;
    H.forEach(h => { if (h.days == null) unknown += h.pnl; else if (h.days > 365) lt += h.pnl; else st += h.pnl; });
    const stTax = Math.max(0, st) * 0.20, ltTax = Math.max(0, lt - 125000) * 0.125;
    $("#taxBox", el).innerHTML = `<dl class="kv">
      <dt>Short-term gain (≤ 12 months)</dt><dd class="${cls(st)}">${fmt.inr(st)}</dd>
      <dt>Long-term gain (> 12 months)</dt><dd class="${cls(lt)}">${fmt.inr(lt)}</dd>
      ${unknown ? `<dt>No buy date set</dt><dd class="${cls(unknown)}">${fmt.inr(unknown)}</dd>` : ""}
      <dt>STCG tax @ 20%</dt><dd>${fmt.inr(stTax)}</dd>
      <dt>LTCG tax @ 12.5% after ₹1.25L</dt><dd>${fmt.inr(ltTax)}</dd>
      <dt class="tot">Estimated tax</dt><dd class="tot">${fmt.inr(stTax + ltTax)}</dd></dl>`;
  }

  $("#addForm", el).addEventListener("submit", e => {
    e.preventDefault();
    const qty = +$("#fQty", el).value, avg = +$("#fAvg", el).value;
    if (!(qty > 0) || !(avg > 0)) { toast("Enter a quantity and buy price above zero."); return; }
    const sym = $("#fSym", el).value.trim().toUpperCase().replace(/\.(NS|BO)$/, ""), ex = $("#fEx", el).value;
    const h = { id: uid(), sym, ex, qty, avg, ltp: avg, date: $("#fDate", el).value || "", sector: $("#fSector", el).value.trim() || sectorOf(sym + ".NS"), priceAt: Date.now() };
    if (h.sector === "Other") h.sector = "Unassigned";
    portfolio.holdings.push(h);
    savePortfolio(); render(); toast("Added " + sym);
    refreshQuotes([yahooSym(h)]).catch(() => {});
    ["#fSym", "#fQty", "#fAvg", "#fSector"].forEach(id => { $(id, el).value = ""; });
    $("#fSym", el).focus();
  });

  $("#holdTable", el).addEventListener("click", e => {
    const th = e.target.closest("th[data-sort]");
    if (th) { sort = nextSort(sort, th.dataset.sort, th.dataset.sort !== "sym"); render(); return; }
    const del = e.target.closest("[data-del]");
    if (del) {
      const h = portfolio.holdings.find(x => x.id === del.dataset.del);
      portfolio.holdings = portfolio.holdings.filter(x => x.id !== del.dataset.del);
      savePortfolio(); render(); toast("Removed " + (h ? h.sym : ""));
    }
  });
  $("#holdTable", el).addEventListener("change", e => {
    const id = e.target.dataset.date;
    const h = id && portfolio.holdings.find(x => x.id === id);
    if (h && e.target.value) { h.date = e.target.value; savePortfolio(); render(); }
  });

  $("#applyBulk", el).onclick = () => {
    let hit = 0; const miss = [];
    $("#bulkText", el).value.split("\n").forEach(line => {
      const m = line.trim().match(/^([A-Za-z0-9&\-_.]+)[\s,;:\t]+₹?\s*([\d,]+(?:\.\d+)?)/);
      if (!m) return;
      const sym = m[1].toUpperCase(), price = toNum(m[2]);
      const lots = portfolio.holdings.filter(h => h.sym === sym);
      if (!lots.length) { miss.push(sym); return; }
      lots.forEach(h => { h.ltp = price; h.priceAt = Date.now(); });
      hit++;
    });
    savePortfolio(); render();
    toast(`Updated ${hit} stock${hit === 1 ? "" : "s"}` + (miss.length ? ` · not in portfolio: ${miss.slice(0, 4).join(", ")}` : ""));
  };

  $("#importFile", el).onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const rows = parseCSV(await file.text());
    if (rows.length < 2) { toast("That file has no data rows."); return; }
    const H = rows[0].map(h => h.toLowerCase());
    const find = re => H.findIndex(h => re.test(h));
    const cSym = find(/instrument|symbol|stock|scrip|tradingsymbol|name/), cQty = find(/^qty|quantity|shares|units/);
    const cAvg = find(/avg|average|buy price|cost price/), cLtp = find(/ltp|last|cmp|current price|close|market price/), cSec = find(/sector|industry/);
    if (cSym < 0 || cQty < 0 || cAvg < 0) { toast("Couldn't find symbol, quantity and average price columns."); return; }
    let n = 0;
    rows.slice(1).forEach(r => {
      const qty = toNum(r[cQty]), avg = toNum(r[cAvg]);
      if (!r[cSym] || !(qty > 0) || !(avg > 0)) return;
      const sym = r[cSym].toUpperCase().replace(/-EQ$/, "");
      const ltp = cLtp >= 0 && toNum(r[cLtp]) > 0 ? toNum(r[cLtp]) : avg;
      const sec = cSec >= 0 && r[cSec] ? r[cSec] : sectorOf(sym + ".NS");
      portfolio.holdings.push({ id: uid(), sym, ex: "NSE", qty, avg, ltp, date: "", sector: sec === "Other" ? "Unassigned" : sec, priceAt: Date.now() });
      n++;
    });
    savePortfolio(); render(); toast(`Imported ${n} holding${n === 1 ? "" : "s"}`);
    e.target.value = "";
    refreshQuotes(portfolio.holdings.map(yahooSym)).catch(() => {});
  };

  $("#exportBtn", el).onclick = () => downloadCSV("portfolio.csv", [
    ["Symbol", "Exchange", "Sector", "Qty", "Avg price", "Current price", "Buy date", "Invested", "Value", "P&L"],
    ...portfolio.holdings.map(h => [h.sym, h.ex, h.sector, h.qty, h.avg, h.ltp, h.date, (h.qty * h.avg).toFixed(2), (h.qty * h.ltp).toFixed(2), (h.qty * (h.ltp - h.avg)).toFixed(2)]),
  ]);

  render();
  return { syms: () => portfolio.holdings.map(yahooSym), onQuotes: render };
}

