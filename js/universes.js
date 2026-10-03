// Stock universes and market lists. Index constituents change a few times a year —
// edit these lists if NSE reshuffles them. Format: SYMBOL|Name|Sector

const parse = s => s.trim().split("\n").map(l => {
  const [sym, name, sector] = l.split("|").map(x => x.trim());
  return { sym: sym + ".NS", name, sector };
});

export const NIFTY50 = parse(`
ADANIENT|Adani Enterprises|Metals & Mining
ADANIPORTS|Adani Ports & SEZ|Infrastructure
APOLLOHOSP|Apollo Hospitals|Healthcare
ASIANPAINT|Asian Paints|Consumer
AXISBANK|Axis Bank|Banks
BAJAJ-AUTO|Bajaj Auto|Auto
BAJFINANCE|Bajaj Finance|Financial Services
BAJAJFINSV|Bajaj Finserv|Financial Services
BEL|Bharat Electronics|Capital Goods
BHARTIARTL|Bharti Airtel|Telecom
CIPLA|Cipla|Healthcare
COALINDIA|Coal India|Energy
DRREDDY|Dr. Reddy's Laboratories|Healthcare
EICHERMOT|Eicher Motors|Auto
ETERNAL|Eternal (Zomato)|Consumer Services
GRASIM|Grasim Industries|Cement & Materials
HCLTECH|HCL Technologies|IT
HDFCBANK|HDFC Bank|Banks
HDFCLIFE|HDFC Life Insurance|Financial Services
HINDALCO|Hindalco Industries|Metals & Mining
HINDUNILVR|Hindustan Unilever|FMCG
ICICIBANK|ICICI Bank|Banks
INDIGO|InterGlobe Aviation|Services
INFY|Infosys|IT
ITC|ITC|FMCG
JIOFIN|Jio Financial Services|Financial Services
JSWSTEEL|JSW Steel|Metals & Mining
KOTAKBANK|Kotak Mahindra Bank|Banks
LT|Larsen & Toubro|Capital Goods
M&M|Mahindra & Mahindra|Auto
MARUTI|Maruti Suzuki|Auto
MAXHEALTH|Max Healthcare|Healthcare
NESTLEIND|Nestle India|FMCG
NTPC|NTPC|Power
ONGC|Oil & Natural Gas Corp|Energy
POWERGRID|Power Grid Corp|Power
RELIANCE|Reliance Industries|Energy
SBILIFE|SBI Life Insurance|Financial Services
SBIN|State Bank of India|Banks
SHRIRAMFIN|Shriram Finance|Financial Services
SUNPHARMA|Sun Pharmaceutical|Healthcare
TATACONSUM|Tata Consumer Products|FMCG
TMPV|Tata Motors Passenger Vehicles|Auto
TATASTEEL|Tata Steel|Metals & Mining
TCS|Tata Consultancy Services|IT
TECHM|Tech Mahindra|IT
TITAN|Titan Company|Consumer
TRENT|Trent|Consumer
ULTRACEMCO|UltraTech Cement|Cement & Materials
WIPRO|Wipro|IT
`);

