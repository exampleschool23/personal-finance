export const kinds = ['Cash','Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan','Debt','Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense'] as const;
export type Kind = typeof kinds[number];
export type Entry = {id:string;operation_id?:string|null;account_id?:string|null;custom_category_id?:string|null;import_key?:string|null;end_date?:string|null;expense_plan_id?:string|null;history_event_id?:string|null;mortgage_payment_id?:string|null;payment_principal?:number;payment_interest?:number;record_count?:number;name:string;kind:Kind;currency:string;amount:number;quantity:number;cost:number;rate:number;date:string;lent_date?:string;frequency:'Once'|'Monthly'|'Yearly';notes:string;business_id?:string|null;ownership_percentage?:number;estimated_monthly_payment?:number;estimated_monthly_income?:number};
// PostgreSQL permits a null due date for lending records. Keep the same client
// representation for both paginated records and the planning data feed.
export function normalizeEntry(entry: Omit<Entry, 'date' | 'lent_date'> & {date?:string|null;lent_date?:string|null}): Entry {
 return {...entry,date:entry.date??'',lent_date:entry.lent_date??'',amount:Number(entry.amount),quantity:Number(entry.quantity),cost:Number(entry.cost),rate:Number(entry.rate),ownership_percentage:Number(entry.ownership_percentage??100),estimated_monthly_income:Number(entry.estimated_monthly_income??0),estimated_monthly_payment:Number(entry.estimated_monthly_payment??0)};
}
export const assets:readonly string[] = ['Cash','Stock','Crypto','Deposit','Property','Business','Money lent'];
export const liabilities:readonly string[] = ['Mortgage','Loan','Debt'];
// Navigation groups are separate from accounting classifications.
export const assetRecordKinds:readonly string[] = assets.filter(kind => kind !== 'Money lent');
export const lendingRecordKinds:readonly string[] = ['Money lent', ...liabilities];
export const income:readonly string[] = ['Salary','Rent income','Other income'];
export const expenses:readonly string[] = ['Rent expense','Living expense','Charity','Other expense'];
export const value=(e:Entry)=>['Stock','Crypto'].includes(e.kind)?e.amount*e.quantity:e.kind==='Business'?e.amount*(e.ownership_percentage ?? 100)/100:e.amount;
export const monthly=(e:Entry,month?:string)=>month && ((e.date && e.date.slice(0,7)>month) || (e.end_date && e.end_date.slice(0,7)<month)) ? 0 : e.frequency==='Yearly'?e.amount/12:e.frequency==='Monthly'?e.amount:0;

// Salary is pay for work, even when its employer is a business the user owns.
// Only linked business distributions replace the business income estimate.
export const duplicatesBusinessEstimate = (entry: Entry, businessIds: Set<string>) => entry.kind === 'Other income' && !!entry.business_id && businessIds.has(entry.business_id);

export function estimatedCashFlow(entries: Entry[], expensePlanProjection = 0, month?: string) {
 const estimatedAssets = entries.filter(e => ['Business','Property','Deposit'].includes(e.kind) && (e.estimated_monthly_income ?? 0) > 0);
 const businessIds = new Set(estimatedAssets.filter(e => e.kind === 'Business').map(e => e.id));
 const estimatedIncome = estimatedAssets.reduce((sum,e) => sum + (e.estimated_monthly_income ?? 0), 0);
 const otherIncome = entries.filter(e => income.includes(e.kind) && !duplicatesBusinessEstimate(e, businessIds)).reduce((sum,e) => sum + monthly(e, month), 0);
 const monthlyExpenses = entries.filter(e => expenses.includes(e.kind) && !e.expense_plan_id).reduce((sum,e) => sum + monthly(e, month), expensePlanProjection);
 const mortgagePayments = entries.filter(e => e.kind === 'Mortgage' && e.amount > 0).reduce((sum,e) => sum + (e.estimated_monthly_payment ?? 0), 0);
 return { estimatedAssets, otherIncome, plannedIncome: estimatedIncome + otherIncome, monthlyExpenses, mortgagePayments, estimatedIncome, forecast: estimatedIncome + otherIncome - monthlyExpenses - mortgagePayments };
}
