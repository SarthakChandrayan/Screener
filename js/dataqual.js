// Data checks: before a stock can be recommended, make sure its numbers are present and make sense.
// Free data sources sometimes miss fields, mix up units, or don't adjust history for stock splits.

import { fmt } from "./util.js";
import { isFinancial } from "./score.js";

const ok = Number.isFinite;
const KEY = [
  ["price", "price"], ["pe", "P/E"], ["roe", "ROE"], ["npm", "net margin"], ["revGrowth", "sales growth"],
  ["epsGrowth", "profit growth"], ["de", "debt/equity"], ["mcapCr", "market cap"], ["r6m", "6-month return"], ["vsSma200", "200-day trend"],
];

export function dataCheck(r) {
  const fin = isFinancial(r);
  const missing = KEY.filter(([k]) => !(fin && k === "de") && !ok(r[k])).map(([, l]) => l);
  const issues = [];
  if (ok(r.pe) && r.pe > 0 && ok(r.eps) && r.eps > 0 && ok(r.price)) {
    const implied = r.price / r.eps;
    if (Math.abs(implied / r.pe - 1) > 0.3) issues.push(`P/E (${r.pe.toFixed(1)}) doesn't match price ÷ earnings (${implied.toFixed(1)})`);
  }
  if (ok(r.price) && ok(r.histPx) && r.histPx > 0 && Math.abs(r.price / r.histPx - 1) > 0.2) {
    issues.push(`Live price and price history disagree by ${fmt.pct((r.price / r.histPx - 1) * 100, 0)} — maybe a stock split the data hasn't caught up with`);
  }
  if (ok(r.roe) && Math.abs(r.roe) > 150) issues.push(`ROE of ${r.roe.toFixed(0)}% isn't believable`);
  if ((ok(r.npm) && r.npm > 100) || (ok(r.opm) && r.opm > 100)) issues.push("A profit margin above 100% isn't possible");
  if (!fin && ok(r.de) && (r.de < 0 || r.de > 50)) issues.push(`Debt/equity of ${r.de.toFixed(1)} looks wrong`);
  if (ok(r.dy) && r.dy > 25) issues.push(`Dividend yield of ${r.dy.toFixed(0)}% looks wrong`);
  if (ok(r.revGrowth) && r.revGrowth > 500) issues.push(`Sales growth of ${r.revGrowth.toFixed(0)}% looks like a data error`);

  const level = issues.length || missing.length >= 3 ? "bad" : missing.length ? "partial" : "good";
  const age = r.fundAt ? Date.now() - r.fundAt : null;
  const ageTxt = age == null ? "company figures not loaded" : `company figures fetched ${age < 3600e3 ? Math.max(1, Math.round(age / 60e3)) + " min" : Math.round(age / 3600e3) + " h"} ago`;
  const detail = [
    level === "good" ? `All ${KEY.length - (fin ? 1 : 0)} key numbers present and consistent` : "",
    missing.length ? `Missing: ${missing.join(", ")}` : "",
    ...issues, ageTxt,
  ].filter(Boolean).join(" · ");
  // Fit to recommend: nothing contradictory and at most one number missing
  return { level, missing, issues, detail, usable: !issues.length && missing.length <= 1 };
}

export function dataBadge(dq) {
  const t = { good: "✓ Data checked", partial: "◐ Some data missing", bad: "✕ Data problem" }[dq.level];
  return `<span class="dq ${dq.level}" title="${dq.detail.replace(/"/g, "&quot;")}">${t}</span>`;
}
