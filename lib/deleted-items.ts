import type { Entry } from './finance';
import type { ExpensePlan } from './expense-plans';
import type { Goal } from './planning';
export type DeletedItem = {id:string;deleted_at:string} & ({source:'finance_records';data:Entry}|{source:'expense_plans';data:ExpensePlan}|{source:'savings_goals';data:Goal});
// Short label and detail line for a Recently deleted card.
export function deletedItemLabel(item:DeletedItem){return item.source==='expense_plans'?'Monthly expense plan':item.source==='savings_goals'?'Savings goal':item.data.kind;}
export function deletedItemColorKind(item:DeletedItem){return item.source==='expense_plans'?'Other expense':item.source==='savings_goals'?'Deposit':item.data.kind;}