export const NEXT50 = parse(`
ABB|ABB India|Capital Goods
ADANIENSOL|Adani Energy Solutions|Power
ADANIGREEN|Adani Green Energy|Power
ADANIPOWER|Adani Power|Power
AMBUJACEM|Ambuja Cements|Cement & Materials
BAJAJHLDNG|Bajaj Holdings|Financial Services
BANKBARODA|Bank of Baroda|Banks
BOSCHLTD|Bosch|Auto
BPCL|Bharat Petroleum|Energy
BRITANNIA|Britannia Industries|FMCG
CANBK|Canara Bank|Banks
CGPOWER|CG Power & Industrial|Capital Goods
CHOLAFIN|Cholamandalam Investment|Financial Services
DABUR|Dabur India|FMCG
DIVISLAB|Divi's Laboratories|Healthcare
DLF|DLF|Realty
DMART|Avenue Supermarts|Consumer
GAIL|GAIL (India)|Energy
GODREJCP|Godrej Consumer Products|FMCG
HAL|Hindustan Aeronautics|Capital Goods
HAVELLS|Havells India|Consumer
HEROMOTOCO|Hero MotoCorp|Auto
HINDZINC|Hindustan Zinc|Metals & Mining
HYUNDAI|Hyundai Motor India|Auto
ICICIGI|ICICI Lombard General|Financial Services
ICICIPRULI|ICICI Prudential Life|Financial Services
INDHOTEL|Indian Hotels|Services
INDUSINDBK|IndusInd Bank|Banks
IOC|Indian Oil Corp|Energy
IRFC|Indian Railway Finance|Financial Services
JINDALSTEL|Jindal Steel|Metals & Mining
JSWENERGY|JSW Energy|Power
LICI|Life Insurance Corp|Financial Services
LODHA|Lodha Developers|Realty
LTIM|LTIMindtree|IT
MOTHERSON|Samvardhana Motherson|Auto
NAUKRI|Info Edge|Consumer Services
PFC|Power Finance Corp|Financial Services
PIDILITIND|Pidilite Industries|Chemicals
PNB|Punjab National Bank|Banks
RECLTD|REC|Financial Services
SHREECEM|Shree Cement|Cement & Materials
SIEMENS|Siemens|Capital Goods
SWIGGY|Swiggy|Consumer Services
TATAPOWER|Tata Power|Power
TORNTPHARM|Torrent Pharmaceuticals|Healthcare
TVSMOTOR|TVS Motor|Auto
UNITDSPR|United Spirits|FMCG
VBL|Varun Beverages|FMCG
VEDL|Vedanta|Metals & Mining
ZYDUSLIFE|Zydus Lifesciences|Healthcare
`);

export const STOCKS = new Map([...NIFTY50, ...NEXT50].map(s => [s.sym, s]));

export const MARKETS = [
  { group: "India", items: [
    ["^NSEI", "NIFTY 50"], ["^BSESN", "SENSEX"], ["^NSEBANK", "NIFTY BANK"], ["^CNXIT", "NIFTY IT"],
    ["^NSEMDCP50", "NIFTY MIDCAP 50"], ["^CNXAUTO", "NIFTY AUTO"], ["^CNXFMCG", "NIFTY FMCG"], ["^CNXPHARMA", "NIFTY PHARMA"],
    ["^CNXMETAL", "NIFTY METAL"], ["^CNXENERGY", "NIFTY ENERGY"], ["^CNXREALTY", "NIFTY REALTY"], ["^CNXPSUBANK", "NIFTY PSU BANK"],
    ["^INDIAVIX", "INDIA VIX"],
  ] },
  { group: "Americas", items: [["^GSPC", "S&P 500"], ["^IXIC", "NASDAQ"], ["^DJI", "DOW JONES"], ["^RUT", "RUSSELL 2000"], ["^VIX", "CBOE VIX"]] },
  { group: "Europe", items: [["^FTSE", "FTSE 100"], ["^GDAXI", "DAX"], ["^FCHI", "CAC 40"], ["^STOXX50E", "EURO STOXX 50"]] },
  { group: "Asia-Pacific", items: [["^N225", "NIKKEI 225"], ["^HSI", "HANG SENG"], ["000001.SS", "SHANGHAI COMP"], ["^KS11", "KOSPI"], ["^STI", "STRAITS TIMES"], ["^AXJO", "ASX 200"]] },
  { group: "Currencies", items: [["INR=X", "USD/INR"], ["EURINR=X", "EUR/INR"], ["GBPINR=X", "GBP/INR"], ["JPYINR=X", "JPY/INR"], ["DX-Y.NYB", "DOLLAR INDEX"]] },
  { group: "Commodities", items: [["GC=F", "GOLD"], ["SI=F", "SILVER"], ["CL=F", "CRUDE WTI"], ["BZ=F", "BRENT"], ["NG=F", "NATURAL GAS"], ["HG=F", "COPPER"]] },
  { group: "Rates & crypto", items: [["^TNX", "US 10Y YIELD"], ["BTC-USD", "BITCOIN"], ["ETH-USD", "ETHEREUM"]] },
];
export const NAMES = new Map(MARKETS.flatMap(g => g.items));

export const TAPE = ["^NSEI", "^BSESN", "^NSEBANK", "^CNXIT", "^INDIAVIX", "INR=X", "GC=F", "BZ=F", "^GSPC", "^IXIC", "^N225", "^HSI", "BTC-USD"];

export const nameOf = (sym, q) => NAMES.get(sym) || STOCKS.get(sym)?.name || q?.name || sym;
export const sectorOf = sym => STOCKS.get(sym)?.sector || "Other";
