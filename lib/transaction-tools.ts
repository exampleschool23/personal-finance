import { monthEnd } from './calendar-days';
import { convertAmount } from './market';
import type { Entry } from './finance';
import type { Activity, PlanningData } from './planning';
import { snapshotPoints, type PortfolioSnapshot } from './portfolio-snapshots';
import { cashFlowItems } from './spending';
/** `category_id` is an added category's id or a built-in category kind such as 'Living expense'. */
export type TransactionSplit={record_id:string;position:number;category_id:string;amount:number};
/** Database rows keep built-in categories in `kind`; the app reads one label, like `custom_category_id ?? kind` on records. */
export function normalizeSplits(rows:readonly {record_id:string;position:number;category_id?:string|null;kind?:string|null;amount:number|string}[]):TransactionSplit[]{
 return rows.map(row=>({record_id:row.record_id,position:Number(row.position),category_id:row.category_id??row.kind??'',amount:Number(row.amount)}));
}
export type ForecastAssignment={record_id:string;account_id:string;exchange_rate?:number;from_currency?:string;to_currency?:string};
export type TransactionTools={splits:TransactionSplit[];assignments:ForecastAssignment[]};
export const emptyTransactionTools:TransactionTools={splits:[],assignments:[]};
/** Received and spent in one month, through the shared cash-flow walk (`cashFlowItems` in lib/spending.ts).
 * `activity` is accepted for callers that pass it; repayments in it are transfers and never spending. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- positional callers still pass account activity
export function monthlyReview(records:Entry[],splits:TransactionSplit[],snapshots:PortfolioSnapshot[],month:string,currency:string,today:string,_activity:Activity[]=[],rates?:number|Record<string,number>,investmentLinks:NonNullable<PlanningData['investmentLinks']>=[]) {
 const start=month+'-01';
 const end=monthEnd(month);
 let received=0,spent=0,missing=0;
 const categories=new Map<string,number>();
 for(const item of cashFlowItems(records,start,today<end?today:end,{splits,investmentLinks})){
  const amount=item.currency===null?null:convertAmount(item.amount,item.currency,currency,rates);
  if(amount===null||!Number.isFinite(amount)){missing++;continue;}
  if(item.income){received+=amount;continue;}
  spent+=amount;
  for(const part of item.parts)categories.set(part.category,(categories.get(part.category)??0)+convertAmount(part.amount,item.currency!,currency,rates)!);
 }
 const points=snapshotPoints(snapshots,currency).sort((a,b)=>a.date.localeCompare(b.date));
 const before=points.filter(point=>point.date<start).at(-1),after=points.filter(point=>point.date>=start&&point.date<=end&&point.date<=today).at(-1);
 return {received,spent,missing,saved:received-spent,categories:[...categories].map(([id,amount])=>({id,amount})).sort((a,b)=>b.amount-a.amount),netWorthChange:before&&after?after.net-before.net:null,from:before?.date,to:after?.date};
}
