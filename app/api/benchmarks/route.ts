import { session } from '@/lib/supabase';
import { depositToday } from '@/lib/deposit-interest';
import { checkpointDates, dateMillis, dayMillis, shiftDay, validDay, type BenchmarkData, type PricePoint, type FxPoint } from '@/lib/benchmark-data';

async function read(url: string): Promise<unknown> {
 for (let attempt = 0; attempt < 2; attempt++) {
  try {
   const response = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000) });
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
const positive = (value: unknown) => (typeof value === 'number' || typeof value === 'string') && Number.isFinite(Number(value)) && Number(value) > 0;
async function stockHistory(symbol: string, start: string, end: string, key: string): Promise<PricePoint[]> {
 const params = new URLSearchParams({ symbol, interval: '1day', start_date: shiftDay(start, -10), end_date: end, outputsize: '5000', order: 'asc', adjust: 'all', apikey: key });
 const result = await read('https://api.twelvedata.com/time_series?' + params) as { meta?: { symbol?: string; currency?: string }; values?: { datetime: string; close: string }[] };
 if (result.meta?.symbol !== symbol || result.meta?.currency !== 'USD' || !Array.isArray(result.values)) throw Error('Unavailable');
 const prices = result.values.filter(row => validDay(row.datetime) && positive(row.close) && row.datetime <= end).map(row => ({ date: row.datetime, close: Number(row.close) })).sort((a,b) => a.date.localeCompare(b.date));
 if (!prices.some(row => row.date <= start) || !prices.some(row => row.date >= shiftDay(end, -7))) throw Error('Incomplete history');
 return prices;
}
async function bitcoinHistory(start: string, end: string): Promise<PricePoint[]> {
 const rows = new Map<string, PricePoint>();
 for (let cursor = shiftDay(start, -1); cursor <= end; cursor = shiftDay(cursor, 299)) {
  const last = shiftDay(cursor, 299) < shiftDay(end, 1) ? shiftDay(cursor, 299) : shiftDay(end, 1);
  const params = new URLSearchParams({ granularity: '86400', start: cursor + 'T00:00:00Z', end: last + 'T00:00:00Z' });
  const candles = await read('https://api.exchange.coinbase.com/products/BTC-USD/candles?' + params);
  if (!Array.isArray(candles)) throw Error('Unavailable');
  for (const row of candles) {
   if (!Array.isArray(row) || !Number.isFinite(row[0]) || !positive(row[4])) continue;
   const date = new Date(row[0] * 1000).toISOString().slice(0, 10);
   if (date >= shiftDay(start,-1) && date <= end) rows.set(date, { date, close: Number(row[4]) });
  }
 }
 const openingDate=start===end&&end===depositToday()&&!rows.has(start)?shiftDay(start,-1):start;
 const points = [...rows.values()].filter(point=>point.date>=openingDate).sort((a,b) => a.date.localeCompare(b.date));
 const lastDate=points.at(-1)?.date;
 if(points[0]?.date!==openingDate || !lastDate || (lastDate!==end && !(end===depositToday() && lastDate===shiftDay(end,-1))) || points.length!==Math.round((dateMillis(lastDate)-dateMillis(openingDate))/dayMillis)+1)throw Error('Incomplete history');
 return points;
}
async function fxAt(date: string): Promise<FxPoint> {
 const rows = await read(`https://cbu.uz/ru/arkhiv-kursov-valyut/json/all/${date}/`);
 if (!Array.isArray(rows)) throw Error('Unavailable');
 const uzs: Record<string, number> = { UZS: 1 };
 for (const row of rows) {
  const effective = typeof row.Date === 'string' && /^\d{2}\.\d{2}\.\d{4}$/.test(row.Date) ? row.Date.split('.').reverse().join('-') : '';
  if (/^[A-Z]{3}$/.test(row.Ccy) && validDay(effective) && effective <= date && positive(row.Rate) && positive(row.Nominal)) uzs[row.Ccy] = Number(row.Rate) / Number(row.Nominal);
 }
 if (!uzs.USD) throw Error('Unavailable');
 return { date, rates: Object.fromEntries(Object.entries(uzs).map(([currency, value]) => [currency, uzs.USD / value])) };
}
export async function GET(req: Request) {
 try {
  if (!(await session())) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const start = params.get('start') ?? '', end = params.get('end') ?? '', custom = params.get('symbol') ?? '';
  if (!validDay(start) || !validDay(end) || start > end || end > depositToday() || start < '2016-01-01' || (custom && !/^[A-Z][A-Z0-9.-]{0,14}$/.test(custom))) return Response.json({ error: 'Choose valid dates ending today or earlier.' }, { status: 400 });
  const data: BenchmarkData = { start, end, prices: {}, fx: [], errors: {} };
  const selected=(params.get('benchmarks')??'SPY,HYG,BTC,depositUZS,depositUSD,CUSTOM').split(',');
  if(selected.some(key=>!['SPY','HYG','BTC','depositUZS','depositUSD','CUSTOM'].includes(key)))return Response.json({error:'Check the comparison settings.'},{status:400});
  const key = process.env.TWELVE_DATA_API_KEY;
  const symbols = [{id:'SPY',symbol:'SPY'},{id:'HYG',symbol:'HYG'},...(custom ? [{id:'CUSTOM',symbol:custom}] : [])];
  const jobs: (() => Promise<void>)[] = symbols.filter(item=>selected.includes(item.id)).map(({id,symbol}) => async () => {
   if (!key) { data.errors[id] = 'Stock comparisons need a market-data connection.'; return; }
   try { data.prices[id] = await stockHistory(symbol, start, end, key); }
   catch { data.errors[id] = 'Market history is unavailable for this period.'; }
  });
  if(selected.includes('BTC'))jobs.push(async () => { try { data.prices.BTC = await bitcoinHistory(start, end); } catch { data.errors.BTC = 'Market history is unavailable for this period.'; } });
  jobs.push(async () => {
   try {
    const dates = checkpointDates(start, end);
    // Check the source before scheduling the rest; a failed FX feed stays unavailable.
    const first = await fxAt(dates[0]);
    const points: FxPoint[] = [first];
    let index = 1;
    await Promise.all(Array.from({ length: 3 }, async () => { while (index < dates.length) { const date = dates[index++]; points.push(await fxAt(date)); } }));
    data.fx = points.sort((a,b) => a.date.localeCompare(b.date));
   } catch { data.errors.fx = 'Historical exchange rates are unavailable.'; }
  });
  let index = 0;
  await Promise.all(Array.from({ length: 3 }, async () => { while (index < jobs.length) await jobs[index++](); }));
  return Response.json(data, { headers: { 'Cache-Control': 'private, max-age=300' } });
 } catch { return Response.json({ error: 'Could not load comparisons.' }, { status: 503 }); }
}
