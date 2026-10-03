Bahi Terminal — a Bloomberg-style market terminal for Indian investors

A keyboard-driven terminal for NSE/BSE: live market monitor, security pages with charts and fundamentals, a screener, watchlist, portfolio tracker, movers, sector heatmap, news and price alerts. It's a static site plus a few serverless functions, with no build step and no dependencies.

## Using it

Type into the command line at the top (or just start typing anywhere) and press Enter.

| Command | What it does |
|---|---|
| `RELIANCE` | Security overview (DES): quote, chart, valuation, profitability, analysts, technicals, profile, news |
| `TCS GP` | Full-screen chart: candles/line/area, 1D–MAX, SMA 20/50/200, EMA 20, Bollinger bands, volume |
| `INFY N` | News for a stock |
| `COMP TCS INFY WIPRO` | Relative performance vs Nifty 50, with volatility and max drawdown |
| `TOP` | Dashboard: Indian and global indices, FX/commodities, Nifty movers, sector bars, headlines |
| `WEI` | World indices, currencies, commodities, rates, crypto |
| `W` | Watchlist with intraday sparklines and 52-week range |
| `PORT` | Portfolio: live P&L, day P&L, weights, sector allocation, STCG/LTCG estimate, broker CSV import |
| `EQS` | Screener over Nifty 50 / Next 50 / 100, your watchlist, portfolio, a custom list, or an uploaded CSV |
| `MOST` | Gainers, losers, most active by turnover, near 52-week highs/lows, market breadth |
| `HEAT` | Sector heatmap, sized by market cap |
| `ALRT` | Price alerts, with sound and desktop notifications |
| `HELP` | Function directory |

NSE is the default exchange. Use a 6-digit code for BSE (`500325`), or Yahoo-style symbols for anything else (`^NSEI`, `INR=X`, `GC=F`, `BTC-USD`, `AAPL`).

The screener has 12 built-in screens (quality, value, dividend, GARP, momentum, oversold, near 52W high, volume spike, analyst upside…). It also lets you build your own filters over about 35 fields (P/E, P/B, ROE, D/E, margins, growth, returns, RSI, distance from 200 DMA…), save screens, pick columns and export to CSV.

Your watchlist, portfolio, alerts and saved screens are stored in your browser's localStorage. Portfolio data from the earlier version of this app carries over.

## Where the data comes from

| Endpoint | Source | Cached |
|---|---|---|
| `api/quote.js` | Yahoo Finance chart API: price, change, day range, volume, 52W, intraday sparkline | 15 s |
| `api/chart.js` | Yahoo Finance OHLCV history | 30 s intraday, 30 min daily |
| `api/fundamentals.js` | Yahoo Finance quoteSummary: valuation, margins, ROE, debt, analysts, profile | 6 h (plus 12 h in the browser) |
| `api/search.js` | Yahoo Finance symbol search | 1 h |
| `api/news.js` | Google News RSS (India edition), with Yahoo as fallback | 5 min |

These are free, unofficial sources. Prices lag by a few seconds up to about 15 minutes, and the sources can change or rate-limit without notice. That's fine for research and tracking, but not for trade execution.

### Want real-time prices?

Swap `fetchOne` in `api/quote.js` (and the history fetch in `api/chart.js`) for a broker API. Keep the key in a Vercel environment variable, never in the frontend. Cheap options in India (check current pricing):

- **Upstox API**: free for account holders. Use the read-only *Analytics Token* for Market Quote, Historical Data and the WebSocket feed.
- **Angel One SmartAPI** and **Fyers API**: free with an account.
- **Dhan**: real-time data plan at around ₹499/month.
- **Zerodha Kite Connect**: about ₹500/month for market data.

Index constituents live in `js/universes.js`. NSE reshuffles them twice a year, so edit that list when they change.

## Deploy (free) on Vercel

1. Push this repo to GitHub.
2. On vercel.com: **Add New → Project**, then import the repo. No build settings are needed.
3. Click **Deploy**. Every push redeploys.

GitHub Pages alone won't work, because it can't run the `api/` functions.

## Run locally

```bash
npm run dev        # zero-dependency server at http://localhost:3000
```

(`vercel dev` works too.)

## Project layout

```
index.html            terminal shell
css/terminal.css      styles
js/main.js            command line, routing, ticker tape, quote poller
js/views/*.js         one module per function (TOP, DES, EQS, PORT…)
js/chart.js           TradingView Lightweight Charts wrapper
js/tech.js            SMA/EMA/RSI/MACD/Bollinger + summary stats
js/universes.js       Nifty 50 / Next 50 lists, market symbols
api/*.js              serverless data proxies
dev-server.js         local server that mimics Vercel
```

Charts use [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/) (Apache 2.0). Not investment or tax advice.
