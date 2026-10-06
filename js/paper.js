// Paper trading engine: a virtual delivery (CNC) account for NSE/BSE stocks.
// Orders fill at live prices with realistic Indian delivery charges and a little slippage,
// sells are matched to buys first-in-first-out, and closed trades feed the analysis page.
// Everything lives in this browser's localStorage.

import { store, uid } from "./util.js";

const KEY = "screener-paper-v1";
export const START_CASH = 1000000;

// Approximate delivery charges in India (2025). Brokerage is editable in settings.
export const CHARGES = {
  brokerage: 20,          // ₹ per executed order (capped at 2.5% of order value)
  stt: 0.001,             // 0.1% on buy and sell
  exchange: 0.0000297,    // NSE transaction charge
  sebi: 0.000001,         // ₹10 per crore
  gst: 0.18,              // on brokerage + exchange + SEBI fees
  stamp: 0.00015,         // 0.015% on buy only
  dp: 16,                 // ₹ per stock per sell day (depository charge)
  slippage: 0.0005,       // 0.05% worse than the quote on market and stop orders
};

export function charges(side, value, brokerage = CHARGES.brokerage) {
  const brk = Math.min(brokerage, value * 0.025);
  const exch = value * CHARGES.exchange, sebi = value * CHARGES.sebi;
  const stt = value * CHARGES.stt;
  const gst = (brk + exch + sebi) * CHARGES.gst;
  const stamp = side === "buy" ? value * CHARGES.stamp : 0;
  const dp = side === "sell" ? CHARGES.dp : 0;
  const total = brk + exch + sebi + stt + gst + stamp + dp;
  return { total, brk, stt, gst, stamp, dp, other: exch + sebi };
}

const fresh = () => ({ v: 1, start: START_CASH, cash: START_CASH, createdAt: Date.now(), brokerage: CHARGES.brokerage, positions: {}, orders: [], fills: [], closed: [], equity: [] });

let A = load();
function load() {
  const a = store.get(KEY, null);
  return a && a.v === 1 ? a : fresh();
}
export const account = () => A;
export const save = () => store.set(KEY, A);
export function reset(start = START_CASH) { A = fresh(); A.start = A.cash = start; save(); }

/* ---------- derived numbers ---------- */
export const posQty = sym => (A.positions[sym]?.lots || []).reduce((a, l) => a + l.qty, 0);
export function posAvg(sym) {
  const lots = A.positions[sym]?.lots || [], q = lots.reduce((a, l) => a + l.qty, 0);
  return q ? lots.reduce((a, l) => a + l.qty * l.px, 0) / q : 0;
}
// Cash already promised to open buy orders
export const reserved = () => A.orders.filter(o => o.status === "open" && o.side === "buy").reduce((a, o) => a + o.qty * (o.price || o.refPx || 0) * 1.003, 0);
export const available = () => A.cash - reserved();
// Shares already promised to open sell orders (stop-loss and target of the same bracket count once)
export function committed(sym) {
  const open = A.orders.filter(o => o.status === "open" && o.side === "sell" && o.sym === sym);
  const groups = new Map();
  open.forEach(o => { const k = o.oco || o.id; groups.set(k, Math.max(groups.get(k) || 0, o.qty)); });
  return [...groups.values()].reduce((a, b) => a + b, 0);
}

