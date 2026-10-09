// Actual cash flow over a date range, for the Telegram digest and weekly recap.
// Pure: the shared cash-flow walk (`cashFlowItems` in lib/spending.ts) decides what counts, records with their splits
// and the Tracker's expenses, converted with USD-based rates.
import {shiftDay} from './calendar-days';
import {expenses,income,type Entry} from './finance';
import {convertAmount} from './market';
import {cashFlowItems,type CashFlowExtras} from './spending';
type Row=Pick<Entry,'kind'|'amount'|'currency'|'date'|'frequency'|'custom_category_id'>&Partial<Pick<Entry,'id'|'history_event_id'|'mortgage_payment_id'|'payment_principal'|'payment_interest'>>;
/** `missing` counts amounts left out because no rate converts them; while it is above zero the totals are incomplete. */
export type PeriodTotals={income:number;spending:number;byCategory:Record<string,number>;missing:number};
// Re-exported for lib/telegram-entry.ts and the Telegram digest and recap cron routes, which still import `shiftDay` from here.
export {shiftDay};
const builtIn=new Set([...income,...expenses]);
/** Category key for a record's or a split's category: `k:<kind>` for a built-in one, `c:<id>` for an added one. */
export const categoryKey=(category:string)=>(builtIn.has(category)?'k:':'c:')+category;
/** Records alone, or with their splits and the Tracker's expenses on investments. */
export type PeriodInput=readonly Row[]|({records:readonly Row[]}&CashFlowExtras);
/** Records dated from..to inclusive, with their splits and Tracker expenses when given, in `currency`. An amount whose
 * currency has no rate is left out rather than guessed, and counted in `missing`. */
export function periodTotals(input:PeriodInput,from:string,to:string,currency:string,rates:Record<string,number>={}):PeriodTotals{
 const {records,...extras}='records' in input?input:{records:input};
 const totals:PeriodTotals={income:0,spending:0,byCategory:{},missing:0};
 const table={USD:1,...rates};
 for(const item of cashFlowItems(records,from,to,extras)){
  const amount=item.currency===null?null:convertAmount(item.amount,item.currency,currency,table);
  if(amount===null||!Number.isFinite(amount)){totals.missing++;continue;}
  if(item.income){totals.income+=amount;continue;}
  totals.spending+=amount;
  for(const part of item.parts){const key=categoryKey(part.category);totals.byCategory[key]=(totals.byCategory[key]??0)+convertAmount(part.amount,item.currency!,currency,table)!;}
 }
 return totals;
}
/** The category with the largest spending, or null when nothing was spent. */
export function topCategory(byCategory:Record<string,number>){
 let best:{key:string;amount:number}|null=null;
 for(const [key,amount] of Object.entries(byCategory))if(amount>0&&(!best||amount>best.amount))best={key,amount};
 return best;
}
