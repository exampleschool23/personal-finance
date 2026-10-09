import { shiftMonth } from './calendar-days';
import { depositToday } from './deposit-interest';
import { income,expenses } from './finance';

/** The kinds of actual income and expenses, comma-separated for a PostgREST `in.(…)` list. */
export const cashflowKinds=[...income,...expenses].join(',');
/** Holdings and schedules: every record except one-time income and expenses, as the inside of a PostgREST `or=(…)`. */
export const standingRecords=`frequency.neq.Once,kind.not.in.(${cashflowKinds})`;
/** Every scope the planning read answers. `full` keeps every record (the default for callers without a scope);
 * `accounts` is the Accounts page: holdings, schedules and every account operation, but no income or expense history,
 * which its Recent activity view reads on its own (`account-activity`) when it is opened. */
export const planningScopes=['full','accounts','account-activity','review','workspace','insights','budget'] as const;
export type PlanningScope=typeof planningScopes[number];
type Table='movements'|'holdingAccounts'|'records'|'categories'|'goals'|'occurrences'|'activity'|'investmentLinks';

/** How much transaction history the pattern finders read: two years and a month, enough for two yearly charges and
 * the 24 newest monthly ones they look at. */
export const insightMonths=25;
/** The columns the pattern finders, the review drafts made from them and the goal income links read. */
export const insightColumns='id,name,kind,amount,currency,quantity,cost,rate,date,frequency,recurrence_days,end_date,notes,custom_category_id,account_id,business_id,income_source_id,source_paused,archived,earning_source_id,operation_id,history_event_id,mortgage_payment_id,movement_id,ownership_percentage';
/** The columns the Recent activity view of Accounts lists for income and spending booked to an account. */
export const accountActivityColumns='id,name,kind,amount,currency,date,account_id';

/** The tables a scope reads, and whether it carries loan payments (`debtPayments`) or only transaction history
 * (no later scheduled payments and no deposit estimates). */
export function planningReadPlan(scope:PlanningScope):{tables:Set<Table>;debtPayments:boolean;historyOnly:boolean}{
 const historyOnly=scope==='insights'||scope==='account-activity';
 const all:Table[]=['movements','holdingAccounts','records','categories','goals','occurrences','activity','investmentLinks'];
 const skipped:Table[]=historyOnly?all.filter(table=>table!=='records'):scope==='review'||scope==='budget'?['movements']:scope==='workspace'?['movements','activity','investmentLinks']:[];
 return {tables:new Set(all.filter(table=>!skipped.includes(table))),debtPayments:scope==='full'||scope==='workspace'||scope==='accounts',historyOnly};
}

/** `review` reads the month and the one before it; `budget` reads from `first` (a month) through `month`. */
export function planningReadFilters(scope:string,month:string,first?:string):Record<'records'|'activity'|'investmentLinks'|'occurrences',Record<string,string>> {
 const from=(scope==='budget'&&first?first:shiftMonth(month,-1))+'-01';
 const to=shiftMonth(month,1)+'-01';
 // Holdings and schedules remain complete. Only actual transaction history is
 // period-limited; every settled occurrence remains available for overdue logic.
 const essential=standingRecords;
 const periods=scope==='review'||scope==='budget';
 const records:Record<string,string>=scope==='full'?{}
  // Schedules (to leave out what is already planned) and the last two years of income and spending.
  :scope==='insights'?{select:insightColumns,kind:`in.(${cashflowKinds})`,or:`(frequency.neq.Once,date.gte.${shiftMonth(depositToday().slice(0,7),-insightMonths)}-01)`}
  :scope==='account-activity'?{select:accountActivityColumns,account_id:'not.is.null'}
  :{or:`(${essential}${periods?`,and(date.gte.${from},date.lt.${to})`:''})`};
 return {
  records,
  activity:periods?{and:`(occurred_on.gte.${from},occurred_on.lt.${to})`}:{},
  // A settled occurrence carries what was recorded for it: limited scopes leave its transaction out of `records`.
  occurrences:{select:'*,transaction:finance_records!transaction_id(amount,date,currency)'},
  investmentLinks:periods?{select:'*,investment_history!inner(occurred_on,record_id,event_type)','investment_history.and':`(occurred_on.gte.${from},occurred_on.lt.${to})`}:{select:'*,investment_history(occurred_on,record_id,event_type)'},
 };
}
export const currentReviewMonth=()=>depositToday().slice(0,7);
