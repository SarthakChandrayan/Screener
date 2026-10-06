// GET /api/redflags?items=RELIANCE.NS~Reliance Industries|TCS.NS~Tata Consultancy Services (max 10)
// Scans the last 90 days of Google News headlines for each company for serious warning signs that
// numbers show too late: auditor resignations, fraud allegations, raids, SEBI action, defaults,
// invoked pledges, rating downgrades, top-management exits, promoter selling, penalties, probes.
// A headline only counts if it mentions a distinctive word from the company's name.

const { cached, mapLimit, send } = require("./_lib");
const { google } = require("./news");

// [severity (2 serious, 1 caution), label, pattern on the lower-cased headline]
const RULES = [
  [2, "Auditor resigned", /auditors?\b.{0,40}\b(resign|quit|steps? down|exits?)|\b(resign\w*|quits?)\b.{0,30}\bauditors?\b/],
  [2, "Raid or enforcement action", /\b(ed|cbi|income[- ]tax|i-t|dri|sfio)\b.{0,25}\b(raids?|raided|search(es)?|summons|arrest)|\braid(s|ed)?\b/],
  [2, "Fraud or irregularities alleged", /\bfraud|\bscam\b|forensic audit|siphon|money[- ]laundering|accounting (irregular|lapse)|misappropriat|window[- ]dressing/],
  [2, "SEBI action", /\bsebi\b.{0,40}\b(bans?|barred|bars|penalt|show[- ]cause|probe|investigat|attach|impounds?|interim order)/],
  [2, "Default or insolvency", /\bdefault(s|ed)?\b|insolvency|\bnclt\b|bankrupt|\bibc\b/],
  [2, "Pledged shares invoked", /pledg\w*.{0,40}invok|invok\w*.{0,40}pledg/],
  [2, "Credit rating downgrade", /downgrad\w*.{0,40}\b(rating|crisil|icra|care|india ratings|moody|fitch|s&p)|\b(crisil|icra|care ratings|india ratings|moody'?s|fitch|s&p)\b.{0,40}downgrad/],
  [1, "Top management exit", /\b(ceo|cfo|md|managing director|chairman|chief financial officer|chief executive)\b.{0,40}\b(resign\w*|quits?|steps? down)/],
  [1, "Promoter selling or pledging", /promoters?\b.{0,40}\b(sells?|sold|offload\w*|stake sale|pledg\w*|trims? stake)|block deal/],
  [1, "Penalty or fine", /\b(penalty|penalised|penalized|fined)\b/],
  [1, "Under investigation", /\b(probe|investigation|investigating|show[- ]cause notice)\b/],
  [1, "Tax demand", /\b(tax|gst) (demand|notice)/],
];
const KEYWORDS = "(fraud OR SEBI OR auditor OR raid OR pledge OR default OR downgrade OR resigns OR resignation OR probe OR insolvency OR penalty OR \"block deal\" OR \"tax demand\")";
// Group names shared by many listed companies: never enough on their own to tie a headline to one company
const GROUP = new Set(["tata", "adani", "bajaj", "reliance", "mahindra", "birla", "aditya", "jsw", "jindal", "godrej", "hdfc", "icici", "sbi", "lic", "hindustan", "bharat", "national", "state", "larsen", "l&t", "torrent", "zydus", "hero", "max", "muthoot", "shriram", "kotak", "axis"]);
const STOP = new Set(["ltd", "limited", "india", "indian", "the", "of", "and", "&", "bank", "industries", "corp", "corporation", "company", "co", "services", "finance", "financial", "motors", "(india)", "group", "holdings", "international", "enterprises", "technologies", "energy", "power", "life", "insurance", "general"]);

async function scan(sym, name) {
  return cached("rf:" + sym, 6 * 3600e3, async () => {
    const tokens = name.toLowerCase().replace(/[()]/g, " ").split(/\s+/).filter(t => t.length > 2 && !STOP.has(t));
    const distinct = tokens.filter(t => !GROUP.has(t));
    const short = sym.replace(/\.(NS|BO)$/, "").toLowerCase();
    // the ticker as a word counts too, unless it is itself a group name (RELIANCE would match Reliance Power)
    const tickerRe = short.length >= 3 && !GROUP.has(short) ? new RegExp(`\\b${short.replace(/[&\-]/g, m => "\\" + m)}\\b`) : null;
    const phrase = name.toLowerCase().replace(/\s*\(.*?\)/g, "").replace(/\b(ltd|limited)\.?$/, "").trim().split(/\s+/).slice(0, 2).join(" ");
    // About this company? The first two words of its name plus a distinctive one ("Tata Steel" needs both, so JSW Steel news doesn't count),
    // or for names made only of a group word plus a generic one (HDFC Bank, Reliance Industries) the exact phrase.
    const lead = phrase.split(" ").filter(w => w.length > 1 && w !== "&"); // first two words of the name
    const about = t => (tickerRe && tickerRe.test(t)) || (distinct.length ? lead.every(w => t.includes(w)) && distinct.some(w => t.includes(w)) : t.includes(phrase));
    const items = await google(`"${name.replace(/\s*\(.*\)/, "")}" ${KEYWORDS} when:90d`);
    const found = [];
    for (const it of items) {
      const t = it.title.toLowerCase();
      if (!about(t)) continue; // not about this company
      if (it.time && Date.now() - it.time > 92 * 864e5) continue;
      const rule = RULES.find(([, , re]) => re.test(t));
      if (rule) found.push({ sev: rule[0], cat: rule[1], title: it.title, link: it.link, source: it.source, time: it.time });
    }
    // strongest and most recent first, one headline per category
    const seen = new Set();
    return found.sort((a, b) => b.sev - a.sev || (b.time || 0) - (a.time || 0)).filter(f => !seen.has(f.cat) && seen.add(f.cat)).slice(0, 3);
  });
}

module.exports = async (req, res) => {
  const items = String(req.query.items || "").split("|").map(x => x.split("~")).filter(([s, n]) => /^[A-Z0-9&\-_.]{1,30}$/.test(s || "") && n && n.length < 80).slice(0, 10);
  if (!items.length) return send(res, 400, { error: "Pass items=SYMBOL~Company name|..." });
  const out = {};
  let ok = 0;
  await mapLimit(items, 4, async ([s, n]) => { try { out[s] = await scan(s, n); ok++; } catch { /* leave missing */ } });
  if (!ok) return send(res, 502, { error: "News search unavailable right now" });
  send(res, 200, { data: out }, ok === items.length ? 21600 : 300);
};
