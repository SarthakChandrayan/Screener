// COMP — compare relative performance of several tickers on one chart.

import { $, esc, fmt, cls, normSym, short, toast } from "../util.js";
import { fetchChart } from "../api.js";
import { loadLib, baseOptions, toTime, COLORS } from "../chart.js";
import { panel } from "./common.js";
import { go } from "../nav.js";

const RANGES = [["1mo", "1M"], ["3mo", "3M"], ["6mo", "6M"], ["ytd", "YTD"], ["1y", "1Y"], ["2y", "2Y"], ["5y", "5Y"]];
let range = "1y";

export function mount(el, args) {
  const syms = [...new Set((args.length ? args : ["^NSEI"]).map(normSym))].slice(0, 8);
  if (!syms.includes("^NSEI") && syms.length < 8) syms.push("^NSEI");
  let chart = null, seq = 0, dead = false;

  el.innerHTML = `<div class="grid">${panel("Compare · relative performance", `
    <div class="chart-tools">
      <form id="cForm" class="inline"><input id="cAdd" placeholder="Add ticker" aria-label="Add ticker to compare"><button class="btn">Add</button></form>
      <span class="seg">${RANGES.map(([k, l]) => `<button data-r="${k}" class="${k === range ? "on" : ""}">${l}</button>`).join("")}</span>
    </div>
    <div class="chart-box" id="cBox" style="height:440px"></div>
    <div id="cTbl" class="tbl"></div>`, { cls: "c12" })}</div>`;

  async function draw() {
    const my = ++seq;
    $("#cBox", el).innerHTML = `<div class="loading">Loading…</div>`;
    const [L, ...data] = await Promise.all([loadLib().catch(e => e), ...syms.map(s => fetchChart(s, range, true).catch(() => null))]);
    if (my !== seq || dead) return;
    if (L instanceof Error) { $("#cBox", el).innerHTML = `<div class="loading err">${esc(L.message)}</div>`; return; }
    chart?.remove();
    $("#cBox", el).innerHTML = "";
    chart = L.createChart($("#cBox", el), { ...baseOptions(false), localization: { locale: "en-IN", priceFormatter: v => v.toFixed(1) + "%" } });
    const rows = [];
    data.forEach((d, i) => {
      if (!d || d.c.length < 2) { rows.push({ s: syms[i], ret: null, color: "#555" }); return; }
      const color = COLORS.series[i % COLORS.series.length], base = d.c[0];
      const s = chart.addLineSeries({ color, lineWidth: syms[i] === "^NSEI" ? 1 : 2, lineStyle: syms[i] === "^NSEI" ? 2 : 0, priceLineVisible: false, title: short(syms[i]) });
      s.setData(d.t.map((t, k) => ({ time: toTime(t), value: (d.c[k] / base - 1) * 100 })));
      const ret = (d.c[d.c.length - 1] / base - 1) * 100;
      const lr = d.c.slice(1).map((x, k) => Math.log(x / d.c[k]));
      const m = lr.reduce((a, b) => a + b, 0) / lr.length;
      let peak = -Infinity, dd = 0;
      d.c.forEach(x => { peak = Math.max(peak, x); dd = Math.min(dd, (x / peak - 1) * 100); });
      rows.push({ s: syms[i], ret, color, vol: Math.sqrt(lr.reduce((a, b) => a + (b - m) ** 2, 0) / lr.length) * Math.sqrt(d.intraday ? 252 * 7 : 252) * 100, dd, last: d.c[d.c.length - 1] });
    });
    chart.timeScale().fitContent();
    $("#cTbl", el).innerHTML = `<table class="t"><thead><tr><th class="l">Ticker</th><th>Last</th><th>Return</th><th>Ann. volatility</th><th>Max drawdown</th><th></th></tr></thead><tbody>${rows.map(r => `
      <tr><td class="l"><i class="swatch" style="background:${r.color}"></i><a class="sym" href="#/DES/${encodeURIComponent(r.s)}">${esc(short(r.s))}</a></td>
      <td>${fmt.px(r.last)}</td><td class="${cls(r.ret)}">${fmt.pct(r.ret)}</td><td>${r.vol ? r.vol.toFixed(1) + "%" : "—"}</td><td class="dn">${r.dd != null ? fmt.pct(r.dd) : "—"}</td>
      <td><button class="ib x" data-rm="${esc(r.s)}" aria-label="Remove ${esc(short(r.s))}">×</button></td></tr>`).join("")}</tbody></table>`;
  }

  el.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (b?.dataset.r) { range = b.dataset.r; el.querySelectorAll("[data-r]").forEach(x => x.classList.toggle("on", x === b)); draw(); }
    if (b?.dataset.rm) go("COMP", ...syms.filter(s => s !== b.dataset.rm));
  });
  $("#cForm", el).addEventListener("submit", e => {
    e.preventDefault();
    const s = normSym($("#cAdd", el).value);
    if (!s) return;
    if (syms.length >= 8) return toast("Up to 8 tickers.");
    go("COMP", ...syms, s);
  });
  draw();
  return { title: "Compare", unmount: () => { dead = true; chart?.remove(); } };
}
