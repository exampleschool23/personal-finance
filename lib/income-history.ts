import { monthly, income, duplicatesAssetEstimate, type Entry } from './finance';
import type { HistoryEvent } from './investment-history';
import { convertAmount } from './market';
import { depositInterest } from './deposit-interest';

export const incomeGroups = ['salary','dividends','rent','business','interest','other'] as const;
export type IncomeGroup = typeof incomeGroups[number];
export type IncomePoint = {month:string;estimate:number|null}&Record<IncomeGroup,number>;
const blank = ():Record<IncomeGroup,number> => ({salary:0,dividends:0,rent:0,business:0,interest:0,other:0});
function group(entry:Entry,investment=false):IncomeGroup {
 if(entry.kind==='Salary')return 'salary';
 if(investment&&entry.kind==='Stock')return 'dividends';
 if(entry.kind==='Rent income'||entry.kind==='Property')return 'rent';
 if(entry.kind==='Business'||entry.kind==='Business income'||entry.business_id)return 'business';
 if(entry.kind==='Deposit'||entry.kind==='Money lent')return 'interest';
 return 'other';
}
export function incomeHistory(records:Entry[],events:HistoryEvent[],incomeRecords:Entry[],currency:string,rates:number|Record<string,number>|undefined,today:string,months=6){
 const end=today.slice(0,7), startDate=new Date(end+'-01T00:00:00Z');startDate.setUTCMonth(startDate.getUTCMonth()-months+1);
 const points:IncomePoint[]=[];
 for(let index=0;index<months;index++){const date=new Date(startDate);date.setUTCMonth(date.getUTCMonth()+index);points.push({month:date.toISOString().slice(0,7),...blank(),estimate:null});}
 const byMonth=new Map(points.map(point=>[point.month,point])),byId=new Map(records.map(record=>[record.id,record]));
 let missing=0;
 const recordedMonths=new Set<string>();
 const add=(date:string,amount:number,unit:string,kind:IncomeGroup)=>{
  const point=byMonth.get(date.slice(0,7));if(!point||date>today)return;
  recordedMonths.add(point.month);
  const converted=convertAmount(Number(amount),unit,currency,rates);
  if(converted===null||!Number.isFinite(converted)){missing++;return;}point[kind]+=converted;
 };
 const eventIds=new Set<string>();
 for(const event of events){
  if(event.event_type!=='income'||eventIds.has(event.id))continue;
  const record=byId.get(event.record_id);if(!record)continue;
  eventIds.add(event.id);add(event.occurred_on,event.amount,record.currency,group(record,true));
 }
 const seen=new Set<string>();
 for(const entry of incomeRecords){
  if(seen.has(entry.id)||!income.includes(entry.kind))continue;seen.add(entry.id);
  if(entry.frequency==='Once'&&!(entry.history_event_id&&eventIds.has(entry.history_event_id)))add(entry.date,entry.amount,entry.currency,group(entry));
 }
 const estimateForMonth=(month:string)=>{
  let estimateMissing=0;
  const expected=blank();
  const estimates=records.filter(record=>['Business','Property','Deposit'].includes(record.kind)).map(record=>({record,amount:record.kind==='Deposit'?depositInterest(events.filter(event=>event.record_id===record.id),Number(record.rate),month,record.deposit_compounding):Number(record.estimated_monthly_income??0)}));
  const businessIds=new Set(estimates.filter(({record,amount})=>record.kind==='Business'&&amount>0).map(({record})=>record.id));
  const propertyIds=new Set(estimates.filter(({record,amount})=>record.kind==='Property'&&amount>0).map(({record})=>record.id));
  const addEstimate=(entry:Entry,amount:number)=>{
   if(!amount)return;const converted=convertAmount(amount,entry.currency,currency,rates);
   if(converted===null||!Number.isFinite(converted)){estimateMissing++;return;}expected[group(entry)]+=converted;
  };
  for(const {record,amount} of estimates)addEstimate(record,amount);
  for(const entry of incomeRecords)if(income.includes(entry.kind)&&!duplicatesAssetEstimate(entry,businessIds,propertyIds))addEstimate(entry,monthly(entry,month));
  const estimatedTotal=Object.values(expected).reduce((sum,amount)=>sum+amount,0);
  return {expected,estimatedTotal,estimateMissing};
 };
 // Keep a continuous timeline from the first receipt, filling unused history slots with forecasts.
 const firstRecorded=points.findIndex(point=>recordedMonths.has(point.month));
 points.splice(0,firstRecorded<0?points.length-1:firstRecorded);
 while(points.length<months){
  const next=new Date(points.at(-1)!.month+'-01T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
  points.push({month:next.toISOString().slice(0,7),...blank(),estimate:null});
 }
 const {expected,estimatedTotal,estimateMissing}=estimateForMonth(end);
 let forecastMissing=0;
 for(const point of points)if(point.month>=end){
  const estimate=point.month===end?{estimatedTotal,estimateMissing}:estimateForMonth(point.month);
  point.estimate=estimate.estimateMissing?null:estimate.estimatedTotal;
  if(point.month>end)forecastMissing+=estimate.estimateMissing;
 }
 const received=blank();for(const point of points)for(const key of incomeGroups)received[key]+=point[key];
 return {points,received,expected,estimatedTotal,totalReceived:Object.values(received).reduce((sum,amount)=>sum+amount,0),missing,estimateMissing,forecastMissing};
}
