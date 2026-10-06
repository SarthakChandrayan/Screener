Screener — stock ideas, buy plans and a market terminal for Indian investors

A keyboard-driven terminal for NSE/BSE: live market monitor, security pages with charts and fundamentals, a screener, watchlist, portfolio tracker, movers, sector heatmap, news and price alerts. It's a static site plus a few serverless functions, with no build step and no dependencies.

## Using it

The app opens in a **simple view**: plain tabs for Buy plan, Stock ideas, My portfolio, Watchlist and Market today, with everything else under **More**. Click **Pro view** (top right) for the full terminal with the ticker tape and all function keys.

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

### Paper trading (`PAPER`)

Practise with pretend money (₹10 lakh by default) at live prices. It's delivery trading only: no intraday and no short selling.

- **Orders**:
  - market, limit, and stop-loss
  - on a buy, you can attach a stop-loss and a target; whichever fills first cancels the other
  - orders only fill during NSE hours
- **Realistic fills**:
  - 0.05% slippage on market and stop orders
  - Indian delivery charges on every trade: ₹20 brokerage, 0.1% STT, exchange and SEBI fees, GST, 0.015% stamp duty, and a DP charge when you sell
  - each sale is matched against your oldest shares first
- **While you're away**: open orders are checked against each day's high and low. An order fills at its price, or at the open if the stock gapped past it.
- **Trailing stop-loss**: the stop rises with the price and sells if the price falls a set % from its highest point. You can use it on a sell, or as the protection on a buy. Open orders can be edited.
- **Size by risk**: choose to risk 0.5%, 1% or 2% of your account. The share quantity is worked out from your stop-loss, and the order summary shows the reward/risk ratio and warns when a trade risks too much.
- **Price chart in the order form**: the last 3 months, with your entry, stop-loss and target drawn as lines.
- **Journal**:
  - tag each trade with a reason and your mood (calm, FOMO, revenge…)
  - add a lesson to any closed trade
  - every trade with a stop-loss gets an R-multiple (profit ÷ amount risked)
- **Holdings** show your open risk: how much you'd lose if every stop-loss hit, and which positions have no stop-loss.
- **Test the Buy plan** in one click, using the latest saved plan.
- **Analysis**:
  - your account vs the Nifty 50
  - win rate, average win vs loss, profit factor, average per trade, worst fall from peak, charges paid
  - average R, plus a calendar of daily results for the last 12 weeks
  - results by trade reason, sector and mood
  - plain-English insights such as "you sell winners early and hold losers"

Code lives in `js/paper.js` (engine) and `js/views/paper.js` (page). Data is saved in this browser under its own key.

### How stocks are scored (`js/score.js`)

- **Multi-year history**: `api/fundamentals.js` adds up to 4 years of annual results from Yahoo's fundamentals timeseries:
  - sales and EPS compound growth
  - average ROE
  - how many years were profitable
  - cash conversion (operating cash flow ÷ profit)
  - share dilution and debt trend

  These count for more than the latest year.
- **Peer ranking**: each number is scored 60% on its rank among peers and 40% on a fixed rule of thumb.
  - Valuation and margins are ranked within the same sector; everything else is ranked across all stocks loaded (up to 227).
  - This follows the same idea as NSE's factor indices (Quality 30, Momentum 30, Low Volatility).
- **Momentum** is plain 12-1 momentum: the past year's return, leaving out the latest month. Our 10-year backtest compared it with volatility-adjusted trend, low volatility and a trend filter, and it was the only rule that clearly beat an equal-weight basket (7 of 9 years). Survivorship bias flatters momentum most, so the real-world edge will be smaller.
- **Missing ratios**: when Yahoo omits ROE, ROA, current ratio, free cash flow or growth (common for Indian stocks), they're calculated from TTM EPS ÷ book value per share and from the latest annual report.
- **New red flags**:
  - losses in past years
  - profits that don't turn into cash
  - share dilution
  - rising debt
  - thin trading
  - upcoming quarterly results (for information only)
- **Confidence (High / Medium / Low)** shows how much evidence a score rests on. The Buy plan skips Low-confidence stocks and stocks trading under ₹5 Cr a day. It also says "After results" when a pick's quarterly results are due within 10 days.

### Health checks, news and the backtest

