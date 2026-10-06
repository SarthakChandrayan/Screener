// Small shared helpers: DOM, formatting (Indian units), storage, CSV, symbols, market hours.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ok = Number.isFinite;

/* ---------- formatting ---------- */
export const fmt = {
  n(n, d = 2) { return ok(n) ? n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—"; },
  px(n) { return ok(n) ? fmt.n(n, Math.abs(n) < 10 ? 4 : 2) : "—"; },
  chg(n) { return ok(n) ? (n > 0 ? "+" : n < 0 ? "−" : "") + fmt.n(Math.abs(n), Math.abs(n) < 0.1 ? 4 : 2) : "—"; },
  pct(n, d = 2) { return ok(n) ? (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d) + "%" : "—"; },
  inr(n, d = 0) { return ok(n) ? (n < 0 ? "−" : "") + "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—"; },
  // rupees → crores, the unit Indian markets quote company size in
  cr(n) {
    if (!ok(n)) return "—";
    const c = n / 1e7;
    return Math.abs(c) >= 1e5 ? fmt.n(c / 1e5, 2) + "L Cr" : fmt.n(c, 0) + " Cr";
  },
  big(n) {
    if (!ok(n)) return "—";
    const a = Math.abs(n);
    if (a >= 1e7) return (n / 1e7).toFixed(2) + "Cr";
    if (a >= 1e5) return (n / 1e5).toFixed(2) + "L";
    if (a >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(Math.round(n));
  },
  words(n) {
    const a = Math.abs(n);
    if (a >= 1e7) return fmt.n(n / 1e7, 2) + " crore";
    if (a >= 1e5) return fmt.n(n / 1e5, 2) + " lakh";
    return fmt.n(n, 0);
  },
  time(ms) { return ok(ms) ? new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) : "—"; },
  ago(ms) {
    if (!ok(ms)) return "";
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m";
    if (s < 86400) return Math.round(s / 3600) + "h";
    return Math.round(s / 86400) + "d";
  },
};
export const cls = n => (n > 0 ? "up" : n < 0 ? "dn" : "");

/* ---------- storage ---------- */
export const store = {
  get(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

/* ---------- toast + status ---------- */
export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 3200);
}

export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- CSV ---------- */
export function parseCSV(text) {
  const first = text.split("\n")[0];
  const delim = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? "\t" : ",";
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); f = "";
      if (row.some(x => x.trim() !== "")) rows.push(row);
      row = [];
    } else f += c;
  }
  row.push(f);
  if (row.some(x => x.trim() !== "")) rows.push(row);
  return rows.map(r => r.map(x => x.trim()));
}
export const toNum = v => {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[₹,%\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  return s === "" || s === "-" ? NaN : Number(s);
};
export function downloadCSV(name, rows) {
  const q = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(",")).join("\n")], { type: "text/csv" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- symbols ---------- */
// "reliance" → RELIANCE.NS, "500325" → 500325.BO, "^NSEI" / "INR=X" / "AAPL.US"-style kept as typed
export function normSym(s) {
  s = String(s || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return "";
  if (/[.^=]/.test(s) || /-USD$/.test(s)) return s.replace(/\.US$/, "");
  if (/^\d{6}$/.test(s)) return s + ".BO";
  return s + ".NS";
}
export const short = s => String(s || "").replace(/\.NS$/, "").replace(/\.BO$/, " BSE");
export const isEquity = s => /\.(NS|BO)$/.test(s);

/* ---------- small visuals ---------- */
export function spark(arr, w = 80, h = 20) {
  if (!arr || arr.length < 2) return "";
  const lo = Math.min(...arr), hi = Math.max(...arr), span = hi - lo || 1;
  const pts = arr.map((v, i) => `${(i / (arr.length - 1) * w).toFixed(1)},${(h - 1 - (v - lo) / span * (h - 2)).toFixed(1)}`).join(" ");
  const c = arr[arr.length - 1] >= arr[0] ? "var(--up)" : "var(--dn)";
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="${c}" stroke-width="1.2" points="${pts}"/></svg>`;
}
export function rangeBar(lo, hi, v) {
  if (!ok(lo) || !ok(hi) || !ok(v) || hi <= lo) return `<span class="rbar empty"></span>`;
  const p = Math.min(100, Math.max(0, (v - lo) / (hi - lo) * 100));
  return `<span class="rbar" title="${fmt.px(lo)} – ${fmt.px(hi)}"><i style="left:${p.toFixed(1)}%"></i></span>`;
}

/* ---------- market hours (NSE, IST) ---------- */
// NSE equity trading holidays on weekdays. Add next year's list when NSE publishes it (usually in December).
export const NSE_HOLIDAYS = {
  "2026-01-26": "Republic Day", "2026-03-03": "Holi", "2026-03-26": "Shri Ram Navami", "2026-03-31": "Shri Mahavir Jayanti",
  "2026-04-03": "Good Friday", "2026-04-14": "Ambedkar Jayanti", "2026-05-01": "Maharashtra Day", "2026-05-28": "Bakri Id",
  "2026-06-26": "Moharram", "2026-09-14": "Ganesh Chaturthi", "2026-10-02": "Gandhi Jayanti", "2026-10-20": "Dussehra",
  "2026-11-10": "Diwali Balipratipada", "2026-11-24": "Guru Nanak Jayanti", "2026-12-25": "Christmas",
};
export const istDate = (ms = Date.now()) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export const isTradingDay = (ms = Date.now()) => {
  const wd = new Date(ms).toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "short" });
  return wd !== "Sat" && wd !== "Sun" && !NSE_HOLIDAYS[istDate(ms)];
};
export function istNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { day: p.weekday, h: +p.hour % 24, m: +p.minute, s: +p.second, text: `${p.hour}:${p.minute}:${p.second}` };
}
export function marketStatus() {
  const t = istNow(), mins = t.h * 60 + t.m;
  if (t.day === "Sat" || t.day === "Sun") return { open: false, label: "CLOSED" };
  const hol = NSE_HOLIDAYS[istDate()];
  if (hol) return { open: false, label: "HOLIDAY", holiday: hol };
  if (mins >= 540 && mins < 555) return { open: true, label: "PRE-OPEN" };
  if (mins >= 555 && mins < 930) return { open: true, label: "OPEN" };
  return { open: false, label: "CLOSED" };
}

export const uid = () => Math.random().toString(36).slice(2, 10);
