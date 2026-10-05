// Terminal shell: command line with suggestions, routing, ticker tape, clock and the quote poller.

import { $, $$, esc, fmt, cls, normSym, short, debounce, marketStatus, istNow, store } from "./util.js";
import { bus, feed, getQuote, refreshQuotes, searchSymbols } from "./api.js";
import { TAPE, STOCKS, MARKETS, nameOf } from "./universes.js";
import { go, parseHash } from "./nav.js";
import { FUNCTIONS, SEC_FUNCTIONS } from "./views/help.js";
import * as top from "./views/top.js";
import * as wei from "./views/wei.js";
import * as watch from "./views/watch.js";
import * as port from "./views/port.js";
import * as eqs from "./views/eqs.js";
import * as ideas from "./views/ideas.js";
import * as picks from "./views/picks.js";
import * as track from "./views/track.js";
import * as most from "./views/most.js";
import * as heat from "./views/heat.js";
import * as news from "./views/news.js";
import * as alrt from "./views/alrt.js";
import * as comp from "./views/comp.js";
import * as des from "./views/des.js";
import * as help from "./views/help.js";

const VIEWS = {
  TOP: top.mount, WEI: wei.mount, W: watch.mount, PORT: port.mount, EQS: eqs.mount, IDEAS: ideas.mount, PICKS: picks.mount, TRACK: track.mount, MOST: most.mount,
  HEAT: heat.mount, N: news.mount, ALRT: alrt.mount, COMP: comp.mount, DES: des.mount, GP: des.mountFull, HELP: help.mount,
};
const ALIASES = {
  HOME: "TOP", MKT: "WEI", WL: "W", WATCH: "W", PF: "PORT", PRT: "PORT", SCR: "EQS", SCREEN: "EQS", IDEA: "IDEAS", PICK: "PICKS", MANAGER: "PICKS", ADVISOR: "PICKS", BUY: "PICKS", PLAN: "PICKS", RECORD: "TRACK", HISTORY: "TRACK", PICKS: "IDEAS", SUGGEST: "IDEAS", LEARN: "HELP", GLOSSARY: "HELP", IMAP: "HEAT",
  NEWS: "N", CN: "N", ALERT: "ALRT", ALERTS: "ALRT", G: "GP", CHART: "GP", COMPARE: "COMP", "?": "HELP", H: "HELP",
};
const SEC_FNS = new Set(SEC_FUNCTIONS.map(f => f[0]));
const fnOf = t => (VIEWS[t] ? t : ALIASES[t]);

/* ---------- routing ---------- */
let cur = null;
function route() {
  const { fn: raw, args } = parseHash();
  const fn = fnOf(raw) || "PICKS";
  try { cur?.inst?.unmount?.(); } catch { /* ignore */ }
  const host = document.createElement("div");
  host.className = "view-inner";
  $("#view").replaceChildren(host);
  window.scrollTo(0, 0);
  let inst = {};
  try { inst = VIEWS[fn](host, args) || {}; }
  catch (e) { console.error(e); host.innerHTML = `<p class="pad dn">Something went wrong: ${esc(e.message)}</p>`; }
  cur = { fn, args, inst };
  $$("#fkeys a").forEach(a => a.classList.toggle("on", a.dataset.fn === fn));
  $("#fkeys .more")?.classList.toggle("on", !!$("#fkeys .more a.on"));
  $("#crumb").textContent = [fn, ...args.map(a => short(a))].join(" ");
  document.title = `${inst.title || fn} · Screener`;
  poll();
}
window.addEventListener("hashchange", route);

/* ---------- command line ---------- */
function run(text) {
  const t = text.trim().toUpperCase().replace(/\s*<?GO>?$/, "");
  if (!t) return;
  const parts = t.split(/\s+/);
  const fn = fnOf(parts[0]);
  // "COMP TCS INFY", "N", "EQS"
  if (fn && (parts.length === 1 || !SEC_FNS.has(fnOf(parts[1]) || ""))) {
    if (fn === "N" && parts.length > 1) return go("N", "Q", text.trim().split(/\s+/).slice(1).join(" "));
    return go(fn, ...parts.slice(1).map(p => (fn === "COMP" || fn === "DES" || fn === "GP" || fn === "ALRT" ? normSym(p) : p)));
  }
  // "RELIANCE", "RELIANCE GP", "500325 N"
  const sym = normSym(parts[0]);
  const sf = parts[1] ? fnOf(parts[1]) : "DES";
  go(SEC_FNS.has(sf) ? sf : "DES", sym);
}

