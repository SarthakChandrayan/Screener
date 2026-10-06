// GET /api/warm: run by Vercel Cron every weekday morning (see vercel.json) to pre-fill the CDN cache for
// /api/scan, so the Buy plan opens instantly for the first visitor of the day too.
// Uses the same stock order and batch size as the browser (js/universes.js, 25 per batch).
// If CRON_SECRET is set in Vercel, only Vercel's scheduler (which sends it) can trigger this.

const { send, mapLimit } = require("./_lib");

const CHUNK = 25;

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return send(res, 401, { error: "Unauthorized" });
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || req.headers.host;
  const base = (/^localhost|^127\./.test(host) ? "http://" : "https://") + host;
  try {
    const src = await (await fetch(base + "/js/universes.js")).text();
    // stock lines look like "RELIANCE|Reliance Industries|Energy" (Nifty 50, Next 50, then midcaps)
    const syms = [...src.matchAll(/^([A-Z0-9&\-]+)\|[^|\n]+\|[^|\n]+$/gm)].map(m => m[1] + ".NS");
    const chunks = [];
    for (let i = 0; i < syms.length; i += CHUNK) chunks.push(syms.slice(i, i + CHUNK));
    let warmed = 0;
    await mapLimit(chunks, 4, async c => {
      const r = await fetch(base + "/api/scan?s=" + encodeURIComponent(c.join(","))).catch(() => null);
      if (r?.ok) warmed++;
    });
    send(res, 200, { stocks: syms.length, batches: chunks.length, warmed });
  } catch (e) {
    send(res, 502, { error: e.message });
  }
};
