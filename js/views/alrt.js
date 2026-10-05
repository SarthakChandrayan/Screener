// ALRT — price alerts, checked on every quote refresh while the terminal is open.

import { $, esc, fmt, normSym, short, toast } from "../util.js";
import { getQuote, refreshQuotes } from "../api.js";
import { getAlerts, addAlert, removeAlert, rearmAlert, saveAlerts } from "../state.js";
import { panel, secLink } from "./common.js";

let audio;
function beep() {
  try {
    audio ||= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880; g.gain.value = 0.08;
    o.connect(g).connect(audio.destination);
    o.start(); o.stop(audio.currentTime + 0.25);
  } catch { /* audio blocked */ }
}

// Called by main.js after every quote refresh
export function checkAlerts() {
  let fired = 0;
  for (const a of getAlerts()) {
    if (a.fired) continue;
    const q = getQuote(a.sym);
    if (!q) continue;
    if ((a.op === ">=" && q.price >= a.price) || (a.op === "<=" && q.price <= a.price)) {
      a.fired = Date.now(); a.firedAt = q.price; fired++;
      const msg = `${short(a.sym)} ${a.op === ">=" ? "rose to" : "fell to"} ${fmt.px(q.price)} (alert ${a.op === ">=" ? "≥" : "≤"} ${fmt.px(a.price)})`;
      toast("⏰ " + msg);
      beep();
      try { if (Notification.permission === "granted") new Notification("Screener alert", { body: msg + (a.note ? " — " + a.note : "") }); } catch { /* unsupported */ }
    }
  }
  if (fired) saveAlerts();
  return fired;
}
export const alertSyms = () => [...new Set(getAlerts().filter(a => !a.fired).map(a => a.sym))];

export function mount(el, args) {
  const pre = args[0] || "";
  el.innerHTML = `<div class="grid">${panel("New alert", `
    <form id="aForm" class="form-grid" autocomplete="off">
      <label>Ticker<input id="aSym" required value="${esc(short(pre))}" placeholder="RELIANCE"></label>
      <label>When price is<select id="aOp"><option value=">=">at or above</option><option value="<=">at or below</option></select></label>
      <label>Price<input id="aPx" type="number" step="any" min="0" required></label>
      <label>Note<input id="aNote" placeholder="optional"></label>
      <button class="btn amber">Create alert</button>
    </form>
    <p class="note" id="aHint"></p>
    <p class="note">Alerts are checked each time prices refresh (every ~20s in market hours) while this tab is open. <button class="btn" id="aPerm" type="button">Enable desktop notifications</button></p>`, { cls: "c12" })}
    ${panel("Alerts", `<div class="tbl" id="aList"></div>`, { cls: "c12" })}</div>`;

  const hint = () => {
    const s = normSym($("#aSym", el).value), q = getQuote(s);
    $("#aHint", el).textContent = q ? `${short(s)} is at ${fmt.px(q.price)} now.` : "";
    if (q && !$("#aPx", el).value) $("#aPx", el).placeholder = fmt.px(q.price).replace(/,/g, "");
  };
  if (pre) refreshQuotes([pre]).then(hint).catch(() => {});
  $("#aSym", el).addEventListener("change", () => refreshQuotes([normSym($("#aSym", el).value)]).then(hint).catch(() => {}));

  function render() {
    hint();
    const list = getAlerts();
    $("#aList", el).innerHTML = list.length ? `<table class="t"><thead><tr><th class="l">Ticker</th><th>Condition</th><th>Last</th><th>Distance</th><th class="l">Note</th><th class="l">Status</th><th></th></tr></thead><tbody>${list.map(a => {
      const q = getQuote(a.sym), dist = q ? (a.price / q.price - 1) * 100 : null;
      return `<tr><td class="l">${secLink(a.sym)}</td><td>${a.op === ">=" ? "≥" : "≤"} ${fmt.px(a.price)}</td><td>${fmt.px(q?.price)}</td><td>${fmt.pct(dist)}</td>
        <td class="l muted">${esc(a.note)}</td>
        <td class="l">${a.fired ? `<span class="pill fired">Triggered ${fmt.time(a.fired)}</span>` : `<span class="pill armed">Armed</span>`}</td>
        <td><span class="row-acts">${a.fired ? `<button class="btn" data-re="${a.id}">Re-arm</button>` : ""}<button class="ib x" data-del="${a.id}" aria-label="Delete alert">×</button></span></td></tr>`;
    }).join("")}</tbody></table>` : `<p class="muted pad">No alerts yet.</p>`;
  }

  $("#aForm", el).addEventListener("submit", e => {
    e.preventDefault();
    const s = normSym($("#aSym", el).value), px = +$("#aPx", el).value;
    if (!s || !(px > 0)) return toast("Enter a ticker and a price.");
    addAlert(s, $("#aOp", el).value, px, $("#aNote", el).value.trim());
    toast(`Alert set for ${short(s)}`);
    $("#aPx", el).value = ""; $("#aNote", el).value = "";
    refreshQuotes([s]).catch(() => {});
    render();
  });
  $("#aList", el).addEventListener("click", e => {
    const b = e.target.closest("button");
    if (b?.dataset.del) removeAlert(b.dataset.del);
    else if (b?.dataset.re) rearmAlert(b.dataset.re);
    else return;
    render();
  });
  $("#aPerm", el).onclick = async () => {
    if (!("Notification" in window)) return toast("This browser doesn't support notifications.");
    const p = await Notification.requestPermission();
    toast(p === "granted" ? "Desktop notifications on." : "Notifications blocked in browser settings.");
  };
  render();
  return { syms: () => getAlerts().map(a => a.sym), onQuotes: render };
}
