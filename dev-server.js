// Zero-dependency local server: serves the static app and runs the /api functions the way Vercel does.
//   node dev-server.js   →   http://localhost:3000

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");

  if (u.pathname.startsWith("/api/")) {
    const name = u.pathname.slice(5).replace(/\.js$/, "");
    const file = path.join(ROOT, "api", name + ".js");
    if (!/^[a-z]+$/.test(name) || !fs.existsSync(file)) { res.writeHead(404); return res.end("Not found"); }
    req.query = Object.fromEntries(u.searchParams);
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
    try { await require(file)(req, res); }
    catch (e) { console.error(e); if (!res.headersSent) res.status(500).json({ error: e.message }); }
    return;
  }

  let rel = decodeURIComponent(u.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT + path.sep) || /[\\/]\./.test(file.slice(ROOT.length))) { res.writeHead(404); return res.end("Not found"); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`Screener running at http://localhost:${PORT}`));
