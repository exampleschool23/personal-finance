import type { Entry } from './finance';
import type { Goal } from './planning';
/** A spending plan deleted before plans became Budget categories (migration 131); restoring one brings it back as a category. */
type DeletedPlan={id:string;name:string;currency:string;amount:number};
export type DeletedItem = {id:string;deleted_at:string} & ({source:'finance_records';data:Entry}|{source:'expense_plans';data:DeletedPlan}|{source:'savings_goals';data:Goal});
// Short label and detail line for a Recently deleted card.
export function deletedItemLabel(item:DeletedItem){return item.source==='expense_plans'?'Monthly expense plan':item.source==='savings_goals'?'Savings goal':item.data.kind;}
export function deletedItemColorKind(item:DeletedItem){return item.source==='expense_plans'?'Other expense':item.source==='savings_goals'?'Deposit':item.data.kind;}
