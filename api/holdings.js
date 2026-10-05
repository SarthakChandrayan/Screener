// GET /api/holdings: your Upstox demat holdings, for the portfolio's "Sync from Upstox" button.
// Holdings are personal, and anyone can open a deployed site, so this only answers when the
// APP_PASSWORD environment variable is set and the request sends the same value in X-App-Password.

const crypto = require("crypto");
const upstox = require("./_upstox");
const { send } = require("./_lib");

const same = (a, b) => {
  const x = crypto.createHash("sha256").update(String(a)).digest(), y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const pass = process.env.APP_PASSWORD || "";
  if (!upstox.enabled()) return send(res, 400, { error: "UPSTOX_TOKEN isn't set on the server." });
  if (!pass) return send(res, 403, { error: "Set APP_PASSWORD in your Vercel environment variables to turn on holdings sync." });
  if (!same(req.headers["x-app-password"] || "", pass)) return send(res, 401, { error: "Wrong app password." });
  try {
    send(res, 200, { holdings: await upstox.holdings() });
  } catch (e) {
    send(res, e.status === 401 ? 401 : 502, { error: e.status === 401 ? "Upstox rejected the token — it may have expired. Generate a new one." : "Upstox holdings unavailable: " + e.message });
  }
};
