import { addMonths, dayMs, dayTime, daysBetween } from './calendar-days';
import { assets, liabilities, estimatedCashFlow, financialTotals, type Entry } from './finance';
import { marketEntry, convertAmount, type MarketData } from './market';
import { monthlyBudgetTotals, type ExpensePlan } from './expense-plans';

// Hold existing wealth constant. Only new monthly investments earn the assumed
// effective annual return; homes, cash and outstanding debts do not all compound.
export function projectGoal(starting: number, target: number, today: string, deadline: string, monthly: number, annualReturn: number, skippedMonth?: string | null) {
 const start = dayTime(today), end = dayTime(deadline);
 if (![starting,target,monthly,annualReturn,start,end].every(Number.isFinite) || target <= 0 || monthly < 0 || annualReturn < 0 || annualReturn > 100 || end-start > 366*100*dayMs) return null;
 const dates: string[] = [];
 for (let month = 1; month <= 1200; month++) {
  const date = addMonths(today, month);
  if (date > deadline) break;
  dates.push(date);
 }
 const factor = (date: string) => dates.filter(day=>day<=date&&day.slice(0,7)!==skippedMonth).reduce((sum,day)=>sum+(1+annualReturn/100)**(daysBetween(day,date)/365.25),0);
 const finalFactor = factor(deadline);
 const required = target <= starting ? 0 : finalFactor > 0 ? (target-starting)/finalFactor : null;
 // `contributes` marks a monthly anniversary that receives an investment; today and an off-cycle deadline do not.
 const points = [today,...dates,...(end>start&&!dates.includes(deadline)?[deadline]:[])].map(date=>({date,contributes:date!==today&&dates.includes(date)&&date.slice(0,7)!==skippedMonth,projected:starting+monthly*factor(date),required:required===null?null:starting+required*factor(date),target}));
 return {points,required,projected:starting+monthly*finalFactor,months:dates.length,overdue:end<start,contributed:monthly*dates.filter(day=>day.slice(0,7)!==skippedMonth).length};
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

/** The currency a goal is measured in: an investment goal's holding account, a savings goal's cash account, otherwise its own currency. */
export function goalCurrency(goal: { kind?: string | null; currency?: string | null; account_id?: string | null; holding_account_id?: string | null }, data: { records: readonly { id: string; currency: string }[]; holdingAccounts?: readonly { id: string; currency: string }[] }, fallback: string) {
 if (goal.kind === 'investment') return data.holdingAccounts?.find(account => account.id === goal.holding_account_id)?.currency ?? goal.currency ?? fallback;
 if (goal.kind === 'net_worth') return goal.currency ?? fallback;
 return data.records.find(record => record.id === goal.account_id)?.currency ?? goal.currency ?? fallback;
}
/** Where a savings or net-worth goal stands: the current net worth in the goal's currency for a net-worth goal, the reserved cash otherwise. */
export const goalCurrentValue = (goal: { kind?: string | null; allocated: number }, netWorth: number | null) => goal.kind === 'net_worth' ? netWorth : Number(goal.allocated);

/** Target is expressed in today's purchasing power; starting wealth stays fixed. */
export function projectGoalScenario(starting:number,target:number,today:string,scenario:{deadline:string;monthly:number;annual_return:number;inflation:number;missed_date?:string|null}){
 if(!Number.isFinite(scenario.inflation)||scenario.inflation<0||scenario.inflation>100)return null;
 const years=Math.max(0,daysBetween(today,scenario.deadline)/365.25);
 const inflationFactor=(1+scenario.inflation/100)**years;
 const result=projectGoal(starting,target*inflationFactor,today,scenario.deadline,scenario.monthly,scenario.annual_return,scenario.missed_date?.slice(0,7));
 return result?{...result,realValue:result.projected/inflationFactor,inflatedTarget:target*inflationFactor}:null;
}

/** The figures heading a goal's page: progress, what is left, the planned monthly saving, and what saving would finish on time.
 * The needed amount is whole and rounded up, so following it reaches the target. */
export function goalSummary(goal: { target: number; target_date: string | null; funding_monthly?: number | null; monthly_contribution?: number | null }, current: number | null, today: string) {
 const target = Number(goal.target);
 const left = current === null ? null : Math.max(0, target - current);
 const percent = current === null || target <= 0 ? null : Math.max(0, Math.min(100, current / target * 100));
 const monthsLeft = goal.target_date ? Math.max(0, (Number(goal.target_date.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(goal.target_date.slice(5, 7)) - Number(today.slice(5, 7))) : null;
 const needed = left === null || monthsLeft === null ? null : left === 0 ? 0 : Math.ceil(left / Math.max(1, monthsLeft));
 return { percent, left, monthsLeft, needed, monthly: Math.max(0, Number(goal.funding_monthly ?? goal.monthly_contribution ?? 0)) };
}

/** The month (`YYYY-MM`) a goal without a target date is reached when `monthly` goes in each month, counting from
 * today's month; null when nothing is left, nothing goes in, or it would take more than a century. */
export function reachedIn(left: number | null, monthly: number, today: string) {
 if (left === null || left <= 0 || !(monthly > 0)) return null;
 const months = Math.ceil(left / monthly);
 if (months > 1200) return null;
 const index = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1 + months;
 return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
}

export type GoalStatus = 'completed' | 'on_track' | 'at_risk';
/** Translation keys for the status pill. */
export const goalStatusLabels: Record<GoalStatus, string> = { completed: 'Completed', on_track: 'On track', at_risk: 'At risk' };
/** Status pill: reached, on pace (the planned monthly amount covers what is still needed by the target date), or at risk.
 * Without a target date or a known current value there is no pace to judge, so there is no status. */
export function goalStatus(summary: Pick<ReturnType<typeof goalSummary>, 'left' | 'needed' | 'monthly' | 'monthsLeft'>): GoalStatus | null {
 if (summary.left === 0) return 'completed';
 if (summary.left === null || summary.needed === null) return null;
 return summary.monthsLeft !== 0 && summary.monthly >= summary.needed ? 'on_track' : 'at_risk';
}