- **Piotroski F-score and Altman Z-score**: built from the annual reports in `api/fundamentals.js`.
  - The F-score runs 9 pass/fail checks on profit, cash flow, debt, liquidity, dilution, margin and efficiency trends. It adds to quality, and a score of 3 or less is flagged.
  - The Altman Z''-score measures distress risk for non-financial companies. Below 1.1 is a serious flag; 1.1–2.6 is noted as the grey zone.
- **News red flags** (`api/redflags.js`): scans the last 90 days of Google News headlines for each shortlisted stock (the Buy plan candidates, the top 20 ideas, and any stock page you open). It looks for:
  - auditor resignations, fraud allegations, raids, SEBI action
  - defaults and insolvency, invoked pledges, rating downgrades
  - top-management exits, promoter selling, penalties, probes, tax demands

  A headline only counts if it names the company. Serious matches keep a stock out of the Buy plan. Results are cached for 6 hours on the CDN and 12 hours in the browser.
- **10-year backtest** (Track record page; `js/backtest.js`, data from `api/history.js`):
  - Replays the share-price part of the method monthly: 12-1 momentum, top 10 stocks, at most 2 per sector, about 0.4% cost on trades.
  - Compares it with the Nifty 50 and with buying every stock in our list equally. That second comparison offsets survivorship bias, since our list only contains today's index members.
  - Company figures can't be backtested with free data.
  - Five price rules are tested side by side on the same stocks, dates and costs: 12-1 momentum (used by the app), the old volatility-adjusted rule, low volatility, momentum among the calmer half, and a 40-week trend filter.
  - **Evidence-weighted Buy plan**: if your backtest shows our price rule didn't beat buying every stock equally, the Buy plan moves 70% of the momentum weight to quality and says so in the manager's note.
- The Buy plan never gives a stock less money than one share costs. Such stocks are replaced by the next eligible one.

### Accuracy: holidays, splits and dividends

- **NSE holidays**: the 2026 holiday list is in `js/util.js` (`NSE_HOLIDAYS`), and the header shows **NSE HOLIDAY** on those days. Add next year's list when NSE publishes it, usually in December. As a second safety net, paper orders never fill on a price whose last trade is more than 30 minutes old.
- **Splits, bonus issues and dividends** (`api/actions.js`, from Yahoo's chart events over the last 2 years):
  - Paper trading adjusts your shares, average price and open orders on the ex-date, and credits dividends for shares you held on the ex-date.
  - The Track record adjusts each plan's saved prices for splits and counts dividends as return. The Nifty gets an estimated 1.2% a year in dividends, so the comparison is fair.
  - Price history from both Upstox and Yahoo is already adjusted for splits and bonus issues, so charts and scores needed no change.

### Fast loading

- **Batch endpoint**: `api/scan.js` returns fundamentals and a year of closes for up to 25 stocks per request. Vercel's CDN caches the result for 6 hours.
- **Shared batches**: the browser always requests the same fixed batches, so every visitor shares the cache.
- **Morning warm-up**: `api/warm.js` runs on Vercel Cron at 8:00 IST on weekdays (see `vercel.json`) and fills the cache before anyone visits. Set `CRON_SECRET` in Vercel to stop anyone else from triggering it.
- **Saved in the browser**: technicals are kept for the rest of the day, so reopening the Buy plan shows it immediately and then refreshes prices.

### Stock universe

- The Nifty 50, the Next 50, and 126 midcaps from the Nifty Midcap 150. All three lists are in `js/universes.js`, compiled by hand.
- The Buy plan picks from all of them, except Safe, which sticks to the Nifty 100.
- NSE rebalances these indices in March and September; compare the lists with NSE's published CSVs then.

### Can you trust it? Track record and data checks

- **Track record (`TRACK`)**: every buy plan is saved in your browser, once a day per risk level, with that day's prices. The page shows how each plan has done compared with buying the Nifty 50 on the same day, and gives an overall verdict. Plans count once they are 30 days old. Returns are price only, without dividends.
- **Data checks (`js/dataqual.js`)**: a stock isn't recommended if more than one key number is missing or if its numbers contradict each other. Examples are a P/E that doesn't match price ÷ earnings, live price and history that disagree (a stock split the data hasn't caught up with), or impossible values. Every pick shows a ✓ / ◐ / ✕ data badge; hover over it for details. Skipped stocks are listed on the buy plan.

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
