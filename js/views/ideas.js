// IDEAS — ranks a list of stocks by a plain-English scorecard and explains each pick:
// why it scores well, and what to watch out for. A starting shortlist for research, not a buy list.

import { $, esc, fmt, cls, short, store, toast } from "../util.js";
import { universe, addWatch, inWatch } from "../state.js";
import { scanSymbols, stockRow, peerContext } from "../scan.js";
import { PILLARS, STYLES, scoreRow, verdict, scoreBar } from "../score.js";
import { dataCheck, dataBadge } from "../dataqual.js";
import { panel, universeSelect, sortTable, nextSort, href } from "./common.js";

const SHOWN = PILLARS.filter(([k]) => k !== "income");

export function mount(el) {
  let uni = store.get("bahi-ideas-uni", "N100");
  let style = STYLES.find(s => s.k === store.get("bahi-ideas-style", "balanced")) || STYLES[0];
  let hideRisky = store.get("bahi-ideas-hide", true);
  let sort = { k: "score", dir: -1 };
  let scanned = false;

  el.innerHTML = `<div class="grid">
    ${panel("Find ideas", `
      <p class="pad prose">Scores every stock out of 100 on quality, value, growth, momentum and safety, then explains each pick in plain English. <button class="ib sym" id="howBtn">How it works ↓</button></p>
      <div class="row-form">
        ${universeSelect(uni)}
        <button class="btn amber" id="run">Find ideas</button>
        <label class="chk"><input type="checkbox" id="hide" ${hideRisky ? "checked" : ""}> Hide stocks with serious red flags</label>
        <span id="state" class="muted"></span>
      </div>
      <div class="styles" id="styles" role="radiogroup" aria-label="Investing style">${STYLES.map(s => `
        <button class="preset ${s === style ? "on" : ""}" role="radio" aria-checked="${s === style}" data-s="${s.k}"><b>${esc(s.name)}</b><span>${esc(s.desc)}</span></button>`).join("")}
      </div>`, { cls: "c12" })}
    ${panel(`Top ideas <span id="topNote" class="muted"></span>`, `<div id="cards" class="ideas"><p class="muted pad">Press <b>Find ideas</b> to score the list. The first run takes about a minute for 100 stocks; after that it's cached.</p></div>`, { cls: "c12" })}
    ${panel(`Full ranking <span id="count" class="muted"></span>`, `<div class="tbl tall" id="table"></div>`, { cls: "c12" })}
    ${panel("Stock ideas · how it works", `<div class="pad prose ideas-intro">
      <p>Pick a list of stocks and an investing style, then press <b>Find ideas</b>. Every stock gets a score out of 100 built from five simple questions:</p>
      <ul class="pillars">${PILLARS.map(([, l, d]) => `<li><b>${l}</b> — ${esc(d)}</li>`).join("")}</ul>
      <p>The top of the list is what looks best <i>on paper, today</i>. Each pick says <span class="up">why</span> it ranks well and <span class="dn">what to watch out for</span>.
      Treat it as a shortlist of companies worth reading about — no screen can tell you a stock is a sure thing, and these numbers can't see management, competition or the news.</p>
    </div>`, { cls: "c12", id: "how" })}
    ${panel("Found something? Do this next", `<ol class="pad prose steps">
      <li><b>Open the stock</b> (click its name). Read the company profile — can you explain in one sentence how it makes money?</li>
      <li><b>Check the red flags</b> and the news. A big fall or volume spike usually has a reason.</li>
      <li><b>Compare with peers</b>: type <code>COMP</code> and two or three similar companies, e.g. <code>COMP TCS INFY WIPRO</code>.</li>
      <li><b>Look at the chart</b> over 1–5 years (<code>GP</code>). Is it a steady climber or a rollercoaster?</li>
      <li><b>Add it to your watchlist</b> and follow it for a few weeks before putting money in. Set a price alert for a level you'd be happy to buy at.</li>
      <li><b>Don't put everything in one stock.</b> Spread across 8–15 companies in different sectors, or use an index fund for the core of your money.</li>
    </ol>`, { cls: "c6" })}
    ${panel("How to read the score", `<div class="pad prose">
      <p><span class="up">70+ Strong candidate</span> — scores well on most of what this style cares about.<br>
      <span class="v-ok">55–69 Worth a look</span> — good in places, average in others.<br>
      <span class="v-mid">40–54 Mixed</span> — some real weaknesses.<br>
      <span class="dn">Below 40 Weak right now</span> — the numbers don't support it today.</p>
      <p><b>How each number is judged:</b> against rules of thumb <i>and</i> against its peers. Valuation and margins are compared with the same sector (a P/E of 40 is normal for FMCG but expensive for a bank); everything else is compared with all the stocks loaded. Three to four years of annual results count for more than the latest year, so one lucky or unlucky year can't decide the score. Share-price momentum is divided by how jumpy the stock is, as NSE's own momentum indices do, so steady climbers beat lottery tickets.</p>
      <p><b>Confidence</b> shows how much evidence a score rests on: <span class="conf conf-high">High</span> means most numbers plus several years of history; <span class="conf conf-low">Low</span> means too much is missing to trust it (the Buy plan never uses Low-confidence stocks).</p>
      <p class="muted">Each serious red flag (losses in several years, heavy debt, profits that don't turn into cash, collapsing profits) takes 8 points off; minor ones take 3; information-only notes (results coming up, unusual volume) take nothing. Banks and finance companies aren't judged on debt or operating margin, since borrowing is their business. Data comes from Yahoo Finance and can be missing or out of date — always check the company's own results.</p>
    </div>`, { cls: "c6" })}
  </div>`;

  function scored() {
    const rows = universe(uni).map(stockRow), ctx = peerContext(rows);
    return rows.map(r => ({ ...r, ...scoreRow(r, style, ctx) }));
  }

  function card(r, i) {
    const v = verdict(r.score), w = inWatch(r.sym);
    return `<article class="idea">
      <header>
        <span class="rank">#${i + 1}</span>
        <div class="who"><a class="sym" href="${href("DES", r.sym)}">${esc(short(r.sym))}</a><span class="sub">${esc(r.name)} · ${esc(r.sector)}</span></div>
        <div class="big ${v.c}" title="${esc(v.label)}">${r.score}<small>/100</small></div>
      </header>
      <div class="verdict ${v.c}">${esc(v.label)} <span class="conf conf-${r.confidence.toLowerCase()}" title="How much evidence the score is based on${r.nYrs ? ` (includes ${r.nYrs} years of annual results)` : " (no multi-year history available)"}">${r.confidence} confidence</span> <span class="muted">· ${fmt.px(r.price)} <span class="${cls(r.chgPct)}">${fmt.pct(r.chgPct)}</span></span> ${dataBadge(dataCheck(r))}</div>
      <dl class="pbars">${SHOWN.map(([k, l]) => `<dt>${l}</dt><dd>${scoreBar(r.pillars[k], 90)}<span>${r.pillars[k] ?? "—"}</span></dd>`).join("")}</dl>
      ${r.reasons.length ? `<p class="why-h up">Why it's here</p><ul class="why">${r.reasons.slice(0, 3).map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      ${r.flags.length ? `<p class="why-h dn">Watch out</p><ul class="why flags">${r.flags.slice(0, 3).map(f => `<li class="${f.sev === 2 ? "sev" : ""}">${esc(f.text)}</li>`).join("")}</ul>` : `<p class="why-h muted">No red flags in the numbers</p>`}
      <footer><a class="btn" href="${href("DES", r.sym)}">Research ›</a><button class="btn" data-w="${esc(r.sym)}" ${w ? "disabled" : ""}>${w ? "★ Watching" : "☆ Watch"}</button></footer>
    </article>`;
  }

  function render() {
    if (!scanned) return;
    const all = scored();
    const rows = all.filter(r => !(hideRisky && r.flags.some(f => f.sev === 2)));
    const ranked = rows.filter(r => r.score != null).sort((a, b) => b.score - a.score);
    const hidden = all.length - rows.length, nodata = rows.length - ranked.length;
    $("#topNote", el).textContent = `· ${style.name}${hidden ? ` · ${hidden} hidden for red flags` : ""}`;
    $("#cards", el).innerHTML = ranked.length ? ranked.slice(0, 9).map(card).join("") : `<p class="muted pad">No scores yet — the data may still be loading.</p>`;
    $("#count", el).textContent = `${ranked.length} scored${nodata ? ` · ${nodata} without enough data` : ""}`;
    const rank = new Map(ranked.map((r, i) => [r.sym, i + 1]));
    const cols = [
      { k: "rank", l: "#", v: r => rank.get(r.sym), f: r => rank.get(r.sym) ?? "—" },
      { k: "sym", l: "Ticker", n: false, v: r => r.sym, f: r => `<a class="sym" href="${href("DES", r.sym)}">${esc(short(r.sym))}</a>` },
      { k: "name", l: "Name", n: false, v: r => r.name, f: r => esc(r.name) },
      { k: "sector", l: "Sector", n: false, v: r => r.sector, f: r => esc(r.sector) },
      { k: "score", l: "Score", v: r => r.score, f: r => (r.score == null ? `<span class="muted">—</span>` : `<b class="${verdict(r.score).c}">${r.score}</b>`) },
      { k: "verdict", l: "Verdict", n: false, v: r => r.score, f: r => { const v = verdict(r.score); return `<span class="${v.c}">${v.label}</span>`; } },
      ...SHOWN.map(([k, l]) => ({ k, l, v: r => r.pillars[k], f: r => scoreBar(r.pillars[k], 50) })),
      { k: "flags", l: "Watch out", n: false, v: r => r.flags.length, f: r => (r.flags.length ? `<span class="${r.flags.some(f => f.sev === 2) ? "dn" : "v-mid"}" title="${esc(r.flags.map(f => f.text).join("\n"))}">${esc(r.flags[0].text)}${r.flags.length > 1 ? ` +${r.flags.length - 1}` : ""}</span>` : `<span class="muted">—</span>`) },
    ];
    $("#table", el).innerHTML = sortTable(cols, rows, sort, { empty: "Nothing to rank." });
  }

  let seq = 0;
  async function run(fresh) {
    const my = ++seq, syms = universe(uni);
    const say = t => { if (my === seq) $("#state", el).textContent = t; };
    if (!syms.length) { say(uni === "CUSTOM" ? "Add tickers to your custom list in EQS first." : "This list is empty."); return; }
    scanned = true;
    const partial = () => { if (my === seq) render(); };
    await scanSymbols(syms, { say, partial, alive: () => my === seq, fresh });
    partial();
  }

  $("#uni", el).onchange = e => { uni = e.target.value; store.set("bahi-ideas-uni", uni); if (scanned) run(false); };
  $("#run", el).onclick = () => run(scanned);
  $("#howBtn", el).onclick = () => $("#how", el).scrollIntoView({ behavior: "smooth" });
  $("#hide", el).onchange = e => { hideRisky = e.target.checked; store.set("bahi-ideas-hide", hideRisky); render(); };
  $("#styles", el).addEventListener("click", e => {
    const b = e.target.closest("[data-s]");
    if (!b) return;
    style = STYLES.find(s => s.k === b.dataset.s);
    store.set("bahi-ideas-style", style.k);
    el.querySelectorAll("#styles .preset").forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); });
    render();
  });
  $("#table", el).addEventListener("click", e => {
    const th = e.target.closest("th[data-sort]");
    if (!th) return;
    sort = nextSort(sort, th.dataset.sort, !["sym", "name", "sector"].includes(th.dataset.sort)); render();
  });
  $("#cards", el).addEventListener("click", e => {
    const b = e.target.closest("[data-w]");
    if (!b) return;
    if (addWatch(b.dataset.w)) toast(`Added ${short(b.dataset.w)} to watchlist`);
    b.textContent = "★ Watching"; b.disabled = true;
  });

  // Fundamentals are cached for 12 hours, so returning visitors see results straight away
  if (store.get("bahi-ideas-ran", false)) run(false);
  $("#run", el).addEventListener("click", () => store.set("bahi-ideas-ran", true));

  return {
    title: "Stock ideas",
    syms: () => (scanned ? universe(uni) : []),
    onQuotes: render,
    unmount: () => { seq++; },
  };
}
