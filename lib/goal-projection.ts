import { assets, liabilities, estimatedCashFlow, financialTotals, type Entry } from './finance';
import { marketEntry, convertAmount, type MarketData } from './market';
import { monthlyBudgetTotals, type ExpensePlan } from './expense-plans';

// Hold existing wealth constant. Only new monthly investments earn the assumed
// effective annual return; homes, cash and outstanding debts do not all compound.
export function projectGoal(starting: number, target: number, today: string, deadline: string, monthly: number, annualReturn: number, skippedMonth?: string | null) {
 const start = Date.parse(today + 'T00:00:00Z'), end = Date.parse(deadline + 'T00:00:00Z');
 if (![starting,target,monthly,annualReturn,start,end].every(Number.isFinite) || target <= 0 || monthly < 0 || annualReturn < 0 || annualReturn > 100 || end-start > 366*100*86400000) return null;
 const origin = new Date(start), dates: string[] = [];
 for (let month = 1; month <= 1200; month++) {
  const last = new Date(Date.UTC(origin.getUTCFullYear(),origin.getUTCMonth()+month+1,0)).getUTCDate();
  const date = new Date(Date.UTC(origin.getUTCFullYear(),origin.getUTCMonth()+month,Math.min(origin.getUTCDate(),last))).toISOString().slice(0,10);
  if (date > deadline) break;
  dates.push(date);
 }
 const factor = (date: string) => dates.filter(day=>day<=date&&day.slice(0,7)!==skippedMonth).reduce((sum,day)=>sum+(1+annualReturn/100)**((Date.parse(date+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/86400000/365.25),0);
 const finalFactor = factor(deadline);
 const required = target <= starting ? 0 : finalFactor > 0 ? (target-starting)/finalFactor : null;
 const points = [today,...dates,...(end>start&&!dates.includes(deadline)?[deadline]:[])].map(date=>({date,projected:starting+monthly*factor(date),required:required===null?null:starting+required*factor(date),target}));
 return {points,required,projected:starting+monthly*finalFactor,months:dates.length,overdue:end<=start,contributed:monthly*dates.filter(day=>day.slice(0,7)!==skippedMonth).length};
}

export function goalFinancials(records: Entry[], plans: ExpensePlan[], month: string, currency: string, market: MarketData|null, plansReady: boolean) {
 const converted=records.map(record=>marketEntry(record,currency,market));
 const missingWealth=records.some((record,i)=>(assets.includes(record.kind)||liabilities.includes(record.kind))&&!converted[i]);
 const budget=monthlyBudgetTotals(plans,month,(amount,source)=>convertAmount(amount,source,currency,market?.rates??market?.fx?.rate));
 const entries=converted.filter((entry):entry is Entry=>entry!==null);
 const netWorth=missingWealth?null:financialTotals(entries).netWorth;
 const surplus=!plansReady||converted.some(entry=>entry===null)||budget.projected===null?null:estimatedCashFlow(entries,budget.projected!,month).forecast;
 return {netWorth,surplus};
}

/** Target is expressed in today's purchasing power; starting wealth stays fixed. */
export function projectGoalScenario(starting:number,target:number,today:string,scenario:{deadline:string;monthly:number;annual_return:number;inflation:number;missed_date?:string|null}){
 if(!Number.isFinite(scenario.inflation)||scenario.inflation<0||scenario.inflation>100)return null;
 const years=Math.max(0,(Date.parse(scenario.deadline+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/(365.25*86400000));
 const inflationFactor=(1+scenario.inflation/100)**years;
 const result=projectGoal(starting,target*inflationFactor,today,scenario.deadline,scenario.monthly,scenario.annual_return,scenario.missed_date?.slice(0,7));
 return result?{...result,realValue:result.projected/inflationFactor,inflatedTarget:target*inflationFactor}:null;
}
