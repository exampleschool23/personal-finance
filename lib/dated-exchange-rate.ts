export type ExchangeRateSource='ECB'|'CBU';
export type DatedExchangeRate={from:string;to:string;date:string;effective_date:string;rate:number;source:ExchangeRateSource};
const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
const unavailable=()=>Error('Historical exchange rates are unavailable.');
/** A past day's official rate never changes, so it is kept for a month; today's may still be published, so for an hour.
 * "Today" is the Tashkent day, as `depositToday` gives it: this file keeps its own copy because it has no runtime imports. */
export const datedRateRevalidate=(date:string,today=new Date(Date.now()+5*60*60*1000).toISOString().slice(0,10))=>date<today?30*24*3600:3600;
// The archive returns UZS per Nominal units, effective on or before the requested day.
export function parseDatedExchangeRate(rows:unknown,from:string,to:string,date:string):DatedExchangeRate {
 if(!validDate(date)||!Array.isArray(rows))throw unavailable();
 const rates=new Map<string,{value:number;date:string}>([['UZS',{value:1,date}]]);
 for(const row of rows){
  if(!row||typeof row!=='object')continue;
  const effective=typeof row.Date==='string'&&/^\d{2}\.\d{2}\.\d{4}$/.test(row.Date)?row.Date.split('.').reverse().join('-'):'';
  const value=Number(row.Rate)/Number(row.Nominal);
  if(typeof row.Ccy==='string'&&row.Ccy!=='UZS'&&validDate(effective)&&effective<=date&&Number(row.Nominal)>0&&Number.isFinite(value)&&value>0&&(!rates.has(row.Ccy)||rates.get(row.Ccy)!.date<effective))rates.set(row.Ccy,{value,date:effective});
 }
 const a=rates.get(from),b=rates.get(to);
 if(!a||!b||!Number.isFinite(a.value/b.value)||a.value/b.value<=0)throw unavailable();
 return {from,to,date,effective_date:a.date<b.date?a.date:b.date,rate:a.value/b.value,source:'CBU'};
}
// The ECB reference rates (via Frankfurter) answer with the last working day on or before the requested one.
export function parseEcbExchangeRate(body:unknown,from:string,to:string,date:string):DatedExchangeRate {
 if(!validDate(date)||!body||typeof body!=='object')throw unavailable();
 const {base,date:effective,rates}=body as {base?:unknown;date?:unknown;rates?:Record<string,unknown>};
 const rate=Number(rates?.[to]);
 if(base!==from||typeof effective!=='string'||!validDate(effective)||effective>date||!Number.isFinite(rate)||rate<=0)throw unavailable();
 return {from,to,date,effective_date:effective,rate,source:'ECB'};
}
async function loadCbu(from:string,to:string,date:string){
 const response=await fetch(`https://cbu.uz/ru/arkhiv-kursov-valyut/json/all/${date}/`,{next:{revalidate:datedRateRevalidate(date)},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw unavailable();
 return parseDatedExchangeRate(await response.json(),from,to,date);
}
async function loadEcb(from:string,to:string,date:string){
 const response=await fetch(`https://api.frankfurter.dev/v1/${date}?from=${from}&to=${to}`,{next:{revalidate:datedRateRevalidate(date)},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw unavailable();
 return parseEcbExchangeRate(await response.json(),from,to,date);
}
/** International pairs use the ECB reference rates; the Uzbek sum (which the ECB does not publish) and any pair the ECB lacks use the Central Bank of Uzbekistan archive. */
export async function loadDatedExchangeRate(from:string,to:string,date:string):Promise<DatedExchangeRate>{
 if(!validDate(date))throw unavailable();
 if(from!=='UZS'&&to!=='UZS'){try{return await loadEcb(from,to,date);}catch{/* fall back to the CBU cross rate */}}
 return loadCbu(from,to,date);
}