/* ---------- placing orders ---------- */
// type: market | limit | sl (stop-loss sell) | target (limit sell above price)
// type "trail" = trailing stop-loss: trigger follows the highest price since placing, trailPct below it.
export function placeOrder({ sym, name, sector, side, type, qty, price, refPx, tag = "", note = "", mood = "", sl, target, trailPct }) {
  qty = Math.floor(qty);
  if (!(qty > 0)) throw new Error("Enter a quantity of at least 1 share.");
  if (type === "trail") {
    if (!(trailPct > 0 && trailPct < 50)) throw new Error("Enter a trailing distance between 0.5% and 50%.");
    if (!(refPx > 0)) throw new Error("Waiting for a live price.");
    price = trailStop(refPx, trailPct);
  }
  if (type !== "market" && !(price > 0)) throw new Error("Enter a price for this order type.");
  if (side === "buy") {
    const need = qty * (type === "market" ? refPx : price) * 1.003;
    if (need > available()) throw new Error(`Not enough cash: this needs about ₹${Math.round(need).toLocaleString("en-IN")}, you have ₹${Math.round(available()).toLocaleString("en-IN")} free.`);
  } else {
    const free = posQty(sym) - committed(sym);
    if (qty > free) {
      if (!posQty(sym)) throw new Error("You don't own this stock. Paper trading here is delivery only, so no short selling.");
      throw new Error(free > 0 ? `You can sell at most ${free} share${free === 1 ? "" : "s"}; the rest are reserved by your open stop-loss/target or sell orders.` : "All your shares are reserved by open stop-loss/target or sell orders. Cancel those first.");
    }
  }
  const bracket = side === "buy" && (sl > 0 || target > 0 || trailPct > 0) ? { sl: sl || null, target: target || null, trailPct: type !== "trail" && trailPct > 0 ? trailPct : null } : null;
  const o = { id: uid(), sym, name, sector, side, type, qty, price: type === "market" ? null : price, refPx, tag, note, mood, status: "open", createdAt: Date.now(), bracket };
  if (type === "trail") { o.trailPct = trailPct; o.peak = refPx; }
  A.orders.push(o);
  save();
  return o;
}

const trailStop = (peak, pct) => Math.round(peak * (1 - pct / 100) * 20) / 20;

// Change the price (limit, stop-loss, target) or trailing distance of an open order
export function modifyOrder(id, value) {
  const o = A.orders.find(x => x.id === id);
  if (!o || o.status !== "open" || o.type === "market") throw new Error("Only open limit, stop-loss, target or trailing orders can be changed.");
  if (!(value > 0)) throw new Error("Enter a value above zero.");
  if (o.type === "trail") { if (value >= 50) throw new Error("Trailing distance must be under 50%."); o.trailPct = value; o.price = trailStop(o.peak, value); }
  else {
    if (o.side === "buy" && value * o.qty * 1.003 > available() + o.qty * o.price * 1.003) throw new Error("Not enough free cash for that price.");
    o.price = value;
  }
  o.modifiedAt = Date.now();
  save();
  return o;
}

export function setLesson(closedId, text) {
  const t = A.closed.find(x => x.id === closedId);
  if (t) { t.lesson = String(text).slice(0, 300); save(); }
}

export function cancelOrder(id, why = "cancelled") {
  const o = A.orders.find(x => x.id === id);
  if (o && o.status === "open") { o.status = why; o.closedAt = Date.now(); save(); }
}

