// Plain-English meaning of every number the app shows, with a rough rule of thumb.
// Used for column tooltips in the screener and the glossary on the HELP page.
// Rules of thumb are for large Indian companies; banks and NBFCs are judged differently.

export const GLOSSARY = {
  price: ["Price", "The last traded price of one share, in rupees."],
  chgPct: ["Change %", "How much the price moved today compared with yesterday's close."],
  mcapCr: ["Market cap", "What the whole company is worth on the stock market (price × number of shares), in ₹ crore. Above ₹1 lakh crore is a large, usually steadier company."],
  pe: ["P/E (price to earnings)", "How many rupees you pay for every ₹1 of yearly profit. Lower is cheaper. Around 15–30 is normal for big Indian companies; above 60 means the market expects a lot of growth. Negative means the company is losing money."],
  fpe: ["Forward P/E", "Like P/E, but uses the profit analysts expect next year. If it is well below the normal P/E, profits are expected to grow."],
  pb: ["P/B (price to book)", "Price compared with the company's net assets on paper. Mostly useful for banks and finance companies, where under 2 is usually considered cheap."],
  ps: ["P/S (price to sales)", "Price compared with yearly revenue. Handy when a company has little or no profit yet."],
  peg: ["PEG", "P/E divided by the profit growth rate. Around 1 or below means the price looks fair for how fast profits are growing."],
  evEbitda: ["EV/EBITDA", "Company value (including its debt) compared with operating profit. Lower is cheaper; under 15 is reasonable for most businesses."],
  roe: ["ROE (return on equity)", "How much profit the company makes from each ₹100 of shareholders' money. 15%+ is good, 20%+ is excellent. The single best quick check of business quality."],
  roa: ["ROA (return on assets)", "Profit made from everything the company owns. For banks, 1%+ is good; for other businesses, 8%+ is good."],
  opm: ["Operating margin", "Out of every ₹100 of sales, how much is left after running the business. Higher means more pricing power. Compare within the same industry."],
  npm: ["Net margin", "Out of every ₹100 of sales, how much ends up as final profit after interest and tax."],
  de: ["Debt to equity", "How much the company has borrowed compared with its own money. Under 0.5 is comfortable; above 1.5 is risky if business slows. Ignore for banks — borrowing is their business."],
  cr: ["Current ratio", "Short-term assets divided by short-term bills. Above 1.5 means it can comfortably pay what it owes this year."],
  revGrowth: ["Revenue growth", "How much sales grew compared with a year ago. Steady double digits is strong."],
  epsGrowth: ["Earnings growth", "How much profit per share grew compared with a year ago. Can swing a lot quarter to quarter."],
  dy: ["Dividend yield", "Yearly dividend as a % of the share price — the cash you get just for holding. Above 3% is high for Indian stocks."],
  beta: ["Beta", "How much the stock swings compared with the market. 1 moves with the market; below 1 is calmer; above 1.3 is jumpy."],
  upside: ["Analyst target upside", "How far the analysts' average price target is above today's price. Analysts are often wrong, so treat it as a mood indicator."],
  offHigh: ["From 52-week high", "How far below its highest price of the last year the stock is. −30% or worse means something went wrong (or it's on sale — find out which)."],
  r1w: ["1 week return", "Price change over the last week."],
  r1m: ["1 month return", "Price change over the last month."],
  r3m: ["3 month return", "Price change over the last 3 months."],
  r6m: ["6 month return", "Price change over the last 6 months. A common momentum measure."],
  r1y: ["1 year return", "Price change over the last year."],
  ytd: ["Year to date", "Price change since 1 January."],
  rsi: ["RSI (14 day)", "A 0–100 gauge of recent buying vs selling. Above 70 = rose fast and may cool off; below 30 = fell hard and may bounce. Short-term only."],
  vsSma50: ["vs 50-day average", "How far the price is above (+) or below (−) its average of the last 50 days — the medium-term trend."],
  vsSma200: ["vs 200-day average", "How far the price is above (+) or below (−) its average of the last 200 days. Above it = long-term uptrend, below = downtrend."],
  volRatio: ["Volume vs 20-day average", "Today's trading volume compared with normal. 2× or more means something is happening — check the news."],
  volatility: ["Volatility", "How much the price jumps around in a year. Under 25% is calm for an Indian stock; above 40% is a rollercoaster."],
};

export const tip = k => GLOSSARY[k]?.[1] || "";

// Row labels on the security page (DES) → glossary entry, so hovering a label explains it
const LABELS = {
  "Market cap": "mcapCr", "P/E (TTM)": "pe", "Forward P/E": "fpe", "P/B": "pb", "P/S": "ps", "PEG": "peg", "EV/EBITDA": "evEbitda",
  "Dividend yield": "dy", "Beta": "beta", "ROE": "roe", "ROA": "roa", "Operating margin": "opm", "Net margin": "npm",
  "Revenue growth (YoY)": "revGrowth", "Earnings growth (YoY)": "epsGrowth", "Debt / equity": "de", "Current ratio": "cr",
  "RSI (14)": "rsi", "200 DMA": "vsSma200", "50 DMA": "vsSma50", "Volatility (1Y)": "volatility", "Vol vs 20D avg": "volRatio",
};
export const labelTip = l => tip(LABELS[l]);
