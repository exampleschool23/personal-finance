import type { Entry } from './finance';
import type { ExpensePlan } from './expense-plans';
export type DeletedItem = {id:string;deleted_at:string} & ({source:'finance_records';data:Entry}|{source:'expense_plans';data:ExpensePlan});