const input = $("#cmd"), box = $("#suggest");
let items = [], sel = -1, seq = 0;

function localMatches(q) {
  const out = [];
  const first = q.split(/\s+/)[0];
  if (!q.includes(" ")) {
    [...FUNCTIONS, ...Object.keys(ALIASES).filter(a => a.length > 1).map(a => [a, "→ " + ALIASES[a]])]
      .filter(([k]) => k.startsWith(first)).slice(0, 4)
      .forEach(([k, d]) => out.push({ code: k, label: d, cmd: k, kind: "fn" }));
  }
  const ql = q.toLowerCase();
  for (const s of STOCKS.values()) {
    if (out.length > 10) break;
    if (short(s.sym).startsWith(q) || s.name.toLowerCase().includes(ql)) out.push({ code: short(s.sym), label: s.name, sub: "NSE · " + s.sector, cmd: s.sym, kind: "sec" });
  }
  for (const g of MARKETS) for (const [s, n] of g.items) {
    if (out.length > 12) break;
    if (n.includes(q) || s.startsWith(q)) out.push({ code: s, label: n, sub: g.group, cmd: s, kind: "sec" });
  }
  return out;
}

function renderSuggest() {
  if (!items.length) { box.classList.add("hidden"); input.setAttribute("aria-expanded", "false"); return; }
  box.innerHTML = items.map((it, i) => `<div class="sg ${i === sel ? "on" : ""}" role="option" id="sg${i}" aria-selected="${i === sel}" data-i="${i}">
    <b class="${it.kind}">${esc(it.code)}</b><span>${esc(it.label)}</span><small>${esc(it.sub || (it.kind === "fn" ? "function" : ""))}</small></div>`).join("");
  box.classList.remove("hidden");
  input.setAttribute("aria-expanded", "true");
  if (sel >= 0) input.setAttribute("aria-activedescendant", "sg" + sel); else input.removeAttribute("aria-activedescendant");
}
const hideSuggest = () => { items = []; sel = -1; renderSuggest(); };

const remote = debounce(async (q, my) => {
  try {
    const res = await searchSymbols(q);
    if (my !== seq) return;
    const have = new Set(items.map(i => i.cmd));
    res.filter(r => !have.has(r.sym)).slice(0, 8).forEach(r => items.push({ code: short(r.sym), label: r.name, sub: `${r.exch || ""} · ${r.type.toLowerCase()}`, cmd: r.sym, kind: "sec" }));
    renderSuggest();
  } catch { /* offline: local suggestions only */ }
}, 250);

input.addEventListener("input", () => {
  const q = input.value.trim().toUpperCase();
  const my = ++seq;
  if (!q) return hideSuggest();
  items = localMatches(q); sel = -1;
  renderSuggest();
  if (q.length >= 2 && !q.includes(" ")) remote(q, my);
});
input.addEventListener("keydown", e => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (!items.length) return;
    e.preventDefault();
    const n = items.length;
    sel = e.key === "ArrowDown" ? (sel + 1 >= n ? -1 : sel + 1) : (sel - 1 < -1 ? n - 1 : sel - 1);
    renderSuggest();
  } else if (e.key === "Escape") { input.value = ""; hideSuggest(); input.blur(); }
});
$("#cmdForm").addEventListener("submit", e => {
  e.preventDefault();
  const it = items[sel];
  const rest = input.value.trim().split(/\s+/).slice(1);
  const text = it ? [it.cmd, ...(it.kind === "sec" ? rest : [])].join(" ") : input.value;
  input.value = "";
  hideSuggest();
  input.blur();
  run(text);
});
box.addEventListener("mousedown", e => {
  const r = e.target.closest("[data-i]");
  if (!r) return;
  e.preventDefault();
  sel = +r.dataset.i;
  $("#cmdForm").requestSubmit();
});
input.addEventListener("blur", () => setTimeout(hideSuggest, 120));

// Bloomberg-style: just start typing anywhere
document.addEventListener("keydown", e => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (["input", "textarea", "select"].includes(tag) || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "/") { e.preventDefault(); input.focus(); return; }
  if (e.key.length === 1 && /[a-z0-9^]/i.test(e.key)) input.focus();
});

