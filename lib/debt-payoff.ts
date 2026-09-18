export type PayoffDebt={id:string;balance:number;annualRate:number;minimum:number};
export type PayoffMethod='avalanche'|'snowball';
/** Fixed monthly budget; repaid debts' payments roll into remaining debts.
 * Interest accrues monthly before payment. No fees, rate changes or new borrowing. */
export function debtPayoff(debts:PayoffDebt[],extra:number,method:PayoffMethod,maxMonths=600){
 if(!Number.isFinite(extra)||extra<0||!Number.isInteger(maxMonths)||maxMonths<1||maxMonths>1200||new Set(debts.map(d=>d.id)).size!==debts.length||debts.some(d=>[d.balance,d.annualRate,d.minimum].some(n=>!Number.isFinite(n)||n<0)||d.annualRate>100))return null;
 const rows=debts.filter(d=>d.balance>0).map(d=>({...d,paidOn:null as number|null,interest:0}));
 const budget=rows.reduce((sum,d)=>sum+d.minimum,extra);let interest=0;
 if(!rows.length)return {months:0,interest:0,budget,remaining:0,debts:rows};
 for(let month=1;month<=maxMonths;month++){
  let remainingBudget=budget;
  for(const row of rows){if(row.balance<=0)continue;const charge=row.balance*row.annualRate/1200;row.balance+=charge;row.interest+=charge;interest+=charge;const paid=Math.min(row.minimum,row.balance);row.balance-=paid;remainingBudget-=paid;}
  const priority=rows.filter(d=>d.balance>0).sort((a,b)=>method==='snowball'?a.balance-b.balance||b.annualRate-a.annualRate||a.id.localeCompare(b.id):b.annualRate-a.annualRate||a.balance-b.balance||a.id.localeCompare(b.id));
  for(const row of priority){const paid=Math.min(Math.max(0,remainingBudget),row.balance);row.balance-=paid;remainingBudget-=paid;}
  for(const row of rows)if(row.balance<1e-8){row.balance=0;row.paidOn??=month;}
  if(rows.every(d=>d.balance===0))return {months:month,interest,budget,remaining:0,debts:rows};
  if(!Number.isFinite(interest)||rows.some(d=>!Number.isFinite(d.balance)))return null;
 }
 return {months:null,interest,budget,remaining:rows.reduce((sum,d)=>sum+d.balance,0),debts:rows};
}
