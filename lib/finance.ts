export const frequencies = ['Once','Weekly','Fortnightly','Monthly','Yearly','Custom'] as const;
export type Frequency = typeof frequencies[number];
export type Schedule = {date:string;frequency:Frequency;recurrence_days?:number|null;end_date?:string|null};
const dayMs=86400000;
const timestamp=(date:string)=>Date.parse(date+'T00:00:00Z');
export function intervalDays(schedule:Schedule):number|null {
 if(schedule.frequency==='Weekly')return 7;
 if(schedule.frequency==='Fortnightly')return 14;
 if(schedule.frequency==='Custom')return Number.isInteger(schedule.recurrence_days)&&schedule.recurrence_days!>=1&&schedule.recurrence_days!<=366?schedule.recurrence_days!:null;
 return null;
}
/** Anchor-based calendar arithmetic: a January 31 plan returns to March 31. */
export function scheduleDates(schedule:Schedule,from:string,through:string):string[] {
 const first=Math.max(timestamp(schedule.date),timestamp(from)),last=Math.min(timestamp(through),schedule.end_date?timestamp(schedule.end_date):Infinity);
 if(!Number.isFinite(first)||!Number.isFinite(last)||first>last)return [];
 if(schedule.frequency==='Once')return timestamp(schedule.date)>=first&&timestamp(schedule.date)<=last?[schedule.date]:[];
 const days=intervalDays(schedule),result:string[]=[];
 if(days){
  const anchor=timestamp(schedule.date),step=days*dayMs;
  for(let date=anchor+Math.max(0,Math.ceil((first-anchor)/step))*step;date<=last;date+=step)result.push(new Date(date).toISOString().slice(0,10));
 }else if(schedule.frequency==='Monthly'||schedule.frequency==='Yearly'){
  const anchorYear=Number(schedule.date.slice(0,4)),anchorMonth=Number(schedule.date.slice(5,7))-1,day=Number(schedule.date.slice(8));
  const step=schedule.frequency==='Yearly'?12:1;
  const begin=new Date(first),end=new Date(last),anchor=anchorYear*12+anchorMonth;
  for(let index=anchor+Math.max(0,Math.floor((begin.getUTCFullYear()*12+begin.getUTCMonth()-anchor)/step))*step;index<=end.getUTCFullYear()*12+end.getUTCMonth();index+=step){
   const year=Math.floor(index/12),month=index%12,date=Date.UTC(year,month,Math.min(day,new Date(Date.UTC(year,month+1,0)).getUTCDate()));
   if(date>=first&&date<=last)result.push(new Date(date).toISOString().slice(0,10));
  }
 }
 return result;
}
export function scheduleDueDate(schedule:Schedule,on:string):string {
 const days=intervalDays(schedule);
 if(days){const steps=Math.max(0,Math.floor((timestamp(on)-timestamp(schedule.date))/(days*dayMs)));return new Date(timestamp(schedule.date)+steps*days*dayMs).toISOString().slice(0,10);}
 const year=Number(on.slice(0,4)),month=schedule.frequency==='Yearly'?Number(schedule.date.slice(5,7)):Number(on.slice(5,7));
 return new Date(Date.UTC(year,month-1,Math.min(Number(schedule.date.slice(8)),new Date(Date.UTC(year,month,0)).getUTCDate()))).toISOString().slice(0,10);
}
export const frequencyLabels:Record<Frequency,string>={Once:'One time',Weekly:'Every week',Fortnightly:'Every two weeks',Monthly:'Every month',Yearly:'Every year',Custom:'Every N days'};