/* ---------- filling ---------- */
function fill(o, px, at = Date.now()) {
  const value = o.qty * px;
  const c = charges(o.side, value, A.brokerage);
  if (o.side === "buy") {
    if (value + c.total > A.cash + 1e-6) { o.status = "rejected"; o.reason = "Not enough cash when the order triggered"; o.closedAt = at; return null; }
    A.cash -= value + c.total;
    const p = (A.positions[o.sym] ||= { name: o.name, sector: o.sector, lots: [] });
    // risk per share = distance to the stop-loss attached at entry (for R-multiples)
    const stop = o.bracket?.sl || (o.bracket?.trailPct ? trailStop(px, o.bracket.trailPct) : null);
    p.lots.push({ qty: o.qty, px, at, cost: c.total / o.qty, tag: o.tag, mood: o.mood || "", risk: stop && stop < px ? px - stop : null });
  } else {
    const have = posQty(o.sym);
    if (o.qty > have) { o.status = "rejected"; o.reason = "Shares no longer held"; o.closedAt = at; return null; }
    A.cash += value - c.total;
    // first-in-first-out: match against the oldest lots and record each closed trade
    let left = o.qty;
    const p = A.positions[o.sym];
    while (left > 0 && p.lots.length) {
      const lot = p.lots[0], q = Math.min(left, lot.qty);
      const sellCost = c.total * q / o.qty, buyCost = lot.cost * q;
      A.closed.push({
        id: uid(), sym: o.sym, name: o.name || p.name, sector: o.sector || p.sector, qty: q,
        buyPx: lot.px, sellPx: px, buyAt: lot.at, sellAt: at, tag: lot.tag || o.tag || "", exitBy: o.type,
        gross: (px - lot.px) * q, costs: buyCost + sellCost, pnl: (px - lot.px) * q - buyCost - sellCost, mood: lot.mood || "",
        r: lot.risk ? ((px - lot.px) * q - buyCost - sellCost) / (lot.risk * q) : null,
        days: Math.max(0, Math.round((at - lot.at) / 864e5)),
      });
      lot.qty -= q; left -= q;
      if (!lot.qty) p.lots.shift();
    }
    if (!p.lots.length) delete A.positions[o.sym];
  }
  o.status = "filled"; o.fillPx = px; o.filledAt = at; o.costs = c.total;
  A.fills.push({ id: o.id, sym: o.sym, name: o.name, side: o.side, type: o.type, qty: o.qty, px, at, costs: c.total, tag: o.tag, note: o.note });
  // one-cancels-other: when a stop-loss or target fills, cancel its partner
  if (o.oco) A.orders.filter(x => x.oco === o.oco && x.id !== o.id && x.status === "open").forEach(x => { x.status = "cancelled"; x.reason = "Partner order filled"; x.closedAt = at; });
  // a bracket buy creates its stop-loss and target as soon as it fills
  if (o.side === "buy" && o.bracket) {
    const stopType = o.bracket.trailPct ? "trail" : o.bracket.sl ? "sl" : null;
    const oco = stopType && o.bracket.target ? uid() : null;
    const base = { sym: o.sym, name: o.name, sector: o.sector, side: "sell", qty: o.qty, tag: o.tag, status: "open", createdAt: at, oco, parent: o.id };
    if (stopType === "trail") A.orders.push({ ...base, id: uid(), type: "trail", trailPct: o.bracket.trailPct, peak: px, price: trailStop(px, o.bracket.trailPct) });
    else if (stopType === "sl") A.orders.push({ ...base, id: uid(), type: "sl", price: o.bracket.sl });
    if (o.bracket.target) A.orders.push({ ...base, id: uid(), type: "target", price: o.bracket.target });
  }
  return o;
}

const istDay = ms => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const slip = (px, side) => px * (side === "buy" ? 1 + CHARGES.slippage : 1 - CHARGES.slippage);
const r2 = n => Math.round(n * 100) / 100;

// Live check against a quote while the market is open. Returns orders that filled.
export function checkLive(getQuote, marketOpen) {
  if (!marketOpen) return [];
  const done = [];
  let moved = false;
  for (const o of A.orders.filter(x => x.status === "open")) {
    const q = getQuote(o.sym), px = q?.price;
    if (!(px > 0)) continue;
    // never fill on a stale price (e.g. an unlisted holiday or a stuck feed): the last trade must be recent
    if (q.time && Date.now() - q.time > 30 * 60e3) continue;
    let at = null;
    if (o.type === "market") at = slip(px, o.side);
    else if (o.type === "limit") at = o.side === "buy" ? (px <= o.price ? px : null) : (px >= o.price ? px : null);
    else if (o.type === "target") at = px >= o.price ? px : null;
    else if (o.type === "sl") at = px <= o.price ? slip(px, "sell") : null;
    else if (o.type === "trail") {
      if (px <= o.price) at = slip(px, "sell");
      else if (px > o.peak) { o.peak = px; o.price = trailStop(px, o.trailPct); moved = true; }
    }
    if (at != null && fill(o, r2(at))) done.push(o);
  }
  if (done.length || moved) save();
  return done;
}

