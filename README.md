Indian stock portfolio tracker & screener

A single-page app for tracking NSE/BSE holdings and screening stocks.

- **Portfolio:** holdings with live (delayed) prices, P&L, today's change, sector allocation, and a rough STCG/LTCG estimate. Import holdings CSVs from Zerodha, Groww, Upstox and others.
- **Screener:** load any stock CSV (for example an export from Screener.in or Tickertape), then use quick screens or custom filters.

Data is stored in your browser (localStorage). Nothing is sent anywhere except symbol names to `/api/quote`.

## How live prices work

`api/quote.js` is a serverless function. It fetches delayed quotes from Yahoo Finance using `RELIANCE.NS` for NSE and `RELIANCE.BO` for BSE. The browser can't call Yahoo directly because of CORS, so the function acts as a small proxy. Prices refresh every 60 seconds while the tab is open.

This is an unofficial data source, fine for personal use. For production-grade real-time data, swap `fetchOne` for a broker API such as Kite Connect, Upstox or Angel One SmartAPI.

## Deploy (free) on Vercel

1. Push this repo to GitHub.
2. Go to vercel.com → **Add New → Project** → import this repo. No build settings are needed.
3. Click **Deploy**. Your app goes live at `https://<project>.vercel.app`, and every push redeploys it.

GitHub Pages alone won't work for live prices because it can't run `api/quote.js`.

## Run locally

```bash
npm i -g vercel
vercel dev
```

Not investment or tax advice.
