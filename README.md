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
| `PICKS` | **Start here.** Manager's picks: enter an amount and a risk level and get a ready buy plan (which stocks, ₹ and shares in each, when to buy, why, main risk, when to re-check) |
| `TOP` | Dashboard: Indian and global indices, FX/commodities, Nifty movers, sector bars, headlines |
| `WEI` | World indices, currencies, commodities, rates, crypto |
| `W` | Watchlist with intraday sparklines and 52-week range |
| `PORT` | Portfolio: live P&L, day P&L, weights, sector allocation, STCG/LTCG estimate, broker CSV import |
| `IDEAS` | Stock ideas: scores a list out of 100 for your investing style and explains each pick (why it ranks, what to watch out for) |
| `EQS` | Screener over Nifty 50 / Next 50 / 100, your watchlist, portfolio, a custom list, or an uploaded CSV |
| `MOST` | Gainers, losers, most active by turnover, near 52-week highs/lows, market breadth |
| `HEAT` | Sector heatmap, sized by market cap |
| `ALRT` | Price alerts, with sound and desktop notifications |
| `HELP` | Function directory |

NSE is the default exchange. Use a 6-digit code for BSE (`500325`), or Yahoo-style symbols for anything else (`^NSEI`, `INR=X`, `GC=F`, `BTC-USD`, `AAPL`).

The screener has 12 built-in screens (quality, value, dividend, GARP, momentum, oversold, near 52W high, volume spike, analyst upside…). It also lets you build your own filters over about 35 fields (P/E, P/B, ROE, D/E, margins, growth, returns, RSI, distance from 200 DMA…), save screens, pick columns and export to CSV.

### Manager's picks (`PICKS`, the home page)

Enter how much you want to invest and choose Safe, Balanced or Aggressive. The page then writes a short "manager's note":

- **Market mood**: whether the Nifty 50 is above or below its 50- and 200-day averages. This sets how many parts to split your buying into, and how much cash to keep for dips (5–20%).
- **Allocation**: how much goes into stocks, a Nifty 50 index ETF as a safe core (30% on Safe, 20% on Balanced, none on Aggressive), and cash.
- **Buy list**: 8–10 stocks from the Nifty 100, at most 2 per sector. Stocks with serious red flags, too much volatility, or too big a fall from their high are left out. Each stock shows:
  - ₹ amount and number of shares, sized by score and capped per stock
  - when to buy: buy now, buy slowly, or wait for a dip
  - why it was picked, and its main risk
  - a price to re-check at, and the analyst target if there is one
- **Avoid for now**: big names with serious red flags.

You can download the plan as a CSV. The rules are in `js/views/picks.js` and `js/score.js`. They're rules applied to public data, not personal advice from a registered adviser.

### Finding stock ideas

New to screening? Start with `IDEAS`. Pick a list (Nifty 50 / Next 50 / 100, your watchlist or a custom list) and a style: Balanced, Long-term quality, Value, Growth, Momentum, or Dividend & safety. Every stock gets 0–100 scores on five questions:

- **Quality**: does the business make good money? (ROE, margins)
- **Value**: is the price reasonable? (P/E, P/B, EV/EBITDA, PEG)
- **Growth**: are sales and profits rising?
- **Momentum**: is the share price in an uptrend?
- **Safety**: debt, liquidity, volatility, beta

There's also an **Income** score (dividend yield), which only the Dividend & safety style uses.

The style decides how much each one counts. Red flags (losses, heavy debt, collapsing profits, steep falls, overheated RSI) take points off and are listed in plain English. By default, stocks with serious flags are hidden. Banks and NBFCs aren't judged on debt or operating margin. The rules live in `js/score.js`.

Every security page (`DES`) shows the same scorecard. The screener has a **Score** column and a "Top scorers" screen. Hover any column or label to see what it means; `HELP` has a getting-started guide and a full glossary.

The score is a quick read of public numbers, not a recommendation. It's a shortlist to research, not a list of sure things.

Your watchlist, portfolio, alerts and saved screens are stored in your browser's localStorage. Portfolio data from the earlier version of this app carries over.

## Where the data comes from

| Endpoint | Source | Cached |
|---|---|---|
| `api/quote.js` | Upstox (if configured), else Yahoo Finance chart API: price, change, day range, volume, 52W, intraday sparkline | 15 s |
| `api/chart.js` | Upstox daily+ history (if configured), else Yahoo Finance OHLCV | 30 s intraday, 30 min daily |
| `api/fundamentals.js` | Yahoo Finance quoteSummary: valuation, margins, ROE, debt, analysts, profile | 6 h (plus 12 h in the browser) |
| `api/search.js` | Yahoo Finance symbol search | 1 h |
| `api/news.js` | Google News RSS (India edition), with Yahoo as fallback | 5 min |

Without an Upstox token these are free, unofficial sources. Prices lag by a few seconds up to about 15 minutes, and the sources can change or rate-limit without notice. That's fine for research and tracking, but not for trade execution.

### Real-time prices with Upstox (free)

Set `UPSTOX_TOKEN` and the terminal switches to live NSE/BSE prices. The status bar then reads **UPSTOX LIVE**.

1. Open an Upstox account if you don't have one. In the [Upstox developer console](https://upstox.com/developer/apps), generate an **Analytics Token**. It's a read-only market-data token, so it can't place orders.
2. In Vercel, go to your project → **Settings → Environment Variables**. Add `UPSTOX_TOKEN` with the token as its value, then redeploy. Locally, run `UPSTOX_TOKEN=... npm run dev`.

What uses Upstox (`api/_upstox.js`):

- **Quotes**: Full Market Quotes V3, for NSE/BSE stocks and the main NSE indices, India VIX and Sensex.
- **Charts**: Historical Candle Data V3, for daily, weekly and monthly charts and the screener's technicals.
- **Ticker lookup**: Instrument Search maps `RELIANCE` → `NSE_EQ|INE002A01018`, cached for a day.

Yahoo is still used for:

- Intraday charts
- Global indices, FX, commodities and crypto
- BSE scrip codes
- Fundamentals and news
- Anything Upstox can't find

If the token is missing, expired or rejected, the app quietly falls back to Yahoo, and the status bar shows the Upstox error in amber. Watchlist sparklines only appear for Yahoo-priced symbols.

The token is only read on the server, so it never reaches the browser. Never commit it to the repo.

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
js/scan.js            loads quotes + fundamentals + technicals into one row per stock
js/score.js           scorecard rules: pillars, styles, reasons, red flags
js/glossary.js        plain-English meaning of every metric
js/universes.js       Nifty 50 / Next 50 lists, market symbols
api/*.js              serverless data proxies
dev-server.js         local server that mimics Vercel
```

Charts use [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/) (Apache 2.0). Not investment or tax advice.
