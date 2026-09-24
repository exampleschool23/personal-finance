import {expenses,type Entry} from './finance';
import {upcomingPayments,type PlanningData} from './planning';
import {expensePlanTotals,type ExpensePlan} from './expense-plans';
import {accountForecast,type ForecastAssignment} from './transaction-tools';
import {instrumentFor,instrumentKey,convertAmount,type MarketData} from './market';
import type {WorkspacePreference} from './workspace-preferences';
export type DailyPlan=Extract<WorkspacePreference,{key:'daily_plan'}>['data'];
export type ReminderSettings=Extract<WorkspacePreference,{key:'reminders'}>['data'];
export type EntryTemplate=Extract<WorkspacePreference,{key:'entry_templates'}>['data']['items'][number];
export const emptyDailyPlan:DailyPlan={buffers:{},budgets:[]};
export function availableToSpend(data:PlanningData,assignments:ForecastAssignment[],plans:ExpensePlan[],settings:DailyPlan,today:string,through:string){
 const projection=accountForecast(data.records,data.occurrences,assignments,today,through);
 const issues:string[]=[];
 if(through<today||through.slice(0,7)!==today.slice(0,7))issues.push('Choose a date in the current month.');
 const due=upcomingPayments(data.records,data.occurrences,today,through);
 if(projection.unassigned.some(item=>expenses.includes(item.record.kind)))issues.push('Assign every unpaid bill and its exchange rate before using this allowance.');
 if(due.some(item=>item.type==='repayment'&&item.record.kind!=='Money lent'))issues.push('A debt is due. Reserve its payment in the cash buffer before relying on this estimate.');
 const activePlans=plans.filter(p=>expensePlanTotals(p,today.slice(0,7)).remaining>0);
 for(const plan of activePlans)if(!settings.budgets.some(b=>b.plan_id===plan.id))issues.push('Assign every remaining expense budget to a cash account.');
 const rows=projection.accounts.filter(({account})=>!account.is_investment&&!account.holding_account_id).map(({account,events})=>{
  const reasons:string[]=[];
  const bills=events.filter(e=>e.amount<0).reduce((n,e)=>n-e.amount,0);
  const expectedIncome=events.filter(e=>e.amount>0).reduce((n,e)=>n+e.amount,0);
  const reserves=data.goals.filter(g=>!g.archived&&g.account_id===account.id).reduce((n,g)=>n+Number(g.allocated),0);
  let budgets=0;
  for(const binding of settings.budgets.filter(b=>b.account_id===account.id)){
   const plan=plans.find(p=>p.id===binding.plan_id);if(!plan)continue;
   if(plan.currency!==account.currency){reasons.push('Budget and account currencies must match.');continue;}
   let overlap=0;
   for(const id of binding.schedule_ids){
    const schedule=data.records.find(r=>r.id===id),assignment=assignments.find(a=>a.record_id===id);
    if(!schedule||!expenses.includes(schedule.kind)||assignment?.account_id!==account.id){reasons.push('Review the bills included in this budget.');continue;}
    overlap+=events.filter(e=>e.key.startsWith(id+':')&&e.amount<0).reduce((n,e)=>n-e.amount,0);
   }
   budgets+=Math.max(0,expensePlanTotals(plan,today.slice(0,7)).remaining-overlap);
  }
  const buffer=settings.buffers[account.id]??0;
  const estimate=account.amount-bills-reserves-budgets-buffer;
  return {account,bills,reserves,budgets,buffer,expectedIncome,estimate,forecast:estimate+expectedIncome,reasons,available:issues.length||reasons.length?null:estimate,events};
 });
 if(settings.budgets.some(b=>activePlans.some(p=>p.id===b.plan_id)&&!rows.some(r=>r.account.id===b.account_id)))issues.push('A budget points to an unavailable spending account.');
 if(issues.length)for(const row of rows)row.available=null;
 return {rows,issues:[...new Set(issues)]};
}
export function dueReminders(data:PlanningData,settings:ReminderSettings,today:string){
 if(!settings.enabled)return [];
 const through=new Date(Date.parse(today+'T00:00:00Z')+settings.days_ahead*86400000).toISOString().slice(0,10);
 return upcomingPayments(data.records,data.occurrences,today,through).filter(item=>!settings.snoozed.some(s=>s.key===item.key&&s.until>today));
}
export function financialHealth(records:Entry[],market:MarketData|null,currency:string,now:number){
 const issues:Array<{key:string;message:string;name:string;href:string}>=[];
 for(const r of records){
  if(convertAmount(1,r.currency,currency,market?.rates??market?.fx?.rate)===null)issues.push({key:'fx:'+r.id,message:'Exchange rate is missing.',name:r.currency,href:'/accounts'});
  const instrument=instrumentFor(r);
  if(instrument){const quote=market?.quotes[instrumentKey(instrument)],age=quote?now-Date.parse(quote.marketTime??quote.fetchedAt):Infinity;
   if(!quote||!Number.isFinite(age)||age>4*86400000)issues.push({key:'quote:'+r.id,message:'The market quote is missing or older than four days.',name:r.name,href:'/assets'});
  }
  if(r.kind==='Cash'&&!r.opened_on)issues.push({key:'history:'+r.id,message:'An explicit opening date is missing; earlier history is unknown.',name:r.name,href:'/accounts'});
 }
 return issues;
}
export function templateFromRecord(record:Entry,id:string):EntryTemplate|null{
 if(record.frequency!=='Once'||(!expenses.includes(record.kind)&&record.kind!=='Other income')||record.business_id||record.earning_source_id||record.income_source_id||record.history_event_id||record.movement_id||record.operation_id||record.mortgage_payment_id||record.expense_plan_id)return null;
 return {id,name:record.name,kind:record.kind as EntryTemplate['kind'],currency:record.currency,amount:record.amount,account_id:record.account_id??null,custom_category_id:record.custom_category_id??null,notes:record.notes};
}
export function entryFromTemplate(template:EntryTemplate,id:string,today:string,records:Entry[],categoryIds:string[]):Entry{
 return {...template,id,date:today,frequency:'Once',quantity:1,cost:0,rate:0,account_id:records.some(r=>r.id===template.account_id&&r.kind==='Cash')?template.account_id:null,custom_category_id:categoryIds.includes(template.custom_category_id??'')?template.custom_category_id:null};
}
