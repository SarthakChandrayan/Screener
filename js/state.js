// Persistent user data: watchlist, alerts, portfolio and the custom screener universe.

import { store, uid } from "./util.js";
import { NIFTY50, NEXT50 } from "./universes.js";

/* ---------- watchlist ---------- */
const WKEY = "bahi-watch-v1";
let watch = store.get(WKEY, ["^NSEI", "RELIANCE.NS", "HDFCBANK.NS", "TCS.NS", "INFY.NS", "ICICIBANK.NS", "BHARTIARTL.NS", "ITC.NS"]);
export const watchlist = () => watch.slice();
export const inWatch = s => watch.includes(s);
export function addWatch(s) { if (!s || watch.includes(s)) return false; watch.push(s); store.set(WKEY, watch); return true; }
export function removeWatch(s) { watch = watch.filter(x => x !== s); store.set(WKEY, watch); }
export function moveWatch(s, dir) {
  const i = watch.indexOf(s), j = i + dir;
  if (i < 0 || j < 0 || j >= watch.length) return;
  [watch[i], watch[j]] = [watch[j], watch[i]];
  store.set(WKEY, watch);
}

/* ---------- alerts ---------- */
const AKEY = "bahi-alerts-v1";
let alerts = store.get(AKEY, []);
export const getAlerts = () => alerts;
export function addAlert(sym, op, price, note = "") { alerts.push({ id: uid(), sym, op, price, note, created: Date.now(), fired: null }); store.set(AKEY, alerts); }
export function removeAlert(id) { alerts = alerts.filter(a => a.id !== id); store.set(AKEY, alerts); }
export function rearmAlert(id) { const a = alerts.find(x => x.id === id); if (a) { a.fired = null; store.set(AKEY, alerts); } }
export function saveAlerts() { store.set(AKEY, alerts); }

/* ---------- portfolio (key kept from the original app so existing data carries over) ---------- */
const PKEY = "bahi-portfolio-v1";
export const portfolio = store.get(PKEY, { holdings: [] });
if (!Array.isArray(portfolio.holdings)) portfolio.holdings = [];
export const savePortfolio = () => store.set(PKEY, portfolio);
export const yahooSym = h => h.sym + (h.ex === "BSE" ? ".BO" : ".NS");

/* ---------- universes for the screener, movers and heatmap ---------- */
const CKEY = "bahi-custom-universe-v1";
export const getCustom = () => store.get(CKEY, []);
export const setCustom = list => store.set(CKEY, list);

export const UNIVERSES = [
  ["N50", "Nifty 50"],
  ["NN50", "Nifty Next 50"],
  ["N100", "Nifty 100"],
  ["WATCH", "My watchlist"],
  ["PORT", "My portfolio"],
  ["CUSTOM", "Custom list"],
];
export function universe(id) {
  switch (id) {
    case "NN50": return NEXT50.map(s => s.sym);
    case "N100": return [...NIFTY50, ...NEXT50].map(s => s.sym);
    case "WATCH": return watch.filter(s => !s.startsWith("^") && !s.includes("="));
    case "PORT": return [...new Set(portfolio.holdings.map(yahooSym))];
    case "CUSTOM": return getCustom();
    default: return NIFTY50.map(s => s.sym);
  }
}
