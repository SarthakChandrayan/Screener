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

// Midcaps, built from the Nifty Midcap 150 (compiled by hand, so it can drift from the official list:
// compare with NSE's "ind_niftymidcap150list.csv" when the index is rebalanced in March and September).
// Stocks that are renamed or delisted simply get no data and are skipped by the data checks.
export const MIDCAP = parse(`
AUBANK|AU Small Finance Bank|Banks
BANDHANBNK|Bandhan Bank|Banks
FEDERALBNK|Federal Bank|Banks
IDFCFIRSTB|IDFC First Bank|Banks
INDIANB|Indian Bank|Banks
UNIONBANK|Union Bank of India|Banks
BANKINDIA|Bank of India|Banks
YESBANK|Yes Bank|Banks
MAHABANK|Bank of Maharashtra|Banks
ABCAPITAL|Aditya Birla Capital|Financial Services
LICHSGFIN|LIC Housing Finance|Financial Services
MUTHOOTFIN|Muthoot Finance|Financial Services
M&MFIN|Mahindra & Mahindra Financial|Financial Services
SBICARD|SBI Cards|Financial Services
POONAWALLA|Poonawalla Fincorp|Financial Services
LTF|L&T Finance|Financial Services
SUNDARMFIN|Sundaram Finance|Financial Services
HDFCAMC|HDFC Asset Management|Financial Services
NAM-INDIA|Nippon Life India AMC|Financial Services
MFSL|Max Financial Services|Financial Services
STARHEALTH|Star Health Insurance|Financial Services
GICRE|General Insurance Corp|Financial Services
BSE|BSE|Financial Services
MCX|Multi Commodity Exchange|Financial Services
PAYTM|One 97 Communications (Paytm)|Financial Services
POLICYBZR|PB Fintech (Policybazaar)|Financial Services
HUDCO|HUDCO|Financial Services
IREDA|IREDA|Financial Services
BAJAJHFL|Bajaj Housing Finance|Financial Services
360ONE|360 ONE WAM|Financial Services
MOTILALOFS|Motilal Oswal Financial|Financial Services
PERSISTENT|Persistent Systems|IT
COFORGE|Coforge|IT
MPHASIS|Mphasis|IT
OFSS|Oracle Financial Services|IT
KPITTECH|KPIT Technologies|IT
TATAELXSI|Tata Elxsi|IT
TATATECH|Tata Technologies|IT
LTTS|L&T Technology Services|IT
LUPIN|Lupin|Healthcare
AUROPHARMA|Aurobindo Pharma|Healthcare
ALKEM|Alkem Laboratories|Healthcare
MANKIND|Mankind Pharma|Healthcare
IPCALAB|Ipca Laboratories|Healthcare
GLENMARK|Glenmark Pharma|Healthcare
BIOCON|Biocon|Healthcare
LAURUSLABS|Laurus Labs|Healthcare
ABBOTINDIA|Abbott India|Healthcare
FORTIS|Fortis Healthcare|Healthcare
SYNGENE|Syngene International|Healthcare
AJANTPHARM|Ajanta Pharma|Healthcare
ASHOKLEY|Ashok Leyland|Auto
BHARATFORG|Bharat Forge|Auto
MRF|MRF|Auto
BALKRISIND|Balkrishna Industries|Auto
APOLLOTYRE|Apollo Tyres|Auto
EXIDEIND|Exide Industries|Auto
SONACOMS|Sona BLW Precision|Auto
TIINDIA|Tube Investments|Auto
UNOMINDA|Uno Minda|Auto
ESCORTS|Escorts Kubota|Auto
SCHAEFFLER|Schaeffler India|Auto
BHEL|Bharat Heavy Electricals|Capital Goods
CUMMINSIND|Cummins India|Capital Goods
POLYCAB|Polycab India|Capital Goods
KEI|KEI Industries|Capital Goods
SUPREMEIND|Supreme Industries|Capital Goods
ASTRAL|Astral|Capital Goods
THERMAX|Thermax|Capital Goods
AIAENG|AIA Engineering|Capital Goods
BDL|Bharat Dynamics|Capital Goods
MAZDOCK|Mazagon Dock Shipbuilders|Capital Goods
COCHINSHIP|Cochin Shipyard|Capital Goods
SUZLON|Suzlon Energy|Capital Goods
WAAREEENER|Waaree Energies|Capital Goods
HONAUT|Honeywell Automation|Capital Goods
KAYNES|Kaynes Technology|Capital Goods
SOLARINDS|Solar Industries|Capital Goods
DIXON|Dixon Technologies|Consumer
APLAPOLLO|APL Apollo Tubes|Metals & Mining
RVNL|Rail Vikas Nigam|Infrastructure
GMRAIRPORT|GMR Airports|Infrastructure
JSWINFRA|JSW Infrastructure|Infrastructure
IRCTC|IRCTC|Services
CONCOR|Container Corp of India|Services
DELHIVERY|Delhivery|Services
PAGEIND|Page Industries|Consumer
VOLTAS|Voltas|Consumer
BLUESTARCO|Blue Star|Consumer
KALYANKJIL|Kalyan Jewellers|Consumer
JUBLFOOD|Jubilant FoodWorks|Consumer Services
NYKAA|FSN E-Commerce (Nykaa)|Consumer Services
PATANJALI|Patanjali Foods|FMCG
COLPAL|Colgate-Palmolive India|FMCG
MARICO|Marico|FMCG
UBL|United Breweries|FMCG
HINDPETRO|Hindustan Petroleum|Energy
OIL|Oil India|Energy
PETRONET|Petronet LNG|Energy
IGL|Indraprastha Gas|Energy
ATGL|Adani Total Gas|Energy
NHPC|NHPC|Power
SJVN|SJVN|Power
TORNTPOWER|Torrent Power|Power
NTPCGREEN|NTPC Green Energy|Power
NMDC|NMDC|Metals & Mining
SAIL|Steel Authority of India|Metals & Mining
NATIONALUM|National Aluminium|Metals & Mining
JSL|Jindal Stainless|Metals & Mining
ACC|ACC|Cement & Materials
DALBHARAT|Dalmia Bharat|Cement & Materials
JKCEMENT|JK Cement|Cement & Materials
SRF|SRF|Chemicals
PIIND|PI Industries|Chemicals
UPL|UPL|Chemicals
COROMANDEL|Coromandel International|Chemicals
DEEPAKNTR|Deepak Nitrite|Chemicals
BERGEPAINT|Berger Paints|Chemicals
GODREJPROP|Godrej Properties|Realty
OBEROIRLTY|Oberoi Realty|Realty
PRESTIGE|Prestige Estates|Realty
PHOENIXLTD|Phoenix Mills|Realty
IDEA|Vodafone Idea|Telecom
INDUSTOWER|Indus Towers|Telecom
TATACOMM|Tata Communications|Telecom
BHARTIHEXA|Bharti Hexacom|Telecom
`);

export const STOCKS = new Map([...NIFTY50, ...NEXT50, ...MIDCAP].map(s => [s.sym, s]));

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
