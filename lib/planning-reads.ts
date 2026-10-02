import { depositToday } from './deposit-interest';
import { income,expenses } from './finance';

/** `review` reads the month and the one before it; `budget` reads from `first` (a month) through `month`. */
export function planningReadFilters(scope:string,month:string,first?:string):Record<'records'|'activity'|'investmentLinks',Record<string,string>> {
 const start=new Date((scope==='budget'&&first?first:month)+'-01T00:00:00Z');if(scope!=='budget'||!first)start.setUTCMonth(start.getUTCMonth()-1);
 const from=start.toISOString().slice(0,10);
 const end=new Date(month+'-01T00:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);
 const to=end.toISOString().slice(0,10);
 const cashflow=[...income,...expenses].join(',');
 // Holdings and schedules remain complete. Only actual transaction history is
 // period-limited; every settled occurrence remains available for overdue logic.
 const essential=`frequency.neq.Once,kind.not.in.(${cashflow})`;
 return {
  records:scope==='full'||scope==='insights'?{}:{or:`(${essential}${scope==='review'||scope==='budget'?`,and(date.gte.${from},date.lt.${to})`:''})`},
  activity:scope==='review'||scope==='budget'?{and:`(occurred_on.gte.${from},occurred_on.lt.${to})`}:{},
  investmentLinks:scope==='review'||scope==='budget'?{select:'*,investment_history!inner(occurred_on,record_id,event_type)','investment_history.and':`(occurred_on.gte.${from},occurred_on.lt.${to})`}:{select:'*,investment_history(occurred_on,record_id,event_type)'},
 };
}
export const currentReviewMonth=()=>depositToday().slice(0,7);
