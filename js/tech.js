// Technical indicators computed in the browser from close prices.

export function sma(a, n) {
  const out = Array(a.length).fill(null);
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i];
    if (i >= n) s -= a[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

export function ema(a, n) {
  const out = Array(a.length).fill(null), k = 2 / (n + 1);
  let e = null;
  for (let i = n - 1; i < a.length; i++) {
    e = e == null ? a.slice(0, n).reduce((x, y) => x + y, 0) / n : a[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

// Wilder's RSI
export function rsi(c, n = 14) {
  const out = Array(c.length).fill(null);
  if (c.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

export function bollinger(c, n = 20, k = 2) {
  const mid = sma(c, n), up = Array(c.length).fill(null), lo = Array(c.length).fill(null);
  for (let i = n - 1; i < c.length; i++) {
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) v += (c[j] - mid[i]) ** 2;
    const sd = Math.sqrt(v / n);
    up[i] = mid[i] + k * sd; lo[i] = mid[i] - k * sd;
  }
  return { mid, up, lo };
}

export function macd(c, f = 12, s = 26, sig = 9) {
  const a = ema(c, f), b = ema(c, s);
  const line = c.map((_, i) => (a[i] != null && b[i] != null ? a[i] - b[i] : null));
  const start = line.findIndex(v => v != null);
  const sigLine = Array(c.length).fill(null);
  if (start >= 0) ema(line.slice(start), sig).forEach((v, i) => { sigLine[start + i] = v; });
  return { line, signal: sigLine };
}

const last = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; };

// Summary stats from ~1 year of daily closes ({t, c, v} from /api/chart?range=1y)
export function techSummary(d) {
  const c = d.c || [], v = d.v || [];
  if (c.length < 20) return null;
  const px = c[c.length - 1];
  const ret = n => (c.length > n ? (px / c[c.length - 1 - n] - 1) * 100 : null);
  const s20 = last(sma(c, 20)), s50 = last(sma(c, 50)), s200 = last(sma(c, 200));
  const vol20 = v.slice(-21, -1).reduce((x, y) => x + y, 0) / Math.max(1, Math.min(20, v.length - 1));
  const yr = new Date().getFullYear();
  const ytdIdx = (d.t || []).findIndex(t => new Date(t * 1000).getFullYear() === yr);
  const m = macd(c);
  // daily returns → annualised volatility
  const rets = c.slice(1).map((x, i) => Math.log(x / c[i]));
  const mean = rets.reduce((x, y) => x + y, 0) / (rets.length || 1);
  const vol = Math.sqrt(rets.reduce((x, y) => x + (y - mean) ** 2, 0) / (rets.length || 1)) * Math.sqrt(252) * 100;
  return {
    px,
    r1w: ret(5), r1m: ret(21), r3m: ret(63), r6m: ret(126),
    r1y: c.length >= 240 ? (px / c[0] - 1) * 100 : null,
    ytd: ytdIdx > 0 ? (px / c[ytdIdx - 1] - 1) * 100 : null,
    rsi: last(rsi(c)),
    sma20: s20, sma50: s50, sma200: s200,
    vsSma50: s50 ? (px / s50 - 1) * 100 : null,
    vsSma200: s200 ? (px / s200 - 1) * 100 : null,
    macd: last(m.line), macdSignal: last(m.signal),
    volRatio: vol20 ? v[v.length - 1] / vol20 : null,
    volatility: vol,
    hi: Math.max(...c), lo: Math.min(...c),
  };
}
