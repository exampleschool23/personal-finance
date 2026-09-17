import type { MarketData, Quote } from '@/lib/market';
async function read(url: string, seconds: number): Promise<unknown> {
 for (let attempt = 0; attempt < 2; attempt++) {
  try {
   const response = await fetch(url, { next: { revalidate: seconds }, signal: AbortSignal.timeout(8000) });
   if (response.ok) return await response.json();
   if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
    await new Promise(resolve => setTimeout(resolve, 300));
    continue;
   }
   // Never log the full URL: some market providers include API keys in it.
   console.warn('Market feed unavailable', new URL(url).hostname, response.status);
   throw new Error('feed_http_error');
  } catch (error) {
   if (error instanceof Error && error.message === 'feed_http_error') throw error;
   if (attempt === 0) { await new Promise(resolve => setTimeout(resolve, 300)); continue; }
   console.warn('Market feed unavailable', new URL(url).hostname, 'network_or_response_error');
   throw error;
  }
 }
 throw new Error('feed_unavailable');
}
function positive(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('invalid_price');
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error('invalid_price');
  return number;
}
export async function loadMarket(crypto:string[],stocks:string[],stockAccess:boolean):Promise<MarketData> {
  const key = process.env.TWELVE_DATA_API_KEY;
  const data: MarketData = { fx: null, quotes: {}, errors: {}, stocksConfigured: !!key };
  const jobs: Array<() => Promise<void>> = [async () => {
    try {
      const rows = await read('https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/', 3600) as Array<{ Ccy: string; Rate: string; Nominal: string; Date: string }>;
      const usd = rows.find(row => row.Ccy === 'USD');
      if (!usd || !/^\d{2}\.\d{2}\.\d{4}$/.test(usd.Date)) throw new Error('invalid_fx');
      data.fx = { rate: positive(usd.Rate) / positive(usd.Nominal), date: usd.Date.split('.').reverse().join('-'), source: 'CBU' };
    } catch { data.errors.fx = 'Exchange rate unavailable.'; }
  }];
  jobs.push(async () => {
    try {
      const result = await read('https://open.er-api.com/v6/latest/USD', 86400) as { result: string; base_code: string; rates: Record<string, number>; time_last_update_unix: number };
      if (result.result !== 'success' || result.base_code !== 'USD' || !Number.isFinite(result.time_last_update_unix)) throw Error('invalid_fx');
      data.rates = Object.fromEntries(Object.entries(result.rates).filter(([code, rate]) => /^[A-Z]{3}$/.test(code) && typeof rate === 'number' && Number.isFinite(rate) && rate > 0));
      data.rates.USD = 1;
      data.ratesDate = new Date(result.time_last_update_unix * 1000).toISOString().slice(0, 10);
    } catch { data.errors.rates = 'Exchange rate unavailable.'; }
  });
  for (const symbol of crypto) jobs.push(async () => {
    try {
      const result = await read(`https://api.coinbase.com/v2/prices/${symbol}-USD/spot`, 300) as { data?: { base: string; currency: string; amount: string } };
      if (result.data?.base !== symbol || result.data.currency !== 'USD') throw new Error('invalid_quote');
      data.quotes[`Crypto:${symbol}`] = { usd: positive(result.data.amount), source: 'Coinbase', fetchedAt: new Date().toISOString() };
    } catch { data.errors[`Crypto:${symbol}`] = 'Price unavailable. Saved price is shown.'; }
  });
  for (const symbol of stocks) jobs.push(async () => {
    if (!key) { data.errors[`Stock:${symbol}`] = 'Stock prices need a market-data API key.'; return; }
    if (!stockAccess) { data.errors[`Stock:${symbol}`] = 'Sign in to fetch stock prices.'; return; }
    try {
      const url = new URL('https://api.twelvedata.com/quote');
      url.searchParams.set('symbol', symbol); url.searchParams.set('apikey', key!);
      const result = await read(url.href, 300) as { symbol?: string; currency?: string; close?: string; datetime?: string; timestamp?: number; is_market_open?: boolean };
      // Only USD-denominated stocks are supported; never treat a foreign quote as USD.
      if (result.symbol !== symbol || result.currency !== 'USD') throw new Error('invalid_quote');
      const quote: Quote = { usd: positive(result.close), source: 'Twelve Data', fetchedAt: new Date().toISOString() };
      if (Number.isFinite(result.timestamp)) quote.marketTime = new Date(result.timestamp! * 1000).toISOString();
      data.quotes[`Stock:${symbol}`] = quote;
    } catch { data.errors[`Stock:${symbol}`] = 'Price unavailable. Saved price is shown.'; }
  });
  // Bound upstream concurrency; individual failures do not hide successful prices.
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => { while (index < jobs.length) await jobs[index++](); }));
  if (data.fx) data.rates = { ...data.rates, USD: 1, UZS: data.fx.rate };
  return data;
}
