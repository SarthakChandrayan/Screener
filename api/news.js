// GET /api/news?q=Reliance Industries share
// Headlines from Google News RSS (India edition), with Yahoo Finance search news as a fallback.

const { cached, getJSON, getText, send } = require("./_lib");

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = s => String(s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m)
  .replace(/<[^>]+>/g, "")
  .trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? decode(m[1]) : ""; };

async function google(q) {
  const xml = await getText(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`);
  return (xml.match(/<item>[\s\S]*?<\/item>/g) || []).slice(0, 40).map(it => {
    const source = tag(it, "source");
    let title = tag(it, "title");
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
    return { title, link: tag(it, "link"), source, time: Date.parse(tag(it, "pubDate")) || null };
  }).filter(x => x.title && /^https?:\/\//.test(x.link));
}

async function yahoo(q) {
  const j = await getJSON(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=0&newsCount=20`);
  return (j.news || []).map(n => ({ title: n.title, link: n.link, source: n.publisher, time: n.providerPublishTime ? n.providerPublishTime * 1000 : null }));
}

module.exports = async (req, res) => {
  const q = String(req.query.q || "Sensex Nifty stock market").trim().slice(0, 120);
  try {
    const items = await cached("n:" + q.toLowerCase(), 300e3, async () => {
      let list = [];
      try { list = await google(q); } catch { /* fall through */ }
      if (!list.length) list = await yahoo(q);
      return list.sort((a, b) => (b.time || 0) - (a.time || 0));
    });
    send(res, 200, { items }, 300);
  } catch (e) {
    send(res, 502, { error: e.message });
  }
};
