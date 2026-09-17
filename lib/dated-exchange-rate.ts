export type DatedExchangeRate={from:string;to:string;date:string;effective_date:string;rate:number;source:'CBU'};
const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
// The archive returns UZS per Nominal units, effective on or before the requested day.
export function parseDatedExchangeRate(rows:unknown,from:string,to:string,date:string):DatedExchangeRate {
 if(!validDate(date)||!Array.isArray(rows))throw Error('Historical exchange rates are unavailable.');
 const rates=new Map<string,{value:number;date:string}>([['UZS',{value:1,date}]]);
 for(const row of rows){
  if(!row||typeof row!=='object')continue;
  const effective=typeof row.Date==='string'&&/^\d{2}\.\d{2}\.\d{4}$/.test(row.Date)?row.Date.split('.').reverse().join('-'):'';
  const value=Number(row.Rate)/Number(row.Nominal);
  if(typeof row.Ccy==='string'&&row.Ccy!=='UZS'&&validDate(effective)&&effective<=date&&Number(row.Nominal)>0&&Number.isFinite(value)&&value>0&&(!rates.has(row.Ccy)||rates.get(row.Ccy)!.date<effective))rates.set(row.Ccy,{value,date:effective});
 }
 const a=rates.get(from),b=rates.get(to);
 if(!a||!b||!Number.isFinite(a.value/b.value)||a.value/b.value<=0)throw Error('Historical exchange rates are unavailable.');
 return {from,to,date,effective_date:a.date<b.date?a.date:b.date,rate:a.value/b.value,source:'CBU'};
}
export async function loadDatedExchangeRate(from:string,to:string,date:string):Promise<DatedExchangeRate>{
 if(!validDate(date))throw Error('Historical exchange rates are unavailable.');
 const response=await fetch(`https://cbu.uz/ru/arkhiv-kursov-valyut/json/all/${date}/`,{next:{revalidate:3600},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('Historical exchange rates are unavailable.');
 return parseDatedExchangeRate(await response.json(),from,to,date);
}
