// Building blocks shared by the views.

import { esc, fmt, cls, short } from "../util.js";
import { getQuote } from "../api.js";
import { nameOf } from "../universes.js";
import { UNIVERSES } from "../state.js";
import { labelTip } from "../glossary.js";

export const href = (fn, ...a) => "#/" + [fn, ...a].map(encodeURIComponent).join("/");
export const secLink = (sym, label) => `<a class="sym" href="${href("DES", sym)}">${esc(label ?? short(sym))}</a>`;

export const panel = (title, body, { cls: c = "", actions = "", id = "" } = {}) =>
  `<section class="panel ${c}" ${id ? `id="${id}"` : ""}><header class="ph"><h2>${title}</h2>${actions ? `<div class="pa">${actions}</div>` : ""}</header><div class="pb">${body}</div></section>`;

export const flash = q => (q?.tick > 0 ? "fl-up" : q?.tick < 0 ? "fl-dn" : "");

// Compact "name / last / chg / %" table for a list of symbols
export function miniQuotes(syms, { names = true } = {}) {
  return `<table class="t"><tbody>${syms.map(s => {
    const q = getQuote(s);
    return `<tr>
      <td>${secLink(s, names ? nameOf(s, q) : short(s))}</td>
      <td class="${flash(q)}">${fmt.px(q?.price)}</td>
      <td class="${cls(q?.change)}">${fmt.chg(q?.change)}</td>
      <td class="${cls(q?.changePct)}">${fmt.pct(q?.changePct)}</td></tr>`;
  }).join("")}</tbody></table>`;
}

export const universeSelect = (cur, id = "uni") =>
  `<select id="${id}" aria-label="Universe">${UNIVERSES.map(([k, l]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${l}</option>`).join("")}</select>`;

export const kv = rows => `<dl class="kv">${rows.map(([k, v, c = ""]) => { const t = labelTip(k); return `<dt${t ? ` class="tipped" title="${esc(t)}"` : ""}>${k}</dt><dd class="${c}">${v}</dd>`; }).join("")}</dl>`;

export function newsList(items, max = 30) {
  if (!items.length) return `<p class="muted pad">No headlines found.</p>`;
  return `<ol class="news">${items.slice(0, max).map(n => `<li>
    <span class="ntime">${fmt.ago(n.time)}</span>
    <a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>
    <span class="nsrc">${esc(n.source || "")}</span></li>`).join("")}</ol>`;
}

// Sortable table helper: cols = [{k, l, f?(row)→html, n?:bool, c?(row)→class, tip?: header tooltip}]
export function sortTable(cols, rows, sort, { empty = "Nothing to show.", rowAttr = () => "" } = {}) {
  if (sort?.k) {
    const col = cols.find(c => c.k === sort.k);
    const get = col?.v || (r => r[sort.k]);
    rows = rows.slice().sort((a, b) => {
      const x = get(a), y = get(b);
      const xn = x == null || Number.isNaN(x), yn = y == null || Number.isNaN(y);
      if (xn || yn) return xn - yn; // blanks last either way
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * sort.dir;
    });
  }
  const head = cols.map(c => `<th class="${c.n === false ? "l" : ""} sortable${c.tip ? " tipped" : ""}" data-sort="${c.k}"${c.tip ? ` title="${esc(c.tip)}"` : ""}>${c.l}${sort?.k === c.k ? (sort.dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("");
  const body = rows.length
    ? rows.map(r => `<tr ${rowAttr(r)}>${cols.map(c => `<td class="${c.n === false ? "l" : ""} ${c.c ? c.c(r) : ""}">${c.f ? c.f(r) : esc(r[c.k] ?? "—")}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${cols.length}" class="empty">${empty}</td></tr>`;
  return `<table class="t"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
export function nextSort(sort, k, numeric = true) {
  return sort?.k === k ? { k, dir: -sort.dir } : { k, dir: numeric ? -1 : 1 };
}
