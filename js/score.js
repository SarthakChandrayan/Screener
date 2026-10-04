// Stock scorecard: turns a screener row into five 0–100 pillar scores (quality, value, growth,
// momentum, safety, plus income for dividend hunters), an overall score for an investing style,
// and plain-English reasons and red flags. Thresholds are fixed rules of thumb for Indian large and
// mid caps, so a single stock can be scored on its own. Banks and NBFCs skip margin and debt checks.

const ok = Number.isFinite;
const clamp = v => Math.max(0, Math.min(100, v));
// 0 at `bad`, 100 at `good`, linear in between (works either direction)
const ramp = (v, bad, good) => clamp((v - bad) / (good - bad) * 100);
const p1 = v => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)).replace(/\.0$/, "");

export const PILLARS = [
  ["quality", "Quality", "Does the business make good money? (ROE, margins)"],
  ["value", "Value", "Is the price reasonable for what you get? (P/E, P/B, EV/EBITDA, PEG)"],
  ["growth", "Growth", "Are sales and profits rising? (YoY revenue and earnings)"],
  ["momentum", "Momentum", "Is the share price in an uptrend? (6M/1Y returns, 200-day average)"],
  ["safety", "Safety", "How risky is it? (debt, liquidity, volatility, beta)"],
  ["income", "Income", "Does it pay you to hold it? (dividend yield)"],
];

export const STYLES = [
  { k: "balanced", name: "Balanced", desc: "A bit of everything — good default", w: { quality: 30, value: 20, growth: 20, momentum: 15, safety: 15 } },
  { k: "quality", name: "Long-term quality", desc: "Great businesses to hold for years", w: { quality: 40, value: 15, growth: 20, momentum: 5, safety: 20 } },
  { k: "value", name: "Value", desc: "Decent companies at cheap prices", w: { quality: 20, value: 45, growth: 10, momentum: 5, safety: 20 } },
  { k: "growth", name: "Growth", desc: "Fast-growing sales and profits", w: { quality: 20, value: 10, growth: 45, momentum: 15, safety: 10 } },
  { k: "momentum", name: "Momentum", desc: "Stocks already rising strongly", w: { quality: 10, value: 5, growth: 15, momentum: 60, safety: 10 } },
  { k: "income", name: "Dividend & safety", desc: "Steady payers with low risk", w: { quality: 20, value: 15, growth: 5, momentum: 5, safety: 25, income: 30 } },
];

export const isFinancial = r => /bank|financ|insur/i.test(r.sector || "");

// Each check: pillar, field, scorer(value, row) → 0–100 or null to skip, and a sentence for the "why" list.
const CHECKS = [
  ["quality", "roe", v => ramp(v, 5, 22), v => `ROE ${p1(v)}% — makes ₹${p1(v)} a year on every ₹100 of shareholders' money`],
  ["quality", "opm", (v, r) => (isFinancial(r) ? null : ramp(v, 5, 25)), v => `Operating margin ${p1(v)}% — keeps ₹${p1(v)} of every ₹100 of sales after running costs`],
  ["quality", "npm", v => ramp(v, 2, 18), v => `Net margin ${p1(v)}% — healthy final profit on sales`],
  ["quality", "roa", (v, r) => (isFinancial(r) ? ramp(v, 0.5, 2) : ramp(v, 1, 10)), v => `ROA ${p1(v)}% — earns well on everything it owns`],
  ["value", "pe", v => (v <= 0 ? 0 : ramp(v, 60, 12)), v => `P/E ${p1(v)} — you pay ₹${p1(v)} for each ₹1 of yearly profit, a reasonable price`],
  ["value", "pb", (v, r) => (isFinancial(r) ? ramp(v, 4, 1) : ramp(v, 10, 1.5)), v => `P/B ${p1(v)} — priced close to the value of its assets`],
  ["value", "evEbitda", (v, r) => (isFinancial(r) || v <= 0 ? null : ramp(v, 35, 8)), v => `EV/EBITDA ${p1(v)} — cheap compared with its operating profit`],
  ["value", "peg", v => (v <= 0 ? null : ramp(v, 3, 0.8)), v => `PEG ${p1(v)} — price looks fair for how fast profits are growing`],
  ["growth", "revGrowth", v => ramp(v, -5, 20), v => `Sales up ${p1(v)}% from a year ago`],
  ["growth", "epsGrowth", v => ramp(v, -10, 25), v => `Profit per share up ${p1(v)}% from a year ago`],
  ["momentum", "r6m", v => ramp(v, -15, 30), v => `Share price up ${p1(v)}% in 6 months`],
  ["momentum", "r1y", v => ramp(v, -20, 40), v => `Share price up ${p1(v)}% in a year`],
  ["momentum", "vsSma200", v => ramp(v, -15, 15), v => `Trading ${p1(v)}% above its 200-day average — a long-term uptrend`],
  ["safety", "de", (v, r) => (isFinancial(r) ? null : ramp(v, 2, 0)), v => (v < 0.05 ? "Practically debt-free" : `Low debt (debt/equity ${v.toFixed(2)})`)],
  ["safety", "cr", (v, r) => (isFinancial(r) ? null : ramp(v, 0.8, 2)), v => `Current ratio ${v.toFixed(2)} — can easily pay this year's bills`],
  ["safety", "beta", v => ramp(v, 1.6, 0.7), v => `Beta ${v.toFixed(2)} — swings less than the market`],
  ["safety", "volatility", v => ramp(v, 45, 18), v => `Calm share price (volatility ${p1(v)}% a year)`],
  ["income", "dy", v => ramp(v, 0, 4), v => `Dividend yield ${p1(v)}% — pays you cash every year`],
];

