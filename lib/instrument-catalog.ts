import { coins, coinName } from './market';

// Suggestions are available offline. Unlisted USD stock tickers can still be entered.
export const stocks = [
 ['AAPL','Apple'], ['MSFT','Microsoft'], ['NVDA','NVIDIA'], ['AMZN','Amazon'],
 ['GOOGL','Alphabet (Class A)'], ['GOOG','Alphabet (Class C)'], ['META','Meta Platforms'], ['TSLA','Tesla'],
 ['BRK.B','Berkshire Hathaway (Class B)'], ['AVGO','Broadcom'], ['TSM','Taiwan Semiconductor (ADR)'], ['AMD','Advanced Micro Devices'],
 ['INTC','Intel'], ['QCOM','Qualcomm'], ['MU','Micron Technology'], ['ARM','Arm Holdings (ADR)'],
 ['ORCL','Oracle'], ['CRM','Salesforce'], ['ADBE','Adobe'], ['NOW','ServiceNow'],
 ['PLTR','Palantir Technologies'], ['NFLX','Netflix'], ['UBER','Uber Technologies'], ['SHOP','Shopify'],
 ['JPM','JPMorgan Chase'], ['BAC','Bank of America'], ['GS','Goldman Sachs'], ['MS','Morgan Stanley'],
 ['V','Visa'], ['MA','Mastercard'], ['AXP','American Express'], ['PYPL','PayPal'],
 ['WMT','Walmart'], ['COST','Costco Wholesale'], ['HD','Home Depot'], ['MCD',"McDonald's"],
 ['KO','Coca-Cola'], ['PEP','PepsiCo'], ['PG','Procter & Gamble'], ['NKE','Nike'],
 ['DIS','Walt Disney'], ['SBUX','Starbucks'], ['JNJ','Johnson & Johnson'], ['PFE','Pfizer'],
 ['LLY','Eli Lilly'], ['ABBV','AbbVie'], ['UNH','UnitedHealth Group'], ['MRK','Merck'],
 ['XOM','Exxon Mobil'], ['CVX','Chevron'], ['CAT','Caterpillar'], ['GE','GE Aerospace'],
 ['BA','Boeing'], ['LMT','Lockheed Martin'], ['COIN','Coinbase'], ['MSTR','Strategy'],
 ['BABA','Alibaba (ADR)'], ['BIDU','Baidu (ADR)'], ['NIO','NIO (ADR)'], ['SONY','Sony Group (ADR)'],
 ['SPY','SPDR S&P 500 ETF'], ['VOO','Vanguard S&P 500 ETF'], ['VTI','Vanguard Total Stock Market ETF'], ['QQQ','Invesco QQQ ETF'],
 ['SCHD','Schwab U.S. Dividend Equity ETF'], ['DIA','SPDR Dow Jones Industrial Average ETF'], ['IWM','iShares Russell 2000 ETF'], ['GLD','SPDR Gold Shares ETF'],
] as const;
export type InstrumentOption = { symbol:string; name:string; value:string };
export function instrumentOptions(kind:'Crypto'|'Stock'):InstrumentOption[] {
 return (kind==='Crypto'?coins:stocks).map(item=>({symbol:item[0],name:item[1],value:kind==='Crypto'?coinName(item):item[0]}));
}
export function matchingInstruments(kind:'Crypto'|'Stock',query:string) {
 const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
 const normalized=query.trim().toUpperCase();
 return instrumentOptions(kind).filter(item=>terms.every(term=>(item.symbol+' '+item.name).toLowerCase().includes(term)))
  .sort((a,b)=>Number(b.symbol===normalized)-Number(a.symbol===normalized));
}
export function customStockSymbol(query:string) {
 const symbol=query.trim().toUpperCase();
 return /^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)&&!stocks.some(item=>item[0]===symbol)?symbol:null;
}
