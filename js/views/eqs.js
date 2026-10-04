// EQS — equity screener. Runs on live data (quotes + fundamentals + technicals) for an index,
// your watchlist/portfolio or a custom list — or on any CSV you upload (Screener.in, Tickertape…).

import { $, esc, fmt, cls, toast, parseCSV, toNum, downloadCSV, normSym, short, store, debounce } from "../util.js";
import { UNIVERSES, universe, getCustom, setCustom, addWatch } from "../state.js";
import { scanSymbols, stockRow } from "../scan.js";
import { scoreRow } from "../score.js";
import { tip } from "../glossary.js";
import { panel, sortTable, nextSort, href } from "./common.js";

const FIELDS = [
  { k: "sym", l: "Ticker", t: "s" }, { k: "name", l: "Name", t: "s" }, { k: "sector", l: "Sector", t: "s" },
  { k: "score", l: "Score", t: "int" }, { k: "price", l: "Price", t: "px" }, { k: "chgPct", l: "Chg %", t: "pct" }, { k: "mcapCr", l: "MCap ₹Cr", t: "int" },
  { k: "pe", l: "P/E" }, { k: "fpe", l: "Fwd P/E" }, { k: "pb", l: "P/B" }, { k: "ps", l: "P/S" }, { k: "peg", l: "PEG" }, { k: "evEbitda", l: "EV/EBITDA" },
  { k: "roe", l: "ROE %" }, { k: "roa", l: "ROA %" }, { k: "opm", l: "OPM %" }, { k: "npm", l: "NPM %" }, { k: "de", l: "D/E" }, { k: "cr", l: "Curr ratio" },
  { k: "revGrowth", l: "Rev gr %", t: "pct" }, { k: "epsGrowth", l: "EPS gr %", t: "pct" }, { k: "dy", l: "Div yld %" }, { k: "beta", l: "Beta" },
  { k: "upside", l: "Target upside %", t: "pct" }, { k: "offHigh", l: "From 52W hi %", t: "pct" },
  { k: "r1w", l: "1W %", t: "pct" }, { k: "r1m", l: "1M %", t: "pct" }, { k: "r3m", l: "3M %", t: "pct" }, { k: "r6m", l: "6M %", t: "pct" }, { k: "r1y", l: "1Y %", t: "pct" }, { k: "ytd", l: "YTD %", t: "pct" },
  { k: "rsi", l: "RSI 14", t: "n1" }, { k: "vsSma50", l: "vs 50DMA %", t: "pct" }, { k: "vsSma200", l: "vs 200DMA %", t: "pct" },
  { k: "volRatio", l: "Vol / 20D", t: "x" }, { k: "volatility", l: "Volatility %", t: "n1" },
];
const DEFAULT_VIS = ["sym", "name", "sector", "score", "price", "chgPct", "mcapCr", "pe", "pb", "roe", "de", "opm", "revGrowth", "dy", "offHigh", "r6m", "rsi"];

const PRESETS = [
  { name: "Top scorers", desc: "Balanced score 65+ (see IDEAS)", f: [["score", ">", 65]] },
  { name: "Quality compounders", desc: "ROE > 18%, D/E < 0.5, OPM > 15%", f: [["roe", ">", 18], ["de", "<", 0.5], ["opm", ">", 15]] },
  { name: "Value", desc: "P/E 0–15, P/B < 2, ROE > 12%", f: [["pe", ">", 0], ["pe", "<", 15], ["pb", "<", 2], ["roe", ">", 12]] },
  { name: "Dividend yield", desc: "Yield > 2.5%, D/E < 1", f: [["dy", ">", 2.5], ["de", "<", 1]] },
  { name: "Growth at fair price", desc: "Rev gr > 12%, EPS gr > 15%, P/E < 35", f: [["revGrowth", ">", 12], ["epsGrowth", ">", 15], ["pe", ">", 0], ["pe", "<", 35]] },
  { name: "Momentum", desc: "6M > 15%, above 200 DMA, RSI 50–70", f: [["r6m", ">", 15], ["vsSma200", ">", 0], ["rsi", ">", 50], ["rsi", "<", 70]] },
  { name: "Oversold", desc: "RSI below 35", f: [["rsi", "<", 35]] },
  { name: "Near 52W high", desc: "Within 5% of the 52-week high", f: [["offHigh", ">", -5]] },
  { name: "Beaten down quality", desc: "> 25% off high, ROE > 12%", f: [["offHigh", "<", -25], ["roe", ">", 12]] },
  { name: "Volume spike", desc: "Volume > 2× 20-day average", f: [["volRatio", ">", 2]] },
  { name: "Analyst upside", desc: "Mean target > 20% above price", f: [["upside", ">", 20]] },
  { name: "Large caps", desc: "Market cap > ₹1 lakh Cr", f: [["mcapCr", ">", 100000]] },
  { name: "Debt-free", desc: "D/E below 0.05", f: [["de", "<", 0.05]] },
];

