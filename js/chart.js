// Price chart panel built on TradingView's open-source Lightweight Charts (loaded from a CDN on first use).

import { $, $$, esc, fmt, store } from "./util.js";
import { fetchChart } from "./api.js";
import { sma, ema, bollinger } from "./tech.js";

const SRC = "https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js";
const IST = 19800; // shift UTC timestamps so the time axis reads in IST

let loading = null;
export function loadLib() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  return (loading ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.onload = () => res(window.LightweightCharts);
    s.onerror = () => { loading = null; rej(new Error("Chart library failed to load")); };
    document.head.appendChild(s);
  }));
}

export const COLORS = {
  up: "#22c55e", dn: "#ef4444", text: "#8b8b8b", grid: "#141414", line: "#2a2a2a",
  series: ["#ffa028", "#4da3ff", "#22c55e", "#ef4444", "#c084fc", "#facc15", "#22d3ee", "#fb7185"],
};

export function baseOptions(intraday) {
  return {
    autoSize: true,
    layout: { background: { type: "solid", color: "#000000" }, textColor: COLORS.text, fontFamily: "IBM Plex Mono, ui-monospace, monospace", fontSize: 11 },
    grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
    rightPriceScale: { borderColor: COLORS.line },
    timeScale: { borderColor: COLORS.line, timeVisible: intraday, secondsVisible: false },
    crosshair: { mode: 0 },
    localization: { locale: "en-IN" },
  };
}

export const toTime = t => t + IST;

const RANGES = [["1d", "1D"], ["5d", "5D"], ["1mo", "1M"], ["3mo", "3M"], ["6mo", "6M"], ["ytd", "YTD"], ["1y", "1Y"], ["5y", "5Y"], ["max", "MAX"]];
const OVERLAYS = [["SMA20", "#facc15"], ["SMA50", "#4da3ff"], ["SMA200", "#c084fc"], ["EMA20", "#22d3ee"], ["BB", "#6b7280"], ["VOL", null]];

// Renders range/type/overlay controls plus the chart into `host`. Returns { destroy }.
export function chartPanel(host, sym, { height = 380, range = "6mo" } = {}) {
  const st = { range, type: store.get("bahi-chart-type", "candle"), ov: new Set(store.get("bahi-chart-ov", ["SMA50", "VOL"])) };
  host.innerHTML = `
    <div class="chart-tools">
      <span class="seg" data-g="range">${RANGES.map(([k, l]) => `<button data-range="${k}">${l}</button>`).join("")}</span>
      <span class="seg" data-g="type"><button data-type="candle">Candle</button><button data-type="line">Line</button><button data-type="area">Area</button></span>
      <span class="seg" data-g="ov">${OVERLAYS.map(([k]) => `<button data-ov="${k}">${k}</button>`).join("")}</span>
    </div>
    <div class="chart-legend"></div>
    <div class="chart-box" style="height:${height}px"></div>`;
  const box = $(".chart-box", host), legend = $(".chart-legend", host);
  let chart = null, seq = 0, dead = false;

  function syncButtons() {
    $$("[data-range]", host).forEach(b => b.classList.toggle("on", b.dataset.range === st.range));
    $$("[data-type]", host).forEach(b => b.classList.toggle("on", b.dataset.type === st.type));
    $$("[data-ov]", host).forEach(b => b.classList.toggle("on", st.ov.has(b.dataset.ov)));
  }

  async function draw() {
    const my = ++seq;
    syncButtons();
    if (!chart) box.innerHTML = `<div class="loading">Loading chart…</div>`;
    let d, L;
    try { [d, L] = await Promise.all([fetchChart(sym, st.range), loadLib()]); }
    catch (e) { if (my === seq && !dead) { chart?.remove(); chart = null; box.innerHTML = `<div class="loading err">${esc(e.message)}</div>`; } return; }
    if (my !== seq || dead) return;
    chart?.remove(); chart = null;
    box.innerHTML = "";
    if (!d.t.length) { box.innerHTML = `<div class="loading">No price history for this range.</div>`; return; }

    chart = L.createChart(box, baseOptions(d.intraday));
    const T = d.t.map(toTime);
    const up = d.c[d.c.length - 1] >= (d.prevClose ?? d.c[0]);
    let main;
    if (st.type === "candle") {
      main = chart.addCandlestickSeries({ upColor: COLORS.up, downColor: COLORS.dn, wickUpColor: COLORS.up, wickDownColor: COLORS.dn, borderVisible: false });
      main.setData(T.map((t, i) => ({ time: t, open: d.o[i], high: d.h[i], low: d.l[i], close: d.c[i] })));
    } else if (st.type === "area") {
      const col = up ? COLORS.up : COLORS.dn;
      main = chart.addAreaSeries({ lineColor: col, topColor: col + "55", bottomColor: col + "05", lineWidth: 2 });
      main.setData(T.map((t, i) => ({ time: t, value: d.c[i] })));
    } else {
      main = chart.addLineSeries({ color: "#ffa028", lineWidth: 2 });
      main.setData(T.map((t, i) => ({ time: t, value: d.c[i] })));
    }
    if (d.range === "1d" && d.prevClose) main.createPriceLine({ price: d.prevClose, color: "#666", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Prev close" });

    const line = (vals, color, w = 1) => {
      const s = chart.addLineSeries({ color, lineWidth: w, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(T.map((t, i) => (vals[i] == null ? null : { time: t, value: vals[i] })).filter(Boolean));
    };
    for (const [k, color] of OVERLAYS) {
      if (!st.ov.has(k)) continue;
      if (k.startsWith("SMA")) line(sma(d.c, +k.slice(3)), color);
      else if (k === "EMA20") line(ema(d.c, 20), color);
      else if (k === "BB") { const b = bollinger(d.c); line(b.up, color); line(b.lo, color); }
    }
    if (st.ov.has("VOL") && d.v.some(v => v > 0)) {
      const vs = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vs.setData(T.map((t, i) => ({ time: t, value: d.v[i], color: (d.c[i] >= d.o[i] ? COLORS.up : COLORS.dn) + "66" })));
    }

    const show = i => {
      if (i == null || i < 0) i = d.t.length - 1;
      const ch = i > 0 ? (d.c[i] / d.c[i - 1] - 1) * 100 : null;
      const when = new Date(d.t[i] * 1000).toLocaleString("en-IN", d.intraday ? { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false } : { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
      legend.innerHTML = `<b>${esc(when)}</b> O <span>${fmt.px(d.o[i])}</span> H <span>${fmt.px(d.h[i])}</span> L <span>${fmt.px(d.l[i])}</span> C <span>${fmt.px(d.c[i])}</span> <span class="${ch > 0 ? "up" : ch < 0 ? "dn" : ""}">${fmt.pct(ch)}</span> V <span>${fmt.big(d.v[i])}</span>`;
    };
    show();
    const idx = new Map(T.map((t, i) => [t, i]));
    chart.subscribeCrosshairMove(p => show(p && p.time != null ? idx.get(p.time) : null));
    chart.timeScale().fitContent();
  }

  host.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.range) st.range = b.dataset.range;
    else if (b.dataset.type) { st.type = b.dataset.type; store.set("bahi-chart-type", st.type); }
    else if (b.dataset.ov) { st.ov.has(b.dataset.ov) ? st.ov.delete(b.dataset.ov) : st.ov.add(b.dataset.ov); store.set("bahi-chart-ov", [...st.ov]); }
    else return;
    draw();
  });
  draw();
  return { destroy() { dead = true; chart?.remove(); chart = null; } };
}
