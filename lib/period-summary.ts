// Actual cash flow over a date range, for the Telegram digest and weekly recap.
// Pure: only one-time income and expense records count (spending by lib/spending.ts) (scheduled ones become
// one-time records when they are paid), converted with USD-based rates.
import {expenses,income,type Entry} from './finance';
import {convertAmount} from './market';
import {spendingAmount} from './spending';
type Row=Pick<Entry,'kind'|'amount'|'currency'|'date'|'frequency'|'custom_category_id'>&Partial<Pick<Entry,'mortgage_payment_id'|'payment_principal'|'payment_interest'>>;
export type PeriodTotals={income:number;spending:number;byCategory:Record<string,number>};
/** A calendar day moved by whole days, staying on the ISO date. */
export function shiftDay(day:string,days:number){const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
/** Category key for a record: `c:<id>` for an added category, `k:<kind>` for a built-in one. */
export const categoryKey=(row:Pick<Row,'kind'|'custom_category_id'>)=>row.custom_category_id?'c:'+row.custom_category_id:'k:'+row.kind;
/** Records dated from..to inclusive, in `currency`. An amount whose currency has no rate is left out rather than guessed. */
export function periodTotals(records:readonly Row[],from:string,to:string,currency:string,rates:Record<string,number>={}):PeriodTotals{
 const totals:PeriodTotals={income:0,spending:0,byCategory:{}};
 for(const row of records){
  if(row.frequency!=='Once'||!row.date||row.date<from||row.date>to)continue;
  const isIncome=income.includes(row.kind);
  if(!isIncome&&!expenses.includes(row.kind))continue;
  // Spending follows the shared definition: a mortgage payment counts only its interest.
  const amount=convertAmount(isIncome?Number(row.amount):spendingAmount(row),row.currency,currency,{USD:1,...rates});
  if(amount===null||!Number.isFinite(amount))continue;
  if(isIncome)totals.income+=amount;
  else{totals.spending+=amount;const key=categoryKey(row);totals.byCategory[key]=(totals.byCategory[key]??0)+amount;}
 }
 return totals;
}
/** The category with the largest spending, or null when nothing was spent. */
export function topCategory(byCategory:Record<string,number>){
 let best:{key:string;amount:number}|null=null;
 for(const [key,amount] of Object.entries(byCategory))if(amount>0&&(!best||amount>best.amount))best={key,amount};
 return best;
}