// Things worth checking before you go further. Each: test(row) → message or null. Severity 2 = serious.
const FLAGS = [
  [2, r => (ok(r.npm) && r.npm < 0) || (ok(r.pe) && r.pe < 0) ? "Losing money right now" : null],
  [2, r => !isFinancial(r) && ok(r.de) && r.de > 1.5 ? `Heavy debt (debt/equity ${r.de.toFixed(2)})` : null],
  [2, r => ok(r.epsGrowth) && r.epsGrowth < -20 ? `Profit fell ${p1(-r.epsGrowth)}% from a year ago` : null],
  [1, r => ok(r.revGrowth) && r.revGrowth < 0 ? `Sales shrank ${p1(-r.revGrowth)}%` : null],
  [1, r => ok(r.pe) && r.pe > 70 ? `Very expensive (P/E ${p1(r.pe)}) — needs years of strong growth to justify` : null],
  [1, r => ok(r.vsSma200) && r.vsSma200 < -10 ? `In a downtrend: ${p1(-r.vsSma200)}% below its 200-day average` : null],
  [1, r => ok(r.offHigh) && r.offHigh < -35 ? `Down ${p1(-r.offHigh)}% from its 52-week high — find out why` : null],
  [1, r => ok(r.rsi) && r.rsi > 75 ? `Ran up fast recently (RSI ${p1(r.rsi)}) — may cool off; don't chase` : null],
  [1, r => ok(r.volatility) && r.volatility > 45 ? `Very jumpy price (volatility ${p1(r.volatility)}%)` : null],
  [1, r => ok(r.volRatio) && r.volRatio > 3 ? `Unusual volume today (${r.volRatio.toFixed(1)}× normal) — check the news` : null],
];

export function scoreRow(r, style = STYLES[0]) {
  const per = {}, hits = [];
  for (const [p, k, fn, say] of CHECKS) {
    const v = r[k];
    if (!ok(v)) continue;
    const s = fn(v, r);
    if (s == null) continue;
    (per[p] ||= []).push(s);
    if (s >= 70) hits.push({ p, s, text: say(v) });
  }
  const pillars = {};
  for (const [p] of PILLARS) pillars[p] = per[p]?.length ? Math.round(per[p].reduce((a, b) => a + b, 0) / per[p].length) : null;

  let tot = 0, wsum = 0, wall = 0;
  for (const [p, w] of Object.entries(style.w)) {
    wall += w;
    if (pillars[p] == null) continue;
    tot += pillars[p] * w; wsum += w;
  }
  const coverage = wall ? wsum / wall : 0;
  const flags = FLAGS.map(([sev, t]) => { const m = t(r); return m && { sev, text: m }; }).filter(Boolean).sort((a, b) => b.sev - a.sev);
  // Each serious flag knocks 8 points off, a minor one 3, so a stock with problems can't top the list on averages alone
  const penalty = flags.reduce((a, f) => a + (f.sev === 2 ? 8 : 3), 0);
  const score = coverage >= 0.5 ? Math.max(0, Math.round(tot / wsum - penalty)) : null;
  // Strongest reasons first, weighted by how much this style cares about that pillar
  const reasons = hits.sort((a, b) => b.s * (style.w[b.p] || 0) - a.s * (style.w[a.p] || 0)).filter(h => style.w[h.p]).map(h => h.text);
  return { score, pillars, reasons, flags, coverage };
}

export function verdict(score) {
  if (score == null) return { label: "Not enough data", c: "muted" };
  if (score >= 70) return { label: "Strong candidate", c: "up" };
  if (score >= 55) return { label: "Worth a look", c: "v-ok" };
  if (score >= 40) return { label: "Mixed", c: "v-mid" };
  return { label: "Weak right now", c: "dn" };
}

// Small horizontal bar, coloured red → amber → green
export function scoreBar(v, w = 70) {
  if (v == null) return `<span class="sbar empty" style="width:${w}px" title="No data"></span>`;
  const hue = Math.round(v * 1.2); // 0 red → 120 green
  return `<span class="sbar" style="width:${w}px" title="${v}/100"><i style="width:${v}%;background:hsl(${hue} 70% 45%)"></i></span>`;
}