// For uploaded CSVs: recognise common column names so presets still apply.
const CSV_PATTERNS = {
  sym: /nse code|^symbol|ticker|nse symbol/, name: /name|company/, sector: /sector|industry/,
  pe: /(^|[^a-z])p\/?e($|[^a-z])|price to earning|pe ratio/, roe: /roe|return on equity/, roce: /roce|return on capital/,
  de: /debt.?(to.?)?\/?.?eq|d\/e/, mcapCr: /mar(ket)?.?cap/, dy: /div(idend)?.?y(ie)?ld|div yld/,
  revGrowth: /sales.*(growth|var)|revenue.*growth/, epsGrowth: /profit.*(growth|var)|eps.*growth/, pb: /p\/?b|price to book/,
  opm: /opm|operating.*margin/, rsi: /rsi/, price: /^cmp|price|ltp|close/,
};
const TEXT_KEYS = new Set(["sym", "name", "sector"]);
const OPS = [">", "≥", "<", "≤", "="];

const CSV_KEY = "bahi-screener-v1"; // same key as the original app's CSV screener
let S = {
  uni: store.get("bahi-eqs-uni", "N50"),
  cols: FIELDS, rows: [], filters: [], sort: { k: "mcapCr", dir: -1 }, sector: "", q: "",
  vis: new Set(store.get("bahi-eqs-cols", DEFAULT_VIS)), csvLabel: "", note: "",
};

const live = () => S.uni !== "CSV";

// Score is the Balanced scorecard from IDEAS, so you can filter or sort on it here too
const liveRows = () => universe(S.uni).map(stockRow).map(r => ({ ...r, score: scoreRow(r).score }));

function loadCSV(text, label) {
  const rows = parseCSV(text);
  if (rows.length < 2) { toast("That data has a header but no rows."); return false; }
  const headers = rows[0].map((h, i) => h || `Column ${i + 1}`);
  const body = rows.slice(1);
  const numeric = headers.map((_, i) => {
    const vals = body.map(r => r[i]).filter(v => v != null && v !== "");
    return vals.length > 0 && vals.filter(v => Number.isFinite(toNum(v))).length / vals.length > 0.8;
  });
  const used = new Set();
  const keys = headers.map((h, i) => {
    const hl = h.toLowerCase();
    for (const [k, re] of Object.entries(CSV_PATTERNS)) {
      if (!used.has(k) && re.test(hl) && numeric[i] !== TEXT_KEYS.has(k)) { used.add(k); return k; }
    }
    return "c" + i;
  });
  if (!used.has("name")) { const i = numeric.findIndex(n => !n); if (i >= 0 && keys[i].startsWith("c")) keys[i] = "name"; }
  S.cols = headers.map((h, i) => ({ k: keys[i], l: h, t: numeric[i] ? "n" : "s" }));
  S.rows = body.map(r => {
    const o = {};
    keys.forEach((k, i) => { o[k] = numeric[i] ? toNum(r[i]) : (r[i] ?? ""); });
    if (o.sym) o.sym = normSym(o.sym);
    return o;
  });
  S.csvLabel = `${label}: ${S.rows.length} rows, ${numeric.filter(Boolean).length} numeric columns`;
  S.filters = []; S.sort = null;
  store.set(CSV_KEY, { text: text.length < 2e6 ? text : null, label });
  return true;
}

function passes(r) {
  if (S.sector && r.sector !== S.sector) return false;
  if (S.q) { const q = S.q.toLowerCase(); if (!String(r.sym || "").toLowerCase().includes(q) && !String(r.name || "").toLowerCase().includes(q)) return false; }
  return S.filters.every(f => {
    const v = r[f.k];
    if (!Number.isFinite(v)) return false;
    switch (f.op) { case ">": return v > f.v; case "≥": return v >= f.v; case "<": return v < f.v; case "≤": return v <= f.v; default: return v === f.v; }
  });
}