/* ---------- ticker tape ---------- */
function buildTape() {
  const one = TAPE.map(s => `<a class="tk" href="#/DES/${encodeURIComponent(s)}" data-s="${esc(s)}"><b>${esc(nameOf(s))}</b> <span class="p">—</span> <span class="c"></span></a>`).join("");
  $("#tape").innerHTML = `<div class="tape-track">${one}<span aria-hidden="true" class="dup">${one}</span></div>`;
}
function updateTape() {
  $$("#tape .tk").forEach(a => {
    const q = getQuote(a.dataset.s);
    if (!q) return;
    $(".p", a).textContent = fmt.px(q.price);
    const c = $(".c", a);
    c.textContent = fmt.pct(q.changePct);
    c.className = "c " + cls(q.changePct);
  });
}

/* ---------- clock + market state ---------- */
function tick() {
  const m = marketStatus();
  $("#clock").textContent = istNow().text + " IST";
  const el = $("#mkt");
  el.textContent = "NSE " + m.label;
  el.className = "mkt " + (m.open ? "open" : "closed");
}
setInterval(tick, 1000);

/* ---------- poller ---------- */
let timer = null, polling = false, lastOk = 0;
function setFeed(ok, msg) {
  const f = $("#feed");
  if (!ok) { f.className = "feed err"; f.textContent = `● FEED ERROR · ${msg}`; return; }
  f.className = "feed " + (feed.warning ? "warn" : "ok");
  f.textContent = feed.source === "upstox" ? `● UPSTOX LIVE · ${fmt.time(lastOk)}`
    : feed.warning ? `● DELAYED FEED (YAHOO) · ${feed.warning}` : `● DELAYED FEED · ${fmt.time(lastOk)}`;
}
async function poll() {
  clearTimeout(timer);
  if (!polling) {
    polling = true;
    const syms = new Set([...TAPE, ...alrt.alertSyms()]);
    try { (cur?.inst?.syms?.() || []).forEach(s => syms.add(s)); } catch { /* view not ready */ }
    try { await refreshQuotes([...syms]); lastOk = Date.now(); setFeed(true); }
    catch (e) { setFeed(false, location.protocol === "file:" ? "open via a server (see README)" : e.message); }
    polling = false;
  }
  timer = setTimeout(poll, document.hidden ? 300e3 : marketStatus().open ? 20e3 : 120e3);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - lastOk > 20e3) poll(); });

bus.addEventListener("quotes", () => {
  updateTape();
  try { cur?.inst?.onQuotes?.(); } catch (e) { console.error(e); }
  alrt.checkAlerts();
});

/* ---------- boot ---------- */
// Simple view: a few plain tabs plus a "More" menu. Pro view: every function key, ticker tape and breadcrumb.
const MAIN_TABS = [["PICKS", "Buy plan"], ["TRACK", "Track record"], ["IDEAS", "Stock ideas"], ["PORT", "My portfolio"], ["W", "Watchlist"], ["TOP", "Market today"]];
const MORE_TABS = [["EQS", "Screener"], ["MOST", "Top movers"], ["HEAT", "Sector heatmap"], ["N", "News"], ["COMP", "Compare stocks"], ["ALRT", "Price alerts"], ["WEI", "World markets"], ["HELP", "Help & glossary"]];
let pro = store.get("bahi-pro-view", false);
function buildNav() {
  document.body.classList.toggle("simple", !pro);
  $("#fkeys").innerHTML = pro
    ? FUNCTIONS.map(([k, d]) => `<a href="#/${k}" data-fn="${k}" title="${esc(d)}">${k}</a>`).join("")
    : MAIN_TABS.map(([k, l]) => `<a href="#/${k}" data-fn="${k}">${l}</a>`).join("") +
      `<details class="more"><summary>More ▾</summary><div>${MORE_TABS.map(([k, l]) => `<a href="#/${k}" data-fn="${k}">${l}</a>`).join("")}</div></details>`;
  $("#viewToggle").textContent = pro ? "Simple view" : "Pro view";
  $$("#fkeys a").forEach(a => a.classList.toggle("on", a.dataset.fn === cur?.fn));
}
$("#viewToggle").onclick = () => { pro = !pro; store.set("bahi-pro-view", pro); buildNav(); };
$("#fkeys").addEventListener("click", e => { if (e.target.closest(".more a")) e.currentTarget.querySelector(".more").open = false; });
document.addEventListener("click", e => { const m = $("#fkeys .more"); if (m?.open && !m.contains(e.target)) m.open = false; });
buildNav();
buildTape();
tick();
route();
