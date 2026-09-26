export const trackedKinds: readonly string[] = ['Cash','Stock','Crypto','Deposit','Property','Business','Valuables','Money lent','Mortgage','Loan','Debt'];
export type HistoryEvent = {
 id:string; record_id:string; event_type:'baseline'|'valuation'|'contribution'|'withdrawal'|'income'|'expense'|'mortgage_payment';
 occurred_on:string; amount:number; balance:number|null; ownership_percentage:number; principal:number; interest:number; notes:string; created_at:string;
 account_link?:{account_id:string;amount:number;account_currency?:string|null;record_currency?:string|null;exchange_rate?:number|null;rate_date?:string|null}|null;
};
export const historyLabels: Record<HistoryEvent['event_type'],string> = {
 baseline:'Starting snapshot',valuation:'Value update',contribution:'Money invested',withdrawal:'Sale / withdrawal',income:'Income received',expense:'Expense paid',mortgage_payment:'Mortgage payment',
};
export type HistoryUpdateType = Exclude<HistoryEvent['event_type'], 'baseline'|'mortgage_payment'>;
export const isLendingKind = (kind:string) => ['Debt','Loan','Money lent','Mortgage'].includes(kind);
// Borrowing brings cash in; lending it out and repaying our own debt use cash.
export function historyCashDelta(kind:string,type:HistoryUpdateType,amount:number):number {
 if(type==='valuation')return 0;
 if(['Debt','Loan','Mortgage'].includes(kind))return type==='contribution'?amount:-amount;
 return ['income','withdrawal'].includes(type)?amount:-amount;
}
export function historyUpdateTypes(kind:string):HistoryUpdateType[] {
 if(kind==='Mortgage')return ['contribution'];
 if(isLendingKind(kind))return ['contribution','withdrawal'];
 if(kind==='Cash')return ['valuation'];
 if(['Deposit','Stock','Crypto'].includes(kind))return ['valuation','income','expense'];
 if(['Property','Business','Valuables'].includes(kind))return ['valuation','contribution','withdrawal','income','expense'];
 return [];
}
export function historyEventLabel(kind:string,type:HistoryEvent['event_type']):string {
 if(isLendingKind(kind)){
  if(type==='valuation'&&kind==='Mortgage')return 'Balance update';
  if(type==='valuation')return 'Balance correction';
  if(type==='contribution')return kind==='Money lent'?'Lend more':kind==='Debt'?'Add to debt':'Additional borrowing';
  if(type==='withdrawal')return kind==='Money lent'?'Repayment received':'Repayment made';
 }
 if(type==='valuation'&&['Cash','Deposit'].includes(kind))return 'Balance update';
 if(type==='income')return kind==='Deposit'||kind==='Money lent'?'Interest received':kind==='Stock'?'Dividends / income':kind==='Property'?'Rent income':historyLabels[type];
 if(type==='contribution')return kind==='Deposit'||kind==='Cash'?'Top-up':kind==='Stock'||kind==='Crypto'?'Buy':historyLabels[type];
 if(type==='withdrawal')return kind==='Deposit'||kind==='Cash'?'Withdraw':kind==='Stock'||kind==='Crypto'?'Sell / convert':historyLabels[type];
 return historyLabels[type];
}
export function historySeries(events:HistoryEvent[]) {
 const sorted=[...events].sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
 let balance:number|null=null, contributions=0, additions=0, repayments=0, receipts=0, expenses=0, principal=0, interest=0;
 const days=new Map<string,{date:string;timestamp:number;balance:number|null;contributions:number;receipts:number}>();
 for(const e of sorted){
  if(e.balance!==null)balance=Number(e.balance)*Number(e.ownership_percentage)/100;
  if(e.event_type==='contribution'){contributions+=Number(e.amount);additions+=Number(e.amount);}
  if(e.event_type==='withdrawal'){contributions-=Number(e.amount);repayments+=Number(e.amount);}
  if(e.event_type==='income')receipts+=Number(e.amount);
  if(e.event_type==='expense')expenses+=Number(e.amount);
  if(e.event_type==='mortgage_payment'){principal+=Number(e.principal);interest+=Number(e.interest);}
  days.set(e.occurred_on,{date:e.occurred_on,timestamp:Date.parse(e.occurred_on+'T00:00:00Z'),balance,contributions,receipts});
 }
 return {points:[...days.values()],balance,contributions,additions,repayments,receipts,expenses,principal,interest};
}

// Convert chart coordinates back to stored date-only values before shared display formatting.
export const historyChartDate = (timestamp: number) => new Date(timestamp).toISOString().slice(0,10);