// Catch-up for days you weren't watching: walk daily candles after the order was placed.
// candles = {t:[sec], o:[], h:[], l:[]} for o.sym. Fills at the trigger price, or at the open if it gapped past.
export function checkHistory(o, candles) {
  if (o.status !== "open") return false;
  const placedDay = istDay(o.createdAt);
  // A market order placed before 9:15 IST can fill at that same day's open; otherwise from the next day
  const ist = new Date(new Date(o.createdAt).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const beforeOpen = ist.getHours() * 60 + ist.getMinutes() < 555;
  for (let i = 0; i < (candles.t || []).length; i++) {
    const day = istDay(candles.t[i] * 1000);
    if (day < placedDay || (day === placedDay && !(o.type === "market" && beforeOpen))) continue;
    const op = candles.o[i], hi = candles.h[i], lo = candles.l[i];
    if (![op, hi, lo].every(Number.isFinite)) continue;
    let at = null;
    if (o.type === "market") at = slip(op, o.side);
    else if (o.type === "limit" && o.side === "buy") { if (lo <= o.price) at = Math.min(op, o.price); }
    else if (o.type === "limit" || o.type === "target") { if (hi >= o.price) at = Math.max(op, o.price); }
    else if (o.type === "sl" && lo <= o.price) at = slip(Math.min(op, o.price), "sell");
    else if (o.type === "trail") {
      // check against yesterday's trigger first, then let today's high raise it (conservative)
      if (lo <= o.price) at = slip(Math.min(op, o.price), "sell");
      else if (hi > o.peak) { o.peak = hi; o.price = trailStop(hi, o.trailPct); save(); }
    }
    if (at == null) continue;
    const when = (candles.t[i] + 6 * 3600) * 1000; // that trading day
    const ok = !!fill(o, r2(at), Math.min(when, Date.now()));
    save();
    return ok;
  }
  return false;
}

/* ---------- corporate actions ---------- */
// Splits/bonus issues change share counts and prices; dividends pay cash to whoever held shares on the ex-date.
// actions = { sym: {splits:[{t,ratio}], divs:[{t,amt}]} } with t in seconds. Each event is applied once.
export function applyActions(actions) {
  A.applied ||= {}; A.income ||= [];
  const log = [];
  for (const [sym, ev] of Object.entries(actions)) {
    const events = [...ev.splits.map(x => ({ ...x, k: "s" })), ...ev.divs.map(x => ({ ...x, k: "d" }))].sort((a, b) => a.t - b.t);
    for (const e of events) {
      const key = `${sym}:${e.k}:${e.t}`, ms = e.t * 1000;
      if (A.applied[key] || ms > Date.now()) continue;
      if (e.k === "s") {
        let n = 0;
        for (const l of A.positions[sym]?.lots || []) {
          if (l.at >= ms) continue;
          const exact = l.qty * e.ratio, whole = Math.floor(exact);
          l.px /= e.ratio; l.cost /= e.ratio; if (l.risk) l.risk /= e.ratio;
          A.cash += (exact - whole) * l.px; // fractional entitlement paid out in cash
          l.qty = whole; n++;
        }
        for (const o of A.orders) {
          if (o.sym !== sym || o.status !== "open" || o.createdAt >= ms) continue;
          o.qty = Math.max(1, Math.floor(o.qty * e.ratio));
          ["price", "peak", "refPx"].forEach(k => { if (o[k]) o[k] = Math.round(o[k] / e.ratio * 100) / 100; });
          if (o.bracket) ["sl", "target"].forEach(k => { if (o.bracket[k]) o.bracket[k] = Math.round(o.bracket[k] / e.ratio * 100) / 100; });
          n++;
        }
        if (n) log.push(`${sym.replace(/\.(NS|BO)$/, "")}: ${e.ratio >= 1 ? `split/bonus ${e.ratio}-for-1` : `consolidation 1-for-${(1 / e.ratio).toFixed(0)}`} applied to your shares and orders`);
      } else {
        const held = (A.positions[sym]?.lots || []).filter(l => l.at < ms).reduce((a, l) => a + l.qty, 0)
          + A.closed.filter(t => t.sym === sym && t.buyAt < ms && t.sellAt >= ms).reduce((a, t) => a + t.qty, 0);
        // Yahoo adjusts past dividends for later splits; undo that to get the amount per share at the time
        const later = ev.splits.filter(x => x.t > e.t).reduce((a, x) => a * x.ratio, 1);
        if (held > 0) {
          const perShare = e.amt * later, amt = held * perShare;
          A.cash += amt;
          A.income.push({ sym, t: ms, qty: held, perShare, amt });
          log.push(`${sym.replace(/\.(NS|BO)$/, "")}: dividend of ₹${perShare.toFixed(2)} × ${held} shares = ₹${amt.toFixed(0)} credited`);
        }
      }
      A.applied[key] = true;
    }
  }
  save();
  return log;
}
export const dividendsReceived = () => (A.income || []).reduce((a, d) => a + d.amt, 0);

/* ---------- equity curve ---------- */
export function value(getQuote) {
  let held = 0, missing = 0;
  for (const [sym, p] of Object.entries(A.positions)) {
    const px = getQuote(sym)?.price, q = p.lots.reduce((a, l) => a + l.qty, 0);
    if (px > 0) held += q * px; else { held += q * posAvg(sym); missing++; }
  }
  return { cash: A.cash, held, total: A.cash + held, missing };
}
export function recordEquity(getQuote) {
  const v = value(getQuote), nifty = getQuote("^NSEI")?.price;
  if (v.missing || !(nifty > 0)) return;
  const d = istDay(Date.now());
  if (!A.equity.length) A.equity.push({ d: istDay(A.createdAt), v: A.start, nifty });
  const last = A.equity[A.equity.length - 1];
  if (last.d === d) last.v = v.total;
  else A.equity.push({ d, v: v.total, nifty });
  save();
}

/* ---------- analysis ---------- */
export function stats() {
  const C = A.closed, wins = C.filter(t => t.pnl > 0), losses = C.filter(t => t.pnl <= 0);
  const sum = (a, k) => a.reduce((x, t) => x + t[k], 0);
  const grossWin = sum(wins, "pnl"), grossLoss = -sum(losses, "pnl");
  const avg = (a, k) => (a.length ? sum(a, k) / a.length : null);
  let peak = -Infinity, maxDD = 0, ddFrom = null, ddTo = null, cur = null;
  for (const e of A.equity) {
    if (e.v > peak) { peak = e.v; cur = e.d; }
    const dd = (e.v / peak - 1) * 100;
    if (dd < maxDD) { maxDD = dd; ddFrom = cur; ddTo = e.d; }
  }
  const group = k => {
    const m = new Map();
    C.forEach(t => { const g = t[k] || "Untagged"; const x = m.get(g) || { n: 0, pnl: 0, wins: 0 }; x.n++; x.pnl += t.pnl; if (t.pnl > 0) x.wins++; m.set(g, x); });
    return [...m.entries()].map(([name, x]) => ({ name, ...x })).sort((a, b) => b.pnl - a.pnl);
  };
  return {
    n: C.length, wins: wins.length, losses: losses.length, winRate: C.length ? wins.length / C.length * 100 : null,
    avgWin: avg(wins, "pnl"), avgLoss: losses.length ? -avg(losses, "pnl") : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : wins.length ? Infinity : null,
    expectancy: avg(C, "pnl"), realized: sum(C, "pnl"),
    totalCharges: A.fills.reduce((a, f) => a + f.costs, 0),
    best: C.slice().sort((a, b) => b.pnl - a.pnl)[0] || null, worst: C.slice().sort((a, b) => a.pnl - b.pnl)[0] || null,
    holdWin: avg(wins, "days"), holdLoss: avg(losses, "days"),
    maxDD, ddFrom, ddTo, byTag: group("tag"), bySector: group("sector"), byMood: group("mood"),
    avgR: (() => { const r = C.filter(t => t.r != null); return r.length ? r.reduce((a, t) => a + t.r, 0) / r.length : null; })(),
    rCount: C.filter(t => t.r != null).length,
    grossProfit: sum(C, "gross"),
  };
}
