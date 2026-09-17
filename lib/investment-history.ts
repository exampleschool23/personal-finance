export const trackedKinds: readonly string[] = ['Cash','Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan','Debt'];
export type HistoryEvent = {
 id:string; record_id:string; event_type:'baseline'|'valuation'|'contribution'|'withdrawal'|'income'|'expense'|'mortgage_payment';
 occurred_on:string; amount:number; balance:number|null; ownership_percentage:number; principal:number; interest:number; notes:string; created_at:string;
};
export const historyLabels: Record<HistoryEvent['event_type'],string> = {
 baseline:'Starting snapshot',valuation:'Value update',contribution:'Money invested',withdrawal:'Sale / withdrawal',income:'Income received',expense:'Expense paid',mortgage_payment:'Mortgage payment',
};
export function historySeries(events:HistoryEvent[]) {
 const sorted=[...events].sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
 let balance:number|null=null, contributions=0, receipts=0, expenses=0, principal=0, interest=0;
 const days=new Map<string,{date:string;timestamp:number;balance:number|null;contributions:number;receipts:number}>();
 for(const e of sorted){
  if(e.balance!==null)balance=Number(e.balance)*Number(e.ownership_percentage)/100;
  if(e.event_type==='contribution')contributions+=Number(e.amount);
  if(e.event_type==='withdrawal')contributions-=Number(e.amount);
  if(e.event_type==='income')receipts+=Number(e.amount);
  if(e.event_type==='expense')expenses+=Number(e.amount);
  if(e.event_type==='mortgage_payment'){principal+=Number(e.principal);interest+=Number(e.interest);}
  days.set(e.occurred_on,{date:e.occurred_on,timestamp:Date.parse(e.occurred_on+'T00:00:00Z'),balance,contributions,receipts});
 }
 return {points:[...days.values()],balance,contributions,receipts,expenses,principal,interest};
}

// Convert chart coordinates back to stored date-only values before shared display formatting.
export const historyChartDate = (timestamp: number) => new Date(timestamp).toISOString().slice(0,10);
