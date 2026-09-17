import { assets, liabilities, estimatedCashFlow, value, type Entry } from './finance';
import { marketEntry, convertAmount, type MarketData } from './market';
import { expensePlanTotals, type ExpensePlan } from './expense-plans';

// Hold existing wealth constant. Only new monthly investments earn the assumed
// effective annual return; homes, cash and outstanding debts do not all compound.
export function projectGoal(starting: number, target: number, today: string, deadline: string, monthly: number, annualReturn: number) {
 const start = Date.parse(today + 'T00:00:00Z'), end = Date.parse(deadline + 'T00:00:00Z');
 if (![starting,target,monthly,annualReturn,start,end].every(Number.isFinite) || target <= 0 || monthly < 0 || annualReturn < 0 || annualReturn > 100 || end-start > 366*100*86400000) return null;
 const origin = new Date(start), dates: string[] = [];
 for (let month = 1; month <= 1200; month++) {
  const last = new Date(Date.UTC(origin.getUTCFullYear(),origin.getUTCMonth()+month+1,0)).getUTCDate();
  const date = new Date(Date.UTC(origin.getUTCFullYear(),origin.getUTCMonth()+month,Math.min(origin.getUTCDate(),last))).toISOString().slice(0,10);
  if (date > deadline) break;
  dates.push(date);
 }
 const factor = (date: string) => dates.filter(day=>day<=date).reduce((sum,day)=>sum+(1+annualReturn/100)**((Date.parse(date+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/86400000/365.25),0);
 const finalFactor = factor(deadline);
 const required = target <= starting ? 0 : finalFactor > 0 ? (target-starting)/finalFactor : null;
 const points = [today,...dates,...(end>start&&!dates.includes(deadline)?[deadline]:[])].map(date=>({date,projected:starting+monthly*factor(date),required:required===null?null:starting+required*factor(date),target}));
 return {points,required,projected:starting+monthly*finalFactor,months:dates.length,overdue:end<=start,contributed:monthly*dates.length};
}

export function goalFinancials(records: Entry[], plans: ExpensePlan[], month: string, currency: string, market: MarketData|null, plansReady: boolean) {
 const converted=records.map(record=>marketEntry(record,currency,market));
 const missingWealth=records.some((record,i)=>(assets.includes(record.kind)||liabilities.includes(record.kind))&&!converted[i]);
 const planAmounts=plans.map(plan=>convertAmount(expensePlanTotals(plan,month).projected,plan.currency,currency,market?.rates??market?.fx?.rate));
 const entries=converted.filter((entry):entry is Entry=>entry!==null);
 const netWorth=missingWealth?null:entries.reduce((sum,entry)=>sum+(assets.includes(entry.kind)?value(entry):liabilities.includes(entry.kind)?-value(entry):0),0);
 const surplus=!plansReady||converted.some(entry=>entry===null)||planAmounts.some(amount=>amount===null)?null:estimatedCashFlow(entries,planAmounts.reduce<number>((sum,amount)=>sum+(amount??0),0),month).forecast;
 return {netWorth,surplus};
}
