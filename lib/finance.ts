export const kinds = ['Cash','Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan','Debt','Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense'] as const;
export type Kind = typeof kinds[number];
export type Entry = {id:string;expense_plan_id?:string|null;history_event_id?:string|null;mortgage_payment_id?:string|null;payment_principal?:number;payment_interest?:number;record_count?:number;name:string;kind:Kind;currency:string;amount:number;quantity:number;cost:number;rate:number;date:string;lent_date?:string;frequency:'Once'|'Monthly'|'Yearly';notes:string;business_id?:string|null;ownership_percentage?:number;estimated_monthly_payment?:number;estimated_monthly_income?:number};
export const assets:readonly string[] = ['Cash','Stock','Crypto','Deposit','Property','Business','Money lent'];
export const liabilities:readonly string[] = ['Mortgage','Loan','Debt'];
// Navigation groups are separate from accounting classifications.
export const assetRecordKinds:readonly string[] = assets.filter(kind => kind !== 'Money lent');
export const lendingRecordKinds:readonly string[] = ['Money lent', ...liabilities];
export const income:readonly string[] = ['Salary','Rent income','Other income'];
export const expenses:readonly string[] = ['Rent expense','Living expense','Charity','Other expense'];
export const value=(e:Entry)=>['Stock','Crypto'].includes(e.kind)?e.amount*e.quantity:e.kind==='Business'?e.amount*(e.ownership_percentage ?? 100)/100:e.amount;
export const monthly=(e:Entry)=>e.frequency==='Yearly'?e.amount/12:e.frequency==='Monthly'?e.amount:0;

export function estimatedCashFlow(entries: Entry[], expensePlanProjection = 0) {
 const estimatedAssets = entries.filter(e => ['Business','Property','Deposit'].includes(e.kind) && (e.estimated_monthly_income ?? 0) > 0);
 const businessIds = new Set(estimatedAssets.filter(e => e.kind === 'Business').map(e => e.id));
 const estimatedIncome = estimatedAssets.reduce((sum,e) => sum + (e.estimated_monthly_income ?? 0), 0);
 const otherIncome = entries.filter(e => income.includes(e.kind) && !(e.business_id && businessIds.has(e.business_id))).reduce((sum,e) => sum + monthly(e), 0);
 const monthlyExpenses = entries.filter(e => expenses.includes(e.kind) && !e.expense_plan_id).reduce((sum,e) => sum + monthly(e), expensePlanProjection);
 const mortgagePayments = entries.filter(e => e.kind === 'Mortgage' && e.amount > 0).reduce((sum,e) => sum + (e.estimated_monthly_payment ?? 0), 0);
 return { estimatedAssets, plannedIncome: estimatedIncome + otherIncome, monthlyExpenses, mortgagePayments, estimatedIncome, forecast: estimatedIncome + otherIncome - monthlyExpenses - mortgagePayments };
}
