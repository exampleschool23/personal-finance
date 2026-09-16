export const kinds = ['Cash','Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan','Debt','Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense'] as const;
export type Kind = typeof kinds[number];
export type Entry = {id:string;record_count?:number;name:string;kind:Kind;currency:string;amount:number;quantity:number;cost:number;rate:number;date:string;lent_date?:string;frequency:'Once'|'Monthly'|'Yearly';notes:string;business_id?:string|null;ownership_percentage?:number};
export const assets:readonly string[] = ['Cash','Stock','Crypto','Deposit','Property','Business','Money lent'];
export const liabilities:readonly string[] = ['Mortgage','Loan','Debt'];
export const income:readonly string[] = ['Salary','Rent income','Other income'];
export const expenses:readonly string[] = ['Rent expense','Living expense','Charity','Other expense'];
export const value=(e:Entry)=>['Stock','Crypto'].includes(e.kind)?e.amount*e.quantity:e.kind==='Business'?e.amount*(e.ownership_percentage ?? 100)/100:e.amount;
export const monthly=(e:Entry)=>e.frequency==='Yearly'?e.amount/12:e.frequency==='Monthly'?e.amount:0;