function cell(c, r) {
  const v = r[c.k];
  if (c.k === "sym") return v ? `<a class="sym" href="${href("DES", v)}">${esc(short(v))}</a>` : "—";
  if (c.k === "name" && !live() && r.sym) return `<a class="sym" href="${href("DES", r.sym)}">${esc(v)}</a>`;
  if (c.t === "s") return esc(v || "—");
  if (!Number.isFinite(v)) return `<span class="muted">—</span>`;
  switch (c.t) {
    case "px": return fmt.px(v);
    case "pct": return fmt.pct(v);
    case "int": return fmt.n(v, 0);
    case "n1": return v.toFixed(1);
    case "x": return v.toFixed(2) + "×";
    default: return fmt.n(v, 2);
  }
}

export function mount(el) {
  el.innerHTML = `<div class="grid">
    ${panel("Screener · universe", `
      <div class="row-form">
        <select id="uni" aria-label="Universe">${[...UNIVERSES, ["CSV", "Upload CSV (Screener.in, Tickertape…)"]].map(([k, l]) => `<option value="${k}" ${k === S.uni ? "selected" : ""}>${l}</option>`).join("")}</select>
        <button class="btn amber" id="scan">Run scan</button>
        <span id="scanState" class="muted"></span>
      </div>
      <div id="customBox" class="hidden">
        <label>Tickers separated by commas, spaces or new lines (NSE by default; 6-digit codes are BSE)
          <textarea id="customText" placeholder="TATAPOWER, IRCTC, POLYCAB, DIXON, 500325"></textarea></label>
        <button class="btn" id="customSave">Save list & scan</button>
      </div>
      <div id="csvBox" class="hidden">
        <div class="row-form"><input type="file" id="csvFile" accept=".csv,text/csv,.tsv" aria-label="CSV file">
          <button class="btn" id="csvPasteToggle">Paste instead</button></div>
        <div id="csvPasteBox" class="hidden"><textarea id="csvPaste" placeholder="Name,NSE Code,CMP,P/E,ROE %,ROCE %,Debt / Eq,Mar Cap Cr&#10;…"></textarea>
          <button class="btn" id="csvPasteLoad">Load pasted data</button></div>
      </div>`, { cls: "c12" })}
    ${panel("Screens", `<div class="presets" id="presets"></div>`, { cls: "c12" })}
    ${panel("Filters", `<div id="filterList"></div>
      <div class="row-form">
        <button class="btn" id="addFilter">+ Filter</button>
        <select id="secSel" aria-label="Sector"></select>
        <input id="qBox" placeholder="Search name / ticker" aria-label="Search results" value="${esc(S.q)}">
        <button class="btn" id="saveScreen">Save screen</button>
        <button class="btn" id="clearFilters">Clear</button>
      </div>`, { cls: "c12" })}
    ${panel(`Results <span id="count" class="muted"></span>`, `<div class="tbl tall" id="results"></div>`, {
      cls: "c12",
      actions: `<details class="colpick"><summary class="btn">Columns</summary><div id="colList"></div></details>
        <button class="btn" id="watchAll">+ Watch all</button><button class="btn" id="export">Export CSV</button>`,
    })}
  </div>`;

  const numCols = () => S.cols.filter(c => c.t !== "s");
  const visCols = () => (live() ? FIELDS.filter(c => S.vis.has(c.k)) : S.cols);

  function renderPresets() {
    const saved = store.get("bahi-screens-v1", []);
    $("#presets", el).innerHTML = PRESETS.map((p, i) => `<button class="preset" data-p="${i}"><b>${esc(p.name)}</b><span>${esc(p.desc)}</span></button>`).join("") +
      saved.map((p, i) => `<span class="preset saved"><button data-sp="${i}"><b>★ ${esc(p.name)}</b><span>${p.filters.length} filter${p.filters.length === 1 ? "" : "s"}${p.sector ? " · " + esc(p.sector) : ""}</span></button><button class="ib x" data-spx="${i}" aria-label="Delete saved screen ${esc(p.name)}">×</button></span>`).join("");
  }

  function renderFilters() {
    const nc = numCols();
    $("#filterList", el).innerHTML = S.filters.length ? S.filters.map((f, i) => `
      <div class="filter">
        <select data-fi="${i}" data-f="k" aria-label="Field">${nc.map(c => `<option value="${esc(c.k)}" ${c.k === f.k ? "selected" : ""} title="${esc(tip(c.k))}">${esc(c.l)}</option>`).join("")}</select>
        <select data-fi="${i}" data-f="op" aria-label="Condition">${OPS.map(o => `<option ${o === f.op ? "selected" : ""}>${o}</option>`).join("")}</select>
        <input type="number" step="any" data-fi="${i}" data-f="v" value="${f.v}" aria-label="Value">
        <button class="ib x" data-rm="${i}" aria-label="Remove filter">×</button>
      </div>`).join("") : `<p class="muted">No filters — showing everything. Pick a screen above or add a filter.</p>`;
    const sectors = [...new Set(S.rows.map(r => r.sector).filter(Boolean))].sort();
    $("#secSel", el).innerHTML = `<option value="">All sectors</option>` + sectors.map(s => `<option ${s === S.sector ? "selected" : ""}>${esc(s)}</option>`).join("");
    $("#secSel", el).classList.toggle("hidden", !sectors.length);
  }

  function renderCols() {
    $("#colList", el).innerHTML = live()
      ? FIELDS.map(c => `<label class="chk" title="${esc(tip(c.k))}"><input type="checkbox" data-col="${c.k}" ${S.vis.has(c.k) ? "checked" : ""}> ${esc(c.l)}</label>`).join("")
      : `<p class="muted">All CSV columns are shown.</p>`;
  }

  function renderResults() {
    if (live()) S.rows = liveRows();
    const rows = S.rows.filter(passes);
    const cols = visCols().map(c => ({ k: c.k, l: esc(c.l), tip: live() ? tip(c.k) : "", n: c.t !== "s", f: r => cell(c, r), c: r => (c.t === "pct" ? cls(r[c.k]) : ""), v: r => r[c.k] }));
    $("#count", el).textContent = `${rows.length} of ${S.rows.length}${S.csvLabel && !live() ? " · " + S.csvLabel : ""}`;
    $("#results", el).innerHTML = sortTable(cols, rows.slice(0, 1000), S.sort, { empty: S.rows.length ? "Nothing matches — loosen or remove a filter." : "No data yet." });
  }
  const renderAll = () => { renderPresets(); renderFilters(); renderCols(); renderResults(); };

  function showSourceBoxes() {
    $("#customBox", el).classList.toggle("hidden", S.uni !== "CUSTOM");
    $("#csvBox", el).classList.toggle("hidden", S.uni !== "CSV");
    $("#scan", el).classList.toggle("hidden", S.uni === "CSV");
    if (S.uni === "CUSTOM") $("#customText", el).value = getCustom().map(short).join(", ");
  }

  let scanSeq = 0;
  async function scan(fresh = false) {
    if (!live()) return;
    const my = ++scanSeq;
    S.cols = FIELDS;
    const syms = universe(S.uni);
    const state = $("#scanState", el);
    if (!syms.length) { state.textContent = S.uni === "CUSTOM" ? "Add some tickers to your custom list first." : "This list is empty."; renderAll(); return; }
    renderAll();
    const alive = () => my === scanSeq;
    const done = await scanSymbols(syms, { say: t => { if (alive()) state.textContent = t; }, partial: () => alive() && renderResults(), alive, fresh });
    if (done) renderAll();
  }

  // ---- events ----
  $("#uni", el).onchange = e => {
    S.uni = e.target.value; store.set("bahi-eqs-uni", S.uni);
    S.sector = ""; showSourceBoxes();
    if (S.uni === "CSV") {
      const saved = store.get(CSV_KEY, null);
      if (saved?.text && loadCSV(saved.text, saved.label || "Saved data")) renderAll();
      else { S.cols = []; S.rows = []; S.csvLabel = ""; renderAll(); }
      $("#scanState", el).textContent = "";
    } else { S.cols = FIELDS; scan(); }
  };
  $("#scan", el).onclick = () => { if (S.uni === "CUSTOM") $("#customSave", el).click(); else scan(true); };
  $("#customSave", el).onclick = () => {
    const list = [...new Set($("#customText", el).value.split(/[\s,;]+/).map(normSym).filter(Boolean))].slice(0, 200);
    setCustom(list); toast(`Saved ${list.length} ticker${list.length === 1 ? "" : "s"}`); scan();
  };
  $("#csvFile", el).onchange = async e => { const f = e.target.files[0]; if (f && loadCSV(await f.text(), f.name)) renderAll(); e.target.value = ""; };
  $("#csvPasteToggle", el).onclick = () => $("#csvPasteBox", el).classList.toggle("hidden");
  $("#csvPasteLoad", el).onclick = () => { const t = $("#csvPaste", el).value.trim(); if (!t) return toast("Paste some rows first."); if (loadCSV(t, "Pasted data")) renderAll(); };

  $("#presets", el).addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.spx != null) {
      const saved = store.get("bahi-screens-v1", []); saved.splice(+b.dataset.spx, 1); store.set("bahi-screens-v1", saved); renderPresets(); return;
    }
    if (b.dataset.sp != null) {
      const p = store.get("bahi-screens-v1", [])[+b.dataset.sp];
      if (p) { S.filters = p.filters.map(f => ({ ...f })); S.sector = p.sector || ""; }
    } else if (b.dataset.p != null) {
      const p = PRESETS[+b.dataset.p], have = new Set(numCols().map(c => c.k)), missing = new Set();
      S.filters = p.f.filter(([k]) => have.has(k) || (missing.add(k), false)).map(([k, op, v]) => ({ k, op, v }));
      if (missing.size) toast(`Skipped ${[...missing].join(", ")} — not in this data`);
      if (live()) p.f.forEach(([k]) => S.vis.add(k));
    }
    renderFilters(); renderCols(); renderResults();
  });

  $("#filterList", el).addEventListener("input", e => {
    const i = e.target.dataset.fi;
    if (i == null) return;
    const f = S.filters[+i], k = e.target.dataset.f;
    f[k] = k === "v" ? (e.target.value === "" ? NaN : +e.target.value) : e.target.value;
    if (k === "k" && live()) { S.vis.add(f.k); renderCols(); }
    renderResults();
  });
  $("#filterList", el).addEventListener("click", e => { const r = e.target.closest("[data-rm]"); if (r) { S.filters.splice(+r.dataset.rm, 1); renderFilters(); renderResults(); } });
  $("#addFilter", el).onclick = () => {
    const c = numCols()[0];
    if (!c) return toast("This data has no numeric columns to filter.");
    S.filters.push({ k: live() ? "pe" : c.k, op: "<", v: live() ? 25 : 0 });
    renderFilters(); renderResults();
  };
  $("#clearFilters", el).onclick = () => { S.filters = []; S.sector = ""; S.q = ""; $("#qBox", el).value = ""; renderFilters(); renderResults(); };
  $("#secSel", el).onchange = e => { S.sector = e.target.value; renderResults(); };
  $("#qBox", el).addEventListener("input", debounce(e => { S.q = e.target.value.trim(); renderResults(); }, 150));
  $("#saveScreen", el).onclick = () => {
    if (!S.filters.length && !S.sector) return toast("Add a filter first.");
    const name = prompt("Name this screen", "My screen");
    if (!name) return;
    const saved = store.get("bahi-screens-v1", []);
    saved.push({ name: name.slice(0, 40), filters: S.filters.map(f => ({ ...f })), sector: S.sector });
    store.set("bahi-screens-v1", saved); renderPresets(); toast("Saved screen “" + name + "”");
  };

  $("#colList", el).addEventListener("change", e => {
    const k = e.target.dataset.col;
    if (!k) return;
    e.target.checked ? S.vis.add(k) : S.vis.delete(k);
    store.set("bahi-eqs-cols", [...S.vis]); renderResults();
  });
  $("#results", el).addEventListener("click", e => {
    const th = e.target.closest("th[data-sort]");
    if (!th) return;
    const k = th.dataset.sort, c = (live() ? FIELDS : S.cols).find(x => x.k === k);
    S.sort = nextSort(S.sort, k, c?.t !== "s"); renderResults();
  });
  $("#export", el).onclick = () => {
    const cols = visCols(), rows = S.rows.filter(passes);
    downloadCSV("screen.csv", [cols.map(c => c.l), ...rows.map(r => cols.map(c => (c.k === "sym" ? short(r.sym) : Number.isFinite(r[c.k]) ? +r[c.k].toFixed(4) : r[c.k] ?? "")))]);
  };
  $("#watchAll", el).onclick = () => {
    const rows = S.rows.filter(passes).filter(r => r.sym);
    if (!rows.length) return toast("No results with tickers to add.");
    const n = rows.filter(r => addWatch(r.sym)).length;
    toast(`Added ${n} to watchlist`);
  };

  showSourceBoxes();
  if (S.uni === "CSV") {
    const saved = store.get(CSV_KEY, null);
    if (!S.rows.length && saved?.text) loadCSV(saved.text, saved.label || "Saved data");
    renderAll();
  } else scan();

  return {
    syms: () => (live() ? universe(S.uni) : []),
    onQuotes: () => { if (live()) renderResults(); },
    unmount: () => { scanSeq++; },
  };
}