export const kinds = ['Cash','Stock','Crypto','Deposit','Property','Business','Valuables','Money lent','Mortgage','Loan','Debt','Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'] as const;
export type Kind = typeof kinds[number];
export type Entry = {revision?:number;is_investment?:boolean;source_paused?:boolean;earning_source_id?:string|null;earning_due_on?:string|null;payment_type?:'regular'|'bonus';income_source_id?:string|null;income_due_on?:string|null;account_exchange_rate?:number|null;account_rate_date?:string|null;account_currency?:string|null;id:string;opened_on?:string|null;deposit_compounding?:'monthly'|'daily'|'none';movement_id?:string|null;holding_account_id?:string|null;operation_id?:string|null;account_id?:string|null;custom_category_id?:string|null;import_key?:string|null;end_date?:string|null;expense_plan_id?:string|null;history_event_id?:string|null;mortgage_payment_id?:string|null;payment_principal?:number;payment_interest?:number;record_count?:number;name:string;kind:Kind;currency:string;amount:number;quantity:number;cost:number;rate:number;date:string;lent_date?:string;recurrence_days?:number|null;frequency:Frequency;notes:string;business_id?:string|null;ownership_percentage?:number;estimated_monthly_payment?:number;estimated_monthly_income?:number};
// PostgreSQL permits a null due date for lending records. Keep the same client
// representation for both paginated records and the planning data feed.
export function normalizeEntry(entry: Omit<Entry, 'date' | 'lent_date'> & {date?:string|null;lent_date?:string|null}): Entry {
 return {...entry,date:entry.date??'',lent_date:entry.lent_date??'',amount:Number(entry.amount),quantity:Number(entry.quantity),cost:Number(entry.cost),rate:Number(entry.rate),ownership_percentage:Number(entry.ownership_percentage??100),estimated_monthly_income:Number(entry.estimated_monthly_income??0),estimated_monthly_payment:Number(entry.estimated_monthly_payment??0)};
}
export const assets:readonly string[] = ['Cash','Stock','Crypto','Deposit','Property','Business','Valuables','Money lent'];
export const liabilities:readonly string[] = ['Mortgage','Loan','Debt'];
// Navigation groups are separate from accounting classifications.
export const assetRecordKinds:readonly string[] = assets.filter(kind => kind !== 'Money lent');
export const lendingRecordKinds:readonly string[] = ['Money lent', ...liabilities];
export const income:readonly string[] = ['Salary','Rent income','Business income','Other income'];
export const expenses:readonly string[] = ['Rent expense','Living expense','Charity','Other expense'];
export const value=(e:Entry)=>['Stock','Crypto'].includes(e.kind)?e.amount*e.quantity:e.kind==='Business'?e.amount*(e.ownership_percentage ?? 100)/100:e.amount;
export const monthly=(e:Entry,month?:string)=>e.source_paused?0:month && ((e.date && e.date.slice(0,7)>month) || (e.end_date && e.end_date.slice(0,7)<month)) ? 0 : e.frequency==='Yearly'?e.amount/12:e.frequency==='Monthly'?e.amount:intervalDays(e)?e.amount*(month?scheduleDates(e,month+'-01',new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10)).length:365.25/12/intervalDays(e)!):0;

// Salary is pay for work, even when its employer is a business the user owns.
// Only linked business distributions replace the business income estimate.
export const duplicatesBusinessEstimate = (entry: Entry, businessIds: Set<string>) => ['Other income','Business income'].includes(entry.kind) && !!entry.business_id && businessIds.has(entry.business_id);
export const duplicatesAssetEstimate = (entry:Entry,businessIds:Set<string>,propertyIds:Set<string>) => duplicatesBusinessEstimate(entry,businessIds)||(entry.kind==='Rent income'&&!!entry.income_source_id&&propertyIds.has(entry.income_source_id));

export function estimatedCashFlow(entries: Entry[], expensePlanProjection = 0, month?: string) {
 const estimatedAssets = entries.filter(e => ['Business','Property','Deposit'].includes(e.kind) && (e.estimated_monthly_income ?? 0) > 0);
 const businessIds = new Set(estimatedAssets.filter(e => e.kind === 'Business').map(e => e.id));
 const propertyIds = new Set(estimatedAssets.filter(e=>e.kind==='Property').map(e=>e.id));
 const estimatedIncome = estimatedAssets.reduce((sum,e) => sum + (e.estimated_monthly_income ?? 0), 0);
 const otherIncome = entries.filter(e => income.includes(e.kind) && !duplicatesAssetEstimate(e, businessIds, propertyIds)).reduce((sum,e) => sum + monthly(e, month), 0);
 const monthlyExpenses = entries.filter(e => expenses.includes(e.kind) && !e.expense_plan_id).reduce((sum,e) => sum + monthly(e, month), expensePlanProjection);
 const mortgagePayments = entries.filter(e => e.kind === 'Mortgage' && e.amount > 0).reduce((sum,e) => sum + (e.estimated_monthly_payment ?? 0), 0);
 return { estimatedAssets, otherIncome, plannedIncome: estimatedIncome + otherIncome, monthlyExpenses, mortgagePayments, estimatedIncome, forecast: estimatedIncome + otherIncome - monthlyExpenses - mortgagePayments };
}

/** Entries must already be expressed in the same currency. Never round stored totals. */
export function totalValue(entries: readonly Entry[], kinds?: readonly string[]) {
 return entries.reduce((sum, entry) => sum + (!kinds || kinds.includes(entry.kind) ? value(entry) : 0), 0);
}

export function financialTotals(entries: readonly Entry[]) {
 const totalAssets = totalValue(entries, assets);
 const totalDebt = totalValue(entries, liabilities);
 const receivable = totalValue(entries, ['Money lent']);
 return { totalAssets, totalDebt, netWorth: totalAssets - totalDebt, receivable, netLending: receivable - totalDebt, cash: totalValue(entries, ['Cash']) };
}
